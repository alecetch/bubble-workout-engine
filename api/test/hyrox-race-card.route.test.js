import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createHyroxRaceCardHandler } from "../src/hyrox/hyroxRaceCardController.js";

const SUBMISSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const FAKE_PNG = Buffer.from("FAKEPNG");

function buildApp({ getOrCreateRaceCardImpl, getObjectImpl } = {}) {
  const getOrCreateRaceCard = getOrCreateRaceCardImpl ?? (async (submissionId) => {
    if (submissionId !== SUBMISSION_ID) throw Object.assign(new Error("Submission not found"), { status: 404 });
    return { raceCardKey: "hyrox-share-packs/test/race-card.png", buffer: FAKE_PNG };
  });
  const getObject = getObjectImpl ?? (async () => FAKE_PNG);
  const handler = createHyroxRaceCardHandler(null, { getOrCreateRaceCard, getObject });
  const app = express();
  app.get("/api/hyrox/race-card/:submissionId", handler);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return res;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("GET /api/hyrox/race-card/:submissionId returns 200 PNG for valid submission", async () => {
  const res = await request(buildApp(), `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /image\/png/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf, FAKE_PNG);
});

test("GET /api/hyrox/race-card/:submissionId returns 404 for non-existent submission", async () => {
  const res = await request(buildApp(), `/api/hyrox/race-card/${OTHER_ID}`);
  assert.equal(res.status, 404);
});

test("GET /api/hyrox/race-card/:submissionId returns 404 when analysis is unavailable", async () => {
  const getOrCreateRaceCardImpl = async () => {
    throw Object.assign(new Error("Race card not available for this submission"), { status: 404 });
  };
  const res = await request(buildApp({ getOrCreateRaceCardImpl }), `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(res.status, 404);
});

test("GET /api/hyrox/race-card/:submissionId?download=1 sends attachment header", async () => {
  const res = await request(buildApp(), `/api/hyrox/race-card/${SUBMISSION_ID}?download=1`);
  assert.equal(res.status, 200);
  const disposition = res.headers.get("content-disposition") ?? "";
  assert.match(disposition, /attachment/);
  assert.match(disposition, /race-card\.png/);
});

test("GET /api/hyrox/race-card/:submissionId returns 500 when PNG generation throws", async () => {
  const getOrCreateRaceCardImpl = async () => {
    throw new Error("Puppeteer crash");
  };
  const res = await request(buildApp({ getOrCreateRaceCardImpl }), `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(res.status, 500);
});

test("threads sessionId from the query string into getOrCreateRaceCard", async () => {
  const calls = [];
  const getOrCreateRaceCardImpl = async (submissionId, db, deps) => {
    calls.push(deps);
    return { raceCardKey: "hyrox-share-packs/test/race-card.png", buffer: FAKE_PNG };
  };
  const res = await request(buildApp({ getOrCreateRaceCardImpl }), `/api/hyrox/race-card/${SUBMISSION_ID}?sessionId=session-123`);
  assert.equal(res.status, 200);
  assert.equal(calls[0]?.sessionId, "session-123");
});

test("sessionId defaults to null when not provided in the query string", async () => {
  const calls = [];
  const getOrCreateRaceCardImpl = async (submissionId, db, deps) => {
    calls.push(deps);
    return { raceCardKey: "hyrox-share-packs/test/race-card.png", buffer: FAKE_PNG };
  };
  await request(buildApp({ getOrCreateRaceCardImpl }), `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(calls[0]?.sessionId, null);
});

test("fetches bytes via getObject when getOrCreateRaceCard returns a cached key with no buffer", async () => {
  let requestedKey = null;
  const getOrCreateRaceCardImpl = async () => ({ raceCardKey: "cached-key", buffer: null });
  const getObjectImpl = async (key) => {
    requestedKey = key;
    return FAKE_PNG;
  };
  const res = await request(buildApp({ getOrCreateRaceCardImpl, getObjectImpl }), `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(res.status, 200);
  assert.equal(requestedKey, "cached-key");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf, FAKE_PNG);
});
