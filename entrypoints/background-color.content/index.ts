import { browser } from 'wxt/browser';
import { backgroundColor, normalizeSettings, type TintSettings } from '../../utils/tint';
import { resolvePreference } from '../../utils/preference';
import type { Snapshot } from '../../utils/calibration';

interface Controller {
  ready: Promise<void>;
  current(): Snapshot;
  preview(settings: TintSettings, enabled: boolean): void;
  useSaved(): Promise<void>;
  alive(): boolean;
  destroy(): void;
}

declare global { var __frogBackground: Controller | undefined; }

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_start',
  main(ctx) {
    if (globalThis.__frogBackground?.alive()) return;
    globalThis.__frogBackground?.destroy();
    document.getElementById('__frog_tint_174b86__')?.remove();
    document.getElementById('__wxt_blue_filter_overlay_174b86__')?.remove();

    const attribute = 'data-frog-background-surface';
    const style = document.createElement('style');
    style.id = '__frog_background_style__';
    const marked = new Set<HTMLElement>();
    const pending = new Set<HTMLElement>();
    let preference: Snapshot = resolvePreference({});
    let preview: Snapshot | null = null;
    let scheduled = false;
    let generation = 0;
    let destroyed = false;
    let styleText = '';
    const current = () => preview ?? preference;
    const excluded = (node: Element) => node.id === style.id || !!node.closest('#__frog_calibration_panel__');

    function clear() {
      style.remove();
      for (const node of marked) node.removeAttribute(attribute);
      marked.clear();
      pending.clear();
    }

    function eligible(node: HTMLElement): boolean {
      if (node === document.documentElement || node === document.body) return true;
      if (excluded(node) || node.closest('button, input, select, textarea, [role="button"], [role="img"], svg, video, canvas')) return false;
      const css = getComputedStyle(node);
      if (css.backgroundImage !== 'none') return false;
      const values = css.backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (!values || values.length < 3 || (values[3] ?? 1) < 0.05) return false;
      const channels = values.slice(0, 3);
      return Math.max(...channels) - Math.min(...channels) <= 32;
    }

    function schedule() {
      if (scheduled || destroyed || !current().enabled || !pending.size) return;
      scheduled = true;
      const flush = () => {
        scheduled = false;
        if (destroyed || !ctx.isValid || !current().enabled) return;
        const batch = [...pending].slice(0, 250);
        for (const node of batch) {
          pending.delete(node);
          // Cloned/recycled nodes may carry a marker from an older surface.
          node.removeAttribute(attribute);
        }
        // Read original backgrounds before adding any overrides in this batch.
        const results = batch.map(node => [node, node.isConnected && eligible(node)] as const);
        for (const [node, shouldMark] of results) {
          if (shouldMark) { node.setAttribute(attribute, ''); marked.add(node); }
          else marked.delete(node);
        }
        schedule();
      };
      // Idle callbacks can stall in background tabs. Small changes should
      // settle immediately; large documents are processed in bounded chunks.
      if (pending.size <= 250) queueMicrotask(flush);
      else ctx.setTimeout(flush, 16);
    }

    function scan(root: Element) {
      if (excluded(root) || !current().enabled) return;
      if (root instanceof HTMLElement) pending.add(root);
      for (const node of root.querySelectorAll<HTMLElement>('*')) {
        if (node instanceof HTMLElement && !excluded(node)) pending.add(node);
      }
      schedule();
    }

    function render() {
      const snapshot = current();
      if (!snapshot.enabled) { clear(); return; }
      if (!document.documentElement) return;
      const css = `[${attribute}] { background-color: ${backgroundColor(snapshot.settings)} !important; }`;
      if (styleText !== css) { styleText = css; style.textContent = css; }
      if (!style.isConnected) (document.head ?? document.documentElement).append(style);
      for (const node of [document.documentElement, document.body]) {
        if (node) { node.setAttribute(attribute, ''); marked.add(node); }
      }
      style.dataset.frogSettings = JSON.stringify(snapshot.settings);
    }

    function setPreview(settings: TintSettings, enabled: boolean) {
      const wasEnabled = current().enabled;
      preview = { settings: normalizeSettings(settings), enabled };
      render();
      if (!wasEnabled && enabled && document.documentElement) scan(document.documentElement);
    }

    const observer = new MutationObserver(records => {
      if (!current().enabled || destroyed) return;
      render();
      for (const record of records) {
        if (!(record.target instanceof Element) || excluded(record.target)) continue;
        if (record.type === 'attributes') scan(record.target);
        else {
          if (record.target.closest('style, head')) scan(document.documentElement);
          for (const node of record.addedNodes) if (node instanceof Element) scan(node);
          for (const node of record.removedNodes) {
            if (!(node instanceof Element) || node.isConnected) continue;
            for (const markedNode of [node, ...node.querySelectorAll(`[${attribute}]`)]) {
              if (markedNode instanceof HTMLElement) {
                markedNode.removeAttribute(attribute);
                marked.delete(markedNode);
                pending.delete(markedNode);
              }
            }
          }
        }
      }
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });

    async function refreshPreference(closeGuide: boolean) {
      const request = ++generation;
      const stored = await browser.storage.local.get(['frogPreference', 'frogPreset', 'frogSettings']);
      if (request !== generation || destroyed) return;
      const next = resolvePreference(stored);
      if (closeGuide) {
        preview = null;
        document.getElementById('__frog_calibration_panel__')?.remove();
      }
      preference = next;
      render();
      if (document.documentElement) scan(document.documentElement);
    }
    const onStorageChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && ['frogPreference', 'frogPreset', 'frogSettings'].some(key => key in changes)) {
        void refreshPreference(true).catch(() => {});
      }
    };
    browser.storage.onChanged.addListener(onStorageChanged);
    ctx.addEventListener(document, 'load', event => {
      if (event.target instanceof HTMLLinkElement && current().enabled) scan(document.documentElement);
    }, true);
    ctx.addEventListener(window, 'resize', () => { if (current().enabled) scan(document.documentElement); });

    const ready = refreshPreference(false).catch(() => {});
    function destroy() {
      destroyed = true;
      observer.disconnect();
      browser.storage.onChanged.removeListener(onStorageChanged);
      clear();
      if (globalThis.__frogBackground === controller) delete globalThis.__frogBackground;
    }
    const controller: Controller = { ready, current, preview: setPreview, useSaved: () => refreshPreference(true), alive: () => ctx.isValid && !destroyed, destroy };
    globalThis.__frogBackground = controller;
    ctx.onInvalidated(destroy);
  },
});
