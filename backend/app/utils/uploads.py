"""Shared helpers for bounded upload reads."""

from typing import Protocol

from fastapi import HTTPException, status

DEFAULT_UPLOAD_CHUNK_SIZE = 1024 * 1024


class ReadableUpload(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


async def read_limited_upload(
    file: ReadableUpload,
    max_size: int,
    *,
    chunk_size: int = DEFAULT_UPLOAD_CHUNK_SIZE,
) -> bytes:
    """Read an upload in chunks and fail once the accumulated size exceeds max_size."""
    content = bytearray()
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break

        content.extend(chunk)
        if len(content) > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds maximum size of {max_size // (1024 * 1024)} MB",
            )

    return bytes(content)
