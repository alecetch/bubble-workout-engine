import { randomBytes } from "node:crypto";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReferralCode() {
  let code = "";
  const bytes = randomBytes(16);
  for (const byte of bytes) {
    if (code.length === 8) break;
    const idx = byte % 32;
    code += CHARSET[idx];
  }
  return code;
}
