import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { requireInternalToken } from "../../src/middleware/auth.js";
import { createAdminHyroxTestHarnessRouter, normalizeSex } from "../../src/routes/adminHyroxTestHarness.js";

const nativeFetch = globalThis.fetch;
const nativeInternalToken = process.env.INTERNAL_API_TOKEN;

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

function mockHyroxHtml() {
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
    `<tr class="f-time_finish_netto"><td class="f-time_finish_netto">1:42:00</td><td></td></tr>`,
  ].join("\n");

  return `<html><body><table><tr><td class="f-__fullname">Alex Runner</td></tr>${splitRows}</table></body></html>`;
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

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-harness-/);
  assert.match(body, /# HYROX QA Test Harness/);
  assert.match(body, /## Mode 1: Target With Target Time/);
  assert.match(body, /## Mode 2: Analyse Without Target Time/);
  assert.doesNotMatch(body, /## Mode 3/);
  assert.match(body, /```html/);
  assert.match(body, /## Comparison Notes/);
  assert.match(body, /## QA Flags/);
  assert.match(body, /target_email_does_not_show_zero_target_time/);
  assert.match(body, /Target-mode carousel text/);
  assert.match(body, /Analyse-mode carousel text/);
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
  assert.match(body, /## Mode 1: Target With Target Time/);
  assert.match(body, /## Mode 2: Analyse Without Target Time/);
  assert.match(body, /### HTML/);
  assert.match(body, /```html/);
});

test("generates downloadable email HTML zip artifact", async () => {
  stubSuccessfulHyroxFetch();

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

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    preview: true,
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(body.success, true);
  assert.equal(body.cases.length, 1);
  assert.equal(body.cases[0].athleteName, "Alex Runner");
  assert.equal(body.cases[0].finishTimeFormatted, "1:42:00");
  assert.equal(body.cases[0].targetTimeFormatted, "1:15:00");
  assert.equal(body.cases[0].modes.length, 2);
  assert.equal(body.cases[0].modes[0].calculatorMode, "target");
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
  assert.match(body, /## Mode 1: Target With Target Time/);
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
