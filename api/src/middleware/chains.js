import { requireInternalToken, requireTrustedAdminOrigin } from "./auth.js";
import { requireAuth } from "./requireAuth.js";
import { resolveUser } from "./resolveUser.js";

export const internalApi = [requireInternalToken];
export const internalWithUser = [requireInternalToken, resolveUser];
export const userAuth = [requireAuth];
export const adminOnly = [requireInternalToken, requireTrustedAdminOrigin];
