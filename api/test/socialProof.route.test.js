import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { marketingRouter } from "../src/routes/marketingPages.js";

function createApp() {
  const app = express();
  app.use(marketingRouter);
  return app;
}

function request(app, path) {
  return new Promise((resolve, reject) => {
    const previousPreview = process.env.MARKETING_PREVIEW_ENABLED;
    process.env.MARKETING_PREVIEW_ENABLED = "true";
    const server = app.listen(0, () => {
      const { port } = server.address();
      fetch(`http://127.0.0.1:${port}${path}`)
        .then(async (res) => {
          const body = await res.text();
          resolve({ res, body });
        })
        .catch(reject)
        .finally(() => {
          if (previousPreview === undefined) {
            delete process.env.MARKETING_PREVIEW_ENABLED;
          } else {
            process.env.MARKETING_PREVIEW_ENABLED = previousPreview;
          }
          server.close();
        });
    });
  });
}

test("testimonials page returns html", async () => {
  const { res } = await request(createApp(), "/testimonials");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
});

test("testimonials page renders testimonial content", async () => {
  const { body } = await request(createApp(), "/testimonials");
  assert.match(body, /Sarah M\./);
  assert.match(body, /race-prep structure/);
});

test("testimonials page renders rating badge when rating is configured", async () => {
  const previous = process.env.APP_STORE_RATING;
  process.env.APP_STORE_RATING = "4.8";
  try {
    const { body } = await request(createApp(), "/testimonials");
    assert.match(body, /rating-badge/);
    assert.match(body, /4\.8/);
  } finally {
    if (previous === undefined) {
      delete process.env.APP_STORE_RATING;
    } else {
      process.env.APP_STORE_RATING = previous;
    }
  }
});

test("testimonials page omits rating badge when rating is not configured", async () => {
  const previous = process.env.APP_STORE_RATING;
  delete process.env.APP_STORE_RATING;
  try {
    const { res, body } = await request(createApp(), "/testimonials");
    assert.equal(res.status, 200);
    assert.doesNotMatch(body, /rating-badge/);
  } finally {
    if (previous !== undefined) process.env.APP_STORE_RATING = previous;
  }
});

test("home page includes testimonials strip", async () => {
  const { body } = await request(createApp(), "/");
  assert.match(body, /What athletes are saying/);
});

test("home page includes featured testimonial content", async () => {
  const { body } = await request(createApp(), "/");
  assert.match(body, /Sarah M\./);
  assert.match(body, /race-prep structure/);
});

test("testimonials page includes open graph metadata", async () => {
  const { body } = await request(createApp(), "/testimonials");
  assert.match(body, /og:title/);
});
