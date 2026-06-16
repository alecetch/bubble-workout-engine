import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createHyroxCarouselHandler } from "../../src/hyrox/hyroxCarouselController.js";
import { resolveCarouselData } from "../../src/hyrox/reports/carouselPageBuilder.js";

function carouselFixture() {
  return {
    brand: { product: "FORMA", site: "forma.fit" },
    slides: [
      { athlete_name: "Test Athlete", report_type: "HYROX PERFORMANCE ANALYSIS", percentile: "34th percentile" },
      { stations: [] },
      {},
      {},
      {},
      { features: ["Biggest Limiter"] },
    ],
  };
}

function buildApp(rows) {
  const db = {
    async query(sql, params) {
      assert.match(sql, /carousel_a_json/);
      assert.equal(params[0], "sub-123");
      return { rows };
    },
  };
  const app = express();
  app.get("/hyrox/carousel/:submissionId", createHyroxCarouselHandler(db));
  app.get("/api/hyrox/carousel/:submissionId", createHyroxCarouselHandler(db));
  return app;
}

async function request(app, path) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { response, body: await response.text() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("resolveCarouselData accepts nested report carousel shape", () => {
  const data = carouselFixture();
  assert.equal(resolveCarouselData({ carousel: data }), data);
});

test("resolveCarouselData accepts direct carousel shape", () => {
  const data = carouselFixture();
  assert.equal(resolveCarouselData(data), data);
});

test("GET /hyrox/carousel/:submissionId renders stored carousel", async () => {
  const { response, body } = await request(
    buildApp([{ carousel_a_json: { carousel: carouselFixture() } }]),
    "/hyrox/carousel/sub-123",
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(body, /YOUR HYROX PERFORMANCE SLIDES/);
  assert.match(body, /Test Athlete/);
});

test("GET /api/hyrox/carousel/:submissionId renders same carousel for API proxy path", async () => {
  const { response, body } = await request(
    buildApp([{ carousel_a_json: carouselFixture() }]),
    "/api/hyrox/carousel/sub-123",
  );

  assert.equal(response.status, 200);
  assert.match(body, /YOUR HYROX PERFORMANCE SLIDES/);
});

test("GET /hyrox/carousel/:submissionId returns 404 when no row exists", async () => {
  const { response, body } = await request(buildApp([]), "/hyrox/carousel/sub-123");

  assert.equal(response.status, 404);
  assert.match(body, /not found/i);
});
