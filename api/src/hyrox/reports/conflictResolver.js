function subjectKey(insight) {
  return insight.evidence?.segmentKey ?? insight.evidence?.coreClaim ?? insight.category ?? insight.id;
}

export function resolveConflicts(rankedInsights = [], outputType = "web_report") {
  const seen = new Set();
  const resolved = [];
  for (const insight of rankedInsights) {
    const key = subjectKey(insight);
    if (seen.has(key)) continue;
    if ((outputType === "carousel_a" || outputType === "carousel_b") && resolved.at(-1)?.evidence?.segmentKey === insight.evidence?.segmentKey) {
      continue;
    }
    seen.add(key);
    resolved.push(insight);
  }
  return resolved;
}
