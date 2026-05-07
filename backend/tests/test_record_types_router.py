def test_list_record_types(authenticated_client):
    resp = authenticated_client.get("/api/record-types")

    assert resp.status_code == 200
    body = resp.json()
    keys = {t["key"] for t in body["types"]}
    assert "supplier" in keys


def test_get_record_type_returns_full_config(authenticated_client):
    resp = authenticated_client.get("/api/record-types/supplier")

    assert resp.status_code == 200
    body = resp.json()
    assert body["key"] == "supplier"
    assert body["label"] == "Supplier"
    field_keys = [f["key"] for f in body["fields"]]
    assert "supplier_name" in field_keys
    assert any(f["key"] == "supplier_name" and f["role"] == "name" for f in body["fields"])
    assert len(body["signals"]) == 6
    name_field = next(f for f in body["fields"] if f["key"] == "supplier_name")
    assert "BPSNAM_0" in name_field["synonyms"]


def test_get_unknown_record_type_returns_404(authenticated_client):
    resp = authenticated_client.get("/api/record-types/does-not-exist")

    assert resp.status_code == 404
