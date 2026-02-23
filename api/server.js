import "dotenv/config";
import express from "express";
import pg from "pg";
import { fetchInputs } from "./bubbleClient.js";
import { runPipeline } from "./engine/runPipeline.js";
import { importEmitterRouter } from "./src/routes/importEmitter.js";

const { Pool } = pg;
const app = express();

app.use("/api", importEmitterRouter);

// Parse JSON
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

// ✅ mount router
app.use("/api", importEmitterRouter);

// Postgres pool
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// Health route
app.get("/health", async (req, res) => {
  const r = await pool.query("select now() as now");
  res.json({ ok: true, dbTime: r.rows[0].now });
});

// Generate plan route
app.post("/generate-plan", async (req, res) => {
  console.log("generate-plan hit", req.headers["content-type"], req.body);

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

// JSON error handler
app.use((err, req, res, next) => {
  console.log("Request JSON parse error. Raw body was:", req.rawBody);
  return res.status(400).json({ ok: false, error: "Invalid JSON" });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
