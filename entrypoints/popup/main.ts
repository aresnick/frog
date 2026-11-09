import { browser } from 'wxt/browser';
import { defaultSettings, normalizeSettings, readTint, type TintSettings } from '../../utils/tint';
import './style.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const controls = element<HTMLFieldSetElement>('controls');
const toggle = element<HTMLInputElement>('enabled');
const status = element<HTMLParagraphElement>('status');
const sliders = {
  hue: element<HTMLInputElement>('hue'),
  saturation: element<HTMLInputElement>('saturation'),
  brightness: element<HTMLInputElement>('brightness'),
};
let settings = { ...defaultSettings };
let tabId: number | undefined;
let revision = 0;

function render() {
  for (const key of Object.keys(sliders) as (keyof TintSettings)[]) {
    sliders[key].value = String(settings[key]);
    const unit = key === 'hue' ? '°' : '%';
    element<HTMLOutputElement>(`${key}-value`).value = `${settings[key]}${unit}`;
    sliders[key].setAttribute('aria-valuetext', `${settings[key]} ${key === 'hue' ? 'degrees' : 'percent'}`);
  }
  document.documentElement.style.setProperty('--tint-hue', String(settings.hue));
  element('toggle-caption').textContent = toggle.checked ? 'On for this page' : 'Off for this page';
}

function unavailable() {
  controls.disabled = true;
  status.textContent = 'This page can’t be tinted. Try a regular website.';
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
    status.textContent = toggle.checked ? 'Just this page. Clears when you reload.' : 'Your tint is saved for next time.';
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

async function initialize() {
  try {
    const [stored, tabs] = await Promise.all([
      browser.storage.local.get('frogSettings'),
      browser.tabs.query({ active: true, currentWindow: true }),
    ]);
    tabId = tabs[0]?.id;
    if (tabId === undefined) return unavailable();
    const [result] = await browser.scripting.executeScript({ target: { tabId }, func: readTint });
    toggle.checked = result?.result != null;
    settings = normalizeSettings(result?.result ?? stored.frogSettings);
    render();
    controls.disabled = false;
    status.textContent = toggle.checked ? 'Just this page. Clears when you reload.' : 'Move a slider or switch on your tint.';
  } catch {
    unavailable();
  }
}

void initialize();
