import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { makeClientProfileService, toApiShape } from "../services/clientProfileService.js";
import { makeAnchorLiftService } from "../services/anchorLiftService.js";
import { RequestValidationError } from "../utils/validate.js";
import { VALID_FOCUS_SLUGS } from "../utils/splitRecommender.js";
import { publicInternalError } from "../utils/publicError.js";

export function createClientProfilesRouter({ db = pool } = {}) {
  const router = express.Router();
  const service = makeClientProfileService(db);
  // POST /client-profiles — upsert user + create profile if none exists.
  const handleCreateClientProfile = async (req, res) => {
    const userId = req.auth.user_id;
    try {
      await service.upsertProfile(userId);
      const profileResult = await db.query(
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

  // GET /client-profiles/:id — read profile by internal profile id.
  const handleGetClientProfile = async (req, res) => {
    const profileId = req.params.id;
    try {
      const profile = await service.getOwnedProfile(profileId, req.auth.user_id);
      if (!profile) {
        return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
      }
      return res.status(200).json(profile);
    } catch (err) {
      req.log.error({ event: "profile.get.error", err: err?.message }, "GET /client-profiles/:id error");
      return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
    }
  };

  // PATCH /client-profiles/:id — patch profile fields.
  const handlePatchClientProfile = async (req, res) => {
    const profileId = req.params.id;
    const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    let client;
    try {
      const anchorLifts = Array.isArray(patch.anchorLifts) ? patch.anchorLifts : undefined;
      const anchorLiftsSkipped = patch.anchorLiftsSkipped === undefined ? undefined : Boolean(patch.anchorLiftsSkipped);
      const shouldStampAnchorCollection = anchorLifts !== undefined || anchorLiftsSkipped !== undefined;
      const profilePatch = {
        ...patch,
        anchorLiftsSkipped,
        anchorLiftsCollectedAt: shouldStampAnchorCollection ? new Date().toISOString() : patch.anchorLiftsCollectedAt,
      };
      delete profilePatch.anchorLifts;

      if (profilePatch.preferredSplitJson !== undefined) {
        const dayFocuses = profilePatch.preferredSplitJson?.day_focuses;
        if (!Array.isArray(dayFocuses) || dayFocuses.length === 0) {
          return res.status(400).json({
            ok: false,
            request_id: req.request_id,
            code: "validation_error",
            error: "day_focuses must be a non-empty array",
          });
        }
        for (const slug of dayFocuses) {
          if (!VALID_FOCUS_SLUGS.has(slug)) {
            return res.status(400).json({
              ok: false,
              request_id: req.request_id,
              code: "validation_error",
              error: `Unknown focus slug: ${slug}`,
            });
          }
        }
      }

      client = await db.connect();
      await client.query("BEGIN");

      const profileService = makeClientProfileService(client);
      const anchorLiftService = makeAnchorLiftService(client);
      const updated = await profileService.patchOwnedProfile(profileId, req.auth.user_id, profilePatch);
      if (!updated) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, code: "not_found", error: "Profile not found" });
      }

      if (anchorLifts !== undefined) {
        await anchorLiftService.upsertAnchorLifts(profileId, anchorLifts);
      }

      await client.query("COMMIT");
      req.log.debug({ event: "profile.patch", id: profileId }, "profile patch applied");
      const refreshed = await profileService.getOwnedProfile(profileId, req.auth.user_id);
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

  router.post("/", requireAuth, handleCreateClientProfile);
  router.get("/:id", requireAuth, handleGetClientProfile);
  router.patch("/:id", requireAuth, handlePatchClientProfile);
  return router;
}
