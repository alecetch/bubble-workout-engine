import { randomUUID } from "node:crypto";

// Routes commit normally, while the outer fixture rolls every test back.
export function transactionalPool(db) {
  let depth = 0;
  const query = (sql, params) => {
    if (sql === "BEGIN") return db.query(`SAVEPOINT training_${++depth}`);
    if (sql === "COMMIT") return db.query(`RELEASE SAVEPOINT training_${depth--}`);
    if (sql === "ROLLBACK") {
      const name = `training_${depth--}`;
      return db.query(`ROLLBACK TO SAVEPOINT ${name}`).then(() => db.query(`RELEASE SAVEPOINT ${name}`));
    }
    return db.query(sql, params);
  };
  return { query, connect: async () => ({ query, release() {} }) };
}

export async function trainingProgram(db, userId) {
  const id = randomUUID();
  await db.query(`INSERT INTO program (id, user_id, program_title, program_summary, weeks_count, days_per_week,
    program_outline_json, start_date, start_weekday, preferred_days_sorted_json)
    VALUES ($1,$2,'Training test','Test',1,3,'{}','2026-01-01','mon','[]')`, [id, userId]);
  const week = (await db.query("INSERT INTO program_week (program_id, week_number) VALUES ($1,1) RETURNING id", [id])).rows[0].id;
  const days = [];
  for (let n = 1; n <= 3; n++) {
    const day = (await db.query(`INSERT INTO program_day (program_id, program_week_id, week_number, day_number,
      global_day_index, program_day_key, session_duration_mins, scheduled_date, is_bonus)
      VALUES ($1,$2,1,$3,$3,$4,30,'2026-01-01',$5) RETURNING id`, [id, week, n, `test-${n}`, n === 3])).rows[0].id;
    days.push(day);
  }
  const segment = (await db.query(`INSERT INTO workout_segment (program_id,program_day_id,program_day_key,
    segment_key,block_key,block_order,segment_order_in_block,segment_type,purpose)
    VALUES ($1,$2,'test-1','test','main',1,1,'single','main') RETURNING id`, [id, days[0]])).rows[0].id;
  const exercise = (await db.query(`INSERT INTO program_exercise (program_id,program_day_id,workout_segment_id,
    program_day_key,segment_key,segment_type,exercise_id,order_in_day,block_order,order_in_block,purpose)
    VALUES ($1,$2,$3,'test-1','test','single','bb_back_squat',1,1,1,'main') RETURNING id`, [id, days[0], segment])).rows[0].id;
  return { id, days, segment, exercise };
}

export async function seedLog(db, userId, program, { createdAt = new Date(), draft = false } = {}) {
  await db.query(`INSERT INTO segment_exercise_log (user_id,program_id,program_day_id,workout_segment_id,
    program_exercise_id,is_draft,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  [userId, program.id, program.days[0], program.segment, program.exercise, draft, createdAt]);
}
