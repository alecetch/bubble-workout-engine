import { describe, expect, test } from "vitest";
import { parseHyroxResults } from "../utils/hyroxResultsParser";

export const FULL_PAGE_TEXT = `Name	vanadia, gaston
Age Group	45-49
Race	2026 Buenos Aires
Division	HYROX
*Penalty	RUN 5 (300s)
Overall Time	01:35:38
Running 1	00:05:05	–
1000m SkiErg	00:04:42	385
Running 2	00:04:53	–
50m Sled Push	00:03:50	469
Running 3	00:05:20	–
50m Sled Pull	00:06:09	467
Running 4	00:05:18	–
80m Burpee Broad Jump	00:04:13	137
Running 5	00:09:00	–
1000m Row	00:05:21	433
Running 6	00:06:51	–
200m Farmers Carry	00:03:06	452
Running 7	00:05:15	–
100m Sandbag Lunges	00:06:48	443
Running 8	00:04:33	–
Wall Balls	00:08:04	438
Roxzone Time	00:07:18	411
Run Total	00:46:11	315
Best Run Lap	00:04:33	218`;

const SPLIT_ROWS = FULL_PAGE_TEXT.split("\n").slice(6);
const SPLITS_ONLY = SPLIT_ROWS.join("\n");

describe("parseHyroxResults", () => {
  test("parses full-page paste with penalty", () => {
    const result = parseHyroxResults(FULL_PAGE_TEXT);
    expect(result.confidence).toBe("high");
    expect(result.success).toBe(true);
    expect(result.splits).toHaveLength(16);
    expect(result.splits.find((s) => s.segmentKey === "run_5")?.timeSeconds).toBe(540);
    expect(result.splits.find((s) => s.segmentKey === "wall_balls")?.timeSeconds).toBe(484);
    expect(result.roxzoneSeconds).toBe(438);
    expect(result.finishTimeSeconds).toBe(5738);
    expect(result.penalties).toHaveLength(1);
    expect(result.penalties[0].segmentKey).toBe("run_5");
    expect(result.penalties[0].penaltySeconds).toBe(300);
    expect(result.athleteName).toBe("vanadia, gaston");
    expect(result.raceName).toBe("2026 Buenos Aires");
    expect(result.division).toBe("open");
  });

  test("parses splits-only paste", () => {
    const result = parseHyroxResults(SPLITS_ONLY);
    expect(result.confidence).toBe("high");
    expect(result.splits).toHaveLength(16);
    expect(result.penalties).toHaveLength(0);
    expect(result.athleteName).toBeNull();
    expect(result.finishTimeSeconds).toBeNull();
  });

  test("returns partial confidence for 10 split rows", () => {
    const result = parseHyroxResults(SPLIT_ROWS.slice(0, 10).join("\n"));
    expect(result.confidence).toBe("partial");
    expect(result.splits).toHaveLength(10);
    expect(result.warnings.some((warning) => /partial/i.test(warning))).toBe(true);
  });

  test("returns low confidence for gibberish without throwing", () => {
    const result = parseHyroxResults("hello world\nno times here");
    expect(result.confidence).toBe("low");
    expect(result.success).toBe(false);
  });

  test("parses station penalties", () => {
    const result = parseHyroxResults(`*Penalty\tSTATION 3 (60s)\n${SPLITS_ONLY}`);
    expect(result.penalties[0].segmentKey).toBe("sled_pull");
    expect(result.penalties[0].penaltySeconds).toBe(60);
  });

  test("ignores dash penalty", () => {
    expect(parseHyroxResults(`*Penalty\t–\n${SPLITS_ONLY}`).penalties).toHaveLength(0);
  });

  test("parses multi-line format where each cell is on its own line", () => {
    // This is what results.hyrox.com actually produces when copy-pasted from a browser
    const multiLine = [
      "Running 1", "00:05:05", "–",
      "1000m SkiErg", "00:04:42", "385",
      "Running 2", "00:04:53", "–",
      "50m Sled Push", "00:03:50", "469",
      "Running 3", "00:05:20", "–",
      "50m Sled Pull", "00:06:09", "467",
      "Running 4", "00:05:18", "–",
      "80m Burpee Broad Jump", "00:04:13", "137",
      "Running 5", "00:09:00", "–",
      "1000m Row", "00:05:21", "433",
      "Running 6", "00:06:51", "–",
      "200m Farmers Carry", "00:03:06", "452",
      "Running 7", "00:05:15", "–",
      "100m Sandbag Lunges", "00:06:48", "443",
      "Running 8", "00:04:33", "–",
      "Wall Balls", "00:08:04", "438",
      "Roxzone Time", "00:07:18", "411",
      "Run Total", "00:46:11", "315",
      "Best Run Lap", "00:04:33", "218",
    ].join("\n");
    const result = parseHyroxResults(multiLine);
    expect(result.confidence).toBe("high");
    expect(result.splits).toHaveLength(16);
    expect(result.splits.find((s) => s.segmentKey === "ski_erg")?.timeSeconds).toBe(282);
    expect(result.roxzoneSeconds).toBe(438);
  });

  test("maps label variants", () => {
    const result = parseHyroxResults("Ski-Erg\t00:04:42\t385\n100 Wall Balls\t00:08:04\t438");
    expect(result.splits.map((split) => split.segmentKey)).toEqual(["ski_erg", "wall_balls"]);
  });

  test("parses race replay rows from pasted page content", () => {
    const replayText = [
      FULL_PAGE_TEXT,
      "Rox In\t00:05:00",
      "1000m SkiErg In\t00:00:08",
      "1000m SkiErg Out\t00:04:42",
      "Rox Out\t00:00:29",
      "50m Sled Push In\t00:00:04",
      "Rox Out\t00:00:36",
      "100m Sandbag Lunges In\t00:01:01",
      "Rox Out\t00:01:18",
    ].join("\n");

    const result = parseHyroxResults(replayText);
    expect(result.raceReplay).toEqual([
      { station: "ski_erg", entrySeconds: 8, exitSeconds: 29 },
      { station: "sled_push", entrySeconds: 4, exitSeconds: 36 },
      { station: "sandbag_lunges", entrySeconds: 61, exitSeconds: 78 },
    ]);
  });

  test("uses Race Replay Diff column when pasted rows include time of day and elapsed time", () => {
    const replayText = [
      FULL_PAGE_TEXT,
      "Rox In\t08:55:15\t00:05:09\t05:09",
      "1000m SkiErg In\t08:55:21\t00:05:14\t00:05",
      "1000m SkiErg Out\t08:59:31\t00:09:25\t04:11",
      "Rox Out\t09:00:03\t00:09:56\t00:31",
      "Rox In\t09:05:00\t00:14:53\t04:57",
      "50m Sled Push In\t09:05:03\t00:14:56\t00:03",
      "50m Sled Push Out\t09:08:22\t00:18:16\t03:20",
      "Rox Out\t09:08:46\t00:18:40\t00:24",
    ].join("\n");

    const result = parseHyroxResults(replayText);

    expect(result.raceReplay).toEqual([
      { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
      { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
    ]);
  });

  test("uses final time cell for multi-line Race Replay paste rows", () => {
    const replayText = [
      FULL_PAGE_TEXT,
      "1000m SkiErg In",
      "08:55:21",
      "00:05:14",
      "00:05",
      "Rox Out",
      "09:00:03",
      "00:09:56",
      "00:31",
      "50m Sled Push In",
      "09:05:03",
      "00:14:56",
      "00:03",
      "Rox Out",
      "09:08:46",
      "00:18:40",
      "00:24",
    ].join("\n");

    const result = parseHyroxResults(replayText);

    expect(result.raceReplay).toEqual([
      { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
      { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
    ]);
  });

  test("preserves repeated Rox Out diff values and excludes incomplete Wall Balls replay row", () => {
    const replayText = [
      FULL_PAGE_TEXT,
      "50m Sled Push In\t09:05:03\t00:14:56\t00:03",
      "Rox Out\t09:08:46\t00:18:40\t00:24",
      "50m Sled Pull In\t09:13:56\t00:23:49\t00:11",
      "Rox Out\t09:18:03\t00:27:56\t00:24",
      "80m Burpee Broad Jump In\t09:23:17\t00:33:10\t00:13",
      "Rox Out\t09:27:43\t00:37:36\t00:06",
      "Wall Balls In\t10:04:11\t01:14:04\t04:38",
    ].join("\n");

    const result = parseHyroxResults(replayText);

    expect(result.raceReplay).toEqual([
      { station: "sled_push", entrySeconds: 3, exitSeconds: 24 },
      { station: "sled_pull", entrySeconds: 11, exitSeconds: 24 },
      { station: "burpee_broad_jump", entrySeconds: 13, exitSeconds: 6 },
    ]);
  });

  test("maps divisions and warnings", () => {
    const pro = parseHyroxResults(`Division\tPRO\n${SPLITS_ONLY}`);
    expect(pro.division).toBe("pro");
    expect(pro.warnings).toContain("division_pro_not_yet_benchmarked");

    const doubles = parseHyroxResults(`Division\tDOUBLES\n${SPLITS_ONLY}`);
    expect(doubles.division).toBe("doubles");
    expect(doubles.divisionSex).toBeUndefined();
    expect(doubles.warnings).not.toContain("division_doubles_not_supported");

    const relay = parseHyroxResults(`Division\tRelay\n${SPLITS_ONLY}`);
    expect(relay.division).toBe("relay");
    expect(relay.warnings).toContain("division_doubles_not_supported");
  });

  test("preserves mixed signal for mixed doubles division text", () => {
    const result = parseHyroxResults(`Division\tMixed Doubles\n${SPLITS_ONLY}`);

    expect(result.division).toBe("doubles");
    expect(result.divisionSex).toBe("mixed");
  });

  test("aggregates up to two unique athlete names for doubles pages", () => {
    const result = parseHyroxResults([
      "Name\tSmith, Alice",
      "Name\tJones, Bob",
      "Name\tSmith, Alice",
      "Division\tDoubles",
      SPLITS_ONLY,
    ].join("\n"));

    expect(result.athleteName).toBe("Smith, Alice & Jones, Bob");
  });
});
