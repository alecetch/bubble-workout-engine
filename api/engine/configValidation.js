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
      if (!["single", "superset", "giant_set"].includes(sem?.preferred_segment_type)) {
        details.push(
          `blockSemantics["${letter}"].preferred_segment_type must be one of single|superset|giant_set`,
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

  if (details.length > 0) {
    throw new ConfigValidationError(details);
  }
}
