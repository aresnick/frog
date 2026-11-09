import { browser } from 'wxt/browser';
import { phases, type Calibration, type Choice, type Preview } from '../../utils/calibration';
import panelCss from './style.css?inline';
import frogIcon from '../../public/icon/frog.svg?raw';

export default defineUnlistedScript(() => {
  document.getElementById('__frog_calibration_panel__')?.remove();
  const host = document.createElement('div');
  host.id = '__frog_calibration_panel__';
  host.setAttribute('popover', 'manual');
  for (const [key, value] of Object.entries({
    all: 'initial', position: 'fixed', inset: 'auto 16px 16px auto', margin: '0', padding: '0',
    border: '0', background: 'transparent', width: 'min(360px, calc(100vw - 32px))',
    overflow: 'visible', 'z-index': '2147483647', 'color-scheme': 'light',
  })) host.style.setProperty(key, value, 'important');
  // A shadow root isolates the controls from the page's styles. The top layer
  // keeps the panel neutral even while previewing background changes underneath it.
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Frog guided background calibration');
  shadow.append(style, panel);
  document.documentElement.append(host);
  try { host.showPopover(); } catch { /* The z-index is the fallback. */ }

  let state: Calibration | null = null;
  let busy = false;
  let error = '';
  let left = false;

  function button(label: string, action: string, extra = '') {
    return `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
  }

  function render() {
    if (!state) {
      panel.innerHTML = '<p class="loading">Opening your calibration…</p>';
      return;
    }
    const focused = (shadow.activeElement as HTMLElement | null)?.dataset.action;
    const isReview = state.status === 'review';
    const phase = phases[state.stage] ?? phases[0]!;
    const bothViewed = state.viewed.a && state.viewed.b;
    const disabled = busy ? 'disabled' : '';
    const pickDisabled = busy || !bothViewed ? 'disabled' : '';
    const explanations: Record<string, string> = {
      saturation: 'Compare the amount of color. Hue and brightness stay fixed.',
      brightness: 'Compare light and dark. Hue and saturation stay fixed.',
      hue: 'Explore the color wheel. Saturation and brightness stay fixed.',
    };
    panel.innerHTML = `
      <header><div class="brand"><span class="frog" aria-hidden="true">${frogIcon}</span><div><strong>Frog<span>.</span></strong><small>Find your color</small></div></div>
        <div class="header-actions">${button(left ? '↘' : '↙', 'move', 'class="icon-button" title="Move panel to the other side" aria-label="Move panel to the other side"')}${button('×', 'pause', `class="icon-button" title="Pause and close" aria-label="Pause and close" ${disabled}`)}</div>
      </header>
      <nav class="steps" aria-label="Calibration progress">${['Saturation', 'Brightness', 'Hue', 'Recheck'].map((label, index) => {
        const current = isReview ? 4 : Math.min(state!.stage, 3);
        return `<span class="${index < current ? 'done' : index === current ? 'current' : ''}" ${index === current ? 'aria-current="step"' : ''}>${label}</span>`;
      }).join('')}</nav>
      <div class="content">
        <div class="eyebrow">${isReview ? 'Your result' : `${state.stage >= 3 ? 'Fine-tuning' : `Step ${state.stage + 1} of 3`} · ${state.rounds} choice${state.rounds === 1 ? '' : 's'} saved`}</div>
        <h2>${isReview ? 'How does it feel?' : phase.title}</h2>
        <p class="intro">${isReview ? 'Compare backgrounds. Saving applies your choice across websites.' : explanations[phase.dimension]}</p>
        ${isReview ? `
          <div class="review-previews" aria-label="Compare your result">
            ${(['best', 'starting', 'none'] as Preview[]).map(value => button(value === 'best' ? 'Your result' : value === 'starting' ? 'Starting color' : 'Original page', `preview-${value}`, `class="${state!.preview === value ? 'selected' : ''}" aria-pressed="${state!.preview === value}" ${disabled}`)).join('')}
          </div>
          <div class="result-values"><span>Hue <strong>${(state.preview === 'starting' ? state.starting : state.best).settings.hue}°</strong></span><span>Saturation <strong>${state.preview === 'none' ? 0 : (state.preview === 'starting' ? state.starting : state.best).enabled ? (state.preview === 'starting' ? state.starting : state.best).settings.saturation : 0}%</strong></span><span>Brightness <strong>${state.preview === 'none' ? 100 : (state.preview === 'starting' ? state.starting : state.best).enabled ? (state.preview === 'starting' ? state.starting : state.best).settings.brightness : 100}%</strong></span></div>
          <p class="note">${state.note}</p>
          ${button(state.preview === 'none' ? 'Use original backgrounds' : state.preview === 'starting' ? 'Save starting color' : 'Save for all websites', 'finish', `class="primary full" ${disabled}`)}
          <div class="review-actions">${button('Keep adjusting', 'refine', disabled)}${button('Restore previous', 'cancel', disabled)}</div>
        ` : `
          <p class="question">Which makes this page more comfortable to look at and read?</p>
          <div class="previews" aria-label="Preview options">
            ${(['a', 'b'] as const).map(value => button(`<strong>${value.toUpperCase()}</strong><span>${state!.preview === value ? 'Showing now' : state!.viewed[value] ? 'Preview again' : 'Preview option'}</span>`, `preview-${value}`, `class="preview ${state!.preview === value ? 'selected' : ''}" aria-label="Preview ${value.toUpperCase()}" aria-pressed="${state!.preview === value}" ${disabled}`)).join('')}
          </div>
          <p class="preview-status" role="status">${busy ? 'Updating page…' : state.preview === 'best' ? 'Showing your current best. Preview A and B to choose.' : !bothViewed ? `Now preview ${state.preview === 'a' ? 'B' : 'A'}, then choose below.` : `Showing ${state.preview.toUpperCase()}. Choose whichever feels better.`}</p>
          <div class="choices" aria-label="Your preference">
            ${button('Prefer A', 'choose-a', `class="primary" ${pickDisabled}`)}${button('Prefer B', 'choose-b', `class="primary" ${pickDisabled}`)}
            ${button('About the same', 'choose-same', pickDisabled)}${button('Neither feels comfortable', 'choose-neither', pickDisabled)}
          </div>
          <p class="note">${state.note}</p>
        `}
        <p class="error" role="alert" ${error ? '' : 'hidden'}></p>
      </div>
      <footer><div>${isReview ? button('Pause', 'pause', disabled) : button('Finish early', 'review', disabled)}${!isReview ? button('Cancel', 'cancel', disabled) : ''}</div><span>Manual sliders stay in the toolbar.</span></footer>
    `;
    const errorElement = panel.querySelector<HTMLElement>('.error')!;
    errorElement.textContent = error;
    if (focused) panel.querySelector<HTMLButtonElement>(`[data-action="${focused}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }

  async function command(action: string, options: Record<string, unknown> = {}) {
    if (busy || !state) return;
    const restoreFocus = (shadow.activeElement as HTMLElement | null)?.dataset.action;
    busy = true;
    error = '';
    render();
    try {
      const response = await browser.runtime.sendMessage({
        type: 'frog:calibration', id: state.id, revision: state.revision, action, ...options,
      });
      if (response.closed) { host.remove(); return; }
      if (response.session) state = response.session;
      if (!response.ok) error = response.stale ? 'Your progress was updated. Please try that choice again.' : response.error ?? 'Could not update this page. Reopen Frog to resume.';
    } catch {
      error = 'Could not connect to Frog. Reopen the toolbar popup to resume.';
    } finally {
      busy = false;
      if (host.isConnected) {
        render();
        const control = restoreFocus ? panel.querySelector<HTMLButtonElement>(`[data-action="${restoreFocus}"]:not(:disabled)`) : null;
        (control ?? panel.querySelector<HTMLButtonElement>('[data-action="preview-a"]:not(:disabled)'))?.focus({ preventScroll: true });
      }
    }
  }

  panel.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action!;
    if (action === 'move') {
      left = !left;
      host.style.setProperty('inset', left ? 'auto auto 16px 16px' : 'auto 16px 16px auto', 'important');
      render();
    } else if (action.startsWith('preview-')) void command('preview', { preview: action.slice(8) as Preview });
    else if (action.startsWith('choose-')) void command('choose', { choice: action.slice(7) as Choice });
    else void command(action);
  });
  // Do not let a button press become a website shortcut or click handler.
  for (const type of ['click', 'keydown', 'keyup', 'pointerdown']) shadow.addEventListener(type, event => event.stopPropagation());

  render();
  void browser.runtime.sendMessage({ type: 'frog:get-calibration' }).then(response => {
    state = response.session;
    if (!state || state.paused) { host.remove(); return; }
    render();
  }).catch(() => {
    panel.innerHTML = '<p class="loading">Reopen Frog’s toolbar popup to resume calibration.</p>';
  });
});
