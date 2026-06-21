import assert from "node:assert/strict";
import test from "node:test";
import { parseHyroxResultsHtml } from "../parseHyroxResultsHtml.js";

const splitRows = `
<tr class="list-highlight f-time_01"><th class="desc">Run 1</th><td class="f-time_01">00:05:00</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_11"><th class="desc" data-split-index="01">1000m SkiErg</th><td class="f-time_11">00:04:42</td><td class=" last">385</td></tr>
<tr class="list-highlight f-time_02"><th class="desc">Run 2</th><td class="f-time_02">00:05:01</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_12"><th class="desc">50m Sled Push</th><td class="f-time_12">00:03:00</td><td class=" last">211</td></tr>
<tr class="list-highlight f-time_03"><th class="desc">Run 3</th><td class="f-time_03">00:05:02</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_13"><th class="desc">50m Sled Pull</th><td class="f-time_13">00:03:10</td><td class=" last">212</td></tr>
<tr class="list-highlight f-time_04"><th class="desc">Run 4</th><td class="f-time_04">00:05:03</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_14"><th class="desc">80m Burpee Broad Jump</th><td class="f-time_14">00:04:00</td><td class=" last">213</td></tr>
<tr class="list-highlight f-time_05"><th class="desc">Run 5</th><td class="f-time_05">00:09:00</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_15"><th class="desc">1000m Row</th><td class="f-time_15">00:04:30</td><td class=" last">214</td></tr>
<tr class="list-highlight f-time_06"><th class="desc">Run 6</th><td class="f-time_06">00:05:04</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_16"><th class="desc">200m Farmers Carry</th><td class="f-time_16">00:02:00</td><td class=" last">215</td></tr>
<tr class="list-highlight f-time_07"><th class="desc">Run 7</th><td class="f-time_07">00:05:05</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_17"><th class="desc">100m Sandbag Lunges</th><td class="f-time_17">00:04:10</td><td class=" last">216</td></tr>
<tr class="list-highlight f-time_08"><th class="desc">Run 8</th><td class="f-time_08">00:04:40</td><td class=" last"><span class="text-muted">&ndash;</span></td></tr>
<tr class="list-highlight f-time_18"><th class="desc">Wall Balls</th><td class="f-time_18">00:05:00</td><td class=" last">217</td></tr>
<tr class="list-highlight f-time_60"><th class="desc">Roxzone Time</th><td class="f-time_60">00:07:00</td><td class=" last">99</td></tr>
<tr class="list-highlight f-time_49"><th class="desc">Run Total</th><td class="f-time_49">00:39:55</td><td class=" last">77</td></tr>
<tr class="list-highlight f-time_50"><th class="desc">Best Run Lap</th><td class="f-time_50">00:04:40</td><td class=" last">44</td></tr>
<tr><td class="f-time_finish_netto">01:20:00</td></tr>
<tr><td class="f-gimmick_00">RUN 5 (300s)</td></tr>`;

const replayRows = `
<div id="detail-box-splits">
  <table>
    <tr><th class="desc">Rox In</th><td class="diff right last">00:05:00</td></tr>
    <tr><th class="desc">1000m SkiErg In</th><td class="diff right last">00:00:08</td></tr>
    <tr><th class="desc">1000m SkiErg Out</th><td class="diff right last">00:04:42</td></tr>
    <tr><th class="desc">Rox Out</th><td class="diff right last">00:00:29</td></tr>
    <tr><th class="desc">50m Sled Push In</th><td class="diff right last">00:00:04</td></tr><tr><th class="desc">Rox Out</th><td class="diff right last">00:00:36</td></tr>
    <tr><th class="desc">50m Sled Pull In</th><td class="diff right last">00:00:14</td></tr><tr><th class="desc">Rox Out</th><td class="diff right last">00:00:29</td></tr>
    <tr><th class="desc">80m Burpee Broad Jump In</th><td class="diff right last">00:00:34</td></tr><tr><th class="desc">Rox Out</th><td class="diff right last">00:00:22</td></tr>
    <tr><th class="desc">1000m Row In</th><td class="diff right last">00:00:39</td></tr><tr><th class="desc">Rox Out</th><td class="diff right last">00:00:18</td></tr>
    <tr><th class="desc">200m Farmers Carry In</th><td class="diff right last">00:00:47</td></tr><tr><th class="desc">Rox Out</th><td class="diff right last">00:00:19</td></tr>
    <tr><th class="desc">100m Sandbag Lunges In</th><td class="diff right last">00:01:01</td></tr><tr><th class="desc">Rox Out</th><td class="diff right last">00:01:18</td></tr>
    <tr><th class="desc">Wall Balls In</th><td class="diff right last">00:00:12</td></tr>
  </table>
</div>`;

function html({ replay = true, penalty = true } = {}) {
  return `<html><body><table>${splitRows.replace(penalty ? "" : "<tr><td class=\"f-gimmick_00\">RUN 5 (300s)</td></tr>", "")}</table>${replay ? replayRows : ""}</body></html>`;
}

test("field ranks extracted", () => {
  const result = parseHyroxResultsHtml(html());
  assert.equal(result.splits.find((split) => split.segmentKey === "ski_erg").fieldRank, 385);
  assert.equal(result.splits.find((split) => split.segmentKey === "run_1").fieldRank, null);
});

test("aggregate ranks extracted", () => {
  const result = parseHyroxResultsHtml(html());
  assert.equal(result.roxzoneFieldRank, 99);
  assert.equal(result.runTotalFieldRank, 77);
  assert.equal(result.bestRunLapFieldRank, 44);
});

test("race replay parsed", () => {
  const result = parseHyroxResultsHtml(html());
  assert.equal(result.raceReplay.length, 7);
  assert.deepEqual(result.raceReplay[0], { station: "ski_erg", entrySeconds: 8, exitSeconds: 29 });
  assert.equal(result.raceReplay.some((row) => row.station === "wall_balls"), false);
});

test("race replay html rows use the final time cell as the diff column", () => {
  const multiColumnReplay = `
    <div id="detail-box-splits">
      <table>
        <tr><th class="desc">1000m SkiErg In</th><td>08:55:21</td><td>00:05:14</td><td class="diff right last">00:00:05</td></tr>
        <tr><th class="desc">Rox Out</th><td>09:00:03</td><td>00:09:56</td><td class="diff right last">00:00:31</td></tr>
        <tr><th class="desc">50m Sled Push In</th><td>09:05:03</td><td>00:14:56</td><td class="diff right last">00:00:03</td></tr>
        <tr><th class="desc">Rox Out</th><td>09:08:46</td><td>00:18:40</td><td class="diff right last">00:00:24</td></tr>
      </table>
    </div>`;
  const result = parseHyroxResultsHtml(html({ replay: false }).replace("</body>", `${multiColumnReplay}</body>`));
  assert.deepEqual(result.raceReplay.slice(0, 2), [
    { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
    { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
  ]);
});

test("race replay parsed from loose text labels", () => {
  const looseReplay = `
    <div>
      <span>Ski-Erg In</span><span>00:00:08</span>
      <span>Rox Out</span><span>00:00:29</span>
      <span>Sled Push In</span><span>00:00:04</span>
      <span>Rox Out</span><span>00:00:36</span>
    </div>`;
  const result = parseHyroxResultsHtml(html({ replay: false }).replace("</body>", `${looseReplay}</body>`));
  assert.deepEqual(result.raceReplay.slice(0, 2), [
    { station: "ski_erg", entrySeconds: 8, exitSeconds: 29 },
    { station: "sled_push", entrySeconds: 4, exitSeconds: 36 },
  ]);
});

test("loose race replay text uses the final time value as the diff column", () => {
  const looseReplay = `
    <div>
      <p>Ski-Erg In 08:55:21 00:05:14 00:05</p>
      <p>Rox Out 09:00:03 00:09:56 00:31</p>
      <p>Sled Push In 09:05:03 00:14:56 00:03</p>
      <p>Rox Out 09:08:46 00:18:40 00:24</p>
    </div>`;
  const result = parseHyroxResultsHtml(html({ replay: false }).replace("</body>", `${looseReplay}</body>`));
  assert.deepEqual(result.raceReplay.slice(0, 2), [
    { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
    { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
  ]);
});

test("loose race replay cell text uses the last consecutive time cell", () => {
  const looseReplay = `
    <div>
      <span>Ski-Erg In</span><span>08:55:21</span><span>00:05:14</span><span>00:05</span>
      <span>Rox Out</span><span>09:00:03</span><span>00:09:56</span><span>00:31</span>
      <span>Sled Push In</span><span>09:05:03</span><span>00:14:56</span><span>00:03</span>
      <span>Rox Out</span><span>09:08:46</span><span>00:18:40</span><span>00:24</span>
    </div>`;
  const result = parseHyroxResultsHtml(html({ replay: false }).replace("</body>", `${looseReplay}</body>`));
  assert.deepEqual(result.raceReplay.slice(0, 2), [
    { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
    { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
  ]);
});

test("repeated Rox Out diff values are preserved in sequence", () => {
  const duplicateRoxOutReplay = `
    <div id="detail-box-splits">
      <table>
        <tr><th class="desc">50m Sled Push In</th><td>09:05:03</td><td>00:14:56</td><td>00:03</td></tr>
        <tr><th class="desc">Rox Out</th><td>09:08:46</td><td>00:18:40</td><td>00:24</td></tr>
        <tr><th class="desc">50m Sled Pull In</th><td>09:13:56</td><td>00:23:49</td><td>00:11</td></tr>
        <tr><th class="desc">Rox Out</th><td>09:18:03</td><td>00:27:56</td><td>00:24</td></tr>
        <tr><th class="desc">80m Burpee Broad Jump In</th><td>09:23:17</td><td>00:33:10</td><td>00:13</td></tr>
        <tr><th class="desc">Rox Out</th><td>09:27:43</td><td>00:37:36</td><td>00:06</td></tr>
      </table>
    </div>`;
  const result = parseHyroxResultsHtml(html({ replay: false }).replace("</body>", `${duplicateRoxOutReplay}</body>`));
  assert.deepEqual(result.raceReplay.slice(0, 3), [
    { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
    { station: "sled_pull", entrySeconds: 11, exitSeconds: 24 },
    { station: "burpee_broad_jump", entrySeconds: 13, exitSeconds: 6 },
  ]);
});

test("penalty parsed correctly", () => {
  const result = parseHyroxResultsHtml(html());
  assert.deepEqual(result.penalties[0], { segmentKey: "run_5", penaltySeconds: 300, rawText: "RUN 5 (300s)" });
});

test("missing race replay section returns empty replay", () => {
  const result = parseHyroxResultsHtml(html({ replay: false }));
  assert.deepEqual(result.raceReplay, []);
  assert.equal(result.splits.find((split) => split.segmentKey === "ski_erg").fieldRank, 385);
});

test("missing penalty row returns empty penalties", () => {
  const result = parseHyroxResultsHtml(html({ penalty: false }));
  assert.deepEqual(result.penalties, []);
});
