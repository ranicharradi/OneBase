# Phase 1: Foundation + Ingestion Pipeline - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Docker environment, database schema with pgvector, basic auth, CSV upload with parsing/normalization/embedding, data source management with column mappings, re-upload lifecycle, and audit trail. Users can upload supplier CSV files and see them parsed, normalized, and stored with embeddings on a running Docker environment with authentication.

</domain>

<decisions>
## Implementation Decisions

### Upload & processing feedback
- Step-by-step progress display: user sees real-time stages (parsing → normalizing → computing embeddings) with counts/percentages
- Progress displays inline on the upload page — the upload area transforms into a progress tracker, no page navigation
- Drag-and-drop zone with a "Browse files" button inside it (both methods available)
- Data quality warnings shown as a summary after parsing: "1,623 rows parsed. 12 rows had warnings." Expandable to see details. Processing continues regardless
- Matching is auto-enqueued as the final stage in the progress tracker (parse → normalize → embed → matching enqueued)

### Column mapping workflow
- Visual mapper interface: left column shows canonical fields, right column shows dropdowns populated with actual CSV headers from the uploaded file
- Upload-first flow for new sources: user uploads a file, system detects it's a new source, prompts to create source and map columns using actual headers from the file
- For existing sources: dropdown to select existing source or "New source" before uploading. Known sources skip the mapping step
- Required fields: supplier_name and supplier_code must be mapped. All other canonical fields (short_name, currency, payment_terms, contact_name, supplier_type) are optional

### Re-upload experience
- Confirmation dialog before superseding: shows counts of affected records ("EOT already has 1,623 staged suppliers from batch #3. Uploading will supersede those records and invalidate 42 pending match candidates. Continue?")
- Batch history visible under data source — user can see all previous uploads, row counts, timestamps, and superseded status. Read-only, no rollback
- Invalidated match candidates are auto-removed from the review queue (not greyed out). Count shown in re-upload result summary
- Matching auto-triggers after re-upload ingestion completes

### Initial setup & seeding
- First user account created via environment variables in docker-compose (no default credentials)
- Additional users added via a simple user management page in the UI — any logged-in user can create new users (all users are equal, no admin role)
- Blank slate for data sources — no pre-seeded EOT/TTEI configurations. User creates all data sources from scratch through the UI
- Database schema auto-migrates on container startup via Alembic (tables, pgvector extension, indexes created automatically)

### Claude's Discretion
- Loading skeleton and transition animations during processing
- Exact layout and spacing of the visual column mapper
- Error state design (network failures, invalid file formats)
- Audit trail storage format and what actions to log beyond the obvious (uploads, user creation)
- Session management approach (JWT vs session cookies)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- No existing code — greenfield project
- Design document (`2026-03-11-onebase-supplier-unification-design.md`) provides detailed data model, API routes, and architecture

### Established Patterns
- No patterns established yet — Phase 1 sets the conventions
- Design doc specifies: FastAPI backend, SQLAlchemy ORM, Celery + Redis for async tasks, React frontend, Docker Compose deployment

### Integration Points
- Docker Compose orchestrates all services (api, worker, frontend, postgres, redis)
- Celery worker shares codebase with API server
- pgvector extension needed in PostgreSQL for embedding storage
- all-MiniLM-L6-v2 model (80MB) should be pre-downloaded during Docker build

</code_context>

<specifics>
## Specific Ideas

- Upload-first source creation: the column mapping dropdown should show the actual CSV headers from the file the user just uploaded, making it easy to map without knowing column names in advance
- The re-upload confirmation dialog should show concrete impact numbers (record counts, pending match counts) so the user understands exactly what will change
- Processing progress should feel like a pipeline: each stage completes and the next begins, with the user watching it flow through

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-ingestion-pipeline*
*Context gathered: 2026-03-13*
