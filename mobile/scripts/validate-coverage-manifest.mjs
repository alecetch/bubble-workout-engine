import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function findSourceFiles(rootDir) {
  const roots = ["src/screens", "src/components"];
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") {
          walk(absolutePath);
        }
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith(".tsx") &&
        !entry.name.includes(".test.")
      ) {
        files.push(toPosixPath(path.relative(rootDir, absolutePath)));
      }
    }
  }

  for (const root of roots) {
    walk(path.join(rootDir, root));
  }

  return files.sort();
}

function countByStatus(entries) {
  return {
    covered: entries.filter((entry) => entry.status === "covered").length,
    gap: entries.filter((entry) => entry.status === "gap").length,
    excluded: entries.filter((entry) => entry.status === "excluded").length,
  };
}

export async function validateManifest(
  manifestPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "coverage-manifest.json",
  ),
  rootDir = path.dirname(manifestPath),
) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const errors = [];

  for (const entry of entries) {
    if (
      entry.status === "covered" &&
      (!entry.test || !fs.existsSync(path.resolve(rootDir, entry.test)))
    ) {
      errors.push({
        check: "existence",
        file: entry.test,
        message: "test file declared in manifest does not exist",
      });
    }
  }

  const manifestSources = new Set(entries.map((entry) => entry.source));
  for (const sourceFile of findSourceFiles(rootDir)) {
    if (!manifestSources.has(sourceFile)) {
      errors.push({
        check: "completeness",
        file: sourceFile,
        message: "source file not in coverage manifest",
      });
    }
  }

  for (const entry of entries) {
    if (
      (entry.status === "gap" || entry.status === "excluded") &&
      (!entry.reason || !entry.reason.trim())
    ) {
      errors.push({
        check: "gap-hygiene",
        file: entry.source,
        message: "gap/excluded entry missing reason",
      });
    }
  }

  const counts = countByStatus(entries);
  return {
    ok: errors.length === 0,
    ...counts,
    errors,
  };
}

async function main() {
  const scriptUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (import.meta.url !== scriptUrl) {
    return;
  }

  const result = await validateManifest();
  for (const error of result.errors) {
    console.error(`${error.check}: ${error.file}: ${error.message}`);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

main();
