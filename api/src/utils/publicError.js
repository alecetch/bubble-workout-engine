const IS_PRODUCTION = process.env.NODE_ENV === "production";

export function publicInternalError(err) {
  if (!IS_PRODUCTION) {
    return err?.message || "Internal server error";
  }
  return "Internal server error";
}
