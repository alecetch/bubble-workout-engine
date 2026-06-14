function claimKey(insight) {
  return [
    insight.category,
    insight.evidence?.segmentKey ?? insight.evidence?.coreClaim ?? insight.id,
    insight.evidence?.coreClaim ?? insight.category,
  ].join(":");
}

function addIfPresent(selected, candidate) {
  if (!candidate) return;
  if (selected.some((insight) => insight.id === candidate.id)) return;
  if (selected.length < 6) selected.push(candidate);
}

export function deduplicateInsights(scoredInsights = []) {
  const byClaim = new Map();
  for (const insight of scoredInsights) {
    const key = claimKey(insight);
    const existing = byClaim.get(key);
    if (!existing || insight.priorityScore > existing.priorityScore) {
      byClaim.set(key, insight);
    }
  }
  return [...byClaim.values()];
}

export function selectInsights(scoredInsights = []) {
  const ranked = deduplicateInsights(scoredInsights)
    .sort((a, b) => (b.priorityScore - a.priorityScore) || a.id.localeCompare(b.id));

  const selected = [];
  addIfPresent(selected, ranked[0] ? { ...ranked[0], selectionRole: "headline" } : null);
  addIfPresent(selected, ranked.find((insight) => ["strength", "benchmark"].includes(insight.category)));
  addIfPresent(selected, ranked.find((insight) => ["limiter", "time_potential"].includes(insight.category)));
  addIfPresent(selected, ranked.find((insight) => ["pacing", "fatigue"].includes(insight.category) && insight.priorityScore >= 0.5));
  addIfPresent(selected, ranked.find((insight) => insight.category === "recommendation" && !insight.suppressed));
  addIfPresent(selected, ranked.find((insight) => ["population", "myth_buster"].includes(insight.category)));

  for (const insight of ranked) {
    addIfPresent(selected, insight);
  }

  return selected
    .slice(0, 6)
    .sort((a, b) => (b.priorityScore - a.priorityScore) || a.id.localeCompare(b.id));
}
