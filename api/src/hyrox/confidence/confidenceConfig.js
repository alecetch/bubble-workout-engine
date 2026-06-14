export const CONFIDENCE_SCORING_WEIGHTS = Object.freeze({
  sampleSize: 30,
  relevance: 25,
  completeness: 20,
  variance: 15,
  recency: 10,
});

export const SAMPLE_SIZE_SCORES = Object.freeze([
  { min: 2500, points: 30 },
  { min: 1000, points: 27 },
  { min: 500, points: 23 },
  { min: 250, points: 18 },
  { min: 100, points: 12 },
  { min: 50, points: 8 },
  { min: 20, points: 4 },
  { min: 0, points: 0 },
]);

export const RELEVANCE_SCORES = Object.freeze({
  exact: 25,
  adjacent_age_band: 21,
  sex_division: 17,
  sex_only: 12,
  division_only: 10,
  population: 5,
});

export const COMPLETENESS_SCORES = Object.freeze([
  { maxMissingnessRate: 0.02, points: 20 },
  { maxMissingnessRate: 0.10, points: 17 },
  { maxMissingnessRate: 0.20, points: 13 },
  { maxMissingnessRate: 0.30, points: 8 },
  { maxMissingnessRate: 0.40, points: 4 },
  { maxMissingnessRate: Infinity, points: 0 },
]);

export const VARIANCE_SCORES = Object.freeze([
  { maxCv: 0.10, points: 15 },
  { maxCv: 0.20, points: 12 },
  { maxCv: 0.30, points: 7 },
  { maxCv: 0.40, points: 2 },
  { maxCv: Infinity, points: 0 },
]);

export const GRADE_CUTOFFS = Object.freeze({ A: 90, B: 75, C: 60, D: 40 });

export const GRADE_RANK = Object.freeze({ E: 0, D: 1, C: 2, B: 3, A: 4 });

export const MIN_SAMPLES_BY_OUTPUT = Object.freeze({
  overallPercentile: 100,
  stationPercentile: 100,
  top10PctClaim: 500,
  top5PctClaim: 1000,
  top1PctClaim: 2500,
  biggestLimiter: 250,
  biggestStrength: 100,
  potentialGain: 250,
  runningFatigue: 250,
  roxzoneEfficiency: 250,
  raceExecutionScore: 500,
  populationPost: 1000,
  trainingRecommendation: 500,
  predictionEngine: 1000,
});

export const PREFERRED_SAMPLES_BY_OUTPUT = Object.freeze({
  overallPercentile: 500,
  stationPercentile: 500,
  biggestLimiter: 1000,
  potentialGain: 1000,
  runningFatigue: 1000,
  roxzoneEfficiency: 1000,
  raceExecutionScore: 1500,
  trainingRecommendation: 1500,
  predictionEngine: 5000,
});

export const REQUIRED_GRADE = Object.freeze({
  descriptive: "D",
  diagnostic: "C",
  predictive: "B",
  prescriptive: "B",
  socialPublic: "A",
});

export const OUTPUT_TYPE_REQUIRED_GRADE = Object.freeze({
  overallPercentile: "D",
  stationPercentile: "D",
  biggestLimiter: "C",
  biggestStrength: "D",
  potentialGain: "C",
  runningFatigue: "C",
  roxzoneEfficiency: "C",
  raceExecutionScore: "C",
  trainingRecommendation: "B",
  predictionEngine: "B",
  populationPost: "A",
});

export const CONFIDENCE_RULES = Object.freeze({
  noisyCvThreshold: 0.30,
  skewThreshold: 0.10,
  timePotentialNoiseFloorSeconds: 15,
});
