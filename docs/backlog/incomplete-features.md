Here's what I found after reading through all the key files:

  Demo/Placeholder Features

  Frontend — Non-functional UI elements

  1. Search button (Layout.tsx:150-152) — The magnifying glass button in the top navbar has no onClick handler. It renders but does nothing.

  2. Notification badge (Layout.tsx:142-147) — Shows a count based on active toasts, but there's no notification dropdown, history, or
  notification center. It's purely decorative.

  3. Users page — incomplete management (Users.tsx) — Subtitle says "Manage system users and access control" but you can only list and create
  users. Missing:
  - Edit user
  - Delete user
  - Deactivate/activate toggle (the is_active badge displays but can't be changed)
  - Password change
  - Role/permission management

  4. Review Queue — no pagination (ReviewQueue.tsx:311-320) — Shows "Showing X of Y candidates" and "Scroll or adjust filters to see more" but
  there's no load-more button, next page, or infinite scroll. You only see the first 50 results.

  5. Unified Suppliers — no pagination (UnifiedSuppliers.tsx:47) — Loads first 100 records with limit=100, no way to page through the rest.

  6. Re-upload pending match count (Upload.tsx:358) — pendingMatchCount={0} is hardcoded. The dialog has UI to show how many match candidates
  would be invalidated, but the count is never actually computed.

  7. _SIGNAL_LABELS in ReviewQueue (ReviewQueue.tsx:11-19) — Defined but unused, suppressed with void. Was intended to show signal breakdowns in
   the queue list view.

  Backend — Missing counterparts

  8. No user management endpoints — auth.py only has login, me, and create-user. No update, delete, deactivate, or password-change endpoints to
  back the "access control" claim.

  9. Retrain — no frontend — POST /api/matching/retrain is fully implemented in the backend but has zero UI. There's no button or page in the
  frontend to trigger weight retraining.

  Summary

  The core data pipeline (upload → ingestion → matching → review → merge → unified records) is fully functional end-to-end. The placeholders are
   concentrated in:
  - User management (list/create only, no edit/delete/roles)
  - Navigation chrome (search button, notification badge)
  - Pagination (tables show limited results with no way to page)
  - Retrain UI (backend exists, frontend doesn't)

  Want me to start implementing any of these?