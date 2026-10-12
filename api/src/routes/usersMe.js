import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { makeClientProfileService } from "../services/clientProfileService.js";
import { publicInternalError } from "../utils/publicError.js";

export function createUsersMeRouter({ db = pool } = {}) {
  const router = express.Router();
  const service = makeClientProfileService(db);
  // PATCH /users/me: validate the legacy profile link and update caller preferences.
  const handleUsersMe = async (req, res) => {
    const userId = req.auth.user_id;
    try {
      const clientProfileId = (req.body?.clientProfileId ?? "").toString().trim();
      const preferredUnit = typeof req.body?.preferredUnit === "string" ? req.body.preferredUnit.trim().toLowerCase() : null;
      const preferredHeightUnit = typeof req.body?.preferredHeightUnit === "string" ? req.body.preferredHeightUnit.trim().toLowerCase() : null;
      if (clientProfileId) {
        if (!await service.getOwnedProfile(clientProfileId, userId)) {
          return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
        }
      }
      if (preferredUnit !== null) {
        if (preferredUnit !== "kg" && preferredUnit !== "lbs") {
          return res.status(400).json({
            ok: false,
            code: "validation_error",
            error: "preferredUnit must be one of: kg, lbs",
          });
        }
        await db.query(
          `
          UPDATE client_profile
          SET preferred_unit = $2, updated_at = now()
          WHERE user_id = $1
          `,
          [userId, preferredUnit],
        );
      }
      if (preferredHeightUnit !== null) {
        if (preferredHeightUnit !== "cm" && preferredHeightUnit !== "ft") {
          return res.status(400).json({
            ok: false,
            code: "validation_error",
            error: "preferredHeightUnit must be one of: cm, ft",
          });
        }
        await db.query(
          `
          UPDATE client_profile
          SET preferred_height_unit = $2, updated_at = now()
          WHERE user_id = $1
          `,
          [userId, preferredHeightUnit],
        );
      }
      const profileResult = await db.query(
        `
        SELECT id, preferred_unit, preferred_height_unit
        FROM client_profile
        WHERE user_id = $1
        LIMIT 1
        `,
        [userId],
      );
      return res.status(200).json({
        id: userId,
        clientProfileId: profileResult.rows[0]?.id ?? null,
        preferredUnit: profileResult.rows[0]?.preferred_unit ?? "kg",
        preferredHeightUnit: profileResult.rows[0]?.preferred_height_unit ?? "cm",
      });
    } catch (err) {
      req.log.error({ event: "profile.users_me.error", err: err?.message }, "PATCH /users/me error");
      return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
    }
  };

  router.patch("/", requireAuth, handleUsersMe);
  return router;
}
