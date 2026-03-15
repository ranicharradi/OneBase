# T03: 1.1-design-polish 03

**Slice:** S02 — **Milestone:** M001

## Description

Apply the design system to the entire upload experience — the Upload page orchestrator and all five upload-related components. This is the most interaction-rich part of the UI: drag-and-drop, multi-step wizard, real-time progress, confirmation dialogs, and history tables.

Purpose: The upload flow is the core user workflow. Drag-and-drop, column mapping, and progress tracking need to feel responsive and polished. These components have the most motion/interaction opportunities.
Output: Redesigned Upload.tsx and all 5 upload components with distinctive styling matching the Plan 01 design system.

## Must-Haves

- [ ] "Upload page uses the design system from Plan 01 — consistent visual language"
- [ ] "DropZone has atmospheric drag-over state with animation — not just a border color change"
- [ ] "ProgressTracker pipeline stages feel alive — animated transitions between stages, not static icons"
- [ ] "ColumnMapper wizard steps have visual polish — progress indicator, transitions between steps"
- [ ] "BatchHistory table matches the Users page table design language"

## Files

- `frontend/src/pages/Upload.tsx`
- `frontend/src/components/DropZone.tsx`
- `frontend/src/components/ColumnMapper.tsx`
- `frontend/src/components/ProgressTracker.tsx`
- `frontend/src/components/ReUploadDialog.tsx`
- `frontend/src/components/BatchHistory.tsx`
