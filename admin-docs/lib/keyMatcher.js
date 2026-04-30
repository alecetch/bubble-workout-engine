/**
 * keyMatcher.js
 *
 * Extracts canonical doc_keys from spec and prompt filenames, and builds
 * lookup maps from filesystem scans.
 *
 * Naming conventions handled:
 *
 * SPEC filenames → doc_key:
 *   feature-1-post-onboarding-ux-spec.md      → feature-1-post-onboarding-ux
 *   spec-admin-preview-progression-tab.md     → admin-preview-progression-tab
 *   spec-equipment-aware-selection.md         → equipment-aware-selection
 *   preview-csv-export-spec.md                → preview-csv-export
 *   exercise-catalogue-duplicate-cleanup-plan.md → exercise-catalogue-duplicate-cleanup-plan
 *
 * PROMPT filenames → doc_key:
 *   codex-prompts-feature-1-post-onboarding-ux.md → feature-1-post-onboarding-ux
 *   codex-prompts-preview-csv-export.md            → preview-csv-export
 *   codex-prompts-variability-feature.txt          → variability-feature
 *   codex-prompts.md                               → '' (empty — skipped)
 *   codex-rir-capture-log-segment.md               → codex-rir-capture-log-segment
 *
 * BUG PROMPT filenames → parent doc_key:
 *   codex-prompts-{doc_key}-bug.md            → parent doc_key = {doc_key}
 *   codex-prompts-{doc_key}-bug-{slug}.md     → parent doc_key = {doc_key}
 *
 *   Examples:
 *   codex-prompts-feature-3-exercise-substitution-mobile-ui-bug.md
 *     → parent: feature-3-exercise-substitution-mobile-ui
 *   codex-prompts-feature-4-program-lifecycle-mobile-ui-bug-reenrollment.md
 *     → parent: feature-4-program-lifecycle-mobile-ui, slug: reenrollment
 */

import { readdir } from 'fs/promises';
import { basename, extname } from 'path';

/**
 * Extract a canonical doc_key from a spec filename (basename).
 */
export function extractSpecKey(filename) {
  let key = basename(filename, extname(filename)); // strip extension
  key = key.replace(/^spec-/, '');                 // strip leading "spec-" prefix
  key = key.replace(/-spec$/, '');                 // strip trailing "-spec" suffix
  return key;
}

/**
 * Extract a canonical doc_key from a prompt filename (basename).
 * Returns an empty string for filenames that don't produce a usable key
 * (e.g. "codex-prompts.md" → "").
 */
export function extractPromptKey(filename) {
  let key = basename(filename);
  key = key.replace(/\.(md|txt)$/i, '');  // strip .md or .txt
  key = key.replace(/^codex-prompts-/, ''); // strip "codex-prompts-" prefix
  // If the result equals "codex-prompts" (the bare file with no suffix), skip it
  if (key === 'codex-prompts') return '';
  return key;
}

// Matches: codex-prompts-{parent-key}-bug[-{slug}].{md|txt}
// Captures: [1] parent key,  [2] optional slug (without leading dash)
const BUG_PROMPT_RE = /^codex-prompts-(.+)-bug(-[a-z0-9][a-z0-9-]*)?\.(md|txt)$/i;

/**
 * Test whether a filename follows the bug-prompt convention.
 * Returns { parentKey, slug } if it matches, or null if it does not.
 *
 * Examples:
 *   codex-prompts-feature-3-exercise-substitution-mobile-ui-bug.md
 *     → { parentKey: 'feature-3-exercise-substitution-mobile-ui', slug: null }
 *   codex-prompts-feature-4-program-lifecycle-mobile-ui-bug-reenrollment.md
 *     → { parentKey: 'feature-4-program-lifecycle-mobile-ui', slug: 'reenrollment' }
 */
export function extractBugPromptKey(filename) {
  const match = basename(filename).match(BUG_PROMPT_RE);
  if (!match) return null;
  return {
    parentKey: match[1],
    slug: match[2] ? match[2].slice(1) : null,  // strip leading dash
  };
}

/**
 * Scan docs/prompts/active/ and docs/prompts/done/ for bug-prompt files.
 * Returns Map<parentDocKey, string[]> — an array of bug prompt filenames per spec.
 * Both active and done bug prompts are included.
 */
export async function buildBugPromptMap(activeDir, doneDir) {
  const map = new Map();

  async function scanDir(dir) {
    let files;
    try {
      files = await readdir(dir);
    } catch {
      return;
    }
    for (const file of files) {
      const result = extractBugPromptKey(file);
      if (!result) continue;
      const { parentKey } = result;
      if (!map.has(parentKey)) map.set(parentKey, []);
      map.get(parentKey).push(file);
    }
  }

  await Promise.all([scanDir(activeDir), scanDir(doneDir)]);
  return map;
}

/**
 * Extract a canonical doc_key from a test plan filename (basename).
 * e.g. "feature-9-social-sharing-test-plan.md" → "feature-9-social-sharing"
 */
export function extractTestPlanKey(filename) {
  let key = basename(filename, extname(filename)); // strip extension
  key = key.replace(/-test-plan$/, '');            // strip trailing "-test-plan"
  return key;
}

/**
 * Scan docs/test_plans/ and return Map<docKey, testPlanFilename>.
 */
export async function buildTestPlanMap(testPlansDir) {
  const map = new Map();
  let files;
  try {
    files = await readdir(testPlansDir);
  } catch {
    console.warn(`[keyMatcher] test_plans dir not found or unreadable: ${testPlansDir}`);
    return map;
  }
  for (const file of files) {
    if (!/\.(md|txt)$/i.test(file)) continue;
    const key = extractTestPlanKey(file);
    if (key) map.set(key, file);
  }
  return map;
}

/**
 * Scan docs/specs/ and return Map<docKey, specFilename>.
 */
export async function buildSpecMap(specsDir) {
  const map = new Map();
  let files;
  try {
    files = await readdir(specsDir);
  } catch {
    console.warn(`[keyMatcher] specs dir not found or unreadable: ${specsDir}`);
    return map;
  }
  for (const file of files) {
    if (!/\.(md|txt)$/i.test(file)) continue;
    const key = extractSpecKey(file);
    if (key) map.set(key, file);
  }
  return map;
}

/**
 * Scan docs/prompts/active/ and docs/prompts/done/.
 * Returns Map<docKey, { filename: string, inDone: boolean }>.
 *
 * If the same key appears in both directories, done/ takes precedence
 * (the prompt was already completed).
 */
export async function buildPromptMap(activeDir, doneDir) {
  const map = new Map();

  async function scanDir(dir, inDone) {
    let files;
    try {
      files = await readdir(dir);
    } catch {
      console.warn(`[keyMatcher] prompt dir not found or unreadable: ${dir}`);
      return;
    }
    for (const file of files) {
      if (!/\.(md|txt)$/i.test(file)) continue;
      // Only consider files that follow the codex-prompts-* convention.
      // Spec files moved to prompts/active/ as combined artefacts are tracked
      // via prompt_filename on the board row, not via this map.
      if (!/^codex-prompts-/i.test(file)) continue;
      const key = extractPromptKey(file);
      if (!key) continue; // skip bare "codex-prompts.md"
      // Skip bug prompts — those are handled by buildBugPromptMap
      if (BUG_PROMPT_RE.test(file)) continue;
      if (!map.has(key) || inDone) {
        // done/ overwrites active/ for the same key
        map.set(key, { filename: file, inDone });
      }
    }
  }

  await scanDir(activeDir, false);
  await scanDir(doneDir, true);
  return map;
}
