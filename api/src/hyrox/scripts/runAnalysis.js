#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../db.js";
import { loadBenchmarkData } from "../engine/benchmarkService.js";
import { analyseSubmission } from "../engine/hyroxAnalysisEngine.js";

function defaultFixturePath() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../test/fixtures/hyrox/balanced_athlete.json");
}

async function main() {
  const fixturePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultFixturePath();
  await loadBenchmarkData(pool);
  const input = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const analysis = analyseSubmission(input);
  console.log(JSON.stringify(analysis, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .catch((err) => {
      console.error(err?.stack || err?.message || err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
