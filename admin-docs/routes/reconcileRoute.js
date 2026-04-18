import { Router } from 'express';
import { DOCS_ROOT } from '../lib/config.js';
import { reconcile } from '../lib/reconcile.js';

const router = Router();

// POST /api/reconcile — manually trigger a filesystem → Postgres sync
router.post('/', async (req, res, next) => {
  try {
    const summary = await reconcile(DOCS_ROOT);
    res.json({ ok: true, summary });
  } catch (err) {
    next(err);
  }
});

export default router;
