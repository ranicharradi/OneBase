# Phase 4: Frontend Testing & Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frontend test infrastructure (Vitest + Testing Library), write critical tests for hooks/client/pages, add tests to CI, and create CONTRIBUTING.md + CHANGELOG.md.

**Tech Stack:** Vitest 3.x, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom, React 19, TypeScript 5.9, Vite 8

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/package.json` | Modify | Add test deps + scripts |
| `frontend/vitest.config.ts` | Create | Vitest config merged with Vite config |
| `frontend/src/test/setup.ts` | Create | jest-dom matchers setup |
| `frontend/src/test/test-utils.tsx` | Create | Custom render with all providers |
| `frontend/tsconfig.json` | Modify | Add reference to `tsconfig.test.json` |
| `frontend/tsconfig.test.json` | Create | TS config for test files with vitest/jest-dom types |
| `frontend/src/hooks/__tests__/useAuth.test.tsx` | Create | Auth hook tests |
| `frontend/src/api/__tests__/client.test.ts` | Create | API client tests |
| `frontend/src/pages/__tests__/Login.test.tsx` | Create | Login page tests |
| `frontend/src/pages/__tests__/Dashboard.test.tsx` | Create | Dashboard page tests |
| `frontend/src/pages/__tests__/ReviewQueue.test.tsx` | Create | ReviewQueue page tests |
| `.github/workflows/ci.yml` | Modify | Add `frontend-test` job |
| `Makefile` | Modify | Add `test-ui` target |
| `CONTRIBUTING.md` | Create | Contributor guide |
| `CHANGELOG.md` | Create | Changelog |

---

### Task 1: Set up Vitest + Testing Library

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/tsconfig.test.json`
- Modify: `frontend/tsconfig.json`

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Add test scripts to `package.json`**

Add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: Create `frontend/vitest.config.ts`**

Uses `mergeConfig` to inherit plugins (react, tailwindcss) and aliases from the main Vite config:

```typescript
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
}))
```

**Why `mergeConfig`:** Shares the `react()` and `tailwindcss()` plugins from `vite.config.ts`, so JSX transforms work in tests without duplicating config.

**Why `globals: true`:** Allows `describe`, `it`, `expect` without imports — matches the jest-dom Vitest setup pattern (Context7-verified).

- [ ] **Step 4: Create `frontend/src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest'
```

This single import registers all jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) with Vitest's `expect` (Context7-verified: this is the correct import path for Vitest, NOT `@testing-library/jest-dom`).

- [ ] **Step 5: Create `frontend/tsconfig.test.json`**

The existing `tsconfig.app.json` has `types: ["vite/client"]` and only includes `src/`. Test files need `vitest/globals` and `@testing-library/jest-dom` types. Create a separate tsconfig for test files:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "target": "ES2023",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test"]
}
```

- [ ] **Step 6: Add reference to `tsconfig.json`**

Add `{ "path": "./tsconfig.test.json" }` to the `references` array in `frontend/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.test.json" }
  ]
}
```

- [ ] **Step 7: Verify**

Run `npm run test` — should exit 0 with "no test files found" (or similar). Run `npx tsc -b` — should have no type errors.

**Acceptance criteria:**
- `npm run test` exits 0
- `npx tsc -b` exits 0
- Vitest uses jsdom, jest-dom matchers are available, globals enabled

---

### Task 2: Create shared test utilities (custom render)

**Files:**
- Create: `frontend/src/test/test-utils.tsx`

Multiple pages depend on providers: `AuthProvider`, `SearchProvider`, `QueryClientProvider`, `BrowserRouter`, and `ThemeProvider`. A shared custom `render` that wraps all providers avoids boilerplate in every test file.

- [ ] **Step 1: Create `frontend/src/test/test-utils.tsx`**

```tsx
import type { ReactNode, ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { SearchProvider } from '../contexts/SearchContext'

// Create a fresh QueryClient per test to prevent cache leaks
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function AllProviders({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SearchProvider>
          {children}
        </SearchProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllProviders, ...options })

// Re-export everything from testing-library
export * from '@testing-library/react'
export { customRender as render }
```

**Design notes:**
- Uses `MemoryRouter` (not `BrowserRouter`) — standard practice for tests, avoids jsdom URL issues (Context7-verified).
- `AuthProvider` is NOT included — auth state varies per test, so tests that need it should wrap explicitly or mock `useAuth`. Including it would trigger an API call on mount.
- `SearchProvider` IS included — it's pure state with no side effects, and `ReviewQueue`/`UnifiedSuppliers` depend on it.
- Fresh `QueryClient` per render prevents stale cache from leaking between tests.
- `retry: false` prevents flaky test hangs on failed queries.

- [ ] **Step 2: Verify**

Import from `test-utils` compiles: `import { render, screen } from '../test/test-utils'`.

**Acceptance criteria:**
- `test-utils.tsx` exports `render`, `screen`, and all `@testing-library/react` utilities
- TypeScript compiles without errors

---

### Task 3: Write tests for `useAuth` hook

**Files:**
- Create: `frontend/src/hooks/__tests__/useAuth.test.tsx`

**Context:** `useAuth` (`src/hooks/useAuth.tsx`) provides `login`, `logout`, `user`, `isLoading`, `isAuthenticated`. It calls `fetch` internally via `api.get`/`api.formPost`. It reads/writes `localStorage('onebase_token')`. The API client redirects to `/login` on 401 by assigning `window.location.href`.

- [ ] **Step 1: Create test file with these cases**

```
describe('AuthProvider', () => {
  - renders children
  - starts with isLoading=true when token exists in localStorage
  - starts with isLoading=false when no token
  - fetches /api/auth/me on mount when token exists
  - sets user from /api/auth/me response
  - clears token and sets user=null when /api/auth/me fails
})

describe('login', () => {
  - calls /api/auth/login with form-encoded username/password
  - stores token in localStorage on success
  - fetches /api/auth/me after storing token
  - sets user and isAuthenticated=true on success
  - throws on login failure (does not set user)
})

describe('logout', () => {
  - clears token from localStorage
  - sets user to null
  - sets isAuthenticated to false
})

describe('useAuth outside provider', () => {
  - throws "must be used within an AuthProvider"
})
```

- [ ] **Step 2: Mock strategy**

- Mock `global.fetch` with `vi.fn()` — the API client uses bare `fetch`.
- `localStorage` works natively in jsdom — no mock needed.
- **`window.location.href` assignment:** The API client's 401 handler does `window.location.href = '/login'`. jsdom supports this but it triggers navigation warnings. Use `vi.stubGlobal('location', { ...window.location, href: '' })` in a `beforeEach` and `vi.unstubAllGlobals()` in `afterEach` to capture the redirect without side effects.
- Use `renderHook` from `@testing-library/react` (NOT the deprecated `@testing-library/react-hooks` package — Context7-verified: `renderHook` is built into `@testing-library/react` since v14).
- Wrap `renderHook` with `AuthProvider` as the `wrapper` option.

- [ ] **Step 3: Run tests, verify all pass**

**Acceptance criteria:**
- All auth flow scenarios covered
- Tests pass in jsdom environment
- No deprecated package imports

---

### Task 4: Write tests for API client

**Files:**
- Create: `frontend/src/api/__tests__/client.test.ts`

**Context:** `src/api/client.ts` exports `api` object with `get`, `post`, `put`, `delete`, `upload`, `formPost` methods. Also exports `setToken`, `clearToken`, `ApiError`. Uses `localStorage('onebase_token')` for JWT. Redirects on 401 via `window.location.href = '/login'`.

- [ ] **Step 1: Create test file with these cases**

```
describe('api.get', () => {
  - sends GET request with Authorization header when token exists
  - sends GET request without Authorization header when no token
  - returns parsed JSON body
  - throws ApiError with status on non-ok response
  - throws ApiError with detail message from JSON error body
)

describe('api.post', () => {
  - sends POST with JSON body and Content-Type application/json
  - sends POST without body when body is undefined
)

describe('api.formPost', () => {
  - sends POST with application/x-www-form-urlencoded Content-Type
  - sends URL-encoded params in body
)

describe('api.upload', () => {
  - sends POST with FormData body
  - does NOT set Content-Type header (browser sets multipart boundary)
)

describe('401 handling', () => {
  - clears token from localStorage on 401
  - sets window.location.href to /login
  - throws ApiError with status 401
)

describe('204 handling', () => {
  - returns undefined for 204 No Content responses
)

describe('ApiError', () => {
  - has name 'ApiError'
  - has status property
  - has message property
)
```

- [ ] **Step 2: Mock strategy**

- Mock `global.fetch` with `vi.fn()`.
- `localStorage` works natively in jsdom.
- **`window.location.href`:** Same stub strategy as Task 3 — `vi.stubGlobal('location', ...)`.
- Clear localStorage in `beforeEach` to prevent token leakage between tests.

- [ ] **Step 3: Run tests, verify all pass**

**Acceptance criteria:**
- All API client methods covered
- 401/404/network error edge cases tested
- Token management verified

---

### Task 5: Write tests for Login page

**Files:**
- Create: `frontend/src/pages/__tests__/Login.test.tsx`

**Context:** `src/pages/Login.tsx` renders a form with username/password inputs and a submit button. Uses `useAuth().login()` and `useNavigate()`. Displays error on failure.

- [ ] **Step 1: Create test file with these cases**

```
describe('Login page', () => {
  - renders username and password input fields
  - renders "Sign in" submit button
  - calls login with username and password on form submit
  - shows "Signing in..." during submission
  - navigates to /sources on successful login
  - displays error message on failed login
  - clears error when re-submitting
)
```

- [ ] **Step 2: Mock strategy**

- Mock `useAuth` hook — don't use the real AuthProvider (avoid fetch calls):
  ```typescript
  vi.mock('../hooks/useAuth', () => ({
    useAuth: vi.fn(),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  }))
  ```
- Import `useAuth` and cast to `Mock` to control return values per test.
- Use the custom `render` from `test-utils.tsx` (provides Router, QueryClient, SearchProvider).
- Use `@testing-library/user-event` for typing into inputs and clicking submit.
- Query by `role` and `labelText` for accessibility: `screen.getByRole('textbox', { name: /username/i })`, `screen.getByLabelText(/password/i)`, `screen.getByRole('button', { name: /sign in/i })`.

- [ ] **Step 3: Run tests, verify all pass**

**Acceptance criteria:**
- Form rendering, submission, success navigation, and error display all tested
- Uses accessible queries (`getByRole`, `getByLabelText`)

---

### Task 6: Write tests for Dashboard page

**Files:**
- Create: `frontend/src/pages/__tests__/Dashboard.test.tsx`

**Context:** `src/pages/Dashboard.tsx` fetches `/api/dashboard/stats` via TanStack Query, renders stat cards, pipeline stages, and next actions. Also has an ML section gated behind `user.role === 'admin'`. Uses `useAuth` and `useMatchingNotifications`.

- [ ] **Step 1: Create test file with these cases**

```
describe('Dashboard page', () => {
  - renders loading state (shimmer skeleton) while fetching
  - renders stat cards with correct values after data loads
  - renders pipeline stage cards
  - renders next-action cards when pending review exists
  - shows ML section for admin users
  - hides ML section for non-admin users
)
```

- [ ] **Step 2: Mock strategy**

- Mock `useAuth` to return a controlled user object (with role).
- Mock `global.fetch` to return dashboard stats JSON.
- Mock `useMatchingNotifications` to return no-op values (prevents WebSocket connection).
- Use the custom `render` from `test-utils.tsx`.
- Use `waitFor` or `findByText` for async content after TanStack Query resolves.

Example mock dashboard response:
```typescript
const mockStats = {
  total_sources: 3,
  total_staged: 150,
  total_pending: 25,
  total_confirmed: 80,
  total_rejected: 10,
  total_unified: 60,
  total_singletons: 15,
  recent_batches: [],
}
```

- [ ] **Step 3: Run tests, verify all pass**

**Acceptance criteria:**
- Loading/loaded states tested
- Admin-gated ML section tested for both admin and non-admin
- No WebSocket connections opened in tests

---

### Task 7: Write tests for ReviewQueue page

**Files:**
- Create: `frontend/src/pages/__tests__/ReviewQueue.test.tsx`

**Context:** `src/pages/ReviewQueue.tsx` fetches `/api/review/queue`, `/api/review/stats`, and `/api/sources`. Renders a table of match candidates with confidence badges, status badges, and signal labels. Uses `useSearch()` for client-side filtering. Has pagination.

- [ ] **Step 1: Create test file with these cases**

```
describe('ReviewQueue page', () => {
  - renders loading skeleton while fetching
  - renders "No candidates found" when queue is empty
  - renders candidate rows with supplier names
  - renders confidence badges with correct colors (high/mid/low)
  - renders status badges
  - filters by search query from SearchContext
  - navigates to /review/:id when clicking a row
  - renders pagination when total > pageSize
)
```

- [ ] **Step 2: Mock strategy**

- Mock `global.fetch` to handle three endpoints: `/api/review/queue`, `/api/review/stats`, `/api/sources`.
- Use the custom `render` from `test-utils.tsx` (provides SearchProvider).
- To test search filtering: access the SearchContext by rendering a helper component that calls `useSearch().setQuery()`.
- Use `@testing-library/user-event` for click events.
- Mock `useNavigate` from react-router to verify navigation.

Example mock queue response:
```typescript
const mockQueue = {
  items: [
    {
      id: 1,
      supplier_a_name: 'Acme Corp',
      supplier_b_name: 'ACME Corporation',
      supplier_a_source: 'SAP',
      supplier_b_source: 'Oracle',
      confidence: 0.92,
      status: 'pending',
      match_signals: { jaro_winkler: 0.95, token_jaccard: 0.88 },
    },
  ],
  total: 1,
}
```

- [ ] **Step 3: Run tests, verify all pass**

**Acceptance criteria:**
- Loading, empty, and populated states tested
- Search filtering verified
- Navigation on row click verified

---

### Task 8: Add frontend tests to CI + Makefile

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `Makefile`

- [ ] **Step 1: Add `frontend-test` job to CI**

Add after the `frontend-build` job in `.github/workflows/ci.yml`:

```yaml
  frontend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run test
```

- [ ] **Step 2: Add `test-ui` target to Makefile**

Add after the existing `lint-ui` target:

```makefile
test-ui:
	cd frontend && npm run test
```

Also add `test-ui` to the `.PHONY` declaration at the top.

- [ ] **Step 3: Verify**

Run `make test-ui` locally — should exit 0 with all tests passing.

**Acceptance criteria:**
- `frontend-test` job in CI runs on push/PR to master
- `make test-ui` works locally

---

### Task 9: Create CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md` (project root)

- [ ] **Step 1: Create file with these sections**

1. **Prerequisites** — Python 3.12, Node.js 22, Docker
2. **Local Setup** — Reference CLAUDE.md setup steps (backend venv, frontend npm install, docker-compose for DBs)
3. **Branch Naming** — `feat/description`, `fix/description`, `refactor/description`
4. **Commit Messages** — Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
5. **Running Tests** — Backend: `cd backend && pytest`, Frontend: `cd frontend && npm test`
6. **Code Style** — Backend: Ruff (check + format), Frontend: ESLint
7. **PR Guidelines** — Description required, CI must pass, review required

Keep concise — ~100 lines max.

**Acceptance criteria:**
- New contributors can onboard by reading CONTRIBUTING.md
- No duplication of CLAUDE.md content (reference it instead)

---

### Task 10: Create CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md` (project root)

- [ ] **Step 1: Create file following Keep a Changelog format**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- RBAC with admin/reviewer/viewer roles and `require_role()` gating (Phase 3)
- User management endpoints: CRUD, toggle-active, change-password (Phase 3)
- Pagination on ReviewQueue and UnifiedSuppliers (Phase 3)
- Client-side search with Ctrl+K shortcut (Phase 3)
- Notification center with sessionStorage persistence (Phase 3)
- Signal labels on ReviewQueue list rows (Phase 3)
- ML retraining UI on Dashboard for admin users (Phase 3)
- Frontend test suite: Vitest, Testing Library, useAuth/client/page tests (Phase 4)
- CI job for frontend tests (Phase 4)
- CONTRIBUTING.md and CHANGELOG.md (Phase 4)

### Fixed
- Re-upload dialog now shows real staged/pending counts instead of zeros (Phase 3)

### Changed
- Security headers middleware on all API responses (Phase 2)
- Rate limiting on auth endpoints (Phase 2)

## [0.1.0] - 2026-03-27

### Added
- Initial release: CSV upload, multi-signal matching engine, human review, unified supplier merge
- Backend: FastAPI, SQLAlchemy, Celery, pgvector blocking
- Frontend: React 19, TypeScript, TanStack Query, Tailwind CSS v4
- WebSocket real-time notifications
- Field-level provenance tracking
- CI pipeline: backend lint/test, frontend lint/build
```

**Acceptance criteria:**
- CHANGELOG.md exists and documents all phases completed to date

---

### Task 11: Final verification

- [ ] **Step 1:** Run `cd frontend && npm run test` — all tests pass
- [ ] **Step 2:** Run `cd frontend && npm run build` — build succeeds
- [ ] **Step 3:** Run `cd frontend && npm run lint` — no errors
- [ ] **Step 4:** Run `cd frontend && npx tsc -b` — no type errors
- [ ] **Step 5:** Run `cd backend && python -m pytest -x -q` — all tests still pass
- [ ] **Step 6:** Verify `make test-ui` works
- [ ] **Step 7:** Commit all changes

**Acceptance criteria:**
- All frontend tests pass
- All backend tests still pass
- Build, lint, and type check clean
- CI config is valid
