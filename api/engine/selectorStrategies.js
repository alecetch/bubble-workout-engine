import { pickWithFallback } from "./exerciseSelector.js";

function bestMatchByMovement(slotDef, catalogIndex, state) {
  const compiledConfig = state?.compiledConfig ?? null;
  const isConditioning = compiledConfig?.programType === "conditioning";
  const sel = {
    mp: slotDef.mp || null,
    sw: slotDef.sw || null,
    swAny: slotDef.swAny || null,
    sw2: slotDef.sw2 || null,
    requirePref: slotDef.requirePref || null,
    preferLoadable: !!slotDef.preferLoadable,
    preferIsolation: !isConditioning && slotDef.slot?.[0] === "C",
    preferCompound: !isConditioning && slotDef.slot?.[0] === "A",
    programType: compiledConfig?.programType ?? null,
    rankValue: state?.rankValue ?? 0,
    condState: state?.conditioning ?? null,
    condThresholds: compiledConfig?.builder?.conditioningThresholds ?? {},
  };

  return pickWithFallback(
    catalogIndex.allowedSet,
    catalogIndex.byId,
    sel,
    state.usedIdsWeek,
    state.stats,
    state.usedSw2Today,
    state.usedRegionsToday,
  );
}

const strategies = {
  best_match_by_movement: bestMatchByMovement,
};

export function resolveStrategy(name) {
  const key = (name || "best_match_by_movement").trim();
  const strategy = strategies[key];
  if (!strategy) {
    throw new Error(`Unknown selector strategy: ${key}`);
  }
  return strategy;
}

export function fillSlot(slotDef, catalogIndex, state) {
  const strategy = resolveStrategy(slotDef?.selector_strategy || "best_match_by_movement");
  return strategy(slotDef, catalogIndex, state);
}
