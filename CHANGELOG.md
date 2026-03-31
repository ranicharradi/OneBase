# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- RBAC with admin/reviewer/viewer roles and `require_role()` endpoint gating (Phase 3)
- User management endpoints: CRUD, toggle-active, change-password with self/last-admin guards (Phase 3)
- Pagination on ReviewQueue and UnifiedSuppliers (Phase 3)
- Client-side search with Ctrl+K shortcut (Phase 3)
- Notification center with sessionStorage persistence and WebSocket events (Phase 3)
- Signal labels on ReviewQueue list rows (Phase 3)
- ML retraining UI on Dashboard for admin users (Phase 3)
- Frontend test suite: Vitest + Testing Library with tests for useAuth, API client, Login, Dashboard, ReviewQueue (Phase 4)
- CI job for frontend tests (Phase 4)
- `CONTRIBUTING.md` and `CHANGELOG.md` (Phase 4)

### Fixed
- Re-upload dialog now shows real staged/pending counts instead of zeros (Phase 3)

### Changed
- Security headers middleware on all API responses (Phase 2)
- Status enums for import batches and match candidates (Phase 2)

## [0.1.0] - 2026-03-27

### Added
- Initial release: CSV upload, multi-signal matching engine, human review, unified supplier merge
- Backend: FastAPI, SQLAlchemy, Celery, pgvector blocking
- Frontend: React 19, TypeScript, TanStack Query, Tailwind CSS v4
- WebSocket real-time notifications
- Field-level provenance tracking
- CI pipeline: backend lint/test, frontend lint/build
