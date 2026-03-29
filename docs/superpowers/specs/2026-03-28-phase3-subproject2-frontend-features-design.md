# Phase 3 Sub-project 2: Frontend Feature Gaps

> **Scope:** Tasks 3.8–3.13 from phase-3-feature-completion.md
> **Goal:** Close all frontend feature gaps — pagination, search, notifications, signal labels, re-upload count fix, ML retraining UI.
> **Depends on:** Sub-project 1 (RBAC) for role-based visibility of admin controls and `UserResponse.role` field.

---

## 1. Pagination (3.8)

### Shared component: `frontend/src/components/Pagination.tsx`

- Props: `page`, `pageSize`, `totalItems`, `onPageChange` — component computes `totalPages` internally from `Math.ceil(totalItems / pageSize)` and renders "Showing X–Y of Z" label
- Previous/Next buttons with disabled states at boundaries
- Accessible: `aria-label` on nav, `aria-current="page"` on current page indicator

### ReviewQueue integration

- Already has `offset`/`limit` API params and `total`/`has_more` in response
- Add `page` state, compute offset from `page * limit`
- Wire Pagination component
- Use TanStack Query `placeholderData: keepPreviousData` for smooth transitions

### UnifiedSuppliers integration

- Currently hardcodes `limit=100`, no offset
- Add `page` state to both unified and singletons tabs
- Compute offset, pass to API call, wire Pagination component

### No backend changes needed

Both endpoints already support `limit`/`offset` and return `total`.

**Acceptance criteria:**
- Users can page through all ReviewQueue candidates and UnifiedSuppliers
- "Showing X–Y of Z" label updates correctly
- Previous disabled on first page, Next disabled on last page
- Keyboard accessible with visible focus indicators

---

## 2. Re-upload Pending Match Count Fix (3.9)

### Current bug

`Upload.tsx` hardcodes `existingCount={0}` and `pendingMatchCount={0}` when rendering `ReUploadDialog`.

### Backend addition

Add `GET /api/sources/{id}/upload-stats` endpoint:
```json
{ "staged_count": 42, "pending_match_count": 15 }
```
Counts active (non-superseded) staged suppliers and pending match candidates for that source.

### Frontend fix

When re-upload is triggered and dialog is about to show, fetch `/api/sources/{sourceId}/upload-stats` and pass real values to `ReUploadDialog` props.

**Acceptance criteria:**
- ReUploadDialog shows actual number of staged suppliers and match candidates that will be invalidated
- Count is 0 for sources with no prior data (new upload path unaffected)

---

## 3. Search (3.10)

### Approach: Client-side filter (no backend changes)

### UI

- Click search icon in Layout navbar (or `Ctrl+K` / `Cmd+K`) → expandable search input slides out
- `Escape` closes input and clears filter

### Architecture

- `Layout` holds search state, exposes `searchQuery` via React context
- Each page with a filterable table consumes context and filters displayed data client-side
- Pages without tables (Dashboard) → search navigates to UnifiedSuppliers with `?q=` query param

### Accessibility

- `sr-only` label on search input
- `aria-expanded` on toggle button
- Focus moves to input on open, returns to button on close

**Acceptance criteria:**
- Search icon opens text input
- Typing filters results on current page
- Escape closes search input
- Accessible: label, focus management, keyboard operable

---

## 4. Notification Center (3.11)

### New component: `frontend/src/components/NotificationCenter.tsx`

Dropdown triggered by clicking the bell icon in Layout.

### Notification store

- React state in Layout: array of `{ id, type, message, timestamp, read }`
- Persisted to `sessionStorage` (survives navigation, not full refresh)

### Feed sources

- WebSocket events: `matching_complete`, `matching_failed`, `matching_progress` (already captured by `useMatchingNotifications`)
- Toast events: capture before auto-dismiss to build notification history

### UI

- Bell click toggles dropdown
- Badge shows unread count
- Scrollable list of notifications with timestamp and description
- "Mark all as read" action
- Clicking a notification marks it as read

### Accessibility

- `aria-haspopup="true"` on bell button
- `aria-expanded` toggles with dropdown
- Focus trap within dropdown
- `Escape` closes dropdown

**Acceptance criteria:**
- Bell icon opens dropdown with notification history
- Badge count reflects unread notifications
- Notifications persist across page navigations (within session)
- Accessible: keyboard operable, focus trapped, Escape closes

---

## 5. Signal Labels in ReviewQueue (3.12)

### Backend change

Add `match_signals` to the review queue list response in `backend/app/routers/review.py`. The data is already stored on `MatchCandidate` — include it in the list serialization.

### Frontend changes

- Add `match_signals: Record<string, number>` to `ReviewQueueItem` type in `types.ts`
- Extract `SIGNAL_CONFIG` from `ReviewDetail.tsx` to a shared location (e.g., `src/utils/signals.ts`)
- In ReviewQueue list, render signal scores as compact inline badges below each candidate row (e.g., "JW: 0.87 | TJ: 0.72 | EC: 0.91")
- Muted Tailwind styling for badges — no progressive disclosure needed for a few small values

**Acceptance criteria:**
- ReviewQueue list shows signal breakdowns per candidate
- Signal labels are human-readable
- Compact display that doesn't clutter the UI

---

## 6. ML Retraining UI (3.13)

### Backend addition

Add `GET /api/matching/model-status` endpoint:
```json
{
  "last_retrained": "2026-03-20T14:30:00Z",
  "last_trained": "2026-03-18T10:00:00Z",
  "review_count": 85,
  "current_weights": { "jaro_winkler": 0.30, "token_jaccard": 0.20, ... },
  "ml_model_exists": true
}
```

### Frontend: Dashboard "ML & Matching" section

- Placed below pipeline cards, above next actions
- **Visible only to admin role** (uses `role` from `useAuth` user object, depends on Sub-project 1)
- Model status card: last trained date, review count, current signal weights display
- Two action buttons:
  - "Retrain Signal Weights" → confirmation dialog → `POST /api/matching/retrain`
  - "Train ML Model" → confirmation dialog → `POST /api/matching/train-model`
- Buttons disabled with tooltip when insufficient data (< 20 reviews for retrain, < 50 for train)
- Success/error feedback via toast

**Acceptance criteria:**
- Admin can trigger signal weight retraining and ML model training from the UI
- Non-admin users do not see retrain controls
- Confirmation dialog prevents accidental triggers
- Success/error feedback displayed

---

## Out of Scope

- Backend RBAC implementation (Sub-project 1)
- Server-side search (client-side filtering is sufficient for current data volumes)
- Notification persistence across sessions (sessionStorage is sufficient)
- Real-time collaborative features
