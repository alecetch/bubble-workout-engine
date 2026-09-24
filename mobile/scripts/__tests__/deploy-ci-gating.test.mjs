import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDocument } from 'yaml';
import { deploymentRequired, requiresDeployment } from '../../../scripts/deploy-changes.mjs';

function workflow(name) {
  const document = parseDocument(readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'), { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  return document.toJS();
}

test('production deploy has no independent push or manual bypass', () => {
  const deploy = workflow('fly-deploy');
  assert.deepEqual(Object.keys(deploy.on), ['workflow_call']);
  assert.equal(deploy.jobs.deploy.if, "github.ref == 'refs/heads/main'");
  assert.equal(deploy.jobs.deploy.steps.find(step => step.uses?.startsWith('actions/checkout@')).with.ref, '${{ github.sha }}');
  assert.equal(deploy.concurrency['cancel-in-progress'], false);
});

test('same-commit caller requires every CI gate without overriding failure handling', () => {
  const ci = workflow('ci');
  const deploy = ci.jobs.deploy;
  assert.equal(deploy.uses, './.github/workflows/fly-deploy.yml');
  assert.deepEqual([...deploy.needs].sort(), ['deploy-changes', 'e2e', 'native-drift-check', 'test']);
  assert.equal(deploy.if, "github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && needs.deploy-changes.outputs.required == 'true'");
  // No always()/!cancelled()/continue-on-error may turn failed gates into a deploy.
  for (const name of deploy.needs) assert.equal(ci.jobs[name]['continue-on-error'], undefined);
  for (const step of ci.jobs.test.steps) assert.equal(step['continue-on-error'], undefined);
  assert.ok(Object.hasOwn(ci.on, 'workflow_dispatch'));
  assert.equal(ci.jobs.e2e.needs, 'e2e-flows');
  assert.match(ci.jobs.e2e.steps[0].run, /needs\.e2e-flows\.result/);
  assert.match(ci.jobs.e2e.steps[0].run, /exit 1/);
  const commands = ci.jobs.test.steps.map(step => step.run ?? '').join('\n');
  for (const check of ['tsc --noEmit', 'validate-coverage-manifest', 'check-a11y-regression', 'check-brand-strings', 'vitest run --coverage', 'deploy-ci-gating.test.mjs']) {
    assert.ok(commands.includes(check), `Missing required check: ${check}`);
  }
});

test('API, migration and gate changes deploy; mobile/docs-only changes do not', () => {
  for (const path of ['api/src/app.js', 'migrations/V1.sql', 'scripts/migrate.sh', 'scripts/deploy-changes.mjs', '.github/workflows/ci.yml', '.github/workflows/fly-deploy.yml']) {
    assert.equal(requiresDeployment([path]), true, path);
  }
  assert.equal(requiresDeployment(['mobile/App.tsx', 'docs/reference/ops.md']), false);
  assert.equal(requiresDeployment([]), false);
});

test('manual runs force selection, PRs never select deployment', () => {
  const noGit = () => { throw new Error('Should not run git'); };
  assert.equal(deploymentRequired('workflow_dispatch', {}, 'head', noGit), true);
  assert.equal(deploymentRequired('pull_request', {}, 'head', noGit), false);
});

test('push checks full before/head range including deleted or renamed API files', () => {
  assert.equal(deploymentRequired('push', { before: 'base' }, 'head', (...args) => {
    assert.deepEqual(args, ['diff', '--name-only', '--no-renames', '-z', 'base', 'head']);
    return 'api/deleted.js\0docs/moved.js\0';
  }), true);
});

test('initial pushes inspect the entire tree', () => {
  assert.equal(deploymentRequired('push', { before: '0'.repeat(40) }, 'head', (...args) => {
    assert.deepEqual(args, ['ls-tree', '-r', '--name-only', '-z', 'head']);
    return 'api/index.js\0';
  }), true);
});

test('unavailable push base fails closed instead of selecting deployment', () => {
  assert.throws(() => deploymentRequired('push', { before: 'missing' }, 'head', () => {
    throw new Error('Unknown revision');
  }), /Unknown revision/);
});
