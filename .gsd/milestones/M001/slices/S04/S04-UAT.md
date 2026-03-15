# S04: Review Merge — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: mixed (artifact-driven for API logic, live-runtime for UI)
- Why this mode is sufficient: Backend verified with 17 automated tests covering all endpoints and merge logic; frontend requires visual verification against running app with seeded data

## Preconditions

1. Docker Compose stack running (`docker compose up -d`)
2. Database migrated through revision 003 (`alembic upgrade head`)
3. At least two data sources configured (e.g., EOT and TTEI)
4. CSV files uploaded and ingested for both sources
5. Matching pipeline has completed — at least 1 pending match candidate exists
6. User authenticated (login with valid credentials)

## Smoke Test

Navigate to `/review` in the browser. Confirm the review queue loads with at least one row showing supplier names, confidence percentage, and "pending" status badge.

## Test Cases

### 1. Review Queue Loads with Stats

1. Navigate to `/review`
2. Observe the stats bar at the top
3. **Expected:** Five stat cards showing Pending, Confirmed, Rejected, Skipped, and Unified counts. Pending count ≥ 1.

### 2. Review Queue Displays Candidates Sorted by Confidence

1. On the review queue page, observe the table rows
2. **Expected:** Candidates listed with highest confidence first. Each row shows supplier A name + source, supplier B name + source, confidence badge (colored by tier: green ≥85%, amber ≥65%, red <65%), status badge, and "Review →" link.

### 3. Filter by Status

1. Change the Status dropdown to "All"
2. **Expected:** All candidates shown regardless of status
3. Change to "Confirmed"
4. **Expected:** Only confirmed candidates shown (or empty state if none confirmed yet)

### 4. Filter by Confidence Range

1. Set Min Confidence to 0.8
2. **Expected:** Only candidates with confidence ≥ 80% appear
3. Set Max Confidence to 0.7
4. **Expected:** No candidates shown (min > max creates empty result)
5. Clear Min Confidence, keep Max Confidence at 0.7
6. **Expected:** Only candidates with confidence ≤ 70% shown

### 5. Filter by Source Entity

1. Select a specific source (e.g., "EOT") from the Source Entity dropdown
2. **Expected:** Only candidates where at least one supplier belongs to the selected source appear

### 6. Match Detail — Side-by-Side Comparison

1. Click on a pending candidate row (or the "Review →" link)
2. **Expected:** Navigates to `/review/{id}` showing:
   - Back arrow (← link to queue)
   - Candidate header with ID and source pair
   - Confidence ring (animated circle with percentage)
   - Signal breakdown (6 bars: Jaro-Winkler, Token Jaccard, Embedding Cosine, Short Name, Currency, Contact)
   - Field comparison table with 7 rows

### 7. Field Conflict Highlighting

1. On the match detail page, examine the field comparison table
2. **Expected:**
   - Identical fields show green checkmark indicator, same value on both sides
   - Conflicting fields show amber warning triangle, different values, and radio button selectors
   - Source-only fields show arrow indicator, value on one side only, dash on the other

### 8. Resolve Conflicts and Merge

1. For each conflicting field (amber rows with radio buttons), click to select the preferred value
2. Observe the conflict progress counter below the table: "X/Y conflicts resolved"
3. After resolving all conflicts, the "Confirm Merge" button becomes active
4. Click "Confirm Merge"
5. **Expected:**
   - Button shows "Merging…" briefly
   - Page refreshes showing "confirmed" status badge
   - Green success banner: "This match has been merged into a unified supplier record"
   - Merge and reject/skip buttons disappear

### 9. Verify Merged Golden Record via API

1. After merging, call `GET /api/review/stats`
2. **Expected:** `total_unified` incremented by 1, `total_confirmed` incremented by 1, `total_pending` decremented by 1

### 10. Reject a Match

1. Return to queue, click into a different pending candidate
2. Click "Reject"
3. **Expected:**
   - Status changes to "rejected"
   - Reject/merge/skip buttons disappear
   - Candidate appears in queue under "Rejected" filter

### 11. Skip a Match

1. Return to queue, click into another pending candidate
2. Click "Skip"
3. **Expected:**
   - Status changes to "skipped"
   - Candidate appears in queue under "Skipped" filter

### 12. Cannot Double-Action

1. Navigate directly to a confirmed candidate's detail page (`/review/{id}`)
2. **Expected:** No action buttons shown — only the status badge and success banner
3. Navigate to a rejected candidate's detail page
4. **Expected:** No merge or skip buttons — only the status badge

## Edge Cases

### Merge with All Identical Fields

1. Find (or create via API) a match candidate where both suppliers have identical values for all 7 canonical fields
2. Open the detail page
3. **Expected:** No conflict rows, no radio buttons. Conflict counter shows "No conflicts — all fields match or are source-only". Merge button is immediately active.
4. Click "Confirm Merge"
5. **Expected:** Golden record created with `auto: true` on all provenance entries

### Merge with Missing Field Selections (API Only)

1. Call `POST /api/review/candidates/{id}/merge` with empty `field_selections` on a candidate that has conflicts
2. **Expected:** 400 error with message "Missing field selection for conflicting field '{field}'"

### Confidence Boundary Filter

1. Call `GET /api/review/queue?min_confidence=0.9&max_confidence=0.9`
2. **Expected:** Only candidates with exactly 0.9 confidence (if any exist)

## Failure Signals

- Review queue returns 404 or empty when candidates exist → router not registered
- Match detail shows "not found" for valid candidate ID → DB query issue
- Merge button stays disabled after selecting all conflicts → frontend selection state bug
- Merge succeeds but stats don't update → query invalidation not working
- Field comparison shows wrong conflict/identical flags → compare_fields() logic error
- Provenance missing source_entity or chosen_by → execute_merge() serialization bug

## Requirements Proved By This UAT

- REVW-01 — Review queue displays pending candidates sorted by confidence (Test 2)
- REVW-02 — Source pair and confidence range filters work (Tests 4, 5)
- REVW-03 — Side-by-side detail with signal breakdowns (Test 6)
- REVW-04 — Field-level conflict highlighting with visual indicators (Test 7)
- REVW-05 — Radio buttons for conflict resolution (Test 8)
- REVW-06 — Merge, reject, and skip actions work (Tests 8, 10, 11)
- REVW-07 — Identical fields auto-included (Edge Case: All Identical Fields)
- REVW-08 — Source-only fields auto-included with source label (Test 7)
- UNIF-01 — Merge creates golden record (Test 9)
- UNIF-02 — Provenance on every field (Test 9 + Edge Case: All Identical)

## Not Proven By This UAT

- UNIF-03 — Browse unified suppliers with provenance badges (deferred to S05)
- UNIF-04 — Merge history / audit trail UI (deferred to S05)
- UNIF-05 — Singleton promotion (deferred to S05)
- Multi-way group merges (3+ suppliers) — only pairwise covered
- Performance under load (offset pagination with 5K+ candidates)

## Notes for Tester

- The matching pipeline must have completed at least once before testing — review queue will be empty otherwise
- Best tested with real Sage X3 CSV data that produces natural conflicts (e.g., "ACME CORP" vs "ACME CORPORATION", different currencies)
- If no conflicts exist in your data, you can merge immediately — the "no conflicts" happy path is valid
- The audit trail (audit_log table) records merge_confirmed, match_rejected, match_skipped — check via DB or future dashboard
- Stats endpoint is the quickest way to verify merge went through: `curl -H "Authorization: Bearer $TOKEN" localhost:8000/api/review/stats`
