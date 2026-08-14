import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Heuristic accessibility audit: this is a regex/text scan, not a real JSX/AST
// parse. It can be fooled by unusual formatting, comments, or complex JSX, and
// is meant to flag likely icon-only pressable gaps for human review.
const INTERACTIVE_COMPONENTS = [
  "Pressable",
  "TouchableOpacity",
  "TouchableWithoutFeedback",
  "PressableScale",
];

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

function countLinesBefore(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

function maskComments(source) {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] === "/" && source[i + 1] === "/") {
      result += "  ";
      i += 2;
      while (i < source.length && source[i] !== "\n") {
        result += " ";
        i += 1;
      }
      continue;
    }

    if (source[i] === "/" && source[i + 1] === "*") {
      result += "  ";
      i += 2;
      while (i < source.length) {
        if (source[i] === "*" && source[i + 1] === "/") {
          result += "  ";
          i += 2;
          break;
        }
        result += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }

    result += source[i];
    i += 1;
  }

  return result;
}

function findOpeningTagEnd(source, startIndex) {
  let quote = null;
  let braceDepth = 0;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];
    const prev = source[i - 1];

    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      return i;
    }
  }

  return -1;
}

function findClosingTagStart(source, tagName, afterOpeningEnd) {
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b`, "g");
  tokenPattern.lastIndex = afterOpeningEnd + 1;
  let depth = 1;

  for (let match = tokenPattern.exec(source); match; match = tokenPattern.exec(source)) {
    const tokenStart = match.index;
    const isClosing = source[tokenStart + 1] === "/";

    if (isClosing) {
      depth -= 1;
      if (depth === 0) return tokenStart;
      continue;
    }

    const openingEnd = findOpeningTagEnd(source, tokenStart);
    if (openingEnd === -1) return -1;
    const openingTag = source.slice(tokenStart, openingEnd + 1);
    if (!/\/\s*>$/.test(openingTag)) {
      depth += 1;
    }
    tokenPattern.lastIndex = openingEnd + 1;
  }

  return -1;
}

function findInteractiveOpenings(source) {
  const tagNames = INTERACTIVE_COMPONENTS.join("|");
  const tagPattern = new RegExp(`<(${tagNames})\\b`, "g");
  const openings = [];

  for (let match = tagPattern.exec(source); match; match = tagPattern.exec(source)) {
    const start = match.index;
    if (source[start + 1] === "/") continue;

    const tagName = match[1];
    const openingEnd = findOpeningTagEnd(source, start);
    if (openingEnd === -1) continue;

    const openingTag = source.slice(start, openingEnd + 1);
    const isSelfClosing = /\/\s*>$/.test(openingTag);
    const closingStart = isSelfClosing
      ? openingEnd + 1
      : findClosingTagStart(source, tagName, openingEnd);
    const children = closingStart > openingEnd
      ? source.slice(openingEnd + 1, closingStart)
      : "";

    openings.push({
      tagName,
      start,
      openingTag,
      children,
    });

    tagPattern.lastIndex = openingEnd + 1;
  }

  return openings;
}

export function auditFile(source, relativePath) {
  const sourceWithoutComments = maskComments(source);
  return findInteractiveOpenings(sourceWithoutComments)
    .filter(({ openingTag, children }) =>
      !/\baccessibilityLabel\s*=/.test(openingTag) &&
      !/<Text\b/.test(children)
    )
    .map(({ start }) => ({
      file: relativePath,
      line: countLinesBefore(source, start),
    }));
}

export function auditAccessibilityLabels(rootDir) {
  const files = findSourceFiles(rootDir);
  let totalPressables = 0;
  const gaps = [];

  for (const file of files) {
    const source = fs.readFileSync(path.join(rootDir, file), "utf8");
    totalPressables += findInteractiveOpenings(source).length;
    gaps.push(...auditFile(source, file));
  }

  return { totalPressables, missingLabelCount: gaps.length, gaps };
}

async function main() {
  const scriptUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (import.meta.url !== scriptUrl) return;
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditAccessibilityLabels(rootDir);
  for (const gap of result.gaps) {
    console.log(`${gap.file}:${gap.line}: missing accessibilityLabel (icon-only, no Text child)`);
  }
  console.log(JSON.stringify(result, null, 2));
}

main();
