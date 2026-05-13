"""Thin LLM service for OneBase Phase 1.

Single provider (Google Gemini via google-genai) with typed errors. See
docs/superpowers/specs/2026-05-13-ai-governance-phase1-design.md for the
contract.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, ValidationError

from app.config import settings


class LLMError(Exception):
    """Base class for LLM service errors."""


class LLMDisabledError(LLMError):
    """LLM_ENABLED is false."""


class LLMRefusalError(LLMError):
    """Model returned empty or invalid output (refusal or schema mismatch)."""


class LLMTimeoutError(LLMError):
    """Provider request timed out."""


class LLMProviderError(LLMError):
    """Generic upstream provider error (auth, rate-limit, transport, etc.)."""


@lru_cache(maxsize=1)
def _client():
    from google import genai

    return genai.Client(api_key=settings.llm_api_key)


def complete_structured[T: BaseModel](prompt: str, output_format: type[T]) -> T:
    """Run one Gemini call and return a parsed Pydantic instance.

    Raises:
        LLMDisabledError: LLM_ENABLED is false.
        LLMRefusalError: empty response or output that fails Pydantic validation.
        LLMTimeoutError: provider timeout.
        LLMProviderError: any other provider failure.
    """
    if not settings.llm_enabled:
        raise LLMDisabledError("LLM_ENABLED is false")

    from google.genai import errors as genai_errors
    from google.genai import types

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_json_schema=output_format,
    )

    try:
        response = _client().models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config=config,
        )
    except genai_errors.APIError as e:
        if getattr(e, "code", None) in (408, 504):
            raise LLMTimeoutError(str(e)) from e
        raise LLMProviderError(str(e)) from e
    except Exception as e:
        raise LLMProviderError(str(e)) from e

    text = (response.text or "").strip()
    if not text:
        raise LLMRefusalError("model returned empty response")

    try:
        return output_format.model_validate_json(text)
    except ValidationError as e:
        raise LLMRefusalError(f"model output failed schema validation: {e}") from e
