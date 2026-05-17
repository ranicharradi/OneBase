"""End-to-end smoke test: client fixture → ingestion → matching.

Uses two synthetic CSV files to exercise cross-source duplicate detection:
- ELEMASTER appears once in each source (cross-source dup).
- Valeo Vision Maroc appears once in each source under slightly different names (cross-source dup).
Both pairs should be surfaced by the blocking + scoring pipeline.
"""

from contextlib import contextmanager
from unittest.mock import patch

import numpy as np

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, RecordStatus
from app.models.match import MatchCandidate
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.record_set import RecordSet

# Source A: one ELEMASTER, one Valeo, one distractor.
SAMPLE_CSV_A = (
    b"BPCNAM_0;BPCSHO_0;BCGCOD_0;VACBPR_0;CUR_0;BPCTYP_0\n"
    b"ELEMASTER;ELEMASTER;EUR;EXP;EUR;1\n"
    b"Valeo Vision Maroc;VVS;EXP;EXP;EUR;1\n"
    b"Random Other GmbH;ROO;LOCAL;TNA;TND;1\n"
)

# Source B: cross-source dups of ELEMASTER and Valeo, plus a distractor.
SAMPLE_CSV_B = (
    b"BPCNAM_0;BPCSHO_0;BCGCOD_0;VACBPR_0;CUR_0;BPCTYP_0\n"
    b"ELEMASTER;ELEMASTER;EUR;EXP;EUR;1\n"
    b"Valeo Vision Maroc S.A.;VVS Maroc;EXP;EXP;EUR;1\n"
    b"Solo Tunisie;SOLO;LOCAL;TNA;TND;1\n"
)


def _make_source(db, name, mapping):
    src = DataSource(
        name=name,
        type="client",
        delimiter=";",
        column_mapping=mapping,
    )
    db.add(src)
    db.flush()
    return src


def _make_batch(db, source_id, filename):
    batch = ImportBatch(
        data_source_id=source_id,
        filename=filename,
        uploaded_by="testuser",
        status=BatchStatus.PENDING,
    )
    db.add(batch)
    db.flush()
    return batch


@contextmanager
def _stub_embeddings_with_overlap():
    """Vectors keyed by the first word of the name (lowercased)."""
    cache: dict[str, np.ndarray] = {}

    def fake(names, batch_size=64, timeout_seconds=300):
        out = []
        for n in names:
            key = (n or "").split()[0].lower() if n else ""
            if key not in cache:
                vec = np.random.default_rng(abs(hash(key)) % (2**32)).standard_normal(384)
                vec = vec / np.linalg.norm(vec)
                cache[key] = vec.astype(np.float32)
            out.append(cache[key])
        return np.array(out, dtype=np.float32)

    with patch("app.services.ingestion.compute_embeddings", side_effect=fake) as m:
        yield m


def test_client_pipeline_produces_cross_source_candidates(test_db):
    mapping = {
        "customer_name": "BPCNAM_0",
        "short_name": "BPCSHO_0",
        "customer_group": "BCGCOD_0",
        "vat_category": "VACBPR_0",
        "currency": "CUR_0",
        "customer_type": "BPCTYP_0",
    }
    src_a = _make_source(test_db, "clients_a", mapping)
    src_b = _make_source(test_db, "clients_b", mapping)
    batch_a = _make_batch(test_db, src_a.id, "clients_a.csv")
    batch_b = _make_batch(test_db, src_b.id, "clients_b.csv")

    from app.services.ingestion import run_ingestion
    from app.services.matching import run_matching_pipeline

    with _stub_embeddings_with_overlap():
        run_ingestion(test_db, batch_a.id, SAMPLE_CSV_A)
        run_ingestion(test_db, batch_b.id, SAMPLE_CSV_B)

    records = test_db.query(StagedRecord).filter(StagedRecord.status == RecordStatus.ACTIVE).all()
    elemaster_ids = {r.id for r in records if (r.name or "").upper() == "ELEMASTER"}
    valeo_ids = {r.id for r in records if "VALEO" in (r.name or "").upper()}
    assert len(elemaster_ids) == 2
    assert len(valeo_ids) == 2

    run = MatchRun(
        name="client smoke",
        type="client",
        mode="FILE_VS_FILE",
        status="pending",
        created_by="testuser",
    )
    test_db.add(run)
    test_db.flush()

    side_a = RecordSet.from_batch(test_db, batch_a.id)
    side_b = RecordSet.from_batch(test_db, batch_b.id)
    result = run_matching_pipeline(test_db, run.id, side_a, side_b)

    assert result["candidate_count"] >= 2, f"expected ≥2 candidates, got {result}"

    candidates = test_db.query(MatchCandidate).filter(MatchCandidate.match_run_id == run.id).all()
    pairs = [{c.record_a_id, c.record_b_id} for c in candidates]
    assert elemaster_ids in pairs, f"ELEMASTER cross-source dup not surfaced; pairs={pairs}"
    assert valeo_ids in pairs, f"Valeo cross-source dup not surfaced; pairs={pairs}"
