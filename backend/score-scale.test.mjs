import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMeetingScores } from "./score-scale.mjs";

const tenPointState = { egoMeter: 4, bullshitDetector: 2, designIntegrity: 6, stakeholderConfidence: 10, decisionQuality: 8, chaos: 3 };

test("normalizes an unmistakable 0–10 meeting to 0–100", () => {
  const meeting = { initialState: { ...tenPointState }, state: { ...tenPointState } };
  assert.equal(normalizeMeetingScores(meeting), true);
  assert.equal(meeting.state.designIntegrity, 60);
  assert.equal(meeting.state.stakeholderConfidence, 100);
  assert.equal(meeting.initialState.egoMeter, 40);
});

test("does not alter a meeting already using the 0–100 scale", () => {
  const meeting = {
    initialState: { ...tenPointState, egoMeter: 40 },
    state: { ...tenPointState, designIntegrity: 6, stakeholderConfidence: 72 },
  };
  assert.equal(normalizeMeetingScores(meeting), false);
  assert.equal(meeting.state.designIntegrity, 6);
  assert.equal(meeting.state.stakeholderConfidence, 72);
});
