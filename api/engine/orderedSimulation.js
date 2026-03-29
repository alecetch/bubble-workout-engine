function toStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    const parsed = safeJsonParse(text, null);
    if (Array.isArray(parsed)) return parsed;
    if (text.includes(",")) return text.split(",").map((item) => item.trim()).filter(Boolean);
    return [text];
  }
  return [];
}

function normalizeStationIndex(value) {
  const parsed = Number.parseInt(toStr(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSimulationSlotFields(raw) {
  const slot = raw && typeof raw === "object" ? raw : {};
  return {
    ...slot,
    requireHyroxRole: toStr(slot.requireHyroxRole || slot.require_hyrox_role || "").trim() || null,
    station_index: normalizeStationIndex(slot.station_index ?? slot.hyrox_station_index),
    required_equipment_slugs:
      slot.required_equipment_slugs != null
        ? normalizeArr(slot.required_equipment_slugs).map((item) => toStr(item).trim()).filter(Boolean)
        : null,
    station_fallback_chain: Array.isArray(slot.station_fallback_chain)
      ? slot.station_fallback_chain.map((entry) => normalizeSimulationSlotFields(entry))
      : null,
  };
}

export function buildSimulationAttemptChain(slotDef) {
  const normalized = normalizeSimulationSlotFields({ ...(slotDef || {}), station_fallback_chain: null });
  const rawChain = Array.isArray(slotDef?.station_fallback_chain) ? slotDef.station_fallback_chain : [];
  const chain = rawChain.map((entry) => normalizeSimulationSlotFields(entry));
  if (chain.length === 0) {
    return [normalized];
  }

  return chain.map((entry, index) => {
    const rawEntry = rawChain[index] && typeof rawChain[index] === "object" ? rawChain[index] : {};
    const hasRole =
      Object.prototype.hasOwnProperty.call(rawEntry, "requireHyroxRole") ||
      Object.prototype.hasOwnProperty.call(rawEntry, "require_hyrox_role");
    const hasStation =
      Object.prototype.hasOwnProperty.call(rawEntry, "station_index") ||
      Object.prototype.hasOwnProperty.call(rawEntry, "hyrox_station_index");
    const hasEquipment = Object.prototype.hasOwnProperty.call(rawEntry, "required_equipment_slugs");

    return {
      ...normalized,
      ...entry,
      requireHyroxRole: hasRole ? entry.requireHyroxRole : null,
      station_index: hasStation ? entry.station_index : null,
      required_equipment_slugs: hasEquipment ? entry.required_equipment_slugs : null,
      station_fallback_chain: null,
    };
  });
}

export function classifySimulationResolution(chainIndex) {
  if (chainIndex === 0) return "exact";
  if (chainIndex === 1) return "family";
  return "fallback";
}

export function matchesSimulationFilters(exercise, slotDef) {
  if (!exercise || !slotDef) return false;

  const requiredRole = toStr(slotDef.requireHyroxRole).trim();
  if (requiredRole) {
    const exerciseRole = toStr(exercise.hyrox_role).trim();
    if (!exerciseRole || exerciseRole !== requiredRole) return false;
  }

  const requiredStationIndex = normalizeStationIndex(slotDef.station_index);
  if (requiredStationIndex !== null) {
    const exerciseStationIndex = normalizeStationIndex(exercise.hyrox_station_index);
    if (exerciseStationIndex !== requiredStationIndex) return false;
  }

  const requiredEquipment = Array.isArray(slotDef.required_equipment_slugs)
    ? slotDef.required_equipment_slugs
    : normalizeArr(slotDef.required_equipment_slugs);
  if (requiredEquipment.length > 0) {
    const equipmentSet = new Set((Array.isArray(exercise.eq) ? exercise.eq : []).map((item) => toStr(item).trim()));
    for (const slug of requiredEquipment) {
      const normalizedSlug = toStr(slug).trim();
      if (normalizedSlug && !equipmentSet.has(normalizedSlug)) return false;
    }
  }

  return true;
}
