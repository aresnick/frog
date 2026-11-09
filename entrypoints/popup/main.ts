import { browser } from 'wxt/browser';
import { defaultSettings, normalizeSettings, type TintSettings } from '../../utils/tint';
import './style.css';
import type { Calibration } from '../../utils/calibration';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const controls = element<HTMLFieldSetElement>('controls');
const globalControls = element<HTMLFieldSetElement>('global-controls');
const toggle = element<HTMLInputElement>('enabled');
const status = element<HTMLParagraphElement>('status');
const calibrate = element<HTMLButtonElement>('calibrate');
const sliders = {
  hue: element<HTMLInputElement>('hue'),
  saturation: element<HTMLInputElement>('saturation'),
  brightness: element<HTMLInputElement>('brightness'),
};
let settings = { ...defaultSettings };
let tabId: number | undefined;
let revision = 0;
let session: Calibration | null = null;

function renderGuide() {
  calibrate.textContent = session ? 'Resume calibration →' : 'Find my color →';
  element('guided-description').textContent = session
    ? `${session.rounds} choice${session.rounds === 1 ? '' : 's'} saved. Pick up where you left off.`
    : 'Saturation → brightness → hue. About 20 choices, at your pace.';
}

function render() {
  for (const key of Object.keys(sliders) as (keyof TintSettings)[]) {
    sliders[key].value = String(settings[key]);
    const unit = key === 'hue' ? '°' : '%';
    element<HTMLOutputElement>(`${key}-value`).value = `${settings[key]}${unit}`;
    sliders[key].setAttribute('aria-valuetext', `${settings[key]} ${key === 'hue' ? 'degrees' : 'percent'}`);
  }
  document.documentElement.style.setProperty('--tint-hue', String(settings.hue));
  element('toggle-caption').textContent = toggle.checked ? 'On across websites' : 'Off across websites';
}

function unavailable() {
  controls.disabled = true;
  globalControls.disabled = true;
  calibrate.disabled = true;
  status.textContent = 'This page can’t be recolored. Try a regular website.';
  status.classList.add('error');
}

async function apply() {
  if (tabId === undefined) return;
  const currentRevision = ++revision;
  render();
  try {
    const response = await browser.runtime.sendMessage({
      type: 'frog:set-tint', tabId, settings: { ...settings }, enabled: toggle.checked,
    });
    if (currentRevision !== revision) return;
    if (!response?.ok) return unavailable();
    session = response.session ?? null;
    renderGuide();
    status.textContent = toggle.checked ? 'Saved. Applied automatically across websites.' : 'Off everywhere. Original backgrounds restored.';
  } catch {
    if (currentRevision === revision) unavailable();
  }
}

for (const key of Object.keys(sliders) as (keyof TintSettings)[]) {
  sliders[key].addEventListener('input', () => {
    settings[key] = Number(sliders[key].value);
    toggle.checked = true;
    void apply();
  });
}
toggle.addEventListener('change', () => void apply());
element('reset').addEventListener('click', () => {
  settings = { ...defaultSettings };
  void apply();
});
calibrate.addEventListener('click', async () => {
  if (tabId === undefined) return;
  calibrate.disabled = true;
  try {
    const response = await browser.runtime.sendMessage({ type: 'frog:start-calibration', tabId });
    if (!response?.ok) return unavailable();
    window.close();
  } catch {
    unavailable();
  }
});

async function initialize() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0]?.id;
    if (tabId === undefined) return unavailable();
    const response = await browser.runtime.sendMessage({ type: 'frog:get-state', tabId });
    if (!response?.ok) return unavailable();
    session = response.session ?? null;
    toggle.checked = response.preference.enabled;
    settings = normalizeSettings(response.current ?? response.preference.settings);
    render();
    renderGuide();
    controls.disabled = false;
    globalControls.disabled = false;
    calibrate.disabled = response.supported === false;
    status.textContent = response.supported === false
      ? 'Chrome protects this page. Global settings still apply on websites.'
      : toggle.checked ? 'Your saved color follows you across websites.' : 'Start the guide or use the manual sliders.';
  } catch {
    unavailable();
  }
}

void initialize();
