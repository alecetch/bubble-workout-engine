import assert from "node:assert/strict";
import express from "express";
import { fileURLToPath } from "node:url";
import { marketingRouter } from "../../src/routes/marketingPages.js";
import { websiteEnhancementsRouter } from "../../src/routes/websiteEnhancements.js";
import { affiliateProgramRouter } from "../../src/routes/affiliateProgram.js";
import { contentHubRouter } from "../../src/routes/contentHub.js";
import { createLandingPageHandler } from "../../src/routes/referralLanding.js";

export async function withWebsiteBrand(variant, fn, overrides = {}) {
  const values = { BRAND_VARIANT: variant, MARKETING_PREVIEW_ENABLED: "true", BASE_URL: undefined,
    SUPPORT_EMAIL: undefined, PRESS_EMAIL: undefined, APP_STORE_URL: "https://apps.apple.com/test", ...overrides };
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

export function websiteApp() {
  const app = express();
  for (const router of [marketingRouter, websiteEnhancementsRouter, affiliateProgramRouter, contentHubRouter]) app.use(router);
  app.get("/ref/:code", createLandingPageHandler({ query: async () => ({ rows: [{ email: "alex@example.test" }] }) }));
  app.use("/images", express.static(fileURLToPath(new URL("../../public/images", import.meta.url))));
  return app;
}

export async function requestWebsite(app, path, options) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return { response, body: await response.text() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

export function assert200DaysPage(body, path) {
  assert.match(body, /200 Days/, path);
  if (["/privacy", "/terms"].includes(path)) {
    const sentence = "200 Days was previously called Forma. The service, operator and your data are unchanged.";
    assert.equal(body.split(sentence).length - 1, 1, path);
    body = body.replace(sentence, "");
  }
  if (path === "/changelog") {
    assert.equal(body.split("<h2>Forma is now 200 Days</h2>").length - 1, 1);
    body = body.replace("<h2>Forma is now 200 Days</h2>", "");
  }
  if (path.startsWith("/ref/")) {
    assert.equal(body.split('href="forma://"').length - 1, 1);
    body = body.replace('href="forma://"', "");
  }
  assert.doesNotMatch(body, /\bforma\b|formai|getforma|\{\{brand\}\}/i, path);
}
