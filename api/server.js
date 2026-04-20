import "./instrument.js";
import * as Sentry from "@sentry/node";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { readProgramRouter } from "./src/routes/readProgram.js";
import { programExerciseRouter } from "./src/routes/programExercise.js";
import { programCompletionRouter } from "./src/routes/programCompletion.js";
import { debugAllowedExercisesRouter } from "./src/routes/debugAllowedExercises.js";
import { generateProgramV2Router } from "./src/routes/generateProgramV2.js";
import { segmentLogRouter } from "./src/routes/segmentLog.js";
import { createHistoryProgramsHandler, historyProgramsRouter } from "./src/routes/historyPrograms.js";
import { createHistoryTimelineHandler, historyTimelineRouter } from "./src/routes/historyTimeline.js";
import { createHistoryOverviewHandler, historyOverviewRouter } from "./src/routes/historyOverview.js";
import { createHistoryPersonalRecordsHandler, historyPersonalRecordsRouter } from "./src/routes/historyPersonalRecords.js";
import { createHistoryExerciseHandler, historyExerciseRouter } from "./src/routes/historyExercise.js";
import { sessionHistoryMetricsRouter } from "./src/routes/sessionHistoryMetrics.js";
import { activeProgramsRouter } from "./src/routes/activePrograms.js";
import { notificationPreferencesRouter } from "./src/routes/notificationPreferences.js";
import { prsFeedRouter } from "./src/routes/prsFeed.js";
import { loggedExercisesRouter } from "./src/routes/loggedExercises.js";
import { workoutRemindersRouter } from "./src/routes/workoutReminders.js";
import { trainingHistoryImportRouter } from "./src/routes/trainingHistoryImport.js";
import { adminConfigsRouter } from "./src/routes/adminConfigs.js";
import { adminSyncRouter } from "./src/routes/adminSync.js";
import { adminCoverageRouter } from "./src/routes/adminCoverage.js";
import { adminHealthRouter } from "./src/routes/adminHealth.js";
import { adminObservabilityRouter } from "./src/routes/adminObservability.js";
import { adminExerciseCatalogueRouter } from "./src/routes/adminExerciseCatalogue.js";
import { adminNarrationRouter } from "./src/routes/adminNarration.js";
import { adminRepRulesRouter } from "./src/routes/adminRepRules.js";
import { adminPreviewRouter } from "./src/routes/adminPreview.js";
import { adminProgressionSandboxRouter } from "./src/routes/adminProgressionSandbox.js";
import { adminCoachesRouter } from "./src/routes/adminCoaches.js";
import { adminUsersRouter } from "./src/routes/adminUsers.js";
import { adminSeedHistoryRouter } from "./src/routes/adminSeedHistory.js";
import { authRouter } from "./src/routes/auth.js";
import { coachPortalRouter } from "./src/routes/coachPortal.js";
import { buildPublicUrl } from "./src/utils/mediaUrl.js";
import { publicInternalError } from "./src/utils/publicError.js";
import logger from "./src/utils/logger.js";
import { pool } from "./src/db.js";
import { requireInternalToken } from "./src/middleware/auth.js";
import { requireAuth } from "./src/middleware/requireAuth.js";
import { adminOnly, userAuth } from "./src/middleware/chains.js";
import { requestId } from "./src/middleware/requestId.js";
import { requestLogger } from "./src/middleware/requestLogger.js";
import {
  makeClientProfileService,
  upsertProfile,
  getProfileById,
  toApiShape,
} from "./src/services/clientProfileService.js";
import { makeAnchorLiftService } from "./src/services/anchorLiftService.js";
import { RequestValidationError } from "./src/utils/validate.js";
import {
  adminRateLimiter,
  generationRateLimiter,
  globalRateLimiter,
  healthRateLimiter,
} from "./src/middleware/rateLimits.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEAK_SECRET_VALUES = new Set(["change-me", "secret", "password", "app", "minioadmin"]);

function isWeakSecret(value, minLength = 12) {
  const text = (value || "").toString().trim();
  if (!text) return true;
  return text.length < minLength || WEAK_SECRET_VALUES.has(text.toLowerCase());
}

function failStartup(message) {
  logger.fatal({ event: "server.startup.fatal", message }, "Startup validation failed");
  process.exit(1);
}

function validateStartupEnv() {
  const engineKey = (process.env.ENGINE_KEY || "").trim();
  const internalApiToken = (process.env.INTERNAL_API_TOKEN || "").trim();
  const jwtSecret = (process.env.JWT_SECRET || "").trim();
  const jwtIssuer = (process.env.JWT_ISSUER || "").trim();
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  const pgHost = (process.env.PGHOST || "").trim();
  const pgUser = (process.env.PGUSER || "").trim();
  const pgPassword = (process.env.PGPASSWORD || "").trim();
  const pgDatabase = (process.env.PGDATABASE || "").trim();

  if (isWeakSecret(engineKey, 16)) {
    failStartup("ENGINE_KEY is missing, too short, or uses a weak default.");
  }
  if (isWeakSecret(internalApiToken, 16)) {
    failStartup("INTERNAL_API_TOKEN is missing, too short, or uses a weak default.");
  }
  if (isWeakSecret(jwtSecret, 32)) {
    failStartup("JWT_SECRET is missing, too short, or uses a weak default.");
  }
  if (!jwtIssuer) {
    failStartup("JWT_ISSUER is missing.");
  }

  if (databaseUrl) {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      failStartup("DATABASE_URL is present but is not a valid URL.");
    }
    if (!(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:")) {
      failStartup("DATABASE_URL must use postgres:// or postgresql://.");
    }
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
      failStartup("DATABASE_URL must include host and database name.");
    }
    if (isWeakSecret(parsed.password, 8)) {
      failStartup("DATABASE_URL contains a missing, too short, or weak database password.");
    }
    return;
  }

  if (!pgHost || !pgUser || !pgPassword || !pgDatabase) {
    failStartup("Database configuration is missing. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.");
  }
  if (isWeakSecret(pgPassword, 8)) {
    failStartup("PGPASSWORD is too short or uses a weak default.");
  }
}

validateStartupEnv();

const app = express();
// Trust the single Fly.io load-balancer hop so req.ip is the real client IP
// (not the proxy IP) and x-forwarded-for is correctly resolved by Express.
app.set("trust proxy", 1);
const adminCspMiddleware = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "http:", "https:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
  },
});

function sendAdminPage(res, fileName) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  return res.sendFile(join(__dirname, `admin/${fileName}`));
}

const profilePatchKeys = [
  "goals",
  "fitnessLevel",
  "injuryFlags",
  "goalNotes",
  "equipmentPreset",
  "equipmentItemCodes",
  "preferredDays",
  "scheduleConstraints",
  "heightCm",
  "weightKg",
  "minutesPerSession",
  "sex",
  "ageRange",
  "onboardingStepCompleted",
  "onboardingCompletedAt",
  "programType",
  "anchorLiftsSkipped",
  "anchorLiftsCollectedAt",
  "anchorLifts",
];

const presetColumnByCode = {
  commercial_gym: "commercial_gym",
  crossfit_hyrox_gym: "crossfit_hyrox_gym",
  decent_home_gym: "decent_home_gym",
  minimal_equipment: "minimal_equipment",
  no_equipment: "no_equipment",
};

// TODO: Dev-only static reference data. Move these lists into Postgres-backed tables.
const devReferenceData = {
  goalTypes: [
    { code: "fat_loss", label: "Fat Loss" },
    { code: "general_fitness", label: "General Fitness" },
    { code: "strength", label: "Strength" },
    { code: "hypertrophy", label: "Hypertrophy" },
    { code: "hyrox_competition", label: "HYROX Competition" },
    { code: "turf_games_competition", label: "Turf Games Competition" },
    { code: "conditioning", label: "Conditioning" },
    { code: "rehab_return_from_injury", label: "Rehab / Return From Injury" },
  ],
  equipmentPresets: [
    { code: "commercial_gym", label: "Commercial Gym" },
    { code: "decent_home_gym", label: "Decent Home Gym" },
    { code: "minimal_equipment", label: "Minimal Equipment" },
    { code: "no_equipment", label: "No Equipment" },
    { code: "crossfit_hyrox_gym", label: "CrossFit / HYROX Gym" },
  ],
  fitnessLevels: [
    { rank: 1, code: "beginner", label: "Beginner" },
    { rank: 2, code: "intermediate", label: "Intermediate" },
    { rank: 3, code: "advanced", label: "Advanced" },
    { rank: 4, code: "elite", label: "Elite" },
  ],
  injuryFlags: [
    { code: "shoulder_issues", label: "Shoulder Issues" },
    { code: "knee_issues", label: "Knee Issues" },
    { code: "lower_back_spine", label: "Lower Back / Spine" },
    { code: "ankle_foot", label: "Ankle / Foot" },
    { code: "wrist_elbow", label: "Wrist / Elbow" },
    { code: "cardiovascular_limitations", label: "Cardiovascular Limitations" },
    { code: "no_known_issues", label: "No Known Issues" },
  ],
  minutesOptions: [
    { minutes: 40, label: "40" },
    { minutes: 50, label: "50" },
    { minutes: 60, label: "60" },
  ],
  daysOfWeek: [
    { code: "mon", label: "Mon" },
    { code: "tue", label: "Tue" },
    { code: "wed", label: "Wed" },
    { code: "thu", label: "Thu" },
    { code: "fri", label: "Fri" },
    { code: "sat", label: "Sat" },
    { code: "sun", label: "Sun" },
  ],
  sexOptions: [
    { code: "male", label: "Male" },
    { code: "female", label: "Female" },
    { code: "prefer_not_to_say", label: "Prefer Not To Say" },
  ],
  ageRanges: [
    { code: "under_18", label: "Under 18", isAdult: false },
    { code: "18_24", label: "18-24", isAdult: true },
    { code: "25_34", label: "25-34", isAdult: true },
    { code: "35_44", label: "35-44", isAdult: true },
    { code: "45_54", label: "45-54", isAdult: true },
    { code: "55_64", label: "55-64", isAdult: true },
    { code: "65_plus", label: "65+", isAdult: true },
  ],
};

// Assign/echo request_id before any other middleware or route handler.
app.use(requestId);
app.use(requestLogger);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(globalRateLimiter);
app.use("/admin", adminRateLimiter);
app.use("/api/admin", adminRateLimiter);
app.use("/admin-ui", adminRateLimiter);
app.use("/generate-plan-v2", generationRateLimiter);
app.use("/api/generate-plan-v2", generationRateLimiter);

// Serve local media assets (dev only — in prod these are served from S3).
app.use("/assets/media-assets", express.static(join(__dirname, "assets/media-assets")));
app.use("/admin-ui", adminCspMiddleware, express.static(join(__dirname, "admin")));
app.get("/admin/coverage", adminCspMiddleware, (_req, res) => sendAdminPage(res, "coverage.html"));
app.get("/admin/exercises", adminCspMiddleware, (_req, res) => sendAdminPage(res, "exercises.html"));
app.get("/admin/health", adminCspMiddleware, (_req, res) => sendAdminPage(res, "health.html"));
app.get("/admin/narration", adminCspMiddleware, (_req, res) => sendAdminPage(res, "narration.html"));
app.get("/admin/rep-rules", adminCspMiddleware, (_req, res) => sendAdminPage(res, "rep-rules.html"));
app.get("/admin/observability", adminCspMiddleware, (_req, res) => sendAdminPage(res, "observability.html"));
app.get("/admin/preview", adminCspMiddleware, (_req, res) => sendAdminPage(res, "preview.html"));
app.get("/admin/progression-sandbox", adminCspMiddleware, (_req, res) => sendAdminPage(res, "progression-sandbox.html"));
app.get("/admin/seed-history", adminCspMiddleware, (_req, res) => sendAdminPage(res, "seed-history.html"));

// Global JSON parser with raw body capture for diagnostics.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

// Health route.
app.get("/health", healthRateLimiter, async (req, res) => {
  try {
    const r = await pool.query("select now() as now");
    res.json({ ok: true, dbTime: r.rows[0].now });
  } catch (err) {
    req.log.error({ event: "http.health.error", err: err?.message }, "Health check failed");
    return res.status(500).json({
      ok: false,
      request_id: req.request_id,
      code: "internal_error",
      error: publicInternalError(err),
    });
  }
});

const handleReferenceData = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT exercise_slug AS code, name AS label, category
      FROM equipment_items
      ORDER BY category NULLS LAST, name ASC
    `);
    const equipmentItems = result.rows.map((row) => ({
      code: row.code,
      label: row.label,
      category: row.category ?? null,
    }));

    let anchorExercises = [];
    try {
      const anchorResult = await pool.query(`
        SELECT
          exercise_id,
          name,
          equipment_items_slugs,
          COALESCE(load_estimation_metadata->>'estimation_family', '') AS estimation_family,
          COALESCE((load_estimation_metadata->>'anchor_priority')::int, 999) AS anchor_priority,
          COALESCE((load_estimation_metadata->>'is_anchor_eligible')::boolean, false) AS is_anchor_eligible,
          COALESCE((load_estimation_metadata->>'family_conversion_factor')::numeric, 1) AS family_conversion_factor,
          COALESCE((load_estimation_metadata->>'is_unilateral')::boolean, false) AS is_unilateral
        FROM exercise_catalogue
        WHERE is_archived = false
          AND COALESCE((load_estimation_metadata->>'is_anchor_eligible')::boolean, false) = true
        ORDER BY estimation_family ASC, anchor_priority ASC, name ASC
      `);

      anchorExercises = anchorResult.rows.map((row) => ({
        exerciseId: row.exercise_id,
        label: row.name,
        equipmentItemsSlugs: Array.isArray(row.equipment_items_slugs) ? row.equipment_items_slugs : [],
        estimationFamily: row.estimation_family,
        anchorPriority: Number(row.anchor_priority ?? 999),
        isAnchorEligible: Boolean(row.is_anchor_eligible),
        familyConversionFactor: Number(row.family_conversion_factor ?? 1),
        isUnilateral: Boolean(row.is_unilateral),
      }));
    } catch (anchorErr) {
      req.log.warn(
        { event: "http.reference_data.anchor_exercises.warning", err: anchorErr?.message },
        "anchorExercises unavailable; returning reference data without them",
      );
    }

    return res.status(200).json({ ...devReferenceData, equipmentItems, anchorExercises });
  } catch (err) {
    req.log.error({ event: "http.reference_data.error", err: err?.message }, "reference-data error");
    return res.status(200).json(devReferenceData);
  }
};

// Canonical (new)
app.get("/api/reference-data", handleReferenceData);
// DEPRECATED — remove after Bubble client updates to /api/reference-data
app.get("/reference-data", handleReferenceData);

// Verify:
// curl "http://localhost:3000/media-assets?usage_scope=program_day"
const handleMediaAssets = async (req, res) => {
  const usageScope = typeof req.query.usage_scope === "string" ? req.query.usage_scope.trim() : "";
  const dayType = typeof req.query.day_type === "string" ? req.query.day_type.trim() : "";
  const focusType = typeof req.query.focus_type === "string" ? req.query.focus_type.trim() : "";
  const activeRaw = typeof req.query.active === "string" ? req.query.active.trim().toLowerCase() : "";
  const includeInactive = activeRaw === "false";

  const where = [];
  const params = [];

  if (!includeInactive) {
    params.push(true);
    where.push(`is_active = $${params.length}`);
  }

  if (usageScope) {
    params.push(usageScope);
    where.push(`usage_scope = $${params.length}`);
  }

  if (dayType) {
    params.push(dayType);
    where.push(`day_type = $${params.length}`);
  }

  if (focusType) {
    params.push(focusType);
    where.push(`focus_type = $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT
      id,
      usage_scope,
      day_type,
      focus_type,
      label,
      sort_order,
      is_active,
      image_key,
      image_url
    FROM public.media_assets
    ${whereClause}
    ORDER BY sort_order NULLS LAST, label ASC, id ASC
  `;

  try {
    const result = await pool.query(sql, params);
    return res.status(200).json({
      items: (result.rows ?? []).map((row) => ({
        id: row.id,
        usageScope: row.usage_scope,
        dayType: row.day_type,
        focusType: row.focus_type,
        label: row.label,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        imageKey: row.image_key,
        imageUrl: typeof row.image_url === "string" && row.image_url.trim()
          ? row.image_url
          : buildPublicUrl(row.image_key),
      })),
    });
  } catch (err) {
    req.log.error({ event: "http.media_assets.error", err: err?.message }, "media-assets error");
    return res.status(500).json({ error: "internal_error" });
  }
};

// Canonical (new)
app.get("/api/media-assets", handleMediaAssets);
// DEPRECATED — remove after Bubble client updates to /api/media-assets
app.get("/media-assets", handleMediaAssets);

// Verify:
// curl "http://localhost:3000/equipment-items?preset=commercial_gym"
const handleEquipmentItems = async (req, res) => {
  const preset = typeof req.query.preset === "string" ? req.query.preset : "";
  if (!preset) {
    return res.status(400).json({ error: "preset is required" });
  }

  const mappedColumn = presetColumnByCode[preset];
  if (!mappedColumn) {
    return res.status(400).json({ error: "invalid preset" });
  }

  try {
    const sql = `
      SELECT id, external_id, category, name, exercise_slug
      FROM equipment_items
      WHERE ${mappedColumn} = true
      ORDER BY category NULLS LAST, name ASC
    `;
    const result = await pool.query(sql);
    const items = result.rows.map((row) => ({
      id: row.id,
      externalId: row.external_id,
      category: row.category,
      label: row.name,
      code: row.exercise_slug,
    }));

    return res.status(200).json({ preset, items });
  } catch (err) {
    req.log.error({ event: "http.equipment_items.error", err: err?.message }, "equipment-items error");
    return res.status(500).json({ error: "internal_error" });
  }
};

// Canonical (new)
app.get("/api/equipment-items", handleEquipmentItems);
// DEPRECATED — remove after Bubble client updates to /api/equipment-items
app.get("/equipment-items", handleEquipmentItems);

// GET /me — returns the user's identity and current profile ID.
// Query: ?user_id=<id>
const handleMe = async (req, res) => {
  const userId = req.auth.user_id;
  try {
    const profileResult = await pool.query(
      `
      SELECT id
      FROM client_profile
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );
    return res.status(200).json({
      id: userId,
      clientProfileId: profileResult.rows[0]?.id ?? null,
    });
  } catch (err) {
    req.log.error({ event: "profile.me.error", err: err?.message }, "GET /me error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
};

// Canonical (new)
app.get("/api/me", requireAuth, handleMe);
// DEPRECATED — remove after Bubble client updates to /api/me
app.get("/me", requireAuth, handleMe);

// POST /client-profiles — upsert user + create profile if none exists.
// Query: ?user_id=<id>
const handleCreateClientProfile = async (req, res) => {
  const userId = req.auth.user_id;
  try {
    await upsertProfile(userId);
    const profileResult = await pool.query(
      `
      SELECT *
      FROM client_profile
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );
    const profile = profileResult.rows[0] ? toApiShape(profileResult.rows[0]) : null;
    return res.status(200).json(profile);
  } catch (err) {
    req.log.error({ event: "profile.create.error", err: err?.message }, "POST /client-profiles error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
};

// Canonical (new)
app.post("/api/client-profiles", requireAuth, handleCreateClientProfile);
// DEPRECATED — remove after Bubble client updates to /api/client-profiles
app.post("/client-profiles", requireAuth, handleCreateClientProfile);

// GET /client-profiles/:id — read profile by internal profile id.
const handleGetClientProfile = async (req, res) => {
  const profileId = req.params.id;
  try {
    const profile = await getProfileById(profileId);
    if (!profile) {
      return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
    }
    return res.status(200).json(profile);
  } catch (err) {
    req.log.error({ event: "profile.get.error", err: err?.message }, "GET /client-profiles/:id error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
};

// Canonical (new)
app.get("/api/client-profiles/:id", requireAuth, handleGetClientProfile);
// DEPRECATED — remove after Bubble client updates to /api/client-profiles/:id
app.get("/client-profiles/:id", requireAuth, handleGetClientProfile);

// PATCH /client-profiles/:id — patch profile fields.
const handlePatchClientProfile = async (req, res) => {
  const profileId = req.params.id;
  const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const anchorLifts = Array.isArray(patch.anchorLifts) ? patch.anchorLifts : undefined;
    const anchorLiftsSkipped = patch.anchorLiftsSkipped === undefined ? undefined : Boolean(patch.anchorLiftsSkipped);
    const shouldStampAnchorCollection = anchorLifts !== undefined || anchorLiftsSkipped !== undefined;
    const profilePatch = {
      ...patch,
      anchorLiftsSkipped,
      anchorLiftsCollectedAt: shouldStampAnchorCollection ? new Date().toISOString() : patch.anchorLiftsCollectedAt,
    };
    delete profilePatch.anchorLifts;

    const profileService = makeClientProfileService(client);
    const anchorLiftService = makeAnchorLiftService(client);
    const updated = await profileService.patchProfile(profileId, profilePatch);
    if (!updated) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
    }

    if (anchorLifts !== undefined) {
      await anchorLiftService.upsertAnchorLifts(profileId, anchorLifts);
    }

    await client.query("COMMIT");
    req.log.debug({ event: "profile.patch", id: profileId }, "profile patch applied");
    const refreshed = await profileService.getProfileById(profileId);
    return res.status(200).json(refreshed);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures
    }
    req.log.error({ event: "profile.patch.error", err: err?.message }, "PATCH /client-profiles/:id error");
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ ok: false, code: "validation_error", error: err.message, details: err.details });
    }
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  } finally {
    client?.release();
  }
};

// Canonical (new)
app.patch("/api/client-profiles/:id", requireAuth, handlePatchClientProfile);
// DEPRECATED — remove after Bubble client updates to /api/client-profiles/:id
app.patch("/client-profiles/:id", requireAuth, handlePatchClientProfile);

// PATCH /users/me — associate a profile with a user; returns current identity.
// Query/body: ?user_id=<id>
const handleUsersMe = async (req, res) => {
  const userId = req.auth.user_id;
  try {
    const clientProfileId = (req.body?.clientProfileId ?? "").toString().trim();
    if (clientProfileId) {
      await pool.query(
        `
        UPDATE client_profile
        SET user_id = $1, updated_at = now()
        WHERE id::text = $2
        `,
        [userId, clientProfileId],
      );
    }
    const profileResult = await pool.query(
      `
      SELECT id
      FROM client_profile
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );
    return res.status(200).json({
      id: userId,
      clientProfileId: profileResult.rows[0]?.id ?? null,
    });
  } catch (err) {
    req.log.error({ event: "profile.users_me.error", err: err?.message }, "PATCH /users/me error");
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
};

// Canonical (new)
app.patch("/api/users/me", requireAuth, handleUsersMe);
// DEPRECATED — remove after Bubble client updates to /api/users/me
app.patch("/users/me", requireAuth, handleUsersMe);

// Auth routes must be mounted before any /api router that applies requireAuth globally.
app.use("/api/auth", authRouter);
app.use("/api", notificationPreferencesRouter);
app.use("/api", activeProgramsRouter);
app.use("/api/coach", coachPortalRouter);
app.use("/api/import", trainingHistoryImportRouter);

// Mount routers.
// IMPORTANT: /api/admin mounts must come before the broad /api mounts below.
// Broad /api routers (segmentLog, readProgram, etc.) apply router-level requireAuth
// to every /api/* request that reaches them, which intercepts /api/admin/* calls
// before they can reach the internal-token–guarded admin routers.
app.use("/api/admin", adminCoachesRouter);
app.use("/api/admin", ...adminOnly, adminCoverageRouter);
app.use("/api/admin/observability", ...adminOnly, adminObservabilityRouter);
app.use("/api", workoutRemindersRouter);
app.use("/api", segmentLogRouter);
app.use("/api", readProgramRouter);
app.use("/api", programExerciseRouter);
app.use("/api", programCompletionRouter);
app.use("/api", debugAllowedExercisesRouter);

// Canonical /api-prefixed mounts (new).
app.get("/api/v1/history/programs", ...userAuth, createHistoryProgramsHandler(pool));
app.get("/api/v1/history/timeline", ...userAuth, createHistoryTimelineHandler(pool));
app.get("/api/v1/history/overview", ...userAuth, createHistoryOverviewHandler(pool));
app.get("/api/v1/history/personal-records", ...userAuth, createHistoryPersonalRecordsHandler(pool));
app.get("/api/v1/history/exercise/:exerciseId", ...userAuth, createHistoryExerciseHandler(pool));

// DEPRECATED backward-compat aliases — remove after Bubble client is updated to /api/v1/history/*.
app.use(historyProgramsRouter); // → GET /v1/history/programs
app.use(historyTimelineRouter); // → GET /v1/history/timeline
app.use(historyOverviewRouter); // → GET /v1/history/overview
app.use(historyPersonalRecordsRouter); // → GET /v1/history/personal-records
app.use(historyExerciseRouter); // → GET /v1/history/exercise/:exerciseId

app.use("/api", sessionHistoryMetricsRouter);
app.use("/api", prsFeedRouter);
app.use("/api", loggedExercisesRouter);
app.use("/admin/health", ...adminOnly, adminHealthRouter);
// DEPRECATED backward-compat alias (not under /api so no interception risk)
app.use("/admin/api/observability", ...adminOnly, adminObservabilityRouter);
app.use("/admin", ...adminOnly, adminConfigsRouter);
app.use("/admin", ...adminOnly, adminExerciseCatalogueRouter);
app.use("/admin", ...adminOnly, adminNarrationRouter);
app.use("/admin", ...adminOnly, adminRepRulesRouter);
app.use("/admin", ...adminOnly, adminSyncRouter);
app.use("/admin", ...adminOnly, adminPreviewRouter);
app.use("/admin", ...adminOnly, adminProgressionSandboxRouter);
app.use("/admin", ...adminOnly, adminUsersRouter);
app.use("/admin", ...adminOnly, adminSeedHistoryRouter);
// Canonical (new)
app.use("/api", generateProgramV2Router);
// DEPRECATED — remove after Bubble client updates
app.use(generateProgramV2Router);

// Sentry error handler — must come BEFORE the generic error handler and AFTER all routes.
Sentry.setupExpressErrorHandler(app);

// JSON parse error handler (ONLY for invalid JSON payloads).
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.type === "entity.parse.failed") {
    const raw = typeof req.rawBody === "string" ? req.rawBody : "";
    req.log.warn({
      event: "http.invalid_json",
      content_type: req.headers["content-type"] || "",
      raw_body_length: raw.length,
      raw_body_preview: raw.slice(0, 200),
    }, "Invalid JSON body");

    return res.status(400).json({
      ok: false,
      request_id: req.request_id,
      code: "invalid_json",
      error: "Invalid JSON",
    });
  }

  return next(err);
});

// Final generic error handler.
app.use((err, req, res, next) => {
  (req.log || logger).error({
    event: "http.unhandled_error",
    err: err?.message,
    stack: err?.stack,
  }, "Unhandled error");
  return res.status(500).json({
    ok: false,
    request_id: req.request_id,
    code: "internal_error",
    error: publicInternalError(err),
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => logger.info({ event: "server.listening", port }, `API listening on :${port}`));
