# T03: 01-foundation-ingestion-pipeline 03

**Slice:** S01 — **Milestone:** M001

## Description

Set up the React frontend from scratch with Vite + TypeScript + Tailwind CSS 4, create the app shell with dark theme, build the login flow, and implement the Sources and Users management pages.

Purpose: Users need a frontend to interact with the system. This plan creates the full app scaffold, authentication UX, and management pages (Sources + Users) that are prerequisites for the upload experience in Plan 04.
Output: Working React app with login, dark-themed app shell with sidebar navigation, data source CRUD page, and user management page.

## Must-Haves

- [ ] "User sees a login page when not authenticated"
- [ ] "User can log in with username/password and is redirected to the app"
- [ ] "Authenticated user sees a dark-themed app shell with sidebar navigation"
- [ ] "User can view, create, edit, and delete data sources from the Sources page"
- [ ] "User can view and create users from the Users page"
- [ ] "Invalid/expired JWT redirects to login"
- [ ] "All pages use production-grade dark theme styling"

## Files

- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/tsconfig.app.json`
- `frontend/tsconfig.node.json`
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/app.css`
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Sources.tsx`
- `frontend/src/pages/Users.tsx`
- `frontend/Dockerfile`
