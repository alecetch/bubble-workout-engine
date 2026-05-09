-- =============================================================
-- admin-docs/db/bootstrap.sql
-- DOC ADMIN BOARD — dev-only database bootstrap
-- =============================================================
--
-- Run this ONCE manually to set up the admin tool's database.
--
-- ⚠️  NEVER place this file in migrations/ or any Flyway-managed path.
-- ⚠️  This schema MUST NOT be applied to production.
-- ⚠️  It targets a SEPARATE local database (doc_admin), not the main app DB.
--
-- Setup (run from repo root):
--   psql -h localhost -U postgres -c "CREATE DATABASE doc_admin;"
--   psql -h localhost -U postgres -d doc_admin -f admin-docs/db/bootstrap.sql
--
-- Or if your superuser is different:
--   psql -h localhost -U <your_superuser> ...
-- =============================================================

CREATE TABLE IF NOT EXISTS admin_doc_board_items (
  id              SERIAL PRIMARY KEY,
  doc_key         TEXT        NOT NULL UNIQUE,
  -- doc_key is the shared slug, e.g. "feature-1-post-onboarding-ux"
  -- derived by stripping prefixes/suffixes from both spec and prompt filenames

  spec_filename   TEXT        NOT NULL,
  -- basename only, e.g. "feature-1-post-onboarding-ux-spec.md"

  prompt_filename TEXT,
  -- nullable; basename only, e.g. "codex-prompts-feature-1-post-onboarding-ux.md"
  -- populated by reconcile(); null = no prompt exists yet

  status          TEXT        NOT NULL DEFAULT 'backlog'
                    CHECK (status IN ('backlog','prioritised','prompt_active','needs_testing','done')),
  -- backlog        = newly detected spec, not yet prioritised
  -- prioritised    = ordered in the priority list, no prompt yet
  -- prompt_active  = matching prompt exists in docs/prompts/active/
  -- needs_testing  = prompt work done, awaiting manual QA
  -- done           = prompt moved to done/, feature complete

  planning_doc    TEXT,
  -- nullable; basename of the planning doc this spec traces back to
  -- e.g. "roadmap-next-10-features.md" or "vision-and-roadmap.md"

  bug_prompt_filenames TEXT[]  NOT NULL DEFAULT '{}',
  -- array of bug-fix prompt basenames linked to this spec
  -- convention: codex-prompts-{doc_key}-bug[-{slug}].md
  -- populated by reconcile(); empty = no bug fixes recorded

  bug_prompt_done_filenames TEXT[] NOT NULL DEFAULT '{}',
  -- subset of bug_prompt_filenames that have been marked done

  priority_rank   INTEGER     NOT NULL DEFAULT 0,
  -- lower rank = higher priority within the same status column

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns to existing tables that predate them
ALTER TABLE admin_doc_board_items
  ADD COLUMN IF NOT EXISTS bug_prompt_filenames TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_doc_board_items
  ADD COLUMN IF NOT EXISTS bug_prompt_done_filenames TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_doc_board_items
  ADD COLUMN IF NOT EXISTS test_plan_filename TEXT;
  -- nullable; basename only, e.g. "feature-9-social-sharing-test-plan.md"
  -- populated by reconcile(); null = no test plan written yet

CREATE INDEX IF NOT EXISTS idx_board_status_rank
  ON admin_doc_board_items (status, priority_rank);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION doc_admin_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doc_admin_updated_at ON admin_doc_board_items;
CREATE TRIGGER trg_doc_admin_updated_at
  BEFORE UPDATE ON admin_doc_board_items
  FOR EACH ROW EXECUTE FUNCTION doc_admin_update_updated_at();
