"""Data-quality scoring service.

Computes completeness, validity, and an averaged score for a UnifiedRecord
against its RecordType's FieldDef list. See spec
docs/superpowers/specs/2026-05-13-ai-governance-phase1-design.md for the
role-based validity rules.
"""

from __future__ import annotations

import re
from typing import Protocol

from app.record_types.base import FieldDef, Role

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_DIGITS_RE = re.compile(r"\D+")


class _HasFields(Protocol):
    fields: dict[str, str | None]


def _is_present(value: object) -> bool:
    """True when the field has any non-None value (even whitespace-only)."""
    return value is not None


def _is_filled(value: object) -> bool:
    """True when the field has a meaningful (non-blank) value."""
    if value is None:
        return False
    return not (isinstance(value, str) and not value.strip())


def _is_valid(role: Role, value: object) -> bool:
    """Phase 1 role-based validity checks. Roles not listed always pass."""
    if not _is_filled(value):
        return False  # filtered-out at call site, but defensive
    text = str(value).strip()
    if role == Role.EMAIL:
        return bool(_EMAIL_RE.match(text))
    if role == Role.PHONE:
        digits = _PHONE_DIGITS_RE.sub("", text)
        return 7 <= len(digits) <= 20
    if role in (Role.NAME, Role.CODE):
        return len(text) > 0
    return True  # ENUM, EXTRA, anything else


def compute_dq(
    record: _HasFields,
    fields: tuple[FieldDef, ...],
) -> tuple[float, float, float]:
    """Return (completeness, validity, score) each in [0, 1].

    Completeness: filled required fields / total required fields.
        Falls back to filled / total when no required fields are defined.
    Validity: filled fields passing their role check / filled fields.
        Returns 1.0 when nothing is filled (no signal either way).
    Score: simple average.
    """
    payload = record.fields or {}

    required = [f for f in fields if f.required]
    if required:
        filled_required = [f for f in required if _is_filled(payload.get(f.key))]
        completeness = len(filled_required) / len(required)
    elif fields:
        filled = [f for f in fields if _is_filled(payload.get(f.key))]
        completeness = len(filled) / len(fields)
    else:
        completeness = 1.0

    present_all = [f for f in fields if _is_present(payload.get(f.key))]
    if present_all:
        passing = [f for f in present_all if _is_valid(f.role, payload.get(f.key))]
        validity = len(passing) / len(present_all)
    else:
        validity = 1.0

    score = (completeness + validity) / 2
    return completeness, validity, score
