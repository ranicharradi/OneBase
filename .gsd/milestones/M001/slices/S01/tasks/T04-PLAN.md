# T04: 01-foundation-ingestion-pipeline 04

**Slice:** S01 — **Milestone:** M001

## Description

Build the complete upload experience: drag-and-drop file upload, column mapper for new sources, real-time pipeline progress tracker, re-upload confirmation dialog, and batch history.

Purpose: This is the primary user interaction for getting data into the system. The upload page is the most complex UI in Phase 1, combining file upload, dynamic column mapping, real-time progress feedback, and re-upload lifecycle — all per the user's locked decisions from CONTEXT.md.
Output: Fully functional upload page where users can upload CSV files, map columns for new sources, watch processing progress in real-time, and manage re-uploads with impact awareness.

## Must-Haves

- [ ] "User sees a drag-and-drop zone with 'Browse files' button on the Upload page"
- [ ] "User can select an existing source or choose 'New source' before uploading"
- [ ] "For new sources, after uploading the column mapper shows actual CSV headers in dropdowns"
- [ ] "After upload, the drop zone transforms into a progress tracker showing pipeline stages"
- [ ] "Progress tracker shows real-time stages: parsing → normalizing → embedding → matching enqueued"
- [ ] "Data quality warnings shown after parsing with expandable details"
- [ ] "Re-upload for existing source shows confirmation dialog with record counts and match impact"
- [ ] "Batch history visible under data source showing previous uploads with status"

## Files

- `frontend/src/pages/Upload.tsx`
- `frontend/src/components/DropZone.tsx`
- `frontend/src/components/ProgressTracker.tsx`
- `frontend/src/components/ColumnMapper.tsx`
- `frontend/src/components/ReUploadDialog.tsx`
- `frontend/src/components/BatchHistory.tsx`
- `frontend/src/hooks/useTaskStatus.ts`
- `frontend/src/api/types.ts`
