"""Tests for currency-token stopword extension in normalize_name."""

from app.services.normalization import CURRENCY_STOPWORDS, normalize_name


def test_currency_stopwords_constant_includes_expected_tokens():
    """The set of currency tokens to strip — locked to the user-specified list."""
    assert {"TND", "EUR", "EURO", "USD", "DINARS"} == CURRENCY_STOPWORDS


def test_currency_token_is_stripped_at_end():
    assert normalize_name("Arab Tunisian Bank TND") == normalize_name("Arab Tunisian Bank")


def test_currency_token_is_stripped_in_middle():
    assert normalize_name("Bank EUR Branch") == normalize_name("Bank Branch")


def test_dinars_token_is_stripped():
    assert normalize_name("Banque Dinars") == normalize_name("Banque")


def test_currency_tokens_are_case_insensitive():
    """normalize_name uppercases first, so lowercase 'tnd' is stripped same as 'TND'."""
    assert normalize_name("Bank tnd") == normalize_name("Bank")


def test_currency_substrings_in_other_words_are_preserved():
    """USDA contains 'USD' as a substring but is a different token — must survive."""
    result = normalize_name("USDA Federal Reserve")
    assert "USDA" in result


def test_existing_legal_suffix_stripping_still_works():
    """Sanity: extending the stopwords didn't break LEGAL_SUFFIXES removal."""
    assert normalize_name("Acme Corp SARL") == "ACME"  # SARL stripped + CORP not a suffix → CORPORATION is though


def test_existing_domain_stopwords_still_work():
    """Sanity: TUNISIE etc. still removed."""
    assert "TUNISIE" not in normalize_name("La Tunisie Bank")
