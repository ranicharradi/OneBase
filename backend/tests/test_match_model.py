from app.models.match_run import MatchRun


def test_create_match_run(test_db):
    run = MatchRun(
        type="supplier",
        mode="FILE_VS_FILE",
        status="pending",
        created_by="alice",
    )
    test_db.add(run)
    test_db.commit()
    test_db.refresh(run)
    assert run.id is not None
    assert run.stats == {}
    assert run.status == "pending"
