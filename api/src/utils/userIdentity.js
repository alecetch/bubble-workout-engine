import { safeString } from "./validate.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(safeString(value));
}

export function readRequestedUserId(source) {
  return safeString(source?.user_id) || safeString(source?.bubble_user_id);
}

export async function findInternalUserIdByExternalId(client, externalUserId) {
  const result = await client.query(
    `
    SELECT id
    FROM app_user
    WHERE subject_id = $1
    LIMIT 1
    `,
    [externalUserId],
  );

  return result.rows[0]?.id ?? null;
}
