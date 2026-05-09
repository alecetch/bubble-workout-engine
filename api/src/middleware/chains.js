import { requireInternalToken, requireTrustedAdminOrigin } from "./auth.js";
import { requireCoachClientAccess, requireCoachRole } from "./coachMiddleware.js";
import { requireAuth } from "./requireAuth.js";
import { requireEntitlement } from "./requireEntitlement.js";
import { requirePremium } from "./requirePremium.js";
import { resolveUser } from "./resolveUser.js";

export const internalApi = [requireInternalToken];
export const internalWithUser = [requireInternalToken, resolveUser];
export const userAuth = [requireAuth];
export const entitledUserAuth = [requireAuth, requireEntitlement];
export const premiumUserAuth = [requireAuth, requirePremium];
export const adminOnly = [requireInternalToken, requireTrustedAdminOrigin];
export const coachAuth = [requireAuth, requireCoachRole];
export const coachClientAuth = [requireAuth, requireCoachRole, requireCoachClientAccess];
