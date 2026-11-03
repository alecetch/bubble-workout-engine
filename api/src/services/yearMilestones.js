import { firstValidTimezone } from "../utils/timezone.js";
import { localDateInZone, targetWindow, clubThresholds } from "./trainingYear.js";

export async function milestoneDefinitions(db, userId, year) {
  const user = (await db.query(`SELECT u.created_at, u.timezone, np.reminder_timezone, cp.onboarding_completed_at
    FROM app_user u LEFT JOIN notification_preference np ON np.user_id = u.id
    LEFT JOIN LATERAL (SELECT MIN(onboarding_completed_at) AS onboarding_completed_at
      FROM client_profile WHERE user_id = u.id) cp ON true WHERE u.id = $1`, [userId])).rows[0];
  if (!user) return [];
  const zone = firstValidTimezone(user.timezone, user.reminder_timezone);
  const window = targetWindow({ year, joinLocalDate: localDateInZone(user.onboarding_completed_at ?? user.created_at, zone) });
  return [...[1, 25, 50, 100, 150].map(value => ({ slug: `day_${value}`, threshold: value })),
    ...clubThresholds(window.ratio).map(club => ({ slug: `club_${club.tier}`, threshold: club.threshold }))];
}

export async function detectAndRecordMilestones(db, { userId, localDate }) {
  const year = Number(localDate.slice(0, 4));
  // Serializes detection, claims and backfill for this user inside the caller's transaction.
  await db.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [userId]);
  const dates = (await db.query(`SELECT DISTINCT local_date::text AS local_date FROM training_session
    WHERE user_id = $1 AND local_date BETWEEN $2::date AND $3::date ORDER BY local_date`,
  [userId, `${year}-01-01`, `${year}-12-31`])).rows;
  const definitions = (await milestoneDefinitions(db, userId, year)).filter(m => m.threshold <= dates.length);
  if (!definitions.length) return [];
  return (await db.query(`INSERT INTO year_milestone (user_id, year, slug, threshold, reached_on)
    SELECT $1, $2, m.slug, m.threshold, $5::date
    FROM unnest($3::text[], $4::int[]) AS m(slug, threshold)
    ON CONFLICT (user_id, year, slug) DO NOTHING RETURNING id, slug, threshold, year`,
  [userId, year, definitions.map(m => m.slug), definitions.map(m => m.threshold), localDate])).rows;
}

export const MILESTONE_ORDER_SQL = `threshold DESC,
  CASE slug WHEN 'club_300' THEN 5 WHEN 'club_250' THEN 4 WHEN 'club_200' THEN 3
    WHEN 'club_100' THEN 1 ELSE 2 END DESC, slug DESC`;

export async function claimYearMilestone(db, userId, year) {
  const client = typeof db.connect === "function" ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [userId]);
    let coalescedIds = [];
    const milestone = (await client.query(`SELECT id, slug, threshold, year FROM year_milestone
        WHERE user_id = $1 AND year = $2 AND seen_at IS NULL AND claimed_at IS NULL
        ORDER BY ${MILESTONE_ORDER_SQL} LIMIT 1 FOR UPDATE`, [userId, year])).rows[0] ?? null;
    if (milestone) {
      await client.query("UPDATE year_milestone SET claimed_at = now() WHERE id = $1", [milestone.id]);
      coalescedIds = (await client.query(`UPDATE year_milestone SET seen_at = now()
          WHERE user_id = $1 AND year = $2 AND id <> $3 AND seen_at IS NULL AND claimed_at IS NULL RETURNING id`,
      [userId, year, milestone.id])).rows.map(row => row.id);
    }
    await client.query("COMMIT");
    return { milestone, coalesced_ids: coalescedIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally { if (client !== db) client.release(); }
}
