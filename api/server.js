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
import { pool } from "./src/db.js";
import { requestId } from "./src/middleware/requestId.js";

const app = express();

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

// Mount routers.
app.use("/api", importEmitterRouter);
app.use("/api", readProgramRouter);
app.use("/api", userBootstrapRouter);
app.use("/api", clientProfileBootstrapRouter);
app.use("/api", debugAllowedExercisesRouter);
app.use("/api", generateProgramRouter);

// Health route.
app.get("/health", async (req, res) => {
  const r = await pool.query("select now() as now");
  res.json({ ok: true, dbTime: r.rows[0].now });
});

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