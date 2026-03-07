// api/engine/steps/02_segmentHypertrophy.js

function toStr(v){ return (v===null||v===undefined) ? "" : String(v); }
function toInt(v, fallback){
  const n = parseInt(v,10);
  return Number.isFinite(n) ? n : fallback;
}
function deepClone(obj){ return JSON.parse(JSON.stringify(obj||{})); }

function keyBySlot(blocks){
  const m = Object.create(null);
  for (let i=0;i<(blocks||[]).length;i++){
    const b = blocks[i];
    if (!b || !b.slot) continue;
    m[toStr(b.slot)] = b;
  }
  return m;
}

function isRealExerciseBlock(b){
  return b && b.ex_id && b.ex_name;
}

function getBlockLetter(slot){
  const s = toStr(slot);
  const parts = s.split(":");
  return parts[0] || "";
}

function pickFallbackTargetSlot(dayBlocks){
  let firstA = null, firstB = null, firstReal = null;
  for (let i=0;i<dayBlocks.length;i++){
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

function resolveFillsAndMissing(program){
  const p = deepClone(program);
  const dbg = {
    add_sets_applied: 0,
    missing_converted_to_add_sets: 0,
    missing_unresolved: 0,
    targets_not_found: 0,
  };

  for (let d=0; d<(p.days||[]).length; d++){
    const day = p.days[d];
    if (!day || !Array.isArray(day.blocks)) continue;

    for (let j=0;j<day.blocks.length;j++){
      if (day.blocks[j] && day.blocks[j].sets!==undefined){
        day.blocks[j].sets = toInt(day.blocks[j].sets, 0);
      }
    }

    const slotMap = keyBySlot(day.blocks);

    for (let i=0;i<day.blocks.length;i++){
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

    for (let k=0;k<day.blocks.length;k++){
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

// For superset/giant_set segments:
// - segment.rounds = derived from item sets
// - item.sets = 1
function deriveRoundsAndNormalizeItems(items, fallbackRounds){
  let maxSets = 0;
  for (let i=0;i<items.length;i++){
    const ss = toInt(items[i].sets, 0);
    if (ss > maxSets) maxSets = ss;
  }
  const rounds = maxSets > 0 ? maxSets : (fallbackRounds || 1);

  for (let j=0;j<items.length;j++){
    items[j].sets = 1;
  }
  return rounds;
}

function segmentDayFromBlocks(day, roundsCfg, dbg){
  const blocks = day.blocks || [];

  const A = [], B = [], C = [], D = [];

  for (let i=0;i<blocks.length;i++){
    const b = blocks[i];
    if (!isRealExerciseBlock(b)) continue;

    const blk = getBlockLetter(b.slot);
    if (blk === "A") A.push(b);
    else if (blk === "B") B.push(b);
    else if (blk === "C") C.push(b);
    else if (blk === "D") D.push(b);
    else C.push(b);
  }

  const segments = [];
  let segIndex = 1;

  function mkItems(arr){
    const out = [];
    for (let j=0;j<arr.length;j++){
      const b = arr[j];
      out.push({
        ex_id: b.ex_id,
        ex_name: b.ex_name,
        slot: b.slot,
        sets: toInt(b.sets, 0),
      });
    }
    return out;
  }

  // 1) A-block always single (main)
  if (A.length > 0) {
    segments.push({
      segment_index: segIndex++,
      segment_type: "single",
      purpose: "main",
      rounds: roundsCfg.single,
      items: mkItems([A[0]]),
    });
  }

  // 2) B-block
  if (B.length === 1) {
    segments.push({
      segment_index: segIndex++,
      segment_type: "single",
      purpose: "secondary",
      rounds: roundsCfg.single,
      items: mkItems([B[0]]),
    });
  } else if (B.length >= 2) {
    const itemsB = mkItems([B[0], B[1]]);
    const roundsB = deriveRoundsAndNormalizeItems(itemsB, roundsCfg.superset);
    dbg.circuit_rounds_promoted += 1;

    segments.push({
      segment_index: segIndex++,
      segment_type: "superset",
      purpose: "secondary",
      rounds: roundsB,
      items: itemsB,
    });

    for (let bx=2; bx<B.length; bx++){
      segments.push({
        segment_index: segIndex++,
        segment_type: "single",
        purpose: "accessory",
        rounds: roundsCfg.single,
        items: mkItems([B[bx]]),
      });
    }
  }

  // 3) C-block
  if (C.length === 1) {
    segments.push({
      segment_index: segIndex++,
      segment_type: "single",
      purpose: "accessory",
      rounds: roundsCfg.single,
      items: mkItems([C[0]]),
    });
  } else if (C.length >= 2) {
    const take = Math.min(3, C.length);
    const itemsC = mkItems(C.slice(0, take));
    const roundsC = deriveRoundsAndNormalizeItems(itemsC, roundsCfg.giant_set);
    dbg.circuit_rounds_promoted += 1;

    segments.push({
      segment_index: segIndex++,
      segment_type: "giant_set",
      purpose: "accessory",
      rounds: roundsC,
      items: itemsC,
    });

    for (let cx=take; cx<C.length; cx++){
      segments.push({
        segment_index: segIndex++,
        segment_type: "single",
        purpose: "accessory",
        rounds: roundsCfg.single,
        items: mkItems([C[cx]]),
      });
    }
  }

  // D as accessory singles
  for (let di=0; di<D.length; di++){
    segments.push({
      segment_index: segIndex++,
      segment_type: "single",
      purpose: "accessory",
      rounds: roundsCfg.single,
      items: mkItems([D[di]]),
    });
  }

  return segments;
}

export async function segmentHypertrophyProgram({
  program,
  default_single_rounds = 1,
  default_superset_rounds = 1,
  default_giant_rounds = 1,
}) {
  if (!program || !Array.isArray(program.days)) {
    throw new Error("segmentHypertrophyProgram: invalid program (missing days)");
  }

  const roundsCfg = {
    single:   toInt(default_single_rounds, 1),
    superset: toInt(default_superset_rounds, 1),
    giant_set:toInt(default_giant_rounds, 1),
  };

  const resolved = resolveFillsAndMissing(program);

  const out = {
    schema: "program_hypertrophy_v1_segmented",
    duration_mins: toInt(resolved.programResolved.duration_mins, 0),
    days_per_week: toInt(resolved.programResolved.days_per_week, (resolved.programResolved.days||[]).length),
    days: [],
  };

  const dbg = {
    resolved_fills: resolved.debug,
    rounds_cfg: roundsCfg,
    days_out: 0,
    circuit_rounds_promoted: 0,
  };

  for (let d=0; d<(resolved.programResolved.days||[]).length; d++){
    const day = resolved.programResolved.days[d];
    if (!day) continue;

    const segs = segmentDayFromBlocks(day, roundsCfg, dbg);

    out.days.push({
      day_index: toInt(day.day_index, d+1),
      day_type: toStr(day.day_type) || "hypertrophy",
      duration_mins: toInt(day.duration_mins, out.duration_mins),
      segments: segs,
    });
  }

  dbg.days_out = out.days.length;

  return { program: out, debug: dbg };
}