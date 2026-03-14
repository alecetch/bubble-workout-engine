// api/engine/conditioningScoring.js
//
// Sequence-aware scoring for conditioning programs.
// Called from pickBest() when programType === 'conditioning'.
// Returns a score adjustment (<= 0 penalty, or small positive bonus).
// Uses impact_level, density_rating, and complexity_rank directly.
// engine_role is supplementary only.

export function scoreConditioningSequence(candidate, condState, rankValue, thresholds) {
  const rank = Math.max(0, Math.min(3, rankValue ?? 0));

  const {
    high_impact_threshold = 2,
    high_density_threshold = 2,
    high_complexity_threshold = 2,

    impact_adjacency_penalty = [-3.0, -2.0, -1.0, -0.5],
    density_adjacency_penalty = [-2.0, -1.5, -0.5, 0.0],
    density_complexity_penalty = [-2.0, -1.5, -0.5, 0.0],

    impact_daily_cap = [2, 3, 4, 5],
    impact_over_cap_penalty = [-3.0, -2.0, -1.0, -0.5],

    density_daily_cap = [3, 4, 5, 6],
    density_over_cap_penalty = [-2.0, -1.5, -0.5, -0.2],

    complexity_daily_cap = [2, 3, 4, 5],
    complexity_over_cap_penalty = [-2.0, -1.5, -0.5, -0.2],

    density_bonus_multiplier = [0.5, 0.8, 1.2, 1.5],
  } = thresholds ?? {};

  const candidateImpact = candidate.impact_level ?? 0;
  const candidateDensity = candidate.den ?? 0;
  const candidateComplexity = candidate.cx ?? 0;

  const prevImpact = condState?.lastImpactLevel ?? 0;
  const prevDensity = condState?.lastDensityRating ?? 0;
  const prevComplexity = condState?.lastComplexityRank ?? 0;

  let penalty = 0;

  if (prevImpact >= high_impact_threshold && candidateImpact >= high_impact_threshold) {
    penalty += impact_adjacency_penalty[rank] ?? -1.0;
  }

  if (prevDensity >= high_density_threshold && candidateDensity >= high_density_threshold) {
    penalty += density_adjacency_penalty[rank] ?? -0.5;
  }

  if (prevDensity >= high_density_threshold && candidateComplexity >= high_complexity_threshold) {
    penalty += density_complexity_penalty[rank] ?? -0.5;
  }

  const capImpact = Array.isArray(impact_daily_cap) ? (impact_daily_cap[rank] ?? 4) : impact_daily_cap;
  const capDensity = Array.isArray(density_daily_cap) ? (density_daily_cap[rank] ?? 5) : density_daily_cap;
  const capComplexity = Array.isArray(complexity_daily_cap)
    ? (complexity_daily_cap[rank] ?? 4)
    : complexity_daily_cap;

  if (candidateImpact >= high_impact_threshold) {
    const overImpact = Math.max(0, (condState?.highImpactCountToday ?? 0) + 1 - capImpact);
    if (overImpact > 0) {
      penalty += (impact_over_cap_penalty[rank] ?? -1.0) * overImpact;
    }
  }

  if (candidateDensity >= high_density_threshold) {
    const overDensity = Math.max(0, (condState?.highDensityCountToday ?? 0) + 1 - capDensity);
    if (overDensity > 0) {
      penalty += (density_over_cap_penalty[rank] ?? -0.5) * overDensity;
    }
  }

  if (candidateComplexity >= high_complexity_threshold) {
    const overComplexity = Math.max(0, (condState?.highComplexityCountToday ?? 0) + 1 - capComplexity);
    if (overComplexity > 0) {
      penalty += (complexity_over_cap_penalty[rank] ?? -0.5) * overComplexity;
    }
  }

  const bonusMultiplier = Array.isArray(density_bonus_multiplier)
    ? (density_bonus_multiplier[rank] ?? 1.0)
    : density_bonus_multiplier;
  const densityBonus = candidateDensity * bonusMultiplier * 0.1;

  return penalty + densityBonus;
}
