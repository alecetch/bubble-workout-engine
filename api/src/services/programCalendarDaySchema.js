let hasUserIdColumnPromise = null;

export async function programCalendarDayHasUserIdColumn(db) {
  if (!hasUserIdColumnPromise) {
    hasUserIdColumnPromise = db
      .query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'program_calendar_day'
          AND column_name = 'user_id'
        LIMIT 1
        `,
      )
      .then((result) => result.rowCount > 0)
      .catch((error) => {
        hasUserIdColumnPromise = null;
        throw error;
      });
  }

  return hasUserIdColumnPromise;
}
