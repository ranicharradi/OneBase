"""Tests for UPLOAD_DIR config extraction (Task 5.10).

Verifies that upload_dir is centralized in Settings and used by both routers.
"""


class TestUploadDirConfig:
    """upload_dir is a single source of truth in Settings."""

    def test_settings_has_upload_dir(self):
        from app.config import settings

        assert hasattr(settings, "upload_dir")
        assert settings.upload_dir == "data/uploads"

    def test_upload_router_uses_settings(self):
        from app.config import settings
        from app.routers.upload import UPLOAD_DIR

        assert settings.upload_dir == UPLOAD_DIR

    def test_sources_router_uses_settings(self):
        from app.config import settings
        from app.routers.sources import UPLOAD_DIR

        assert settings.upload_dir == UPLOAD_DIR
