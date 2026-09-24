import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function requiresDeployment(paths) {
  return paths.some((path) => path.startsWith('api/') || path.startsWith('migrations/') || [
    'scripts/migrate.sh',
    'scripts/deploy-changes.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/fly-deploy.yml',
  ].includes(path));
}

export function deploymentRequired(eventName, event, sha, git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8' })) {
  if (eventName === 'workflow_dispatch') return true;
  if (eventName !== 'push') return false;
  // Full push range, including deletions and both sides of renames. If the
  // previous tip is unavailable (e.g. force push), fail the job; never guess.
  const paths = !event.before || /^0+$/.test(event.before)
    ? git('ls-tree', '-r', '--name-only', '-z', sha)
    : git('diff', '--name-only', '--no-renames', '-z', event.before, sha);
  return requiresDeployment(paths.split('\0'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const required = deploymentRequired(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_SHA);
  appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
}
