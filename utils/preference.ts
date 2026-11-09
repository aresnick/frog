import { normalizeSettings } from './tint.ts';
import type { Snapshot } from './calibration';

/** Read the shared preference, including migration from earlier Frog versions. */
export function resolvePreference(stored: Record<string, unknown>): Snapshot {
  const saved = stored.frogPreference;
  if (saved && typeof saved === 'object') {
    const value = saved as Partial<Snapshot>;
    return { settings: normalizeSettings(value.settings), enabled: value.enabled === true };
  }
  const legacy = stored.frogPreset && typeof stored.frogPreset === 'object'
    ? stored.frogPreset as Partial<Snapshot> : null;
  if (stored.frogSettings != null) {
    const settings = normalizeSettings(stored.frogSettings);
    const matchesPreset = legacy && JSON.stringify(settings) === JSON.stringify(normalizeSettings(legacy.settings));
    return { settings, enabled: matchesPreset ? legacy.enabled === true : true };
  }
  return { settings: normalizeSettings(legacy?.settings), enabled: legacy?.enabled === true };
}
