import test from "node:test";
import assert from "node:assert/strict";
import {
  runPremiumScan,
  computeEmphasisWeights,
  computePhysiqueScore,
  evaluateMilestones,
  normaliseRegionScores,
} from "../physiqueScanService.js";

test("computePhysiqueScore returns the expected composite", () => {
  const score = computePhysiqueScore(
    {
      chest: { score: 8, descriptor: null, confidence: "high" },
      shoulders: { score: 6, descriptor: null, confidence: "high" },
      upper_back: { score: null, descriptor: null, confidence: "not_visible" },
    },
    {
      leanness_rating: 7,
      muscle_fullness_rating: 8,
      symmetry_rating: 9,
      dominant_strength: "balanced",
      development_stage: "intermediate",
    },
  );

  assert.equal(score, 73.5);
});

test("computeEmphasisWeights prioritises lower-scoring visible regions", () => {
  const weights = computeEmphasisWeights({
    chest: { score: 8, descriptor: null, confidence: "high" },
    shoulders: { score: 5, descriptor: null, confidence: "high" },
    calves: { score: null, descriptor: null, confidence: "not_visible" },
  });

  assert.equal(weights.shoulders, 0.2);
  assert.equal(weights.chest, undefined);
  assert.equal(weights.calves, undefined);
});

test("evaluateMilestones fires first scan and score threshold achievements", () => {
  const milestones = evaluateMilestones({
    scanCountBefore: 0,
    currentScore: 72.4,
    comparison: null,
    newStreak: 1,
    currentRegionScores: {},
    priorMilestoneSlugs: [],
    priorMaxScoreDelta: null,
    priorMaxRegionScores: {},
  });

  assert.deepEqual(milestones.sort(), ["first_scan", "score_70"].sort());
});

test("normaliseRegionScores clamps values and clears not-visible regions", () => {
  const result = normaliseRegionScores({
    shoulders: { score: 12.4, descriptor: "round delts", confidence: "high" },
    glutes: { score: 5, descriptor: "hidden", confidence: "not_visible" },
  });

  assert.equal(result.shoulders.score, 10);
  assert.equal(result.shoulders.confidence, "high");
  assert.equal(result.glutes.score, null);
  assert.equal(result.glutes.descriptor, null);
  assert.equal(result.glutes.confidence, "not_visible");
});


function scanHarness() {
  let now = Date.parse("2026-09-23T10:00:00Z");
  const attempts = new Map();
  const calls = { ai: 0, upload: 0 };
  let consent = true;
  const db = { async query(sql, [userId] = []) {
    if (sql.includes("SET physique_scan_attempted_at")) {
      if (attempts.has(userId) && now - attempts.get(userId) < 86400000) return { rows: [] };
      attempts.set(userId, now);
      return { rows: [{ physique_scan_attempted_at: new Date(now) }] };
    }
    if (sql.includes("AS next_scan_at")) return { rows: [{ next_scan_at: new Date(attempts.get(userId) + 86400000), retry_after_seconds: Math.ceil((attempts.get(userId) + 86400000 - now) / 1000) }] };
    if (sql.includes("SELECT physique_consent_at")) return { rows: [{ physique_consent_at: consent ? new Date(now) : null }] };
    if (sql.includes("INSERT INTO physique_scan")) return { rows: [{ id: "scan-1", submitted_at: new Date(now) }] };
    if (sql.includes("FROM physique_scan") || sql.includes("FROM physique_milestone") || sql.includes("INSERT INTO physique_milestone") || sql.includes("SET physique_scan_streak")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const deps = {
    analysePhoto: async () => { calls.ai++; return { region_scores: { chest: { score: 7 }, arms: { score: 6 }, core: { score: 5 } } }; },
    putPhoto: async () => { calls.upload++; },
    deletePhoto: async () => {},
    fetchPriorPhoto: async () => null,
  };
  return { db, deps, calls, attempts, advance: (ms) => { now += ms; }, revokeConsent: () => { consent = false; } };
}

test("a second scan within 24 hours makes zero additional AI or storage calls", async () => {
  const h = scanHarness();
  const first = await runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps);
  assert.equal(first.ok, true);
  assert.equal(h.calls.ai, 1);
  await assert.rejects(runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps), (error) => {
    assert.equal(error.code, "physique_scan_limit_reached");
    assert.equal(error.retryAfterSeconds, 86400);
    assert.equal(error.nextScanAt.toISOString(), "2026-09-24T10:00:00.000Z");
    return true;
  });
  assert.deepEqual(h.calls, { ai: 1, upload: 1 });
});

test("parallel requests reserve only one attempt per account", async () => {
  const h = scanHarness();
  const results = await Promise.allSettled([1, 2].map(() => runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "physique_scan_limit_reached");
  assert.equal(h.calls.ai, 1);
});

test("limits are isolated by account and expire exactly after 24 hours", async () => {
  const h = scanHarness();
  await runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps);
  await runPremiumScan("user-b", Buffer.from("photo"), h.db, h.deps);
  h.advance(86400000 - 1);
  await assert.rejects(runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps), { code: "physique_scan_limit_reached" });
  h.advance(1);
  await runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps);
  assert.equal(h.calls.ai, 3);
});

test("failed AI attempts retain the cap even with no saved scan", async () => {
  const h = scanHarness();
  h.deps.analysePhoto = async () => { h.calls.ai++; throw new Error("Provider unavailable"); };
  await assert.rejects(runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps), /Provider unavailable/);
  await assert.rejects(runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps), { code: "physique_scan_limit_reached" });
  assert.equal(h.calls.ai, 1);
});

test("missing consent consumes no attempt and database failures fail closed", async () => {
  const h = scanHarness();
  h.revokeConsent();
  await assert.rejects(runPremiumScan("user-a", Buffer.from("photo"), h.db, h.deps), { code: "consent_required" });
  assert.equal(h.attempts.size, 0);
  await assert.rejects(runPremiumScan("user-a", Buffer.from("photo"), { query: async () => { throw new Error("DB unavailable"); } }, h.deps), /DB unavailable/);
  assert.equal(h.calls.ai, 0);
});
