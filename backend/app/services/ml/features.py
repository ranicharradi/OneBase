"""Feature extraction helpers shared between training and inference."""

from app.models.staging import StagedRecord
from app.record_types import get as get_record_type
from app.services.scoring import signal_key


def compute_engineered_features(name_a: str, name_b: str) -> tuple[float, float]:
    """Compute name_length_ratio and token_count_diff from record names."""
    len_a = max(len(name_a), 1)
    len_b = max(len(name_b), 1)
    name_length_ratio = min(len_a, len_b) / max(len_a, len_b)
    tokens_a = len(name_a.split())
    tokens_b = len(name_b.split())
    token_count_diff = abs(tokens_a - tokens_b)
    return name_length_ratio, float(token_count_diff)


def build_scorer_row(
    record_a: StagedRecord,
    record_b: StagedRecord,
    signals: dict | None,
    record_type_key: str,
) -> list[float]:
    """Build one scorer feature row.

    Reads each type-declared signal from `signals` (the JSONB dict stored on
    the candidate at scoring time) — falls back to 0.0 for any missing signal.
    Adds engineered features at the end.
    """
    rt = get_record_type(record_type_key)
    sig_dict = signals or {}
    row = [float(sig_dict.get(signal_key(s.kind, s.field), 0.0)) for s in rt.signals]
    name_a = record_a.normalized_name or record_a.name or ""
    name_b = record_b.normalized_name or record_b.name or ""
    nlr, tcd = compute_engineered_features(name_a, name_b)
    row.append(nlr)
    row.append(tcd)
    return row
