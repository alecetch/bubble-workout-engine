import test from "node:test";
import assert from "node:assert/strict";
import { requestLogger } from "../requestLogger.js";

function mockReq(overrides = {}) {
  return {
    request_id: "test-req-id",
    method: "GET",
    url: "/health",
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

test("attaches req.log as a child logger with request_id", () => {
  const req = mockReq({ request_id: "req-abc-123" });
  const res = mockRes();
  let nextCalled = false;

  requestLogger(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.ok(req.log);
  assert.equal(typeof req.log.info, "function");
  assert.equal(typeof req.log.warn, "function");
  assert.equal(typeof req.log.error, "function");
  assert.equal(typeof req.log.debug, "function");
});

test("logs http.request.finish on res finish event with correct status and duration", () => {
  const req = mockReq({ request_id: "req-abc", method: "GET", url: "/health" });
  const res = mockRes();
  requestLogger(req, res, () => {});

  const calls = [];
  req.log = {
    info: (obj) => calls.push({ level: "info", ...obj }),
    warn: (obj) => calls.push({ level: "warn", ...obj }),
    error: (obj) => calls.push({ level: "error", ...obj }),
    debug: (obj) => calls.push({ level: "debug", ...obj }),
  };

  res.statusCode = 200;
  res.emit("finish");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].event, "http.request.finish");
  assert.equal(calls[0].status_code, 200);
  assert.equal(typeof calls[0].duration_ms, "number");
});

test("uses warn level for 4xx responses", () => {
  const req = mockReq({ request_id: "req-404", method: "GET", url: "/missing" });
  const res = mockRes();
  requestLogger(req, res, () => {});

  const calls = [];
  req.log = {
    info: (obj) => calls.push({ level: "info", ...obj }),
    warn: (obj) => calls.push({ level: "warn", ...obj }),
    error: (obj) => calls.push({ level: "error", ...obj }),
    debug: (obj) => calls.push({ level: "debug", ...obj }),
  };

  res.statusCode = 404;
  res.emit("finish");

  assert.equal(calls[0].level, "warn");
  assert.equal(calls[0].event, "http.request.finish");
});

test("uses error level for 5xx responses", () => {
  const req = mockReq({ request_id: "req-500", method: "GET", url: "/boom" });
  const res = mockRes();
  requestLogger(req, res, () => {});

  const calls = [];
  req.log = {
    info: (obj) => calls.push({ level: "info", ...obj }),
    warn: (obj) => calls.push({ level: "warn", ...obj }),
    error: (obj) => calls.push({ level: "error", ...obj }),
    debug: (obj) => calls.push({ level: "debug", ...obj }),
  };

  res.statusCode = 500;
  res.emit("finish");

  assert.equal(calls[0].level, "error");
  assert.equal(calls[0].event, "http.request.finish");
});
