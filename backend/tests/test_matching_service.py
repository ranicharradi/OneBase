"""Tests for matching orchestration service — run_matching_pipeline."""

from unittest.mock import patch, MagicMock

from sqlalchemy.orm import Session

from app.models.match import MatchCandidate, MatchGroup
from app.models.staging import StagedSupplier
from app.models.source import DataSource
from app.models.batch import ImportBatch


def _make_source(db: Session, name: str) -> DataSource:
    """Helper to create a DataSource."""
    src = DataSource(
        name=name,
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
        status="completed",
    )
    db.add(batch)
    db.flush()
    return batch


def _make_supplier(
    db: Session,
    batch: ImportBatch,
    source: DataSource,
    name: str,
    normalized_name: str | None = None,
) -> StagedSupplier:
    """Helper to create a StagedSupplier."""
    s = StagedSupplier(
        import_batch_id=batch.id,
        data_source_id=source.id,
        name=name,
        normalized_name=normalized_name or name.upper(),
        raw_data={"name": name},
        status="active",
    )
    db.add(s)
    db.flush()
    return s


# ---------- run_matching_pipeline tests ----------


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_creates_candidates(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Pipeline creates MatchCandidate records for pairs above threshold."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(s1.id, s2.id)}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler": 0.9,
            "token_jaccard": 0.8,
            "embedding_cosine": 0.7,
            "short_name_match": 0.5,
            "currency_match": 0.5,
            "contact_match": 0.5,
        },
    }

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, batch.id)
    test_db.flush()

    assert stats["candidate_count"] == 1
    candidate = test_db.query(MatchCandidate).first()
    assert candidate is not None
    assert candidate.confidence == 0.85
    assert candidate.status == "pending"


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_filters_below_threshold(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Pipeline does NOT create candidates below confidence threshold."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Zephyr Holdings")
    test_db.flush()

    mock_text_block.return_value = {(s1.id, s2.id)}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.20,
        "signals": {
            "jaro_winkler": 0.2,
            "token_jaccard": 0.1,
            "embedding_cosine": 0.3,
            "short_name_match": 0.0,
            "currency_match": 0.0,
            "contact_match": 0.0,
        },
    }

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, batch.id)
    test_db.flush()

    assert stats["candidate_count"] == 0
    assert stats["group_count"] == 0
    assert test_db.query(MatchCandidate).count() == 0


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_candidate_has_all_signals(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Each MatchCandidate has match_signals dict with all 6 signal keys."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    signals = {
        "jaro_winkler": 0.9,
        "token_jaccard": 0.8,
        "embedding_cosine": 0.7,
        "short_name_match": 0.5,
        "currency_match": 0.5,
        "contact_match": 0.5,
    }
    mock_text_block.return_value = {(s1.id, s2.id)}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {"confidence": 0.85, "signals": signals}

    from app.services.matching import run_matching_pipeline

    run_matching_pipeline(test_db, batch.id)
    test_db.flush()

    candidate = test_db.query(MatchCandidate).first()
    assert candidate is not None
    for key in [
        "jaro_winkler",
        "token_jaccard",
        "embedding_cosine",
        "short_name_match",
        "currency_match",
        "contact_match",
    ]:
        assert key in candidate.match_signals


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_assigns_groups(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Candidates are assigned to MatchGroups (group_id is not null)."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(s1.id, s2.id)}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler": 0.9,
            "token_jaccard": 0.8,
            "embedding_cosine": 0.7,
            "short_name_match": 0.5,
            "currency_match": 0.5,
            "contact_match": 0.5,
        },
    }

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, batch.id)
    test_db.flush()

    assert stats["group_count"] >= 1
    candidate = test_db.query(MatchCandidate).first()
    assert candidate is not None
    assert candidate.group_id is not None
    group = (
        test_db.query(MatchGroup).filter(MatchGroup.id == candidate.group_id).first()
    )
    assert group is not None


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_invalidates_on_reupload(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Re-upload invalidates old candidates involving that source."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    # Create an existing candidate
    old_candidate = MatchCandidate(
        supplier_a_id=s1.id,
        supplier_b_id=s2.id,
        confidence=0.80,
        match_signals={
            "jaro_winkler": 0.9,
            "token_jaccard": 0.8,
            "embedding_cosine": 0.7,
            "short_name_match": 0.5,
            "currency_match": 0.5,
            "contact_match": 0.5,
        },
        status="pending",
    )
    test_db.add(old_candidate)
    test_db.flush()

    # Now re-upload: invalidate source 1
    mock_text_block.return_value = set()
    mock_embedding_block.return_value = set()

    from app.services.matching import run_matching_pipeline

    run_matching_pipeline(test_db, batch.id, invalidate_source_id=src1.id)
    test_db.flush()

    old = (
        test_db.query(MatchCandidate)
        .filter(MatchCandidate.id == old_candidate.id)
        .first()
    )
    assert old.status == "invalidated"


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_returns_stats(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """Pipeline returns stats dict with candidate_count and group_count."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(s1.id, s2.id)}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler": 0.9,
            "token_jaccard": 0.8,
            "embedding_cosine": 0.7,
            "short_name_match": 0.5,
            "currency_match": 0.5,
            "contact_match": 0.5,
        },
    }

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, batch.id)

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
    _make_supplier(test_db, batch, src1, "Acme Corp")
    test_db.flush()

    # Only 1 source — blocking returns nothing
    mock_text_block.return_value = set()
    mock_embedding_block.return_value = set()

    from app.services.matching import run_matching_pipeline

    stats = run_matching_pipeline(test_db, batch.id)

    assert stats["candidate_count"] == 0
    assert stats["group_count"] == 0
    assert test_db.query(MatchCandidate).count() == 0


@patch("app.services.matching.embedding_block")
@patch("app.services.matching.text_block")
@patch("app.services.matching.score_pair")
def test_pipeline_progress_callback(
    mock_score_pair, mock_text_block, mock_embedding_block, test_db
):
    """progress_callback is called at each stage."""
    src1 = _make_source(test_db, "Entity A")
    src2 = _make_source(test_db, "Entity B")
    batch = _make_batch(test_db, src1)
    s1 = _make_supplier(test_db, batch, src1, "Acme Corp")
    batch2 = _make_batch(test_db, src2)
    s2 = _make_supplier(test_db, batch2, src2, "Acme Corporation")
    test_db.flush()

    mock_text_block.return_value = {(s1.id, s2.id)}
    mock_embedding_block.return_value = set()
    mock_score_pair.return_value = {
        "confidence": 0.85,
        "signals": {
            "jaro_winkler": 0.9,
            "token_jaccard": 0.8,
            "embedding_cosine": 0.7,
            "short_name_match": 0.5,
            "currency_match": 0.5,
            "contact_match": 0.5,
        },
    }

    callback = MagicMock()

    from app.services.matching import run_matching_pipeline

    run_matching_pipeline(test_db, batch.id, progress_callback=callback)

    # Verify callback was called with expected stages
    called_stages = [call[0][0] for call in callback.call_args_list]
    assert "BLOCKING" in called_stages
    assert "SCORING" in called_stages
    assert "CLUSTERING" in called_stages
    assert "INSERTING" in called_stages
