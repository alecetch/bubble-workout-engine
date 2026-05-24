import test from "node:test";
import assert from "node:assert/strict";
import { daysBetween } from "../src/services/bonusDayService.js";

test("daysBetween handles Postgres Date objects for program start dates", () => {
  assert.equal(daysBetween(new Date("2026-05-18T00:00:00.000Z"), "2026-05-23"), 5);
});
