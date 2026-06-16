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

  test("maps divisions and warnings", () => {
    const pro = parseHyroxResults(`Division\tPRO\n${SPLITS_ONLY}`);
    expect(pro.division).toBe("pro");
    expect(pro.warnings).toContain("division_pro_not_yet_benchmarked");

    const doubles = parseHyroxResults(`Division\tDOUBLES\n${SPLITS_ONLY}`);
    expect(doubles.division).toBe("doubles");
    expect(doubles.warnings).toContain("division_doubles_not_supported");
  });
});
