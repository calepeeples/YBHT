const scoreKeys = ["egoMeter", "bullshitDetector", "designIntegrity", "stakeholderConfidence", "decisionQuality", "chaos"];

export function normalizeMeetingScores(meeting) {
  const states = [meeting?.initialState, meeting?.state];
  const scores = states.flatMap((state) => scoreKeys.map((key) => state?.[key]));
  if (scores.length !== 12 || !scores.every((score) => Number.isInteger(score) && score >= 0 && score <= 10)) return false;
  for (const state of states) {
    for (const key of scoreKeys) state[key] *= 10;
  }
  return true;
}
