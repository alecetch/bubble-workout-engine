import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const workflow = readFileSync(new URL("../../.github/workflows/db-offsite-backup.yml", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const bash = spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;
function script(name) {
  const block = workflow.split(`      - name: ${name}\n`)[1]?.split("\n      - name:")[0];
  assert.ok(block, `step exists: ${name}`);
  return block.split("        run: |\n")[1].split("\n").map(line => line.replace(/^          /, "")).join("\n");
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "offsite-backup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); mkdirSync(bin); const output = join(root, "output"); writeFileSync(output, "");
  const env = { PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: root, PG_BIN: bin, GITHUB_OUTPUT: output, AGE_PUBLIC_KEY: "public-test-key", PROXY_URL: "redacted-test-url" };
  const stub = (name, content) => { const file = join(bin, name); writeFileSync(file, `#!/bin/bash\nset -euo pipefail\n${content}\n`); chmodSync(file, 0o755); };
  return { root, bin, output, env, stub, run: (name, values = {}) => spawnSync("bash", ["-c", script(name)], { env: { ...env, ...values }, encoding: "utf8" }) };
}
test("missing backup configuration skips cleanly and every later step is guarded", { skip: !bash }, t => {
  const f = fixture(t), result = f.run("Check configuration");
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /Off-site backup not configured; skipping/);
  assert.equal(readFileSync(f.output, "utf8").trim(), "enabled=false");
  for (const block of workflow.split("      - name: ").slice(2)) assert.match(block, /if: .*steps.config.outputs.enabled == 'true'/);
});
test("complete configuration enables the backup without exposing secret values", { skip: !bash }, t => {
  const f = fixture(t), secret = "private-test-value";
  const names = ["OFFSITE_ACCESS_KEY_ID", "OFFSITE_SECRET_ACCESS_KEY", "OFFSITE_BUCKET", "OFFSITE_ENDPOINT", "AGE_PUBLIC_KEY", "FLY_API_TOKEN", "DATABASE_URL", "FLY_MPG_CLUSTER_ID"];
  const result = f.run("Check configuration", Object.fromEntries(names.map(name => [name, secret])));
  assert.equal(result.status, 0); assert.equal(readFileSync(f.output, "utf8").trim(), "enabled=true");
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
});
test("failed encryption erases the plaintext dump and fails the step", { skip: !bash }, t => {
  const f = fixture(t);
  f.stub("pg_dump", 'for arg; do case "$arg" in --file=*) printf private-data > "${arg#--file=}";; esac; done');
  f.stub("age", "exit 1");
  const result = f.run("Dump, encrypt and erase plaintext"); assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(f.root, "backup.dump")), false); assert.ok(!result.stdout.includes("private-data"));
});
test("small encrypted backup fails the size check after deleting plaintext", { skip: !bash }, t => {
  const f = fixture(t);
  f.stub("pg_dump", 'for arg; do case "$arg" in --file=*) printf private-data > "${arg#--file=}";; esac; done');
  f.stub("age", 'printf short > "$4"');
  const result = f.run("Dump, encrypt and erase plaintext"); assert.notEqual(result.status, 0);
  assert.match(result.stdout, /unexpectedly small/); assert.equal(existsSync(join(f.root, "backup.dump")), false);
});
test("upload uses only the encrypted artifact and cleanup erases runner files", { skip: !bash }, t => {
  const f = fixture(t), args = join(f.root, "args");
  writeFileSync(join(f.root, "backup.dump.age"), "encrypted-fixture");
  f.stub("aws", 'printf "%s\n" "$@" > "$ARG_LOG"');
  const result = f.run("Upload encrypted backup", { OFFSITE_BUCKET: "test-bucket", OFFSITE_ENDPOINT: "https://offsite.test", ARG_LOG: args });
  assert.equal(result.status, 0, result.stderr);
  const calls = readFileSync(args, "utf8").split("\n");
  assert.ok(calls.includes(join(f.root, "backup.dump.age"))); assert.ok(!calls.includes(join(f.root, "backup.dump")));
  assert.equal(f.run("Clean up runner files and proxy").status, 0); assert.equal(existsSync(join(f.root, "backup.dump.age")), false);
});
