import { Router } from 'express';
import pool from '../db/pool.js';
import { DOCS_ROOT } from '../lib/config.js';
import { movePromptToDone, moveSpecToPromptActive } from '../lib/fileOps.js';

const router = Router();

const VALID_STATUSES = ['backlog', 'prioritised', 'prompt_active', 'needs_testing', 'done'];

/**
 * PATCH /api/items/:id/move
 * Body: { status, beforeId? }
 *
 * Moves an item to a target column and optional position.
 * beforeId = the id of the item this should appear BEFORE (null = end of column).
 *
 * Renumbers priority_rank for both source and target columns in a transaction.
 */
router.patch('/:id/move', async (req, res, next) => {
  const id     = parseInt(req.params.id, 10);
  const { status, beforeId } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `Invalid status: ${status}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch current status so we can renumber source column
    const { rows: [item] } = await client.query(
      'SELECT id, status FROM admin_doc_board_items WHERE id = $1', [id]
    );
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Item not found' });
    }
    const oldStatus = item.status;

    // Build new ordered list for target column (excluding the dragged item)
    const { rows: colItems } = await client.query(
      'SELECT id FROM admin_doc_board_items WHERE status = $1 AND id != $2 ORDER BY priority_rank ASC',
      [status, id]
    );

    const newOrder = colItems.map(r => r.id);
    const parsedBeforeId = beforeId ? parseInt(beforeId, 10) : null;

    if (parsedBeforeId === null) {
      newOrder.push(id);
    } else {
      const idx = newOrder.indexOf(parsedBeforeId);
      newOrder.splice(idx === -1 ? newOrder.length : idx, 0, id);
    }

    // Renumber target column (sets status on the moved item too)
    for (let i = 0; i < newOrder.length; i++) {
      await client.query(
        'UPDATE admin_doc_board_items SET status = $1, priority_rank = $2 WHERE id = $3',
        [status, i + 1, newOrder[i]]
      );
    }

    // Renumber source column if it changed (close the gap)
    if (oldStatus !== status) {
      const { rows: srcItems } = await client.query(
        'SELECT id FROM admin_doc_board_items WHERE status = $1 ORDER BY priority_rank ASC',
        [oldStatus]
      );
      for (let i = 0; i < srcItems.length; i++) {
        await client.query(
          'UPDATE admin_doc_board_items SET priority_rank = $1 WHERE id = $2',
          [i + 1, srcItems[i].id]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: [updated] } = await pool.query(
      'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
    );
    res.json({ ok: true, item: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

/**
 * POST /api/items/:id/mark-done
 *
 * Marks a spec as done:
 *   1. If prompt_filename is set, moves the file from prompts/active/ to prompts/done/
 *      (graceful if already in done/).
 *   2. Updates status to 'done' in Postgres.
 *
 * File operation happens first. If it fails, the DB is not updated.
 * If the DB update fails after a successful file move, an error is logged
 * with instructions for manual correction.
 */
router.post('/:id/mark-done', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);

  const { rows: [item] } = await pool.query(
    'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
  );
  if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });

  // Move prompt file if one is linked
  let fileMoveResult = null;
  if (item.prompt_filename) {
    try {
      fileMoveResult = await movePromptToDone(DOCS_ROOT, item.prompt_filename);
    } catch (err) {
      return res.status(400).json({ ok: false, error: `File operation failed: ${err.message}` });
    }
  }

  // Update DB — append item to end of 'done' column, mark all bugs done
  try {
    const { rows: [{ max_rank }] } = await pool.query(
      "SELECT COALESCE(MAX(priority_rank), 0) AS max_rank FROM admin_doc_board_items WHERE status = 'done' AND id != $1",
      [id]
    );
    await pool.query(
      `UPDATE admin_doc_board_items
       SET status = 'done', priority_rank = $1,
           bug_prompt_done_filenames = bug_prompt_filenames
       WHERE id = $2`,
      [max_rank + 1, id]
    );
  } catch (err) {
    // File was moved but DB update failed — log clearly for manual correction
    if (fileMoveResult?.moved) {
      console.error(
        `[mark-done] PARTIAL FAILURE: prompt file was moved to done/ but DB update failed for item id=${id}. ` +
        `Manually run: UPDATE admin_doc_board_items SET status='done' WHERE id=${id};`
      );
    }
    return next(err);
  }

  const { rows: [updated] } = await pool.query(
    'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
  );
  res.json({ ok: true, item: updated, fileMoved: fileMoveResult?.moved ?? false });
});

/**
 * POST /api/items/:id/activate
 *
 * Moves an item from 'prioritised' to 'prompt_active'.
 *
 * Two cases:
 *   A. Item already has a prompt_filename → status update only (file already in prompts/active/).
 *   B. Item has no prompt_filename → the spec is the combined artefact.
 *      Moves spec file from docs/specs/ to docs/prompts/active/, sets prompt_filename
 *      to the spec basename, then updates status to 'prompt_active'.
 */
router.post('/:id/activate', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);

  const { rows: [item] } = await pool.query(
    'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
  );
  if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });

  if (item.status !== 'prioritised') {
    return res.status(400).json({ ok: false, error: `Item is not in 'prioritised' (is '${item.status}')` });
  }

  let fileMoveResult = null;
  let promptFilename = item.prompt_filename;

  if (!promptFilename) {
    // Case B — spec is the combined artefact; move it to prompts/active/
    try {
      fileMoveResult = await moveSpecToPromptActive(DOCS_ROOT, item.spec_filename);
      promptFilename = item.spec_filename;
    } catch (err) {
      return res.status(400).json({ ok: false, error: `File operation failed: ${err.message}` });
    }
  }

  try {
    const { rows: [{ max_rank }] } = await pool.query(
      "SELECT COALESCE(MAX(priority_rank), 0) AS max_rank FROM admin_doc_board_items WHERE status = 'prompt_active' AND id != $1",
      [id]
    );
    await pool.query(
      "UPDATE admin_doc_board_items SET status = 'prompt_active', prompt_filename = $1, priority_rank = $2 WHERE id = $3",
      [promptFilename, max_rank + 1, id]
    );
  } catch (err) {
    if (fileMoveResult?.moved) {
      console.error(
        `[activate] PARTIAL FAILURE: spec file was moved to prompts/active/ but DB update failed for item id=${id}. ` +
        `Manually run: UPDATE admin_doc_board_items SET status='prompt_active', prompt_filename='${promptFilename}' WHERE id=${id};`
      );
    }
    return next(err);
  }

  const { rows: [updated] } = await pool.query(
    'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
  );
  res.json({ ok: true, item: updated, fileMoved: fileMoveResult?.moved ?? false });
});

/**
 * POST /api/items/:id/toggle-bug
 * Body: { filename } — basename of the bug prompt to toggle done/undone.
 *
 * Adds filename to bug_prompt_done_filenames if not present; removes it if present.
 */
router.post('/:id/toggle-bug', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { filename } = req.body;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ ok: false, error: 'filename is required' });
  }

  try {
    const { rows: [item] } = await pool.query(
      'SELECT id, bug_prompt_filenames, bug_prompt_done_filenames FROM admin_doc_board_items WHERE id = $1', [id]
    );
    if (!item) return res.status(404).json({ ok: false, error: 'Item not found' });

    const isDone = item.bug_prompt_done_filenames.includes(filename);
    if (isDone) {
      // Remove from done list
      await pool.query(
        'UPDATE admin_doc_board_items SET bug_prompt_done_filenames = array_remove(bug_prompt_done_filenames, $1) WHERE id = $2',
        [filename, id]
      );
    } else {
      // Add to done list (only if it exists in the bug list)
      if (!item.bug_prompt_filenames.includes(filename)) {
        return res.status(400).json({ ok: false, error: 'filename not in bug_prompt_filenames' });
      }
      await pool.query(
        'UPDATE admin_doc_board_items SET bug_prompt_done_filenames = array_append(bug_prompt_done_filenames, $1) WHERE id = $2',
        [filename, id]
      );
    }

    const { rows: [updated] } = await pool.query(
      'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
    );
    res.json({ ok: true, item: updated, wasDone: isDone, nowDone: !isDone });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/items/:id/planning-doc
 * Body: { planningDoc } — basename of planning doc, or null to clear.
 */
router.patch('/:id/planning-doc', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { planningDoc } = req.body;
  try {
    await pool.query(
      'UPDATE admin_doc_board_items SET planning_doc = $1 WHERE id = $2',
      [planningDoc || null, id]
    );
    const { rows: [updated] } = await pool.query(
      'SELECT * FROM admin_doc_board_items WHERE id = $1', [id]
    );
    if (!updated) return res.status(404).json({ ok: false, error: 'Item not found' });
    res.json({ ok: true, item: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
