import assert from "node:assert/strict";
import test from "node:test";
import { analyse, submissionInput } from "../src/hyrox/hyroxController.js";
import { buildBrowserSummary } from "../src/hyrox/reports/browserSummaryBuilder.js";
import { pool } from "../src/db.js";

const analysisJson = {
  segments: [
    { segmentKey: "total_time", type: "aggregate", percentile: 60 },
    { segmentKey: "run_1", type: "run" },
    { segmentKey: "run_2", type: "run" },
    { segmentKey: "run_3", type: "run" },
    { segmentKey: "run_4", type: "run" },
    { segmentKey: "run_5", type: "run" },
    { segmentKey: "run_6", type: "run" },
    { segmentKey: "run_7", type: "run" },
    { segmentKey: "run_8", type: "run" },
    { segmentKey: "ski_erg", type: "station" },
    { segmentKey: "sled_push", type: "station" },
    { segmentKey: "sled_pull", type: "station" },
    { segmentKey: "burpee_broad_jump", type: "station" },
    { segmentKey: "row", type: "station" },
    { segmentKey: "farmers_carry", type: "station" },
    { segmentKey: "sandbag_lunges", type: "station" },
    { segmentKey: "wall_balls", type: "station" },
  ],
  benchmarkContext: { primaryBenchmarkGroup: { label: "Open Men 30-34" } },
  athleteArchetype: {
    key: "strong_runner_station_limited",
    label: "Strong runner, station limited",
    confidence: "medium",
  },
  workRunBalance: {
    runShare: 0.55,
    workShare: 0.35,
    profileType: "runner_dominant",
  },
};

function validRequestBody(overrides = {}) {
  return {
    calculatorMode: "analyse",
    athlete: { email: "alex@example.com", sex: "male", ageGroup: "30-34" },
    race: { division: "relay", finishTimeSeconds: 5520 },
    splits: [],
    marketingConsent: false,
    ...overrides,
  };
}

async function runAnalyseWithMockPool(body) {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (sql, params = []) => {
    queries.push({ sql, params });
    if (/INSERT INTO hyrox_submissions/i.test(sql)) {
      return {
        rows: [{
          id: `sub-${queries.length}`,
          email: params[0],
          app_link_consent: params[16],
          linked_app_user_id: null,
        }],
        rowCount: 1,
      };
    }
    if (/INSERT INTO hyrox_analyses/i.test(sql)) return { rows: [{ id: "analysis-1" }], rowCount: 1 };
    if (/INSERT INTO hyrox_email_log/i.test(sql)) return { rows: [{ id: "email-log-1" }], rowCount: 1 };
    if (/UPDATE hyrox_/i.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const response = {
    statusCode: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };

  try {
    await analyse({ body, headers: {}, log: { error() {}, warn() {} } }, response);
    await new Promise((resolve) => setImmediate(resolve));
    return { response, queries };
  } finally {
    pool.query = originalQuery;
  }
}

test("submissionInput carries analyse calculatorMode without requiring target time", () => {
  const input = submissionInput({
    calculatorMode: "analyse",
    athlete: { email: "alex@example.com", sex: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5520 },
    splits: [],
  });

  assert.equal(input.calculatorMode, "analyse");
  assert.equal(input.athleteContext.calculatorMode, "analyse");
  assert.equal(input.athleteContext.targetFinishTimeSeconds, null);
});

test("browser summary exposes analyse mode archetype and work/run balance", () => {
  const summary = buildBrowserSummary(analysisJson, [], {}, "analyse");

  assert.equal(summary.calculatorMode, "analyse");
  assert.equal(summary.athleteArchetype.key, "strong_runner_station_limited");
  assert.equal(summary.athleteArchetype.label, "Strong runner, station limited");
  assert.equal(summary.workRunBalance.runSharePct, 55);
  assert.equal(summary.workRunBalance.workSharePct, 35);
  assert.equal(summary.workRunBalance.profileType, "runner_dominant");
});

test("browser summary defaults calculatorMode to target", () => {
  const summary = buildBrowserSummary(analysisJson);

  assert.equal(summary.calculatorMode, "target");
});

test("POST /api/hyrox/analyse stores app link consent when true and leaves linked app user null", async () => {
  const { response, queries } = await runAnalyseWithMockPool(validRequestBody({ appLinkConsent: true }));
  const insert = queries.find((q) => /INSERT INTO hyrox_submissions/i.test(q.sql));

  assert.equal(response.statusCode, 200);
  assert.equal(insert.params[16], true);
  assert.equal(response.jsonBody.submissionId.startsWith("sub-"), true);
});

test("POST /api/hyrox/analyse stores app link consent false when false or omitted", async () => {
  const explicit = await runAnalyseWithMockPool(validRequestBody({ appLinkConsent: false }));
  const omittedBody = validRequestBody();
  delete omittedBody.appLinkConsent;
  const omitted = await runAnalyseWithMockPool(omittedBody);

  assert.equal(explicit.queries.find((q) => /INSERT INTO hyrox_submissions/i.test(q.sql)).params[16], false);
  assert.equal(omitted.queries.find((q) => /INSERT INTO hyrox_submissions/i.test(q.sql)).params[16], false);
});

test("POST /api/hyrox/analyse response keys are unchanged by app link consent", async () => {
  const { response } = await runAnalyseWithMockPool(validRequestBody({ appLinkConsent: true }));

  assert.deepEqual(Object.keys(response.jsonBody).sort(), [
    "analysisScope",
    "analysisVersion",
    "benchmarkContext",
    "browserSummary",
    "calculatorMode",
    "carouselDataAvailable",
    "muscleGroupProfile",
    "reason",
    "reportSentTo",
    "status",
    "submissionId",
  ].sort());
});

