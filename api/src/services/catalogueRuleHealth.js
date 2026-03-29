import {
  makeItemContext,
  normalizeRule,
  pickBestRuleWithFallback,
  specificityScore,
} from "../../engine/repRuleMatcher.js";

const PRESETS = [
  { code: "no_equipment", label: "No Equipment", column: "no_equipment" },
  { code: "minimal_equipment", label: "Minimal Equipment", column: "minimal_equipment" },
  { code: "decent_home_gym", label: "Decent Home Gym", column: "decent_home_gym" },
  { code: "commercial_gym", label: "Commercial Gym", column: "commercial_gym" },
  { code: "crossfit_hyrox_gym", label: "CrossFit / HYROX Gym", column: "crossfit_hyrox_gym" },
];

const RANKS = [
  { value: 0, label: "Beginner" },
  { value: 1, label: "Intermediate" },
  { value: 2, label: "Advanced" },
  { value: 3, label: "Elite" },
];

const DEFAULT_EXCLUDED_MOVEMENT_CLASSES = ["cardio", "conditioning", "locomotion"];

function toStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function safeString(v) {
  return toStr(v).trim();
}

function normalizeCmp(v) {
  return safeString(v).toLowerCase().replace(/-/g, "_");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function asTextArray(value) {
  if (Array.isArray(value)) return value.map((x) => safeString(x)).filter(Boolean);
  if (typeof value !== "string") return [];
  const t = value.trim();
  if (!t) return [];
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed.map((x) => safeString(x)).filter(Boolean) : [];
  } catch {
    return t.split(",").map((x) => safeString(x)).filter(Boolean);
  }
}

function flagIsTrue(value) {
  if (typeof value === "boolean") return value === true;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function deriveEquipmentProfile(slugs) {
  const set = new Set(asTextArray(slugs));
  const fullMarkers = ["barbell", "trap_bar", "hack_squat", "leg_press", "cable"];
  const minimalMarkers = ["dumbbells", "kettlebells", "sandbag", "rings"];
  if (fullMarkers.some((marker) => set.has(marker))) return "full";
  if (minimalMarkers.some((marker) => set.has(marker))) return "minimal";
  return "bodyweight";
}

function resolveSlotVariant(slot, equipmentProfile) {
  const variants = asArray(slot?.variants);
  if (variants.length === 0) return slot;
  const match = variants.find((variant) => asObject(variant?.when).equipment_profile === equipmentProfile);
  if (!match) return slot;
  const { when, ...variantFields } = asObject(match);
  return { ...slot, ...variantFields, slot: safeString(slot?.slot) };
}

function preferredTags(ex) {
  return asTextArray(ex?.preferred_in_json);
}

function summarizeResolvedSlot(slot, equipmentProfile) {
  return {
    sw: safeString(slot?.sw) || null,
    sw2: safeString(slot?.sw2) || null,
    swAny: asArray(slot?.swAny).map((v) => safeString(v)).filter(Boolean),
    sw2Any: asArray(slot?.sw2Any).map((v) => safeString(v)).filter(Boolean),
    mp: safeString(slot?.mp) || null,
    requirePref: safeString(slot?.requirePref) || null,
    pref_mode: safeString(slot?.pref_mode) || "soft",
    pref_bonus: Number.isFinite(Number(slot?.pref_bonus)) ? Number(slot.pref_bonus) : null,
    equipment_profile: equipmentProfile,
  };
}

function applySlotDefaults(slot, slotDefaults) {
  const blockLetter = safeString(slot?.slot)[0];
  const defaults = asObject(slotDefaults?.[blockLetter]);
  return { ...defaults, ...slot };
}

function normalizeSlotDefinition(rawSlot) {
  if (typeof rawSlot === "string") {
    return {
      slot: rawSlot,
      sw: null,
      sw2: null,
      swAny: null,
      sw2Any: null,
      mp: null,
      requirePref: null,
      pref_mode: "soft",
      pref_bonus: 4,
      variants: null,
    };
  }
  const slot = asObject(rawSlot);
  return {
    ...slot,
    slot: safeString(slot.slot),
    swAny: slot.swAny != null ? asTextArray(slot.swAny) : null,
    sw2Any: slot.sw2Any != null ? asTextArray(slot.sw2Any) : null,
    pref_mode: safeString(slot.pref_mode) === "strict" ? "strict" : "soft",
    pref_bonus: Number.isFinite(Number(slot.pref_bonus)) ? Number(slot.pref_bonus) : 4,
  };
}

function slotStructurallyMatchesExercise(ex, slot, options = {}) {
  const excludedMovementClassesSet = options.excludedMovementClassesSet ?? new Set();
  const presetSlugsSet = options.presetSlugsSet ?? null;
  const rankValue = Number.isFinite(Number(options.rankValue)) ? Number(options.rankValue) : null;

  if (ex?.is_archived) return false;
  const movementClass = safeString(ex?.movement_class || ex?.mc).toLowerCase();
  if (movementClass && excludedMovementClassesSet.has(movementClass)) return false;

  const minRank = Number(ex?.min_fitness_rank ?? ex?.rank ?? 0);
  if (rankValue !== null && minRank > rankValue) return false;

  if (presetSlugsSet) {
    const eqSlugs = asTextArray(ex?.equipment_items_slugs ?? ex?.equipment_items_slugs_csv ?? ex?.eq ?? []);
    if (!eqSlugs.every((slug) => presetSlugsSet.has(slug))) return false;
  }

  const sw = safeString(slot?.sw);
  const sw2 = safeString(slot?.sw2);
  const swAny = asTextArray(slot?.swAny);
  const sw2Any = asTextArray(slot?.sw2Any);
  const mp = safeString(slot?.mp);
  const unconstrained = !sw && !sw2 && swAny.length === 0 && sw2Any.length === 0 && !mp;

  if (!unconstrained) {
    const matches =
      (sw && safeString(ex?.swap_group_id_1 || ex?.sw) === sw) ||
      (sw2 && safeString(ex?.swap_group_id_2 || ex?.sw2) === sw2) ||
      (swAny.length > 0 && swAny.includes(safeString(ex?.swap_group_id_1 || ex?.sw))) ||
      (sw2Any.length > 0 && sw2Any.includes(safeString(ex?.swap_group_id_2 || ex?.sw2))) ||
      (mp && safeString(ex?.movement_pattern_primary || ex?.mp) === mp);
    if (!matches) return false;
  }

  const requirePref = safeString(slot?.requirePref);
  const prefMode = safeString(slot?.pref_mode) === "strict" ? "strict" : "soft";
  if (requirePref && prefMode === "strict" && !preferredTags(ex).includes(requirePref)) {
    return false;
  }

  return true;
}

function classifySeverityFromCount(count) {
  if (count <= 0) return "critical";
  if (count === 1) return "warning";
  return "ok";
}

function severityWeight(severity) {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function maxSeverity(a, b) {
  return severityWeight(a) >= severityWeight(b) ? a : b;
}

function isWeakFallbackMatch(match) {
  if (!match?.rule) return true;
  if (match.viaFallback) return true;
  return Number(match.rule.priority_num ?? 0) <= 1;
}

function collectRequirePrefs(configRows) {
  const prefRefs = new Map();

  function addPref(pref, detail) {
    const tag = safeString(pref);
    if (!tag) return;
    let current = prefRefs.get(tag);
    if (!current) {
      current = {
        pref_tag: tag,
        strict_refs: 0,
        soft_refs: 0,
        referenced_by: [],
      };
      prefRefs.set(tag, current);
    }
    if (detail.pref_mode === "strict") current.strict_refs += 1;
    else current.soft_refs += 1;
    current.referenced_by.push(detail);
  }

  for (const cfg of configRows) {
    const json = asJsonObject(cfg.program_generation_config_json);
    const builder = asObject(json.builder);
    const slotDefaults = asObject(builder.slot_defaults);
    for (const [blockKey, defaults] of Object.entries(slotDefaults)) {
      const pref = safeString(defaults?.requirePref);
      if (pref) {
        addPref(pref, {
          config_key: cfg.config_key,
          program_type: cfg.program_type,
          slot: `${blockKey}:*`,
          source: "slot_default",
          pref_mode: safeString(defaults?.pref_mode) === "strict" ? "strict" : "soft",
        });
      }
    }

    const dayTemplates = asArray(builder.day_templates);
    for (let i = 0; i < dayTemplates.length; i++) {
      const day = asObject(dayTemplates[i]);
      const orderedSlots = asArray(day.ordered_slots);
      for (const rawSlot of orderedSlots) {
        const slot = asObject(rawSlot);
        const pref = safeString(slot.requirePref);
        if (pref) {
          addPref(pref, {
            config_key: cfg.config_key,
            program_type: cfg.program_type,
            slot: safeString(slot.slot),
            source: "slot",
            pref_mode: safeString(slot.pref_mode) === "strict" ? "strict" : "soft",
          });
        }
        for (const variant of asArray(slot.variants)) {
          const variantObj = asObject(variant);
          const variantPref = safeString(variantObj.requirePref);
          if (variantPref) {
            addPref(variantPref, {
              config_key: cfg.config_key,
              program_type: cfg.program_type,
              slot: safeString(slot.slot),
              source: "variant",
              pref_mode: safeString(variantObj.pref_mode || slot.pref_mode) === "strict" ? "strict" : "soft",
            });
          }
        }
      }
    }
  }

  return Array.from(prefRefs.values()).sort((a, b) => a.pref_tag.localeCompare(b.pref_tag));
}

function buildSlotContexts(configRows) {
  const slotContexts = [];

  for (const cfg of configRows) {
    const json = asJsonObject(cfg.program_generation_config_json);
    const builder = asObject(json.builder);
    const segmentation = asObject(json.segmentation);
    const blockSemantics = asObject(segmentation.block_semantics);
    const slotDefaults = asObject(builder.slot_defaults);
    const excludedClasses = asTextArray(builder.exclude_movement_classes);
    const effectiveExcludedClasses =
      excludedClasses.length > 0
        ? excludedClasses
        : (builder.exclude_movement_classes ? [] : DEFAULT_EXCLUDED_MOVEMENT_CLASSES);
    const excludedClassesSet = new Set(effectiveExcludedClasses.map((x) => safeString(x).toLowerCase()));

    const dayTemplates = asArray(builder.day_templates);
    for (let dayIndex = 0; dayIndex < dayTemplates.length; dayIndex++) {
      const day = asObject(dayTemplates[dayIndex]);
      const orderedSlots = asArray(day.ordered_slots);
      const dayKey = safeString(day.day_key) || `day${dayIndex + 1}`;
      const dayType = safeString(day.day_type) || safeString(cfg.program_type);
      for (const rawSlot of orderedSlots) {
        const normalized = normalizeSlotDefinition(rawSlot);
        const slot = applySlotDefaults(normalized, slotDefaults);
        const blockLetter = safeString(slot.slot).split(":")[0];
        const blockSemantic = asObject(blockSemantics[blockLetter]);
        slotContexts.push({
          config_key: cfg.config_key,
          program_type: safeString(cfg.program_type),
          day_key: dayKey,
          day_type: dayType,
          day_index: dayIndex + 1,
          slot: safeString(slot.slot),
          slot_selector: slot,
          purpose: safeString(blockSemantic.purpose) || "",
          segment_type: safeString(blockSemantic.preferred_segment_type) || "single",
          excluded_classes: effectiveExcludedClasses,
          excludedClassesSet,
        });
      }
    }
  }

  return slotContexts;
}

function buildPresets(equipmentItems) {
  const presetSlugsByCode = new Map(PRESETS.map((preset) => [preset.code, []]));
  for (const row of equipmentItems) {
    const slug = safeString(row.exercise_slug);
    if (!slug) continue;
    for (const preset of PRESETS) {
      if (flagIsTrue(row[preset.column])) {
        presetSlugsByCode.get(preset.code).push(slug);
      }
    }
  }

  return PRESETS.map((preset) => {
    const equipmentSlugs = Array.from(new Set(presetSlugsByCode.get(preset.code) ?? [])).sort();
    return {
      code: preset.code,
      label: preset.label,
      equipment_slugs: equipmentSlugs,
      equipment_profile: deriveEquipmentProfile(equipmentSlugs),
    };
  });
}

function buildRuleCoverage(exercises, rulesByProgramType, slotContexts) {
  const rows = [];
  const uncovered = [];

  const contextsByProgramType = new Map();
  for (const context of slotContexts) {
    const key = safeString(context.program_type);
    if (!contextsByProgramType.has(key)) contextsByProgramType.set(key, []);
    contextsByProgramType.get(key).push(context);
  }

  for (const ex of exercises) {
    if (ex.is_archived) continue;
    for (const [programType, contexts] of contextsByProgramType.entries()) {
      const plausibleContexts = contexts.filter((ctx) =>
        slotStructurallyMatchesExercise(ex, ctx.slot_selector, {
          excludedMovementClassesSet: ctx.excludedClassesSet,
        }),
      );

      if (plausibleContexts.length === 0) continue;

      let bestMatch = null;
      let fallbackOnly = true;
      let missingRuleCount = 0;
      for (const ctx of plausibleContexts) {
        const match = pickBestRuleWithFallback(
          rulesByProgramType.get(programType) ?? [],
          makeItemContext({
            programType,
            schemaVersion: 1,
            dayType: ctx.day_type,
            purpose: ctx.purpose,
            segType: ctx.segment_type,
            ex,
          }),
        );

        if (!match.rule) {
          missingRuleCount += 1;
          continue;
        }

        if (!isWeakFallbackMatch(match)) fallbackOnly = false;

        const candidate = {
          ...match,
          priority: Number(match.rule.priority_num ?? 0),
          specificity: specificityScore(match.rule),
          sample_context: {
            config_key: ctx.config_key,
            day_key: ctx.day_key,
            day_type: ctx.day_type,
            slot: ctx.slot,
            purpose: ctx.purpose,
            segment_type: ctx.segment_type,
          },
        };

        if (!bestMatch) {
          bestMatch = candidate;
          continue;
        }
        if (candidate.priority > bestMatch.priority) {
          bestMatch = candidate;
          continue;
        }
        if (candidate.priority < bestMatch.priority) continue;
        if (candidate.specificity > bestMatch.specificity) {
          bestMatch = candidate;
          continue;
        }
        if (candidate.specificity < bestMatch.specificity) continue;
        if (safeString(candidate.rule.rule_id) < safeString(bestMatch.rule.rule_id)) {
          bestMatch = candidate;
        }
      }

      const row = {
        exercise_id: ex.exercise_id,
        name: ex.name,
        program_type: programType,
        matched_rule_id: bestMatch?.rule?.rule_id ?? null,
        matched_rule_priority: bestMatch?.priority ?? null,
        matched_rule_specificity: bestMatch?.specificity ?? null,
        sample_context: bestMatch?.sample_context ?? null,
        plausible_slot_count: plausibleContexts.length,
        missing_rule_count: missingRuleCount,
        is_fallback_only: fallbackOnly,
        severity: fallbackOnly ? "warning" : "ok",
      };
      rows.push(row);

      if (fallbackOnly) {
        uncovered.push({
          exercise_id: ex.exercise_id,
          name: ex.name,
          program_type: programType,
          plausible_slot_count: plausibleContexts.length,
          matched_rule_id: row.matched_rule_id,
          matched_rule_priority: row.matched_rule_priority,
          sample_context: row.sample_context,
          severity: "warning",
          reason:
            row.matched_rule_id
              ? "Only weak fallback/default-style rep rules matched for plausible slot contexts"
              : "No rep rule matched plausible slot contexts",
        });
      }
    }
  }

  rows.sort((a, b) =>
    a.program_type.localeCompare(b.program_type) ||
    a.name.localeCompare(b.name) ||
    a.exercise_id.localeCompare(b.exercise_id),
  );
  uncovered.sort((a, b) =>
    a.program_type.localeCompare(b.program_type) ||
    a.name.localeCompare(b.name) ||
    a.exercise_id.localeCompare(b.exercise_id),
  );

  return { rows, uncovered };
}

function buildOrphanedRules(rules, exercises) {
  const swapGroupSet = new Set(exercises.map((ex) => normalizeCmp(ex.swap_group_id_2 || ex.sw2)).filter(Boolean));
  const movementPatternSet = new Set(
    exercises.map((ex) => normalizeCmp(ex.movement_pattern_primary || ex.mp)).filter(Boolean),
  );
  const equipmentSlugSet = new Set();
  for (const ex of exercises) {
    for (const slug of asTextArray(ex.equipment_items_slugs ?? ex.eq ?? [])) {
      equipmentSlugSet.add(normalizeCmp(slug));
    }
  }

  const rows = [];
  for (const rule of rules) {
    const orphanedDimensions = [];
    if (rule.swap_group_id_2 && !swapGroupSet.has(rule.swap_group_id_2)) {
      orphanedDimensions.push({ field: "swap_group_id_2", value: rule.swap_group_id_2, severity: "warning" });
    }
    if (rule.movement_pattern && !movementPatternSet.has(rule.movement_pattern)) {
      orphanedDimensions.push({ field: "movement_pattern", value: rule.movement_pattern, severity: "warning" });
    }
    if (rule.equipment_slug && !equipmentSlugSet.has(rule.equipment_slug)) {
      orphanedDimensions.push({ field: "equipment_slug", value: rule.equipment_slug, severity: "info" });
    }
    if (orphanedDimensions.length === 0) continue;

    let severity = "info";
    for (const dim of orphanedDimensions) {
      severity = maxSeverity(severity, dim.severity);
    }

    rows.push({
      rule_id: rule.rule_id,
      program_type: rule.program_type,
      priority: rule.priority_num,
      orphaned_dimensions: orphanedDimensions,
      severity,
    });
  }

  rows.sort((a, b) =>
    severityWeight(b.severity) - severityWeight(a.severity) ||
    a.program_type.localeCompare(b.program_type) ||
    a.rule_id.localeCompare(b.rule_id),
  );

  return rows;
}

function buildOrphanedPrefs(prefRefs, exercises) {
  const carriedPrefs = new Set();
  for (const ex of exercises) {
    if (ex.is_archived) continue;
    for (const pref of preferredTags(ex)) carriedPrefs.add(pref);
  }

  const rows = [];
  for (const pref of prefRefs) {
    if (carriedPrefs.has(pref.pref_tag)) continue;
    rows.push({
      pref_tag: pref.pref_tag,
      strict_refs: pref.strict_refs,
      soft_refs: pref.soft_refs,
      referenced_by: pref.referenced_by,
      severity: pref.strict_refs > 0 ? "critical" : "warning",
    });
  }

  rows.sort((a, b) =>
    severityWeight(b.severity) - severityWeight(a.severity) ||
    a.pref_tag.localeCompare(b.pref_tag),
  );

  return rows;
}

function buildSlotCoverage(exercises, presets, slotContexts) {
  const rows = [];

  for (const ctx of slotContexts) {
    for (const preset of presets) {
      const resolvedSlot = resolveSlotVariant(ctx.slot_selector, preset.equipment_profile);
      const presetSlugsSet = new Set(preset.equipment_slugs);
      for (const rank of RANKS) {
        const count = exercises.filter((ex) =>
          slotStructurallyMatchesExercise(ex, resolvedSlot, {
            rankValue: rank.value,
            presetSlugsSet,
            excludedMovementClassesSet: ctx.excludedClassesSet,
          }),
        ).length;

        rows.push({
          config_key: ctx.config_key,
          program_type: ctx.program_type,
          day_key: ctx.day_key,
          day_type: ctx.day_type,
          slot: ctx.slot,
          preset: preset.code,
          preset_label: preset.label,
          rank: rank.value,
          rank_label: rank.label,
          count,
          severity: classifySeverityFromCount(count),
          resolved_selector: summarizeResolvedSlot(resolvedSlot, preset.equipment_profile),
        });
      }
    }
  }

  rows.sort((a, b) =>
    severityWeight(b.severity) - severityWeight(a.severity) ||
    a.program_type.localeCompare(b.program_type) ||
    a.config_key.localeCompare(b.config_key) ||
    a.day_key.localeCompare(b.day_key) ||
    a.slot.localeCompare(b.slot) ||
    a.preset.localeCompare(b.preset) ||
    a.rank - b.rank,
  );

  return rows;
}

function summarizeSection(rows) {
  const summary = { total: rows.length, critical: 0, warning: 0, info: 0 };
  for (const row of rows) {
    if (row.severity === "critical") summary.critical += 1;
    else if (row.severity === "warning") summary.warning += 1;
    else if (row.severity === "info") summary.info += 1;
  }
  return summary;
}

export function buildCatalogueRuleHealthReport({
  exercises = [],
  repRules = [],
  configRows = [],
  equipmentItems = [],
} = {}) {
  const activeExercises = exercises.filter((ex) => ex && ex.is_archived !== true);
  const normalizedRules = repRules
    .filter((rule) => rule && safeString(rule.rule_id))
    .map(normalizeRule)
    .filter((rule) => rule.is_active !== false);
  const rulesByProgramType = new Map();
  for (const rule of normalizedRules) {
    if (!rulesByProgramType.has(rule.program_type)) rulesByProgramType.set(rule.program_type, []);
    rulesByProgramType.get(rule.program_type).push(rule);
  }

  const presets = buildPresets(equipmentItems);
  const slotContexts = buildSlotContexts(configRows);
  const prefRefs = collectRequirePrefs(configRows);

  const ruleCoverage = buildRuleCoverage(activeExercises, rulesByProgramType, slotContexts);
  const orphanedRules = buildOrphanedRules(normalizedRules, activeExercises);
  const orphanedPrefs = buildOrphanedPrefs(prefRefs, activeExercises);
  const slotCoverageRows = buildSlotCoverage(activeExercises, presets, slotContexts);

  const slotCoverage = {
    rows: slotCoverageRows,
    summary: summarizeSection(slotCoverageRows.filter((row) => row.severity !== "ok")),
  };

  const ruleCoverageSection = {
    rows: ruleCoverage.rows,
    summary: {
      total: ruleCoverage.rows.length,
      fallback_only: ruleCoverage.rows.filter((row) => row.is_fallback_only).length,
      ok: ruleCoverage.rows.filter((row) => !row.is_fallback_only).length,
    },
  };

  const orphanedRulesSection = {
    rows: orphanedRules,
    summary: summarizeSection(orphanedRules),
  };

  const orphanedPrefsSection = {
    rows: orphanedPrefs,
    summary: summarizeSection(orphanedPrefs),
  };

  const uncoveredExercisesSection = {
    rows: ruleCoverage.uncovered,
    summary: summarizeSection(ruleCoverage.uncovered),
  };

  const summary = {
    critical:
      orphanedPrefsSection.summary.critical +
      slotCoverage.summary.critical +
      uncoveredExercisesSection.summary.critical +
      orphanedRulesSection.summary.critical,
    warning:
      orphanedPrefsSection.summary.warning +
      slotCoverage.summary.warning +
      uncoveredExercisesSection.summary.warning +
      orphanedRulesSection.summary.warning,
    info:
      orphanedPrefsSection.summary.info +
      slotCoverage.summary.info +
      uncoveredExercisesSection.summary.info +
      orphanedRulesSection.summary.info,
    active_exercises: activeExercises.length,
    active_rules: normalizedRules.length,
    active_configs: configRows.length,
    slot_contexts: slotContexts.length,
  };

  return {
    summary,
    presets,
    ranks: RANKS,
    rule_coverage: ruleCoverageSection,
    orphaned_rules: orphanedRulesSection,
    orphaned_prefs: orphanedPrefsSection,
    uncovered_exercises: uncoveredExercisesSection,
    slot_coverage: slotCoverage,
  };
}

export async function fetchCatalogueRuleHealthReport(db) {
  if (!db || typeof db.query !== "function") {
    throw new Error("fetchCatalogueRuleHealthReport: db with query() is required");
  }

  const [exerciseResult, ruleResult, configResult, equipmentResult] = await Promise.all([
    db.query(`
      SELECT
        exercise_id,
        name,
        movement_class,
        movement_pattern_primary,
        swap_group_id_1,
        swap_group_id_2,
        min_fitness_rank,
        is_archived,
        preferred_in_json,
        equipment_items_slugs
      FROM exercise_catalogue
      ORDER BY name ASC, exercise_id ASC
    `),
    db.query(`
      SELECT
        rule_id,
        is_active,
        priority,
        program_type,
        day_type,
        segment_type,
        purpose,
        movement_pattern,
        swap_group_id_2,
        equipment_slug,
        schema_version
      FROM program_rep_rule
      WHERE is_active = TRUE
      ORDER BY program_type ASC, priority DESC NULLS LAST, rule_id ASC
    `),
    db.query(`
      SELECT
        config_key,
        program_type,
        program_generation_config_json
      FROM program_generation_config
      WHERE is_active = TRUE
      ORDER BY program_type ASC, config_key ASC
    `),
    db.query(`
      SELECT
        exercise_slug,
        no_equipment,
        minimal_equipment,
        decent_home_gym,
        commercial_gym,
        crossfit_hyrox_gym
      FROM equipment_items
      ORDER BY exercise_slug ASC
    `),
  ]);

  return buildCatalogueRuleHealthReport({
    exercises: exerciseResult.rows ?? [],
    repRules: ruleResult.rows ?? [],
    configRows: configResult.rows ?? [],
    equipmentItems: equipmentResult.rows ?? [],
  });
}
