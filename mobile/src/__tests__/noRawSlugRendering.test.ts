import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const src = fileURLToPath(new URL("../", import.meta.url));
const rawNames = new Set(["program_type", "programType", "day_type"]);
// Exceptions must name the exact file/expression and explain its non-display use.
// Navigation object fields, query keys and colour lookups are not display sites,
// so the AST scanner below deliberately leaves them alone.
const allowList: Array<{ file: string; expression: string; reason: string }> = [];

function containsRawSlug(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    if (rawNames.has(node.name.text)) return true;
    return containsRawSlug(node.expression);
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) && rawNames.has(node.argumentExpression.text)) return true;
  if (ts.isIdentifier(node) && rawNames.has(node.text)) return true;
  return Boolean(ts.forEachChild(node, child => containsRawSlug(child) || undefined));
}

function findRawRendering(source: string, file = "fixture.tsx"): string[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = new Set<string>();
  function check(node: ts.Node) {
    const expression = node.getText(ast);
    if (!containsRawSlug(node) || allowList.some(entry => entry.file === file && entry.expression === expression)) return;
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    violations.add(`${file}:${line}: ${expression}`);
  }
  function visit(node: ts.Node) {
    if (ts.isTemplateExpression(node)) for (const span of node.templateSpans) check(span.expression);
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "Text") {
      for (const child of node.children) if (ts.isJsxExpression(child) && child.expression) check(child.expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return [...violations];
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

it("screens and components render display labels instead of raw slugs", () => {
  const files = ["screens", "components"].flatMap(dir => tsxFiles(join(src, dir)));
  expect(files.length).toBeGreaterThan(0);
  const violations = files.flatMap(file => findRawRendering(readFileSync(file, "utf8"), relative(src, file).replaceAll("\\", "/")));
  expect(violations).toEqual([]);
});

it("detects raw Text children, uppercase conversions and display interpolation", () => {
  for (const source of [
    "<Text>{program.program_type}</Text>",
    "<Text>{programType}</Text>",
    "<Text>{day.day_type}</Text>",
    "<Text>{program.program_type.toUpperCase()}</Text>",
    "const subtitle = `${programType} program`;",
    "<View accessibilityLabel={`${session.program_type} session`} />",
  ]) expect(findRawRendering(source)).not.toEqual([]);
});

it("allows display labels and intentional navigation, query and colour uses", () => {
  expect(findRawRendering(`
    const key = ["program", programType];
    const color = colors[session.program_type];
    navigate("SplitReview", { programType });
    <Text>{program.programTypeLabel}</Text>;
    <View accessibilityLabel={\`\${session.programTypeLabel} session\`} />;
  `)).toEqual([]);
});
