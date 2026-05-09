import OpenAI from "openai";
import { pool } from "../db.js";
import {
  putObject,
  deleteObject,
  getInternalPresignedUrl,
  PHYSIQUE_BUCKET,
} from "./s3Service.js";

const OPENAI_MODEL = "gpt-4o";
const DISCLAIMER = "This is AI-generated guidance based on visual observation. It is not medical advice.";
const REGION_SLUGS = ["chest", "shoulders", "upper_back", "arms", "core", "quads", "glutes", "hamstrings", "calves"];
const BODY_STRENGTHS = new Set(["upper_body", "lower_body", "balanced"]);
const DEVELOPMENT_STAGES = new Set(["beginner", "intermediate", "advanced", "elite"]);
const CONFIDENCE_VALUES = new Set(["high", "medium", "low", "not_visible"]);
const SCORE_THRESHOLD_MILESTONES = [
  { threshold: 70, slug: "score_70" },
  { threshold: 80, slug: "score_80" },
  { threshold: 90, slug: "score_90" },
];

let _client = null;

function getClient() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildPrompt(hasComparison) {
  return [
    "You are a fitness coach providing a premium physique assessment based on a photo.",
    "Your tone is professional, encouraging, and non-clinical. Do not use medical language or mention body-fat percentage.",
    "Return a JSON object with exactly these keys:",
    "region_scores: object where each key is one of chest, shoulders, upper_back, arms, core, quads, glutes, hamstrings, calves.",
    "Each value must be { score: number 1-10 or null if not visible, descriptor: string or null, confidence: 'high'|'medium'|'low'|'not_visible' }.",
    "body_composition: { leanness_rating: 1-10, muscle_fullness_rating: 1-10, symmetry_rating: 1-10, dominant_strength: 'upper_body'|'lower_body'|'balanced', development_stage: 'beginner'|'intermediate'|'advanced'|'elite' }.",
    "observations: array of 3-6 specific factual strings about visible muscle development.",
    hasComparison
      ? "comparison_narrative: string comparing the current photo to the prior photo. Be specific. Do not invent changes if the images look similar."
      : "comparison_narrative: null.",
    "ai_coaching_narrative: string of 2-4 sentences with personalised coaching feedback referencing visible strengths and areas to develop.",
    `disclaimer: the fixed string "${DISCLAIMER}"`,
    "Return only the JSON object. No markdown, no explanation outside the JSON.",
  ].join("\n");
}

export function normaliseRegionScores(rawRegionScores) {
  const source = rawRegionScores && typeof rawRegionScores === "object" ? rawRegionScores : {};
  return Object.fromEntries(
    REGION_SLUGS.map((slug) => {
      const raw = source[slug] && typeof source[slug] === "object" ? source[slug] : {};
      const rawScore = toFiniteNumber(raw.score);
      const confidence = CONFIDENCE_VALUES.has(raw.confidence) ? raw.confidence : null;
      const score = rawScore == null ? null : round1(clamp(rawScore, 1, 10));
      const notVisible = confidence === "not_visible" || score == null;
      return [slug, {
        score: notVisible ? null : score,
        descriptor: notVisible ? null : (typeof raw.descriptor === "string" ? raw.descriptor.trim().slice(0, 160) : null),
        confidence: notVisible ? "not_visible" : (confidence ?? "medium"),
      }];
    }),
  );
}

function normaliseBodyComposition(rawBodyComposition) {
  const source = rawBodyComposition && typeof rawBodyComposition === "object" ? rawBodyComposition : {};
  const leanness = toFiniteNumber(source.leanness_rating);
  const fullness = toFiniteNumber(source.muscle_fullness_rating);
  const symmetry = toFiniteNumber(source.symmetry_rating);
  return {
    leanness_rating: round1(clamp(leanness ?? 5, 1, 10)),
    muscle_fullness_rating: round1(clamp(fullness ?? 5, 1, 10)),
    symmetry_rating: round1(clamp(symmetry ?? 5, 1, 10)),
    dominant_strength: BODY_STRENGTHS.has(source.dominant_strength) ? source.dominant_strength : "balanced",
    development_stage: DEVELOPMENT_STAGES.has(source.development_stage) ? source.development_stage : "intermediate",
  };
}

function normaliseObservations(rawObservations) {
  return Array.isArray(rawObservations)
    ? rawObservations
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim())
      .slice(0, 6)
    : [];
}

function normaliseNarrative(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function computePhysiqueScore(regionScores, bodyComposition) {
  const scoredRegions = Object.values(regionScores)
    .map((entry) => entry?.score)
    .filter((score) => Number.isFinite(score));

  const regionMean = scoredRegions.length > 0
    ? scoredRegions.reduce((sum, score) => sum + score, 0) / scoredRegions.length
    : 0;
  const bodyCompMean = (
    Number(bodyComposition.leanness_rating) +
    Number(bodyComposition.muscle_fullness_rating) +
    Number(bodyComposition.symmetry_rating)
  ) / 3;

  return round1(clamp((regionMean * 0.65 + bodyCompMean * 0.35) * 10, 0, 100));
}

export function computeEmphasisWeights(regionScores) {
  const visible = Object.entries(regionScores)
    .filter(([, entry]) => Number.isFinite(entry?.score))
    .map(([slug, entry]) => [slug, Number(entry.score)]);

  if (visible.length === 0) return {};

  const mean = visible.reduce((sum, [, score]) => sum + score, 0) / visible.length;
  const weights = {};

  for (const [slug, score] of visible) {
    const deficit = mean - score;
    const weight = mean > 0 ? clamp(deficit / mean, 0, 1) : 0;
    if (weight > 0.2) {
      weights[slug] = round1(weight);
    }
  }

  return weights;
}

function computeComparison(regionScores, physiqueScore, priorScan, comparisonNarrative) {
  if (!priorScan) return null;

  const priorScore = toFiniteNumber(priorScan.physique_score);
  const scoreDelta = priorScore == null ? null : round1(physiqueScore - priorScore);
  const priorRegions = priorScan.region_scores_json && typeof priorScan.region_scores_json === "object"
    ? priorScan.region_scores_json
    : {};
  const regionDeltas = {};

  for (const slug of REGION_SLUGS) {
    const currentScore = toFiniteNumber(regionScores[slug]?.score);
    const previousScore = toFiniteNumber(priorRegions?.[slug]?.score);
    if (currentScore != null && previousScore != null) {
      regionDeltas[slug] = round1(currentScore - previousScore);
    }
  }

  let trend = "stable";
  if (scoreDelta != null && scoreDelta > 0.5) trend = "improving";
  else if (scoreDelta != null && scoreDelta < -0.5) trend = "declining";

  return {
    score_delta: scoreDelta,
    narrative: comparisonNarrative,
    region_deltas: regionDeltas,
    trend,
  };
}

function computeNewStreak(priorRecentScan) {
  if (!priorRecentScan?.submitted_at) return 1;
  const priorAt = new Date(priorRecentScan.submitted_at).getTime();
  if (!Number.isFinite(priorAt)) return 1;
  const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
  return priorAt >= tenDaysAgo
    ? Number(priorRecentScan.streak_at_submission ?? 0) + 1
    : 1;
}

export function evaluateMilestones({
  scanCountBefore,
  currentScore,
  comparison,
  newStreak,
  currentRegionScores,
  priorMilestoneSlugs,
  priorMaxScoreDelta,
  priorMaxRegionScores,
}) {
  const milestones = [];
  const existing = new Set(priorMilestoneSlugs ?? []);

  if (scanCountBefore === 0) milestones.push("first_scan");
  if (newStreak >= 3) milestones.push("three_week_streak");
  if (newStreak >= 6) milestones.push("six_week_streak");
  if (newStreak >= 12) milestones.push("twelve_week_streak");

  for (const { threshold, slug } of SCORE_THRESHOLD_MILESTONES) {
    if (currentScore >= threshold && !existing.has(slug)) {
      milestones.push(slug);
    }
  }

  if (
    comparison?.score_delta != null &&
    comparison.score_delta > 0 &&
    comparison.score_delta > (priorMaxScoreDelta ?? Number.NEGATIVE_INFINITY)
  ) {
    milestones.push("biggest_weekly_gain");
  }

  const deltas = Object.entries(comparison?.region_deltas ?? {});
  if (deltas.length > 0 && deltas.every(([, delta]) => delta > 0)) {
    milestones.push("full_body_improvement");
  }

  for (const slug of REGION_SLUGS) {
    const score = toFiniteNumber(currentRegionScores?.[slug]?.score);
    const priorPeak = toFiniteNumber(priorMaxRegionScores?.[slug]);
    const milestoneSlug = `region_peak_${slug}`;
    if (score != null && priorPeak != null && score > priorPeak && !existing.has(milestoneSlug)) {
      milestones.push(milestoneSlug);
    }
  }

  if (scanCountBefore + 1 === 10) milestones.push("ten_scans");

  return [...new Set(milestones)];
}

function normalisePremiumAnalysis(parsed, priorScan) {
  const regionScores = normaliseRegionScores(parsed?.region_scores);
  const bodyComposition = normaliseBodyComposition(parsed?.body_composition);
  const observations = normaliseObservations(parsed?.observations);
  const aiCoachingNarrative = normaliseNarrative(parsed?.ai_coaching_narrative);
  const comparisonNarrative = priorScan ? normaliseNarrative(parsed?.comparison_narrative) : null;
  const physiqueScore = computePhysiqueScore(regionScores, bodyComposition);
  const emphasisWeights = computeEmphasisWeights(regionScores);
  const comparison = computeComparison(regionScores, physiqueScore, priorScan, comparisonNarrative);

  return {
    physique_score: physiqueScore,
    region_scores: regionScores,
    body_composition: bodyComposition,
    observations,
    comparison,
    emphasis_weights: emphasisWeights,
    ai_coaching_narrative: aiCoachingNarrative,
    disclaimer: DISCLAIMER,
  };
}

async function analysePremiumPhysiquePhoto(currentPhotoBase64, priorPhoto = null) {
  const content = [
    {
      type: "text",
      text: buildPrompt(priorPhoto !== null),
    },
    {
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${currentPhotoBase64}`,
        detail: "low",
      },
    },
  ];

  if (priorPhoto) {
    content.push({
      type: "text",
      text: `For comparison, here is a prior scan from ${priorPhoto.submittedAt}:`,
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${priorPhoto.base64}`,
        detail: "low",
      },
    });
  }

  const response = await getClient().chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    max_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return parsed;
}

function getPriorMaxRegionScores(rows) {
  const result = {};
  for (const slug of REGION_SLUGS) {
    let max = null;
    for (const row of rows) {
      const score = toFiniteNumber(row?.region_scores_json?.[slug]?.score);
      if (score != null && (max == null || score > max)) {
        max = score;
      }
    }
    result[slug] = max;
  }
  return result;
}

function getPriorMaxScoreDelta(rows) {
  let max = null;
  for (const row of rows) {
    const delta = toFiniteNumber(row?.comparison_json?.score_delta);
    if (delta != null && (max == null || delta > max)) {
      max = delta;
    }
  }
  return max;
}

async function fetchPriorPhotoForAnalysis(priorRecentScan) {
  if (!priorRecentScan?.photo_s3_key) return null;
  try {
    const signedUrl = await getInternalPresignedUrl(priorRecentScan.photo_s3_key, 120, PHYSIQUE_BUCKET);
    const priorResp = await fetch(signedUrl);
    if (!priorResp.ok) return null;
    const buf = Buffer.from(await priorResp.arrayBuffer());
    return {
      base64: buf.toString("base64"),
      submittedAt: new Date(priorRecentScan.submitted_at).toISOString().split("T")[0],
    };
  } catch {
    return null;
  }
}

export async function runPremiumScan(userId, photoBuffer, db = pool) {
  let s3Key = null;

  try {
    const [priorScansResult, milestoneRowsResult, consentResult] = await Promise.all([
      db.query(
        `SELECT id, submitted_at, photo_s3_key, physique_score, region_scores_json, comparison_json, streak_at_submission
         FROM physique_scan
         WHERE user_id = $1
         ORDER BY submitted_at DESC`,
        [userId],
      ),
      db.query(
        `SELECT milestone_slug
         FROM physique_milestone
         WHERE user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT physique_consent_at, physique_score_best
         FROM app_user
         WHERE id = $1`,
        [userId],
      ),
    ]);

    if (!consentResult.rows[0]?.physique_consent_at) {
      const err = new Error("You must accept the physique tracking terms before uploading a photo.");
      err.code = "consent_required";
      throw err;
    }

    const priorScans = priorScansResult.rows ?? [];
    const priorRecentScan = priorScans.find((row) => {
      const submittedAt = new Date(row.submitted_at).getTime();
      return Number.isFinite(submittedAt) && submittedAt > Date.now() - 30 * 24 * 60 * 60 * 1000;
    }) ?? null;

    const timestamp = Date.now();
    s3Key = `physique/${userId}/premium-${timestamp}.jpg`;
    await putObject(s3Key, photoBuffer, "image/jpeg", PHYSIQUE_BUCKET);

    const priorPhoto = await fetchPriorPhotoForAnalysis(priorRecentScan);
    const rawAnalysis = await analysePremiumPhysiquePhoto(photoBuffer.toString("base64"), priorPhoto);
    const normalized = normalisePremiumAnalysis(rawAnalysis, priorRecentScan);

    const visibleRegionCount = Object.values(normalized.region_scores)
      .filter((entry) => entry.score !== null && entry.confidence !== "not_visible").length;
    if (visibleRegionCount < 3 && normalized.physique_score < 25) {
      const err = new Error(
        "We couldn't detect your physique clearly. Try a well-lit photo with a plain background, facing the camera with minimal clothing.",
      );
      err.code = "low_quality_photo";
      throw err;
    }

    const newStreak = computeNewStreak(priorRecentScan);
    const milestones = evaluateMilestones({
      scanCountBefore: priorScans.length,
      currentScore: normalized.physique_score,
      comparison: normalized.comparison,
      newStreak,
      currentRegionScores: normalized.region_scores,
      priorMilestoneSlugs: milestoneRowsResult.rows.map((row) => row.milestone_slug),
      priorMaxScoreDelta: getPriorMaxScoreDelta(priorScans),
      priorMaxRegionScores: getPriorMaxRegionScores(priorScans),
    });

    const insertR = await db.query(
      `INSERT INTO physique_scan
         (
           user_id,
           photo_s3_key,
           physique_score,
           region_scores_json,
           body_composition_json,
           observations_json,
           comparison_json,
           milestones_json,
           emphasis_weights_json,
           streak_at_submission,
           ai_coaching_narrative
         )
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11)
       RETURNING id, submitted_at`,
      [
        userId,
        s3Key,
        normalized.physique_score,
        JSON.stringify(normalized.region_scores),
        JSON.stringify(normalized.body_composition),
        JSON.stringify(normalized.observations),
        normalized.comparison ? JSON.stringify(normalized.comparison) : null,
        JSON.stringify(milestones),
        JSON.stringify(normalized.emphasis_weights),
        newStreak,
        normalized.ai_coaching_narrative,
      ],
    );

    const scan = insertR.rows[0];

    for (const milestoneSlug of milestones) {
      await db.query(
        `INSERT INTO physique_milestone (user_id, scan_id, milestone_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [userId, scan.id, milestoneSlug],
      );
    }

    await db.query(
      `UPDATE app_user
       SET physique_scan_streak = $2,
           physique_score_best = CASE
             WHEN physique_score_best IS NULL OR $3 > physique_score_best THEN $3
             ELSE physique_score_best
           END
       WHERE id = $1`,
      [userId, newStreak, normalized.physique_score],
    );

    return {
      ok: true,
      scan_id: scan.id,
      submitted_at: scan.submitted_at,
      physique_score: normalized.physique_score,
      score_delta: normalized.comparison?.score_delta ?? null,
      region_scores: normalized.region_scores,
      body_composition: normalized.body_composition,
      observations: normalized.observations,
      comparison: normalized.comparison,
      milestones_achieved: milestones,
      ai_coaching_narrative: normalized.ai_coaching_narrative,
      streak: newStreak,
      disclaimer: normalized.disclaimer,
    };
  } catch (err) {
    if (s3Key) {
      deleteObject(s3Key, PHYSIQUE_BUCKET).catch(() => {});
    }
    throw err;
  }
}
