import { withAuthUser, pool } from "./authHardeningFixtures.js";
export { pool, log, response } from "./authHardeningFixtures.js";

export async function withDeletionUser(fn) {
  return withAuthUser(async user => {
    await pool.query("INSERT INTO client_profile(user_id) VALUES ($1)", [user.id]);
    await pool.query("INSERT INTO physique_check_in(user_id,photo_s3_key) VALUES ($1,$2)", [user.id, `physique/${user.id}/photo.jpg`]);
    await fn(user);
  });
}

export async function accountCounts(id) {
  const counts = [];
  for (const [table, column] of [["app_user", "id"], ["client_profile", "user_id"], ["physique_check_in", "user_id"]]) {
    counts.push((await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${column}=$1`, [id])).rows[0].count);
  }
  return counts;
}
