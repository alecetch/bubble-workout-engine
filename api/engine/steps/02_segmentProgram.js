function toStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function keyBySlot(blocks) {
  const m = Object.create(null);
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i];
    if (!b || !b.slot) continue;
    m[toStr(b.slot)] = b;
  }
  return m;
}

function isRealExerciseBlock(b) {
  return b && b.ex_id && b.ex_name;
}

function getBlockLetter(slot) {
  const s = toStr(slot);
  const parts = s.split(":");
  return parts[0] || "";
}

function pickFallbackTargetSlot(dayBlocks) {
  let firstA = null;
  let firstB = null;
  let firstReal = null;
  for (let i = 0; i < dayBlocks.length; i++) {
    const b = dayBlocks[i];
    if (!b || !b.slot) continue;
    if (!isRealExerciseBlock(b)) continue;

    const blk = getBlockLetter(b.slot);
    if (!firstReal) firstReal = b.slot;
    if (!firstA && blk === "A") firstA = b.slot;
    if (!firstB && blk === "B") firstB = b.slot;
  }
  return firstA || firstB || firstReal || "";
}

function resolveFillsAndMissing(program) {
  const p = deepClone(program);
  const dbg = {
    add_sets_applied: 0,
    missing_converted_to_add_sets: 0,
    missing_unresolved: 0,
    targets_not_found: 0,
  };

  for (let d = 0; d < (p.days || []).length; d++) {
    const day = p.days[d];
    if (!day || !Array.isArray(day.blocks)) continue;

    for (let j = 0; j < day.blocks.length; j++) {
      if (day.blocks[j] && day.blocks[j].sets !== undefined) {
        day.blocks[j].sets = toInt(day.blocks[j].sets, 0);
      }
    }

    const slotMap = keyBySlot(day.blocks);

    for (let i = 0; i < day.blocks.length; i++) {
      const b = day.blocks[i];
      if (!b) continue;

      if (toStr(b.fill) === "add_sets") {
        const target = toStr(b.target_slot);
        const add = toInt(b.add_sets, 0);

        if (target && slotMap[target] && isRealExerciseBlock(slotMap[target])) {
          slotMap[target].sets = toInt(slotMap[target].sets, 0) + Math.max(0, add);
          dbg.add_sets_applied += Math.max(0, add);
        } else {
          dbg.targets_not_found++;
        }
      }
    }

    const fallbackTarget = pickFallbackTargetSlot(day.blocks);

    for (let k = 0; k < day.blocks.length; k++) {
      const mb = day.blocks[k];
      if (!mb) continue;

      if (mb.missing === true) {
        if (fallbackTarget && slotMap[fallbackTarget] && isRealExerciseBlock(slotMap[fallbackTarget])) {
          slotMap[fallbackTarget].sets = toInt(slotMap[fallbackTarget].sets, 0) + 1;
          dbg.missing_converted_to_add_sets += 1;

          mb.fill = "add_sets";
          mb.target_slot = fallbackTarget;
          mb.add_sets = 1;
          delete mb.missing;
        } else {
          dbg.missing_unresolved += 1;
        }
      }
    }
  }

  return { programResolved: p, debug: dbg };
}

function deriveRoundsAndNormalizeItems(items, fallbackRounds) {
  let maxSets = 0;
  for (let i = 0; i < items.length; i++) {
    const ss = toInt(items[i].sets, 0);
    if (ss > maxSets) maxSets = ss;
  }
  const rounds = maxSets > 0 ? maxSets : fallbackRounds || 1;

  for (let j = 0; j < items.length; j++) {
    items[j].sets = 1;
  }
  return rounds;
}

function segmentDayFromBlocks(day, blockSemantics, dbg) {
  const blocks = day.blocks || [];
  const byLetter = Object.create(null);
  const orderedLetters = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!isRealExerciseBlock(b)) continue;
    const letter = getBlockLetter(b.slot);
    if (!byLetter[letter]) {
      byLetter[letter] = [];
      orderedLetters.push(letter);
    }
    byLetter[letter].push(b);
  }

  const segments = [];
  let segIndex = 1;

  const mkItems = (arr) =>
    arr.map((b) => ({
      ex_id: b.ex_id,
      ex_name: b.ex_name,
      slot: b.slot,
      sets: toInt(b.sets, 0),
      is_buy_in: b.is_buy_in === true,
      simulation_resolution: b.simulation_resolution ?? null,
      simulation_fallback_index: b.simulation_fallback_index ?? null,
      simulation_station_index: b.simulation_station_index ?? null,
      simulation_require_hyrox_role: b.simulation_require_hyrox_role ?? null,
      simulation_required_equipment_slugs: b.simulation_required_equipment_slugs ?? null,
    }));

  if (day?.is_ordered_simulation === true) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!isRealExerciseBlock(b)) continue;
      const letter = getBlockLetter(b.slot);
      const sem = blockSemantics?.[letter] || {};
      segments.push({
        segment_index: segIndex++,
        segment_type: "single",
        purpose: toStr(sem.purpose) || "main",
        rounds: 1,
        time_cap_sec: sem.time_cap_sec ?? null,
        post_segment_rest_sec: sem.post_segment_rest_sec ?? 0,
        items: mkItems([b]),
      });
    }
    dbg.ordered_simulation_days = toInt(dbg.ordered_simulation_days, 0) + 1;
    return segments;
  }

  for (const letter of orderedLetters) {
    const group = byLetter[letter] || [];
    const sem = blockSemantics?.[letter] || {};
    const preferredType = toStr(sem.preferred_segment_type) || "single";
    const preferredPurpose = toStr(sem.purpose) || "accessory";
    const timeCap = sem.time_cap_sec ?? null;
    const postRest = sem.post_segment_rest_sec ?? 0;
    const segStart = segments.length;

    if (preferredType === "single") {
      for (const item of group) {
        segments.push({
          segment_index: segIndex++,
          segment_type: "single",
          purpose: preferredPurpose,
          rounds: 1,
          items: mkItems([item]),
        });
      }
    } else if (preferredType === "superset") {
      if (group.length === 1) {
        const item = group[0];
        segments.push({
          segment_index: segIndex++,
          segment_type: "single",
          purpose: preferredPurpose,
          rounds: 1,
          items: mkItems([item]),
        });
      } else if (group.length >= 2) {
        const pairItems = mkItems([group[0], group[1]]);
        const rounds = deriveRoundsAndNormalizeItems(pairItems, 1);
        dbg.circuit_rounds_promoted += 1;
        segments.push({
          segment_index: segIndex++,
          segment_type: "superset",
          purpose: preferredPurpose,
          rounds,
          items: pairItems,
        });
        for (let i = 2; i < group.length; i++) {
          segments.push({
            segment_index: segIndex++,
            segment_type: "single",
            purpose: "accessory",
            rounds: 1,
            items: mkItems([group[i]]),
          });
        }
      }
    } else if (preferredType === "giant_set") {
      if (group.length === 1) {
        const item = group[0];
        segments.push({
          segment_index: segIndex++,
          segment_type: "single",
          purpose: preferredPurpose,
          rounds: 1,
          items: mkItems([item]),
        });
      } else if (group.length >= 2) {
        const take = Math.min(3, group.length);
        const giantItems = mkItems(group.slice(0, take));
        const rounds = deriveRoundsAndNormalizeItems(giantItems, 1);
        dbg.circuit_rounds_promoted += 1;
        segments.push({
          segment_index: segIndex++,
          segment_type: "giant_set",
          purpose: preferredPurpose,
          rounds,
          items: giantItems,
        });
        for (let i = take; i < group.length; i++) {
          segments.push({
            segment_index: segIndex++,
            segment_type: "single",
            purpose: "accessory",
            rounds: 1,
            items: mkItems([group[i]]),
          });
        }
      }
    } else if (preferredType === "amrap") {
      if (group.length === 1) {
        segments.push({
          segment_index: segIndex++,
          segment_type: "amrap",
          purpose: preferredPurpose,
          rounds: toInt(group[0].sets, 1) || 1,
          items: mkItems([group[0]]),
        });
      } else if (group.length >= 2) {
        const take = Math.min(4, group.length);
        const amrapItems = mkItems(group.slice(0, take));
        const rounds = deriveRoundsAndNormalizeItems(amrapItems, 1);
        dbg.circuit_rounds_promoted += 1;
        segments.push({
          segment_index: segIndex++,
          segment_type: "amrap",
          purpose: preferredPurpose,
          rounds,
          items: amrapItems,
        });
        for (let i = take; i < group.length; i++) {
          segments.push({
            segment_index: segIndex++,
            segment_type: "single",
            purpose: "accessory",
            rounds: 1,
            items: mkItems([group[i]]),
          });
        }
      }
    } else if (preferredType === "emom") {
      if (group.length === 1) {
        segments.push({
          segment_index: segIndex++,
          segment_type: "emom",
          purpose: preferredPurpose,
          rounds: toInt(group[0].sets, 1) || 1,
          items: mkItems([group[0]]),
        });
      } else if (group.length >= 2) {
        const take = Math.min(4, group.length);
        const emomItems = mkItems(group.slice(0, take));
        const rounds = deriveRoundsAndNormalizeItems(emomItems, 1);
        dbg.circuit_rounds_promoted += 1;
        segments.push({
          segment_index: segIndex++,
          segment_type: "emom",
          purpose: preferredPurpose,
          rounds,
          items: emomItems,
        });
        for (let i = take; i < group.length; i++) {
          segments.push({
            segment_index: segIndex++,
            segment_type: "single",
            purpose: "accessory",
            rounds: 1,
            items: mkItems([group[i]]),
          });
        }
      }
    }

    for (let si = segStart; si < segments.length; si++) {
      segments[si].time_cap_sec = timeCap;
      segments[si].post_segment_rest_sec = postRest;
    }
  }

  return segments;
}

export async function segmentProgram({ program, compiledConfig }) {
  if (!program || !Array.isArray(program.days)) {
    throw new Error("segmentProgram: invalid program (missing days)");
  }

  const blockSemantics = compiledConfig?.segmentation?.blockSemantics;
  if (!blockSemantics || typeof blockSemantics !== "object") {
    throw new Error("segmentProgram: missing compiledConfig.segmentation.blockSemantics");
  }
  const blockSemanticsByFocus = compiledConfig?.segmentation?.blockSemanticsByFocus ?? {};

  const resolved = resolveFillsAndMissing(program);
  const programType = toStr(program.program_type) || toStr(compiledConfig?.programType) || "unknown";

  const out = {
    schema: `program_${programType}_v1_segmented`,
    duration_mins: toInt(resolved.programResolved.duration_mins, 0),
    days_per_week: toInt(
      resolved.programResolved.days_per_week,
      (resolved.programResolved.days || []).length,
    ),
    days: [],
  };

  const dbg = {
    resolved_fills: resolved.debug,
    days_out: 0,
    circuit_rounds_promoted: 0,
    ordered_simulation_days: 0,
  };

  for (let d = 0; d < (resolved.programResolved.days || []).length; d++) {
    const day = resolved.programResolved.days[d];
    if (!day) continue;
    const dayFocus = toStr(day.day_focus) || null;
    const focusOverride = dayFocus ? (blockSemanticsByFocus[dayFocus] ?? null) : null;
    const effectiveSemantics = focusOverride
      ? { ...blockSemantics, ...focusOverride }
      : blockSemantics;
    const segments = segmentDayFromBlocks(day, effectiveSemantics, dbg);
    out.days.push({
      day_index: toInt(day.day_index, d + 1),
      day_type: toStr(day.day_type) || toStr(compiledConfig?.programType) || "unknown",
      day_focus: dayFocus,
      duration_mins: toInt(day.duration_mins, out.duration_mins),
      is_ordered_simulation: day.is_ordered_simulation === true,
      segments,
    });
  }

  dbg.days_out = out.days.length;
  return { program: out, debug: dbg };
}
