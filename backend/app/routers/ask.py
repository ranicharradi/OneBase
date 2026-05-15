"""/api/ask — natural-language Q&A over unified records via text-to-SQL."""

import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.ask import AskRequest, AskResponse
from app.services import llm as llm_service
from app.services.audit import log_action
from app.services.sql_guard import SqlGuardError, prepare_safe_select

router = APIRouter(prefix="/api/ask", tags=["ask"])

ALLOWED_VIEW = "v_unified_records_for_ask"
LIMIT_CAP = 200


class _AskSql(BaseModel):
    sql: str


@router.post("", response_model=AskResponse)
@limiter.limit("5/minute")
def ask(
    request: Request,
    payload: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schema_descr = (
        f"View {ALLOWED_VIEW}(id, record_type, source_name, created_at, "
        "dq_completeness, dq_validity, dq_score, and one column per canonical field key)"
    )
    prompt = (
        "Translate the user question into ONE PostgreSQL SELECT statement that runs "
        f"against this view only:\n{schema_descr}\n\n"
        f"User question: {payload.question}\n"
        'Return JSON: {"sql": "..."} with a single SELECT statement, no semicolons.'
    )

    t0 = time.perf_counter()
    result = llm_service.call_or_raise_http(lambda: llm_service.complete_structured(prompt, _AskSql))

    try:
        safe_sql = prepare_safe_select(result.sql, ALLOWED_VIEW, limit_cap=LIMIT_CAP)
    except SqlGuardError as e:
        raise HTTPException(status_code=422, detail=f"unsafe SQL: {e}") from e

    columns, rows = _execute_safe_sql(db, safe_sql)
    latency_ms = int((time.perf_counter() - t0) * 1000)

    log_action(
        db,
        user_id=current_user.id,
        action="llm_call",
        entity_type="ask",
        entity_id=None,
        details={"feature": "ask", "model": settings.llm_model, "latency_ms": latency_ms, "row_count": len(rows)},
    )
    db.commit()

    return AskResponse(
        sql=safe_sql,
        columns=columns,
        rows=rows,
        model=settings.llm_model,
        latency_ms=latency_ms,
    )


def _execute_safe_sql(db: Session, sql: str) -> tuple[list[str], list[list]]:
    """Run the pre-validated SELECT. The validator's whitelist + statement-type check is the
    actual safety guarantee; we still rollback to avoid any accidental commit side effects."""
    rs = db.execute(text(sql))
    columns = list(rs.keys())
    rows = [list(r) for r in rs.fetchall()]
    db.rollback()
    return columns, rows
