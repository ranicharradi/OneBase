# Auto Column Mapping & Auto Signal Selection — Changes Manifest

## Overview

Two features added:
1. **Auto column mapping**: Analyzes CSV data values to guess which column maps to which canonical field
2. **Auto signal selection**: Dynamically weights matching signals based on field coverage and cardinality

## Files Created

### `backend/app/services/column_guesser.py`
Column guesser service. Scores each CSV column against 7 canonical fields using data-value heuristics.

**Canonical fields and their detection logic:**

| Field | Scorer | Key Signals |
|-------|--------|-------------|
| `supplier_name` | `_score_supplier_name` | Longest avg text, company tokens (Inc/Ltd/Corp/etc.), ALL CAPS bonus, high uniqueness |
| `supplier_code` | `_score_supplier_code` | Short (2-15 chars), mixed alpha+digits (e.g., "FE661"), very high uniqueness |
| `short_name` | `_score_short_name` | Text shorter than supplier_name, moderate uniqueness |
| `currency` | `_score_currency` | Values match ISO 4217 set (USD, EUR, GBP...), ~3 char length |
| `payment_terms` | `_score_payment_terms` | Low cardinality (2-30 distinct), text codes |
| `contact_name` | `_score_contact_name` | Multi-word (2-4 words), Title Case, alpha-heavy, penalizes ALL CAPS |
| `supplier_type` | `_score_supplier_type` | Very low cardinality (<=10 distinct), short values (<=5 chars) |

**Assignment order** (priority-based to avoid ambiguity):
1. Currency (ISO codes are most distinctive)
2. Supplier name (longest text)
3. Supplier code (short + digits)
4. Short name (shorter than name)
5. Contact name (person patterns)
6. Supplier type (low cardinality)
7. Payment terms (medium cardinality)

**Entry point:** `guess_column_mapping(columns, sample_rows)` → returns dict of `{field: {column, confidence}}`

### `backend/tests/test_column_guesser.py`
13 unit tests covering each classifier, Sage X3 data, and edge cases.

## Files Modified

### `backend/app/schemas/source.py`
- Added `FieldGuess` schema (column + confidence)
- Added `GuessMappingResponse` schema (7 FieldGuess fields)

### `backend/app/routers/sources.py`
- Added import for `guess_column_mapping`, `FieldGuess`, `GuessMappingResponse`
- Added `POST /api/sources/guess-mapping` endpoint
  - Accepts `file` (upload) or `file_ref` (from previous match-source)
  - Samples up to 100 rows, auto-detects delimiter
  - Returns guessed mapping with per-field confidence

### `backend/app/services/scoring.py`
- Added `compute_signal_weights(suppliers)` function
  - Core signals (jaro_winkler, token_jaccard, embedding_cosine) always active
  - Optional signals (short_name_match, currency_match, contact_match) dropped if:
    - Field coverage < 20% (mostly null)
    - Single distinct value (no discriminative power)
  - Active weights normalized to sum to 1.0
- Modified `score_pair()` to accept optional `weights` parameter
  - Falls back to `settings.matching_weight_*` defaults when not provided

### `backend/app/services/matching.py`
- Added import for `compute_signal_weights`
- Before scoring loop: queries all active suppliers, computes dynamic weights
- Passes computed weights to `score_pair()` calls

### `backend/tests/test_scoring.py`
- Added import for `compute_signal_weights`
- Added `TestComputeSignalWeights` class with 6 tests:
  - All fields populated → normalized weights
  - Missing currency → signal dropped
  - Single value currency → signal dropped
  - Core signals always present
  - Empty list → defaults
  - score_pair accepts custom weights

### `frontend/src/api/types.ts`
- Added `FieldGuess` interface
- Added `GuessMappingResponse` interface

### `frontend/src/components/ColumnMapper.tsx`
- Added `guessedMapping` prop (optional `GuessMappingResponse`)
- Initializes dropdown selections from guessed values on mount
- Shows confidence badges next to pre-filled dropdowns:
  - Green "auto" badge: confidence > 70%
  - Yellow "guess" badge: confidence 40-70%
  - Gray "guess" badge: confidence < 40%
- Tooltip shows exact confidence percentage

### `frontend/src/pages/Upload.tsx`
- Added `GuessMappingResponse` import
- Extended `MAP_COLUMNS` state with optional `guessedMapping`
- Calls `POST /api/sources/guess-mapping` when transitioning to MAP_COLUMNS:
  - In `handleFileSelected` (no sources exist flow)
  - In "Create new source" button (PICK_SOURCE flow)
- Passes `guessedMapping` to `ColumnMapper` component

## Sage X3 Column Code Reference

These are the ERP field codes from the actual CSV data:

| Code | Meaning | Maps To |
|------|---------|---------|
| `BPSNUM_0` | Business Partner Supplier Number | `supplier_code` |
| `BPSNAM_0` | Business Partner Supplier Name | `supplier_name` |
| `BPSSHO_0` | Business Partner Short Name | `short_name` |
| `BPSTYP_0` | Business Partner Type | `supplier_type` |
| `CUR_0` | Currency | `currency` |
| `PTE_0` | Payment Terms | `payment_terms` |
| `CNTNAM_0` | Contact Name | `contact_name` |

## How to Adjust

**Tuning thresholds:** Edit `column_guesser.py`:
- `_MIN_SCORE = 0.15` — minimum score to assign a column (increase to be more conservative)
- Coverage threshold `0.3` — minimum non-empty ratio to consider a column

**Tuning signal weights:** Edit `scoring.py`:
- `_MIN_COVERAGE = 0.20` — minimum field coverage to include signal
- Default weights in `config.py` are the base before auto-normalization

**Adding new canonical fields:**
1. Add scorer function `_score_<field>()` in `column_guesser.py`
2. Add `_assign()` call in `guess_column_mapping()` at appropriate priority
3. Add field to `_ALL_FIELDS` list
4. Add to `ColumnMapping` schema, `StagedSupplier` model, etc.
