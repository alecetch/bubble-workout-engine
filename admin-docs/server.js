import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import { readFile } from 'fs/promises';
import { dirname, join, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

import { DOCS_ROOT } from './lib/config.js';
import { reconcile } from './lib/reconcile.js';
import boardRouter      from './routes/board.js';
import itemsRouter      from './routes/items.js';
import reconcileRouter  from './routes/reconcileRoute.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Bootstrap — creates the doc_admin database and schema automatically.
// Safe to run on every startup: all DDL statements use IF NOT EXISTS.
// The doc_admin database is kept separate from the main app database and is
// never touched by Flyway.
// ---------------------------------------------------------------------------
async function ensureBootstrap() {
  const dbUrl = process.env.DOC_ADMIN_DB_URL;
  if (!dbUrl) throw new Error('DOC_ADMIN_DB_URL is not set');

  // Step 1: connect to the postgres system database to create doc_admin if needed
  const sysUrl = dbUrl.replace(/\/doc_admin(\?.*)?$/, '/postgres');
  const sysClient = new pg.Client({ connectionString: sysUrl });
  try {
    await sysClient.connect();
    const { rows } = await sysClient.query(
      "SELECT 1 FROM pg_database WHERE datname = 'doc_admin'"
    );
    if (rows.length === 0) {
      await sysClient.query('CREATE DATABASE doc_admin');
      console.log('[bootstrap] Created database: doc_admin');
    }
  } finally {
    await sysClient.end();
  }

  // Step 2: run bootstrap.sql against doc_admin (all statements are idempotent)
  const bootstrapSql = await readFile(join(__dirname, 'db', 'bootstrap.sql'), 'utf-8');
  const { default: pool } = await import('./db/pool.js');
  await pool.query(bootstrapSql);
  console.log('[bootstrap] Schema ready');
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.use('/api/board',      boardRouter);
app.use('/api/items',      itemsRouter);
app.use('/api/reconcile',  reconcileRouter);

// GET /api/planning — list of files in docs/planning/
app.get('/api/planning', async (_req, res, next) => {
  try {
    const { readdir } = await import('fs/promises');
    const { join: pjoin } = await import('path');
    const planningDir = pjoin(DOCS_ROOT, 'planning');
    const files = (await readdir(planningDir)).filter(f => /\.(md|txt)$/i.test(f)).sort();
    res.json({ ok: true, files });
  } catch (err) {
    next(err);
  }
});

// GET /api/docs/view?file=specs/filename.md — raw markdown for in-browser preview
app.get('/api/docs/view', async (req, res) => {
  const { file } = req.query;
  if (!file) return res.status(400).json({ ok: false, error: 'file param required' });

  const fullPath = resolve(join(DOCS_ROOT, file));
  if (!fullPath.startsWith(resolve(DOCS_ROOT))) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    res.json({ ok: true, content, filename: basename(fullPath) });
  } catch {
    res.status(404).json({ ok: false, error: 'File not found' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/doc-health — documentation observability metrics
// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'build', '__pycache__']);

async function newestMtimeInDir(dir, exts, depth = 0) {
  if (depth > 4) return 0;
  const { readdir: rd, stat: stf } = await import('fs/promises');
  let newest = 0;
  try {
    const entries = await rd(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const fp = join(dir, e.name);
      if (e.isDirectory()) {
        const m = await newestMtimeInDir(fp, exts, depth + 1);
        if (m > newest) newest = m;
      } else if (e.isFile() && exts.some(x => e.name.endsWith(x))) {
        try {
          const s = await stf(fp);
          if (s.mtimeMs > newest) newest = s.mtimeMs;
        } catch { /* skip */ }
      }
    }
  } catch { /* dir not found */ }
  return newest;
}

async function resolveCodeMtime(repoRoot, paths) {
  const { stat } = await import('fs/promises');
  const CODE_EXTS = ['.js', '.ts', '.sql', '.yaml', '.yml', '.toml'];
  let newest = 0;
  for (const rel of paths) {
    const abs = join(repoRoot, rel);
    try {
      const s = await stat(abs);
      const m = s.isDirectory()
        ? await newestMtimeInDir(abs, CODE_EXTS)
        : (CODE_EXTS.some(x => abs.endsWith(x)) ? s.mtimeMs : 0);
      if (m > newest) newest = m;
    } catch { /* path not found */ }
  }
  return newest;
}

app.get('/api/doc-health', async (_req, res, next) => {
  try {
    const { stat } = await import('fs/promises');
    const { resolve: pres } = await import('path');
    const repoRoot = pres(DOCS_ROOT, '..');

    const REF_DOCS = [
      { name: 'architecture.md',  label: 'architecture',  code: ['api/src/routes', 'api/engine', 'api/src/services', 'api/src/middleware'] },
      { name: 'api-contracts.md', label: 'api-contracts', code: ['api/src/routes', 'api/server.js'] },
      { name: 'db.md',            label: 'db',            code: ['migrations'] },
      { name: 'glossary.md',      label: 'glossary',      code: ['api/engine', 'api/src/services'] },
      { name: 'ops.md',           label: 'ops',           code: ['docker-compose.yml', 'api/fly.toml', 'api/.env.example'] },
      { name: 'adr-review.md',    label: 'adr-review',    code: ['api/src', 'api/engine'] },
      { name: 'testing.md',       label: 'testing',       code: ['api/test', 'api/engine/steps/__tests__', 'api/src/routes/__tests__', 'api/src/services/__tests__', 'mobile/src'] },
    ];

    const now = Date.now();
    const refDocs = [];
    for (const d of REF_DOCS) {
      const docPath = join(DOCS_ROOT, 'reference', d.name);
      let docMtime = 0;
      try { docMtime = (await stat(docPath)).mtimeMs; } catch { /* missing */ }

      const codeMtime = await resolveCodeMtime(repoRoot, d.code);
      const driftDays = (docMtime && codeMtime > docMtime)
        ? Math.round((codeMtime - docMtime) / 86400000)
        : 0;
      const docAgeDays = docMtime ? Math.round((now - docMtime) / 86400000) : null;

      let status = 'ok';
      if (!docMtime)        status = 'missing';
      else if (driftDays > 14) status = 'stale';
      else if (driftDays > 3)  status = 'warn';

      refDocs.push({ name: d.name, label: d.label, docMtime, docAgeDays, driftDays, status });
    }

    const { default: pool } = await import('./db/pool.js');
    const { rows: [cov] } = await pool.query(`
      SELECT
        COUNT(*)::int                                                                    AS total,
        COUNT(CASE WHEN planning_doc IS NOT NULL THEN 1 END)::int                       AS with_planning,
        COUNT(CASE WHEN prompt_filename IS NOT NULL THEN 1 END)::int                    AS with_prompt,
        COUNT(CASE WHEN status = 'done' THEN 1 END)::int                               AS done,
        COUNT(CASE WHEN status = 'needs_testing' THEN 1 END)::int                      AS needs_testing,
        COUNT(CASE WHEN status = 'prompt_active' THEN 1 END)::int                      AS prompt_active,
        COUNT(CASE WHEN status = 'prioritised' THEN 1 END)::int                        AS prioritised,
        COUNT(CASE WHEN status = 'backlog' THEN 1 END)::int                            AS backlog,
        COUNT(CASE WHEN array_length(bug_prompt_filenames,1) > 0 THEN 1 END)::int      AS with_bugs
      FROM admin_doc_board_items
    `);

    const okDocs    = refDocs.filter(d => d.status === 'ok').length;
    const warnDocs  = refDocs.filter(d => d.status === 'warn').length;
    const staleDocs = refDocs.filter(d => d.status === 'stale').length;

    // Scores 0-100
    const refScore    = Math.round(((okDocs * 100) + (warnDocs * 60) + (staleDocs * 20)) / refDocs.length);
    const fullLineage = cov.total > 0 ? Math.round((cov.with_planning / cov.total) * 50 + (cov.with_prompt / cov.total) * 50) : 100;
    const delivery    = cov.total > 0 ? Math.round((cov.done / cov.total) * 100) : 0;
    const overall     = Math.round((refScore + fullLineage + delivery) / 3);

    res.json({
      ok: true,
      scores: { overall, refDocs: refScore, coverage: fullLineage, delivery },
      refDocs,
      board: cov,
      warnings: [
        ...refDocs.filter(d => d.status === 'stale').map(d =>
          `${d.name} may be stale — code changed ${d.driftDays}d after the doc was last updated`),
        ...refDocs.filter(d => d.status === 'missing').map(d =>
          `${d.name} not found in docs/reference/`),
        ...(cov.needs_testing > 0
          ? [`${cov.needs_testing} spec${cov.needs_testing > 1 ? 's' : ''} awaiting testing`]
          : []),
      ],
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const { default: pool } = await import('./db/pool.js');
    const { rows } = await pool.query('SELECT now() AS db_time');
    res.json({ ok: true, dbTime: rows[0].db_time, docsRoot: DOCS_ROOT });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ ok: false, error: err.message });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.DOC_ADMIN_PORT || 3001;

app.listen(PORT, async () => {
  console.log(`\n[doc-admin] Running at http://localhost:${PORT}`);
  console.log(`[doc-admin] DOCS_ROOT: ${DOCS_ROOT}\n`);
  try {
    await ensureBootstrap();
    await reconcile(DOCS_ROOT);
    console.log('[doc-admin] Ready.\n');
  } catch (err) {
    console.error('[doc-admin] Startup failed:', err.message);
    process.exit(1);
  }
});
