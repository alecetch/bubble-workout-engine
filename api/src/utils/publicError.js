export function publicInternalError(err, isProduction = process.env.NODE_ENV === "production") {
  if (!isProduction) {
    return err?.message || "Internal server error";
  }
  return "Internal server error";
}
