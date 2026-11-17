import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function validateAllowlist(allowlist) {
  const errors = [];
  for (const [name, values] of [
    ['android.allowed', allowlist?.android?.allowed], ['android.blocked', allowlist?.android?.blocked],
    ['android.debugOnly', allowlist?.android?.debugOnly], ['ios.usageDescriptions', allowlist?.ios?.usageDescriptions],
    ['ios.forbidden', allowlist?.ios?.forbidden],
  ]) {
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) errors.push(`${name}: expected an array of non-empty strings`);
  }
  if (errors.length) return errors;
  for (const permission of allowlist.android.allowed) {
    const reason = allowlist.android.reasons?.[permission];
    if (typeof reason !== 'string' || !reason.trim()) errors.push(`${permission}: allowed permission needs a reason`);
    if (allowlist.android.blocked.includes(permission)) errors.push(`${permission}: cannot be both allowed and blocked`);
  }
  return errors;
}

export function checkConfig(introspected, allowlist) {
  const errors = validateAllowlist(allowlist);
  if (errors.length) return errors;
  const config = introspected?.expo ?? introspected;
  const blocked = new Set(config?.android?.blockedPermissions ?? []);
  for (const permission of allowlist.android.blocked) {
    if (!blocked.has(permission)) errors.push(`${permission}: missing from android.blockedPermissions`);
  }
  const plist = config?.ios?.infoPlist ?? {};
  for (const key of allowlist.ios.forbidden) {
    if (Object.hasOwn(plist, key)) errors.push(`${key}: forbidden iOS usage description is present`);
  }
  for (const key of allowlist.ios.usageDescriptions) {
    const value = plist[key];
    if (typeof value !== 'string' || !value.trim()) errors.push(`${key}: missing or empty usage description`);
    else if (value.includes('$(PRODUCT_NAME)') || /^Allow\s/i.test(value.trim())) errors.push(`${key}: generic usage description must explain the feature`);
  }
  return errors;
}

export function checkApkPermissions(lines, allowlist, { debug = true } = {}) {
  const errors = validateAllowlist(allowlist);
  if (errors.length) return errors;
  const text = Array.isArray(lines) ? lines.join('\n') : lines;
  const permissions = new Set([...text.matchAll(/uses-permission(?:-sdk-\d+)?:\s+name=['"]([^'"]+)['"]/g)].map(match => match[1]));
  if (!permissions.size) return ['APK: no uses-permission entries found in aapt2 output'];
  const allowed = new Set(allowlist.android.allowed);
  const debugOnly = new Set(allowlist.android.debugOnly);
  for (const permission of permissions) {
    // Development overlays are the explicitly reviewed debug-only exception.
    if (debug && debugOnly.has(permission)) continue;
    if (allowlist.android.blocked.includes(permission)) errors.push(`${permission}: blocked permission is present in APK`);
    else if (!allowed.has(permission)) errors.push(`${permission}: permission is not on the reviewed allowlist`);
  }
  return errors;
}

function findAapt2() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('APK: set ANDROID_HOME to the Android SDK');
  const directory = join(sdk, 'build-tools');
  const versions = readdirSync(directory).filter(name => /^\d+\.\d+\.\d+(?:-.*)?$/.test(name))
    .sort((a, b) => {
      const av = a.split(/\D+/).map(Number), bv = b.split(/\D+/).map(Number);
      for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return bv[i] - av[i];
      // A stable release sorts before a prerelease of the same numeric version.
      return Number(a.includes('-')) - Number(b.includes('-')) || b.localeCompare(a);
    });
  for (const version of versions) {
    const executable = join(directory, version, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
    if (existsSync(executable)) return executable;
  }
  throw new Error('APK: no aapt2 executable found in Android SDK build-tools');
}

function main(args) {
  const allowlist = JSON.parse(readFileSync(join(root, 'permissions-allowlist.json'), 'utf8'));
  let errors;
  let mode;
  if (args.length === 1 && args[0] === '--config') {
    mode = 'config';
    const output = execFileSync(process.execPath, [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
      cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    });
    errors = checkConfig(JSON.parse(output), allowlist);
  } else if (args.length === 2 && args[0] === '--apk') {
    mode = 'apk';
    const output = execFileSync(findAapt2(), ['dump', 'permissions', resolve(args[1])], { encoding: 'utf8' });
    errors = checkApkPermissions(output, allowlist, { debug: true });
  } else throw new Error('Usage: node scripts/check-permissions.mjs --config | --apk <debug.apk>');
  if (errors.length) { for (const error of errors) console.error(error); process.exitCode = 1; }
  else console.log(`Permissions OK (${mode})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
