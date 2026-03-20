import { requireInternalToken, requireTrustedAdminOrigin } from "./auth.js";
import { resolveBubbleUser } from "./resolveUser.js";

export const internalApi = [requireInternalToken];
export const internalWithUser = [requireInternalToken, resolveBubbleUser];
export const adminOnly = [requireInternalToken, requireTrustedAdminOrigin];
