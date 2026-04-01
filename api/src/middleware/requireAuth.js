import jwt from "jsonwebtoken";

export function makeRequireAuth(
  secret = process.env.JWT_SECRET,
  issuer = process.env.JWT_ISSUER,
) {
  return function requireAuth(req, res, next) {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authorization token",
      });
    }

    try {
      const decoded = jwt.verify(token, secret, { issuer, algorithms: ["HS256"] });
      req.auth = { ...(req.auth ?? {}), user_id: decoded.sub };
      return next();
    } catch (err) {
      const isExpired = err.name === "TokenExpiredError";
      return res.status(401).json({
        ok: false,
        code: isExpired ? "token_expired" : "invalid_token",
        error: isExpired ? "Token expired" : "Invalid token",
      });
    }
  };
}

export const requireAuth = makeRequireAuth();
