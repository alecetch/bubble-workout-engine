import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, "")));
const posix = value => value.split(path.sep).join("/");

// Small lexer: comments, string contents, regexes and template text are not code.
// Preserve offsets so findings point at the importing line, including multiline imports.
function tokens(source) {
  const result = [];
  let i = 0;
  while (i < source.length) {
    const start = i, c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith("//", i)) { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (source.startsWith("/*", i)) { const end = source.indexOf("*/", i + 2); i = end < 0 ? source.length : end + 2; continue; }
    if (c === "`") {
      i++;
      while (i < source.length) { if (source[i] === "\\") i += 2; else if (source[i++] === "`") break; }
      continue;
    }
    if (c === "'" || c === '"') {
      i++; let value = "";
      while (i < source.length && source[i] !== c) {
        if (source[i] !== "\\") { value += source[i++]; continue; }
        i++; const escaped = source[i++];
        const size = escaped === "u" ? 4 : escaped === "x" ? 2 : 0;
        if (size && new RegExp(`^[0-9a-f]{${size}}$`, "i").test(source.slice(i, i + size))) { value += String.fromCharCode(parseInt(source.slice(i, i + size), 16)); i += size; }
        else value += ({ n: "\n", r: "\r", t: "\t" })[escaped] ?? escaped;
      }
      i++; result.push({ kind: "string", value, start }); continue;
    }
    const previous = result.at(-1)?.value;
    if (c === "/" && (!previous || /^(?:[=(,:\[!?{;]|return|case|throw)$/.test(previous))) {
      i++; let inClass = false;
      while (i < source.length) {
        if (source[i] === "\\") { i += 2; continue; }
        if (source[i] === "[") inClass = true;
        if (source[i] === "]") inClass = false;
        if (source[i++] === "/" && !inClass) break;
      }
      while (/[a-z]/i.test(source[i] ?? "") && i < source.length) i++;
      result.push({ kind: "regex", value: "/regex/", start }); continue;
    }
    if (/[a-z_$]/i.test(c)) {
      i++; while (i < source.length && /[\w$]/.test(source[i])) i++;
      result.push({ kind: "word", value: source.slice(start, i), start }); continue;
    }
    result.push({ kind: "punct", value: c, start }); i++;
  }
  return result;
}

function imports(source) {
  const list = tokens(source), found = [];
  for (let i = 0; i < list.length; i++) {
    const current = list[i], next = list[i + 1];
    if (current.kind !== "word" || list[i - 1]?.value === ".") continue;
    const literalCall = (name, at = i) => list[at]?.value === name && list[at + 1]?.value === "(" && list[at + 2]?.kind === "string" && list[at + 3]?.value === ")";
    if (literalCall("require") || literalCall("import")) { found.push({ ...list[i + 2], start: current.start }); continue; }
    if (current.value === "createRequire" && next?.value === "(") {
      let depth = 1, j = i + 2;
      for (; j < list.length && depth; j++) { if (list[j].value === "(") depth++; if (list[j].value === ")") depth--; }
      if (list[j]?.value === "(" && list[j + 1]?.kind === "string" && list[j + 2]?.value === ")") found.push({ ...list[j + 1], start: current.start });
    }
    if (current.value === "import" && next?.kind === "string") { found.push({ ...next, start: current.start }); continue; }
    if ((current.value === "import" && next?.value !== "." && next?.value !== "(") || (current.value === "export" && ["*", "{"].includes(next?.value))) {
      for (let j = i + 1; j < list.length && list[j].value !== ";"; j++) {
        if (list[j].value === "from" && list[j + 1]?.kind === "string") { found.push({ ...list[j + 1], start: current.start }); break; }
      }
    }
  }
  return found;
}

export function checkRuntimeDeps({ root, pkg, allowlist } = {}) {
  root = path.resolve(root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  pkg ??= JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  allowlist ??= JSON.parse(fs.readFileSync(path.join(root, "scripts/runtime-deps-allowlist.json"), "utf8"));
  const findings = [], excluded = new Set(), files = [];
  for (const entry of allowlist.files ?? []) {
    const relative = entry?.path ?? "runtime-deps-allowlist.json";
    const absolute = path.resolve(root, relative);
    if (typeof entry?.reason !== "string" || !entry.reason.trim()) findings.push({ file: relative, line: 1, package: "-", reason: "allowlist reason is empty" });
    if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) findings.push({ file: relative, line: 1, package: "-", reason: "allowlist file does not exist inside root" });
    excluded.add(posix(path.relative(root, absolute)));
  }
  const collect = directory => {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name), relative = posix(path.relative(root, absolute));
      if (item.isDirectory() && item.name !== "__tests__" && relative !== "scripts/prototypes") collect(absolute);
      if (item.isFile() && /\.(?:js|mjs)$/.test(item.name) && !/\.test\.(?:js|mjs)$/.test(item.name) && !excluded.has(relative)) files.push(relative);
    }
  };
  if (fs.existsSync(path.join(root, "server.js")) && !excluded.has("server.js")) files.push("server.js");
  collect(path.join(root, "src")); collect(path.join(root, "scripts"));
  for (const file of files.sort()) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const item of imports(source)) {
      const specifier = item.value;
      if (/^(?:node:|\.|\/|\\|[a-z]:[\\/])/i.test(specifier) || builtins.has(specifier) || builtins.has(specifier.split("/")[0])) continue;
      const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
      if (Object.hasOwn(pkg.dependencies ?? {}, name)) continue;
      const line = source.slice(0, item.start).split("\n").length;
      const reason = Object.hasOwn(pkg.devDependencies ?? {}, name) ? "devDependency is not a runtime dependency" : "package is undeclared";
      if (!findings.some(f => f.file === file && f.line === line && f.package === name)) findings.push({ file, line, package: name, reason });
    }
  }
  return { ok: findings.length === 0, findings, scannedFiles: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = checkRuntimeDeps();
    for (const finding of result.findings) console.error(`${finding.file}:${finding.line} ${finding.package} ${finding.reason}`);
    if (result.ok) console.log(`Runtime dependencies passed (${result.scannedFiles} files).`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) { console.error(`Runtime dependency check failed: ${error.message}`); process.exitCode = 1; }
}
