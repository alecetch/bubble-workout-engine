import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRuntimeDeps } from "../check-runtime-deps.mjs";
function fixture(t, source, file = "src/runtime.js") {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-deps-"));
 t.after(() => fs.rmSync(root, { recursive: true, force: true }));
 fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), source);
 return { root, pkg: { dependencies: { prod: "1", "@scope/pkg": "1" }, devDependencies: { dev: "1" } }, allowlist: { files: [] } };
}
test("runtime devDependency fails with its importing file and line", t => {
 const result = checkRuntimeDeps(fixture(t, '\nimport value from "dev";'));
 assert.equal(result.ok, false); assert.deepEqual(result.findings, [{ file: "src/runtime.js", line: 2, package: "dev", reason: "devDependency is not a runtime dependency" }]);
});
test("literal dynamic imports are checked", t => { const result = checkRuntimeDeps(fixture(t, 'await import("dev");')); assert.equal(result.findings[0].package, "dev"); });
test("undeclared require fails, including immediate createRequire", t => {
 const result = checkRuntimeDeps(fixture(t, 'require("missing");\ncreateRequire(import.meta.url)("another");'));
 assert.deepEqual(result.findings.map(f => f.package), ["missing", "another"]);
});
test("scoped subpaths reduce to the package name", t => { const f = fixture(t, 'import x from "@scope/pkg/sub/path";'); assert.equal(checkRuntimeDeps(f).ok, true); f.pkg.dependencies = {}; assert.equal(checkRuntimeDeps(f).findings[0].package, "@scope/pkg"); });
test("builtins and relative/absolute paths are ignored", t => { assert.equal(checkRuntimeDeps(fixture(t, 'import "node:fs"; import "fs/promises"; import "./local.js"; require("/absolute.js");')).ok, true); });
test("multiline and side-effect imports and reexports are checked", t => {
 const result = checkRuntimeDeps(fixture(t, 'import {\n a\n} from "dev";\nexport * from "missing";\nimport "another";'));
 assert.deepEqual(result.findings.map(f => [f.line, f.package]), [[1, "dev"], [4, "missing"], [5, "another"]]);
});
test("test files and prototypes are excluded", t => {
 for (const file of ["src/__tests__/example.js", "src/example.test.js", "scripts/example.test.mjs", "scripts/prototypes/example.mjs", "test/runtime.js"]) assert.equal(checkRuntimeDeps(fixture(t, 'import "dev";', file)).ok, true);
});
test("allowlist requires an existing file and specific reason", t => {
 const f = fixture(t, 'import "dev";'); f.allowlist.files = [{ path: "src/runtime.js", reason: "Local preview tool, not deployed or run in production" }];
 assert.equal(checkRuntimeDeps(f).ok, true); f.allowlist.files[0].reason = " "; assert.equal(checkRuntimeDeps(f).ok, false);
 f.allowlist.files = [{ path: "missing.js", reason: "stale" }]; assert.equal(checkRuntimeDeps(f).ok, false);
});
test("comments, strings and template text do not invent imports", t => {
 assert.equal(checkRuntimeDeps(fixture(t, '// import "dev";\n/* require("dev") */\nconst text = `import("dev")`; const quoted = \'require("dev")\'; import "prod";')).ok, true);
});
test("real API tree passes and a repeat of the sharp outage fails", () => {
 const root = fileURLToPath(new URL("../../", import.meta.url));
 const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
 assert.equal(checkRuntimeDeps({ root, pkg }).ok, true);
 if (pkg.dependencies.sharp) { pkg.devDependencies.sharp = pkg.dependencies.sharp; delete pkg.dependencies.sharp; }
 const result = checkRuntimeDeps({ root, pkg });
 assert.equal(result.ok, false); assert.ok(result.findings.some(f => f.package === "sharp" && f.file.startsWith("src/")));
});
