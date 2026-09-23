import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_CHECKS = ["auth_keychain", "notification_allow", "notification_deny", "universal_link_cold", "universal_link_warm", "workout_complete", "rapid_loading_unmount", "technique_media"];
export function validateSignoff(record, { buildId, sourceCommit, now = Date.now() }) {
  const errors = [];
  if (record?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? "") || record?.sourceCommit !== sourceCommit) errors.push("sourceCommit must match the exact candidate SHA");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(buildId ?? "") || record?.buildId !== buildId) errors.push("buildId must match the exact EAS build ID");
  for (const key of ["tester", "appVersion", "buildNumber", "deviceModel", "iosVersion"]) {
    if (typeof record?.[key] !== "string" || !record[key].trim() || /^(TODO|REPLACE|UNKNOWN)/i.test(record[key])) errors.push(`${key} is required`);
  }
  if (record?.physicalDevice !== true) errors.push("A physical iOS device is required");
  const testedAt = Date.parse(record?.testedAt);
  if (!Number.isFinite(testedAt) || testedAt > now || now - testedAt > 7 * 86400000) errors.push("testedAt must be within the last 7 days, not in the future");
  if (typeof record?.evidenceUrl !== "string" || !/^https:\/\/[^\s]+$/.test(record.evidenceUrl)) errors.push("A durable HTTPS evidence URL is required");
  for (const check of REQUIRED_CHECKS) if (record?.checks?.[check] !== "pass") errors.push(`${check} must pass`);
  if (typeof record?.notificationTapThroughEnabled !== "boolean") errors.push("Record the candidate's notification tap-through flag");
  const expectedTap = record?.notificationTapThroughEnabled === true ? "pass" : "disabled";
  if (record?.checks?.notification_tap_through !== expectedTap) errors.push(`notification_tap_through must be ${expectedTap}`);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [file, buildId, sourceCommit] = process.argv.slice(2);
    if (!file) throw new Error("Usage: node scripts/validate-ios-signoff.mjs <record.json> <build-id> <source-sha>");
    const errors = validateSignoff(JSON.parse(fs.readFileSync(file, "utf8")), { buildId, sourceCommit });
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("iOS manual sign-off matches this candidate. Native execution is attested by the named tester, not by CI.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
