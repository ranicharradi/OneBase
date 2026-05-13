"""/api/ask request and response schemas."""

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class AskResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list]
    model: str
    latency_ms: int
