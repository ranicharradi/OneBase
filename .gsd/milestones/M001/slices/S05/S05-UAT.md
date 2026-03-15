# S05: Unified Browse, Dashboard + Polish — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: Backend endpoints have 16 passing tests covering all happy paths and edge cases. Frontend pages need visual verification against a running stack for layout and interaction quality.

## Preconditions

- Docker Compose stack running (`docker compose up -d`)
- At least one data source configured (e.g., EOT)
- At least one file uploaded and ingestion completed
- At least one match candidate exists (from matching engine)
- At least one merge confirmed via Review page (produces a unified supplier)
- Admin user credentials available

## Smoke Test

1. Log in and verify the app redirects to `/dashboard`
2. Dashboard shows non-zero numbers in at least one stat card
3. Navigate to `/unified` — page loads without errors

## Test Cases

### 1. Dashboard displays correct operational stats

1. Navigate to `/dashboard`
2. Observe the four stat cards at the top
3. **Expected:** "Staged Suppliers" shows the count of active staged records. "Match Candidates" shows total candidates with group count. "Pending Review" shows pending count. "Unified Records" shows total with merged/singleton breakdown.

### 2. Dashboard review progress bars reflect actual state

1. On the dashboard, observe the "Review Progress" section
2. **Expected:** Progress bars for Confirmed, Rejected, Skipped, and Pending are shown. Percentages add up to 100%. Bar widths proportional to counts.

### 3. Dashboard recent activity shows audit entries

1. On the dashboard, observe the "Recent Activity" section
2. **Expected:** Shows up to 20 entries with color-coded action labels (e.g., "Merge confirmed" in green, "File uploaded" in green). Each entry shows relative timestamp ("5m ago", "2h ago").

### 4. Browse unified suppliers

1. Navigate to `/unified`
2. Observe the "Unified Records" tab is active
3. **Expected:** Table shows unified suppliers with Name, Code, Type, Currency, Sources count (badge), Origin (Merged/Singleton badge), and Created date. If merges have been confirmed, at least one row appears.

### 5. Search unified suppliers by name

1. On `/unified`, type a partial supplier name in the search box
2. **Expected:** Table filters to show only suppliers matching the search. Total count updates.

### 6. Filter unified by type (merged vs singleton)

1. On `/unified`, select "Merged" from the type dropdown
2. **Expected:** Only merged records shown (green "Merged" badge). Switch to "Singleton" — only singleton records shown (amber "Singleton" badge).

### 7. View unified supplier detail with provenance

1. On `/unified`, click on a merged supplier row
2. **Expected:** Navigates to `/unified/{id}`. Shows supplier name as heading with "Merged" badge. Fields & Provenance section shows each canonical field with its value and a provenance badge showing source entity name and auto/manual indicator. Source Records section shows the two (or more) staged suppliers that were merged, with their source entity initials.

### 8. View merge history / audit trail on detail page

1. On a unified supplier detail page, observe the "Audit Trail" sidebar
2. **Expected:** Shows the "Merge confirmed" entry with conflict count. If the match was first skipped then merged, both entries appear in chronological order.

### 9. List singleton candidates

1. Navigate to `/unified` and click the "Singletons" tab
2. **Expected:** Shows staged suppliers that are NOT part of any match candidate pair and NOT already unified. Each row shows name, code, source entity, currency, and a "Promote" button.

### 10. Promote a single singleton

1. On the Singletons tab, click "Promote" on a supplier
2. **Expected:** Supplier disappears from the singletons list. Switching to the "Unified Records" tab shows the supplier with a "Singleton" badge. The dashboard Unified Records count increments.

### 11. Bulk promote singletons

1. On the Singletons tab, check multiple checkboxes (or "Select All")
2. Click "Promote N selected" button
3. **Expected:** All selected suppliers are promoted. Singletons tab count decreases. Unified Records tab shows them with "Singleton" badges.

### 12. View promoted singleton detail

1. After promoting a singleton, navigate to its detail page
2. **Expected:** Shows "Singleton" badge. All fields show provenance from the single source with "auto" indicator. Source Records shows one source record. Audit trail shows "Singleton promoted" entry.

### 13. Export unified suppliers as CSV

1. On `/unified`, click "Export CSV" button
2. **Expected:** Browser downloads a CSV file named `unified_suppliers_YYYYMMDD_HHMMSS.csv`. File contains header row with 19 columns (7 data + 5 metadata + 7 provenance source columns). Each unified supplier has a row with correct data values and provenance source annotations (e.g., "EOT (auto)", "EOT + TTEI (auto)").

### 14. Export with empty unified database

1. With no unified suppliers, click "Export CSV"
2. **Expected:** Downloads a CSV with only the header row (no data rows).

## Edge Cases

### Empty state displays

1. With no data in the system, visit `/dashboard` and `/unified`
2. **Expected:** Dashboard shows all zeros, no errors. Unified table shows "No unified suppliers yet" empty state. Singletons shows "All suppliers are matched or unified" if no singletons exist.

### Already-unified guard on promotion

1. Attempt to promote a supplier that is already part of a unified record (e.g., via direct API call)
2. **Expected:** Returns 400 error: "Supplier already exists in unified database"

### Superseded supplier cannot be promoted

1. Re-upload a file for a data source (superseding old records), then try to promote an old (superseded) supplier
2. **Expected:** Returns 400 error: "Supplier is superseded, cannot promote"

## Failure Signals

- Dashboard stat cards show incorrect numbers (e.g., total_staged doesn't match actual active staged count)
- Unified browse table doesn't show newly merged/promoted suppliers
- Provenance badges show "Unknown" for source entity
- Export CSV is empty or has malformed rows
- Singleton tab includes suppliers that are already in match candidate pairs
- Clicking a unified supplier row navigates to 404

## Requirements Proved By This UAT

- UNIF-03 — Test cases 4, 5, 6, 7 (browse with provenance badges)
- UNIF-04 — Test cases 7, 8 (provenance detail + merge history)
- UNIF-05 — Test cases 9, 10, 11, 12 (singleton detection + promotion)
- UNIF-06 — Test cases 13, 14 (CSV export with provenance)
- OPS-01 — Test cases 1, 2, 3 (dashboard stats + activity)

## Not Proven By This UAT

- Performance under full 5K supplier load (tested with small datasets only)
- WebSocket notifications reaching the dashboard (dashboard uses polling, not WebSocket push)
- Excel export format (CSV only in MVP)
- Multi-way group merge (deferred — pairwise merge only)

## Notes for Tester

- Dashboard auto-refreshes every 30 seconds — stats update after actions without manual reload
- The singletons list is dynamic — promoting a singleton removes it from the list immediately (React Query cache invalidation)
- The default landing page is now `/dashboard` (changed from `/sources`)
- Export filename includes UTC timestamp — useful for versioning
- The "Sources" count badge on unified rows shows how many staged suppliers were merged (2 for a merge, 1 for a singleton)
