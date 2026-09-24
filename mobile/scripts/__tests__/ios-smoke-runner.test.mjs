import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
function run(injection, timeout = false) {
  const directory = mkdtempSync(path.join(tmpdir(), 'forma-ios-smoke-'));
  const portable = directory.replaceAll('\\', '/');
  mkdirSync(path.join(directory, 'bin'));
  mkdirSync(path.join(directory, 'artifacts/ios-smoke'), { recursive: true });
  const stub = (name, body) => writeFileSync(path.join(directory, 'bin', name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  stub('xcrun', 'echo "$*" >> "$GITHUB_WORKSPACE/simctl-calls"; if [[ "$2" == create ]]; then echo fresh-simulator; fi');
  stub('cp', 'exit 0');
  stub('gtimeout', 'shift 2; if [[ "$1" == maestro && "$SIMULATE_TIMEOUT" == true ]]; then exit 124; fi; exec "$@"');
  stub('maestro', `if [[ "$1" == --version ]]; then echo 2.5.1; exit 0; fi
echo "$*" >> "$GITHUB_WORKSPACE/maestro-calls"
if [[ "$*" == *DeliberatelyWrongPassword* || "$*" == *'INJECTED MISSING PROGRAM'* ]]; then exit 23; fi
exit 0`);
  try {
    const result = spawnSync(bash, ['scripts/ios-smoke-run.sh'], {
      cwd: root, encoding: 'utf8', timeout: 20000,
      env: { ...process.env, PATH: `${portable}/bin${path.delimiter}${process.env.PATH}`,
        GITHUB_WORKSPACE: portable, E2E_EMAIL: 'fixture@example.com',
        E2E_PASSWORD: 'FixturePassword', IOS_DEVICE: 'test-device', IOS_RUNTIME: 'test-runtime',
        FAILURE_INJECTION: injection, SIMULATE_TIMEOUT: String(timeout) },
    });
    assert.ifError(result.error);
    assert.ok(existsSync(path.join(directory, "simctl-calls")), result.stdout + result.stderr);
    return { status: result.status, output: result.stdout + result.stderr,
      calls: readFileSync(path.join(directory, 'simctl-calls'), 'utf8'),
      cases: readdirSync(path.join(directory, 'artifacts/ios-smoke')).filter(name => name !== 'maestro-version.txt') };
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('forma-ios-smoke-'));
    rmSync(directory, { recursive: true, force: true });
  }
}
test('runner executes all four cases with separate simulator lifecycles', () => {
  const result = run('none');
  assert.equal(result.status, 0, result.output);
  assert.equal((result.calls.match(/simctl create/g) ?? []).length, 4);
  assert.equal((result.calls.match(/simctl delete/g) ?? []).length, 4);
  assert.deepEqual(result.cases.sort(), ['allow', 'cold-link', 'deny', 'warm-link']);
});
for (const injection of ['login', 'navigation']) test(`${injection} negative control propagates Maestro failure after cleanup`, () => {
  const result = run(injection);
  assert.equal(result.status, 23, result.output);
  assert.equal((result.calls.match(/simctl delete/g) ?? []).length, 1);
  assert.deepEqual(result.cases, ['allow']);
});
test('Maestro timeout fails instead of reporting a passing launch', () => {
  const result = run('none', true);
  assert.equal(result.status, 124, result.output);
  assert.match(result.calls, /simctl delete/);
});
