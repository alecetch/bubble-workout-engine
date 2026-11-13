import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const FORBIDDEN_PATTERNS = [
  { name: "formai", pattern: /formai/gi },
  { name: "bubble workout", pattern: /bubble[\s-]?workout/gi },
];

const APP_JSON_ALLOWLIST = [
  // Must match the slug the EAS project is already registered under
  // (see extra.eas.projectId) - renaming it would disconnect existing
  // iOS credentials/provisioning rather than just relabeling the app.
  { key: "slug", value: "bubble-workout-mobile" },
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isSourceFile(filePath) {
  return filePath.endsWith(".ts") || filePath.endsWith(".tsx");
}

function isExcludedSource(relativePath) {
  const normalized = toPosix(relativePath);
  return /(^|\/)__tests__\//.test(normalized) || /\.test\.(ts|tsx)$/.test(normalized);
}

function collectSourceFiles(rootDir, dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (entry.isDirectory()) {
      if (!isExcludedSource(relativePath)) {
        collectSourceFiles(rootDir, absolutePath, files);
      }
      continue;
    }
    if (entry.isFile() && isSourceFile(entry.name) && !isExcludedSource(relativePath)) {
      files.push(absolutePath);
    }
  }
  return files;
}

function isAllowedAppJsonLine(line, match) {
  return APP_JSON_ALLOWLIST.some(({ key, value }) => {
    const propertyPattern = new RegExp(`"${key}"\\s*:\\s*"${value.replace(/\./g, "\\.")}"`);
    return propertyPattern.test(line) && line.toLowerCase().includes(match.toLowerCase());
  });
}

function findViolationsInFile(rootDir, filePath) {
  const relativePath = toPosix(path.relative(rootDir, filePath));
  const source = fs.readFileSync(filePath, "utf8");
  const violations = [];

  source.split(/\r?\n/).forEach((line, index) => {
    for (const { pattern } of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        const matched = match[0];
        if (relativePath === "app.json" && isAllowedAppJsonLine(line, matched)) continue;
        violations.push({
          file: relativePath,
          line: index + 1,
          match: matched,
        });
      }
    }
  });

  return violations;
}

export function checkBrandStrings(rootDir) {
  const files = [
    ...collectSourceFiles(rootDir, path.join(rootDir, "src")),
    path.join(rootDir, "app.json"),
  ].filter((filePath) => fs.existsSync(filePath));

  const violations = files.flatMap((filePath) => findViolationsInFile(rootDir, filePath));
  if (violations.length > 0) {
    const details = violations
      .map((violation) => `${violation.file}:${violation.line} matched "${violation.match}"`)
      .join("\n");
    return {
      ok: false,
      violations,
      message:
        `Found stale brand strings:\n${details}\n` +
        "If a match is an intentional native identifier, extend the allowlist in mobile/scripts/check-brand-strings.mjs.",
    };
  }

  return {
    ok: true,
    violations,
    message: "No stale mobile brand strings found.",
  };
}

export function checkWebsiteBrandStrings(repoRoot) {
  const files = [];
  function collect(dir, extensions) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !/^(?:__tests__|tests?|fixtures)$/.test(entry.name)) collect(full, extensions);
      else if (entry.isFile() && extensions.includes(path.extname(entry.name)) && !/\.(?:test|spec)\./.test(entry.name)) files.push(full);
    }
  }
  for (const dir of ["routes", "views", "config"]) collect(path.join(repoRoot, "api/src", dir), [".js", ".html"]);
  collect(path.join(repoRoot, "api/content"), [".md", ".json"]);
  return files.sort().flatMap(file => {
    const relative = toPosix(path.relative(repoRoot, file));
    if (relative === "api/src/config/brand.js") return [];
    let count = 0;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (/forma:\/\/|\/images\/formai?_/.test(line)) continue;
      count += [...line.matchAll(/\bforma\b|getforma\.|\bformai\b|getformai|forma:\/\//gi)].length;
    }
    return count ? [{ file: relative, count }] : [];
  });
}

// Counts left by the forma variant. Lower these, never raise them; the clean-up PR removes them.
export const WEBSITE_BRAND_BASELINE = Object.freeze({
  "api/src/config/validateProductionEnv.js": 3,
  "api/src/routes/adminContentStudio.js": 1,
  "api/src/routes/adminHyroxTestHarness.js": 1,
  "api/src/routes/marketingPages.js": 3,
  "api/src/routes/referral.js": 1,
  "api/src/routes/websiteEnhancements.js": 1,
});

export function evaluateWebsiteBrandStrings(results, baseline) {
  const counts = new Map(results.map(({ file, count }) => [file, count]));
  const failures = results.flatMap(({ file, count }) => {
    const allowed = Object.hasOwn(baseline, file) ? baseline[file] : 0;
    return count > allowed ? [{ file, count, allowed }] : [];
  });
  const notes = Object.entries(baseline).flatMap(([file, allowed]) => {
    const count = counts.get(file) ?? 0;
    return count < allowed ? [{ file, count, allowed }] : [];
  });
  return { ok: failures.length === 0, failures, notes };
}

async function main() {
  const scriptUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (import.meta.url !== scriptUrl) return;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootFlag = process.argv.indexOf("--root");
  const rootDir = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : path.resolve(scriptDir, "..");
  const result = checkBrandStrings(rootDir);
  const website = evaluateWebsiteBrandStrings(checkWebsiteBrandStrings(path.resolve(rootDir, "..")), WEBSITE_BRAND_BASELINE);
  for (const item of website.failures) {
    console.error(`Website brand guard: ${item.file}: ${item.count} (allowed ${item.allowed})`);
  }
  for (const item of website.notes) {
    console.log(`Website brand guard: ${item.file}: ${item.count} (allowed ${item.allowed}); lower the baseline to ${item.count}.`);
  }
  if (!website.ok) process.exitCode = 1;
  else console.log("Website brand guard passed.");

  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }

  console.log(result.message);
}

main();
