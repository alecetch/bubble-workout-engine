import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const FORBIDDEN_PATTERNS = [
  { name: "formai", pattern: /formai/gi },
  { name: "bubble workout", pattern: /bubble[\s-]?workout/gi },
];

const APP_JSON_ALLOWLIST = [
  { key: "scheme", value: "formai" },
  { key: "bundleIdentifier", value: "com.bubbleworkout.mobile" },
  { key: "package", value: "com.bubbleworkout.mobile" },
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

async function main() {
  const scriptUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (import.meta.url !== scriptUrl) return;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const result = checkBrandStrings(rootDir);

  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }

  console.log(result.message);
}

main();
