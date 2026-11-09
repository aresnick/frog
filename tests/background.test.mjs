import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundColor } from '../utils/tint.ts';
import { resolvePreference } from '../utils/preference.ts';
import { snapshotKey } from '../utils/calibration.ts';

const settings = { hue: 30, saturation: 40, brightness: 80 };

test('background colors use HSB directly, including neutral dimming and hue wraparound', () => {
  assert.equal(backgroundColor({ hue: 0, saturation: 50, brightness: 80 }), 'rgb(204, 102, 102)');
  assert.equal(backgroundColor({ hue: 360, saturation: 50, brightness: 80 }), 'rgb(204, 102, 102)');
  assert.equal(backgroundColor({ hue: 210, saturation: 0, brightness: 100 }), 'rgb(255, 255, 255)');
  assert.equal(backgroundColor({ hue: 210, saturation: 0, brightness: 20 }), 'rgb(51, 51, 51)');
});

test('calibration distinguishes a white background from restoring the original website', () => {
  const white = { settings: { hue: 0, saturation: 0, brightness: 100 }, enabled: true };
  assert.notEqual(snapshotKey(white), snapshotKey({ ...white, enabled: false }));
});

test('the persistent global off switch wins over older enabled preferences', () => {
  assert.deepEqual(resolvePreference({
    frogPreference: { settings, enabled: false },
    frogPreset: { settings, enabled: true },
    frogSettings: settings,
  }), { settings, enabled: false });
});

test('migration preserves the latest manual color and a saved original-background preference', () => {
  assert.deepEqual(resolvePreference({ frogSettings: settings }), { settings, enabled: true });
  assert.deepEqual(resolvePreference({ frogSettings: settings, frogPreset: { settings, enabled: false } }), { settings, enabled: false });
  const newer = { ...settings, hue: 180 };
  assert.deepEqual(resolvePreference({ frogSettings: newer, frogPreset: { settings, enabled: true } }), { settings: newer, enabled: true });
  assert.equal(resolvePreference({}).enabled, false);
});
