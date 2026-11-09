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

// Injected by Chrome: keep these function bodies self-contained.
export function readTint(): TintSettings | null {
  const element = document.getElementById('__frog_tint_174b86__');
  try {
    return element?.dataset.frogSettings ? JSON.parse(element.dataset.frogSettings) : null;
  } catch {
    return null;
  }
}

export function applyTint(settings: TintSettings, enabled: boolean): void {
  document.getElementById('__wxt_blue_filter_overlay_174b86__')?.remove();
  const id = '__frog_tint_174b86__';
  let overlay = document.getElementById(id);
  if (!enabled) {
    overlay?.remove();
    return;
  }
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = id;
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.append(overlay);
  }

  // A pale hue has a strongest channel of 1; brightness scales all channels.
  // Multiplication preserves black text and leaves existing page styles alone.
  const hue = (settings.hue % 360) / 60;
  const chroma = settings.saturation / 100;
  const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
  const channels = hue < 1 ? [chroma, secondary, 0]
    : hue < 2 ? [secondary, chroma, 0]
    : hue < 3 ? [0, chroma, secondary]
    : hue < 4 ? [0, secondary, chroma]
    : hue < 5 ? [secondary, 0, chroma]
    : [chroma, 0, secondary];
  const rgb = channels.map(channel =>
    Math.round((channel + 1 - chroma) * settings.brightness / 100 * 255));
  const styles: Record<string, string> = {
    all: 'initial', position: 'fixed', inset: '0', width: '100%', height: '100%',
    background: `rgb(${rgb.join(', ')})`, 'mix-blend-mode': 'multiply',
    'pointer-events': 'none', 'z-index': '2147483647',
  };
  for (const [property, value] of Object.entries(styles)) {
    overlay.style.setProperty(property, value, 'important');
  }
  overlay.dataset.frogSettings = JSON.stringify(settings);
}
