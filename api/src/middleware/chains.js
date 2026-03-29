import { requireInternalToken, requireTrustedAdminOrigin } from "./auth.js";
import { resolveUser } from "./resolveUser.js";

export const internalApi = [requireInternalToken];
export const internalWithUser = [requireInternalToken, resolveUser];
export const adminOnly = [requireInternalToken, requireTrustedAdminOrigin];
