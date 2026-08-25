import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

test("mobile app-link hosts match the backend referral default host", async () => {
  const [referralSource, appJsonSource] = await Promise.all([
    readFile(join(repoRoot, "api", "src", "routes", "referral.js"), "utf8"),
    readFile(join(repoRoot, "mobile", "app.json"), "utf8"),
  ]);

  const defaultUrlMatch = referralSource.match(/process\.env\.APP_BASE_URL\s*\?\?\s*"([^"]+)"/);
  assert.ok(defaultUrlMatch, "expected referral.js to declare an APP_BASE_URL fallback");

  const referralHost = new URL(defaultUrlMatch[1]).host;
  const appConfig = JSON.parse(appJsonSource).expo;
  const iosHost = String(appConfig.ios.associatedDomains[0]).replace(/^applinks:/, "");
  const androidHost = appConfig.android.intentFilters[0].data[0].host;

  assert.equal(iosHost, referralHost);
  assert.equal(androidHost, referralHost);
});
