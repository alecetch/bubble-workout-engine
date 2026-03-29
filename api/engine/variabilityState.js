function toStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

export function createVariabilityState() {
  return {
    programSticky: new Map(),
    programStickyMeta: new Map(),
    blockSticky: new Map(),
    blockStickyMeta: new Map(),
    blockHistory: new Map(),
  };
}

export function makeBlockFamilyKey(dayIndex, blockKey, family) {
  const day = Number.isFinite(Number(dayIndex)) ? Number(dayIndex) : 0;
  const block = toStr(blockKey).trim();
  const fam = toStr(family).trim();
  return `${day}:${block}:${fam}`;
}

export function getProgramStickyExerciseId(state, family) {
  const fam = toStr(family).trim();
  if (!fam) return null;
  return state?.programSticky?.get(fam) ?? null;
}

export function getProgramStickyMeta(state, family) {
  const fam = toStr(family).trim();
  if (!fam) return null;
  return state?.programStickyMeta?.get(fam) ?? null;
}

export function getBlockStickyExerciseId(state, dayIndex, blockKey, family) {
  const fam = toStr(family).trim();
  if (!fam) return null;
  const key = makeBlockFamilyKey(dayIndex, blockKey, fam);
  return state?.blockSticky?.get(key) ?? null;
}

export function getBlockStickyMeta(state, dayIndex, blockKey, family) {
  const fam = toStr(family).trim();
  if (!fam) return null;
  const key = makeBlockFamilyKey(dayIndex, blockKey, fam);
  return state?.blockStickyMeta?.get(key) ?? null;
}

export function recordProgramStickyChoice(state, family, exerciseId, metadata = null) {
  const fam = toStr(family).trim();
  const exId = toStr(exerciseId).trim();
  if (!fam || !exId || !state?.programSticky) return;
  state.programSticky.set(fam, exId);
  if (state?.programStickyMeta) {
    state.programStickyMeta.set(fam, metadata ?? null);
  }
}

export function recordBlockStickyChoice(state, dayIndex, blockKey, family, exerciseId, canonicalName, metadata = null) {
  const fam = toStr(family).trim();
  const exId = toStr(exerciseId).trim();
  if (!fam || !exId || !state?.blockSticky) return;

  const stickyKey = makeBlockFamilyKey(dayIndex, blockKey, fam);
  state.blockSticky.set(stickyKey, exId);
  if (state?.blockStickyMeta) {
    state.blockStickyMeta.set(stickyKey, metadata ?? null);
  }

  if (!state?.blockHistory) return;
  const cn = toStr(canonicalName).trim();
  if (!cn) return;

  let seen = state.blockHistory.get(fam);
  if (!seen) {
    seen = new Set();
    state.blockHistory.set(fam, seen);
  }
  seen.add(cn);
}

export function getMedAvoidCanonicalNames(state, family) {
  const fam = toStr(family).trim();
  if (!fam) return new Set();
  const seen = state?.blockHistory?.get(fam);
  if (!seen || !(seen instanceof Set) || seen.size === 0) return new Set();
  return new Set(seen);
}
