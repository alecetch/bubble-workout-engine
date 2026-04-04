function toStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function s(v) {
  return toStr(v).trim();
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCmp(v) {
  return s(v).toLowerCase().replace(/-/g, "_");
}

function safeJsonParseMaybe(value, fallback) {
  try {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return value;
    const t = String(value).trim();
    if (!t) return fallback;
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

export function toArrayMaybe(v) {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.map((x) => normalizeCmp(x)).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    if (t[0] === "[") {
      const a = safeJsonParseMaybe(t, []);
      return Array.isArray(a) ? a.map((x) => normalizeCmp(x)).filter(Boolean) : [];
    }
    return t.split(",").map((x) => normalizeCmp(x)).filter(Boolean);
  }
  return [];
}

function hasOverlap(arrA, arrB) {
  const setB = new Set((arrB || []).map((x) => normalizeCmp(x)).filter(Boolean));
  for (const a of arrA || []) {
    const aa = normalizeCmp(a);
    if (aa && setB.has(aa)) return true;
  }
  return false;
}

export function getExField(ex, shortKey, longKey) {
  if (!ex) return "";
  const v1 = ex[shortKey];
  if (v1 !== undefined && v1 !== null && v1 !== "") return v1;
  const v2 = ex[longKey];
  if (v2 !== undefined && v2 !== null && v2 !== "") return v2;
  return "";
}

export function buildCatalogIndex(cat) {
  const byId = Object.create(null);
  if (!cat || !Array.isArray(cat.ex)) return byId;
  for (const ex of cat.ex) {
    if (ex && ex.id) byId[String(ex.id)] = ex;
  }
  return byId;
}

export function deriveEquipmentSlug(ex) {
  const direct =
    s(getExField(ex, "equipment_slug", "equipment_slug")) ||
    s(getExField(ex, "equipmentSlug", "equipmentSlug"));
  if (direct) return normalizeCmp(direct);

  const eq = getExField(ex, "eq", "equipment_json");
  const arr = toArrayMaybe(eq);
  return arr.length ? arr[0] : "";
}

export function normalizeRule(rawRule) {
  return {
    ...rawRule,
    rule_id: s(rawRule.rule_id),
    program_type: normalizeCmp(rawRule.program_type),
    day_type: normalizeCmp(rawRule.day_type),
    segment_type: normalizeCmp(rawRule.segment_type),
    purpose: normalizeCmp(rawRule.purpose),
    movement_pattern: normalizeCmp(rawRule.movement_pattern),
    swap_group_id_1: normalizeCmp(rawRule.swap_group_id_1),
    swap_group_id_2: normalizeCmp(rawRule.swap_group_id_2),
    movement_class: normalizeCmp(rawRule.movement_class),
    equipment_slug: normalizeCmp(rawRule.equipment_slug),
    target_regions_json_arr: toArrayMaybe(rawRule.target_regions_json),
    time_equivalent_low_sec: rawRule.time_equivalent_low_sec ?? null,
    time_equivalent_high_sec: rawRule.time_equivalent_high_sec ?? null,
    priority_num: toInt(rawRule.priority, 0),
    schema_version_num:
      rawRule.schema_version === undefined || rawRule.schema_version === null || s(rawRule.schema_version) === ""
        ? null
        : toInt(rawRule.schema_version, 0),
  };
}

export function specificityScore(rule) {
  let sc = 0;
  if (rule.schema_version_num !== null) sc += 1;
  if (rule.day_type) sc += 1;
  if (rule.segment_type) sc += 1;
  if (rule.purpose) sc += 1;
  if (rule.movement_pattern) sc += 1;
  if (rule.swap_group_id_1) sc += 1;
  if (rule.swap_group_id_2) sc += 1;
  if (rule.movement_class) sc += 1;
  if (rule.equipment_slug) sc += 1;
  if (rule.target_regions_json_arr.length > 0) sc += 1;
  return sc;
}

export function ruleMatches(rule, ctx) {
  if (!rule.program_type || rule.program_type !== ctx.program_type) return false;
  if (rule.schema_version_num !== null && rule.schema_version_num !== ctx.schema_version) return false;
  if (rule.day_type && rule.day_type !== ctx.day_type) return false;
  if (rule.segment_type && rule.segment_type !== ctx.segment_type) return false;
  if (rule.purpose && rule.purpose !== ctx.purpose) return false;
  if (rule.movement_pattern && rule.movement_pattern !== ctx.movement_pattern) return false;
  if (rule.swap_group_id_1 && rule.swap_group_id_1 !== ctx.swap_group_id_1) return false;
  if (rule.swap_group_id_2 && rule.swap_group_id_2 !== ctx.swap_group_id_2) return false;
  if (rule.movement_class && rule.movement_class !== ctx.movement_class) return false;
  if (rule.equipment_slug && rule.equipment_slug !== ctx.equipment_slug) return false;

  if (rule.target_regions_json_arr.length > 0) {
    if (!ctx.target_regions.length) return false;
    if (!hasOverlap(rule.target_regions_json_arr, ctx.target_regions)) return false;
  }

  return true;
}

export function pickBestRule(rules, ctx) {
  let best = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, ctx)) continue;
    const cand = {
      rule,
      priority: rule.priority_num,
      specificity: specificityScore(rule),
      ruleId: rule.rule_id,
    };
    if (!best) {
      best = cand;
      continue;
    }
    if (cand.priority > best.priority) {
      best = cand;
      continue;
    }
    if (cand.priority < best.priority) continue;
    if (cand.specificity > best.specificity) {
      best = cand;
      continue;
    }
    if (cand.specificity < best.specificity) continue;
    if (cand.ruleId < best.ruleId) best = cand;
  }
  return best ? best.rule : null;
}

export function makeItemContext({ programType, schemaVersion, dayType, purpose, segType, ex }) {
  const mp = normalizeCmp(getExField(ex, "mp", "movement_pattern"));
  const sw = normalizeCmp(getExField(ex, "sw", "swap_group_id_1"));
  const sw2 = normalizeCmp(getExField(ex, "sw2", "swap_group_id_2"));
  const mc = normalizeCmp(getExField(ex, "mc", "movement_class"));
  const tr = toArrayMaybe(getExField(ex, "tr", "target_regions_json"));
  const eq = deriveEquipmentSlug(ex);

  return {
    program_type: normalizeCmp(programType),
    schema_version: schemaVersion,
    day_type: normalizeCmp(dayType),
    segment_type: normalizeCmp(segType),
    purpose: normalizeCmp(purpose),
    movement_pattern: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    movement_class: mc,
    equipment_slug: eq,
    target_regions: tr,
  };
}

export function buildFallbackItemContext(ctx) {
  return {
    ...ctx,
    movement_pattern: "",
    swap_group_id_1: "",
    swap_group_id_2: "",
    movement_class: "",
    equipment_slug: "",
    target_regions: [],
  };
}

export function pickBestRuleWithFallback(rules, ctx) {
  const directRule = pickBestRule(rules, ctx);
  if (directRule) {
    return { rule: directRule, viaFallback: false };
  }
  const fallbackRule = pickBestRule(rules, buildFallbackItemContext(ctx));
  if (fallbackRule) {
    return { rule: fallbackRule, viaFallback: true };
  }
  return { rule: null, viaFallback: false };
}
