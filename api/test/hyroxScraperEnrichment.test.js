import test from "node:test";
import assert from "node:assert/strict";
import { parseInstagramHandle, parseRaceReplay } from "../src/contentStudio/hyroxScraper.js";
import { ROXZONE_STATION_KEYS, STATION_KEYS } from "../src/contentStudio/raceEventAnalyser.js";

test("parseInstagramHandle extracts handle from https instagram link", () => {
  const html = `<a href="https://www.instagram.com/athlete_handle123/">Instagram</a>`;
  assert.equal(parseInstagramHandle(html), "@athlete_handle123");
});

test("parseInstagramHandle handles http and no www", () => {
  const html = `<a href="http://instagram.com/my.athlete_99">IG</a>`;
  assert.equal(parseInstagramHandle(html), "@my.athlete_99");
});

test("parseInstagramHandle returns null when no instagram link", () => {
  assert.equal(parseInstagramHandle("<div>No social links here</div>"), null);
});

test("parseInstagramHandle ignores /p/ path (post link not profile)", () => {
  const html = `<a href="https://www.instagram.com/p/ABC123/">post</a>`;
  assert.equal(parseInstagramHandle(html), null);
});

test("parseInstagramHandle ignores /reel/ path", () => {
  const html = `<a href="https://www.instagram.com/reel/XYZ/">reel</a>`;
  assert.equal(parseInstagramHandle(html), null);
});

test("parseInstagramHandle ignores /explore/ path", () => {
  const html = `<a href="https://www.instagram.com/explore/tags/hyrox/">explore</a>`;
  assert.equal(parseInstagramHandle(html), null);
});

test("parseRaceReplay does not produce wall_balls_rox_in", () => {
  const html = `
    <div id="detail-box-splits">
      <table>
        <tr class="f-time_106"><td>Wall Balls Rox In</td><td>0:08</td></tr>
        <tr class="f-time_107"><td>Wall Balls Rox Out</td><td>0:05</td></tr>
        <tr class="f-time_85"><td>SkiErg Rox In</td><td>0:05</td></tr>
        <tr class="f-time_86"><td>SkiErg Rox Out</td><td>0:23</td></tr>
      </table>
    </div>
  `;
  const result = parseRaceReplay(html);
  assert.ok(!("wall_balls_rox_in" in result), "wall_balls_rox_in should not be present");
  assert.ok(!("wall_balls_rox_out" in result), "wall_balls_rox_out should not be present");
});

test("parseRaceReplay still produces skierg_rox_in and skierg_rox_out", () => {
  const html = `
    <div id="detail-box-splits">
      <table>
        <tr class="f-time_85"><td>SkiErg Station In</td><td>0:05</td></tr>
        <tr class="f-time_86"><td>SkiErg Rox Out</td><td>0:23</td></tr>
      </table>
    </div>
  `;
  const result = parseRaceReplay(html);
  assert.equal(result.skierg_rox_in, 5);
  assert.equal(result.skierg_rox_out, 23);
});

test("parseRaceReplay returns empty object when no splits section", () => {
  assert.deepEqual(parseRaceReplay("<div>no splits here</div>"), {});
});

test("ROXZONE_STATION_KEYS has exactly 7 entries", () => {
  assert.equal(ROXZONE_STATION_KEYS.length, STATION_KEYS.length - 1);
});

test("ROXZONE_STATION_KEYS does not contain wall_balls", () => {
  assert.ok(!ROXZONE_STATION_KEYS.includes("wall_balls"));
});

test("ROXZONE_STATION_KEYS contains sandbag_lunge (station before wall_balls)", () => {
  assert.ok(ROXZONE_STATION_KEYS.includes("sandbag_lunge"));
});
