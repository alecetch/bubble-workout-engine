import { isPhysiqueEnabled } from "../config/features.js";

export function requirePhysiqueEnabled(_req, res, next) {
  if (!isPhysiqueEnabled()) {
    return res.status(404).json({ ok: false, code: "feature_disabled", error: "Physique check-ins aren't available." });
  }
  return next();
}
