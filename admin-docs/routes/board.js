import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const COLUMN_ORDER = ['backlog', 'prioritised', 'prompt_active', 'needs_testing', 'done'];

// GET /api/board — return all items grouped by status column
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM admin_doc_board_items ORDER BY priority_rank ASC, created_at ASC'
    );

    const columns = Object.fromEntries(COLUMN_ORDER.map(s => [s, []]));
    for (const row of rows) {
      if (columns[row.status]) columns[row.status].push(row);
    }

    res.json({ ok: true, columns });
  } catch (err) {
    next(err);
  }
});

export default router;
