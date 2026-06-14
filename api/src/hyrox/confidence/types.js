/**
 * @typedef {Object} BenchmarkConfidence
 * @property {number} score
 * @property {'A'|'B'|'C'|'D'|'E'} grade
 * @property {number} sampleSize
 * @property {number} [fallbackLevel]
 * @property {string|null} [fallbackReason]
 * @property {{sampleSize:number,relevance:number,completeness:number,variance:number,recency:number}} components
 * @property {boolean} isNoisy
 * @property {boolean} isSkewed
 */

/**
 * @typedef {Object} BenchmarkSelection
 * @property {boolean} [suppressed]
 * @property {string} [benchmarkUsed]
 * @property {string} [benchmarkRequested]
 * @property {number} [fallbackLevel]
 * @property {string|null} [fallbackReason]
 * @property {number} [sampleSize]
 * @property {number} [confidenceScore]
 * @property {'A'|'B'|'C'|'D'|'E'} [confidenceGrade]
 * @property {BenchmarkConfidence} [confidence]
 */

export const confidenceTypes = Object.freeze({});
