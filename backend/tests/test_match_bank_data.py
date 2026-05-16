"""End-to-end smoke test: bank fixture → ingestion → matching produces candidates."""

from contextlib import contextmanager
from unittest.mock import patch

import numpy as np

from app.models.batch import ImportBatch
from app.models.comparison import ComparisonRun
from app.models.enums import BatchStatus, RecordStatus
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.record_set import RecordSet

SAMPLE_CSV_A = (
    b"DES_0;DESSHO_0;BICCOD_0;IBACOD_0;CTY_0;CRY_0\n"
    b"Arab Tunisian Bank;ATB;ATBKTNTT;TN9701001020110500861125;TUNIS;TN\n"
    b"Attijari Banque;ATJB;BSTUTNTT;TN5904154235404700147663;BIZERTE;TN\n"
    b"Caisse;CAI;;;;\n"
)

SAMPLE_CSV_B = (
    b"DES_0;DESSHO_0;BICCOD_0;IBACOD_0;CTY_0;CRY_0\n"
    b"Arab Tunisian Bank TND;ATB;atbktntt;tn97 0100 1020 1105 0086 1125;Tunis;TN\n"
    b"Banque Internationale Arabe de Tunisie;BIAT;BIATTNTT;TN5908004000621051168580;TUNIS;TN\n"
)


def _make_source(db, name, mapping):
    src = DataSource(
        name=name,
        type="bank",
        file_format="csv",
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
    """Return distinct unit vectors per row, but make rows whose first word
    matches share the same vector — so embedding_cosine reflects name overlap."""
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


def test_bank_pipeline_produces_cross_source_candidate(test_db):
    """Ingest two bank files; matching should pair the ATB rows across sources."""
    mapping = {
        "bank_name": "DES_0",
        "short_name": "DESSHO_0",
        "bic": "BICCOD_0",
        "iban": "IBACOD_0",
        "city": "CTY_0",
        "country": "CRY_0",
    }
    src_a = _make_source(test_db, "banks_a", mapping)
    src_b = _make_source(test_db, "banks_b", mapping)
    batch_a = _make_batch(test_db, src_a.id, "banks_a.csv")
    batch_b = _make_batch(test_db, src_b.id, "banks_b.csv")

    from app.services.ingestion import run_ingestion
    from app.services.matching import run_matching_pipeline

    with _stub_embeddings_with_overlap():
        run_ingestion(test_db, batch_a.id, SAMPLE_CSV_A)
        run_ingestion(test_db, batch_b.id, SAMPLE_CSV_B)

    # Sanity: identifier normalization happened.
    records = test_db.query(StagedRecord).filter(StagedRecord.status == RecordStatus.ACTIVE).all()
    atb_rows = [r for r in records if r.fields.get("bic") == "ATBKTNTT"]
    assert len(atb_rows) == 2
    assert all(r.fields["iban"] == "TN9701001020110500861125" for r in atb_rows)
    assert all(r.fields["bic"] == "ATBKTNTT" for r in atb_rows)

    # Run matching across both batches.
    run = ComparisonRun(
        name="bank smoke",
        type="bank",
        mode="FILE_VS_FILE",
        status="pending",
        created_by="testuser",
    )
    test_db.add(run)
    test_db.flush()

    side_a = RecordSet.from_batches(test_db, [batch_a.id, batch_b.id])
    result = run_matching_pipeline(test_db, run.id, side_a, side_b=None)

    assert result["candidate_count"] >= 1, "expected at least one bank match candidate"

    # Find the cross-source ATB candidate and check confidence.
    from app.models.match import MatchCandidate

    atb_ids = {r.id for r in atb_rows}
    candidates = test_db.query(MatchCandidate).filter(MatchCandidate.comparison_run_id == run.id).all()
    atb_pair = [c for c in candidates if {c.record_a_id, c.record_b_id} == atb_ids]
    assert atb_pair, f"no candidate found for ATB pair; got {[(c.record_a_id, c.record_b_id) for c in candidates]}"
    assert atb_pair[0].confidence > 0.6, f"ATB candidate confidence too low: {atb_pair[0].confidence}"
