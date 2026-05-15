# backend/app/record_types/base.py
"""Core abstractions for record types.

A RecordType is the engineer-declared, immutable description of a record kind
(e.g. supplier, customer, product, material). It owns:
  - the field set (FieldDef[])
  - the matching signal list (Signal[])
The matching engine reads its config from the type at runtime; adding a new
type is one new module under app/record_types/ plus a registry import.
"""

from dataclasses import dataclass, field
from enum import StrEnum


class Role(StrEnum):
    """Semantic role of a field. Drives column-mapper UX and merge-priority defaults.

    Roles do NOT directly drive matching — that is the Signal list's job.
    """

    NAME = "name"  # primary label; gets embedded for HNSW blocking
    CODE = "code"  # business identifier (e.g. vendor_code, customer_code)
    EMAIL = "email"  # email address
    PHONE = "phone"  # phone number
    ENUM = "enum"  # bounded categorical (currency, country, payment_terms)
    EXTRA = "extra"  # display-only or auxiliary text


@dataclass(frozen=True)
class FieldDef:
    """One field a record type declares."""

    key: str
    label: str
    role: Role
    required: bool = False
    synonyms: tuple[str, ...] = ()  # known source column names for auto-mapping


@dataclass(frozen=True)
class Signal:
    """One matching signal in a type's signal list.

    `kind` references a signal function in app.services.scoring.SIGNAL_FNS.
    `field` is the FieldDef.key the signal operates on. `weight` contributes to
    the weighted-sum confidence (defaults to 1.0 — must be > 0).
    """

    kind: str
    field: str
    weight: float = 1.0


@dataclass(frozen=True)
class RecordType:
    """An immutable record-type descriptor.

    Validation runs at construction time so misconfigurations fail at import.
    """

    key: str
    label: str
    fields: tuple[FieldDef, ...] = field(default_factory=tuple)
    signals: tuple[Signal, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        # Coerce list inputs to tuples for hashability/immutability
        object.__setattr__(self, "fields", tuple(self.fields))
        object.__setattr__(self, "signals", tuple(self.signals))

        seen_keys: set[str] = set()
        for f in self.fields:
            if f.key in seen_keys:
                raise ValueError(f"duplicate field key in type {self.key!r}: {f.key!r}")
            seen_keys.add(f.key)

        name_fields = [f for f in self.fields if f.role == Role.NAME]
        if len(name_fields) != 1:
            raise ValueError(
                f"type {self.key!r} must declare exactly one field with role=NAME (found {len(name_fields)})"
            )

        for s in self.signals:
            if s.field not in seen_keys:
                raise ValueError(f"type {self.key!r} signal {s.kind!r} references unknown field {s.field!r}")
            if s.weight <= 0:
                raise ValueError(
                    f"type {self.key!r} signal {s.kind!r} on {s.field!r} has non-positive weight {s.weight}"
                )

        # embedding_cosine must reference the NAME-role field
        name_field_key = name_fields[0].key
        for s in self.signals:
            if s.kind == "embedding_cosine" and s.field != name_field_key:
                raise ValueError(
                    f"type {self.key!r} embedding_cosine signal must reference the "
                    f"NAME-role field {name_field_key!r}, got {s.field!r}"
                )

    @property
    def name_field(self) -> FieldDef:
        """Return the single FieldDef with role=NAME."""
        return next(f for f in self.fields if f.role == Role.NAME)

    @property
    def field_keys(self) -> tuple[str, ...]:
        """Return the ordered keys of all declared fields."""
        return tuple(f.key for f in self.fields)
