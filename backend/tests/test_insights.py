"""Tests for the Insights tab aggregates."""


def _seed_unified(db, **kwargs):
    from app.models.unified import UnifiedRecord

    defaults = dict(
        type="supplier",
        name="X",
        fields={"name": "X"},
        provenance={},
        source_record_ids=[],
        created_by="testuser",
    )
    defaults.update(kwargs)
    rec = UnifiedRecord(**defaults)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def test_insights_dq_empty(authenticated_client):
    resp = authenticated_client.get("/api/insights/dq")
    assert resp.status_code == 200
    body = resp.json()
    assert body["avg_dq"] == 0.0
    assert isinstance(body["distribution"], list)
    assert body["per_source"] == []
    assert body["worst"] == []


def test_insights_dq_with_records(authenticated_client, test_db):
    from app.models.source import DataSource

    src = DataSource(name="SrcA", type="supplier", column_mapping={}, identity_field_key="supplier_name")
    test_db.add(src)
    test_db.commit()
    test_db.refresh(src)

    _seed_unified(test_db, dq_score=0.1, dq_completeness=0.0, dq_validity=0.2)
    _seed_unified(test_db, dq_score=0.5, dq_completeness=0.5, dq_validity=0.5)
    _seed_unified(test_db, dq_score=0.9, dq_completeness=1.0, dq_validity=0.8)

    resp = authenticated_client.get("/api/insights/dq")
    assert resp.status_code == 200
    body = resp.json()
    assert 0.4 <= body["avg_dq"] <= 0.6
    assert [b["bucket"] for b in body["distribution"]] == ["<0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", ">=0.8"]
    assert sum(b["count"] for b in body["distribution"]) == 3
    assert body["worst"][0]["dq_score"] == 0.1
