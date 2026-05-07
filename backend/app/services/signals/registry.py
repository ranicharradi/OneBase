"""Signal-kind registry.

A signal kind is a function `(record_a, record_b, field) -> float`
that scores one signal between two record-shaped objects. Records expose
`fields` (a dict keyed by FieldDef.key) plus a `name_embedding` attribute
for embedding-based kinds.

Convention: field-value signal kinds read values from `record.fields`.
`embedding_cosine` is the exception: it reads `record.name_embedding`
directly, so it does not require the NAME-role field value to be present in
`fields`. For field-value kinds, `compute_signal` short-circuits to None when
either side's value is missing — the matcher drops missing-signal
contributions from the weighted sum and renormalizes against the active total.
"""

from collections.abc import Callable
from typing import Any

SignalFn = Callable[[Any, Any, str], float]

_KINDS: dict[str, SignalFn] = {}


def _resolve(record: Any, field: str) -> Any:
    return record.fields.get(field) if record.fields else None


def register_kind(name: str, fn: SignalFn) -> None:
    if name in _KINDS:
        raise ValueError(f"signal kind {name!r} is already registered")
    _KINDS[name] = fn


def get_kind(name: str) -> SignalFn:
    try:
        return _KINDS[name]
    except KeyError as exc:
        raise KeyError(f"no signal kind registered under {name!r}") from exc


def list_kinds() -> tuple[str, ...]:
    return tuple(_KINDS)


def compute_signal(kind: str, record_a: Any, record_b: Any, field: str) -> float | None:
    """Compute one signal. Returns None if either side lacks the field."""
    fn = get_kind(kind)  # fail fast on unknown kind
    a_val = _resolve(record_a, field)
    b_val = _resolve(record_b, field)
    if a_val is None or b_val is None:
        return None
    return fn(record_a, record_b, field)


def _testing_clear_registry() -> None:
    _KINDS.clear()
