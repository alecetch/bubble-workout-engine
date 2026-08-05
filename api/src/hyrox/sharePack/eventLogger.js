export async function logCalculatorEvent(db, {
  sessionId = null,
  submissionId = null,
  eventName,
  status = null,
  cacheHit = null,
  durationMs = null,
  metadata = {},
} = {}) {
  await db.query(
    `INSERT INTO hyrox_calculator_events
       (environment, session_id, submission_id, event_name, status, cache_hit, duration_ms, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      process.env.NODE_ENV ?? "development",
      sessionId || "backend",
      submissionId || null,
      eventName,
      status,
      typeof cacheHit === "boolean" ? cacheHit : null,
      Number.isFinite(Number(durationMs)) ? Math.max(0, Math.round(Number(durationMs))) : null,
      JSON.stringify(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
    ],
  );
}

export async function safeLogCalculatorEvent(db, event, log = console) {
  try {
    await logCalculatorEvent(db, event);
  } catch (err) {
    log.error?.("[hyroxCalculatorEvents] failed to log event:", err?.message);
  }
}
