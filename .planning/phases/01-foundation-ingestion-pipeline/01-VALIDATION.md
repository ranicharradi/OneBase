---
phase: 1
slug: foundation-ingestion-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + httpx (for async test client) |
| **Config file** | `backend/pytest.ini` — Wave 0 |
| **Quick run command** | `pytest backend/tests/ -x --tb=short` |
| **Full suite command** | `pytest backend/tests/ -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest backend/tests/ -x --tb=short`
- **After every plan wave:** Run `pytest backend/tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INGS-02 | unit | `pytest backend/tests/test_csv_parser.py -x` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INGS-04 | unit | `pytest backend/tests/test_normalization.py -x` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | OPS-03 | integration | `pytest backend/tests/test_auth.py -x` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | OPS-04 | integration | `pytest backend/tests/test_audit.py -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | INGS-01, INGS-06 | integration | `pytest backend/tests/test_upload.py -x` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | INGS-03, OPS-02 | integration | `pytest backend/tests/test_sources.py -x` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | INGS-05 | unit | `pytest backend/tests/test_embedding.py -x` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | INGS-07 | integration | `pytest backend/tests/test_reupload.py -x` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | INGS-08 | unit | `pytest backend/tests/test_ingestion_task.py::test_matching_enqueued -x` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | OPS-06 | manual-only | Visual inspection via browser | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/pytest.ini` — pytest configuration
- [ ] `backend/tests/conftest.py` — shared fixtures (test DB session, test client, sample CSV files)
- [ ] `backend/tests/test_csv_parser.py` — covers INGS-02
- [ ] `backend/tests/test_normalization.py` — covers INGS-04
- [ ] `backend/tests/test_auth.py` — covers OPS-03
- [ ] `backend/tests/test_audit.py` — covers OPS-04
- [ ] `backend/tests/test_sources.py` — covers INGS-03, OPS-02
- [ ] `backend/tests/test_upload.py` — covers INGS-01, INGS-06
- [ ] `backend/tests/test_embedding.py` — covers INGS-05
- [ ] `backend/tests/test_reupload.py` — covers INGS-07
- [ ] `backend/tests/test_ingestion_task.py` — covers INGS-08
- [ ] Framework install: `pip install pytest httpx` (included in requirements.txt)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UI pages render with dark theme, production-grade styling | OPS-06 | Visual quality assessment | Load each page in browser, verify dark theme, responsive layout, professional design |
| Upload progress tracker shows real-time stages | INGS-01 (UI aspect) | Animation/timing visual check | Upload a CSV file and watch the progress tracker transition through stages |
| Column mapper shows actual CSV headers in dropdowns | INGS-03 (UI aspect) | Interactive UI flow | Upload a new source CSV, verify the mapper populates with real headers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
