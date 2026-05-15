from app.utils.values import normalize_value


def test_strips_whitespace():
    assert normalize_value("  foo  ") == "foo"


def test_empty_becomes_none():
    assert normalize_value("") is None
    assert normalize_value("   ") is None


def test_none_passthrough():
    assert normalize_value(None) is None


def test_non_string_passthrough():
    assert normalize_value(42) == 42
