import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createReferralCodeHandler } from '../src/routes/referral.js';
import { getBrand } from '../src/config/brand.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

test("mobile app-link hosts include the backend referral default host", async () => {
  const appJsonSource = await readFile(join(repoRoot, 'mobile', 'app.json'), 'utf8');
  const appConfig = JSON.parse(appJsonSource).expo;
  const iosHosts = appConfig.ios.associatedDomains.map((d) => String(d).replace(/^applinks:/, ""));
  const androidHosts = appConfig.android.intentFilters.flatMap((f) => f.data.map((d) => d.host));

  const previous = { BRAND_VARIANT: process.env.BRAND_VARIANT, APP_BASE_URL: process.env.APP_BASE_URL, BASE_URL: process.env.BASE_URL };
  try {
    delete process.env.APP_BASE_URL;
    delete process.env.BASE_URL;
    for (const variant of ['forma', '200days']) {
      process.env.BRAND_VARIANT = variant;
      let body;
      await createReferralCodeHandler({ query: async () => ({ rows: [{ referral_code: 'CODE' }] }) })({ auth: { user_id: 'u' } }, { json: value => { body = value; } });
      const referralHost = new URL(body.shareUrl).host;
      assert.equal(referralHost, new URL(getBrand().siteUrl).host);
      assert.ok(iosHosts.includes(referralHost), `iOS associatedDomains must include ${referralHost}`);
      assert.ok(androidHosts.includes(referralHost), `Android intent filters must include ${referralHost}`);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  assert.deepEqual([...androidHosts].sort(), [...iosHosts].sort(), "iOS and Android must claim the same hosts");
});
