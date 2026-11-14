import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

test("mobile app-link hosts include the backend referral default host", async () => {
  const [referralSource, appJsonSource] = await Promise.all([
    readFile(join(repoRoot, "api", "src", "routes", "referral.js"), "utf8"),
    readFile(join(repoRoot, "mobile", "app.json"), "utf8"),
  ]);

  const defaultUrlMatch = referralSource.match(/process\.env\.APP_BASE_URL\s*\?\?\s*"([^"]+)"/);
  assert.ok(defaultUrlMatch, "expected referral.js to declare an APP_BASE_URL fallback");

  const referralHost = new URL(defaultUrlMatch[1]).host;
  const appConfig = JSON.parse(appJsonSource).expo;
  const iosHosts = appConfig.ios.associatedDomains.map((d) => String(d).replace(/^applinks:/, ""));
  const androidHosts = appConfig.android.intentFilters.flatMap((f) => f.data.map((d) => d.host));

  assert.ok(iosHosts.includes(referralHost), `iOS associatedDomains must include ${referralHost}`);
  assert.ok(androidHosts.includes(referralHost), `Android intent filters must include ${referralHost}`);
  assert.deepEqual([...androidHosts].sort(), [...iosHosts].sort(), "iOS and Android must claim the same hosts");
});
