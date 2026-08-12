import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTemplateSequence } from "../01_buildProgramFromDefinition.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// docker-compose mounts ./api:/app and ./migrations:/app/migrations separately, so /app
// already *is* the api/ directory inside the container -- there's no single repo-root path
// that's reachable by the same relative ".." count on the host and in the container. Try
// both layouts and use whichever actually resolves.
const candidateSeedPaths = [
  // Host layout: <repoRoot>/api/engine/steps/__tests__ -> <repoRoot>/migrations/...
  path.resolve(__dirname, "../../../..", "migrations", "R__seed_program_generation_config.sql"),
  // Container layout: /app/engine/steps/__tests__ -> /app/migrations/...
  path.resolve(__dirname, "../../..", "migrations", "R__seed_program_generation_config.sql"),
];
const seedPath = candidateSeedPaths.find((candidate) => fs.existsSync(candidate));
if (!seedPath) {
  throw new Error(
    `Could not locate R__seed_program_generation_config.sql. Tried:\n${candidateSeedPaths.join("\n")}`,
  );
}

function readSeedProgramConfigs() {
  const sql = fs.readFileSync(seedPath, "utf8");
  return sql
    .split(/\r?\n/)
    .filter((line) => line.includes('"day_templates_by_dpw"') && line.includes("'::jsonb"))
    .map((line) => {
      const start = line.indexOf("'{");
      const end = line.lastIndexOf("'::jsonb");
      assert.notEqual(start, -1, "seed JSON line should start with a SQL JSON literal");
      assert.notEqual(end, -1, "seed JSON line should end with a SQL JSON literal cast");
      return JSON.parse(line.slice(start + 1, end));
    });
}

test("seeded day_templates_by_dpw entries resolve to exactly their requested day count", () => {
  const configs = readSeedProgramConfigs();
  assert.ok(configs.length > 0, "expected seeded program generation configs");

  for (const config of configs) {
    const byDpw = config?.builder?.day_templates_by_dpw;
    const dayTemplates = config?.builder?.day_templates;
    assert.ok(byDpw && typeof byDpw === "object", `${config.config_key} should define day_templates_by_dpw`);
    assert.ok(Array.isArray(dayTemplates), `${config.config_key} should define day_templates`);

    for (const dayCountKey of Object.keys(byDpw)) {
      const daysPerWeek = Number.parseInt(dayCountKey, 10);
      const resolved = resolveTemplateSequence(byDpw, dayTemplates, daysPerWeek, {
        configKey: config.config_key,
        programType: config.program_type,
      });
      assert.equal(
        resolved.length,
        daysPerWeek,
        `${config.config_key} ${daysPerWeek}-day sequence should resolve to ${daysPerWeek} templates`,
      );
    }
  }
});

test("hypertrophy 6-day and 7-day split sequences are not truncated", () => {
  const hypertrophy = readSeedProgramConfigs().find(
    (config) => config.config_key === "hypertrophy_default_v1",
  );
  assert.ok(hypertrophy, "expected hypertrophy_default_v1 in program generation seed");

  const byDpw = hypertrophy.builder.day_templates_by_dpw;
  assert.deepEqual(byDpw["6"], [
    "push_day",
    "pull_day",
    "legs_day",
    "push_day",
    "pull_day",
    "legs_day",
  ]);
  assert.deepEqual(byDpw["7"], [
    "push_day",
    "pull_day",
    "legs_day",
    "push_day",
    "pull_day",
    "legs_day",
    "day4",
  ]);

  assert.equal(resolveTemplateSequence(byDpw, hypertrophy.builder.day_templates, 6).length, 6);
  assert.equal(resolveTemplateSequence(byDpw, hypertrophy.builder.day_templates, 7).length, 7);
});
