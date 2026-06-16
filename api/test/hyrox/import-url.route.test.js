import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { importUrl } from "../../src/hyrox/hyroxImportController.js";
import { health } from "../../src/hyrox/hyroxController.js";

const nativeFetch = globalThis.fetch;

function app() {
  const instance = express();
  instance.use(express.json());
  instance.post("/api/hyrox/import-url", importUrl);
  instance.get("/api/hyrox/health", health);
  return instance;
}

async function request(path, body, method = "POST") {
  const server = app().listen(0);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    return { response, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test.afterEach(() => {
  globalThis.fetch = nativeFetch;
});

test("rejects non-hyrox.com URL", async () => {
  const { response, body } = await request("/api/hyrox/import-url", { url: "https://evil.com/steal" });
  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_url");
});

test("rejects missing URL", async () => {
  const { response, body } = await request("/api/hyrox/import-url", {});
  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_url");
});

test("returns fetch_failed on network error", async () => {
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    throw new Error("network");
  };
  const { response, body } = await request("/api/hyrox/import-url", { url: "https://results.hyrox.com/season-8/?x=1" });
  assert.equal(response.status, 200);
  assert.deepEqual(body, { success: false, reason: "fetch_failed" });
});

test("GET /api/hyrox/health unaffected", async () => {
  const { response, body } = await request("/api/hyrox/health", null, "GET");
  assert.equal(response.status, 200);
  assert.ok(["ok", "degraded"].includes(body.status));
});

test("returns parsed HTML ranks and replay data from HYROX result URL", async () => {
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
  const replayRows = `
    <div id="detail-box-splits">
      <tr><th class="desc">1000m SkiErg In</th><td class="diff">0:45</td></tr>
      <tr><th class="desc">Rox Out</th><td class="diff">0:35</td></tr>
    </div>`;
  const mockHtml = `<html><body><table>${splitRows}</table>${replayRows}</body></html>`;

  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    return { ok: true, text: async () => mockHtml };
  };

  const { response, body } = await request("/api/hyrox/import-url", { url: "https://results.hyrox.com/season-8/?x=1" });
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  const skiErg = body.parsed.splits.find((s) => s.segmentKey === "ski_erg");
  assert.equal(skiErg?.fieldRank, 100);
  assert.equal(body.parsed.roxzoneFieldRank, 88);
  assert.ok(Array.isArray(body.parsed.raceReplay) && body.parsed.raceReplay.length > 0);
  const skiReplay = body.parsed.raceReplay.find((r) => r.station === "ski_erg");
  assert.equal(skiReplay?.entrySeconds, 45);
});
