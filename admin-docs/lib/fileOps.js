import { rename, access } from 'fs/promises';
import { join } from 'path';

/**
 * Move a spec file from docs/specs/ to docs/prompts/active/.
 * Used when a spec is being promoted to Prompt Active without a separate prompt file
 * (the spec itself is the combined spec/prompt artefact).
 *
 * Returns { moved: true, dest } on success.
 * Returns { moved: false, dest, reason } if the file is already in prompts/active/.
 * Throws if the file is not found in specs/.
 */
export async function moveSpecToPromptActive(docsRoot, specFilename) {
  const src  = join(docsRoot, 'specs',           specFilename);
  const dest = join(docsRoot, 'prompts', 'active', specFilename);

  // Check if already in prompts/active/
  try {
    await access(dest);
    return { moved: false, dest, reason: 'already in prompts/active' };
  } catch { /* not there yet — proceed */ }

  // Move from specs/
  try {
    await access(src);
    await rename(src, dest);
    return { moved: true, dest };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Spec file "${specFilename}" not found in specs/. It may have been moved manually.`
      );
    }
    throw err;
  }
}

/**
 * Move a prompt file from docs/prompts/active/ to docs/prompts/done/.
 *
 * Returns { moved: true, dest } if the file was renamed.
 * Returns { moved: false, dest, reason } if the file was already in done/.
 * Throws if the file is not found in either location.
 */
export async function movePromptToDone(docsRoot, promptFilename) {
  const src  = join(docsRoot, 'prompts', 'active', promptFilename);
  const dest = join(docsRoot, 'prompts', 'done',   promptFilename);

  // Try to move from active/
  try {
    await access(src);
    await rename(src, dest);
    return { moved: true, dest };
  } catch (srcErr) {
    if (srcErr.code !== 'ENOENT') throw srcErr;

    // Not in active/ — check if it's already in done/
    try {
      await access(dest);
      return { moved: false, dest, reason: 'already in done' };
    } catch {
      throw new Error(
        `Prompt file "${promptFilename}" not found in active/ or done/. ` +
        `It may have been moved manually.`
      );
    }
  }
}
