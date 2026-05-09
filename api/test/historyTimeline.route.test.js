import test from "node:test";
import assert from "node:assert/strict";
import {
  clampTimelineLimit,
  createHistoryTimelineHandler,
  mapTimelineItem,
  parseTimelineCursor,
} from "../src/routes/historyTimeline.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("clampTimelineLimit defaults and clamps to 1..100", () => {
  assert.equal(clampTimelineLimit(undefined), 40);
  assert.equal(clampTimelineLimit("0"), 1);
  assert.equal(clampTimelineLimit("1"), 1);
  assert.equal(clampTimelineLimit("40"), 40);
  assert.equal(clampTimelineLimit("999"), 100);
});

test("parseTimelineCursor validates tuple cursor", () => {
  assert.deepEqual(parseTimelineCursor({}), { cursorDate: null, cursorId: null });
  assert.equal("error" in parseTimelineCursor({ cursorDate: "2026-03-01" }), true);
  assert.equal(
    "error" in parseTimelineCursor({ cursorDate: "bad", cursorId: "also-bad" }),
    true,
  );
  assert.deepEqual(
    parseTimelineCursor({
      cursorDate: "2026-03-01",
      cursorId: "11111111-1111-4111-8111-111111111111",
    }),
    {
      cursorDate: "2026-03-01",
      cursorId: "11111111-1111-4111-8111-111111111111",
    },
  );
});

test("mapTimelineItem maps nullable hero and optional highlight", () => {
  const item = mapTimelineItem(
    {
      program_day_id: "day-1",
      program_id: "program-1",
      scheduled_date: "2026-03-01",
      day_label: "Upper Body",
      day_type: "hypertrophy",
      session_duration_mins: "60",
      hero_media_id: null,
    },
    new Map(),
  );

  assert.deepEqual(item, {
    programDayId: "day-1",
    programId: "program-1",
    scheduledDate: "2026-03-01",
    dayLabel: "Upper Body",
    dayType: "hypertrophy",
    durationMins: 60,
    heroMediaId: null,
    highlight: null,
  });
});

test("mapTimelineItem includes exerciseId in highlight", () => {
  const highlightMap = new Map([
    [
      "day-1",
      {
        program_day_id: "day-1",
        max_weight_kg: 140,
        exercise_name: "Barbell Back Squat",
        exercise_id: "bb_back_squat",
      },
    ],
  ]);

  const row = {
    program_day_id: "day-1",
    program_id: "prog-1",
    scheduled_date: "2026-04-14",
    day_label: "Lower A",
    day_type: "strength",
    session_duration_mins: 60,
    hero_media_id: null,
  };

  const item = mapTimelineItem(row, highlightMap);

  assert.equal(item.highlight?.exerciseId, "bb_back_squat");
  assert.equal(item.highlight?.exerciseName, "Barbell Back Squat");
  assert.equal(item.highlight?.value, 140);
});

test("mapTimelineItem returns null highlight when no highlight found", () => {
  const highlightMap = new Map();
  const row = {
    program_day_id: "day-2",
    program_id: "prog-1",
    scheduled_date: "2026-04-15",
    day_label: "Upper A",
    day_type: "strength",
    session_duration_mins: 55,
    hero_media_id: null,
  };

  const item = mapTimelineItem(row, highlightMap);
  assert.equal(item.highlight, null);
});

test("timeline handler uses completed-only query and ignores draft logs in highlight query", async () => {
  const queries = [];
  const db = {
    async query(text, params) {
      queries.push({ text, params });
      if (queries.length === 1) {
        return {
          rows: [
            {
              program_day_id: "11111111-1111-4111-8111-111111111111",
              program_id: "program-a",
              scheduled_date: "2026-03-02",
              day_label: "Lower",
              day_type: "strength",
              session_duration_mins: "55",
              hero_media_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
            {
              program_day_id: "22222222-2222-4222-8222-222222222222",
              program_id: "program-b",
              scheduled_date: "2026-03-01",
              day_label: "Upper",
              day_type: "strength",
              session_duration_mins: "50",
              hero_media_id: null,
            },
          ],
        };
      }
      return {
        rows: [
          {
            program_day_id: "11111111-1111-4111-8111-111111111111",
            max_weight_kg: "120",
            exercise_name: "Back Squat",
            exercise_id: "bb_back_squat",
          },
        ],
      };
    },
  };

  const handler = createHistoryTimelineHandler(db);
  const req = {
    auth: { user_id: "user-123" },
    query: { limit: "2" },
    headers: {},
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 2);
  assert.ok(queries[0].text.includes("pd.is_completed = TRUE"));
  assert.ok(queries[0].text.includes("WHERE p.user_id = $1"));
  assert.ok(queries[1].text.includes("l.is_draft = FALSE"));
  assert.ok(queries[1].text.includes("l.weight_kg IS NOT NULL"));
  assert.deepEqual(queries[0].params, ["user-123", 2, null, null]);

  assert.equal(res.body.items.length, 2);
  assert.deepEqual(res.body.items[0].highlight, {
    value: 120,
    exerciseName: "Back Squat",
    exerciseId: "bb_back_squat",
  });
  assert.equal(res.body.items[1].highlight, null);
  assert.deepEqual(res.body.nextCursor, {
    cursorDate: "2026-03-01",
    cursorId: "22222222-2222-4222-8222-222222222222",
  });
});

test("timeline cursor pagination passes tuple cursor and avoids duplicates between pages", async () => {
  const page1Rows = [
    {
      program_day_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      program_id: "program-a",
      scheduled_date: "2026-03-03",
      day_label: "A",
      day_type: "strength",
      session_duration_mins: 45,
      hero_media_id: null,
    },
    {
      program_day_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      program_id: "program-a",
      scheduled_date: "2026-03-02",
      day_label: "B",
      day_type: "strength",
      session_duration_mins: 45,
      hero_media_id: null,
    },
  ];

  const page2Rows = [
    {
      program_day_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      program_id: "program-a",
      scheduled_date: "2026-03-01",
      day_label: "C",
      day_type: "strength",
      session_duration_mins: 45,
      hero_media_id: null,
    },
  ];

  let call = 0;
  const timelineParams = [];
  const db = {
    async query(text, params) {
      if (text.includes("FROM program_day pd")) {
        timelineParams.push(params);
        call += 1;
        return { rows: call === 1 ? page1Rows : page2Rows };
      }
      return { rows: [] };
    },
  };

  const handler = createHistoryTimelineHandler(db);

  const res1 = createMockRes();
  await handler(
    {
      auth: { user_id: "user-123" },
      query: { limit: "2" },
      headers: {},
    },
    res1,
  );

  const page1Ids = new Set(res1.body.items.map((item) => item.programDayId));
  assert.deepEqual(res1.body.nextCursor, {
    cursorDate: "2026-03-02",
    cursorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  });

  const res2 = createMockRes();
  await handler(
    {
      auth: { user_id: "user-123" },
      query: {
        limit: "2",
        cursorDate: res1.body.nextCursor.cursorDate,
        cursorId: res1.body.nextCursor.cursorId,
      },
      headers: {},
    },
    res2,
  );

  assert.deepEqual(timelineParams[0], ["user-123", 2, null, null]);
  assert.deepEqual(timelineParams[1], [
    "user-123",
    2,
    "2026-03-02",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ]);

  const page2Ids = res2.body.items.map((item) => item.programDayId);
  assert.equal(page2Ids.some((id) => page1Ids.has(id)), false);
});

