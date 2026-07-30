import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireInternalToken } from "../../src/middleware/auth.js";
import {
  canonicalJsonStringify,
  artifactPrimaryConsistency,
  contractSlotAudit,
  contentHashForAnalysisJson,
  createAdminHyroxTestHarnessRouter,
  emailHtmlEntriesFromHarnessEntries,
  firstPrimaryFromText,
  normalizeHarnessMarkdownText,
  normalizeSex,
  primaryFromHeroTitle,
  runHarnessMode,
  sharedContextFromRequestBody,
  structuredExpectationConsistency,
} from "../../src/routes/adminHyroxTestHarness.js";

const nativeFetch = globalThis.fetch;
const nativeInternalToken = process.env.INTERNAL_API_TOKEN;
const nativeHarnessRunsDir = process.env.HYROX_HARNESS_RUNS_DIR;
const nativeHarnessRunsMaxKept = process.env.HYROX_HARNESS_RUNS_MAX_KEPT;

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

async function getJson(pathValue, { token = "test-harness-token", pool = null } = {}) {
  const server = app(pool).listen(0);
  const { port } = server.address();
  try {
    const headers = {};
    if (token) headers["x-internal-token"] = token;
    const response = await fetch(`http://127.0.0.1:${port}${pathValue}`, { headers });
    const text = await response.text();
    return {
      response,
      body: response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(text)
        : text,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function mockHyroxHtml() {
  return mockHyroxHtmlWithFinish("1:42:00");
}

function mockHyroxHtmlWithFinish(finishTime = "1:42:00") {
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
    `<tr class="f-time_finish_netto"><td class="f-time_finish_netto">${finishTime}</td><td></td></tr>`,
  ].join("\n");

  return `<html><body><table><tr><td class="f-__fullname">Alex Runner</td></tr>${splitRows}</table></body></html>`;
}

function stubSuccessfulHyroxFetchWithFinish(finishTime) {
  const html = mockHyroxHtmlWithFinish(finishTime);
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1")) return nativeFetch(url, options);
    return { ok: true, text: async () => html };
  };
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

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hyrox-harness-runs-"));
}

function runDirs(baseDir) {
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function onlyRunDir(baseDir) {
  const dirs = runDirs(baseDir);
  assert.equal(dirs.length, 1);
  return path.join(baseDir, dirs[0]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  if (nativeHarnessRunsDir === undefined) {
    delete process.env.HYROX_HARNESS_RUNS_DIR;
  } else {
    process.env.HYROX_HARNESS_RUNS_DIR = nativeHarnessRunsDir;
  }
  if (nativeHarnessRunsMaxKept === undefined) {
    delete process.env.HYROX_HARNESS_RUNS_MAX_KEPT;
  } else {
    process.env.HYROX_HARNESS_RUNS_MAX_KEPT = nativeHarnessRunsMaxKept;
  }
});

test("canonicalJsonStringify and content hashing are stable across object insertion order", () => {
  const first = { b: 2, a: { z: [3, { y: true }], x: "same" } };
  const second = { a: { x: "same", z: [3, { y: true }] }, b: 2 };
  const different = { a: { x: "changed", z: [3, { y: true }] }, b: 2 };

  assert.equal(canonicalJsonStringify(first), canonicalJsonStringify(second));
  assert.equal(contentHashForAnalysisJson(first), contentHashForAnalysisJson(second));
  assert.notEqual(contentHashForAnalysisJson(first), contentHashForAnalysisJson(different));
});

test("firstPrimaryFromText extracts analyse-mode colon-prefixed subject primaries", () => {
  assert.equal(
    firstPrimaryFromText("RoxZone: You're in the top 9% of sub-60 finishers. Here's the next refinement."),
    "RoxZone",
  );
  assert.equal(
    firstPrimaryFromText("Wall Balls: You're ahead of your sub-85 group. sub-80 is the next test."),
    "Wall Balls",
  );
  assert.equal(
    firstPrimaryFromText("Run 7: You're in the 120:00+ band. Here's the route to 105:00-119:59."),
    "Run 7",
  );
});

test("firstPrimaryFromText keeps existing target and penalty subject extraction", () => {
  assert.equal(firstPrimaryFromText("Your route to 55:00: start with Wall Balls"), "Wall Balls");
  assert.equal(firstPrimaryFromText("Your fastest win is penalties"), "Penalties");
  assert.equal(firstPrimaryFromText("Analysis: you're ahead of your benchmark"), null);
});

test("firstPrimaryFromText extracts the primary from doubles team-aware main-insight openers", () => {
  // Regression: doubles email copy inserts "team" into the opener ("is the main team
  // opportunity" / "is the main team target opportunity"), which must not defeat the
  // existing singles "main [directional] opportunity/limiter" extraction pattern.
  assert.equal(firstPrimaryFromText("Run 2 is the main team target opportunity. This target is an aggressive stretch."), "Run 2");
  assert.equal(firstPrimaryFromText("Run 1 is the main team opportunity. Station performance is the largest category gap."), "Run 1");
});

test("primaryFromHeroTitle falls back to canonical browser limiter for generic hero titles", () => {
  assert.equal(
    primaryFromHeroTitle("Based on available data... Your engine is not the main limiter", "Wall Balls"),
    "Wall Balls",
  );
  assert.equal(primaryFromHeroTitle("Your overall percentile is 99%", "Run 1"), "Run 1");
});

test("primaryFromHeroTitle keeps existing title-text extraction before fallback", () => {
  assert.equal(primaryFromHeroTitle("RoxZone time is costing you", "Wall Balls"), "RoxZone");
  assert.equal(primaryFromHeroTitle("YOUR ROUTE STARTS WITH RUN 7", "Wall Balls"), "Run 7");
  assert.equal(primaryFromHeroTitle("Wall Balls IS YOUR BIGGEST opportunity", "Run 1"), "Wall Balls");
});

test("primaryFromHeroTitle recognizes the penalty-first fastest-controllable-win title before falling back to the fitness limiter", () => {
  // Regression: in penalty_first mode, biggestLimiter is deliberately the largest FITNESS
  // limiter (not Penalties), so the fallback must never win when the title is unambiguously
  // about penalties.
  assert.equal(primaryFromHeroTitle("Penalties are your fastest controllable win", "Run 8"), "Penalties");
  assert.equal(primaryFromHeroTitle("Penalties are your team's fastest controllable win", "Run 2"), "Penalties");
});

test("artifactPrimaryConsistency fails unqualified cross-artifact primary mismatches", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 55:00: start with Wall Balls",
        emailHtml: "<p>The Wall Balls station is the biggest target opportunity. Biggest opportunities: RoxZone.</p>",
      },
      webReport: { browserSummary: { heroInsight: { title: "The Wall Balls station is your biggest opportunity" }, biggestLimiter: { label: "Wall Balls" } } },
      raceCardData: { biggestLimiter: { name: "Wall Balls" } },
      carouselReport: { slides: [{ biggest_limiter: "WALL BALLS" }] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /emailMain=RoxZone/);
  assert.match(audit.detail, /expected Wall Balls/);
});

test("artifactPrimaryConsistency audits artifacts against narrative primary when present", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      narrative: {
        headlineMode: "single_track",
        primaryOpportunity: { normalizedLabel: "Wall Balls", displayLabel: "Wall Balls" },
        rankDisplays: { allowed: true },
      },
      emailReport: {
        emailSubject: "Your route to 55:00: start with Wall Balls",
        emailHtml: "<p>The Wall Balls station is the biggest target opportunity.</p>",
      },
      webReport: { browserSummary: { heroInsight: { title: "The Wall Balls station is your biggest opportunity" }, biggestLimiter: { label: "Wall Balls" } } },
      raceCardData: { biggestLimiter: { name: "RoxZone" } },
      carouselReport: { slides: [{ biggest_limiter: "WALL BALLS" }] },
    },
  });

  assert.equal(audit.pass, false);
  assert.equal(audit.primary, "Wall Balls");
  assert.match(audit.detail, /expected Wall Balls/);
  assert.match(audit.detail, /raceCard=RoxZone/);
});

test("artifactPrimaryConsistency passes secondary RoxZone wording when primary agrees", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 55:00: start with Wall Balls",
        emailHtml: "<p>The Wall Balls station is the biggest target opportunity. Biggest opportunity: Wall Balls. Secondary opportunities: RoxZone.</p>",
      },
      webReport: { browserSummary: { heroInsight: { title: "The Wall Balls station is your biggest opportunity" }, biggestLimiter: { label: "Wall Balls" } } },
      raceCardData: { biggestLimiter: { name: "Wall Balls" } },
      carouselReport: { slides: [{ biggest_limiter: "WALL BALLS" }] },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.primary, "Wall Balls");
});

test("artifactPrimaryConsistency ignores email header and footer domains when extracting primary", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 55:00: start with Wall Balls",
        emailHtml: `
          <span>www.getforma.fit</span>
          <span>MAIN INSIGHT</span>
          <p>The Wall Balls station is the biggest target opportunity. Biggest opportunity: Wall Balls.</p>
          <footer>www.getforma.fit</footer>
        `,
      },
      webReport: { browserSummary: { biggestLimiter: { label: "Wall Balls" } } },
      raceCardData: { biggestLimiter: { name: "Wall Balls" } },
      carouselReport: { slides: [{ biggest_limiter: "WALL BALLS" }] },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.fields.emailMain, "Wall Balls");
});

test("artifactPrimaryConsistency still fails true email-main mismatches after chrome stripping", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 1:00:00: start with Burpee Broad Jump",
        emailHtml: `
          <span>www.getforma.fit</span>
          <span>MAIN INSIGHT</span>
          <p>RoxZone is costing about 1:26. Biggest opportunity: RoxZone.</p>
          <footer>www.getforma.fit</footer>
        `,
      },
      webReport: { browserSummary: { heroInsight: { title: "The Burpee Broad Jump station is your biggest opportunity" }, biggestLimiter: { label: "Burpee Broad Jump" } } },
      raceCardData: { biggestLimiter: { name: "Burpee Broad Jump" } },
      carouselReport: { slides: [{ biggest_limiter: "BURPEE BROAD JUMP" }] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /emailMain=RoxZone/);
  assert.match(audit.detail, /expected Burpee Broad Jump/);
});

test("artifactPrimaryConsistency treats penalties as secondary in fitness-first two-track reports", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 1:00:00: start with Burpee Broad Jump",
        emailHtml: "<p>Burpee Broad Jump is the main directional fitness opportunity. Stations are the largest fitness category gap. Fastest controllable win: penalties.</p>",
      },
      webReport: {
        browserSummary: {
          heroInsight: { title: "The Burpee Broad Jump station is your biggest opportunity" },
          fastestControllableWin: { label: "Penalties" },
          largestFitnessLimiter: { label: "Burpee Broad Jump" },
          biggestLimiter: { label: "Burpee Broad Jump" },
        },
      },
      raceCardData: {
        artifactHeadlineMode: "fitness_first_with_penalty_win",
        biggestLimiter: { name: "Burpee Broad Jump" },
      },
      carouselReport: {
        slides: [{ biggest_limiter: "BURPEE BROAD JUMP", artifact_headline_mode: "fitness_first_with_penalty_win" }],
      },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.fields.emailMain, "Burpee Broad Jump");
  assert.equal(audit.fields.browserLimiter, "Burpee Broad Jump");
});

test("artifactPrimaryConsistency extracts contract-first run primary email openers", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 1:30:00: start with Run 2",
        emailHtml: "<span>MAIN INSIGHT</span><p>Run 2 is the main target limiter. Running is the largest target category gap. Biggest station opportunities: Sled Pull. Fastest controllable win: penalties.</p>",
      },
      webReport: {
        browserSummary: {
          heroInsight: { title: "Run 2 is your biggest opportunity" },
          fastestControllableWin: { label: "Penalties" },
          largestFitnessLimiter: { label: "Run 2" },
          biggestLimiter: { label: "Run 2" },
        },
      },
      raceCardData: {
        artifactHeadlineMode: "fitness_first_with_penalty_win",
        biggestLimiter: { name: "Run 2" },
      },
      carouselReport: {
        slides: [{ biggest_limiter: "RUN 2", artifact_headline_mode: "fitness_first_with_penalty_win" }],
      },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.fields.emailMain, "Run 2");
});

test("artifactPrimaryConsistency allows penalties as primary in penalty-first reports", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your fastest win is penalties",
        emailHtml: "<p>Penalties are your fastest controllable win and the primary opportunity.</p>",
      },
      webReport: {
        browserSummary: {
          fastestControllableWin: { label: "Penalties" },
          largestFitnessLimiter: { label: "Run 2" },
          biggestLimiter: { label: "Penalties" },
        },
      },
      raceCardData: {
        artifactHeadlineMode: "penalty_first",
        biggestLimiter: { name: "Penalties" },
      },
      carouselReport: {
        slides: [{ biggest_limiter: "PENALTIES", artifact_headline_mode: "penalty_first" }],
      },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.fields.browserLimiter, "Penalties");
});

test("artifactPrimaryConsistency still fails true two-track primary mismatches", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      emailReport: {
        emailSubject: "Your route to 1:00:00: start with Burpee Broad Jump",
        emailHtml: "<p>Burpee Broad Jump is the biggest target opportunity. Fastest controllable win: penalties.</p>",
      },
      webReport: {
        browserSummary: {
          fastestControllableWin: { label: "Penalties" },
          largestFitnessLimiter: { label: "Burpee Broad Jump" },
        },
      },
      raceCardData: {
        artifactHeadlineMode: "fitness_first_with_penalty_win",
        biggestLimiter: { name: "Run 2" },
      },
      carouselReport: {
        slides: [{ biggest_limiter: "RUN 2", artifact_headline_mode: "fitness_first_with_penalty_win" }],
      },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /raceCard=Run 2/);
  assert.match(audit.detail, /carousel=Run 2/);
});

test("artifactPrimaryConsistency fails category-first email main insight policy violations", () => {
  const audit = artifactPrimaryConsistency({
    result: {
      narrative: {
        headlineMode: "single_track",
        primaryClaim: { label: "Run 1", normalizedLabel: "Run 1", type: "run", segmentKey: "run_1" },
        primaryOpportunity: { normalizedLabel: "Run 1", displayLabel: "Run 1" },
      },
      emailReport: {
        emailSubject: "Your route to 1:00:00: start with Run 1",
        emailHtml: "<span>MAIN INSIGHT</span><p>The main limiter is station performance. Biggest opportunity: Run 1.</p>",
      },
      webReport: { browserSummary: { biggestLimiter: { label: "Run 1" } } },
      raceCardData: { mode: "analyse", biggestLimiter: { name: "Run 1" } },
      carouselReport: { slides: [{ biggest_limiter: "RUN 1" }] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /category-first/i);
});

test("artifactPrimaryConsistency fails target race cards missing exact target gap", () => {
  const audit = artifactPrimaryConsistency({
    mode: { calculatorMode: "target", targetFinishTimeSeconds: 4200 },
    result: {
      input: { calculatorMode: "target", targetFinishTimeSeconds: 4200 },
      narrative: {
        headlineMode: "single_track",
        primaryClaim: { label: "Wall Balls", normalizedLabel: "Wall Balls", type: "station", segmentKey: "wall_balls" },
        primaryOpportunity: { normalizedLabel: "Wall Balls", displayLabel: "Wall Balls" },
      },
      emailReport: {
        emailSubject: "Your route to 1:10:00: start with Wall Balls",
        emailHtml: "<span>MAIN INSIGHT</span><p>The Wall Balls station is the main target opportunity. Station performance is the largest category gap.</p>",
      },
      webReport: { browserSummary: { biggestLimiter: { label: "Wall Balls" } } },
      raceCardData: { mode: "target", targetTime: "1:10:00", biggestLimiter: { name: "Wall Balls" } },
      carouselReport: { slides: [{ biggest_limiter: "WALL BALLS" }] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /missing exact target gap/i);
});

test("artifactPrimaryConsistency passes contract-first target email with race-card target gap", () => {
  const audit = artifactPrimaryConsistency({
    mode: { calculatorMode: "target", targetFinishTimeSeconds: 4200 },
    result: {
      input: { calculatorMode: "target", targetFinishTimeSeconds: 4200 },
      narrative: {
        headlineMode: "single_track",
        primaryClaim: { label: "Run 1", normalizedLabel: "Run 1", type: "run", segmentKey: "run_1" },
        primaryOpportunity: { normalizedLabel: "Run 1", displayLabel: "Run 1" },
      },
      emailReport: {
        emailSubject: "Your route to 1:10:00: start with Run 1",
        emailHtml: "<span>MAIN INSIGHT</span><p>Run 1 is the main target opportunity. Treat that as sustainable opening pace control, not a cue to sprint the first kilometre.</p>",
      },
      webReport: { browserSummary: { biggestLimiter: { label: "Run 1" } } },
      raceCardData: { mode: "target", targetTime: "1:10:00", targetGapFormatted: "7:07", biggestLimiter: { name: "Run 1" } },
      carouselReport: { slides: [{ biggest_limiter: "RUN 1" }] },
    },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.fields.emailMain, "Run 1");
});

test("structuredExpectationConsistency fails stale case expectations before artifact comparison", () => {
  const audit = structuredExpectationConsistency({
    mode: { calculatorMode: "target" },
    expectations: {
      calculatorMode: "target",
      targetFinishTimeSeconds: 5100,
      analysisScope: "no_benchmark_data",
      headlineMode: "penalty_first",
      expectedTone: "ahead",
      primaryLabel: "Penalties",
      rankAllowed: false,
    },
    result: {
      narrative: {
        inputFacts: { calculatorMode: "target", targetTimeSeconds: 4500, analysisScope: "full", benchmarkAvailable: true },
        primaryTrack: { headlineMode: "fitness_first_with_penalty_win", primary: { label: "Wall Balls" } },
        primaryClaim: { label: "Wall Balls" },
        targetAssessment: { status: "behind" },
        rankPolicy: { allowed: true },
      },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /targetFinishTimeSeconds expected 5100/i);
  assert.match(audit.detail, /analysisScope expected no_benchmark_data/i);
  assert.match(audit.detail, /headlineMode expected penalty_first/i);
});

test("structuredExpectationConsistency allows labelled ad hoc cases with missing expectations", () => {
  const audit = structuredExpectationConsistency({
    label: "Penalty-heavy - penalty-first thesis",
    mode: { calculatorMode: "target" },
    result: {
      narrative: {
        inputFacts: { calculatorMode: "target", targetTimeSeconds: 5400, analysisScope: "full", benchmarkAvailable: true },
      },
    },
  });

  assert.equal(audit.pass, true);
  assert.match(audit.detail, /ad hoc/i);
  assert.equal(audit.rows[0].expected, "optional");
});

test("structuredExpectationConsistency fails explicit canonical cases with missing expectations", () => {
  const audit = structuredExpectationConsistency({
    canonical: true,
    mode: { calculatorMode: "target" },
    result: {
      narrative: {
        inputFacts: { calculatorMode: "target", targetTimeSeconds: 5400, analysisScope: "full", benchmarkAvailable: true },
      },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /missing structured expectations/i);
  assert.equal(audit.rows[0].expected, "required");
});

test("structuredExpectationConsistency fails canonical expectations missing required fields", () => {
  const audit = structuredExpectationConsistency({
    mode: { calculatorMode: "target" },
    expectations: { canonical: true, headlineMode: "penalty_first" },
    result: {
      narrative: {
        inputFacts: { calculatorMode: "target", targetTimeSeconds: 5400, analysisScope: "full", benchmarkAvailable: true },
        primaryTrack: { headlineMode: "penalty_first" },
        targetAssessment: { status: "behind" },
      },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /canonical expectation missing targetFinishTimeSeconds/i);
  assert.match(audit.detail, /canonical expectation missing analysisScope/i);
  assert.ok(audit.rows.some((row) => row.expectation === "targetFinishTimeSeconds" && row.pass === false));
});

test("structuredExpectationConsistency allows unlabelled ad hoc cases without expectations", () => {
  const audit = structuredExpectationConsistency({
    mode: { calculatorMode: "target" },
    result: {
      narrative: {
        inputFacts: { calculatorMode: "target", targetTimeSeconds: 5400, analysisScope: "full", benchmarkAvailable: true },
      },
    },
  });

  assert.equal(audit.pass, true);
  assert.match(audit.detail, /ad hoc/i);
});

test("contractSlotAudit fails artifacts that agree with each other but disagree with contract slots", () => {
  const audit = contractSlotAudit({
    mode: { calculatorMode: "target" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "Wall Balls", mainInsightOpening: "Wall Balls is the main target opportunity." },
          raceCard: { heroPrimary: "Wall Balls", targetGap: "6:29", strengthLabel: "Farmers Carry" },
          carousel: { slide1Primary: "WALL BALLS", ctaHeadline: "FIND YOUR TARGET ROUTE", strengthLabel: "FARMERS CARRY", slide2Gain: { station: "FARMERS CARRY" } },
        },
        targetAssessment: { displayGap: "6:29", ctaHeadline: "FIND YOUR TARGET ROUTE" },
        gapReconciliation: { requiresOffsetWording: false },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "Your route to 1:15:00: start with Wall Balls",
        emailHtml: "<span>MAIN INSIGHT</span><p>Wall Balls is the main target opportunity.</p>",
      },
      raceCardData: { mode: "target", targetGapFormatted: "6:28", biggestLimiter: { name: "Wall Balls" }, strongestStation: { name: "SkiErg" } },
      carouselReport: { slides: [
        { biggest_limiter: "WALL BALLS" },
        { biggest_gain: { station: "SKIERG" } },
        { station: "SKIERG" },
        {},
        {},
        { headline: "FIND YOUR NEXT MARGINAL GAIN" },
      ] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /race-card target gap 6:28 != 6:29/);
  assert.match(audit.detail, /carousel CTA FIND YOUR NEXT MARGINAL GAIN != FIND YOUR TARGET ROUTE/);
  assert.match(audit.detail, /carousel strength SKIERG != FARMERS CARRY/);
});

test("contractSlotAudit passes when artifacts render resolved contract slots", () => {
  const audit = contractSlotAudit({
    mode: { calculatorMode: "target" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "Run 1", mainInsightOpening: "Run 1 is the main target opportunity." },
          raceCard: { heroPrimary: "Run 1", targetGap: "7:07", strengthLabel: "NO RELIABLE STRENGTH" },
          carousel: { slide1Primary: "RUN 1", ctaHeadline: "FIND YOUR TARGET ROUTE", strengthLabel: "NO RELIABLE STRENGTH", slide2Gain: { station: "NO SPLIT AHEAD" } },
        },
        targetAssessment: { displayGap: "7:07", ctaHeadline: "FIND YOUR TARGET ROUTE" },
        gapReconciliation: { requiresOffsetWording: false },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "Your route to 1:10:00: start with Run 1",
        emailHtml: "<span>MAIN INSIGHT</span><p>Run 1 is the main target opportunity.</p>",
      },
      raceCardData: { mode: "target", targetGapFormatted: "7:07", biggestLimiter: { name: "Run 1" } },
      carouselReport: { slides: [
        { biggest_limiter: "RUN 1" },
        { biggest_gain: { station: "NO SPLIT AHEAD" } },
        { station: "NO RELIABLE STRENGTH" },
        {},
        {},
        { headline: "FIND YOUR TARGET ROUTE" },
      ] },
    },
  });

  assert.equal(audit.pass, true);
});

test("contractSlotAudit fails a generic Mode 1 subject even when body and visual artifacts agree", () => {
  const audit = contractSlotAudit({
    mode: { calculatorMode: "analyse" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "RoxZone", mainInsightOpening: "RoxZone is the main opportunity." },
          raceCard: { heroPrimary: "RoxZone", strengthLabel: "Run 8" },
          carousel: { slide1Primary: "ROXZONE", ctaHeadline: "TIGHTEN YOUR RACE FLOW", strengthLabel: "RUN 8", slide2Gain: { station: "RUN 8" } },
        },
        targetAssessment: { ctaHeadline: "TIGHTEN YOUR RACE FLOW" },
        gapReconciliation: { requiresOffsetWording: false },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "You're in the top 9% of sub-60 finishers. Here's the next refinement.",
        emailHtml: "<span>MAIN INSIGHT</span><p>RoxZone is the main opportunity.</p>",
      },
      raceCardData: { biggestLimiter: { name: "RoxZone" }, strongestStation: { name: "Run 8" } },
      carouselReport: { slides: [
        { biggest_limiter: "ROXZONE" },
        { biggest_gain: { station: "RUN 8" } },
        { station: "RUN 8" },
        {},
        {},
        { headline: "TIGHTEN YOUR RACE FLOW" },
      ] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /email subject missing RoxZone/);
});

test("contractSlotAudit fails raw reconciliation rendered before the contract reconciliation", () => {
  const contractReconciliation = "Station performance is the largest category gap at +3:30. Running is ahead of the comparison, which offsets a large part of that. Even accounting for that offset, the total gap is +1:37.";
  const audit = contractSlotAudit({
    mode: { calculatorMode: "analyse" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "Burpee Broad Jump", reconciliation: contractReconciliation, mainInsightOpening: `The Burpee Broad Jump station is the main opportunity. ${contractReconciliation}` },
          raceCard: { heroPrimary: "Burpee Broad Jump", strengthLabel: "Run 8" },
          carousel: { slide1Primary: "BURPEE BROAD JUMP", ctaHeadline: "FIND YOUR BOTTLENECK", strengthLabel: "RUN 8", slide2Gain: { station: "RUN 8" }, reconciliation: contractReconciliation },
        },
        targetAssessment: { ctaHeadline: "FIND YOUR BOTTLENECK" },
        gapReconciliation: { requiresOffsetWording: true },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "Burpee Broad Jump: You're in the sub-100 band. Here's the route to sub-95.",
        emailHtml: `<span>MAIN INSIGHT</span><p>Against the sub-95 benchmark median, your largest positive gap is stations: +5:30. ${contractReconciliation}</p>`,
      },
      raceCardData: { biggestLimiter: { name: "Burpee Broad Jump" }, strongestStation: { name: "Run 8" } },
      carouselReport: { slides: [
        { biggest_limiter: "BURPEE BROAD JUMP" },
        { biggest_gain: { station: "RUN 8" } },
        { station: "RUN 8" },
        {},
        {},
        { headline: "FIND YOUR BOTTLENECK" },
      ] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /local reconciliation before contract reconciliation/);
});

test("contractSlotAudit fails fastest-ahead run splits labelled as strongest station", () => {
  const audit = contractSlotAudit({
    mode: { calculatorMode: "analyse" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "Run 7", mainInsightOpening: "Run 7 is the main opportunity." },
          raceCard: { heroPrimary: "Run 7", strengthLabel: "Run 8" },
          carousel: { slide1Primary: "RUN 7", ctaHeadline: "FIND YOUR BOTTLENECK", strengthLabel: "RUN 8", slide2Gain: { station: "RUN 8" } },
        },
        targetAssessment: { ctaHeadline: "FIND YOUR BOTTLENECK" },
        gapReconciliation: { requiresOffsetWording: false },
        strengthPolicy: { status: "fastest_ahead_split_only", displayLabel: "Run 8" },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "Run 7: You're in the 120:00+ band. Here's the route to 105:00-119:59.",
        emailHtml: "<span>MAIN INSIGHT</span><p>Run 7 is the main opportunity.</p>",
      },
      raceCardData: { biggestLimiter: { name: "Run 7" }, strongestStation: { name: "Run 8", cardHeader: "Strongest Station", markdownLabel: "Strongest station" } },
      carouselReport: { slides: [
        { biggest_limiter: "RUN 7" },
        { biggest_gain: { station: "RUN 8" } },
        { station: "RUN 8" },
        {},
        {},
        { headline: "FIND YOUR BOTTLENECK" },
      ] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /fastest-ahead split rendered as strongest station/);
});

test("contractSlotAudit fails fastest-ahead split feature lists labelled as strongest station", () => {
  const audit = contractSlotAudit({
    mode: { calculatorMode: "analyse" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "Run 7", mainInsightOpening: "Run 7 is the main opportunity." },
          raceCard: { heroPrimary: "Run 7", strengthLabel: "Run 8" },
          carousel: {
            slide1Primary: "RUN 7",
            ctaHeadline: "FIND YOUR BOTTLENECK",
            strengthLabel: "RUN 8",
            slide2Gain: { station: "RUN 8" },
            features: ["Biggest Limiter", "Time Potential", "Best Relative Split", "Percentile Ranking", "Race Efficiency Score"],
          },
        },
        targetAssessment: { ctaHeadline: "FIND YOUR BOTTLENECK" },
        gapReconciliation: { requiresOffsetWording: false },
        strengthPolicy: { status: "fastest_ahead_split_only", displayLabel: "Run 8" },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "Run 7 is your main HYROX opportunity",
        emailHtml: "<span>MAIN INSIGHT</span><p>Run 7 is the main opportunity.</p>",
      },
      raceCardData: { biggestLimiter: { name: "Run 7" }, strongestStation: { name: "Run 8", cardHeader: "Best Relative Split", markdownLabel: "Best relative split" } },
      carouselReport: { slides: [
        { biggest_limiter: "RUN 7" },
        { biggest_gain: { station: "RUN 8" } },
        { station: "RUN 8" },
        {},
        {},
        { headline: "FIND YOUR BOTTLENECK", features: ["Biggest Limiter", "Time Potential", "Strongest Station", "Percentile Ranking", "Race Efficiency Score"] },
      ] },
    },
  });

  assert.equal(audit.pass, false);
  assert.match(audit.detail, /carousel feature list labels fastest-ahead split as strongest station/i);
});

test("contractSlotAudit accepts contract reconciliation with HTML value wrappers", () => {
  const contractReconciliation = "Station performance is the largest category gap at +3:30. Running is ahead of the comparison, which offsets a large part of that. Even accounting for that offset, the total gap is +1:37.";
  const audit = contractSlotAudit({
    mode: { calculatorMode: "analyse" },
    result: {
      narrative: {
        artifactSlots: {
          email: { subjectPrimary: "Burpee Broad Jump", reconciliation: contractReconciliation, mainInsightOpening: `The Burpee Broad Jump station is the main opportunity. ${contractReconciliation}` },
          raceCard: { heroPrimary: "Burpee Broad Jump", strengthLabel: "Run 8" },
          carousel: { slide1Primary: "BURPEE BROAD JUMP", ctaHeadline: "FIND YOUR BOTTLENECK", strengthLabel: "RUN 8", slide2Gain: { station: "RUN 8" }, reconciliation: contractReconciliation },
        },
        targetAssessment: { ctaHeadline: "FIND YOUR BOTTLENECK" },
        gapReconciliation: { requiresOffsetWording: true },
        roxzonePolicy: { copyPrecision: "exact" },
      },
      emailReport: {
        emailSubject: "Burpee Broad Jump is your main HYROX opportunity",
        emailHtml: "<span>MAIN INSIGHT</span><p>The Burpee Broad Jump station is the main opportunity. Station performance is the largest category gap at <strong>+3:30</strong>. Running is ahead of the comparison, which offsets a large part of that. Even accounting for that offset, the total gap is <strong>+1:37</strong>.</p>",
      },
      raceCardData: { biggestLimiter: { name: "Burpee Broad Jump" }, strongestStation: { name: "Run 8" } },
      carouselReport: { slides: [
        { biggest_limiter: "BURPEE BROAD JUMP" },
        { biggest_gain: { station: "RUN 8" } },
        { station: "RUN 8" },
        {},
        {},
        { headline: "FIND YOUR BOTTLENECK" },
      ] },
    },
  });

  assert.equal(audit.pass, true);
});

test("shared harness context forwards Mode 2 strength fields into Mode 3 athlete context", () => {
  const sharedContext = sharedContextFromRequestBody({
    weeklyStrengthSessions: "3",
    backSquat3RMKg: 101,
    backSquatReps: 5,
    deadlift3RMKg: 141,
    deadliftReps: 4,
    bodyweightKg: 83,
  });

  assert.equal(sharedContext.backSquat3RMKg, 101);
  assert.equal(sharedContext.backSquatReps, 5);
  assert.equal(sharedContext.deadlift3RMKg, 141);
  assert.equal(sharedContext.deadliftReps, 4);
  assert.equal(sharedContext.bodyweightKg, 83);

  const result = runHarnessMode(
    { modeName: "Mode 3: Hit a target time", calculatorMode: "target", targetFinishTimeSeconds: 4500 },
    {
      athleteName: "Alex Runner",
      sex: "male",
      division: "open",
      finishTimeSeconds: 6120,
      splits: [],
      penalties: [],
      raceReplay: [],
    },
    null,
    sharedContext,
  );

  assert.equal(result.input.athleteContext.backSquat3RMKg, 101);
  assert.equal(result.input.athleteContext.backSquatKg, 101);
  assert.equal(result.input.athleteContext.deadlift3RMKg, 141);
  assert.equal(result.input.athleteContext.deadliftKg, 141);
  assert.equal(result.input.athleteContext.bodyweightKg, 83);
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

test("rejects ambiguous implausible target times before generating harness output", async () => {
  const { response, body } = await request({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00" },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:30" },
    ],
  });

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_target_time");
  assert.match(body.message, /case 2/);
  assert.match(body.message, /1:30/);
  assert.match(body.message, /1:30:00/);
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
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  const mojibakeDash = "\u00e2\u20ac\u201d";

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    label: `Single case ${mojibakeDash} download`,
  });

  assert.equal(response.status, 200);
  const runId = response.headers.get("x-hyrox-harness-run-id");
  assert.match(runId ?? "", /^\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{8}$/);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(response.headers.get("content-type") ?? "", /charset=utf-8/i);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-harness-/);
  assert.match(response.headers.get("x-hyrox-harness-run-dir") ?? "", new RegExp(runId));
  assert.match(body, new RegExp(`Run ID: ${runId}`));
  assert.match(body, /# HYROX QA Test Harness/);
  assert.match(body, /## Mode 1: Analyse my race/);
  assert.match(body, /## Mode 3: Hit a target time/);
  assert.doesNotMatch(body, /## Mode 2/);
  assert.match(body, /```html/);
  assert.match(body, /## Comparison Notes/);
  assert.match(body, /## QA Flags/);
  assert.match(body, /Single case - download/);
  assert.doesNotMatch(body, /\u00e2\u20ac\u201d|\u00e2\u02c6\u2019|\u00c2/);
  assert.match(body, /target_email_does_not_show_zero_target_time/);
  assert.match(body, /Target-mode carousel text/);
  assert.match(body, /Analyse-mode carousel text/);
});

test("persists a successful single-case harness run to disk", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    canonical: true,
    expectations: {
      canonical: true,
      targetFinishTimeSeconds: 4500,
      analysisScope: "full",
      benchmarkAvailable: true,
      headlineMode: "single_track",
      expectedTone: "behind",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-hyrox-harness-run-id"), path.basename(onlyRunDir(baseDir)));
  assert.match(body, /# HYROX QA Test Harness/);

  const runDir = onlyRunDir(baseDir);
  const manifest = readJson(path.join(runDir, "manifest.json"));
  assert.match(manifest.runId, /^\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{8}$/);
  assert.equal(manifest.isPack, false);
  assert.equal(manifest.cases.length, 1);
  assert.equal(manifest.cases[0].ok, true);
  assert.equal(manifest.cases[0].athleteDisplayName, "Alex Runner");
  assert.equal(manifest.cases[0].targetFinishTimeSeconds, 4500);
  assert.equal(manifest.cases[0].canonical, true);
  assert.equal(manifest.cases[0].expectations.targetFinishTimeSeconds, 4500);
  assert.equal(manifest.cases[0].modes.length, 2);
  assert.match(manifest.cases[0].modes[0].contentHash, /^[0-9a-f]{64}$/);
  assert.ok(fs.readFileSync(path.join(runDir, "qa.md"), "utf8").includes("# HYROX QA Test Harness"));

  const analyseMode = manifest.cases[0].modes.find((mode) => mode.calculatorMode === "analyse");
  assert.ok(analyseMode);
  assert.equal(analyseMode.emailFile, "01-analyse-email.html");
  assert.equal(analyseMode.carouselFile, "01-analyse-carousel.json");
  const emailHtml = fs.readFileSync(path.join(runDir, analyseMode.emailFile), "utf8");
  const expectedFiles = emailHtmlEntriesFromHarnessEntries([{
    result: {
      parsed: { athleteName: "Alex Runner" },
      modeEntries: [{
        mode: { modeName: analyseMode.modeName, calculatorMode: analyseMode.calculatorMode },
        result: { emailReport: { emailHtml } },
      }],
    },
  }]);
  assert.equal(emailHtml, expectedFiles[0].html);
  const carousel = readJson(path.join(runDir, analyseMode.carouselFile));
  assert.ok(Array.isArray(carousel.slides));
  assert.equal(typeof carousel.carouselHtml, "string");
});

test("lists persisted harness runs as needing review when no assessments file exists", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  const { response, body } = await getJson("/api/admin/hyrox/test-harness/runs");

  assert.equal(response.status, 200);
  assert.equal(body.runs.length, 1);
  assert.equal(body.runs[0].cases[0].ok, true);
  assert.equal(body.runs[0].cases[0].modes.length, 2);
  assert.equal(body.runs[0].cases[0].modes.every((mode) => mode.needsReview === true), true);
  assert.equal(body.runs[0].cases[0].modes.every((mode) => mode.lastAssessment === null), true);
});

test("lists persisted harness runs with matching assessments as reviewed", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  const url = "https://results.hyrox.com/season-8/?x=1";

  await request({ url, targetTime: "1:15:00" });
  const manifest = readJson(path.join(onlyRunDir(baseDir), "manifest.json"));
  const analyseMode = manifest.cases[0].modes.find((mode) => mode.calculatorMode === "analyse");
  const assessment = {
    contentHash: analyseMode.contentHash,
    status: "approved",
    reviewer: "Claude",
    reviewedAt: "2026-07-23T12:00:00.000Z",
  };
  fs.writeFileSync(path.join(baseDir, "_assessments.json"), `${JSON.stringify({ [`${url}|analyse`]: assessment }, null, 2)}\n`);

  const { response, body } = await getJson("/api/admin/hyrox/test-harness/runs");

  assert.equal(response.status, 200);
  const listedAnalyseMode = body.runs[0].cases[0].modes.find((mode) => mode.calculatorMode === "analyse");
  const listedTargetMode = body.runs[0].cases[0].modes.find((mode) => mode.calculatorMode === "target");
  assert.equal(listedAnalyseMode.needsReview, false);
  assert.deepEqual(listedAnalyseMode.lastAssessment, assessment);
  assert.equal(listedTargetMode.needsReview, true);
});

test("changed harness analysis data flips a stale assessment back to needing review", async () => {
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  const url = "https://results.hyrox.com/season-8/?x=1";

  stubSuccessfulHyroxFetchWithFinish("1:42:00");
  await request({ url, targetTime: "1:15:00" });
  const firstRun = onlyRunDir(baseDir);
  const firstManifest = readJson(path.join(firstRun, "manifest.json"));
  const firstAnalyseHash = firstManifest.cases[0].modes.find((mode) => mode.calculatorMode === "analyse").contentHash;
  fs.writeFileSync(path.join(baseDir, "_assessments.json"), `${JSON.stringify({ [`${url}|analyse`]: { contentHash: firstAnalyseHash, status: "approved" } }, null, 2)}\n`);

  stubSuccessfulHyroxFetchWithFinish("1:43:00");
  await request({ url, targetTime: "1:15:00" });

  const { response, body } = await getJson("/api/admin/hyrox/test-harness/runs");

  assert.equal(response.status, 200);
  assert.equal(body.runs.length, 2);
  const analyseModes = body.runs.map((run) => run.cases[0].modes.find((mode) => mode.calculatorMode === "analyse"));
  const previousAnalyseMode = analyseModes.find((mode) => mode.contentHash === firstAnalyseHash);
  const changedAnalyseMode = analyseModes.find((mode) => mode.contentHash !== firstAnalyseHash);
  assert.ok(previousAnalyseMode);
  assert.ok(changedAnalyseMode);
  assert.equal(previousAnalyseMode.needsReview, false);
  assert.equal(changedAnalyseMode.needsReview, true);
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
  assert.match(body, /## Mode 1: Analyse my race/);
  assert.match(body, /## Mode 3: Hit a target time/);
  assert.match(body, /### HTML/);
  assert.match(body, /```html/);
});

test("generates downloadable email HTML zip artifact", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

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
  assert.equal(response.headers.get("x-hyrox-harness-run-id"), path.basename(onlyRunDir(baseDir)));
  assert.equal(body.subarray(0, 2).toString("utf8"), "PK");
});

test("generates a multi-case Instagram artifact pack", async () => {
  stubSuccessfulHyroxFetch();
  const mojibakeDash = "\u00e2\u20ac\u201d";
  const doubleMojibakeDash = "\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d";

  const { response, body } = await request({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00", label: `Open female ${mojibakeDash} benchmark` },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:20:00", label: `Penalty-heavy ${doubleMojibakeDash} target` },
    ],
    artifact: "instagram",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /hyrox-instagram-pack-2-/);
  assert.match(body, /# HYROX Instagram Pack/);
  assert.match(body, /- URL count: 2/);
  assert.match(body, /# Test Case 1 of 2/);
  assert.match(body, /# Test Case 2 of 2/);
  assert.doesNotMatch(body, /^# Test Case \d+ of \d+$/m);
  assert.match(body, /Target-mode carousel text/);
  assert.match(body, /Analyse-mode carousel text/);
  assert.match(body, /Open female - benchmark/);
  assert.match(body, /Penalty-heavy - target/);
  assert.doesNotMatch(body, /\u00e2\u20ac\u201d|\u00e2\u02c6\u2019|\u00c2/);
  assert.doesNotMatch(body, /\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d|\u00c3\u00a2\u00cb\u2020\u00e2\u20ac\u2122|\u00c3\u201a/);
});

test("returns structured preview data for rendered harness output", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
    preview: true,
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(body.success, true);
  assert.equal(body.runId, response.headers.get("x-hyrox-harness-run-id"));
  assert.equal(body.harnessRun.runId, body.runId);
  assert.equal(body.harnessRun.runDir, onlyRunDir(baseDir));
  assert.equal(body.cases.length, 1);
  assert.equal(body.cases[0].athleteName, "Alex Runner");
  assert.equal(body.cases[0].finishTimeFormatted, "1:42:00");
  assert.equal(body.cases[0].targetTimeFormatted, "1:15:00");
  assert.equal(body.cases[0].modes.length, 2);
  assert.equal(body.cases[0].modes[0].calculatorMode, "analyse");
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
  assert.match(response.headers.get("content-type") ?? "", /charset=utf-8/);
  assert.match(body, /# HYROX QA Test Pack/);
  assert.match(body, /- URL count: 2/);
  assert.match(body, /# Test Case 1 of 2/);
  assert.match(body, /# Test Case 2 of 2/);
  assert.doesNotMatch(body, /^# Test Case \d+ of \d+$/m);
  assert.match(body, /## Mode 1: Analyse my race/);
  assert.doesNotMatch(body, /\u00e2\u20ac\u201d|\u00e2\u02c6\u2019|\u00c2/);
  assert.doesNotMatch(body, /â€”|âˆ’|Â/);
});

test("generates a combined markdown test pack with per-case target times", async () => {
  stubSuccessfulHyroxFetch();
  const doubleMojibakeDash = "\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d";

  const { response, body } = await request({
    cases: [
      { url: "https://results.hyrox.com/season-8/?x=1", targetTime: "1:15:00", label: `Open female ${doubleMojibakeDash} standing` },
      { url: "https://results.hyrox.com/season-8/?x=2", targetTime: "1:20:00", label: "Clean label" },
    ],
  });

  assert.equal(response.status, 200);
  assert.match(body, /- 1\. \[Open female - standing\] https:\/\/results\.hyrox\.com\/season-8\/\?x=1 - target 1:15:00 - ok/);
  assert.match(body, /- 2\. \[Clean label\] https:\/\/results\.hyrox\.com\/season-8\/\?x=2 - target 1:20:00 - ok/);
  assert.match(body, /- Target time: 1:15:00/);
  assert.match(body, /- Target time: 1:20:00/);
  assert.doesNotMatch(body, /\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d|\u00c3\u201a/);
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

test("persists a pack harness run with successful and failed cases", async () => {
  stubMixedHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;

  const { response, body } = await request({
    urls: [
      "https://results.hyrox.com/season-8/?x=1",
      "https://results.hyrox.com/season-8/?fail=1",
    ],
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(body, /- Failed cases: 1/);

  const runDir = onlyRunDir(baseDir);
  const manifest = readJson(path.join(runDir, "manifest.json"));
  assert.equal(manifest.isPack, true);
  assert.equal(manifest.cases.length, 2);
  assert.equal(manifest.cases[0].ok, true);
  assert.equal(manifest.cases[0].modes.length, 2);
  assert.equal(manifest.cases[1].ok, false);
  assert.equal(manifest.cases[1].reason, "fetch_failed_503");
  assert.deepEqual(manifest.cases[1].modes, []);
  const qa = fs.readFileSync(path.join(runDir, "qa.md"), "utf8");
  assert.match(qa, /# HYROX QA Test Pack/);
  assert.match(qa, /fetch_failed_503/);

  const listed = await getJson("/api/admin/hyrox/test-harness/runs");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.runs[0].cases[1].ok, false);
  assert.deepEqual(listed.body.runs[0].cases[1].modes, []);
});

test("harness persistence failure does not change the normal response", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  const filePath = path.join(baseDir, "not-a-directory");
  fs.writeFileSync(filePath, "nope");
  process.env.HYROX_HARNESS_RUNS_DIR = filePath;

  const { response, body } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(body, /# HYROX QA Test Harness/);
});

test("harness run persistence enforces retention limit", async () => {
  stubSuccessfulHyroxFetch();
  const baseDir = makeTempDir();
  process.env.HYROX_HARNESS_RUNS_DIR = baseDir;
  process.env.HYROX_HARNESS_RUNS_MAX_KEPT = "2";
  for (const name of [
    "2026-07-20T010101-aaaaaaaa",
    "2026-07-21T010101-bbbbbbbb",
    "2026-07-22T010101-cccccccc",
  ]) {
    fs.mkdirSync(path.join(baseDir, name));
  }

  const { response } = await request({
    url: "https://results.hyrox.com/season-8/?x=1",
    targetTime: "1:15:00",
  });

  assert.equal(response.status, 200);
  const dirs = runDirs(baseDir);
  assert.equal(dirs.length, 2);
  assert.ok(dirs.some((name) => /^\d{4}-\d{2}-\d{2}T\d{6}-[0-9a-f]{8}$/.test(name)));
  assert.ok(dirs.includes("2026-07-22T010101-cccccccc"));
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

test("harness markdown normalizer repairs UTF-8 names decoded as Windows-1252", () => {
  const text = normalizeHarnessMarkdownText("Athlete: åœ‹æ˜Ÿ é‚± & å®¸éš å“");

  assert.equal(text, "Athlete: 國星 邱 & 宸靚 卓");
  assert.doesNotMatch(text, /åœ|æ˜|é‚/);
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
