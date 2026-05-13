"""Tests for the LLM service wrapper."""

from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from app.config import settings
from app.services.llm import (
    LLMDisabledError,
    LLMProviderError,
    LLMRefusalError,
    complete_structured,
)


class MappingSuggestion(BaseModel):
    mapping: dict[str, str | None]


@pytest.fixture(autouse=True)
def _enable_llm(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "llm_api_key", "test-key")


def test_disabled_raises_llmdisablederror(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", False)
    with pytest.raises(LLMDisabledError):
        complete_structured("hi", MappingSuggestion)


def test_happy_path():
    fake_resp = MagicMock()
    fake_resp.text = '{"mapping": {"header_a": "name"}}'
    with patch("app.services.llm._client") as mk:
        mk.return_value.models.generate_content.return_value = fake_resp
        result = complete_structured("Map these.", MappingSuggestion)
    assert isinstance(result, MappingSuggestion)
    assert result.mapping["header_a"] == "name"


def test_refusal_raises_on_empty_response():
    fake_resp = MagicMock()
    fake_resp.text = ""
    with patch("app.services.llm._client") as mk:
        mk.return_value.models.generate_content.return_value = fake_resp
        with pytest.raises(LLMRefusalError):
            complete_structured("anything", MappingSuggestion)


def test_refusal_raises_on_invalid_json():
    fake_resp = MagicMock()
    fake_resp.text = "I cannot help with that."
    with patch("app.services.llm._client") as mk:
        mk.return_value.models.generate_content.return_value = fake_resp
        with pytest.raises(LLMRefusalError):
            complete_structured("anything", MappingSuggestion)


def test_provider_error_wrapped():
    with patch("app.services.llm._client") as mk:
        mk.return_value.models.generate_content.side_effect = RuntimeError("upstream boom")
        with pytest.raises(LLMProviderError):
            complete_structured("anything", MappingSuggestion)
