import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseAllDocuments } from 'yaml';
import { estimateCost } from '../../../scripts/ios-smoke-report.mjs';

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
function yaml(path) {
  return parseAllDocuments(read(path)).map(document => {
    assert.deepEqual(document.errors, []);
    return document.toJS();
  });
}
// Paths are relative to repository root.
const workflow = yaml('.github/workflows/ios-maestro-smoke.yml')[0];
test('iOS smoke is nightly and dispatchable, bounded, and has no production secrets', () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.schedule, [{ cron: '0 3 * * *' }]);
  assert.equal(workflow.on.pull_request, undefined);
  const job = workflow.jobs.smoke;
  assert.equal(job['runs-on'], 'macos-26');
  assert.equal(job['timeout-minutes'], 75);
  assert.equal(job.services, undefined);
  assert.equal(job.env.EXPO_PUBLIC_API_BASE_URL, 'http://127.0.0.1:3000');
  assert.equal(job.env.EXPO_PUBLIC_ENABLE_NOTIFICATION_TAP_THROUGH, 'false');
  assert.equal(job.env.RUN_OWNER, '${{ github.actor }}');
  assert.doesNotMatch(read('.github/workflows/ios-maestro-smoke.yml'), /secrets\./);
  assert.equal(job.steps.find(step => step.name === 'Run iOS smoke cases')['continue-on-error'], undefined);
  assert.equal(job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).if, 'always()');
  const cache = job.steps.find(step => step.id === 'app-cache').with;
  assert.ok(cache.key.includes('runner.arch') && cache.key.includes('hashFiles'));
  assert.equal(cache['restore-keys'], undefined);
  assert.match(cache.key, /adhoc-v2/);
});

test('scheduled runs use safe defaults and heartbeat runs only on success', () => {
  const job = workflow.jobs.smoke;
  assert.equal(job.env.FAILURE_INJECTION, "${{ inputs.failure_injection || 'none' }}");
  assert.equal(job.steps.find(step => step.id === 'app-cache').if, "${{ !(inputs.cold_build || false) }}");
  const save = job.steps.find(step => step.uses?.startsWith('actions/cache/save@'));
  assert.equal(save.if, "${{ !(inputs.cold_build || false) && steps.app-cache.outputs.cache-hit != 'true' }}");
  const heartbeat = job.steps.find(step => step.name === 'Ping successful smoke heartbeat');
  assert.equal(heartbeat.if, "${{ success() && vars.IOS_SMOKE_HEARTBEAT_URL != '' }}");
  assert.equal(heartbeat.env.HEARTBEAT_URL, '${{ vars.IOS_SMOKE_HEARTBEAT_URL }}');
  assert.equal(heartbeat.run, 'curl -fsS -m 10 "$HEARTBEAT_URL"');
});

test('smoke diagnostics are enabled only by the simulator build script', () => {
  assert.match(read('scripts/ios-smoke-build.sh'), /export EXPO_PUBLIC_SMOKE_DIAGNOSTICS=true/);
  assert.doesNotMatch(read('mobile/eas.json'), /EXPO_PUBLIC_SMOKE_DIAGNOSTICS/);
});
test('permission cases require actual fresh prompts and test session persistence', () => {
  for (const name of ['allow', 'deny']) {
    const documents = yaml(`mobile/.maestro/ios/${name}.yaml`);
    assert.equal(documents[1][0].runFlow.file, 'auth-program-session.yaml');
  }
  const [, commands] = yaml('mobile/.maestro/ios/auth-program-session.yaml');
  assert.equal(commands[0].launchApp.permissions.all, 'unset');
  const text = JSON.stringify(commands);
  assert.match(text, /Would Like to Send You Notifications/);
  assert.match(text, /login-submit-button/);
  assert.match(text, /EXPECTED_PROGRAM/);
  assert.ok(commands.some(command => command === 'stopApp'));
  assert.ok(commands.some(command => command.openLink === 'forma://'));
  assert.ok(commands.some(command => command.assertNotVisible === 'Sign in'));
  assert.doesNotMatch(text, /optional|10\.0\.2\.2|Development Build/);
});
test('cold and warm links assert referral data in the destination UI', () => {
  for (const name of ['cold-link', 'warm-link']) {
    const [, commands] = yaml(`mobile/.maestro/ios/${name}.yaml`);
    assert.equal(Boolean(commands[0].launchApp), name === 'warm-link');
    assert.ok(commands.some(command => command.openLink?.startsWith('forma://ref/')));
    assert.equal(commands.at(-1).assertVisible.id, 'referral-code-input');
    assert.match(commands.at(-1).assertVisible.text, /^[A-Z2-9]{8}$/);
  }
});
test('runner creates new simulators, propagates failures, and keeps negative controls', () => {
  const script = read('scripts/ios-smoke-run.sh');
  assert.match(script, /for case_name in allow deny cold-link warm-link/);
  assert.match(script, /simctl create/);
  assert.match(script, /trap collect_and_delete EXIT/);
  assert.match(script, /gtimeout --kill-after=15s 300 maestro/);
  assert.match(script, /exit "\$result"/);
  assert.match(script, /DeliberatelyWrongPassword/);
  assert.match(script, /INJECTED MISSING PROGRAM/);
  assert.match(script, /simctl delete/);
});
test('cost remains unknown without a rate and rounds billable minutes', () => {
  assert.equal(estimateCost(75, ''), null);
  assert.equal(estimateCost(75, undefined), null);
  assert.equal(estimateCost(75, '0'), 0);
  assert.equal(estimateCost(75, '0.062'), 0.124);
  assert.throws(() => estimateCost(75, 'invalid'));
  assert.throws(() => estimateCost(75, '-1'));
});
