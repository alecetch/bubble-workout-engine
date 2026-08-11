import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { createAdminHyroxObservabilityRouter } from "../src/routes/adminHyroxObservability.js";

async function withServer(app, fn) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function authHeaders() {
  return { "x-internal-token": "test-token" };
}

function makeApp(db) {
  const app = express();
  app.use(express.json());
  app.use("/hyrox", createAdminHyroxObservabilityRouter(db));
  return app;
}

async function withToken(fn) {
  const oldToken = process.env.INTERNAL_API_TOKEN;
  const oldEngineKey = process.env.ENGINE_KEY;
  process.env.INTERNAL_API_TOKEN = "test-token";
  delete process.env.ENGINE_KEY;
  try {
    await fn();
  } finally {
    if (oldToken == null) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = oldToken;
    if (oldEngineKey == null) delete process.env.ENGINE_KEY;
    else process.env.ENGINE_KEY = oldEngineKey;
  }
}

function emptyDb(overrides = {}) {
  const calls = [];
  const db = {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      const text = sql.replace(/\s+/g, " ");
      if (overrides.query) return overrides.query(text, params);
      if (text.includes("AS submissions") && text.includes("FROM hyrox_submissions") && !text.includes("DATE(")) {
        return { rows: [{ submissions: 0 }] };
      }
      if (text.includes("AS successful_analyses") && text.includes("FROM hyrox_analyses")) {
        return { rows: [{ successful_analyses: 0 }] };
      }
      if (text.includes("COUNT(*) FILTER (WHERE status = 'queued')")) {
        return { rows: [{ queued: 0, sent: 0, failed: 0 }] };
      }
      if (text.includes("COUNT(*)::int AS generated")) {
        return { rows: [{ generated: 0, with_zip: 0 }] };
      }
      if (text.includes("PERCENTILE_CONT")) {
        return { rows: [{ p50: null, p95: null }] };
      }
      if (text.includes("marketing_consent = true")) {
        return { rows: [{ total: 0, consented: 0 }] };
      }
      return { rows: [] };
    },
  };
  return db;
}

test("GET /hyrox/summary without x-internal-token returns unauthorized", async () => {
  await withToken(async () => {
    await withServer(makeApp(emptyDb()), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/summary`);
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.ok, false);
      assert.equal(body.code, "unauthorized");
    });
  });
});

test("GET /hyrox/summary with empty DB returns zeroed summary", async () => {
  await withToken(async () => {
    await withServer(makeApp(emptyDb()), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/summary`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.submissions, 0);
      assert.equal(body.analysisSuccessPct, 0);
      assert.equal(body.emailSentPct, 0);
      assert.equal(body.p95AnalysisDurationMs, null);
    });
  });
});

test("GET /hyrox/summary computes success and email percentages", async () => {
  const db = emptyDb({
    query(text) {
      if (text.includes("AS submissions") && text.includes("FROM hyrox_submissions") && !text.includes("DATE(")) {
        return { rows: [{ submissions: 10 }] };
      }
      if (text.includes("AS successful_analyses") && text.includes("FROM hyrox_analyses")) {
        return { rows: [{ successful_analyses: 9 }] };
      }
      if (text.includes("COUNT(*) FILTER (WHERE status = 'queued')")) {
        return { rows: [{ queued: 0, sent: 8, failed: 1 }] };
      }
      if (text.includes("COUNT(*)::int AS generated")) {
        return { rows: [{ generated: 2 }] };
      }
      if (text.includes("PERCENTILE_CONT")) {
        return { rows: [{ p50: 1000, p95: 2200 }] };
      }
      return { rows: [] };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/summary`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(body.analysisSuccessPct, 90.0);
      assert.equal(body.emailSentPct, 88.9);
    });
  });
});

test("GET /hyrox/analysis-health returns pct values per group", async () => {
  const db = emptyDb({
    query(text) {
      if (text.includes("AS scope")) return { rows: [{ scope: "full", count: 3 }, { scope: "limited", count: 1 }] };
      if (text.includes("AS confidence")) return { rows: [{ confidence: "high", count: 2 }, { confidence: "low", count: 2 }] };
      if (text.includes("SELECT division")) return { rows: [{ division: "open", count: 4 }] };
      if (text.includes("AS mode")) return { rows: [{ mode: "analyse", count: 1 }, { mode: "target", count: 3 }] };
      if (text.includes("SELECT source")) return { rows: [{ source: "manual", count: 2 }, { source: "import", count: 2 }] };
      if (text.includes("SELECT sex")) return { rows: [{ sex: "male", count: 1 }, { sex: "female", count: 3 }] };
      if (text.includes("marketing_consent = true")) return { rows: [{ total: 4, consented: 2 }] };
      return { rows: [] };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/analysis-health`, { headers: authHeaders() });
      const body = await res.json();
      for (const key of ["scopeMix", "confidenceMix", "divisionMix", "modeMix", "sourceMix", "sexMix"]) {
        const totalPct = body[key].reduce((sum, row) => sum + row.pct, 0);
        assert.equal(Number(totalPct.toFixed(1)), 100.0);
      }
      assert.equal(body.marketingConsentPct, 50.0);
    });
  });
});

test("GET /hyrox/analysis-health includes unknown calculator mode", async () => {
  const db = emptyDb({
    query(text) {
      if (text.includes("AS mode")) return { rows: [{ mode: "unknown", count: 1 }] };
      if (text.includes("marketing_consent = true")) return { rows: [{ total: 1, consented: 0 }] };
      return { rows: [] };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/analysis-health`, { headers: authHeaders() });
      const body = await res.json();
      assert.deepEqual(body.modeMix, [{ mode: "unknown", count: 1, pct: 100 }]);
    });
  });
});

test("GET /hyrox/email returns stale queued count", async () => {
  const db = emptyDb({
    query(text) {
      assert.match(text, /interval '10 minutes'/);
      return { rows: [{ queued: 2, sent: 8, failed: 1, stale_queued: 1 }] };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/email`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(body.staleQueued, 1);
      assert.equal(body.sentPct, 88.9);
    });
  });
});

test("GET /hyrox/daily-trend zero fills selected window", async () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  const db = emptyDb({
    query() {
      return {
        rows: [
          { date: yesterday, submissions: 2, successful_analyses: 1 },
          { date: today, submissions: 3, successful_analyses: 3 },
        ],
      };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/daily-trend?days=7`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(body.daily.length, 7);
      assert.equal(body.daily.at(-1).submissions, 3);
      assert.equal(body.daily.at(-2).failedAnalyses, 1);
    });
  });
});

test("GET /hyrox/submissions passes clamped pagination params", async () => {
  const db = emptyDb({ query: () => ({ rows: [] }) });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      await fetch(`${baseUrl}/hyrox/submissions?limit=10&offset=20`, { headers: authHeaders() });
      assert.deepEqual(db.calls[0].params, [30, 10, 20]);
    });
  });
});

test("GET /hyrox/submissions omits email and display_name", async () => {
  const db = emptyDb({
    query() {
      return {
        rows: [{
          submission_id: "sub-1",
          created_at: "2026-06-24T10:00:00Z",
          division: "open",
          sex: "male",
          age_group: "30-34",
          source: "manual",
          calculator_mode: "analyse",
          roxzone_mode: "estimated",
          splits_count: 16,
          analysis_scope: "full",
          confidence: "high",
          email_status: "sent",
          has_share_pack: true,
          total_count: 1,
          email: "hidden@example.com",
          display_name: "Hidden Person",
        }],
      };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/submissions`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(Object.hasOwn(body.rows[0], "email"), false);
      assert.equal(Object.hasOwn(body.rows[0], "display_name"), false);
    });
  });
});

test("GET /hyrox/submissions flags the test account email without exposing it", async () => {
  const db = emptyDb({
    query() {
      return {
        rows: [
          {
            submission_id: "sub-test",
            created_at: "2026-06-24T10:00:00Z",
            email: "AlecPringle@Outlook.com",
            total_count: 2,
          },
          {
            submission_id: "sub-real",
            created_at: "2026-06-24T10:00:00Z",
            email: "someone.else@example.com",
            total_count: 2,
          },
        ],
      };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/submissions`, { headers: authHeaders() });
      const body = await res.json();
      const [testRow, realRow] = body.rows;
      assert.equal(testRow.isTestSubmission, true);
      assert.equal(realRow.isTestSubmission, false);
      assert.equal(Object.hasOwn(testRow, "email"), false);
      assert.equal(Object.hasOwn(realRow, "email"), false);
      assert.equal(JSON.stringify(body).toLowerCase().includes("alecpringle@outlook.com"), false);
    });
  });
});

test("GET /hyrox/submission/:id with no row returns 404", async () => {
  await withToken(async () => {
    await withServer(makeApp(emptyDb({ query: () => ({ rows: [] }) })), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/submission/missing`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.ok, false);
    });
  });
});

test("GET /hyrox/submission/:id returns sanitized detail", async () => {
  const db = emptyDb({
    query() {
      return {
        rows: [{
          submission_id: "sub-1",
          created_at: "2026-06-24T10:00:00Z",
          division: "open",
          sex: "female",
          age_group: "35-39",
          age_on_race_day: 37,
          finish_time_seconds: 5200,
          race_name: "HYROX London",
          race_date: "2026-05-01",
          source: "manual",
          calculator_mode: "analyse",
          roxzone_mode: "explicit",
          splits_count: 16,
          marketing_consent: true,
          analysis_duration_ms: 4200,
          request_id: "req-1",
          analysis_scope: "full",
          analysis_version: "hyrox_engine_v1.0.0",
          benchmark_group_key: "group",
          confidence: "high",
          email_status: "sent",
          has_share_pack: true,
          email: "hidden@example.com",
        }],
      };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/submission/sub-1`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.submissionId, "sub-1");
      assert.equal(Object.hasOwn(body, "email"), false);
      assert.equal(body.isTestSubmission, false);
    });
  });
});

test("GET /hyrox/submission/:id flags the test account email without exposing it", async () => {
  const db = emptyDb({
    query() {
      return {
        rows: [{
          submission_id: "sub-1",
          created_at: "2026-06-24T10:00:00Z",
          email: "alecpringle@outlook.com",
        }],
      };
    },
  });

  await withToken(async () => {
    await withServer(makeApp(db), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/hyrox/submission/sub-1`, { headers: authHeaders() });
      const body = await res.json();
      assert.equal(body.isTestSubmission, true);
      assert.equal(Object.hasOwn(body, "email"), false);
      assert.equal(JSON.stringify(body).toLowerCase().includes("alecpringle@outlook.com"), false);
    });
  });
});
