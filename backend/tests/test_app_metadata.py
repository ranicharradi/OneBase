from app.main import app


def test_app_description_is_records_first():
    assert app.description == "Records Unification Platform"
