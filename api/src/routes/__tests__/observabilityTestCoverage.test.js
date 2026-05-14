import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { adminObservabilityRouter, computeCoverageStats } from "../adminObservability.js";

function entries(count, status, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    type: overrides.type ?? "component",
    source: overrides.source ?? `src/components/example/${status}-${index}.tsx`,
    test: status === "covered" ? `src/components/example/${status}-${index}.component.test.tsx` : null,
    status,
    tags: overrides.tags ?? ["auth"],
    reason: status === "covered" ? "" : "test fixture reason",
  }));
}

async function withServer(app, fn) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("computeCoverageStats returns happy path stats", () => {
  const stats = computeCoverageStats({
    entries: [
      ...entries(8, "covered"),
      ...entries(2, "gap"),
      ...entries(3, "excluded"),
    ],
  });

  assert.equal(stats.covered, 8);
  assert.equal(stats.gap, 2);
  assert.equal(stats.excluded, 3);
  assert.equal(stats.testable, 10);
  assert.equal(stats.coveragePct, 80);
  assert.equal(stats.maturityScore, 80);
  assert.equal(stats.maturityBand, "mature");
  assert.equal(stats.gaps.length, 2);
});

test("computeCoverageStats applies maturity band boundaries", () => {
  assert.equal(computeCoverageStats({ entries: [...entries(9, "covered"), ...entries(1, "gap")] }).maturityBand, "comprehensive");
  assert.equal(computeCoverageStats({ entries: [...entries(89, "covered"), ...entries(11, "gap")] }).maturityBand, "mature");
  assert.equal(computeCoverageStats({ entries: [...entries(79, "covered"), ...entries(21, "gap")] }).maturityBand, "maturing");
  assert.equal(computeCoverageStats({ entries: [...entries(59, "covered"), ...entries(41, "gap")] }).maturityBand, "developing");
});

test("computeCoverageStats groups entries by tag", () => {
  const stats = computeCoverageStats({
    entries: [
      ...entries(3, "covered", { tags: ["auth"] }),
      ...entries(1, "covered", { tags: ["program"] }),
      ...entries(1, "gap", { tags: ["program"] }),
    ],
  });

  assert.equal(stats.byTag.length, 2);
  assert.equal(stats.byTag[0].tag, "auth");
  const program = stats.byTag.find((row) => row.tag === "program");
  assert.equal(program.gap, 1);
});

test("computeCoverageStats sorts screen gaps before component gaps", () => {
  const stats = computeCoverageStats({
    entries: [
      {
        type: "component",
        source: "src/components/program/WeekPillStrip.tsx",
        status: "gap",
        tags: ["program"],
        reason: "component gap",
      },
      {
        type: "screen",
        source: "src/screens/auth/LoginScreen.tsx",
        status: "gap",
        tags: ["auth"],
        reason: "screen gap",
      },
    ],
  });

  assert.equal(stats.gaps[0].type, "screen");
  assert.equal(stats.gaps[0].source, "src/screens/auth/LoginScreen.tsx");
});

test("computeCoverageStats handles an empty manifest", () => {
  const stats = computeCoverageStats({});

  assert.equal(stats.covered, 0);
  assert.equal(stats.gap, 0);
  assert.equal(stats.excluded, 0);
  assert.equal(stats.coveragePct, 0);
  assert.equal(stats.maturityScore, 0);
  assert.equal(stats.maturityBand, "developing");
});

test("test coverage route returns available false when manifest file is missing", async () => {
  const oldToken = process.env.INTERNAL_API_TOKEN;
  const oldEngineKey = process.env.ENGINE_KEY;
  const oldManifestPath = process.env.COVERAGE_MANIFEST_PATH;
  process.env.INTERNAL_API_TOKEN = "test-token";
  delete process.env.ENGINE_KEY;
  process.env.COVERAGE_MANIFEST_PATH = "C:/this/path/does/not/exist/coverage-manifest.json";

  const app = express();
  app.use("/api/admin/observability", adminObservabilityRouter);

  try {
    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/observability/test-coverage`, {
        headers: { "x-internal-token": "test-token" },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(body, { ok: true, available: false });
    });
  } finally {
    if (oldToken == null) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = oldToken;
    if (oldEngineKey == null) delete process.env.ENGINE_KEY;
    else process.env.ENGINE_KEY = oldEngineKey;
    if (oldManifestPath == null) delete process.env.COVERAGE_MANIFEST_PATH;
    else process.env.COVERAGE_MANIFEST_PATH = oldManifestPath;
  }
});

test("test coverage route requires admin auth", async () => {
  const oldToken = process.env.INTERNAL_API_TOKEN;
  const oldEngineKey = process.env.ENGINE_KEY;
  process.env.INTERNAL_API_TOKEN = "test-token";
  delete process.env.ENGINE_KEY;

  const app = express();
  app.use("/api/admin/observability", adminObservabilityRouter);

  try {
    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/observability/test-coverage`);
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.ok, false);
      assert.equal(body.code, "unauthorized");
    });
  } finally {
    if (oldToken == null) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = oldToken;
    if (oldEngineKey == null) delete process.env.ENGINE_KEY;
    else process.env.ENGINE_KEY = oldEngineKey;
  }
});
