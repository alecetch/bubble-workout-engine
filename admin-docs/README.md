# Doc Admin Board

Internal sprint-board–style admin tool for managing the docs workflow.

**Dev-only. Never deployed. Not connected to production.**

---

## Quick start

```bash
cd admin-docs
npm install
cp .env.example .env
# Edit .env — set DOC_ADMIN_DB_URL and optionally DOCS_ROOT

# One-time DB setup (see below)
psql -h localhost -U postgres -c "CREATE DATABASE doc_admin;"
psql -h localhost -U postgres -d doc_admin -f db/bootstrap.sql

npm run dev   # or npm start
# Open http://localhost:3001
```

---

## Database setup — Flyway safety

This tool uses a **separate local Postgres database** (`doc_admin`), completely isolated from the main application database.

| | Main app DB | Admin tool DB |
|---|---|---|
| Database name | `workout` | `doc_admin` |
| Managed by | Flyway (`migrations/`) | Manual bootstrap only |
| In production | ✅ Yes | ❌ Never |
| Schema | `public` | `public` (in separate DB) |

**Why this is safe:**
- Flyway is configured to migrate the `workout` database. It has no knowledge of `doc_admin`.
- `db/bootstrap.sql` is **never** in the `migrations/` directory and is **never** referenced by any Flyway config.
- The `DOC_ADMIN_DB_URL` connection string points to `doc_admin`, not `workout`.
- Running `docker compose down -v` destroys the `doc_admin` database along with `workout`. This is fine — the filesystem is the source of truth, and running `npm start` will re-reconcile all board items from scratch. You lose manual status/ordering state, but not any documents.

### Bootstrap commands

```bash
# Connect as a Postgres superuser (default for local Docker setup):
psql -h localhost -U postgres -c "CREATE DATABASE doc_admin;"
psql -h localhost -U postgres -d doc_admin -f admin-docs/db/bootstrap.sql

# If your local superuser is different (check docker-compose.yml):
psql -h localhost -U <superuser> -c "CREATE DATABASE doc_admin;"
psql -h localhost -U <superuser> -d doc_admin -f admin-docs/db/bootstrap.sql
```

After this, `DOC_ADMIN_DB_URL=postgresql://workout:workout@localhost:5432/doc_admin` should work (the `workout` user can connect to `doc_admin` once the DB exists).

---

## How filename matching works

Each spec and prompt file is mapped to a canonical `doc_key` by stripping known prefixes and suffixes:

**Spec → doc_key:**
```
feature-1-post-onboarding-ux-spec.md     → feature-1-post-onboarding-ux
spec-admin-preview-progression-tab.md    → admin-preview-progression-tab
preview-csv-export-spec.md               → preview-csv-export
exercise-catalogue-duplicate-cleanup-plan.md → exercise-catalogue-duplicate-cleanup-plan
```
Logic: strip `.md` extension, then strip leading `spec-` and trailing `-spec`.

**Prompt → doc_key:**
```
codex-prompts-feature-1-post-onboarding-ux.md → feature-1-post-onboarding-ux
codex-prompts-preview-csv-export.md            → preview-csv-export
codex-prompts-variability-feature.txt          → variability-feature
```
Logic: strip `.md`/`.txt` extension, then strip leading `codex-prompts-`.

Matching is performed by joining on `doc_key`. Prompts with no matching spec are logged as **orphan prompts** (warning only, not inserted).

The matching logic lives in `lib/keyMatcher.js` and is easy to adjust.

---

## How reconciliation works

Reconciliation runs automatically on startup and can be triggered manually via the **↻ Reconcile** button in the UI (or `POST /api/reconcile`).

**On each reconcile:**

1. Scans `docs/specs/` to find all spec files
2. Scans `docs/prompts/active/` and `docs/prompts/done/` to find all prompts
3. Builds a `doc_key` for each file and joins them
4. Compares with existing Postgres rows:
   - **New spec** (not in DB): inserted with status based on prompt presence:
     - prompt in `done/` → `done`
     - prompt in `active/` → `prompt_active`
     - no prompt → `backlog`
   - **Existing spec** (in DB): `prompt_filename` is updated if the filesystem changed; **status is not changed automatically**
5. Orphan prompts (no matching spec) are logged as warnings

**Source of truth:**
- Filesystem: file existence, prompt location (active vs done)
- Postgres: status, priority ordering, manual workflow state

---

## How "Mark Done" works

When you click **✓ Mark Done** on a card:

1. The server fetches the item's `prompt_filename` from Postgres
2. It attempts to move the file from `docs/prompts/active/<filename>` to `docs/prompts/done/<filename>`
   - If the file is already in `done/`, this is treated as a no-op (graceful)
   - If the file is missing from both locations, the action fails with an error
3. The Postgres status is updated to `done`
4. The board refreshes

**If the file move succeeds but the DB update fails:** a clear error is logged to the server console with the exact SQL to run manually for correction.

---

## Workflow

```
docs/specs/ file appears
        ↓
   [Backlog]  ← auto-detected on reconcile
        ↓  drag or Prioritise button
  [Prioritised]
        ↓  drag or button (when prompt exists in active/)
  [Prompt Active]
        ↓  drag or → Testing button
  [Needs Testing]
        ↓  ✓ Mark Done  ← moves prompt file to done/
     [Done]
```

Items can be moved freely between columns by drag-and-drop. Priority within each column is controlled by drag-and-drop ordering and persisted in Postgres.

---

## Status model

| Status | Meaning |
|---|---|
| `backlog` | Newly detected spec, not yet prioritised |
| `prioritised` | In the ordered priority list, no prompt exists yet |
| `prompt_active` | Matching prompt exists in `docs/prompts/active/` |
| `needs_testing` | Implementation done, awaiting manual QA |
| `done` | Prompt moved to `done/`, feature complete |

---

## File structure

```
admin-docs/
├── server.js              # Express entry point; runs reconcile on startup
├── package.json
├── .env.example           # Copy to .env
├── db/
│   ├── bootstrap.sql      # One-time DB setup — NEVER in migrations/
│   └── pool.js            # pg Pool for doc_admin database
├── lib/
│   ├── config.js          # DOCS_ROOT resolution
│   ├── keyMatcher.js      # Filename → doc_key extraction and map building
│   ├── fileOps.js         # movePromptToDone() filesystem operation
│   └── reconcile.js       # Startup sync: filesystem → Postgres
├── routes/
│   ├── board.js           # GET /api/board
│   ├── items.js           # PATCH /api/items/:id/move, POST /api/items/:id/mark-done
│   └── reconcileRoute.js  # POST /api/reconcile
└── public/
    └── index.html         # Single-page board UI (vanilla JS, no build step)
```

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/board` | Full board state grouped by column |
| `PATCH` | `/api/items/:id/move` | Move item to a column/position. Body: `{ status, beforeId? }` |
| `POST` | `/api/items/:id/mark-done` | Move prompt file to done/ and set status=done |
| `POST` | `/api/reconcile` | Re-scan filesystem and sync to Postgres |
| `GET` | `/api/docs/view?file=specs/foo.md` | Return raw markdown content for preview |
| `GET` | `/api/health` | DB connectivity check |
