# Phase 3 Sub-project 2: Frontend Feature Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all frontend feature gaps — pagination on data tables, re-upload count fix, client-side search, notification center, signal labels in review queue, and ML retraining UI.

**Architecture:** Create reusable Pagination component, SearchContext for cross-page filtering, NotificationCenter dropdown backed by sessionStorage, extract shared signal config, and add ML status/retraining section to Dashboard. Two small backend additions: upload-stats endpoint and model-status endpoint. One backend schema change: add match_signals to review queue response.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Tailwind CSS v4, Vite 8, FastAPI (backend additions)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/Pagination.tsx` | Create | Reusable pagination component |
| `frontend/src/contexts/SearchContext.tsx` | Create | Search state context for cross-page filtering |
| `frontend/src/components/NotificationCenter.tsx` | Create | Notification dropdown component |
| `frontend/src/hooks/useNotifications.ts` | Create | Notification store with sessionStorage persistence |
| `frontend/src/utils/signals.ts` | Create | Shared SIGNAL_CONFIG extracted from ReviewDetail |
| `frontend/src/pages/ReviewQueue.tsx` | Modify | Add pagination + signal labels |
| `frontend/src/pages/UnifiedSuppliers.tsx` | Modify | Add pagination to both tabs |
| `frontend/src/pages/Upload.tsx` | Modify | Fetch real counts for ReUploadDialog |
| `frontend/src/components/Layout.tsx` | Modify | Wire search + notification center |
| `frontend/src/pages/Dashboard.tsx` | Modify | Add ML retraining section |
| `frontend/src/pages/ReviewDetail.tsx` | Modify | Import SIGNAL_CONFIG from shared utils |
| `frontend/src/api/types.ts` | Modify | Add role to User, match_signals to ReviewQueueItem, new types |
| `backend/app/routers/sources.py` | Modify | Add upload-stats endpoint |
| `backend/app/routers/matching.py` | Modify | Add model-status endpoint |
| `backend/app/routers/review.py` | Modify | Include match_signals in queue response |
| `backend/app/schemas/review.py` | Modify | Add match_signals to ReviewQueueItem |

---

### Task 1: Update TypeScript types for Phase 3

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add role to User interface**

In `frontend/src/api/types.ts`, update the `User` interface:

```typescript
export interface User {
  id: number;
  username: string;
  is_active: boolean;
  role: string;
  created_at: string;
}
```

- [ ] **Step 2: Add match_signals to ReviewQueueItem**

Update the `ReviewQueueItem` interface:

```typescript
export interface ReviewQueueItem {
  id: number;
  supplier_a_id: number;
  supplier_b_id: number;
  supplier_a_name: string | null;
  supplier_b_name: string | null;
  supplier_a_source: string | null;
  supplier_b_source: string | null;
  confidence: number;
  match_signals: Record<string, number>;
  status: string;
  group_id: number | null;
  created_at: string | null;
}
```

- [ ] **Step 3: Add new types at the end of the file**

```typescript
// ── Upload stats (re-upload dialog) ──

export interface UploadStatsResponse {
  staged_count: number;
  pending_match_count: number;
}

// ── ML Model status ──

export interface ModelStatusResponse {
  last_retrained: string | null;
  last_trained: string | null;
  review_count: number;
  current_weights: Record<string, number>;
  ml_model_exists: boolean;
}

// ─�� User management (Phase 3) ──

export interface UserCreateWithRole {
  username: string;
  password: string;
  role?: string;
}
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build may have type errors in components that don't yet provide `match_signals` — that's OK, we'll fix them in later tasks.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: update TypeScript types for Phase 3 (role, match_signals, new types)"
```

---

### Task 2: Create reusable Pagination component

**Files:**
- Create: `frontend/src/components/Pagination.tsx`

- [ ] **Step 1: Create the Pagination component**

Create `frontend/src/components/Pagination.tsx`:

```tsx
// ─��� Reusable pagination — Previous/Next with page indicator ──

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, totalItems, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  if (totalItems === 0) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-1 py-3 text-xs text-on-surface-variant/60"
    >
      <span className="font-mono">
        Showing <span className="text-on-surface font-semibold">{start}&ndash;{end}</span> of{' '}
        <span className="text-on-surface font-semibold">{totalItems.toLocaleString()}</span>
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-on-surface/10 bg-white/40 hover:bg-white/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          Previous
        </button>

        <span className="px-2 text-xs font-mono text-on-surface" aria-current="page">
          {page + 1} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-on-surface/10 bg-white/40 hover:bg-white/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/rani/OneBase/frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from Pagination.tsx (other files may have pre-existing issues).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Pagination.tsx
git commit -m "feat: create reusable Pagination component"
```

---

### Task 3: Add pagination to ReviewQueue

**Files:**
- Modify: `frontend/src/pages/ReviewQueue.tsx`

- [ ] **Step 1: Add page state and pagination import**

At the top of `ReviewQueue.tsx`, add the import:

```typescript
import Pagination from '../components/Pagination';
```

Inside the `ReviewQueue` component, add page state after the filter states:

```typescript
const [page, setPage] = useState(0);
const pageSize = 50;
```

- [ ] **Step 2: Add offset to API params and include page in query key**

Update the params building to include offset:

```typescript
params.set('limit', String(pageSize));
params.set('offset', String(page * pageSize));
```

Update the query to include `page` in the key and use `keepPreviousData`:

```typescript
import { keepPreviousData, useQuery } from '@tanstack/react-query';

const { data: queue, isLoading, isPlaceholderData } = useQuery({
  queryKey: ['review-queue', statusFilter, minConfidence, maxConfidence, sourceFilter, page],
  queryFn: () => api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
  placeholderData: keepPreviousData,
});
```

- [ ] **Step 3: Reset page when filters change**

Wrap each filter setter to reset page:

```typescript
// Add at the top of the component
const setFilterAndResetPage = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) =>
  (value: T) => { setter(value); setPage(0); };
```

Use it on all filter `onChange` handlers:
```typescript
onChange={(e) => setFilterAndResetPage(setStatusFilter)(e.target.value)}
onChange={(e) => setFilterAndResetPage(setSourceFilter)(e.target.value)}
onChange={(e) => setFilterAndResetPage(setMinConfidence)(e.target.value)}
onChange={(e) => setFilterAndResetPage(setMaxConfidence)(e.target.value)}
```

- [ ] **Step 4: Replace footer with Pagination component**

Replace the existing footer section:

```tsx
{/* Before: */}
{queue && queue.total > 0 && (
  <div className="flex items-center justify-between px-1 text-xs text-outline">
    <span>
      Showing {queue.items.length} of {queue.total} candidates
    </span>
    {queue.has_more && (
      <span className="text-on-surface-variant/60">
        Scroll or adjust filters to see more
      </span>
    )}
  </div>
)}

{/* After: */}
{queue && queue.total > 0 && (
  <Pagination
    page={page}
    pageSize={pageSize}
    totalItems={queue.total}
    onPageChange={setPage}
  />
)}
```

- [ ] **Step 5: Verify the page builds**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ReviewQueue.tsx
git commit -m "feat: add pagination to ReviewQueue"
```

---

### Task 4: Add pagination to UnifiedSuppliers

**Files:**
- Modify: `frontend/src/pages/UnifiedSuppliers.tsx`

- [ ] **Step 1: Add page state and imports**

Add import at top:
```typescript
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Pagination from '../components/Pagination';
```

Add page state inside the component:
```typescript
const [unifiedPage, setUnifiedPage] = useState(0);
const [singletonsPage, setSingletonsPage] = useState(0);
const pageSize = 50;
```

- [ ] **Step 2: Update unified suppliers query**

```typescript
const { data: unifiedData, isLoading: unifiedLoading } = useQuery<UnifiedSupplierListResponse>({
  queryKey: ['unified-suppliers', search, sourceType, unifiedPage],
  queryFn: () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sourceType) params.set('source_type', sourceType);
    params.set('limit', String(pageSize));
    params.set('offset', String(unifiedPage * pageSize));
    return api.get(`/api/unified/suppliers?${params}`);
  },
  placeholderData: keepPreviousData,
  enabled: tab === 'unified',
});
```

- [ ] **Step 3: Update singletons query**

```typescript
const { data: singletonData, isLoading: singletonsLoading } = useQuery<SingletonListResponse>({
  queryKey: ['singletons', singletonSearch, singletonSourceId, singletonsPage],
  queryFn: () => {
    const params = new URLSearchParams();
    if (singletonSearch) params.set('search', singletonSearch);
    if (singletonSourceId) params.set('source_id', singletonSourceId);
    params.set('limit', String(pageSize));
    params.set('offset', String(singletonsPage * pageSize));
    return api.get(`/api/unified/singletons?${params}`);
  },
  placeholderData: keepPreviousData,
  enabled: tab === 'singletons',
});
```

- [ ] **Step 4: Reset pages on filter/search changes**

Reset `unifiedPage` to 0 when `search` or `sourceType` changes. Reset `singletonsPage` to 0 when `singletonSearch` or `singletonSourceId` changes. Wrap the existing `onChange` handlers similarly to Task 3.

- [ ] **Step 5: Add Pagination after each tab's table**

After the unified suppliers table (end of the unified tab content):
```tsx
{unifiedData && unifiedData.total > 0 && (
  <Pagination
    page={unifiedPage}
    pageSize={pageSize}
    totalItems={unifiedData.total}
    onPageChange={setUnifiedPage}
  />
)}
```

After the singletons table:
```tsx
{singletonData && singletonData.total > 0 && (
  <Pagination
    page={singletonsPage}
    pageSize={pageSize}
    totalItems={singletonData.total}
    onPageChange={setSingletonsPage}
  />
)}
```

- [ ] **Step 6: Verify build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/UnifiedSuppliers.tsx
git commit -m "feat: add pagination to UnifiedSuppliers (both tabs)"
```

---

### Task 5: Fix re-upload pending match count

**Files:**
- Modify: `backend/app/routers/sources.py`
- Modify: `frontend/src/pages/Upload.tsx`

- [ ] **Step 1: Add backend upload-stats endpoint**

Add to the end of `backend/app/routers/sources.py` (before the closing of the file):

```python
@router.get("/{source_id}/upload-stats")
def get_upload_stats(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get counts of active staged suppliers and pending match candidates for a source."""
    from app.models.enums import CandidateStatus
    from app.models.match import MatchCandidate

    source = get_source(db, source_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Data source not found")

    staged_count = (
        db.query(func.count(StagedSupplier.id))
        .filter(
            StagedSupplier.data_source_id == source_id,
            StagedSupplier.status == SupplierStatus.ACTIVE,
        )
        .scalar()
        or 0
    )

    # Count pending match candidates involving this source's suppliers
    source_supplier_ids = (
        db.query(StagedSupplier.id)
        .filter(
            StagedSupplier.data_source_id == source_id,
            StagedSupplier.status == SupplierStatus.ACTIVE,
        )
        .subquery()
    )
    pending_match_count = (
        db.query(func.count(MatchCandidate.id))
        .filter(
            MatchCandidate.status == CandidateStatus.PENDING,
            (MatchCandidate.supplier_a_id.in_(source_supplier_ids))
            | (MatchCandidate.supplier_b_id.in_(source_supplier_ids)),
        )
        .scalar()
        or 0
    )

    return {"staged_count": staged_count, "pending_match_count": pending_match_count}
```

Add `func` to the sqlalchemy imports at the top of `sources.py`:
```python
from sqlalchemy import func
```

- [ ] **Step 2: Update Upload.tsx to fetch stats**

In `frontend/src/pages/Upload.tsx`, add the `UploadStatsResponse` import:
```typescript
import type {
  DataSource,
  DataSourceCreate,
  UploadResponse,
  BatchResponse,
  SourceMatch,
  SourceMatchResponse,
  GuessMappingResponse,
  UploadStatsResponse,
} from '../api/types';
```

Add state for the counts:
```typescript
const [reUploadStats, setReUploadStats] = useState<UploadStatsResponse>({ staged_count: 0, pending_match_count: 0 });
```

Update the `handleConfirmSource` callback to fetch stats:

```typescript
const handleConfirmSource = useCallback(async (sourceId: number, fileRef: string) => {
  try {
    const batches = await api.get<BatchResponse[]>(`/api/import/batches?data_source_id=${sourceId}`);
    if (batches && batches.length > 0) {
      // Fetch real counts for the dialog
      try {
        const stats = await api.get<UploadStatsResponse>(`/api/sources/${sourceId}/upload-stats`);
        setReUploadStats(stats);
      } catch {
        setReUploadStats({ staged_count: 0, pending_match_count: 0 });
      }
      setPendingSourceId(sourceId);
      setPendingFileRef(fileRef);
      setShowReUpload(true);
      return;
    }
  } catch {
    // If we can't check, proceed anyway
  }
  uploadMutation.mutate({ fileRef, dataSourceId: sourceId });
}, [uploadMutation]);
```

Update the ReUploadDialog rendering:
```tsx
{showReUpload && (
  <ReUploadDialog
    sourceName={reUploadSourceName}
    existingCount={reUploadStats.staged_count}
    pendingMatchCount={reUploadStats.pending_match_count}
    onConfirm={handleReUploadConfirm}
    onCancel={handleReUploadCancel}
  />
)}
```

- [ ] **Step 3: Verify build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run backend tests**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_sources.py -v -q`
Expected: Existing tests pass (new endpoint doesn't break anything).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/sources.py frontend/src/pages/Upload.tsx
git commit -m "fix: fetch real counts for re-upload dialog instead of hardcoded zeros"
```

---

### Task 6: Add client-side search

**Files:**
- Create: `frontend/src/contexts/SearchContext.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/pages/ReviewQueue.tsx`
- Modify: `frontend/src/pages/UnifiedSuppliers.tsx`

- [ ] **Step 1: Create SearchContext**

Create `frontend/src/contexts/SearchContext.tsx`:

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SearchContextType {
  query: string;
  isOpen: boolean;
  setQuery: (q: string) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => { setIsOpen(false); setQuery(''); }, []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <SearchContext.Provider value={{ query, isOpen, setQuery, open, close, toggle }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextType {
  const context = useContext(SearchContext);
  if (!context) throw new Error('useSearch must be used within SearchProvider');
  return context;
}
```

- [ ] **Step 2: Wire search into Layout**

In `frontend/src/components/Layout.tsx`:

Add imports:
```typescript
import { useSearch, SearchProvider } from '../contexts/SearchContext';
```

Wrap the Layout return in `SearchProvider` (or wrap in the app-level provider — see step 3).

Replace the search button with an expandable input:

```tsx
{/* Search */}
{(() => {
  const { query, isOpen, setQuery, toggle, close } = useSearch();
  return isOpen ? (
    <div className="flex items-center gap-2">
      <label htmlFor="global-search" className="sr-only">Search</label>
      <input
        id="global-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        placeholder="Search..."
        autoFocus
        className="input-field w-48 text-sm"
        aria-expanded="true"
      />
      <button onClick={close} className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center border border-white/60 shadow-sm hover:bg-white/60 transition-colors" aria-label="Close search">
        <span className="material-symbols-outlined text-on-surface-variant">close</span>
      </button>
    </div>
  ) : (
    <button
      onClick={toggle}
      className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center border border-white/60 shadow-sm hover:bg-white/60 transition-colors"
      aria-label="Open search"
      aria-expanded="false"
    >
      <span className="material-symbols-outlined text-on-surface-variant">search</span>
    </button>
  );
})()}
```

- [ ] **Step 3: Add SearchProvider to the app**

Wrap the `SearchProvider` around the Layout component in the app's route tree (or wrap the outlet inside Layout). The simplest approach: wrap the entire Layout return body in `<SearchProvider>`.

- [ ] **Step 4: Add keyboard shortcut**

In Layout, add a `useEffect` for `Ctrl+K` / `Cmd+K`:

```typescript
import { useEffect } from 'react';

// Inside Layout component:
const search = useSearch();

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      search.toggle();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [search]);
```

- [ ] **Step 5: Consume search in ReviewQueue**

In `ReviewQueue.tsx`, add:

```typescript
import { useSearch } from '../contexts/SearchContext';

// Inside component:
const { query: searchQuery } = useSearch();

// Filter displayed items:
const filteredItems = queue?.items.filter(item => {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (
    item.supplier_a_name?.toLowerCase().includes(q) ||
    item.supplier_b_name?.toLowerCase().includes(q) ||
    item.supplier_a_source?.toLowerCase().includes(q) ||
    item.supplier_b_source?.toLowerCase().includes(q)
  );
}) ?? [];
```

Use `filteredItems` instead of `queue.items` in the rendering loop.

- [ ] **Step 6: Consume search in UnifiedSuppliers**

Same pattern — filter the rendered `items` array by `searchQuery` matching against `name`, `source_code`, `short_name`.

- [ ] **Step 7: Verify build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/contexts/SearchContext.tsx frontend/src/components/Layout.tsx frontend/src/pages/ReviewQueue.tsx frontend/src/pages/UnifiedSuppliers.tsx
git commit -m "feat: add client-side search with Ctrl+K shortcut"
```

---

### Task 7: Add notification center

**Files:**
- Create: `frontend/src/hooks/useNotifications.ts`
- Create: `frontend/src/components/NotificationCenter.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Create useNotifications hook**

Create `frontend/src/hooks/useNotifications.ts`:

```typescript
import { useState, useCallback, useEffect } from 'react';

export interface Notification {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  read: boolean;
}

const STORAGE_KEY = 'onebase_notifications';
const MAX_NOTIFICATIONS = 50;

function loadFromStorage(): Notification[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: Notification[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  const add = useCallback((type: string, message: string) => {
    setNotifications(prev => [{
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    }, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, add, markRead, markAllRead, unreadCount };
}
```

- [ ] **Step 2: Create NotificationCenter component**

Create `frontend/src/components/NotificationCenter.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import type { Notification } from '../hooks/useNotifications';

interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_ICONS: Record<string, string> = {
  matching_complete: 'check_circle',
  matching_failed: 'error',
  matching_progress: 'sync',
  upload: 'upload_file',
  info: 'info',
};

export default function NotificationCenter({
  notifications, unreadCount, isOpen, onToggle, onMarkRead, onMarkAllRead,
}: NotificationCenterProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onToggle]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="flex items-center bg-white/40 px-3 py-1.5 rounded-full border border-white/60 shadow-sm hover:bg-white/60 transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Notifications"
      >
        <span className="material-symbols-outlined text-sm text-on-surface-variant mr-1">notifications</span>
        <span className="text-[10px] font-bold text-accent-600">
          {unreadCount > 0 ? `+${unreadCount}` : '0'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-surface border border-on-surface/10 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-on-surface/5">
            <span className="text-sm font-semibold text-on-surface">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-xs text-accent-600 hover:text-accent-600/80 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant/60">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y divide-on-surface/5">
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => onMarkRead(n.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-white/30 transition-colors ${
                    !n.read ? 'bg-accent-600/[0.04]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-sm mt-0.5 text-on-surface-variant">
                      {TYPE_ICONS[n.type] || 'info'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-on-surface leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{timeAgo(n.timestamp)}</p>
                    </div>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-accent-600 mt-1 shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire into Layout**

In `Layout.tsx`, import and use the notification center:

```typescript
import NotificationCenter from './NotificationCenter';
import { useNotifications } from '../hooks/useNotifications';
```

Inside the Layout component:
```typescript
const notifications = useNotifications();
const [notifOpen, setNotifOpen] = useState(false);
```

Replace the existing notification badge `<div>` with:
```tsx
<NotificationCenter
  notifications={notifications.notifications}
  unreadCount={notifications.unreadCount}
  isOpen={notifOpen}
  onToggle={() => setNotifOpen(prev => !prev)}
  onMarkRead={notifications.markRead}
  onMarkAllRead={notifications.markAllRead}
/>
```

Feed WebSocket events into the notification store — in the existing `useMatchingNotifications` callback:
```typescript
const handleMatchingNotification = useCallback((event: MatchingNotification) => {
  // Existing toast logic...

  // Also add to notification center
  if (event.type === 'matching_complete') {
    notifications.add('matching_complete', `Matching complete: ${event.data.candidate_count} candidates in ${event.data.group_count} groups`);
  } else if (event.type === 'matching_failed') {
    notifications.add('matching_failed', `Matching failed: ${event.data.error || 'Unknown error'}`);
  }
}, [notifications]);
```

- [ ] **Step 4: Verify build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useNotifications.ts frontend/src/components/NotificationCenter.tsx frontend/src/components/Layout.tsx
git commit -m "feat: add notification center with sessionStorage persistence"
```

---

### Task 8: Add signal labels to ReviewQueue

**Files:**
- Modify: `backend/app/schemas/review.py`
- Modify: `backend/app/routers/review.py`
- Create: `frontend/src/utils/signals.ts`
- Modify: `frontend/src/pages/ReviewQueue.tsx`
- Modify: `frontend/src/pages/ReviewDetail.tsx`

- [ ] **Step 1: Add match_signals to backend ReviewQueueItem schema**

In `backend/app/schemas/review.py`, update the `ReviewQueueItem` class:

```python
class ReviewQueueItem(BaseModel):
    """Match candidate enriched for the review queue."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_a_id: int
    supplier_b_id: int
    supplier_a_name: str | None = None
    supplier_b_name: str | None = None
    supplier_a_source: str | None = None
    supplier_b_source: str | None = None
    confidence: float
    match_signals: dict[str, float] = {}
    status: str
    group_id: int | None = None
    created_at: datetime | None = None
```

- [ ] **Step 2: Include match_signals in review queue response**

In `backend/app/routers/review.py`, update the queue item construction inside `get_review_queue`:

```python
items.append(
    ReviewQueueItem(
        id=c.id,
        supplier_a_id=c.supplier_a_id,
        supplier_b_id=c.supplier_b_id,
        supplier_a_name=a_info[0],
        supplier_b_name=b_info[0],
        supplier_a_source=a_info[1],
        supplier_b_source=b_info[1],
        confidence=c.confidence,
        match_signals=c.match_signals or {},
        status=c.status,
        group_id=c.group_id,
        created_at=c.created_at,
    )
)
```

- [ ] **Step 3: Extract SIGNAL_CONFIG to shared utils**

Create `frontend/src/utils/signals.ts`:

```typescript
export const SIGNAL_CONFIG: Record<string, { label: string; shortLabel: string; icon: string }> = {
  jaro_winkler: { label: 'Jaro-Winkler', shortLabel: 'JW', icon: '⌨' },
  token_jaccard: { label: 'Token Jaccard', shortLabel: 'TJ', icon: '∩' },
  embedding_cosine: { label: 'Embedding Cosine', shortLabel: 'EC', icon: '⟡' },
  short_name_match: { label: 'Short Name', shortLabel: 'SN', icon: '◈' },
  currency_match: { label: 'Currency', shortLabel: 'CUR', icon: '¤' },
  contact_match: { label: 'Contact', shortLabel: 'CON', icon: '◉' },
};
```

- [ ] **Step 4: Update ReviewDetail to use shared config**

In `frontend/src/pages/ReviewDetail.tsx`, replace the local `SIGNAL_CONFIG` with:

```typescript
import { SIGNAL_CONFIG } from '../utils/signals';
```

Remove the local `SIGNAL_CONFIG` declaration (lines 16-23).

- [ ] **Step 5: Add signal badges to ReviewQueue rows**

In `frontend/src/pages/ReviewQueue.tsx`, import the shared config:

```typescript
import { SIGNAL_CONFIG } from '../utils/signals';
```

Below each supplier pair in the row (after the Supplier B column), add a compact signal display. Update the grid to accommodate signals, or add them as a sub-row. The simplest approach — add a signal line below each row:

Inside the `queue.items.map` rendering, after the existing row div, add:

```tsx
{/* Signal badges below the row */}
{item.match_signals && Object.keys(item.match_signals).length > 0 && (
  <div className="col-span-full px-5 pb-2 -mt-1 flex gap-2 flex-wrap">
    {Object.entries(item.match_signals).map(([key, value]) => {
      const config = SIGNAL_CONFIG[key];
      if (!config) return null;
      return (
        <span
          key={key}
          className="text-[10px] font-mono text-on-surface-variant/60 bg-white/30 px-1.5 py-0.5 rounded"
          title={config.label}
        >
          {config.shortLabel}: {(value * 100).toFixed(0)}%
        </span>
      );
    })}
  </div>
)}
```

- [ ] **Step 6: Run backend tests**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_review_merge.py -v -q`
Expected: Existing tests pass.

- [ ] **Step 7: Verify frontend build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/review.py backend/app/routers/review.py frontend/src/utils/signals.ts frontend/src/pages/ReviewQueue.tsx frontend/src/pages/ReviewDetail.tsx
git commit -m "feat: add signal labels to ReviewQueue list view"
```

---

### Task 9: Add ML retraining UI

**Files:**
- Modify: `backend/app/routers/matching.py`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add model-status backend endpoint**

Add to `backend/app/routers/matching.py`:

```python
from app.models.ml import MLModelVersion


@router.get("/model-status")
def get_model_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current ML model and weight retraining status."""
    from app.config import settings

    # Latest scorer model
    scorer = (
        db.query(MLModelVersion)
        .filter(MLModelVersion.model_type == "scorer")
        .order_by(MLModelVersion.created_at.desc())
        .first()
    )

    # Count reviewed candidates
    review_count = (
        db.query(func.count(MatchCandidate.id))
        .filter(MatchCandidate.status.in_(["confirmed", "rejected"]))
        .scalar()
        or 0
    )

    # Current weights from config
    current_weights = {
        "jaro_winkler": settings.matching_weight_jaro_winkler,
        "token_jaccard": settings.matching_weight_token_jaccard,
        "embedding_cosine": settings.matching_weight_embedding_cosine,
        "short_name": settings.matching_weight_short_name,
        "currency": settings.matching_weight_currency,
        "contact": settings.matching_weight_contact,
    }

    return {
        "last_trained": scorer.created_at.isoformat() if scorer else None,
        "last_retrained": None,  # Weight retraining doesn't persist a timestamp yet
        "review_count": review_count,
        "current_weights": current_weights,
        "ml_model_exists": scorer is not None,
    }
```

- [ ] **Step 2: Add ML section to Dashboard**

In `frontend/src/pages/Dashboard.tsx`, add the ML retraining section. Import needed hooks:

```typescript
import { useAuth } from '../hooks/useAuth';
import { useMutation } from '@tanstack/react-query';
import type { ModelStatusResponse } from '../api/types';
```

Inside the Dashboard component, add:

```typescript
const { user } = useAuth();
const isAdmin = user?.role === 'admin';

const { data: modelStatus } = useQuery<ModelStatusResponse>({
  queryKey: ['model-status'],
  queryFn: () => api.get('/api/matching/model-status'),
  enabled: isAdmin,
});

const [confirmAction, setConfirmAction] = useState<'retrain' | 'train' | null>(null);

const retrainMutation = useMutation({
  mutationFn: () => api.post('/api/matching/retrain'),
  onSuccess: () => {
    setConfirmAction(null);
    queryClient.invalidateQueries({ queryKey: ['model-status'] });
    // Show success toast (use existing toast mechanism)
  },
  onError: (err: Error) => {
    setConfirmAction(null);
    // Show error toast
  },
});

const trainMutation = useMutation({
  mutationFn: () => api.post('/api/matching/train-model'),
  onSuccess: () => {
    setConfirmAction(null);
    queryClient.invalidateQueries({ queryKey: ['model-status'] });
  },
  onError: (err: Error) => {
    setConfirmAction(null);
  },
});
```

Add the ML section JSX between the pipeline cards and the next-actions section:

```tsx
{isAdmin && modelStatus && (
  <div className="card p-5 space-y-4">
    <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant/60">
      ML & Matching
    </h2>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="text-center">
        <p className="text-lg font-mono font-bold text-on-surface">{modelStatus.review_count}</p>
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">Reviews</p>
      </div>
      <div className="text-center">
        <p className="text-lg font-mono font-bold text-on-surface">
          {modelStatus.ml_model_exists ? 'Trained' : 'None'}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">ML Model</p>
      </div>
      <div className="text-center">
        <p className="text-sm font-mono text-on-surface truncate">
          {modelStatus.last_trained
            ? new Date(modelStatus.last_trained).toLocaleDateString()
            : '—'}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">Last Trained</p>
      </div>
      <div className="text-center">
        <p className="text-sm font-mono text-on-surface">
          {Object.values(modelStatus.current_weights).map(w => w.toFixed(2)).join(' · ')}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">Weights</p>
      </div>
    </div>

    <div className="flex gap-3">
      <button
        onClick={() => setConfirmAction('retrain')}
        disabled={modelStatus.review_count < 20 || retrainMutation.isPending}
        className="btn-secondary text-xs disabled:opacity-40"
        title={modelStatus.review_count < 20 ? 'Need at least 20 reviews' : ''}
      >
        {retrainMutation.isPending ? 'Retraining...' : 'Retrain Signal Weights'}
      </button>
      <button
        onClick={() => setConfirmAction('train')}
        disabled={modelStatus.review_count < 50 || trainMutation.isPending}
        className="btn-secondary text-xs disabled:opacity-40"
        title={modelStatus.review_count < 50 ? 'Need at least 50 reviews' : ''}
      >
        {trainMutation.isPending ? 'Training...' : 'Train ML Model'}
      </button>
    </div>

    {/* Confirmation dialog */}
    {confirmAction && (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-warning-500/[0.06] border border-warning-500/20">
        <span className="material-symbols-outlined text-warning-500">warning</span>
        <p className="text-xs text-on-surface flex-1">
          {confirmAction === 'retrain'
            ? 'This will recalculate signal weights from review decisions. Affects all future matching.'
            : 'This will train a new ML model from review decisions. Affects all future matching.'}
        </p>
        <button
          onClick={() => confirmAction === 'retrain' ? retrainMutation.mutate() : trainMutation.mutate()}
          className="btn-primary text-xs"
        >
          Confirm
        </button>
        <button onClick={() => setConfirmAction(null)} className="btn-secondary text-xs">
          Cancel
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Add queryClient if not already present in Dashboard**

Dashboard may need `useQueryClient`:
```typescript
const queryClient = useQueryClient();
```

Add it to the imports from `@tanstack/react-query`.

- [ ] **Step 4: Verify frontend build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Run backend tests**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest tests/test_ml_api.py -v -q`
Expected: Existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/matching.py frontend/src/pages/Dashboard.tsx
git commit -m "feat: add ML retraining UI to Dashboard (admin only)"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd /home/rani/OneBase/backend && source .venv/bin/activate && python -m pytest -q`
Expected: All tests pass.

- [ ] **Step 2: Run frontend build**

Run: `cd /home/rani/OneBase/frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run frontend lint**

Run: `cd /home/rani/OneBase/frontend && npm run lint`
Expected: No errors (warnings are OK).

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final Phase 3 Sub-project 2 cleanup"
```
