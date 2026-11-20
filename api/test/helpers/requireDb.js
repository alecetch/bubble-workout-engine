export async function dbAvailableOrSkip(t, pool) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    const code = error?.code || "unknown";
    if (process.env.REQUIRE_DB === "true") {
      throw new Error(`REQUIRE_DB=true but Postgres is unavailable: ${code}`);
    }
    t.skip(`Postgres unavailable: ${code}`);
    return false;
  }
}
