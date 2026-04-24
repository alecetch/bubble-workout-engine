import test from "node:test";
import assert from "node:assert/strict";
import { maybeSendPhysiqueNudge } from "../physiqueNudgeService.js";

test("physique nudge query counts completed sessions via program_day", async () => {
  let capturedSql = "";

  const db = {
    async query(sql) {
      capturedSql = sql;
      return {
        rows: [
          {
            last_check_in_at: null,
            sessions_since_last: 0,
            physique_consent_at: null,
          },
        ],
      };
    },
  };

  await maybeSendPhysiqueNudge(db, "user-123");

  assert.match(capturedSql, /JOIN program_day pd ON pd\.id = pcd\.program_day_id/);
  assert.match(capturedSql, /pd\.is_completed = TRUE/);
  assert.match(capturedSql, /pd\.updated_at > COALESCE/);
  assert.doesNotMatch(capturedSql, /pcd\.status/);
  assert.doesNotMatch(capturedSql, /pcd\.completed_at/);
});
