export interface TintSettings {
  hue: number;
  saturation: number;
  brightness: number;
}

export const defaultSettings: TintSettings = { hue: 185, saturation: 25, brightness: 100 };

export function normalizeSettings(value: unknown): TintSettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<TintSettings>;
  const clamp = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  return {
    hue: clamp(input.hue, 0, 360, defaultSettings.hue),
    saturation: clamp(input.saturation, 0, 100, defaultSettings.saturation),
    brightness: clamp(input.brightness, 20, 100, defaultSettings.brightness),
  };
}

/** HSV/HSB color, used directly as the page background. */
export function backgroundColor(settings: TintSettings): string {
  const { hue: degrees, saturation, brightness } = normalizeSettings(settings);
  const hue = (degrees % 360) / 60;
  const chroma = saturation / 100;
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
  const channels = hue < 1 ? [chroma, secondary, 0]
    : hue < 2 ? [secondary, chroma, 0]
    : hue < 3 ? [0, chroma, secondary]
    : hue < 4 ? [0, secondary, chroma]
    : hue < 5 ? [secondary, 0, chroma]
    : [chroma, 0, secondary];
  const rgb = channels.map(channel => Math.round((channel + 1 - chroma) * brightness / 100 * 255));
  return `rgb(${rgb.join(', ')})`;
}

// Injected functions share the content script's isolated world, not the page's.
export async function readTint(): Promise<TintSettings | null> {
  const controller = (globalThis as typeof globalThis & {
    __frogBackground?: { ready: Promise<void>; current(): { settings: TintSettings; enabled: boolean } };
  }).__frogBackground;
  if (!controller) throw new Error('Frog could not connect to this page.');
  await controller.ready;
  const current = controller.current();
  return current.enabled ? current.settings : null;
}

export async function applyTint(settings: TintSettings, enabled: boolean): Promise<void> {
  const controller = (globalThis as typeof globalThis & {
    __frogBackground?: { ready: Promise<void>; preview(settings: TintSettings, enabled: boolean): void };
  }).__frogBackground;
  if (!controller) throw new Error('Frog could not connect to this page.');
  await controller.ready;
  controller.preview(settings, enabled);
}

export async function useSavedTint(_settings: TintSettings, _enabled: boolean): Promise<void> {
  const controller = (globalThis as typeof globalThis & {
    __frogBackground?: { ready: Promise<void>; useSaved(): Promise<void> };
  }).__frogBackground;
  if (!controller) throw new Error('Frog could not connect to this page.');
  await controller.ready;
  await controller.useSaved();
}
