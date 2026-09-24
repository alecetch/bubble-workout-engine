import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function estimateCost(seconds, rate) {
  if (rate == null || rate.trim() === '') return null;
  const value = Number(rate);
  if (!Number.isFinite(value) || value < 0) throw new Error('IOS_SMOKE_MACOS_RATE_USD must be a non-negative per-minute rate');
  return Number((Math.ceil(seconds / 60) * value).toFixed(4));
}

export function report(env = process.env) {
  const directory = 'artifacts/ios-smoke';
  mkdirSync(directory, { recursive: true });
  const read = (file) => existsSync(`${directory}/${file}`) ? readFileSync(`${directory}/${file}`, 'utf8').trim() : null;
  const started = read('started-at');
  const seconds = started ? Math.max(0, Math.floor(Date.now() / 1000) - Number(started)) : 0;
  const cases = ['allow', 'deny', 'cold-link', 'warm-link'].map(name => ({
    name, seconds: read(`${name}/seconds`), exitCode: read(`${name}/exit-code`),
  }));
  const metrics = {
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sha: env.GITHUB_SHA,
    owner: env.RUN_OWNER, status: env.SMOKE_JOB_STATUS,
    failureInjection: env.FAILURE_INJECTION, cacheHit: env.APP_CACHE_HIT === 'true',
    buildSeconds: read('build-seconds'), measuredSeconds: seconds,
    estimatedComputeUsd: estimateCost(seconds, env.MACOS_RATE_USD),
    rateUsdPerMinute: env.MACOS_RATE_USD || null,
    billingVerified: false, flowRetries: 0, cases,
  };
  writeFileSync(`${directory}/metrics.json`, JSON.stringify(metrics, null, 2));
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,
    `## iOS simulator smoke\n\nOwner: ${metrics.owner}. Result: ${metrics.status}. Negative control: ${metrics.failureInjection}.\n\n` +
    `Cache hit: ${metrics.cacheHit}. Build seconds: ${metrics.buildSeconds ?? 'cached/not completed'}. Measured seconds: ${seconds}.\n\n` +
    `Estimated compute USD: ${metrics.estimatedComputeUsd ?? 'unverified (set IOS_SMOKE_MACOS_RATE_USD from billing)'}. Excludes setup before measurement, artifact storage and plan allowances; verify actual billing.\n\n` +
    `No automatic product retries. Review metrics across one week for flake rate. Physical iPhone sign-off is still required; notification tap-through remains disabled.\n`);
  return metrics;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) report();
