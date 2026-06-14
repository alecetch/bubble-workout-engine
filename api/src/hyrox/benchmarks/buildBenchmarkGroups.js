import { MIN_EXACT_GROUP_SIZE, PERFORMANCE_BANDS } from "../config/validationThresholds.js";

function keyPart(value) {
  return String(value ?? "all").replace(/[^a-z0-9_+-]+/gi, "_").toLowerCase();
}

function makeGroup({ datasetVersion, division = null, gender = null, ageGroup = null, performanceBand = null, fallbackLevel, records }) {
  const parts = ["hyrox", datasetVersion];
  if (performanceBand) {
    parts.push("band", keyPart(performanceBand), keyPart(division), keyPart(gender));
  } else {
    parts.push(keyPart(division), keyPart(gender), keyPart(ageGroup));
  }
  return {
    groupKey: parts.join(":"),
    datasetVersion,
    division,
    gender,
    ageGroup,
    performanceBand,
    fallbackLevel,
    sampleSize: records.length,
    records,
  };
}

function addGroup(groups, group) {
  if (group.sampleSize <= 0 || groups.has(group.groupKey)) return;
  groups.set(group.groupKey, group);
}

function groupBy(records, keyFn) {
  const map = new Map();
  for (const record of records) {
    const key = keyFn(record);
    const arr = map.get(key) ?? [];
    arr.push(record);
    map.set(key, arr);
  }
  return map;
}

export function buildBenchmarkGroups(records, options = {}) {
  const datasetVersion = options.datasetVersion ?? "historical_hyrox_2026_06_v1";
  const base = records.filter((record) => record.validation?.benchmarkEligibility?.overall);
  const groups = new Map();

  for (const grouped of groupBy(base.filter((r) => r.age_group !== "unknown"), (r) => `${r.division}|${r.gender}|${r.age_group}`).values()) {
    if (grouped.length < MIN_EXACT_GROUP_SIZE) continue;
    const sample = grouped[0];
    addGroup(groups, makeGroup({
      datasetVersion,
      division: sample.division,
      gender: sample.gender,
      ageGroup: sample.age_group,
      fallbackLevel: 0,
      records: grouped,
    }));
  }

  for (const grouped of groupBy(base, (r) => `${r.division}|${r.gender}`).values()) {
    const sample = grouped[0];
    addGroup(groups, makeGroup({
      datasetVersion,
      division: sample.division,
      gender: sample.gender,
      fallbackLevel: 1,
      records: grouped,
    }));
  }

  for (const grouped of groupBy(base, (r) => r.division).values()) {
    const sample = grouped[0];
    addGroup(groups, makeGroup({
      datasetVersion,
      division: sample.division,
      fallbackLevel: 2,
      records: grouped,
    }));
  }

  addGroup(groups, makeGroup({ datasetVersion, fallbackLevel: 3, records: base }));

  for (const grouped of groupBy(base, (r) => `${r.division}|${r.gender}`).values()) {
    const sample = grouped[0];
    for (const band of PERFORMANCE_BANDS) {
      const bandRecords = grouped.filter((record) => record.total_time_seconds < band.maxSeconds);
      if (bandRecords.length < MIN_EXACT_GROUP_SIZE) continue;
      addGroup(groups, makeGroup({
        datasetVersion,
        division: sample.division,
        gender: sample.gender,
        performanceBand: band.key,
        fallbackLevel: 0,
        records: bandRecords,
      }));
    }
  }

  return [...groups.values()];
}
