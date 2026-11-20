import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
function run(injection, timeout = false, startupFailure = false) {
  const directory = mkdtempSync(path.join(tmpdir(), 'forma-ios-smoke-'));
  const portable = directory.replaceAll('\\', '/');
  mkdirSync(path.join(directory, 'bin'));
  mkdirSync(path.join(directory, 'artifacts/ios-smoke'), { recursive: true });
  const stub = (name, body) => writeFileSync(path.join(directory, 'bin', name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  stub('xcrun', 'if [[ "$STARTUP_FAILURE" == true && "$2" == boot ]]; then exit 17; fi; echo "$*" >> "$GITHUB_WORKSPACE/simctl-calls"; if [[ "$2" == create ]]; then echo fresh-simulator; fi');
  stub('cp', 'exit 0');
  stub('gtimeout', 'shift 2; if [[ "$1" == maestro && "$SIMULATE_TIMEOUT" == true ]]; then exit 124; fi; exec "$@"');
  stub('maestro', `if [[ "$1" == --version ]]; then echo 2.5.1; exit 0; fi
echo "$*" >> "$GITHUB_WORKSPACE/maestro-calls"
if [[ "$*" == *DeliberatelyWrongPassword* || "$*" == *'INJECTED MISSING PROGRAM'* ]]; then echo 'Failed first assertion'; echo 'Assertion second failure'; exit 23; fi
exit 0`);
  try {
    const result = spawnSync(bash, ['scripts/ios-smoke-run.sh'], {
      cwd: root, encoding: 'utf8', timeout: process.platform === 'win32' ? 60000 : 20000,
      env: { ...process.env, PATH: `${portable}/bin${path.delimiter}${process.env.PATH}`,
        GITHUB_WORKSPACE: portable, E2E_EMAIL: 'fixture@example.com',
        E2E_PASSWORD: 'FixturePassword', IOS_DEVICE: 'test-device', IOS_RUNTIME: 'test-runtime',
        FAILURE_INJECTION: injection, SIMULATE_TIMEOUT: String(timeout), STARTUP_FAILURE: String(startupFailure) },
    });
    assert.ifError(result.error);
    assert.ok(existsSync(path.join(directory, "simctl-calls")), result.stdout + result.stderr);
    return { status: result.status, output: result.stdout + result.stderr,
      summaries: Object.fromEntries(readdirSync(path.join(directory, 'artifacts/ios-smoke')).filter(name => name !== 'maestro-version.txt').map(name => [name, readFileSync(path.join(directory, 'artifacts/ios-smoke', name, 'summary.txt'), 'utf8')])),
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
  for (const summary of Object.values(result.summaries)) assert.match(summary, /^PASS exit_code=0 seconds=\d+\n$/);
});
for (const injection of ['login', 'navigation']) test(`${injection} negative control propagates Maestro failure after cleanup`, () => {
  const result = run(injection);
  assert.equal(result.status, 23, result.output);
  assert.equal((result.calls.match(/simctl delete/g) ?? []).length, 1);
  assert.deepEqual(result.cases, ['allow']);
  assert.match(result.summaries.allow, /^FAIL exit_code=23 seconds=\d+\nFailed first assertion\n$/);
  assert.doesNotMatch(result.summaries.allow, /Assertion second failure/);
});
test('Maestro timeout fails instead of reporting a passing launch', () => {
  const result = run('none', true);
  assert.equal(result.status, 124, result.output);
  assert.match(result.calls, /simctl delete/);
  assert.match(result.summaries.allow, /^FAIL exit_code=124 seconds=\d+/);
});

test('simulator startup failure also produces a failure summary and teardown', () => {
  const result = run('none', false, true);
  assert.equal(result.status, 17, result.output);
  assert.match(result.summaries.allow, /^FAIL exit_code=17 seconds=\d+/);
  assert.match(result.calls, /simctl delete/);
});

for (const [entitlement, expected] of [['keychain', 0], ['application', 0], ['missing', 1], ['codesign-error', 1]]) {
  test(`simulator build checks its signed entitlements: ${entitlement}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ios-smoke-build-'));
    const portable = directory.replaceAll('\\', '/');
    mkdirSync(path.join(directory, 'bin')); mkdirSync(path.join(directory, 'mobile'));
    mkdirSync(path.join(directory, 'artifacts/ios-smoke'), { recursive: true });
    const stub = (name, body) => writeFileSync(path.join(directory, 'bin', name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
    stub('npx', 'mkdir -p ios/200Days'); stub('pod', 'exit 0'); stub('PlistBuddy', 'exit 0');
    stub('xcodebuild', `printf '%s\\n' "$*" > "$GITHUB_WORKSPACE/build-args"
      echo "$EXPO_PUBLIC_SMOKE_DIAGNOSTICS" > "$GITHUB_WORKSPACE/diagnostics-flag"
      mkdir -p ios-smoke-build/Build/Products/Release-iphonesimulator/200Days.app
      touch ios-smoke-build/Build/Products/Release-iphonesimulator/200Days.app/main.jsbundle`);
    stub('codesign', `case "$FAKE_ENTITLEMENT" in
      keychain) echo '<plist><dict><key>keychain-access-groups</key><array><string>local.test</string></array></dict></plist>' ;;
      application) echo '<plist><dict><key>application-identifier</key><string>local.test</string></dict></plist>' ;;
      codesign-error) exit 7 ;;
      *) echo '<plist><dict/></plist>' ;;
    esac`);
    try {
      const result = spawnSync(bash, [path.join(root, 'scripts/ios-smoke-build.sh').replaceAll('\\', '/')], {
        cwd: directory, encoding: 'utf8', timeout: 20000,
        env: { ...process.env, PATH: `${portable}/bin${path.delimiter}${process.env.PATH}`, GITHUB_WORKSPACE: portable, PLIST_BUDDY: 'PlistBuddy', FAKE_ENTITLEMENT: entitlement },
      });
      assert.ifError(result.error); assert.equal(result.status, expected, result.stdout + result.stderr);
      const args = readFileSync(path.join(directory, 'build-args'), 'utf8');
      for (const flag of ['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_REQUIRED=NO']) assert.ok(args.includes(flag));
      assert.doesNotMatch(args, /CODE_SIGN_ENTITLEMENTS=/);
      assert.equal(readFileSync(path.join(directory, 'diagnostics-flag'), 'utf8').trim(), 'true');
      assert.equal(existsSync(path.join(directory, 'artifacts/ios-smoke/build-seconds')), expected === 0);
      if (expected !== 0) assert.match(result.stderr, /Simulator signing check failed/);
    } finally {
      assert.equal(path.dirname(directory), path.resolve(tmpdir()));
      assert.ok(path.basename(directory).startsWith('ios-smoke-build-'));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
