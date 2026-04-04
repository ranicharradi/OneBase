# Incomplete Features & Known Gaps

## Frontend — Non-functional UI elements

1. **Search button** (`Layout.tsx`) — Magnifying glass in the top navbar has no onClick handler.

2. **Notification badge** (`Layout.tsx`) — Shows count based on active toasts but has no dropdown, history, or notification center.

3. **Re-upload pending match count** (`Upload.tsx`) — `pendingMatchCount={0}` is hardcoded. The dialog has UI to show invalidation count but never computes it.

## Backend — Missing counterparts

4. **Retrain — no frontend** — `POST /api/matching/train-model` is fully implemented but has zero UI. No button or page to trigger weight retraining.

## Summary

The core data pipeline (upload, ingestion, matching, review, merge, unified records) is fully functional end-to-end. Gaps are concentrated in:

- Navigation chrome (search button, notification badge)
- ML retraining UI (backend exists, frontend doesn't)
- Re-upload pending match count (hardcoded zero)

## Resolved

- ~~Users page~~ — Edit, delete, toggle-active, and password change now implemented
- ~~Review Queue pagination~~ — Wired up with offset/limit
- ~~Unified Suppliers pagination~~ — Wired up with offset/limit
- ~~Unused `_SIGNAL_LABELS`~~ — Removed
- ~~No user management endpoints~~ — Full CRUD in `backend/app/routers/users.py`
