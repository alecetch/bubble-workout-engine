import express from "express";
import { pool as defaultPool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";

function resolveUserId(req) {
  return req.auth?.user_id ?? null;
}

export function createAccountSettingsHandlers(db = defaultPool) {
  return {
    async getAccount(req, res) {
      try {
        const userId = resolveUserId(req);
        const { rows } = await db.query(
          `SELECT u.email, cp.display_name
           FROM app_user u
           LEFT JOIN client_profile cp ON cp.user_id = u.id
           WHERE u.id = $1
           LIMIT 1`,
          [userId],
        );
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "User not found." });
        }
        return res.json({
          ok: true,
          email: rows[0].email,
          displayName: rows[0].display_name ?? null,
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: publicInternalError(err) });
      }
    },

    async patchDisplayName(req, res) {
      try {
        const userId = resolveUserId(req);
        const displayName =
          typeof req.body?.displayName === "string" ? req.body.displayName.trim() : null;
        if (!displayName || displayName.length < 1 || displayName.length > 60) {
          return res.status(400).json({
            ok: false,
            code: "validation_error",
            error: "Display name must be 1-60 characters.",
          });
        }
        const { rows } = await db.query(
          `UPDATE client_profile SET display_name = $1, updated_at = now()
           WHERE user_id = $2
           RETURNING display_name`,
          [displayName, userId],
        );
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "Profile not found." });
        }
        return res.json({ ok: true, displayName: rows[0].display_name });
      } catch (err) {
        return res.status(500).json({ ok: false, error: publicInternalError(err) });
      }
    },

    async deleteAccount(req, res) {
      try {
        const userId = resolveUserId(req);
        await db.query("DELETE FROM app_user WHERE id = $1", [userId]);
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({ ok: false, error: publicInternalError(err) });
      }
    },
  };
}

const handlers = createAccountSettingsHandlers();

export const accountSettingsRouter = express.Router();
accountSettingsRouter.get("/users/me/account", requireAuth, handlers.getAccount);
accountSettingsRouter.patch("/users/me/display-name", requireAuth, handlers.patchDisplayName);
accountSettingsRouter.delete("/users/me", requireAuth, handlers.deleteAccount);
