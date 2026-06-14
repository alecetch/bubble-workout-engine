function aggregateKey(record) {
  return [
    record.event_id ?? "",
    record.gender ?? "",
    record.nationality ?? "",
    record.age_group ?? "",
    record.division ?? "",
  ].join("|");
}

function exactKey(record) {
  return [
    aggregateKey(record),
    record.total_time_seconds ?? "",
    record.run_time_seconds ?? "",
    record.work_time_seconds ?? "",
    record.roxzone_time_seconds ?? "",
  ].join("|");
}

function aggregatesWithin(record, other, toleranceSeconds) {
  return ["total_time_seconds", "run_time_seconds", "work_time_seconds", "roxzone_time_seconds"].every((field) => {
    const a = record[field];
    const b = other[field];
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= toleranceSeconds;
  });
}

export function markDuplicateRecords(records, toleranceSeconds = 2) {
  const exactSeen = new Map();
  const nearSeen = new Map();

  return records.map((record) => {
    const flags = [];
    const key = exactKey(record);
    const exactCount = exactSeen.get(key) ?? 0;
    exactSeen.set(key, exactCount + 1);
    if (exactCount > 0) flags.push("duplicate_exact");

    const nearKey = aggregateKey(record);
    const prior = nearSeen.get(nearKey) ?? [];
    if (exactCount === 0 && prior.some((candidate) => aggregatesWithin(record, candidate, toleranceSeconds))) {
      flags.push("duplicate_possible");
    }
    prior.push(record);
    nearSeen.set(nearKey, prior);

    if (flags.length === 0) return record;
    const existing = record.validation ?? {};
    return {
      ...record,
      validation: {
        ...existing,
        flags: [...new Set([...(existing.flags ?? []), ...flags])],
        qualityScore: Math.max(0, (existing.qualityScore ?? 100) - 10),
        status: existing.status === "pass" ? "warning" : existing.status,
      },
    };
  });
}
