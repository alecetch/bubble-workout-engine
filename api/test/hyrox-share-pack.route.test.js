import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createSharePackHandlers } from "../src/hyrox/hyroxSharePackController.js";

const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";

function pack(overrides = {}) {
  return {
    id: "pack-1",
    submission_id: SUBMISSION_ID,
    share_token: "token-123",
    zip_key: `${SUBMISSION_ID}/pack.zip`,
    caption: "Caption text",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  };
}

function buildApp({ packRows = [pack()], mobileRows = [{ ...pack(), race_name: "HYROX London" }], createPack } = {}) {
  const db = {
    async query(sql, params) {
      if (sql.includes("SELECT share_token FROM hyrox_share_packs")) {
        return { rows: packRows.map((row) => ({ share_token: row.share_token })) };
      }
      if (sql.includes("JOIN hyrox_submissions")) {
        return { rows: mobileRows };
      }
      return { rows: [] };
    },
  };
  const handlers = createSharePackHandlers(db, {
    getOrCreateSharePack: createPack ?? (async (submissionId) => {
      if (submissionId === "00000000-0000-4000-8000-000000000000") {
        throw Object.assign(new Error("Submission not found"), { status: 404 });
      }
      return pack();
    }),
    getPackDownloadUrl: async () => "https://signed.example/pack.zip",
    getPresignedUrl: async (key) => `https://signed.example/${key}`,
    sendEmail: async () => undefined,
    qrToString: async () => "<svg></svg>",
  });
  const app = express();
  app.use(express.json());
  app.post("/api/hyrox/share-pack/:submissionId", handlers.generatePack);
  app.post("/api/hyrox/share-pack/:submissionId/email", handlers.sendPackEmail);
  app.get("/api/hyrox/share-pack/:submissionId/qr", handlers.getQrCode);
  app.get("/hyrox/share/:shareToken", handlers.mobileLandingPage);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST /api/hyrox/share-pack/:submissionId returns pack details", async () => {
  const { response, body } = await request(buildApp(), `/api/hyrox/share-pack/${SUBMISSION_ID}`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(body.packId, "pack-1");
  assert.equal(body.downloadUrl, "https://signed.example/pack.zip");
  assert.equal(body.caption, "Caption text");
  assert.equal(body.shareToken, "token-123");
  assert.equal(body.slideCount, 6);
});

test("share pack generation is idempotent through cached pack service", async () => {
  let calls = 0;
  const createPack = async () => {
    calls += 1;
    return pack();
  };
  const app = buildApp({ createPack });
  const first = await request(app, `/api/hyrox/share-pack/${SUBMISSION_ID}`, { method: "POST" });
  const second = await request(app, `/api/hyrox/share-pack/${SUBMISSION_ID}`, { method: "POST" });
  assert.equal(first.body.packId, second.body.packId);
  assert.equal(calls, 2);
});

test("POST /api/hyrox/share-pack/:submissionId returns 404 for unknown submission", async () => {
  const { response } = await request(buildApp(), "/api/hyrox/share-pack/00000000-0000-4000-8000-000000000000", { method: "POST" });
  assert.equal(response.status, 404);
});

test("POST /api/hyrox/share-pack/:submissionId/email sends email", async () => {
  const { response, body } = await request(buildApp(), `/api/hyrox/share-pack/${SUBMISSION_ID}/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(body, { sent: true });
});

test("GET /api/hyrox/share-pack/:submissionId/qr returns svg", async () => {
  const { response, body } = await request(buildApp(), `/api/hyrox/share-pack/${SUBMISSION_ID}/qr`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(body, /svg/);
});

test("GET /hyrox/share/:shareToken renders mobile landing", async () => {
  const { response, body } = await request(buildApp(), "/hyrox/share/token-123");
  assert.equal(response.status, 200);
  assert.match(body, /Download ZIP/);
});

test("GET /hyrox/share/:shareToken handles missing and expired packs", async () => {
  const missing = await request(buildApp({ mobileRows: [] }), "/hyrox/share/missing");
  assert.equal(missing.response.status, 404);

  const expired = await request(buildApp({
    mobileRows: [{ ...pack({ expires_at: new Date(Date.now() - 86400000).toISOString() }), race_name: "HYROX London" }],
  }), "/hyrox/share/expired");
  assert.equal(expired.response.status, 410);
});
