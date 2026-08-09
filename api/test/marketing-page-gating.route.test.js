import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { affiliateProgramRouter } from "../src/routes/affiliateProgram.js";
import { contentHubRouter } from "../src/routes/contentHub.js";
import { marketingRouter } from "../src/routes/marketingPages.js";
import { websiteEnhancementsRouter } from "../src/routes/websiteEnhancements.js";

const gatedPaths = [
  "/hyrox",
  "/strength",
  "/testimonials",
  "/press",
  "/support",
  "/pricing",
  "/signup",
  "/signup/confirmed",
  "/blog",
  "/blog/hyrox-training-block",
  "/changelog",
  "/guides",
  "/guides/hyrox-race-prep-plan",
  "/partners",
  "/partners/applied",
];

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function createApp() {
  const app = express();
  app.use(marketingRouter);
  app.use(websiteEnhancementsRouter);
  app.use(contentHubRouter);
  app.use(affiliateProgramRouter);
  return app;
}

async function withPreview(value, fn) {
  const previous = process.env.MARKETING_PREVIEW_ENABLED;
  if (value == null) delete process.env.MARKETING_PREVIEW_ENABLED;
  else process.env.MARKETING_PREVIEW_ENABLED = value;
  try {
    return await fn();
  } finally {
    if (previous == null) delete process.env.MARKETING_PREVIEW_ENABLED;
    else process.env.MARKETING_PREVIEW_ENABLED = previous;
  }
}

test("preview-only marketing pages return styled 404 when launch gate is off", async () => {
  await withPreview(null, async () => {
    await withServer(createApp(), async (baseUrl) => {
      for (const path of gatedPaths) {
        const response = await fetch(`${baseUrl}${path}`);
        const body = await response.text();
        assert.equal(response.status, 404, path);
        assert.match(response.headers.get("content-type") ?? "", /text\/html/, path);
        assert.match(body, /Page not found/, path);
      }
    });
  });
});

test("preview-only marketing pages render when launch gate is on", async () => {
  await withPreview("true", async () => {
    await withServer(createApp(), async (baseUrl) => {
      for (const path of gatedPaths) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 200, path);
        assert.match(response.headers.get("content-type") ?? "", /text\/html/, path);
      }
    });
  });
});

test("published marketing pages remain available when launch gate is off", async () => {
  await withPreview(null, async () => {
    await withServer(createApp(), async (baseUrl) => {
      for (const path of ["/", "/download", "/privacy", "/terms"]) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 200, path);
      }
    });
  });
});
