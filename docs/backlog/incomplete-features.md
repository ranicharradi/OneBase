# Incomplete Features & Known Gaps

## Frontend — Non-functional UI elements

1. **Search button** (`Layout.tsx`) — Magnifying glass in the top navbar has no onClick handler.

2. **Notification badge** (`Layout.tsx`) — Shows count based on active toasts but has no dropdown, history, or notification center.

3. **Users page** (`Users.tsx`) — Can only list and create users. Missing: edit, delete, deactivate/activate toggle, password change, role/permission management.

4. **Review Queue pagination** (`ReviewQueue.tsx`) — Shows "Showing X of Y candidates" but only displays the first 50 results. No load-more, pagination, or infinite scroll.

5. **Unified Suppliers pagination** (`UnifiedSuppliers.tsx`) — Loads first 100 records with `limit=100`, no way to page through the rest.

6. **Re-upload pending match count** (`Upload.tsx`) — `pendingMatchCount={0}` is hardcoded. The dialog has UI to show invalidation count but never computes it.

7. **Signal labels in ReviewQueue** (`ReviewQueue.tsx`) — `_SIGNAL_LABELS` defined but unused. Was intended to show signal breakdowns in the queue list view.

## Backend — Missing counterparts

8. **No user management endpoints** — `auth.py` only has login, me, and create-user. No update, delete, deactivate, or password-change to back the "access control" claim.

9. **Retrain — no frontend** — `POST /api/matching/train-model` is fully implemented but has zero UI. No button or page to trigger weight retraining.

## Summary

The core data pipeline (upload, ingestion, matching, review, merge, unified records) is fully functional end-to-end. Gaps are concentrated in:

- User management (list/create only, no edit/delete/roles)
- Navigation chrome (search button, notification badge)
- Pagination (tables show limited results with no paging)
- ML retraining UI (backend exists, frontend doesn't)
