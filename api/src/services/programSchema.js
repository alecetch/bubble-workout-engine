let hasIsPrimaryColumnPromise = null;

export async function programHasIsPrimaryColumn(db) {
  if (!hasIsPrimaryColumnPromise) {
    hasIsPrimaryColumnPromise = db
      .query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'program'
          AND column_name = 'is_primary'
        LIMIT 1
        `,
      )
      .then((result) => result.rowCount > 0)
      .catch((error) => {
        hasIsPrimaryColumnPromise = null;
        throw error;
      });
  }

  return hasIsPrimaryColumnPromise;
}
