import "dotenv/config";
import express from "express";
import { fetchInputs } from "./bubbleClient.js";
import { runPipeline } from "./engine/runPipeline.js";
import { importEmitterRouter } from "./src/routes/importEmitter.js";
import { readProgramRouter } from "./src/routes/readProgram.js";
import { userBootstrapRouter } from "./src/routes/userBootstrap.js";
import { clientProfileBootstrapRouter } from "./src/routes/clientProfileBootstrap.js";
import { debugAllowedExercisesRouter } from "./src/routes/debugAllowedExercises.js";
import { generateProgramRouter } from "./src/routes/generateProgram.js";
import { generateProgramV2Router } from "./src/routes/generateProgramV2.js";
import { pool } from "./src/db.js";
import { requestId } from "./src/middleware/requestId.js";

const app = express();
const DEV_USER_ID = "dev-user-1";

// TODO: Dev-only in-memory store. Replace with Postgres-backed persistence.
const profilesById = new Map();
const userToProfileId = new Map();
app.locals.profilesById = profilesById;

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
];

const presetColumnByCode = {
  commercial_gym: "commercial_gym",
  crossfit_hyrox_gym: "crossfit_hyrox_gym",
  decent_home_gym: "decent_home_gym",
  minimal_equipment: "minimal_equipment",
  no_equipment: "no_equipment",
};

function createDevProfile(id, userId) {
  return {
    id,
    userId,
    goals: [],
    fitnessLevel: null,
    injuryFlags: [],
    goalNotes: "",
    equipmentPreset: null,
    equipmentItemCodes: [],
    preferredDays: [],
    scheduleConstraints: "",
    heightCm: null,
    weightKg: null,
    minutesPerSession: null,
    sex: null,
    ageRange: null,
    onboardingStepCompleted: 0,
    onboardingCompletedAt: null,
  };
}

// TODO: Dev-only static reference data. Move these lists into Postgres-backed tables.
const devReferenceData = {
  goalTypes: [
    { code: "fat_loss", label: "Fat Loss" },
    { code: "general_fitness", label: "General Fitness" },
    { code: "strength", label: "Strength" },
    { code: "hypertrophy", label: "Hypertrophy" },
    { code: "hyrox_competition", label: "HYROX Competition" },
    { code: "turf_games_competition", label: "Turf Games Competition" },
    { code: "endurance", label: "Endurance" },
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

// Global JSON parser with raw body capture for diagnostics.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

// Debug logger (targeted): only for POST /api/program/generate.
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/api/program/generate") {
    const bodyIsObject = !!req.body && typeof req.body === "object" && !Array.isArray(req.body);
    const bodyKeysPreview = bodyIsObject ? Object.keys(req.body).slice(0, 20) : [];

    console.info(
      JSON.stringify({
        event: "program_generate_request",
        method: req.method,
        path: req.path,
        content_type: req.headers["content-type"] || "",
        content_length: req.headers["content-length"] || "",
        raw_body_length: typeof req.rawBody === "string" ? req.rawBody.length : 0,
        body_is_object: bodyIsObject,
        body_keys_preview: bodyKeysPreview,
      }),
    );
  }
  next();
});

// Health route.
app.get("/health", async (req, res) => {
  const r = await pool.query("select now() as now");
  res.json({ ok: true, dbTime: r.rows[0].now });
});

app.get("/reference-data", (req, res) => {
  return res.status(200).json(devReferenceData);
});

// Verify:
// curl "http://localhost:3000/equipment-items?preset=commercial_gym"
app.get("/equipment-items", async (req, res) => {
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
      SELECT id, bubble_id, category, name, exercise_slug
      FROM equipment_items
      WHERE ${mappedColumn} = true
      ORDER BY category NULLS LAST, name ASC
    `;
    const result = await pool.query(sql);
    const items = result.rows.map((row) => ({
      id: row.id,
      bubbleId: row.bubble_id,
      category: row.category,
      label: row.name,
      code: row.exercise_slug,
    }));

    return res.status(200).json({ preset, items });
  } catch (err) {
    console.error("equipment-items error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// TODO: Replace with authenticated user when auth layer is implemented
app.get("/me", (req, res) => {
  const clientProfileId = userToProfileId.get(DEV_USER_ID) ?? null;
  return res.status(200).json({
    id: DEV_USER_ID,
    clientProfileId,
  });
});

// TODO: Dev-only in-memory routes. Replace with authenticated + Postgres-backed routes.
app.post("/client-profiles", (req, res) => {
  const existingProfileId = userToProfileId.get(DEV_USER_ID);
  if (existingProfileId) {
    const existingProfile = profilesById.get(existingProfileId);
    if (existingProfile) {
      return res.status(200).json(existingProfile);
    }
  }

  const id = "dev-profile-1";
  const profile = createDevProfile(id, DEV_USER_ID);
  profilesById.set(id, profile);
  userToProfileId.set(DEV_USER_ID, id);
  return res.status(200).json(profile);
});

app.get("/client-profiles/:id", (req, res) => {
  const profile = profilesById.get(req.params.id);
  if (!profile) {
    return res.status(404).json({ error: "not found" });
  }

  return res.status(200).json(profile);
});

app.patch("/client-profiles/:id", (req, res) => {
  const profile = profilesById.get(req.params.id);
  if (!profile) {
    return res.status(404).json({ error: "not found" });
  }

  const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  for (const key of profilePatchKeys) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      profile[key] = patch[key];
    }
  }

  profilesById.set(profile.id, profile);
  return res.status(200).json(profile);
});

app.patch("/users/me", (req, res) => {
  const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const clientProfileId = typeof patch.clientProfileId === "string" ? patch.clientProfileId : null;
  if (clientProfileId) {
    userToProfileId.set(DEV_USER_ID, clientProfileId);
  } else {
    userToProfileId.delete(DEV_USER_ID);
  }

  return res.status(200).json({
    id: DEV_USER_ID,
    clientProfileId,
  });
});

// Mount routers.
app.use("/api", importEmitterRouter);
app.use("/api", readProgramRouter);
app.use("/api", userBootstrapRouter);
app.use("/api", clientProfileBootstrapRouter);
app.use("/api", debugAllowedExercisesRouter);
app.use("/api", generateProgramRouter);
app.use(generateProgramV2Router);

// Generate plan route (uses global JSON parser only).
app.post("/generate-plan", async (req, res) => {
  console.info(JSON.stringify({
    ts: new Date().toISOString(),
    event: "generate_plan.request",
    content_type: req.headers["content-type"] || "",
  }));

  // Auth
  if (req.headers["x-engine-key"] !== process.env.ENGINE_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const { clientProfileId, programType = "hypertrophy" } = req.body ?? {};

    const inputs = await fetchInputs({ clientProfileId });

    const plan = await runPipeline({
      inputs,
      programType,
      request: req.body,
    });

    return res.json({ ok: true, plan });
  } catch (err) {
    console.error("generate-plan error:", err);
    return res
      .status(500)
      .json({ ok: false, error: String(err?.message ?? err) });
  }
});

// JSON parse error handler (ONLY for invalid JSON payloads).
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.type === "entity.parse.failed") {
    const raw = typeof req.rawBody === "string" ? req.rawBody : "";
    console.error(
      JSON.stringify({
        event: "invalid_json",
        message: err.message,
        content_type: req.headers["content-type"] || "",
        raw_body_length: raw.length,
        raw_body_preview: raw.slice(0, 200),
      }),
    );

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
  console.error("Unhandled error:", err?.stack || err);
  return res.status(500).json({
    ok: false,
    request_id: req.request_id,
    code: "internal_error",
    error: err?.message || "Internal server error",
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`API listening on :${port}`));
