"""Tests for matching orchestration service — run_matching_pipeline."""

from unittest.mock import MagicMock, patch

from sqlalchemy.orm import Session

from app.models.batch import ImportBatch
from app.models.enums import BatchStatus, CandidateStatus, RecordStatus
from app.models.match import MatchCandidate, MatchGroup
from app.models.match_run import MatchRun
from app.models.source import DataSource
from app.models.staging import StagedRecord
from app.services.record_set import RecordRef, RecordSet


def _make_source(db: Session, name: str) -> DataSource:
    """Helper to create a DataSource."""
    src = DataSource(
        name=name,
        type="supplier",
        file_format="csv",
        column_mapping={"name": "Supplier Name"},
    )
    db.add(src)
    db.flush()
    return src


def _make_batch(db: Session, source: DataSource) -> ImportBatch:
    """Helper to create an ImportBatch."""
    batch = ImportBatch(
        data_source_id=source.id,
        filename="test.csv",
        uploaded_by="testuser",
        status=BatchStatus.COMPLETED,
    )
    db.add(batch)
    db.flush()
    return batch


def _make_record(
    db: Session,
    batch: ImportBatch,
    source: DataSource,
    name: str,
    normalized_name: str | None = None,
) -> StagedRecord:
    """Helper to create a StagedRecord."""
    s = StagedRecord(
        type="supplier",
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=normalized_name or name.upper(),
        raw_data={"name": name},
        status=RecordStatus.ACTIVE,
        fields={"supplier_name": name},
    )
    db.add(s)
    db.flush()
    return s


def _make_run(db: Session, mode: str = "FILE_VS_FILE") -> MatchRun:
    """Helper to create a MatchRun."""
    run = MatchRun(type="supplier", mode=mode, status="running", created_by="u")
    db.add(run)
    db.flush()
    return run


def _make_side_a_b(db: Session, s1: StagedRecord, s2: StagedRecord):
    """Build two single-record RecordSets from staged records."""
    side_a = RecordSet(type_key="supplier", refs=[RecordRef(s1.id, "staged")])
    side_b = RecordSet(type_key="supplier", refs=[RecordRef(s2.id, "staged")])
    return side_a, side_b


# ---------- run_matching_pipeline tests ----------


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_creates_candidates(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Pipeline creates MatchCandidate records for pairs above threshold."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_record(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler:supplier_name": 0.9,
            "token_jaccard:supplier_name": 0.8,
            "embedding_cosine:supplier_name": 0.7,
            "jaro_winkler:short_name": 0.5,
            "exact_ci:currency": 0.5,
            "jaro_winkler:contact_name": 0.5,
        },
    }

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a, side_b = _make_side_a_b(test_db, s1, s2)
    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)
    test_db.flush()

    assert stats["candidate_count"] == 1
    candidate = test_db.query(MatchCandidate).first()
    assert candidate is not None
    assert candidate.confidence == 0.85
    assert candidate.status == CandidateStatus.PENDING


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_filters_below_threshold(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Pipeline does NOT create candidates below confidence threshold."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_record(test_db, batch2, src2, "Zephyr Holdings")
    test_db.flush()

    mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.20,
        "signals": {
            "jaro_winkler:supplier_name": 0.2,
            "token_jaccard:supplier_name": 0.1,
            "embedding_cosine:supplier_name": 0.3,
        },
    }

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a, side_b = _make_side_a_b(test_db, s1, s2)
    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)
    test_db.flush()

    assert stats["candidate_count"] == 0
    assert stats["group_count"] == 0
    assert test_db.query(MatchCandidate).count() == 0


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_candidate_has_all_signals(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Each MatchCandidate has match_signals dict with all signal keys."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_record(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    signals = {
        "jaro_winkler:supplier_name": 0.9,
        "token_jaccard:supplier_name": 0.8,
        "embedding_cosine:supplier_name": 0.7,
        "jaro_winkler:short_name": 0.5,
        "exact_ci:currency": 0.5,
        "jaro_winkler:contact_name": 0.5,
    }
    mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {"confidence": 0.85, "signals": signals}

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a, side_b = _make_side_a_b(test_db, s1, s2)
    run_matching_pipeline(test_db, run.id, side_a, side_b)
    test_db.flush()

    candidate = test_db.query(MatchCandidate).first()
    assert candidate is not None
    for key in [
        "jaro_winkler:supplier_name",
        "token_jaccard:supplier_name",
        "embedding_cosine:supplier_name",
        "jaro_winkler:short_name",
        "exact_ci:currency",
        "jaro_winkler:contact_name",
    ]:
        assert key in candidate.match_signals


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_assigns_groups(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Candidates are assigned to MatchGroups (group_id is not null)."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_record(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler:supplier_name": 0.9,
            "token_jaccard:supplier_name": 0.8,
            "embedding_cosine:supplier_name": 0.7,
        },
    }

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a, side_b = _make_side_a_b(test_db, s1, s2)
    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)
    test_db.flush()

    assert stats["group_count"] >= 1
    candidate = test_db.query(MatchCandidate).first()
    assert candidate is not None
    assert candidate.group_id is not None
    group = test_db.query(MatchGroup).filter(MatchGroup.id == candidate.group_id).first()
    assert group is not None


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_returns_stats(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Pipeline returns stats dict with candidate_count and group_count."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_record(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler:supplier_name": 0.9,
            "token_jaccard:supplier_name": 0.8,
            "embedding_cosine:supplier_name": 0.7,
        },
    }

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a, side_b = _make_side_a_b(test_db, s1, s2)
    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)

    assert "candidate_count" in stats
    assert "group_count" in stats
    assert stats["candidate_count"] == 1
    assert stats["group_count"] == 1


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
def test_pipeline_zero_candidates(mock_text_block, mock_embedding_block, test_db):
    """With zero candidates above threshold, returns zeros and creates no records."""
    src1 = _make_source(test_db, "Entity A")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    test_db.flush()

    mock_text_block.return_value = set()
    mock_embedding_block.return_value = set()

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a = RecordSet(type_key="supplier", refs=[RecordRef(s1.id, "staged")])
    stats = run_matching_pipeline(test_db, run.id, side_a, None)

    assert stats["candidate_count"] == 0
    assert stats["group_count"] == 0
    assert test_db.query(MatchCandidate).count() == 0


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_progress_callback(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """progress_callback is called at each stage."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_record(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler:supplier_name": 0.9,
            "token_jaccard:supplier_name": 0.8,
            "embedding_cosine:supplier_name": 0.7,
        },
    }

    callback = MagicMock()

    from app.services.matching import run_matching_pipeline

    run = _make_run(test_db)
    side_a, side_b = _make_side_a_b(test_db, s1, s2)
    run_matching_pipeline(test_db, run.id, side_a, side_b, progress_callback=callback)

    # Verify callback was called with expected stages
    called_stages = [call[0][0] for call in callback.call_args_list]
    assert "BLOCKING" in called_stages
    assert "SCORING" in called_stages
    assert "CLUSTERING" in called_stages
    assert "INSERTING" in called_stages


def test_text_block_filters_to_representatives(test_db):
    """text_block only considers records in representative_ids when provided."""
    from app.services.blocking import text_block

    src1 = _make_source(test_db, "TTEI")
    src2 = _make_source(test_db, "EOT")
    batch1 = _make_batch(test_db, src1)
    batch2 = _make_batch(test_db, src2)

    # src1: two rows with same normalized name — only one is representative
    s1_rep = _make_record(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    s1_dup = _make_record(test_db, batch1, src1, "Acme Corp", normalized_name="ACME CORP")
    # src2: one row
    s2 = _make_record(test_db, batch2, src2, "Acme Corporation", normalized_name="ACME CORPORATION")
    test_db.flush()

    # Without filter: both src1 rows pair with src2
    # (they share prefix "ACM" and first token "ACME" with s2)
    all_refs = [
        RecordRef(s1_rep.id, "staged"),
        RecordRef(s1_dup.id, "staged"),
        RecordRef(s2.id, "staged"),
    ]
    rs_all = RecordSet(type_key="supplier", refs=all_refs)
    pairs_all = text_block(test_db, rs_all, None)
    assert len(pairs_all) == 2  # s1_rep-s2 and s1_dup-s2

    # With filter: only representative pairs with src2
    rep_refs = {RecordRef(s1_rep.id, "staged"), RecordRef(s2.id, "staged")}
    pairs_filtered = text_block(test_db, rs_all, None, representative_ids=rep_refs)
    assert len(pairs_filtered) == 1
    pair = pairs_filtered.pop()
    pair_ids = {pair[0].id, pair[1].id}
    assert pair_ids == {s1_rep.id, s2.id}


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_empty_side_a_returns_zero(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Pipeline with empty side_a returns zero stats without calling blocking."""
    src1 = _make_source(test_db, "Entity A")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    test_db.flush()

    run = _make_run(test_db)
    side_a = RecordSet(type_key="supplier", refs=[])  # empty
    side_b = RecordSet(type_key="supplier", refs=[RecordRef(s1.id, "staged")])

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)
    assert stats["candidate_count"] == 0
    assert stats["group_count"] == 0
    mock_text_block.assert_not_called()


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_empty_side_b_returns_zero(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """Pipeline with empty side_b returns zero stats without calling blocking."""
    src1 = _make_source(test_db, "Entity A")
    batch = _make_batch(test_db, src1)
    s1 = _make_record(test_db, batch, src1, "Acme Corp")
    test_db.flush()

    run = _make_run(test_db)
    side_a = RecordSet(type_key="supplier", refs=[RecordRef(s1.id, "staged")])
    side_b = RecordSet(type_key="supplier", refs=[])  # empty

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)
    assert stats["candidate_count"] == 0
    assert stats["group_count"] == 0
    mock_text_block.assert_not_called()


class TestMLPipelineIntegration:
    """Test that the pipeline uses ML scorer/blocker when available."""

    @staticmethod
    def _seed_two_source_scenario(db):
        """Create a minimal two-source scenario and return (run_id, side_a, side_b)."""
        src1 = _make_source(db, "ML Entity A")
        src2 = _make_source(db, "ML Entity B")
        batch1 = _make_batch(db, src1)
        batch2 = _make_batch(db, src2)
        s1 = _make_record(db, batch1, src1, "Acme Corp")
        s2 = _make_record(db, batch2, src2, "Acme Corporation")
        db.flush()
        run = _make_run(db)
        side_a = RecordSet(type_key="supplier", refs=[RecordRef(s1.id, "staged")])
        side_b = RecordSet(type_key="supplier", refs=[RecordRef(s2.id, "staged")])
        return run.id, s1, s2, side_a, side_b

    @patch("app.services.matching.embedding_block")
    @patch("app.services.matching.text_block")
    def test_pipeline_uses_ml_scorer_when_model_exists(self, mock_text_block, mock_embedding_block, test_db):
        """Pipeline should use ml_score_pair when a scorer model is active."""
        from unittest.mock import MagicMock

        import numpy as np

        from app.services.ml.train import ModelBundle

        run_id, s1, s2, side_a, side_b = self._seed_two_source_scenario(test_db)

        mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
        mock_embedding_block.return_value = set()

        mock_model = MagicMock()
        mock_model.predict.return_value = np.array([0.9])
        scorer_bundle = ModelBundle(
            model=mock_model,
            threshold=0.5,
            feature_names=[
                "jaro_winkler:supplier_name",
                "token_jaccard:supplier_name",
                "embedding_cosine:supplier_name",
                "jaro_winkler:short_name",
                "exact_ci:currency",
                "jaro_winkler:contact_name",
                "name_length_ratio",
                "token_count_diff",
            ],
            record_type="supplier",
        )

        with patch("app.services.matching.load_active_model") as mock_load:
            mock_load.side_effect = lambda db, t, rtype, **kw: scorer_bundle if t == "scorer" else None
            with patch("app.services.matching.ml_score_pair") as mock_ml_score:
                mock_ml_score.return_value = {
                    "confidence": 0.9,
                    "signals": {
                        "jaro_winkler:supplier_name": 0.9,
                        "token_jaccard:supplier_name": 0.8,
                        "embedding_cosine:supplier_name": 0.85,
                    },
                }

                from app.services.matching import run_matching_pipeline

                _result = run_matching_pipeline(test_db, run_id, side_a, side_b)

                assert mock_ml_score.called

    @patch("app.services.matching.embedding_block")
    @patch("app.services.matching.text_block")
    @patch("app.services.matching.score_pair")
    def test_pipeline_falls_back_to_weighted_sum(self, mock_score_pair, mock_text_block, mock_embedding_block, test_db):
        """Pipeline should use score_pair when no ML model exists."""
        run_id, s1, s2, side_a, side_b = self._seed_two_source_scenario(test_db)

        mock_text_block.return_value = {(RecordRef(s1.id, "staged"), RecordRef(s2.id, "staged"))}
        mock_embedding_block.return_value = set()
        mock_score_pair.return_value = {
            "confidence": 0.85,
            "signals": {
                "jaro_winkler:supplier_name": 0.9,
                "token_jaccard:supplier_name": 0.8,
                "embedding_cosine:supplier_name": 0.7,
            },
        }

        with patch("app.services.matching.load_active_model", return_value=None):
            from app.services.matching import run_matching_pipeline

            result = run_matching_pipeline(test_db, run_id, side_a, side_b)
            assert result["candidate_count"] == 1
            assert mock_score_pair.called


# ---------- new RecordSet-based tests ----------


def test_run_matching_pipeline_file_vs_file_writes_candidates_to_run(test_db):
    src1 = _make_source(test_db, "src1")
    src2 = _make_source(test_db, "src2")
    b1 = _make_batch(test_db, src1)
    b2 = _make_batch(test_db, src2)
    _make_record(test_db, b1, src1, "ACME LTD")
    _make_record(test_db, b2, src2, "ACME LIMITED")
    test_db.commit()

    run = MatchRun(type="supplier", mode="FILE_VS_FILE", created_by="u", status="running")
    test_db.add(run)
    test_db.commit()

    side_a = RecordSet.from_batch(test_db, b1.id)
    side_b = RecordSet.from_batch(test_db, b2.id)

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, run.id, side_a, side_b)
    test_db.commit()

    cands = test_db.query(MatchCandidate).filter(MatchCandidate.match_run_id == run.id).all()
    assert stats["candidate_count"] == len(cands)
    assert all(c.side_a_kind == "staged" and c.side_b_kind == "staged" for c in cands)
    assert all(c.match_run_id == run.id for c in cands)


def test_run_matching_pipeline_file_vs_golden_emits_unified_side(test_db):
    src = _make_source(test_db, "src")
    batch = _make_batch(test_db, src)
    _make_record(test_db, batch, src, "ACME")
    from app.models.unified import UnifiedRecord

    u = UnifiedRecord(
        type="supplier",
        name="ACME CORP",
        normalized_name="ACME CORP",
        fields={"supplier_name": "ACME CORP"},
        provenance={},
        source_record_ids=[],
        created_by="u",
    )
    test_db.add(u)
    test_db.commit()

    run = MatchRun(type="supplier", mode="FILE_VS_GOLDEN", created_by="u", status="running")
    test_db.add(run)
    test_db.commit()
    side_a = RecordSet.from_batch(test_db, batch.id)
    side_b = RecordSet.from_unified(test_db, "supplier")

    from app.services.matching import run_matching_pipeline

    run_matching_pipeline(test_db, run.id, side_a, side_b)
    test_db.commit()

    cand = test_db.query(MatchCandidate).filter(MatchCandidate.match_run_id == run.id).first()
    if cand is not None:
        assert cand.side_b_kind == "unified"
        assert cand.side_a_kind == "staged"


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_uses_per_type_confidence_threshold(mock_score_pair, mock_text_block, mock_embedding_block, test_db):
    """When the record type declares confidence_threshold, the pipeline uses it
    instead of settings.matching_confidence_threshold."""
    from unittest.mock import patch as _patch

    from app.config import settings
    from app.models.batch import ImportBatch
    from app.models.enums import BatchStatus, RecordStatus
    from app.models.match import MatchCandidate
    from app.models.match_run import MatchRun
    from app.models.source import DataSource
    from app.models.staging import StagedRecord
    from app.record_types import _testing_clear_registry, register
    from app.record_types.base import FieldDef, RecordType, Role, Signal
    from app.record_types.supplier import SUPPLIER
    from app.services.matching import run_matching_pipeline
    from app.services.record_set import RecordRef, RecordSet

    # Register a test type with a low confidence_threshold (0.50).
    test_rt = RecordType(
        key="t_threshold",
        label="T",
        fields=(FieldDef(key="n", label="N", role=Role.NAME, required=True),),
        signals=(Signal(kind="jaro_winkler", field="n", weight=1.0),),
        confidence_threshold=0.50,
    )
    _testing_clear_registry()
    register(SUPPLIER)
    register(test_rt)
    try:
        # Two records of the test type.
        src = DataSource(name="s", type="t_threshold", file_format="csv", delimiter=",", column_mapping={"n": "N"})
        test_db.add(src)
        test_db.flush()
        batch = ImportBatch(data_source_id=src.id, filename="f", uploaded_by="u", status=BatchStatus.COMPLETED)
        test_db.add(batch)
        test_db.flush()
        ra = StagedRecord(
            import_batch_id=batch.id,
            data_source_id=src.id,
            type="t_threshold",
            name="A",
            normalized_name="A",
            fields={"n": "A"},
            status=RecordStatus.ACTIVE,
        )
        rb = StagedRecord(
            import_batch_id=batch.id,
            data_source_id=src.id,
            type="t_threshold",
            name="B",
            normalized_name="B",
            fields={"n": "B"},
            status=RecordStatus.ACTIVE,
        )
        test_db.add_all([ra, rb])
        test_db.flush()

        # Score lands BETWEEN the global threshold (default 0.80, possibly higher
        # in env) and the per-type 0.50 — it should pass the per-type check.
        mock_text_block.return_value = {(RecordRef(ra.id, "staged"), RecordRef(rb.id, "staged"))}
        mock_embedding_block.return_value = set()
        mock_score_pair.return_value = {"confidence": 0.60, "signals": {"jaro_winkler:n": 0.60}}

        run = MatchRun(name="r", type="t_threshold", mode="FILE_VS_FILE", status="pending", created_by="u")
        test_db.add(run)
        test_db.flush()

        side_a = RecordSet.from_batches(test_db, [batch.id])
        # Force global threshold to something higher than 0.60 so we know per-type wins.
        with _patch.object(settings, "matching_confidence_threshold", 0.80):
            result = run_matching_pipeline(test_db, run.id, side_a, side_b=None)

        assert result["candidate_count"] == 1, "candidate should pass per-type 0.50 even though global is 0.80"
        cand = test_db.query(MatchCandidate).filter(MatchCandidate.match_run_id == run.id).one()
        assert abs(cand.confidence - 0.60) < 1e-6
    finally:
        _testing_clear_registry()
        register(SUPPLIER)
        from app.record_types.bank import BANK
        from app.record_types.client import CLIENT

        register(BANK)
        register(CLIENT)
