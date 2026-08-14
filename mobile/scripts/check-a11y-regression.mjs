import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditAccessibilityLabels } from "./audit-accessibility-labels.mjs";

export function checkA11yRegression(rootDir, baselinePath) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const result = auditAccessibilityLabels(rootDir);

  if (result.missingLabelCount > baseline.missingLabelCount) {
    return {
      ok: false,
      result,
      message:
        `Accessibility label gap increased: ${baseline.missingLabelCount} -> ${result.missingLabelCount}. ` +
        "Add accessibilityLabel to new icon-only pressables, or update mobile/scripts/a11y-baseline.json if this is intentional.",
    };
  }

  if (result.missingLabelCount < baseline.missingLabelCount) {
    fs.writeFileSync(
      baselinePath,
      JSON.stringify({ missingLabelCount: result.missingLabelCount }, null, 2) + "\n",
    );
    return {
      ok: true,
      result,
      message:
        `Accessibility label gap decreased: ${baseline.missingLabelCount} -> ${result.missingLabelCount}. Baseline updated.`,
    };
  }

  return {
    ok: true,
    result,
    message: `Accessibility label gap unchanged (${result.missingLabelCount}).`,
  };
}

async function main() {
  const scriptUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (import.meta.url !== scriptUrl) return;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const baselinePath = path.join(scriptDir, "a11y-baseline.json");
  const check = checkA11yRegression(rootDir, baselinePath);

  if (!check.ok) {
    console.error(check.message);
    process.exitCode = 1;
    return;
  }

  console.log(check.message);
}

main();
