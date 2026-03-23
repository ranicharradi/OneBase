# T03: 02-matching-engine 03

**Slice:** S03 — **Milestone:** M001

## Description

Add WebSocket notification infrastructure and frontend toast system so users are notified when matching jobs complete or fail, with the ProgressTracker extended to show matching as the final pipeline stage.

Purpose: Close the feedback loop — users know when matching finishes without polling. The Upload page shows matching inline, other pages show a toast.
Output: WebSocket endpoint, Redis pub/sub bridge, notification hook, Toast component, extended ProgressTracker

## Must-Haves

- [ ] "User receives a toast notification when matching completes while on any page"
- [ ] "User on Upload page sees matching completion as final inline pipeline step in ProgressTracker"
- [ ] "Toast shows stats and link: candidate count, group count, link to review page"
- [ ] "On matching failure, user sees a red error toast"
- [ ] "WebSocket connection auto-reconnects on disconnect"

## Files

- `backend/app/routers/ws.py`
- `backend/app/services/notifications.py`
- `backend/app/tasks/matching.py`
- `backend/app/main.py`
- `backend/tests/test_ws.py`
- `frontend/src/hooks/useMatchingNotifications.ts`
- `frontend/src/components/Toast.tsx`
- `frontend/src/components/ProgressTracker.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/api/types.ts`
