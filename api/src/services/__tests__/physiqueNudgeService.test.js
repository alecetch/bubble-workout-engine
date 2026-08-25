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

test("physique nudge email text uses Forma brand copy", async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  const db = {
    async query(sql) {
      if (/SELECT device_push_token, email FROM app_user/.test(sql)) {
        return { rows: [{ device_push_token: null, email: "alec@example.com" }] };
      }
      return {
        rows: [
          {
            last_check_in_at: null,
            sessions_since_last: 2,
            physique_consent_at: new Date("2026-05-01T00:00:00Z"),
          },
        ],
      };
    },
  };

  try {
    await maybeSendPhysiqueNudge(db, "user-123");
  } finally {
    console.log = originalLog;
  }

  const output = logs.join("\n");
  assert.match(output, /Log in to Forma to take your weekly physique check-in/);
  assert.doesNotMatch(output, /Formai/);
});
