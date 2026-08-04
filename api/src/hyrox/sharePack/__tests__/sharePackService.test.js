import assert from "node:assert/strict";
import test from "node:test";
import { screenshotSlidesWithRetry, getOrCreateRaceCard, getOrCreateSharePack } from "../sharePackService.js";
import { SLIDE_FILENAMES } from "../slideAssets.js";

test("screenshotSlidesWithRetry succeeds on the first attempt without retrying", async () => {
  let calls = 0;
  const render = async () => {
    calls += 1;
    return ["a", "b"];
  };
  const result = await screenshotSlidesWithRetry("<html></html>", { render });
  assert.deepEqual(result, ["a", "b"]);
  assert.equal(calls, 1);
});

test("screenshotSlidesWithRetry recovers on the second attempt", async () => {
  let calls = 0;
  const render = async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient crash");
    return ["a", "b"];
  };
  const result = await screenshotSlidesWithRetry("<html></html>", { render });
  assert.deepEqual(result, ["a", "b"]);
  assert.equal(calls, 2);
});

test("screenshotSlidesWithRetry throws a 502 with both failure messages surfaced after exhausting retries", async () => {
  const render = async () => {
    throw new Error("Puppeteer crash");
  };
  await assert.rejects(
    () => screenshotSlidesWithRetry("<html></html>", { render }),
    (err) => {
      assert.equal(err.status, 502);
      assert.match(err.message, /2 attempt\(s\)/);
      assert.match(err.message, /Puppeteer crash/);
      return true;
    },
  );
});

test("screenshotSlidesWithRetry defaults to 2 attempts", async () => {
  let calls = 0;
  const render = async () => {
    calls += 1;
    throw new Error("always fails");
  };
  await assert.rejects(() => screenshotSlidesWithRetry("<html></html>", { render }));
  assert.equal(calls, 2);
});

// ── getOrCreateRaceCard ──────────────────────────────────────────────────────

test("getOrCreateRaceCard returns a cached key without querying for the analysis row", async () => {
  let analysisQueried = false;
  const db = {
    async query(sql) {
      if (sql.includes("SELECT race_card_key FROM hyrox_share_packs")) {
        return { rows: [{ race_card_key: "hyrox-share-packs/sub-1/race-card.png" }] };
      }
      analysisQueried = true;
      return { rows: [] };
    },
  };
  const result = await getOrCreateRaceCard("sub-1", db);
  assert.deepEqual(result, { raceCardKey: "hyrox-share-packs/sub-1/race-card.png", buffer: null });
  assert.equal(analysisQueried, false, "should not query for the analysis row on a cache hit");
});

test("getOrCreateRaceCard renders, uploads, and inserts a new race-card-only row on a cache miss", async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("SELECT race_card_key FROM hyrox_share_packs")) return { rows: [] };
      if (sql.includes("FROM hyrox_analyses")) return { rows: [{ analysis_json: { athlete: {} } }] };
      return { rows: [] };
    },
  };
  const fakeBuffer = Buffer.from("PNG");
  let putObjectArgs = null;
  const deps = {
    renderRaceCardBuffer: async () => fakeBuffer,
    putObject: async (key, buf, contentType) => { putObjectArgs = { key, buf, contentType }; },
  };
  const result = await getOrCreateRaceCard("sub-1", db, deps);

  assert.equal(result.buffer, fakeBuffer);
  assert.match(result.raceCardKey, /race-card\.png$/);
  assert.equal(putObjectArgs.key, result.raceCardKey);
  assert.equal(putObjectArgs.buf, fakeBuffer);

  const insertQuery = queries.find((q) => q.sql.trim().startsWith("INSERT INTO hyrox_share_packs"));
  assert.ok(insertQuery, "expected an INSERT into hyrox_share_packs");
  assert.match(insertQuery.sql, /race_card_key/);
  assert.doesNotMatch(insertQuery.sql, /zip_key/);
  assert.equal(insertQuery.params[1], result.raceCardKey);
});

test("getOrCreateRaceCard throws 404 for a submission with no analysis row", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("SELECT race_card_key FROM hyrox_share_packs")) return { rows: [] };
      return { rows: [] }; // no analysis row found
    },
  };
  await assert.rejects(() => getOrCreateRaceCard("sub-1", db), (err) => {
    assert.equal(err.status, 404);
    return true;
  });
});

// ── getOrCreateSharePack caching fixes ───────────────────────────────────────

test("getOrCreateSharePack's existing-pack lookup requires a non-null zip_key", async () => {
  let capturedSql = null;
  const db = {
    async query(sql) {
      if (sql.includes("SELECT * FROM hyrox_share_packs")) {
        capturedSql = sql;
        return { rows: [] };
      }
      return { rows: [] }; // no analysis row -> throws 404 before reaching any rendering
    },
  };
  await assert.rejects(() => getOrCreateSharePack("sub-1", db));
  assert.match(capturedSql, /zip_key IS NOT NULL/);
});

test("getOrCreateSharePack reuses an already-cached race_card_key instead of re-rendering", async () => {
  const insertParams = [];
  const db = {
    async query(sql, params) {
      if (sql.includes("SELECT * FROM hyrox_share_packs")) return { rows: [] }; // no complete pack yet
      if (sql.includes("SELECT race_card_key FROM hyrox_share_packs")) {
        return { rows: [{ race_card_key: "hyrox-share-packs/sub-1/race-card.png" }] };
      }
      if (sql.includes("FROM hyrox_analyses")) {
        return {
          rows: [{
            carousel_a_json: { slides: [{}, {}, {}, {}, {}, {}] },
            analysis_json: null, // forces resolveShareCarousel to use the pre-stored carousel_a_json
            selected_insights_json: [],
            display_name: "Test Runner",
            race_name: "HYROX Test",
            division: "open",
            calculator_mode: "analyse",
            athlete_context_json: null,
            performance_context_json: null,
          }],
        };
      }
      if (sql.trim().startsWith("INSERT INTO hyrox_share_packs")) {
        insertParams.push(params);
        return { rows: [{ id: "pack-1", zip_key: params[1], race_card_key: params[2] }] };
      }
      return { rows: [] };
    },
  };

  let renderRaceCardCalled = false;
  let getObjectCalledWith = null;
  const deps = {
    launchBrowser: async () => ({ close: async () => {} }),
    screenshotSlides: async () => SLIDE_FILENAMES.map((_, i) => Buffer.from(`slide-${i}`)),
    putObject: async () => undefined,
    getObject: async (key) => {
      getObjectCalledWith = key;
      return Buffer.from("cached-race-card-bytes");
    },
    renderRaceCardBuffer: async () => {
      renderRaceCardCalled = true;
      return Buffer.from("should-not-be-used");
    },
  };

  const pack = await getOrCreateSharePack("sub-1", db, deps);

  assert.equal(renderRaceCardCalled, false, "should not re-render when a cached race card key exists");
  assert.equal(getObjectCalledWith, "hyrox-share-packs/sub-1/race-card.png");
  assert.equal(pack.race_card_key, "hyrox-share-packs/sub-1/race-card.png");
  assert.ok(insertParams.length > 0);
});

// ── Puppeteer browser pooling ────────────────────────────────────────────────

function sharePackDb({ cachedRaceCardKey = null } = {}) {
  const insertParams = [];
  const db = {
    async query(sql, params) {
      if (sql.includes("SELECT * FROM hyrox_share_packs")) return { rows: [] }; // no complete pack yet
      if (sql.includes("SELECT race_card_key FROM hyrox_share_packs")) {
        return { rows: cachedRaceCardKey ? [{ race_card_key: cachedRaceCardKey }] : [] };
      }
      if (sql.includes("FROM hyrox_analyses")) {
        return {
          rows: [{
            carousel_a_json: { slides: [{}, {}, {}, {}, {}, {}] },
            analysis_json: { athlete: {} },
            selected_insights_json: [],
            display_name: "Test Runner",
            race_name: "HYROX Test",
            division: "open",
            calculator_mode: "analyse",
            athlete_context_json: null,
            performance_context_json: null,
          }],
        };
      }
      if (sql.trim().startsWith("INSERT INTO hyrox_share_packs")) {
        insertParams.push(params);
        return { rows: [{ id: "pack-1", zip_key: params[1], race_card_key: params[2] }] };
      }
      return { rows: [] };
    },
  };
  return { db, insertParams };
}

test("getOrCreateSharePack renders the slides and the race card with the same pooled browser instance", async () => {
  const { db } = sharePackDb();
  const fakeBrowser = { marker: "shared-browser", close: async () => {} };
  const slideRenderCalledWith = [];
  const raceCardRenderCalledWith = [];

  const deps = {
    launchBrowser: async () => fakeBrowser,
    screenshotSlides: async (html, browser) => {
      slideRenderCalledWith.push(browser);
      return SLIDE_FILENAMES.map((_, i) => Buffer.from(`slide-${i}`));
    },
    putObject: async () => undefined,
    renderRaceCardBuffer: async (row, browser) => {
      raceCardRenderCalledWith.push(browser);
      return Buffer.from("race-card-bytes");
    },
  };

  await getOrCreateSharePack("sub-1", db, deps);

  assert.equal(slideRenderCalledWith.length, 1);
  assert.equal(raceCardRenderCalledWith.length, 1);
  assert.equal(slideRenderCalledWith[0], fakeBrowser);
  assert.equal(raceCardRenderCalledWith[0], fakeBrowser);
});

test("getOrCreateSharePack closes the pooled browser exactly once, even when the race-card render fails", async () => {
  const { db } = sharePackDb();
  let closeCalls = 0;
  const fakeBrowser = { close: async () => { closeCalls += 1; } };

  const deps = {
    launchBrowser: async () => fakeBrowser,
    screenshotSlides: async () => SLIDE_FILENAMES.map((_, i) => Buffer.from(`slide-${i}`)),
    putObject: async () => undefined,
    renderRaceCardBuffer: async () => {
      throw new Error("race card render crashed");
    },
  };

  const pack = await getOrCreateSharePack("sub-1", db, deps);

  assert.equal(closeCalls, 1);
  assert.equal(pack.race_card_key, null); // race-card failure degrades gracefully, doesn't block the pack
});
