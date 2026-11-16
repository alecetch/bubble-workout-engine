import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createAppConfigRouter } from "../src/routes/appConfig.js";
import { readAppVersionPolicy } from "../src/config/appVersionPolicy.js";
test("public app-config has both platforms and a one-minute cache", async () => {
 const app = express(); app.use("/api", createAppConfigRouter(readAppVersionPolicy({})));
 const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
 try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/app-config`);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "public, max-age=60");
  const body = await response.json(); assert.equal(body.ok, true);
  for (const platform of ["ios", "android"]) assert.deepEqual(Object.keys(body[platform]).sort(), ["latest_build", "min_build", "update_url"]);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
