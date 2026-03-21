import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    }).on("error", reject);
  });
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

test("async route without try/catch - error reaches handler and returns 500", async () => {
  const app = express();
  app.get("/throw", async (_req, _res) => {
    throw new Error("deliberate async error");
  });
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, code: "internal_error", error: err.message });
  });

  const server = await startServer(app);
  try {
    const { status, body } = await request(`http://127.0.0.1:${server.address().port}/throw`);
    assert.equal(status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.code, "internal_error");
    assert.equal(body.error, "deliberate async error");
  } finally {
    await stopServer(server);
  }
});

test("async route that returns a rejected promise - error reaches handler and returns 500", async () => {
  const app = express();
  app.get("/reject", async (_req, _res) => {
    await Promise.reject(new Error("rejected promise error"));
  });
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, code: "internal_error", error: err.message });
  });

  const server = await startServer(app);
  try {
    const { status, body } = await request(`http://127.0.0.1:${server.address().port}/reject`);
    assert.equal(status, 500);
    assert.equal(body.code, "internal_error");
    assert.equal(body.error, "rejected promise error");
  } finally {
    await stopServer(server);
  }
});

test("async route that resolves normally - error handler is not invoked", async () => {
  const app = express();
  app.get("/ok", async (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, code: "internal_error", error: err.message });
  });

  const server = await startServer(app);
  try {
    const { status, body } = await request(`http://127.0.0.1:${server.address().port}/ok`);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  } finally {
    await stopServer(server);
  }
});
