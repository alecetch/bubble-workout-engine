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
