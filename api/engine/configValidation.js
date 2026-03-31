export class ConfigValidationError extends Error {
  constructor(details) {
    super("Compiled config validation failed");
    this.name = "ConfigValidationError";
    this.code = "config_validation_error";
    this.details = Array.isArray(details) ? details : [];
  }
}

export function validateCompiledConfig(config) {
  const details = [];
  const knownStrategies = new Set(["best_match_by_movement"]);
  const knownVariabilityPolicies = new Set(["none", "med", "high"]);
  const knownDaySelectionModes = new Set(["default", "benchmark_exactness"]);
  const slugPattern = /^[a-z][a-z0-9_]*$/;

  function isValidSimulationEntry(entry) {
    return entry && typeof entry === "object" && !Array.isArray(entry);
  }

  if (!config || typeof config !== "object") {
    details.push("config must be an object");
  }

  if (!config?.programType || typeof config.programType !== "string" || !config.programType.trim()) {
    details.push("programType must be a non-empty string");
  }

  if (!Number.isFinite(config?.schemaVersion) || Number(config.schemaVersion) <= 0) {
    details.push("schemaVersion must be a positive finite number");
  }

  const builder = config?.builder;
  if (!builder || typeof builder !== "object" || Array.isArray(builder)) {
    details.push("builder must be a non-null object");
  }

  const segmentation = config?.segmentation;
  if (!segmentation || typeof segmentation !== "object" || Array.isArray(segmentation)) {
    details.push("segmentation must be a non-null object");
  }

  const blockSemantics = segmentation?.blockSemantics;
  if (typeof blockSemantics !== "object" || Array.isArray(blockSemantics) || blockSemantics === null) {
    details.push("segmentation.blockSemantics must be a non-empty object");
  } else if (Object.keys(blockSemantics).length === 0) {
    details.push("segmentation.blockSemantics must be a non-empty object");
  } else {
    for (const [letter, sem] of Object.entries(blockSemantics)) {
      if (!sem?.purpose || typeof sem.purpose !== "string" || !sem.purpose.trim()) {
        details.push(`blockSemantics["${letter}"].purpose must be a non-empty string`);
      }
      if (!["single", "superset", "giant_set", "amrap", "emom"].includes(sem?.preferred_segment_type)) {
        details.push(
          `blockSemantics["${letter}"].preferred_segment_type must be one of single|superset|giant_set|amrap|emom`,
        );
      }
    }
  }

  if (!Array.isArray(builder?.dayTemplates) || builder.dayTemplates.length === 0) {
    details.push("builder.dayTemplates must be a non-empty array");
  }

  const dayKeySeen = new Set();
  for (let i = 0; i < (builder?.dayTemplates || []).length; i++) {
    const template = builder.dayTemplates[i];
    if (!template || typeof template !== "object" || Array.isArray(template)) {
      details.push(`builder.dayTemplates[${i}] must be an object`);
      continue;
    }

    const dayKey = template.day_key;
    if (!dayKey || typeof dayKey !== "string" || !dayKey.trim()) {
      details.push(`builder.dayTemplates[${i}].day_key must be a non-empty string`);
    } else if (dayKeySeen.has(dayKey)) {
      details.push(`builder.dayTemplates[${i}].day_key must be unique`);
    } else {
      dayKeySeen.add(dayKey);
    }

    if (template.focus !== undefined && template.focus !== null && !slugPattern.test(String(template.focus))) {
      details.push(`builder.dayTemplates[${i}].focus must match /^[a-z][a-z0-9_]*$/ when provided`);
    }

    if (template.is_ordered_simulation !== undefined && typeof template.is_ordered_simulation !== "boolean") {
      details.push(`builder.dayTemplates[${i}].is_ordered_simulation must be a boolean when provided`);
    }
    if (
      template.day_selection_mode !== undefined &&
      !knownDaySelectionModes.has(template.day_selection_mode)
    ) {
      details.push(
        `builder.dayTemplates[${i}].day_selection_mode must be one of default|benchmark_exactness when provided`,
      );
    }

    if (!Array.isArray(template.ordered_slots) || template.ordered_slots.length === 0) {
      details.push(`builder.dayTemplates[${i}].ordered_slots must be a non-empty array`);
      continue;
    }

    for (let j = 0; j < template.ordered_slots.length; j++) {
      const slot = template.ordered_slots[j];
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
        details.push(`builder.dayTemplates[${i}].ordered_slots[${j}] must be an object`);
        continue;
      }
      const slotName = slot.slot;
      if (!slotName || typeof slotName !== "string" || !/^[A-Z]:.+/.test(slotName)) {
        details.push(`builder.dayTemplates[${i}].ordered_slots[${j}].slot must match /^[A-Z]:.+/`);
      } else {
        const blockLetter = slotName.split(":")[0];
        if (
          blockSemantics &&
          typeof blockSemantics === "object" &&
          !Array.isArray(blockSemantics) &&
          !Object.prototype.hasOwnProperty.call(blockSemantics, blockLetter)
        ) {
          details.push(
            `builder.dayTemplates[${i}].ordered_slots[${j}].slot block "${blockLetter}" missing in segmentation.blockSemantics`,
          );
        }
      }
      if (slot.selector_strategy && !knownStrategies.has(slot.selector_strategy)) {
        details.push(
          `builder.dayTemplates[${i}].ordered_slots[${j}].selector_strategy must be one of best_match_by_movement`,
        );
      }
      if (
        slot.variability_policy !== undefined &&
        !knownVariabilityPolicies.has(slot.variability_policy)
      ) {
        details.push(
          `builder.dayTemplates[${i}].ordered_slots[${j}].variability_policy must be one of none|med|high`,
        );
      }
      if (slot.requireHyroxRole !== undefined && typeof slot.requireHyroxRole !== "string") {
        details.push(`builder.dayTemplates[${i}].ordered_slots[${j}].requireHyroxRole must be a string when provided`);
      }
      if (
        slot.station_index !== undefined &&
        (!Number.isFinite(Number(slot.station_index)) || Number(slot.station_index) <= 0)
      ) {
        details.push(`builder.dayTemplates[${i}].ordered_slots[${j}].station_index must be a positive integer when provided`);
      }
      if (
        slot.required_equipment_slugs !== undefined &&
        !Array.isArray(slot.required_equipment_slugs)
      ) {
        details.push(`builder.dayTemplates[${i}].ordered_slots[${j}].required_equipment_slugs must be an array when provided`);
      }
      if (slot.station_fallback_chain !== undefined) {
        if (!Array.isArray(slot.station_fallback_chain) || slot.station_fallback_chain.length === 0) {
          details.push(
            `builder.dayTemplates[${i}].ordered_slots[${j}].station_fallback_chain must be a non-empty array when provided`,
          );
        } else {
          for (let k = 0; k < slot.station_fallback_chain.length; k++) {
            const entry = slot.station_fallback_chain[k];
            if (!isValidSimulationEntry(entry)) {
              details.push(
                `builder.dayTemplates[${i}].ordered_slots[${j}].station_fallback_chain[${k}] must be an object`,
              );
              continue;
            }
            if (
              entry.station_index !== undefined &&
              (!Number.isFinite(Number(entry.station_index)) || Number(entry.station_index) <= 0)
            ) {
              details.push(
                `builder.dayTemplates[${i}].ordered_slots[${j}].station_fallback_chain[${k}].station_index must be a positive integer when provided`,
              );
            }
            if (
              entry.required_equipment_slugs !== undefined &&
              !Array.isArray(entry.required_equipment_slugs)
            ) {
              details.push(
                `builder.dayTemplates[${i}].ordered_slots[${j}].station_fallback_chain[${k}].required_equipment_slugs must be an array when provided`,
              );
            }
            if (entry.requireHyroxRole !== undefined && typeof entry.requireHyroxRole !== "string") {
              details.push(
                `builder.dayTemplates[${i}].ordered_slots[${j}].station_fallback_chain[${k}].requireHyroxRole must be a string when provided`,
              );
            }
          }
        }
      }
    }
  }

  if (!builder?.setsByDuration || typeof builder.setsByDuration !== "object" || Array.isArray(builder.setsByDuration)) {
    details.push("builder.setsByDuration must be a non-empty object");
  } else if (Object.keys(builder.setsByDuration).length === 0) {
    details.push("builder.setsByDuration must be a non-empty object");
  }

  if (!builder?.blockBudget || typeof builder.blockBudget !== "object" || Array.isArray(builder.blockBudget)) {
    details.push("builder.blockBudget must be a non-empty object");
  } else if (Object.keys(builder.blockBudget).length === 0) {
    details.push("builder.blockBudget must be a non-empty object");
  }

  if (
    builder?.blockVariabilityDefaults !== undefined &&
    (typeof builder.blockVariabilityDefaults !== "object" ||
      builder.blockVariabilityDefaults === null ||
      Array.isArray(builder.blockVariabilityDefaults))
  ) {
    details.push("builder.blockVariabilityDefaults must be an object when provided");
  } else if (builder?.blockVariabilityDefaults) {
    for (const [blockKey, policy] of Object.entries(builder.blockVariabilityDefaults)) {
      if (!knownVariabilityPolicies.has(policy)) {
        details.push(
          `builder.blockVariabilityDefaults["${blockKey}"] must be one of none|med|high`,
        );
      }
    }
  }

  if (details.length > 0) {
    throw new ConfigValidationError(details);
  }
}
