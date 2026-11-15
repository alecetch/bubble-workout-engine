import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../admin/users.html", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/routes/adminUsers.js", import.meta.url), "utf8");

test("admin users page offers Trial, Active and Expire subscription buttons", () => {
  for (const status of ["trialing", "active", "expired"]) {
    assert.match(html, new RegExp(`class="sub-btn [a-z-]+ set-sub-btn"[^>]*data-status="${status}"`));
  }
  assert.match(html, />Expire<\/button>/);
});

test("every status the page can set is accepted by the subscription route", () => {
  const allowed = JSON.parse(route.match(/const ALLOWED = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const pageStatuses = [...html.matchAll(/data-status="([a-z_]+)"/g)].map(m => m[1]);
  assert.ok(pageStatuses.length >= 3);
  for (const status of pageStatuses) assert.ok(allowed.includes(status), `${status} not allowed by route`);
});
