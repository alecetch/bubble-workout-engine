import { deletePrefix, PHYSIQUE_BUCKET } from "./s3Service.js";
import { deleteSubscriber } from "./revenuecatSync.js";
import { isUuid } from "../utils/userIdentity.js";
import logger from "../utils/logger.js";

export class AccountDeletionError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function makeAccountDeletionService({ db, deletePrefixFn = deletePrefix, deleteSubscriberFn = deleteSubscriber, log = logger }) {
  return {
    async deleteAccount(userId, { source }) {
      if (typeof userId !== "string" || !isUuid(userId)) return { deleted: false, reason: "not_found" };
      const { rows } = await db.query("SELECT id FROM app_user WHERE id = $1", [userId]);
      if (!rows.length) return { deleted: false, reason: "not_found" };
      // Database UUID casing is also the casing used by the upload routes.
      userId = rows[0].id;
      let photosDeleted;
      try { photosDeleted = (await deletePrefixFn(`physique/${userId}/`, PHYSIQUE_BUCKET)).deleted; }
      catch {
        log.error({ event: "account.delete.storage_failed", userId, source });
        throw new AccountDeletionError("storage_failed");
      }
      await db.query("DELETE FROM app_user WHERE id = $1", [userId]);
      try {
        const result = await deleteSubscriberFn(userId);
        log.info({ event: result.skipped ? "account.delete.revenuecat_skipped" : "account.delete.revenuecat_deleted", userId, source });
      } catch { log.warn({ event: "account.delete.revenuecat_failed", userId, source }); }
      log.info({ event: "account.delete.completed", userId, source, photos_deleted: photosDeleted });
      return { deleted: true, photosDeleted };
    },
  };
}
