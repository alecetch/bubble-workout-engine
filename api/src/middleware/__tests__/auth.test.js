import test from "node:test";
import assert from "node:assert/strict";
import { requireInternalToken, requireTrustedAdminOrigin } from "../auth.js";

function mockReq(overrides = {}) {
  return {
    request_id: "test-req-id",
    method: "GET",
    protocol: "http",
    headers: {},
    query: {},
    get(name) { return this.headers[name.toLowerCase()] ?? undefined; },
    log: { error() {}, warn() {}, debug() {}, info() {} },
    ...overrides,
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.on = (event, fn) => { res._listeners = res._listeners ?? {}; res._listeners[event] = fn; return res; };
  res.emit = (event) => { res._listeners?.[event]?.(); };
  return res;
}

function withEnv(values, fn) {
  const prevInternal = process.env.INTERNAL_API_TOKEN;
  const prevEngine = process.env.ENGINE_KEY;
  const prevAdminOrigin = process.env.ADMIN_ALLOWED_ORIGIN;
  try {
    if (Object.prototype.hasOwnProperty.call(values, "INTERNAL_API_TOKEN")) {
      process.env.INTERNAL_API_TOKEN = values.INTERNAL_API_TOKEN;
    } else {
      delete process.env.INTERNAL_API_TOKEN;
    }
    if (Object.prototype.hasOwnProperty.call(values, "ENGINE_KEY")) {
      process.env.ENGINE_KEY = values.ENGINE_KEY;
    } else {
      delete process.env.ENGINE_KEY;
    }
    if (Object.prototype.hasOwnProperty.call(values, "ADMIN_ALLOWED_ORIGIN")) {
      process.env.ADMIN_ALLOWED_ORIGIN = values.ADMIN_ALLOWED_ORIGIN;
    } else {
      delete process.env.ADMIN_ALLOWED_ORIGIN;
    }
    return fn();
  } finally {
    if (prevInternal === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = prevInternal;
    if (prevEngine === undefined) delete process.env.ENGINE_KEY;
    else process.env.ENGINE_KEY = prevEngine;
    if (prevAdminOrigin === undefined) delete process.env.ADMIN_ALLOWED_ORIGIN;
    else process.env.ADMIN_ALLOWED_ORIGIN = prevAdminOrigin;
  }
}

test("valid INTERNAL_API_TOKEN passes", async () => {
  await withEnv({ INTERNAL_API_TOKEN: "secret-token-16ch" }, () => {
    const req = mockReq({ headers: { "x-internal-token": "secret-token-16ch" } });
    const res = mockRes();
    let nextCalled = false;
    requireInternalToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });
});

test("valid ENGINE_KEY passes", async () => {
  await withEnv({ ENGINE_KEY: "engine-key-16chars" }, () => {
    const req = mockReq({ headers: { "x-engine-key": "engine-key-16chars" } });
    const res = mockRes();
    let nextCalled = false;
    requireInternalToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });
});

test("wrong token returns 401", async () => {
  await withEnv({ INTERNAL_API_TOKEN: "correct-token-here" }, () => {
    const req = mockReq({ headers: { "x-internal-token": "wrong-token-value" } });
    const res = mockRes();
    let nextCalled = false;
    requireInternalToken(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "unauthorized");
  });
});

test("missing token header returns 401", async () => {
  await withEnv({ INTERNAL_API_TOKEN: "correct-token-here" }, () => {
    const req = mockReq();
    const res = mockRes();
    requireInternalToken(req, res, () => {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "unauthorized");
  });
});

test("neither env var configured rejects all requests (fail-safe)", async () => {
  await withEnv({}, () => {
    const req = mockReq({ headers: { "x-internal-token": "anything" } });
    const res = mockRes();
    requireInternalToken(req, res, () => {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "unauthorized");
    assert.match(res.body.error, /not configured/i);
  });
});

test("empty string token is rejected even if env matches empty (fail-safe)", async () => {
  await withEnv({ INTERNAL_API_TOKEN: "" }, () => {
    const req = mockReq({ headers: { "x-internal-token": "" } });
    const res = mockRes();
    requireInternalToken(req, res, () => {});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "unauthorized");
  });
});

test("GET request passes without Origin check", () => {
  const req = mockReq({ method: "GET", headers: { origin: "https://evil.com" } });
  const res = mockRes();
  let nextCalled = false;
  requireTrustedAdminOrigin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("POST without Origin header passes (non-browser request)", () => {
  const req = mockReq({ method: "POST" });
  const res = mockRes();
  let nextCalled = false;
  requireTrustedAdminOrigin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("POST with matching Origin passes", () => {
  const req = mockReq({
    method: "POST",
    protocol: "http",
    headers: { origin: "http://localhost:3000", host: "localhost:3000" },
  });
  const res = mockRes();
  let nextCalled = false;
  requireTrustedAdminOrigin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("POST with non-matching Origin returns 403", () => {
  const req = mockReq({
    method: "POST",
    protocol: "http",
    headers: { origin: "https://attacker.com", host: "localhost:3000" },
  });
  const res = mockRes();
  requireTrustedAdminOrigin(req, res, () => {});
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "forbidden_origin");
});

test("POST with ADMIN_ALLOWED_ORIGIN env matching passes", async () => {
  await withEnv({ ADMIN_ALLOWED_ORIGIN: "https://app.example.com" }, () => {
    const req = mockReq({
      method: "POST",
      headers: { origin: "https://app.example.com", host: "someother.host" },
    });
    const res = mockRes();
    let nextCalled = false;
    requireTrustedAdminOrigin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

test("x-forwarded-proto used when present", () => {
  const req = mockReq({
    method: "POST",
    protocol: "http",
    headers: {
      origin: "https://myapp.fly.dev",
      host: "myapp.fly.dev",
      "x-forwarded-proto": "https",
    },
  });
  const res = mockRes();
  let nextCalled = false;
  requireTrustedAdminOrigin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
