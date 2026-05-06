"""Signal-kind registry public API.

Importing this module registers all built-in kinds.
"""

# Side-effect import: registers built-in kinds
from app.services.signals import builtins as _builtins  # noqa: E402, F401
from app.services.signals.registry import (
    compute_signal,
    get_kind,
    list_kinds,
    register_kind,
)

__all__ = [
    "compute_signal",
    "get_kind",
    "list_kinds",
    "register_kind",
]
