import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DOC_ADMIN_DB_URL });

pool.on('error', (err) => {
  console.error('[pool] Unexpected Postgres error:', err.message);
});

export default pool;
