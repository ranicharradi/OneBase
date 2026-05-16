# backend/app/record_types/__init__.py
"""Record type registry — collects every registered RecordType.

Types register themselves at import time. The package's `__init__.py` imports
each known type module so a single `import app.record_types` populates the
registry. Frontend metadata endpoints and the matching engine query this
registry by key.
"""

from app.record_types.base import FieldDef, RecordType, Role, Signal

__all__ = ["FieldDef", "RecordType", "Role", "Signal", "register", "get", "all_types"]


_REGISTRY: dict[str, RecordType] = {}


def register(rt: RecordType) -> None:
    """Register a RecordType under its key. Raises ValueError on duplicate."""
    if rt.key in _REGISTRY:
        raise ValueError(f"record type {rt.key!r} is already registered")
    _REGISTRY[rt.key] = rt


def get(key: str) -> RecordType:
    """Return the RecordType registered under `key`. Raises KeyError if missing."""
    try:
        return _REGISTRY[key]
    except KeyError as exc:
        raise KeyError(f"no record type registered with key {key!r}") from exc


def all_types() -> tuple[RecordType, ...]:
    """Return all registered types in insertion order."""
    return tuple(_REGISTRY.values())


def _testing_clear_registry() -> None:
    """Test-only: empty the registry. Do not call from production code."""
    _REGISTRY.clear()


# Type registrations live below this line. Each module's import call has the
# side effect of registering its type.
from app.record_types import bank as _bank  # noqa: E402, F401
from app.record_types import supplier as _supplier  # noqa: E402, F401
