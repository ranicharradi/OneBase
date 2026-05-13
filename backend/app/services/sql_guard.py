"""SQL safety guard for the /api/ask endpoint.

Accepts a model-generated SQL string and either returns a normalized,
LIMIT-clamped SELECT safe to execute, or raises SqlGuardError.
"""

from __future__ import annotations

import sqlglot
from sqlglot import exp


class SqlGuardError(ValueError):
    """The input SQL did not pass the safety checks."""


def prepare_safe_select(sql: str, allowed_view: str, *, limit_cap: int) -> str:
    """Parse, validate and rewrite `sql` for safe execution.

    Rules enforced:
      1. Exactly one statement, which must be a SELECT.
      2. Every referenced table must equal `allowed_view`.
      3. LIMIT must be present and <= limit_cap (injected/clamped otherwise).
    """
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except Exception as e:
        raise SqlGuardError(f"could not parse SQL: {e}") from e

    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise SqlGuardError(f"expected exactly one statement, got {len(statements)}")

    tree = statements[0]
    if not isinstance(tree, exp.Select):
        raise SqlGuardError(f"only SELECT statements are allowed (got {type(tree).__name__})")

    tables = list(tree.find_all(exp.Table))
    if not tables:
        raise SqlGuardError("query must reference the allowed view")
    for t in tables:
        if t.name != allowed_view:
            raise SqlGuardError(f"table {t.name!r} is not allowed; only {allowed_view!r} may be queried")

    existing_limit = tree.args.get("limit")
    if existing_limit is None:
        tree = tree.limit(limit_cap)
    else:
        try:
            current = int(existing_limit.expression.this)
        except (AttributeError, ValueError):
            tree = tree.limit(limit_cap)
        else:
            if current > limit_cap:
                tree = tree.limit(limit_cap)

    return tree.sql(dialect="postgres")
