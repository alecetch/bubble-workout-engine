# CLAUDE.md — Project conventions for AI assistants

## Git & PR conventions
- Always work on a fresh branch. Never commit directly to `main`.
- Branch naming: `feat/`, `fix/`, `hotfix/`, or `chore/` prefix + kebab-case description of the outcome (e.g. `feat/add-hero-media`, `fix/flyway-missing-state`)
- PR titles: outcome-focused, imperative mood (e.g. "Add hero media to program days", "Fix Flyway missing state error")
- One logical unit of work per PR. Don't bundle unrelated changes.
- Never merge a PR with failing CI. Fix tests on the branch before merging.
- Delete the branch after merging.

## Docs structure
All project documentation lives in `docs/` (gitignored). Subdirectories:
- `docs/specs/` — feature specs, design docs, technical specs (`*-spec.md`)
- `docs/prompts/active/` — codex/AI prompts not yet executed (`codex-prompts-*.md`)
- `docs/prompts/done/` — completed prompts (move here after the work is merged)
- `docs/reference/` — stable reference docs (architecture, DB schema, API contracts, etc.)
- `docs/planning/` — roadmap, vision, tickets
- `docs/ai/` — AI reviewer charters and meta-prompts

Naming convention: pair specs and prompts by feature number and slug, e.g.
- `docs/specs/feature-3-exercise-substitution-spec.md`
- `docs/prompts/active/codex-prompts-feature-3-exercise-substitution.md`

When a prompt is executed and the work is merged, move it from `prompts/active/` to `prompts/done/`. Also create a manual test plan in `docs/test_plans/` named `{doc_key}-test-plan.md` (e.g. `feature-3-exercise-substitution-test-plan.md`) covering API checks, mobile UI interactions, auth/isolation, loading/empty/error states, regression, and edge cases.

## Spec and prompt workflow

### Planning docs
High-level planning documents (roadmaps, feature lists, vision docs, tickets) live in `docs/planning/`. These are the source of truth for what features exist and what order they should be built in.

When the user asks to "create a detailed spec for feature X" or refers to "doc Y", look for the relevant planning document in `docs/planning/` first. Use it as the input for the detailed spec.

The detailed spec then goes into `docs/specs/` following the naming convention above.

### Writing a spec
When asked to write a spec for a new feature:
1. Look for the source material in `docs/planning/` first (the user will often refer to a doc or feature number there).
2. Create the spec file in `docs/specs/` following the naming convention above.
3. Write the spec and present it to the user.
4. Register the spec in the board database so it has full lineage. Run:
   ```
   docker compose exec db psql -U app -d doc_admin -c "UPDATE admin_doc_board_items SET planning_doc = '<source-filename>' WHERE doc_key = '<doc_key>';"
   ```
   Replace `<source-filename>` with the planning doc basename (e.g. `roadmap-next-10-features.md`) and `<doc_key>` with the canonical slug.
5. **Always stop here and ask the user if they want a Codex prompt created.** Do not create the prompt automatically — the user wants to review the spec manually first.

### Creating a Codex prompt
Only create a prompt after the user explicitly confirms they are happy with the spec. Then:
1. Create the prompt file in `docs/prompts/active/` following the naming convention above.
2. Write the prompt with enough context for Codex to implement the spec end-to-end.
3. Tell the user the prompt is ready in `docs/prompts/active/` for them to submit to Codex.

### Creating a bug-fix prompt
When a bug is found during manual testing of a feature, create a bug-fix prompt — a focused prompt that describes only the bug and its fix. Bug-fix prompts are linked to their parent spec on the board automatically by file naming convention.

**Naming convention:** `codex-prompts-{doc_key}-bug.md` for a single unnamed fix, or `codex-prompts-{doc_key}-bug-{slug}.md` for a named fix.

- `{doc_key}` must exactly match the `doc_key` of the parent spec (the canonical slug, e.g. `feature-3-exercise-substitution-mobile-ui`)
- `{slug}` is a short kebab-case label describing what was fixed (e.g. `swap-options`, `null-check`, `reenrollment`)

Examples:
```
docs/prompts/active/codex-prompts-feature-3-exercise-substitution-mobile-ui-bug.md
docs/prompts/active/codex-prompts-feature-4-program-lifecycle-mobile-ui-bug-reenrollment.md
```

Place the file in `docs/prompts/active/` as usual. The dashboard will automatically show it as a 🐛 chip on the parent spec's card. Do **not** use the plain prompt naming convention (`codex-prompts-{doc_key}.md`) for bug fixes — that slot is reserved for the primary implementation prompt.

### After Codex finishes implementing a prompt
Once Codex has finished the implementation and the work has been merged:
1. Update the board status for the matching spec to `needs_testing` in the `admin_doc_board_items` table in the `doc_admin` Postgres database.
2. Use this SQL (replace `<doc_key>` with the canonical key for the spec, e.g. `feature-3-exercise-substitution`):
   ```sql
   UPDATE admin_doc_board_items SET status = 'needs_testing' WHERE doc_key = '<doc_key>';
   ```
3. Run it via: `docker compose exec db psql -U $POSTGRES_USER -d doc_admin -c "UPDATE ..."`
4. Tell the user the item is now in the **Needs Testing** column on the board at http://localhost:3001 and that they should manually verify the feature before marking it Done from the dashboard.
5. **Review and update the reference docs** to reflect what was actually built. Read the merged code and compare it against the three reference docs in `docs/reference/`. Make any changes needed:

   - **`docs/reference/architecture.md`** — update if the feature added new services, changed the pipeline steps, introduced new middleware, changed the high-level data flow, or added new internal components. Keep the ASCII diagram and route table in sync with actual route and service structure.
   - **`docs/reference/api-contracts.md`** — update if the feature added, removed, or changed any API routes: path, method, request body shape, response shape, auth requirements, or error codes.
   - **`docs/reference/db.md`** — update if the feature added or modified any tables, columns, indexes, or constraints via a Flyway migration.
   - **`docs/reference/glossary.md`** — update if the feature introduced new domain terms, renamed existing concepts, or changed the meaning of a term already defined there. Do not add terms that are self-explanatory from the code.
   - **`docs/reference/ops.md`** — update if the feature changed how the service is started, configured, deployed, or debugged. This includes: new environment variables, new Docker Compose services, new admin tools, new common failure modes, or changes to the key file locations table.
   - **`docs/reference/testing.md`** — update if the feature added new test files, changed the DB requirement of a suite, or added/removed a manually-verified area. Update test counts in the summary table.
   - **`docs/reference/adr-review.md`** — update only if the feature introduced a genuinely new architectural decision (e.g. a new data store, a new auth mechanism, a new cross-cutting pattern), changed the status of an existing ADR (e.g. a recommendation was acted on, a decision was superseded), or added a significant implicit decision to the "missing ADRs" table at the bottom. Do **not** update this doc for routine feature additions (new routes, new tables, new screens).

   Only update what actually changed — do not rewrite sections that are still accurate. If a section is unchanged, leave it alone. After updating, tell the user which docs were changed and summarise what was amended.

## API versioning policy

New routes and additive changes (new optional fields) can ship on any deploy without mobile coordination.

**Breaking changes** — removing a field, renaming a required field, changing a field type, changing an HTTP method — require a versioned migration:
1. Introduce the change at `/api/v2/<path>` while keeping the old `/api/<path>` active.
2. Ship the mobile app update targeting `/api/v2/<path>`.
3. Retire the old route once ≥ 95% of active users are on the new version.

**What is not a breaking change:** adding new optional response fields, adding new optional request fields with safe defaults, adding new routes, changing error message strings (not error codes).

**Internal routes** (`/admin/*`, `/api/internal/*`) are consumed only by controlled callers and may change freely without versioning.

For the full rationale see `docs/reference/adr-review.md` ADR-018.

## Default commit workflow
When asked to "commit" or "submit" work, the full expected flow is:
1. Create a fresh branch following the naming convention above
2. Commit the changes with a descriptive message
3. Push the branch and open a PR with an outcome-focused title
4. Monitor CI — if it fails, fix on the branch and push again before merging
5. Merge only when CI is green
