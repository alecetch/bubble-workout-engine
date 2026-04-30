/**
 * reconcile.js
 *
 * Syncs filesystem state (docs/) with Postgres board metadata.
 *
 * Rules:
 *   NEW spec (not yet in DB):
 *     - prompt in done/   → initial status 'done'
 *     - prompt in active/ → initial status 'prompt_active'
 *     - no prompt         → initial status 'backlog'
 *     - appended to the end of the target column's priority order
 *
 *   EXISTING spec (already in DB):
 *     - Updates prompt_filename if it changed (filesystem wins)
 *     - Does NOT change status — user controls status manually
 *     - Exception: if prompt moved from active/ to done/ via the UI's mark-done
 *       action, that action updates the status directly (not reconcile's job)
 *
 *   ORPHAN prompts (prompt key matches no spec):
 *     - Logged as warnings, not inserted (spec is the canonical record)
 */

import { join } from 'path';
import pool from '../db/pool.js';
import { buildSpecMap, buildPromptMap, buildBugPromptMap, buildTestPlanMap } from './keyMatcher.js';

export async function reconcile(docsRoot) {
  const specsDir     = join(docsRoot, 'specs');
  const activeDir    = join(docsRoot, 'prompts', 'active');
  const doneDir      = join(docsRoot, 'prompts', 'done');
  const testPlansDir = join(docsRoot, 'test_plans');

  const [specMap, promptMap, bugPromptMap, testPlanMap] = await Promise.all([
    buildSpecMap(specsDir),
    buildPromptMap(activeDir, doneDir),
    buildBugPromptMap(activeDir, doneDir),
    buildTestPlanMap(testPlansDir),
  ]);

  const { rows: existing } = await pool.query(
    'SELECT id, doc_key, prompt_filename, test_plan_filename, status FROM admin_doc_board_items'
  );
  const existingByKey = new Map(existing.map(r => [r.doc_key, r]));

  const summary = { inserted: 0, updated: 0, unchanged: 0, orphanPrompts: [] };

  for (const [docKey, specFilename] of specMap) {
    const promptEntry      = promptMap.get(docKey) ?? null;
    const promptFilename   = promptEntry?.filename ?? null;
    const bugFilenames     = bugPromptMap.get(docKey) ?? [];
    const testPlanFilename = testPlanMap.get(docKey) ?? null;

    if (!existingByKey.has(docKey)) {
      // New spec — determine initial status from filesystem
      let initialStatus = 'backlog';
      if (promptEntry) {
        initialStatus = promptEntry.inDone ? 'done' : 'prompt_active';
      }

      const { rows: [{ max_rank }] } = await pool.query(
        'SELECT COALESCE(MAX(priority_rank), 0) AS max_rank FROM admin_doc_board_items WHERE status = $1',
        [initialStatus]
      );

      await pool.query(
        `INSERT INTO admin_doc_board_items
           (doc_key, spec_filename, prompt_filename, bug_prompt_filenames, test_plan_filename, status, priority_rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [docKey, specFilename, promptFilename, bugFilenames, testPlanFilename, initialStatus, max_rank + 1]
      );
      summary.inserted++;
    } else {
      // Existing spec — update prompt_filename, bug_prompt_filenames, and test_plan_filename if changed
      const row = existingByKey.get(docKey);
      const bugChanged      = JSON.stringify((row.bug_prompt_filenames ?? []).sort())
                           !== JSON.stringify([...bugFilenames].sort());
      const testPlanChanged = row.test_plan_filename !== testPlanFilename;
      if (row.prompt_filename !== promptFilename || bugChanged || testPlanChanged) {
        await pool.query(
          'UPDATE admin_doc_board_items SET prompt_filename = $1, bug_prompt_filenames = $2, test_plan_filename = $3 WHERE doc_key = $4',
          [promptFilename, bugFilenames, testPlanFilename, docKey]
        );
        summary.updated++;
      } else {
        summary.unchanged++;
      }
    }
  }

  // Collect all bug prompt filenames that matched a spec (not orphans)
  const matchedBugFilenames = new Set(
    [...bugPromptMap.values()].flat()
  );

  // Identify orphan prompts — key matches no spec AND not a matched bug prompt
  for (const [promptKey, { filename }] of promptMap) {
    if (!specMap.has(promptKey) && !matchedBugFilenames.has(filename)) {
      summary.orphanPrompts.push(filename);
    }
  }

  if (summary.orphanPrompts.length > 0) {
    console.warn('[reconcile] Orphan prompts (no matching spec):', summary.orphanPrompts.join(', '));
  }

  console.log(
    `[reconcile] inserted=${summary.inserted} updated=${summary.updated} ` +
    `unchanged=${summary.unchanged} orphans=${summary.orphanPrompts.length}`
  );
  return summary;
}
