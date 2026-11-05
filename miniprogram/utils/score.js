const SCALE = 1000;
const T95 = [12.706205, 4.302653, 3.182446, 2.776445, 2.570582, 2.446912, 2.364624, 2.306004, 2.262157];

function scoreRound(suiteTotalsMs) {
  if (!Array.isArray(suiteTotalsMs) || !suiteTotalsMs.length ||
      suiteTotalsMs.some((total) => !Number.isFinite(total) || total <= 0)) {
    throw new Error('Invalid suite totals for scoring');
  }
  const geomeanMs = Math.exp(suiteTotalsMs.reduce((sum, total) => sum + Math.log(total), 0) / suiteTotalsMs.length);
  const score = SCALE / geomeanMs;
  if (!Number.isFinite(score) || score <= 0) throw new Error('Invalid round score');
  return { suiteTotalsMs: suiteTotalsMs.slice(), geomeanMs, score };
}

function summarizeScores(roundScores, complete = false) {
  const values = roundScores.map((round) => round.score);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Invalid score samples');
  }
  const sampleCount = values.length;
  const mean = sampleCount ? values.reduce((sum, value) => sum + value, 0) / sampleCount : null;
  const quantile = T95[sampleCount - 2];
  let delta = null;
  if (sampleCount > 1 && quantile !== undefined) {
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sampleCount - 1);
    delta = quantile * Math.sqrt(variance / sampleCount);
  }
  return {
    protocol: 'native-score-v1',
    scope: 'scene',
    scale: SCALE,
    sampleCount,
    complete: complete && sampleCount > 0,
    values,
    mean,
    confidenceLevel: 0.95,
    delta,
    percentDelta: delta === null ? null : delta * 100 / mean,
    formattedMean: mean === null ? '' : mean.toFixed(2),
    formattedDelta: delta === null ? '' : delta.toFixed(2)
  };
}

module.exports = { scoreRound, summarizeScores };