"""Tests for the pure diff_snapshot helper used by re-upload ingestion."""

from app.services.ingestion import DiffPlan, diff_snapshot


def test_diff_classifies_inserts_updates_retires():
    """diff_snapshot returns {insert, update, retire} keyed by identity key."""
    prior = {
        "V001": {"supplier_name": "Acme", "currency": "EUR"},
        "V002": {"supplier_name": "Beta", "currency": "USD"},
        "V003": {"supplier_name": "Gamma", "currency": "GBP"},
    }
    incoming = {
        "V001": {"supplier_name": "Acme", "currency": "EUR"},  # unchanged
        "V002": {"supplier_name": "Beta Corp", "currency": "USD"},  # field changed → update
        "V004": {"supplier_name": "Delta", "currency": "JPY"},  # new
    }

    plan = diff_snapshot(prior_by_key=prior, incoming_by_key=incoming)

    assert isinstance(plan, DiffPlan)
    assert plan.inserts == {"V004": {"supplier_name": "Delta", "currency": "JPY"}}
    assert plan.updates == {"V002": {"supplier_name": "Beta Corp", "currency": "USD"}}
    assert plan.retires == {"V003"}
    assert plan.unchanged == {"V001"}


def test_diff_handles_empty_prior():
    """All-new snapshot: everything is an insert."""
    plan = diff_snapshot(prior_by_key={}, incoming_by_key={"V001": {"supplier_name": "Acme"}})
    assert plan.inserts == {"V001": {"supplier_name": "Acme"}}
    assert plan.updates == {}
    assert plan.retires == set()
    assert plan.unchanged == set()


def test_diff_handles_empty_incoming():
    """Empty re-upload retires everything (caller may reject before reaching diff)."""
    plan = diff_snapshot(
        prior_by_key={"V001": {"supplier_name": "Acme"}},
        incoming_by_key={},
    )
    assert plan.retires == {"V001"}
    assert plan.inserts == {} and plan.updates == {}


def test_diff_treats_field_equality_as_unchanged():
    """Same key + identical fields → unchanged, not update."""
    same = {"V001": {"supplier_name": "Acme", "currency": "EUR"}}
    plan = diff_snapshot(prior_by_key=same, incoming_by_key=dict(same))
    assert plan.updates == {}
    assert plan.unchanged == {"V001"}
