import test from 'node:test';
import assert from 'node:assert/strict';
import {
  choose, createCalibration, phases, previewSnapshot, refine, review,
  selectPreview, snapshotKey,
} from '../utils/calibration.ts';

const starting = { settings: { hue: 185, saturation: 25, brightness: 100 }, enabled: false };
const distance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
function preference(state, target) {
  const dimension = phases[state.stage].dimension;
  const score = value => dimension === 'hue'
    ? distance(value.settings.hue, target.hue)
    : Math.abs(value.settings[dimension] - target[dimension]);
  const a = score(state.pair.a);
  const b = score(state.pair.b);
  return a === b ? 'same' : a < b ? 'a' : 'b';
}
function answer(state, choice) {
  return choose(selectPreview(selectPreview(state, 'a'), 'b'), choice, () => 0.75);
}
function complete(target, initial = starting) {
  let state = createCalibration(initial, () => 0.25);
  const stages = [];
  while (state.status === 'search') {
    stages.push(state.stage);
    const dimension = phases[state.stage].dimension;
    for (const other of ['hue', 'saturation', 'brightness'].filter(key => key !== dimension)) {
      assert.equal(state.pair.a.settings[other], state.pair.b.settings[other], `${other} must stay fixed`);
    }
    state = answer(state, preference(state, target));
    assert.ok(state.rounds < 40, 'search must finish in a bounded number of choices');
  }
  return { state, stages };
}

test('explores saturation, brightness, hue, then the two rechecks', () => {
  const { state, stages } = complete({ saturation: 40, brightness: 80, hue: 350 });
  assert.deepEqual([...new Set(stages)], [0, 1, 2, 3, 4]);
  assert.ok(Math.abs(state.best.settings.saturation - 40) <= 12);
  assert.ok(Math.abs(state.best.settings.brightness - 80) <= 10);
  assert.ok(distance(state.best.settings.hue, 350) <= 15);
  assert.ok(state.rounds >= 15 && state.rounds <= 25, `${state.rounds} choices`);
  assert.deepEqual(state.starting, starting, 'original state must be preserved for cancel');
});

test('retains endpoint preferences instead of excluding them during refinement', () => {
  const { state } = complete({ saturation: 100, brightness: 20, hue: 0 });
  assert.equal(state.best.settings.saturation, 100);
  assert.equal(state.best.settings.brightness, 20);
  assert.equal(state.best.settings.hue, 0);
});

test('neutral preference skips hue, while allowing independent neutral dimming', () => {
  const { state, stages } = complete({ saturation: 0, brightness: 80, hue: 0 });
  assert.deepEqual([...new Set(stages)], [0, 1]);
  assert.equal(state.best.settings.saturation, 0);
  assert.equal(state.best.settings.brightness, 80);
  assert.match(state.note, /skipped hue/);
});

test('requires both previews before recording a preference', () => {
  const state = createCalibration(starting);
  assert.throws(() => choose(state, 'a'), /Preview both/);
  assert.throws(() => choose(selectPreview(state, 'a'), 'same'), /Preview both/);
});

test('ties keep a gentle setting and neither can finish without a loop', () => {
  for (const choice of ['same', 'neither']) {
    let state = createCalibration(starting);
    while (state.status === 'search') {
      state = answer(state, choice);
      assert.ok(state.rounds < 40);
    }
    assert.equal(snapshotKey(state.best), 'none');
    assert.deepEqual(state.starting, starting);
  }
});

test('hue wraps and achromatic snapshots ignore irrelevant hue', () => {
  assert.equal(snapshotKey({ settings: { hue: 360, saturation: 50, brightness: 80 }, enabled: true }), snapshotKey({ settings: { hue: 0, saturation: 50, brightness: 80 }, enabled: true }));
  assert.equal(snapshotKey({ settings: { hue: 120, saturation: 0, brightness: 80 }, enabled: true }), snapshotKey({ settings: { hue: 300, saturation: 0, brightness: 80 }, enabled: true }));
});

test('review, pause, and no-filter previews preserve the original and chosen result', () => {
  const original = { settings: { hue: 35, saturation: 20, brightness: 90 }, enabled: true };
  let state = review(createCalibration(original));
  const best = structuredClone(state.best);
  state = selectPreview(state, 'none');
  assert.equal(previewSnapshot(state).enabled, false);
  assert.deepEqual(state.best, best);
  state = selectPreview(state, 'starting');
  assert.deepEqual(previewSnapshot(state), original);
  state.paused = true;
  state.preview = 'best';
  assert.deepEqual(previewSnapshot(state), original);
  assert.throws(() => selectPreview(state, 'a'), /Invalid review/);
});

test('serialized progress resumes the same comparison and supports more fine tuning', () => {
  let state = createCalibration(starting);
  state = answer(state, 'b');
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(restored.pair, state.pair);
  assert.deepEqual(answer(restored, 'a'), answer(state, 'a'));
  const fine = refine(review(state), () => 0.25);
  assert.equal(fine.stage, 3);
  assert.equal(fine.status, 'search');
  assert.deepEqual(fine.starting, starting);
});
