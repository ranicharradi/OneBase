# S02: Design Polish

**Goal:** Establish a distinctive design system and redesign the core shell (Layout + Login) following the frontend-design skill guidelines.
**Demo:** Establish a distinctive design system and redesign the core shell (Layout + Login) following the frontend-design skill guidelines.

## Must-Haves


## Tasks

- [x] **T01: 1.1-design-polish 01** `est:3min`
  - Establish a distinctive design system and redesign the core shell (Layout + Login) following the frontend-design skill guidelines. This plan replaces the generic "AI slop" aesthetic with a bold, intentionally crafted design language that all subsequent plans will follow.

Purpose: The frontend-design skill was not applied during Phase 1 execution, resulting in competent but generic UI. This plan creates the design foundation — typography, color, motion, spatial composition — that Plans 02 and 03 propagate to all remaining pages.
Output: Updated design system (app.css), font imports (index.html), redesigned app shell (Layout.tsx), and atmospheric login page (Login.tsx).
- [x] **T02: 1.1-design-polish 02** `est:5min`
  - Apply the design system established in Plan 01 to the Sources and Users management pages. These are the primary data management surfaces — they need to feel like premium tools, not generic CRUD templates.

Purpose: Sources and Users pages are the most-used after Login. They contain modals, tables, forms, toasts, and loading states — all need the design system treatment.
Output: Redesigned Sources.tsx and Users.tsx with distinctive styling consistent with the design language from Plan 01.
- [x] **T03: 1.1-design-polish 03** `est:5min`
  - Apply the design system to the entire upload experience — the Upload page orchestrator and all five upload-related components. This is the most interaction-rich part of the UI: drag-and-drop, multi-step wizard, real-time progress, confirmation dialogs, and history tables.

Purpose: The upload flow is the core user workflow. Drag-and-drop, column mapping, and progress tracking need to feel responsive and polished. These components have the most motion/interaction opportunities.
Output: Redesigned Upload.tsx and all 5 upload components with distinctive styling matching the Plan 01 design system.

## Files Likely Touched

- `frontend/index.html`
- `frontend/src/app.css`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Sources.tsx`
- `frontend/src/pages/Users.tsx`
- `frontend/src/pages/Upload.tsx`
- `frontend/src/components/DropZone.tsx`
- `frontend/src/components/ColumnMapper.tsx`
- `frontend/src/components/ProgressTracker.tsx`
- `frontend/src/components/ReUploadDialog.tsx`
- `frontend/src/components/BatchHistory.tsx`
