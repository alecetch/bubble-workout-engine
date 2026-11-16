import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNodePins } from '../check-node-version-pins.mjs';

const files = {
  '.nvmrc': '24\n',
  '.github/workflows/ci.yml': 'steps:\n  - uses: actions/setup-node@v6\n    with:\n      node-version-file: .nvmrc\n',
  Dockerfile: 'ARG NODE_VERSION=24\nFROM node:${NODE_VERSION}-alpine\n',
  'docker/api/Dockerfile': 'ARG NODE_VERSION=24\nFROM node:${NODE_VERSION}\n',
  'docker-compose.yml': 'services:\n  api:\n    image: node:24\n',
  'mobile/eas.json': '{\n  "build": {\n    "preview": {\n      "node": "24.11.0"\n    }\n  }\n}\n',
};
function fixture(t, replacements = {}) {
  const root = mkdtempSync(join(tmpdir(), 'node-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries({ ...files, ...replacements })) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}
test('aligned version sources pass', t => assert.deepEqual(checkNodePins({ root: fixture(t) }), []));
for (const [name, file, text, line, value] of [
  ['old workflow literal', '.github/workflows/ci.yml', 'with:\n  node-version: "22"\n', 2, '22'],
  ['matching workflow literal', '.github/workflows/ci.yml', 'with:\n  node-version: "24"\n', 2, '24'],
  ['wrong version file', '.github/workflows/ci.yml', 'with:\n  node-version-file: .node-version\n', 2, '.node-version'],
  ['old Docker base', 'Dockerfile', '# base\nFROM node:20-alpine\n', 2, 'node:20'],
  ['old Docker argument', 'docker/api/Dockerfile', 'ARG NODE_VERSION=22\nFROM node:${NODE_VERSION}\n', 1, 'NODE_VERSION=22'],
  ['old Compose image', 'docker-compose.yml', 'services:\n  api:\n    image: node:20\n', 3, 'node:20'],
  ['old EAS version', 'mobile/eas.json', files['mobile/eas.json'].replace('24.11.0', '22.1.0'), 4, '22.1.0'],
  ['nested Dockerfile variant', 'docker/nested/Dockerfile.dev', 'FROM node:22\n', 1, 'node:22'],
  ['Compose override', 'docker-compose.override.yml', 'image: "node:22"\n', 1, 'node:22'],
  ['compact EAS', 'mobile/eas.json', '{"build":{"development":{"node":"22.1.0"}}}', 1, '22.1.0'],
]) test(name, t => {
  const errors = checkNodePins({ root: fixture(t, { [file]: text }) });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith(`${file}:${line}:`), errors[0]);
  assert.ok(errors[0].includes(value), errors[0]);
  assert.match(errors[0], /expected Node major 24/);
});
test('unrelated EAS node fields are ignored', t => {
  const root = fixture(t, { 'mobile/eas.json': '{"build":{"preview":{"node":"24.11.0","env":{"node":"22.1.0"}}},"submit":{"node":"22.1.0"}}' });
  assert.deepEqual(checkNodePins({ root }), []);
});
test('the real repository passes', () => {
  assert.deepEqual(checkNodePins({ root: fileURLToPath(new URL('../../', import.meta.url)) }), []);
});
