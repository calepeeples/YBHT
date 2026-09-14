import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./server.mjs", import.meta.url), "utf8");

test("enforces the shorter meeting envelope", () => {
  assert.match(source, /3–5 boss turns/);
  assert.match(source, /Turn 5 must end the meeting/);
  assert.doesNotMatch(source, /5–8 boss turns|boss turn 8/);
});

test("defines ego and bullshit as distinct behavioral signals", () => {
  assert.match(source, /Bullshit Detector measures unsupported certainty/);
  assert.match(source, /EgoMeter measures the need for control/);
  assert.match(source, /It never grants design expertise/);
});
