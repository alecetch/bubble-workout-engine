import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export function inspectSource(text, filename = "source.tsx") {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const violations = [];
  const repeatNames = new Set(["withRepeat"]);
  function report(node, rule) {
    violations.push({ file: filename, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, rule });
  }
  function visit(node) {
    if (ts.isStringLiteral(node) && /^expo-av(?:\/|$)/.test(node.text) &&
        (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isCallExpression(node.parent))) report(node, "expo-av is prohibited in production mobile source (ADR-019)");
    if (ts.isImportSpecifier(node) && (node.propertyName?.text ?? node.name.text) === "withRepeat") repeatNames.add(node.name.text);
    if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && repeatNames.has(node.expression.text)) ||
        (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "withRepeat"))) {
      const count = node.arguments[1];
      if (!count || !ts.isNumericLiteral(count) || !Number.isFinite(Number(count.text)) || Number(count.text) <= 0) report(node, "withRepeat requires an explicit positive finite literal count (ADR-019)");
    }
    ts.forEachChild(node, visit);
  }
  // Gather imported aliases before checking calls, regardless of import position.
  source.forEachChild(node => { if (ts.isImportDeclaration(node)) ts.forEachChild(node, function aliases(child) {
    if (ts.isImportSpecifier(child) && (child.propertyName?.text ?? child.name.text) === "withRepeat") repeatNames.add(child.name.text);
    ts.forEachChild(child, aliases);
  }); });
  visit(source);
  return violations;
}

export function checkIosSafety(root) {
  const files = [];
  function collect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "__test-utils__") continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(filename);
      else if (/\.[jt]sx?$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) files.push(filename);
    }
  }
  collect(path.join(root, "src"));
  files.push(path.join(root, "App.tsx"));
  return files.flatMap(file => inspectSource(fs.readFileSync(file, "utf8"), path.relative(root, file)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = checkIosSafety(root);
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
  if (violations.length) process.exitCode = 1;
}
