import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAdminProgramQualityRouter } from "../src/routes/adminProgramQuality.js";

const validMatrix = {
  config_keys: ["hypertrophy_default_v1"],
  program_types: ["hypertrophy"],
  fitness_ranks: [1],
  equipment_presets: ["commercial_gym"],
  days_per_week: [3],
  duration_mins: [45],
};

function makeReview(requestBody) {
  const previewFailure = requestBody.config_keys.includes("missing_config");
  return {
    summary: { status: previewFailure ? "fail" : "pass", critical_count: previewFailure ? 1 : 0, warning_count: 0, suggestion_count: 0 },
    checks: {
      slot_coverage: [],
      narration_coverage: [],
      rep_rule_coverage: [],
      health_report: [],
      preview_generation: previewFailure ? [{ severity: "critical", scope: "preview", finding: "Preview generation failed: missing config" }] : [],
    },
    preview_rows: [{ program_type: "hypertrophy", config_key: requestBody.config_keys[0], exercise_id: "ex1" }],
    ai_packet: {
      prompt_version: "program_quality_review_v1",
      coaching_prompt: "PROMPT START\nReview this program.",
      csv: "program_type,config_key\r\nhypertrophy,hypertrophy_default_v1\r\n",
    },
  };
}

async function withApp(fn) {
  const previousToken = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-token";
  const app = express();
  app.use(express.json());
  app.use("/admin", createAdminProgramQualityRouter({
    reviewRunner: async ({ requestBody }) => makeReview(requestBody),
    matrixReader: async () => ({ version: 1, default_matrix: validMatrix, thresholds: {} }),
  }));
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    if (previousToken === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previousToken;
  }
}

function authHeaders(extra = {}) {
  return { "content-type": "application/json", "x-internal-token": "test-token", ...extra };
}

test("POST /admin/api/program-quality/review returns the golden path shape", async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/api/program-quality/review`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validMatrix),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.summary.status, "string");
    assert.ok(body.checks);
    assert.equal(typeof body.requested_at, "string");
    assert.equal(typeof body.matrix_hash, "string");
  });
});

test("POST /admin/api/program-quality/review requires auth", async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/api/program-quality/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validMatrix),
    });
    assert.equal(res.status, 401);
  });
});

test("include_ai_packet returns packet prompt and CSV", async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/api/program-quality/review`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validMatrix, include_ai_packet: true }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ai_packet.prompt_version, "program_quality_review_v1");
    assert.match(body.ai_packet.coaching_prompt, /PROMPT START/);
    assert.match(body.ai_packet.csv, /program_type/);
  });
});

test("include_preview_rows returns preview rows", async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/api/program-quality/review`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validMatrix, include_preview_rows: true }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.preview_rows));
    assert.ok(body.preview_rows.length >= 1);
  });
});

test("GET /admin/api/program-quality/packet returns an AI packet", async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/api/program-quality/packet`, { headers: { "x-internal-token": "test-token" } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.ai_packet);
  });
});

test("invalid config key is reported as critical preview finding", async () => {
  await withApp(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/admin/api/program-quality/review`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validMatrix, config_keys: ["missing_config"] }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.checks.preview_generation[0].severity, "critical");
  });
});

test("missing required field returns 400", async () => {
  await withApp(async (baseUrl) => {
    const { config_keys, ...bodyWithoutConfigKeys } = validMatrix;
    const res = await fetch(`${baseUrl}/admin/api/program-quality/review`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(bodyWithoutConfigKeys),
    });
    assert.equal(res.status, 400);
  });
});
