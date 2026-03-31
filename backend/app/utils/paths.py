"""Secure path utilities to prevent directory traversal attacks."""

import os


def safe_upload_path(upload_dir: str, filename: str) -> str:
    """Resolve the path and verify it stays within upload_dir.

    Raises ValueError if the resolved path escapes the upload directory.
    """
    base = os.path.realpath(upload_dir)
    filepath = os.path.realpath(os.path.join(base, filename))
    if not filepath.startswith(base + os.sep) and filepath != base:
        raise ValueError("Invalid file reference")
    return filepath
