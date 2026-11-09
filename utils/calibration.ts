import { normalizeSettings, type TintSettings } from './tint.ts';

export type Snapshot = { settings: TintSettings; enabled: boolean };
export type Dimension = keyof TintSettings;
export type Preview = 'a' | 'b' | 'best' | 'starting' | 'none';
export type Choice = 'a' | 'b' | 'same' | 'neither';
export interface Calibration {
  version: 1;
  id: string;
  revision: number;
  documentId?: string;
  starting: Snapshot;
  best: Snapshot;
  runnerUp: Snapshot | null;
  accepted: Snapshot[];
  rejected: string[];
  stage: number;
  level: number;
  queue: number[];
  tested: string[];
  pair: { a: Snapshot; b: Snapshot; incumbent: 'a' | 'b' } | null;
  viewed: { a: boolean; b: boolean };
  rounds: number;
  status: 'search' | 'review';
  paused: boolean;
  preview: Preview;
  note: string;
}

export const phases: { dimension: Dimension; title: string; coarse: number[]; steps: number[] }[] = [
  { dimension: 'saturation', title: 'Find your saturation', coarse: [0, 50, 100], steps: [25] },
  { dimension: 'brightness', title: 'Find your brightness', coarse: [20, 60, 100], steps: [20] },
  { dimension: 'hue', title: 'Find your hue', coarse: [0, 60, 120, 180, 240, 300], steps: [30, 15] },
  { dimension: 'saturation', title: 'Recheck saturation', coarse: [], steps: [12] },
  { dimension: 'brightness', title: 'Recheck brightness', coarse: [], steps: [10] },
];

/** Treat visually neutral settings as equivalent, including the hue wrap. */
export function snapshotKey(snapshot: Snapshot): string {
  const { hue, saturation, brightness } = snapshot.settings;
  if (!snapshot.enabled) return 'none';
  return `${saturation === 0 ? 0 : hue % 360}:${saturation}:${brightness}`;
}

function neutral(settings: TintSettings): Snapshot {
  return { settings: { ...settings, saturation: 0, brightness: 100 }, enabled: false };
}

function candidate(state: Calibration, value: number): Snapshot {
  const dimension = phases[state.stage]!.dimension;
  const adjusted = dimension === 'hue' ? ((value % 360) + 360) % 360 : value;
  return { settings: normalizeSettings({ ...state.best.settings, [dimension]: adjusted }), enabled: true };
}

function fillQueue(state: Calibration) {
  const phase = phases[state.stage]!;
  if (state.level === 0 && phase.coarse.length) {
    state.queue = [...phase.coarse];
  } else {
    const index = phase.coarse.length ? state.level - 1 : state.level;
    const step = phase.steps[index];
    state.queue = step === undefined ? [] : [state.best.settings[phase.dimension] - step, state.best.settings[phase.dimension] + step];
  }
}

function nextPair(state: Calibration, random: () => number) {
  while (state.stage < phases.length) {
    // Hue cannot change a neutral tint. No color recheck is needed in that case.
    if (state.stage === 2 && (!state.best.enabled || state.best.settings.saturation <= 2)) {
      state.note = 'Your background is neutral, so we skipped hue. Compare your result below.';
      state.stage = phases.length;
      break;
    }
    while (state.queue.length) {
      const value = state.queue.shift()!;
      const challenger = candidate(state, value);
      const key = snapshotKey(challenger);
      if (key === snapshotKey(state.best) || state.tested.includes(key) || state.rejected.includes(key)) continue;
      state.tested.push(key);
      const incumbent = random() < 0.5 ? 'a' : 'b';
      state.pair = incumbent === 'a'
        ? { a: structuredClone(state.best), b: challenger, incumbent }
        : { a: challenger, b: structuredClone(state.best), incumbent };
      state.viewed = { a: false, b: false };
      state.preview = 'best';
      return;
    }
    const phase = phases[state.stage]!;
    const levels = phase.steps.length + (phase.coarse.length ? 1 : 0);
    state.level++;
    if (state.level >= levels) {
      state.stage++;
      state.level = 0;
      state.tested = [];
      state.rejected = [];
    }
    if (state.stage < phases.length) fillQueue(state);
  }
  state.status = 'review';
  state.pair = null;
  state.preview = 'best';
}

export function createCalibration(starting: Snapshot, random = Math.random): Calibration {
  const start = { settings: normalizeSettings(starting.settings), enabled: starting.enabled };
  const best = start.enabled ? structuredClone(start) : neutral(start.settings);
  const state: Calibration = {
    version: 1, id: crypto.randomUUID(), revision: 0, starting: start, best,
    runnerUp: null, accepted: [structuredClone(best)], rejected: [],
    stage: 0, level: 0, queue: [], tested: [], pair: null,
    viewed: { a: false, b: false }, rounds: 0, status: 'search', paused: false,
    preview: 'best', note: 'Take your time. Preview both options before choosing.',
  };
  fillQueue(state);
  nextPair(state, random);
  return state;
}

export function previewSnapshot(state: Calibration): Snapshot {
  if (state.paused || state.preview === 'starting') return state.starting;
  if (state.preview === 'none') return neutral(state.best.settings);
  if ((state.preview === 'a' || state.preview === 'b') && state.pair) return state.pair[state.preview];
  return state.best;
}

export function selectPreview(state: Calibration, preview: Preview): Calibration {
  const result = structuredClone(state);
  if (result.status === 'search' && !['a', 'b', 'best'].includes(preview)) throw new Error('Invalid search preview');
  if (result.status === 'review' && !['best', 'starting', 'none'].includes(preview)) throw new Error('Invalid review preview');
  result.preview = preview;
  if (preview === 'a' || preview === 'b') result.viewed[preview] = true;
  result.revision++;
  return result;
}

export function choose(state: Calibration, choice: Choice, random = Math.random): Calibration {
  if (!state.pair || state.status !== 'search') throw new Error('No comparison is active');
  if (!state.viewed.a || !state.viewed.b) throw new Error('Preview both options first');
  const result = structuredClone(state);
  const pair = result.pair!;
  if (choice === 'neither') {
    result.rejected.push(snapshotKey(pair.a), snapshotKey(pair.b));
    const fallback = [...result.accepted].reverse().find(item => !result.rejected.includes(snapshotKey(item)));
    result.best = structuredClone(fallback ?? (result.starting.enabled ? result.starting : neutral(result.starting.settings)));
    result.note = 'Returned to an earlier setting. Try the next pair, or finish early.';
  } else {
    let picked: 'a' | 'b' = choice === 'same' ? pair.incumbent : choice;
    if (choice === 'same') {
      const dimension = phases[result.stage]!.dimension;
      if (dimension === 'saturation' && pair.a.settings.saturation !== pair.b.settings.saturation) picked = pair.a.settings.saturation < pair.b.settings.saturation ? 'a' : 'b';
      if (dimension === 'brightness' && pair.a.settings.brightness !== pair.b.settings.brightness) picked = pair.a.settings.brightness > pair.b.settings.brightness ? 'a' : 'b';
    }
    result.best = structuredClone(pair[picked]);
    result.runnerUp = structuredClone(pair[picked === 'a' ? 'b' : 'a']);
    result.accepted.push(structuredClone(result.best));
    result.note = choice === 'same'
      ? 'Kept the gentler setting where possible. Let’s compare another option.'
      : 'Preference saved. Preview the next two options when you’re ready.';
  }
  result.rounds++;
  result.revision++;
  nextPair(result, random);
  return result;
}

export function review(state: Calibration): Calibration {
  return { ...structuredClone(state), revision: state.revision + 1, status: 'review', pair: null, preview: 'best', paused: false,
    note: 'Compare your background with where you started and with the original page.' };
}

export function refine(state: Calibration, random = Math.random): Calibration {
  const result = structuredClone(state);
  result.status = 'search';
  result.stage = 3;
  result.level = 0;
  result.tested = [];
  result.rejected = [];
  result.note = 'Fine-tune saturation, then brightness, around your current result.';
  result.revision++;
  fillQueue(result);
  nextPair(result, random);
  return result;
}
