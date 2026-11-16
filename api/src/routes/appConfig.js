import express from "express";
import { appVersionPolicy } from "../config/appVersionPolicy.js";
import { healthRateLimiter } from "../middleware/rateLimits.js";

export function createAppConfigRouter(policy = appVersionPolicy) {
  const router = express.Router();
  router.get("/app-config", healthRateLimiter, (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ ok: true, ...policy });
  });
  return router;
}
export const appConfigRouter = createAppConfigRouter();
