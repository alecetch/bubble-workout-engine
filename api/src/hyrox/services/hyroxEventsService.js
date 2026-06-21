function dateToIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function lookupHyroxEventByKey(pool, resultsPageKey) {
  if (!pool || !resultsPageKey) return null;
  const { rows } = await pool.query(
    `SELECT start_date, end_date, event_name
       FROM hyrox_events
      WHERE results_page_key = $1
      LIMIT 1`,
    [resultsPageKey],
  );
  if (!rows[0]) return null;
  return {
    startDate: dateToIsoDate(rows[0].start_date),
    endDate: dateToIsoDate(rows[0].end_date),
    eventName: rows[0].event_name,
  };
}
