import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import sharp from "sharp";
import { createAdminExerciseMediaRouter } from "../src/routes/adminExerciseMedia.js";
import { createAdminWarmupExercisesRouter } from "../src/routes/adminWarmupExercises.js";
import { createAdminCooldownExercisesRouter } from "../src/routes/adminCooldownExercises.js";

for (const [route, prefix, factory] of [["exercise-media", "a", createAdminExerciseMediaRouter],
  ["warmup-exercises", "warmup-exercise-media/a", createAdminWarmupExercisesRouter], ["cooldown-exercises", "cooldown-exercise-media/a", createAdminCooldownExercisesRouter]]) {
  for (const action of ["still", "video", "use-poster-as-still", "failure"]) {
    test(`${route}: ${action} generates derived images without failing original uploads`, async () => {
      process.env.INTERNAL_API_TOKEN = "rendition-test";
      const jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: "red" } }).jpeg().toBuffer();
      const puts = [], queries = [], logs = [];
      const row = { still_image_key: `${prefix}/still.jpg`, still_image_is_placeholder: false, poster_frame_key: `${prefix}/poster.jpg`, video_status: "ready" };
      const db = { query: async sql => {
        queries.push(sql);
        if (/still_renditions_at = NULL/.test(sql)) { row.still_renditions_at = null; row.still_thumbhash = null; }
        if (/still_renditions_at = now\(\)/.test(sql)) { row.still_renditions_at = "now"; row.still_thumbhash = "hash"; }
        if (/poster_renditions_at = now\(\)/.test(sql)) row.poster_renditions_at = "now";
        return { rowCount: 1, rows: [{ ...row }] };
      } };
      const app = express();
      app.use((req, res, next) => { req.log = { warn: entry => logs.push(entry) }; next(); });
      app.use("/admin", factory({ db, auditLogFn: async () => {}, putObjectFn: async (...args) => { puts.push(args); }, getObjectFn: async () => jpeg,
        compressExerciseVideoFn: async () => ({ compressedBuffer: Buffer.from("video"), posterBuffer: jpeg, durationSec: 1 }),
        generateRenditionsFn: async (_buffer, kind) => {
          if (action === "failure") throw new Error("encoder failed");
          return { renditions: (kind === "still" ? ["thumb", "card"] : ["card"]).map(name => ({ name, buffer: Buffer.from("webp") })), thumbhash: "hash" };
        } }));
      const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
      try {
        const endpoint = action === "failure" ? "still" : action;
        const data = new FormData();
        if (endpoint !== "use-poster-as-still") data.append(endpoint, new Blob([endpoint === "still" ? jpeg : "video"], { type: endpoint === "still" ? "image/jpeg" : "video/mp4" }), `${endpoint}.jpg`);
        const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/${route}/a/${endpoint}`, { method: "POST", headers: { "X-Internal-Token": "rendition-test" }, ...(endpoint === "use-poster-as-still" ? {} : { body: data }) });
        assert.equal(response.status, 200, await response.text());
        if (action === "failure") {
          assert.equal(row.still_renditions_at, null);
          assert.equal(logs[0].event, "media.renditions.failed");
          assert.equal(puts.filter(call => call[2] === "image/webp").length, 0);
        } else {
          const expected = action === "video" ? [`${prefix}/poster-card.webp`] : [`${prefix}/still-thumb.webp`, `${prefix}/still-card.webp`];
          assert.deepEqual(puts.filter(call => call[2] === "image/webp").map(call => call[0]), expected);
          assert.ok(queries.some(sql => /renditions_at = now\(\)/.test(sql)));
          if (action !== "video") assert.equal(row.still_thumbhash, "hash");
        }
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    });
  }
}
