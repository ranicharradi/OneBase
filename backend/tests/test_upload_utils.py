"""Tests for upload file helpers."""

import asyncio

import pytest
from fastapi import HTTPException

from app.utils.uploads import read_limited_upload


class FakeUpload:
    def __init__(self, chunks: list[bytes]):
        self.chunks = list(chunks)
        self.read_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_sizes.append(size)
        if not self.chunks:
            return b""
        return self.chunks.pop(0)


def test_read_limited_upload_reads_in_chunks():
    upload = FakeUpload([b"abc", b"def", b""])

    content = asyncio.run(read_limited_upload(upload, max_size=10, chunk_size=3))

    assert content == b"abcdef"
    assert upload.read_sizes == [3, 3, 3]


def test_read_limited_upload_stops_when_limit_exceeded():
    upload = FakeUpload([b"abc", b"def", b"ghi"])

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(read_limited_upload(upload, max_size=5, chunk_size=3))

    assert exc_info.value.status_code == 413
    assert upload.read_sizes == [3, 3]
