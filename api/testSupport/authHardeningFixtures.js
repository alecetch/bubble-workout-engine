import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
export { pool };
export const skip = !(process.env.PGPASSWORD || process.env.DATABASE_URL) && 'requires test database';
export const log = { info() {}, error() {}, warn() {} };
export const response = () => ({ statusCode: 200, status(code) { this.statusCode=code;return this; }, json(body) { this.body=body;return this; } });
export async function withAuthUser(fn) {
  const id=randomUUID(), email=`auth-${id}@example.test`, password='Original-password-123';
  await pool.query('INSERT INTO app_user(id,subject_id,email,password_hash) VALUES ($1,$2,$3,$4)', [id,id,email,await bcrypt.hash(password,4)]);
  try { await fn({id,email,password}); }
  finally { await pool.query('DELETE FROM app_user WHERE id=$1',[id]); await pool.query('DELETE FROM rate_limit_hit WHERE key=$1 OR key=$2',[`auth:pw-fail:${id}`,`auth:reset-req:${(await import('node:crypto')).createHash('sha256').update(email).digest('hex')}`]); }
}
