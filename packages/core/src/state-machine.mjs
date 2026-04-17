const DEFAULT_WEIGHTS = {
  capability_fit: 35,
  screen_odds: 30,
  upside: 20,
  compensation: 10,
  logistics: 5,
};

const DEFAULT_THRESHOLDS = {
  pursue_now: 80,
  selective_pursue: 68,
  hold: 55,
};

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function scoreOpportunity(opportunity = {}, searchStrategy = {}) {
  const score = opportunity.score || {};
  const weights = searchStrategy.scoring_weights || DEFAULT_WEIGHTS;
  const weightedTotal =
    (Number(score.capability_fit || 0) * Number(weights.capability_fit || 0)) +
    (Number(score.screen_odds || 0) * Number(weights.screen_odds || 0)) +
    (Number(score.upside || 0) * Number(weights.upside || 0)) +
    (Number(score.compensation || 0) * Number(weights.compensation || 0)) +
    (Number(score.logistics || 0) * Number(weights.logistics || 0));

  return round1(weightedTotal / 10);
}

export function recommendationForScore(score, searchStrategy = {}) {
  const thresholds = searchStrategy.thresholds || DEFAULT_THRESHOLDS;

  if (score >= Number(thresholds.pursue_now || DEFAULT_THRESHOLDS.pursue_now)) {
    return 'pursue_now';
  }
  if (score >= Number(thresholds.selective_pursue || DEFAULT_THRESHOLDS.selective_pursue)) {
    return 'selective_pursue';
  }
  if (score >= Number(thresholds.hold || DEFAULT_THRESHOLDS.hold)) {
    return 'hold';
  }
  return 'pass';
}

export function summarizePhases(opportunities = []) {
  const counts = {};
  for (const opportunity of opportunities) {
    const phase = opportunity.phase || 'unknown';
    counts[phase] = (counts[phase] || 0) + 1;
  }
  return counts;
}

