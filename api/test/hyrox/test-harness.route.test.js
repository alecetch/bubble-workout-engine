import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireInternalToken } from "../../src/middleware/auth.js";
import {
  canonicalJsonStringify,
  contentHashForAnalysisJson,
  createAdminHyroxTestHarnessRouter,
  emailHtmlEntriesFromHarnessEntries,
  normalizeSex,
} from "../../src/routes/adminHyroxTestHarness.js";

const nativeFetch = globalThis.fetch;
const nativeInternalToken = process.env.INTERNAL_API_TOKEN;
const nativeHarnessRunsDir = process.env.HYROX_HARNESS_RUNS_DIR;
const nativeHarnessRunsMaxKept = process.env.HYROX_HARNESS_RUNS_MAX_KEPT;

function app(pool = null) {
  const instance = express();
  instance.use(express.json());
  instance.use("/api/admin", requireInternalToken, createAdminHyroxTestHarnessRouter(pool));
  return instance;
}

async function request(body, { token = "test-harness-token", pool = null, path = "/api/admin/hyrox/test-harness" } = {}) {
  const server = app(pool).listen(0);
  const { port } = server.address();
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["x-internal-token"] = token;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = response.headers.get("content-type")?.includes("application/json")
      ? JSON.parse(text)
      : text;
    return { response, body: parsed };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestBinary(body, { token = "test-harness-token", pool = null, path = "/api/admin/hyrox/test-harness" } = {}) {
  const server = app(pool).listen(0);
  const { port } = server.address();
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["x-internal-token"] = token;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { response, body: buffer };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getJson(pathValue, { token = "test-harness-token", pool = null } = {}) {
  const server = app(pool).listen(0);
  const { port } = server.address();
  try {
    const headers = {};
    if (token) headers["x-internal-token"] = token;
    const response = await fetch(`http://127.0.0.1:${port}${pathValue}`, { headers });
    const text = await response.text();
    return {
      response,
      body: response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : text,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function mockHyroxHtml() {
  return mockHyroxHtmlWithFinish("1:42:00");
}

function mockHyroxHtmlWithFinish(finishTime = "1:42:00") {
  function splitRow(cls, time, rank) {
    return `<tr class="${cls}"><td class="${cls}">${time}</td><td>${rank}</td></tr>`;
  }

  const splitRows = [
    splitRow("f-time_01", "7:00", ""),
    splitRow("f-time_11", "4:05", "100"),
    splitRow("f-time_02", "7:10", ""),
    splitRow("f-time_12", "5:20", "110"),
    splitRow("f-time_03", "7:15", ""),
    splitRow("f-time_13", "5:30", "120"),
    splitRow("f-time_04", "7:20", ""),
    splitRow("f-time_14", "6:00", "130"),
    splitRow("f-time_05", "7:25", ""),
    splitRow("f-time_15", "4:30", "140"),
    splitRow("f-time_06", "7:30", ""),
    splitRow("f-time_16", "6:15", "150"),
    splitRow("f-time_07", "7:35", ""),
    splitRow("f-time_17", "6:45", "160"),
    splitRow("f-time_08", "7:40", ""),
    splitRow("f-time_18", "7:00", "170"),
    `<tr class="f-time_60"><td class="f-time_60">18:00</td><td>88</td></tr>`,
    `<tr class="f-time_finish_netto"><td class="f-time_finish_netto">${finishTime}</td><td></td></tr>`,
  ].join("\n");

  return `<html><body><table><tr><td class="f-__fullname">Alex Runner</td></tr>${splitRows}</table></body></html>`;
}

function stubSuccessfulHyroxFetchWithFinish(finishTime) {
  const html = mockHyroxHtmlWithFinish(finishTime);
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    return { ok: true, text: async () => html };
  };
}

function stubSuccessfulHyroxFetch() {
  const html = mockHyroxHtml();
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    return { ok: true, text: async () => html };
  };
}

function stubMixedHyroxFetch() {
  const html = mockHyroxHtml();
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    if (String(url).includes("fail=1")) return { ok: false, status: 503, text: async () => "unavailable" };
    return { ok: true, text: async () => html };
  };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hyrox-harness-runs-"));
}

function runDirs(baseDir) {
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function onlyRunDir(baseDir) {
  const dirs = runDirs(baseDir);
  assert.equal(dirs.length, 1);
  return path.join(baseDir, dirs[0]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test.beforeEach(() => {
  process.env.INTERNAL_API_TOKEN = "test-harness-token";
});

test.afterEach(() => {
  globalThis.fetch = nativeFetch;
  if (nativeInternalToken === undefined) {
    delete process.env.INTERNAL_API_TOKEN;
  } else {
    process.env.INTERNAL_API_TOKEN = nativeInternalToken;
  }
  if (nativeHarnessRunsDir === undefined) {
    delete process.env.HYROX_HARNESS_RUNS_DIR;
  } else {
    process.env.HYROX_HARNESS_RUNS_DIR = nativeHarnessRunsDir;
  }
  if (nativeHarnessRunsMaxKept === undefined) {
    delete process.env.HYROX_HARNESS_RUNS_MAX_KEPT;
  } else {
    process.env.HYROX_HARNESS_RUNS_MAX_KEPT = nativeHarnessRunsMaxKept;
  }
});

test("canonicalJsonStringify and content hashing are stable across object insertion order", () => {
  const first = { b: 2, a: { z: [3, { y: true }], x: "same" } };
  const second = { a: { x: "same", z: [3, { y: true }] }, b: 2 };
  const different = { a: { x: "changed", z: [3, { y: true }] }, b: 2 };

  assert.equal(canonicalJsonStringify(first), canonicalJsonStringify(second));
  assert.equal(contentHashForAnalysisJson(first), contentHashForAnalysisJson(second));
  assert.notEqual(contentHashForAnalysisJson(first), contentHashForAnalysisJson(different));
});

test("requires internal token", async () => {
  const { response, body } = await request(
    { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00" },
    { token: "" },
  );

  assert.equal(response.status, 401);
  assert.equal(body.code, "unauthorized");
});

test("rejects non-HYROX results URLs", async () => {
  const { response, body } = await request({ url: "https://example.com/result", targetTime: "1:15:00" });

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_url");
});

test("rejects unparseable target times", async () => {
  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "next Tuesday",
  });

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_target_time");
});

test("rejects ambiguous implausible target times before generating harness output", async () => {
  const { response, body } = await request({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00" },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:30" },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_target_time");
  assert.match(body.message, /case 2/);
  assert.match(body.message, /1:30/);
  assert.match(body.message, /1:30:00/);
});

test("returns 422 when the HYROX page cannot be imported", async () => {
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    return { ok: false, status: 503, text: async () => "unavailable" };
  };

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 422);
  assert.equal(body.error, "import_failed");
  assert.equal(body.reason, "fetch_failed_503");
});

test("generates markdown for both harness modes", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  const runId = response.headers.get("x-hyrox-harness-run-id");
  assert.match(runId ?? "", /^\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{8}$/);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-harness-/);
  assert.match(response.headers.get("x-hyrox-harness-run-dir") ?? "", new RegExp(runId));
  assert.match(body, new RegExp(`Run ID: ${runId}`));
  assert.match(body, /# HYROX QA Test Harness/);
  assert.match(body, /## Mode 1: Analyse my race/);
  assert.match(body, /## Mode 3: Hit a target time/);
  assert.doesNotMatch(body, /## Mode 2/);
  assert.match(body, /```html/);
  assert.match(body, /## Comparison Notes/);
  assert.match(body, /## QA Flags/);
  assert.match(body, /target_email_does_not_show_zero_target_time/);
  assert.match(body, /Target-mode carousel text/);
  assert.match(body, /Analyse-mode carousel text/);
});

test("persists a successful single-case harness run to disk", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-hyrox-harness-run-id"), path.basename(onlyRunDir(baseDir)));
  assert.match(body, /# HYROX QA Test Harness/);

  const runDir = onlyRunDir(baseDir);
  const manifest = readJson(path.join(runDir, "manifest.json"));
  assert.match(manifest.runId, /^\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{8}$/);
  assert.equal(manifest.isPack, false);
  assert.equal(manifest.cases.length, 1);
  assert.equal(manifest.cases[0].ok, true);
  assert.equal(manifest.cases[0].athleteDisplayName, "Alex Runner");
  assert.equal(manifest.cases[0].targetFinishTimeSeconds, 4500);
  assert.equal(manifest.cases[0].modes.length, 2);
  assert.match(manifest.cases[0].modes[0].contentHash, /^[0-9a-f]{64}$/);
  assert.ok(fs.readFileSync(path.join(runDir, "qa.md"), "utf8").includes("# HYROX QA Test Harness"));

  const analyseMode = manifest.cases[0].modes.find((mode) => mode.calculatorMode === "analyse");
  assert.ok(analyseMode);
  assert.equal(analyseMode.emailFile, "01-analyse-email.html");
  assert.equal(analyseMode.carouselFile, "01-analyse-carousel.json");
  const emailHtml = fs.readFileSync(path.join(runDir, analyseMode.emailFile), "utf8");
  const expectedFiles = emailHtmlEntriesFromHarnessEntries([{
    result: {
      parsed: { athleteName: "Alex Runner" },
      modeEntries: [{
        mode: { modeName: analyseMode.modeName, calculatorMode: analyseMode.calculatorMode },
        result: { emailReport: { emailHtml } },
      }],
    },
  }]);
  assert.equal(emailHtml, expectedFiles[0].html);
  const carousel = readJson(path.join(runDir, analyseMode.carouselFile));
  assert.ok(Array.isArray(carousel.slides));
  assert.equal(typeof carousel.carouselHtml, "string");
});

test("lists persisted harness runs as needing review when no assessments file exists", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  const { response, body } = await getJson("/api/admin/hyrox/test-harness/runs");

  assert.equal(response.status, 200);
  assert.equal(body.runs.length, 1);
  assert.equal(body.runs[0].cases[0].ok, true);
  assert.equal(body.runs[0].cases[0].modes.length, 2);
  assert.equal(body.runs[0].cases[0].modes.every((mode) => mode.needsReview === true), true);
  assert.equal(body.runs[0].cases[0].modes.every((mode) => mode.lastAssessment === null), true);
});

test("lists persisted harness runs with matching assessments as reviewed", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  const url = "https://results.hyrox.com/season-8/?x=1";

  await request({ url, targetTime: "1:15:00" });
  const manifest = readJson(path.join(onlyRunDir(baseDir), "manifest.json"));
  const analyseMode = manifest.cases[0].modes.find((mode) => mode.calculatorMode === "analyse");
  const assessment = {
    contentHash: analyseMode.contentHash,
    status: "approved",
    reviewer: "Claude",
    reviewedAt: "2026-07-23T12:00:00.000Z",
  };
  fs.writeFileSync(path.join(baseDir, "_assessments.json"), `${JSON.stringify({ [`${url}|analyse`]: assessment }, null, 2)}\n`);

  const { response, body } = await getJson("/api/admin/hyrox/test-harness/runs");

  assert.equal(response.status, 200);
  const listedAnalyseMode = body.runs[0].cases[0].modes.find((mode) => mode.calculatorMode === "analyse");
  const listedTargetMode = body.runs[0].cases[0].modes.find((mode) => mode.calculatorMode === "target");
  assert.equal(listedAnalyseMode.needsReview, false);
  assert.deepEqual(listedAnalyseMode.lastAssessment, assessment);
  assert.equal(listedTargetMode.needsReview, true);
});

test("changed harness analysis data flips a stale assessment back to needing review", async () => {
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  const url = "https://results.hyrox.com/season-8/?x=1";

  stubSuccessfulHyroxFetchWithFinish("1:42:00");
  await request({ url, targetTime: "1:15:00" });
  const firstRun = onlyRunDir(baseDir);
  const firstManifest = readJson(path.join(firstRun, "manifest.json"));
  const firstAnalyseHash = firstManifest.cases[0].modes.find((mode) => mode.calculatorMode === "analyse").contentHash;
  fs.writeFileSync(path.join(baseDir, "_assessments.json"), `${JSON.stringify({ [`${url}|analyse`]: { contentHash: firstAnalyseHash, status: "approved" } }, null, 2)}\n`);

  stubSuccessfulHyroxFetchWithFinish("1:43:00");
  await request({ url, targetTime: "1:15:00" });

  const { response, body } = await getJson("/api/admin/hyrox/test-harness/runs");

  assert.equal(response.status, 200);
  assert.equal(body.runs.length, 2);
  const analyseModes = body.runs.map((run) => run.cases[0].modes.find((mode) => mode.calculatorMode === "analyse"));
  const previousAnalyseMode = analyseModes.find((mode) => mode.contentHash === firstAnalyseHash);
  const changedAnalyseMode = analyseModes.find((mode) => mode.contentHash !== firstAnalyseHash);
  assert.ok(previousAnalyseMode);
  assert.ok(changedAnalyseMode);
  assert.equal(previousAnalyseMode.needsReview, false);
  assert.equal(changedAnalyseMode.needsReview, true);
});

test("generates a single-case email artifact", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    artifact: "email",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-email-/);
  assert.match(body, /# HYROX Email Artifact/);
  assert.match(body, /## Mode 1: Analyse my race/);
  assert.match(body, /## Mode 3: Hit a target time/);
  assert.match(body, /### HTML/);
  assert.match(body, /```html/);
});

test("generates downloadable email HTML zip artifact", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await requestBinary({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00" },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:20:00" },
    ],
    artifact: "email_html",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/zip/);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-email-html-pack-2-/);
  assert.equal(response.headers.get("x-hyrox-harness-run-id"), path.basename(onlyRunDir(baseDir)));
  assert.equal(body.subarray(0, 2).toString("utf8"), "PK");
});

test("generates a multi-case Instagram artifact pack", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00" },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:20:00" },
    ],
    artifact: "instagram",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-instagram-pack-2-/);
  assert.match(body, /# HYROX Instagram Pack/);
  assert.match(body, /- URL count: 2/);
  assert.match(body, /# Test Case 1 of 2/);
  assert.match(body, /# Test Case 2 of 2/);
  assert.match(body, /Target-mode carousel text/);
  assert.match(body, /Analyse-mode carousel text/);
});

test("returns structured preview data for rendered harness output", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    preview: true,
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(body.success, true);
  assert.equal(body.runId, response.headers.get("x-hyrox-harness-run-id"));
  assert.equal(body.harnessRun.runId, body.runId);
  assert.equal(body.harnessRun.runDir, onlyRunDir(baseDir));
  assert.equal(body.cases.length, 1);
  assert.equal(body.cases[0].athleteName, "Alex Runner");
  assert.equal(body.cases[0].finishTimeFormatted, "1:42:00");
  assert.equal(body.cases[0].targetTimeFormatted, "1:15:00");
  assert.equal(body.cases[0].modes.length, 2);
  assert.equal(body.cases[0].modes[0].calculatorMode, "analyse");
  assert.equal(typeof body.cases[0].modes[0].emailHtml, "string");
  assert.ok(Array.isArray(body.cases[0].modes[0].carouselSlides));
  assert.ok(Array.isArray(body.cases[0].modes[0].qaFlags));
});

test("generates a combined markdown test pack for multiple URLs", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request({
    urls: [
      "https://results.hyrox.com/season-8/?x=1",
      "https://results.hyrox.com/season-8/?x=2",
    ],
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-harness-pack-2-/);
  assert.match(body, /# HYROX QA Test Pack/);
  assert.match(body, /- URL count: 2/);
  assert.match(body, /# Test Case 1 of 2/);
  assert.match(body, /# Test Case 2 of 2/);
  assert.match(body, /## Mode 1: Analyse my race/);
});

test("generates a combined markdown test pack with per-case target times", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00" },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:20:00" },
    ],
  });

  assert.equal(response.status, 200);
  assert.match(body, /- 1\. https:\/\/results\.hyrox\.com\/season-8\/\?x=1 - target 1:15:00 - ok/);
  assert.match(body, /- 2\. https:\/\/results\.hyrox\.com\/season-8\/\?x=2 - target 1:20:00 - ok/);
  assert.match(body, /- Target time: 1:15:00/);
  assert.match(body, /- Target time: 1:20:00/);
});

test("keeps pack generation useful when one URL fails import", async () => {
  stubMixedHyroxFetch();

  const { response, body } = await request({
    urls: [
      "https://results.hyrox.com/season-8/?x=1",
      "https://results.hyrox.com/season-8/?fail=1",
    ],
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(body, /- Successful cases: 1/);
  assert.match(body, /- Failed cases: 1/);
  assert.match(body, /## Import Failure/);
  assert.match(body, /fetch_failed_503/);
});

test("persists a pack harness run with successful and failed cases", async () => {
  stubMixedHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    urls: [
      "https://results.hyrox.com/season-8/?x=1",
      "https://results.hyrox.com/season-8/?fail=1",
    ],
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(body, /- Failed cases: 1/);

  const runDir = onlyRunDir(baseDir);
  const manifest = readJson(path.join(runDir, "manifest.json"));
  assert.equal(manifest.isPack, true);
  assert.equal(manifest.cases.length, 2);
  assert.equal(manifest.cases[0].ok, true);
  assert.equal(manifest.cases[0].modes.length, 2);
  assert.equal(manifest.cases[1].ok, false);
  assert.equal(manifest.cases[1].reason, "fetch_failed_503");
  assert.deepEqual(manifest.cases[1].modes, []);
  const qa = fs.readFileSync(path.join(runDir, "qa.md"), "utf8");
  assert.match(qa, /# HYROX QA Test Pack/);
  assert.match(qa, /fetch_failed_503/);

  const listed = await getJson("/api/admin/hyrox/test-harness/runs");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.runs[0].cases[1].ok, false);
  assert.deepEqual(listed.body.runs[0].cases[1].modes, []);
});

test("harness persistence failure does not change the normal response", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  const filePath = path.join(baseDir, "not-a-directory");
  fs.writeFileSync(filePath, "nope");
  process.env.HYROX_HARNESS_RUNS_DIR = filePath;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /# HYROX QA Test Harness/);
});

test("harness run persistence enforces retention limit", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  process.env.HYROX_HARNESS_RUNS_MAX_KEPT = "2";
  for (const name of [
    "2026-07-20T010101-aaaaaaaa",
    "2026-07-21T010101-bbbbbbbb",
    "2026-07-22T010101-cccccccc",
  ]) {
    fs.mkdirSync(path.join(baseDir, name));
  }

  const { response } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  const dirs = runDirs(baseDir);
  assert.equal(dirs.length, 2);
  assert.ok(dirs.some((name) => /^\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{8}$/.test(name)));
  assert.ok(dirs.includes("2026-07-22T010101-cccccccc"));
});

test("rejects invalid URLs inside a test pack", async () => {
  const { response, body } = await request({
    urls: [
      "https://results.hyrox.com/season-8/?x=1",
      "https://example.com/result",
    ],
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_url");
});

test("imports metadata for test pack coverage without generating markdown", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request(
    {
      urls: [
        "https://results.hyrox.com/season-8/?x=1",
        "https://results.hyrox.com/season-8/?x=2",
      ],
    },
    { path: "/api/admin/hyrox/test-harness/metadata" },
  );

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.count, 2);
  assert.equal(body.cases[0].ok, true);
  assert.equal(body.cases[0].athleteName, "Alex Runner");
  assert.equal(body.cases[0].finishTimeSeconds, 6120);
  assert.equal(body.cases[0].finishTimeFormatted, "1:42:00");
});

test("metadata import keeps per-case failures in the response", async () => {
  stubMixedHyroxFetch();

  const { response, body } = await request(
    {
      urls: [
        "https://results.hyrox.com/season-8/?x=1",
        "https://results.hyrox.com/season-8/?fail=1",
      ],
    },
    { path: "/api/admin/hyrox/test-harness/metadata" },
  );

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.cases[0].ok, true);
  assert.equal(body.cases[1].ok, false);
  assert.equal(body.cases[1].reason, "fetch_failed_503");
});

// --- Sex normalization regression tests ---
// Root cause: sexFromUrl() returned "M"/"W" (uppercase single letters), but DB benchmark group
// keys store gender as "male"/"female". normalizeSex() bridges the gap so key lookups succeed.

test("normalizeSex converts uppercase M to male", () => {
  assert.equal(normalizeSex("M"), "male");
});

test("normalizeSex converts uppercase W to female", () => {
  assert.equal(normalizeSex("W"), "female");
});

test("normalizeSex converts uppercase F to female", () => {
  assert.equal(normalizeSex("F"), "female");
});

test("normalizeSex passes through full-word male/female unchanged", () => {
  assert.equal(normalizeSex("male"), "male");
  assert.equal(normalizeSex("female"), "female");
});

test("normalizeSex returns null for null/empty input", () => {
  assert.equal(normalizeSex(null), null);
  assert.equal(normalizeSex(""), null);
  assert.equal(normalizeSex(undefined), null);
});

test("URL with search[sex]=M normalizes sex to male in metadata response", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request(
    { urls: ["https://results.hyrox.com/season-8/?search%5Bsex%5D=M"] },
    { path: "/api/admin/hyrox/test-harness/metadata" },
  );

  assert.equal(response.status, 200);
  assert.equal(body.cases[0].ok, true);
  assert.equal(body.cases[0].sex, "male");
});

test("URL with search[sex]=W normalizes sex to female in metadata response", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request(
    { urls: ["https://results.hyrox.com/season-8/?search%5Bsex%5D=W"] },
    { path: "/api/admin/hyrox/test-harness/metadata" },
  );

  assert.equal(response.status, 200);
  assert.equal(body.cases[0].ok, true);
  assert.equal(body.cases[0].sex, "female");
});

test("target mode preview includes target_has_goal_benchmark_group QA flag", async () => {
  stubSuccessfulHyroxFetch();

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    preview: true,
  });

  assert.equal(response.status, 200);
  const targetMode = body.cases[0].modes.find((m) => m.calculatorMode === "target");
  assert.ok(targetMode, "target mode should be present");
  const goalFlag = targetMode.qaFlags.find((f) => f.name === "target_has_goal_benchmark_group");
  assert.ok(goalFlag, "target_has_goal_benchmark_group QA flag must be present to catch benchmark key mismatches");
});
