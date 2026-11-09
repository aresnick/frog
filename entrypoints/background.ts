import { browser } from 'wxt/browser';
import { applyTint, normalizeSettings, readTint, useSavedTint } from '../utils/tint';
import { resolvePreference } from '../utils/preference';
import {
  choose, createCalibration, previewSnapshot, refine, review, selectPreview,
  type Calibration, type Choice, type Preview, type Snapshot,
} from '../utils/calibration';

export default defineBackground(() => {
  const updates = new Map<number, Promise<unknown>>();
  const key = (tabId: number) => `frogCalibration:${tabId}`;

  async function readSession(tabId: number): Promise<Calibration | null> {
    const stored = await browser.storage.session.get(key(tabId));
    const state = stored[key(tabId)] as Calibration | undefined;
    return state?.version === 1 ? state : null;
  }

  async function saveSession(tabId: number, session: Calibration) {
    await browser.storage.session.set({ [key(tabId)]: session });
  }

  async function removePanel(tabId: number) {
    await browser.scripting.executeScript({ target: { tabId }, func: () => {
      document.getElementById('__frog_calibration_panel__')?.remove();
    } });
  }

  async function preference(): Promise<Snapshot> {
    return resolvePreference(await browser.storage.local.get(['frogPreference', 'frogPreset', 'frogSettings']));
  }

  async function ensurePage(tabId: number) {
    const check = () => !!globalThis.__frogBackground?.alive();
    const frames = await browser.scripting.executeScript({ target: { tabId, allFrames: true }, func: check })
      .catch(() => browser.scripting.executeScript({ target: { tabId }, func: check }));
    const missing = frames.filter(frame => !frame.result).map(frame => frame.frameId);
    if (missing.length) await browser.scripting.executeScript({
      target: { tabId, frameIds: missing }, files: ['/content-scripts/background-color.js'],
    });
  }

  async function badge(tabId: number, snapshot: Snapshot, session?: Calibration) {
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#386b4f' });
    await browser.action.setBadgeText({ tabId,
      text: session && !session.paused ? 'A/B' : snapshot.enabled ? 'ON' : '',
    });
    await browser.action.setTitle({ tabId, title: 'Frog · Adjust your background color' });
  }

  async function apply(tabId: number, snapshot: Snapshot, session?: Calibration, saved = false) {
    const func = saved ? useSavedTint : applyTint;
    await browser.scripting.executeScript({
      target: { tabId, ...(session?.documentId ? { documentIds: [session.documentId] } : {}) },
      func, args: [snapshot.settings, snapshot.enabled],
    });
    // Update reachable child frames too. Restricted frames are left to Chrome.
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, func,
      args: [snapshot.settings, snapshot.enabled],
    }).catch(() => {});
    await badge(tabId, snapshot, session);
  }

  async function persistPreference(snapshot: Snapshot) {
    await browser.storage.local.set({ frogPreference: snapshot, frogSettings: snapshot.settings, frogPreset: snapshot });
  }

  function enqueue<T>(tabId: number, task: () => Promise<T>): Promise<T> {
    const operation = (updates.get(tabId) ?? Promise.resolve()).catch(() => {}).then(task);
    updates.set(tabId, operation);
    void operation.finally(() => {
      if (updates.get(tabId) === operation) updates.delete(tabId);
    }).catch(() => {});
    return operation;
  }

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !message?.type?.startsWith('frog:')) return;
    if (sender.tab && sender.frameId !== 0) return;
    const tabId = sender.tab?.id ?? message.tabId;
    if (!Number.isInteger(tabId) || tabId < 0) return;

    const operation = enqueue(tabId, async () => {
      let session = await readSession(tabId);
      if (message.type === 'frog:get-calibration') return { ok: true, session };
      if (message.type === 'frog:get-state') {
        const saved = await preference();
        try {
          await ensurePage(tabId);
          const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: readTint });
          return { ok: true, supported: true, session, preference: saved, current: injection?.result ?? null };
        } catch {
          return { ok: true, supported: false, session, preference: saved, current: null };
        }
      }

      if (message.type === 'frog:set-tint') {
        const snapshot = { settings: normalizeSettings(message.settings), enabled: message.enabled === true };
        if (session) {
          session.paused = true;
          session.revision++;
          await saveSession(tabId, session);
          await removePanel(tabId).catch(() => {});
        }
        await persistPreference(snapshot);
        // Global settings remain usable from Chrome's protected pages too.
        try {
          await ensurePage(tabId);
          await apply(tabId, snapshot, undefined, true);
        } catch { /* Other supported pages still receive the saved preference. */ }
        return { ok: true, session };
      }

      if (message.type === 'frog:start-calibration') {
        await ensurePage(tabId);
        const [injection] = await browser.scripting.executeScript({ target: { tabId }, func: readTint });
        if (!session || message.restart === true) {
          const stored = await preference();
          session = createCalibration({
            settings: normalizeSettings(injection?.result ?? stored.settings),
            enabled: injection?.result != null,
          });
        }
        if (!injection?.documentId) throw new Error('Could not connect to this page.');
        session.documentId = injection.documentId;
        session.paused = false;
        session.preview = 'best';
        session.revision++;
        await saveSession(tabId, session);
        await browser.scripting.executeScript({ target: { tabId, documentIds: [session.documentId!] }, files: ['/calibration.js'] });
        await apply(tabId, previewSnapshot(session), session);
        return { ok: true, session };
      }

      if (message.type !== 'frog:calibration' || !session) throw new Error('No calibration session');
      if (sender.documentId && sender.documentId !== session.documentId) throw new Error('This page has changed. Reopen Frog to resume.');
      if (message.id !== session.id || message.revision !== session.revision) return { ok: false, stale: true, session };

      switch (message.action) {
        case 'preview': {
          if (!['a', 'b', 'best', 'starting', 'none'].includes(message.preview)) throw new Error('Invalid preview');
          session = selectPreview(session, message.preview as Preview);
          break;
        }
        case 'choose': {
          if (!['a', 'b', 'same', 'neither'].includes(message.choice)) throw new Error('Invalid preference');
          session = choose(session, message.choice as Choice);
          break;
        }
        case 'review': session = review(session); break;
        case 'refine': session = refine(session); break;
        case 'pause':
          session.paused = true;
          session.preview = 'starting';
          session.revision++;
          break;
        case 'cancel':
          await apply(tabId, await preference(), { ...session, paused: true }, true);
          await browser.storage.session.remove(key(tabId));
          await removePanel(tabId);
          return { ok: true, closed: true };
        case 'finish': {
          if (session.status !== 'review') throw new Error('Review your result first');
          const snapshot = previewSnapshot(session);
          await persistPreference(snapshot);
          await apply(tabId, snapshot, undefined, true);
          await browser.storage.session.remove(key(tabId));
          await removePanel(tabId);
          return { ok: true, closed: true };
        }
        default: throw new Error('Unknown calibration action');
      }
      await apply(tabId, session.paused ? await preference() : previewSnapshot(session), session, session.paused);
      await saveSession(tabId, session);
      if (session.paused) await removePanel(tabId);
      return { ok: true, session };
    });
    void operation.then(sendResponse, error => sendResponse({ ok: false,
      error: error instanceof Error ? error.message : 'Frog could not update this page.',
    }));
    return true;
  });

  // A saved global change takes precedence over previews in other tabs.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.frogPreference) return;
    const snapshot = resolvePreference({ frogPreference: changes.frogPreference.newValue });
    void browser.storage.session.get(null).then(stored => {
      for (const name of Object.keys(stored)) {
        if (!name.startsWith('frogCalibration:')) continue;
        const tabId = Number(name.slice('frogCalibration:'.length));
        void enqueue(tabId, async () => {
          const session = await readSession(tabId);
          if (session) {
            if (!session.paused) {
              session.paused = true;
              session.revision++;
              await saveSession(tabId, session);
            }
            await apply(tabId, await preference(), session, true);
            await removePanel(tabId);
          }
        }).catch(() => {});
      }
    }).catch(() => {});
    void browser.tabs.query({}).then(tabs => Promise.allSettled(tabs
      .filter(tab => tab.id !== undefined && /^(https?|file):/.test(tab.url ?? ''))
      .map(tab => badge(tab.id!, snapshot)))).catch(() => {});
  });

  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      await persistPreference(await preference());
      const tabs = await browser.tabs.query({});
      await Promise.allSettled(tabs
        .filter(tab => tab.id !== undefined && /^(https?|file):/.test(tab.url ?? ''))
        .map(tab => ensurePage(tab.id!)));
    })().catch(() => {});
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && /^(https?|file):/.test(tab.url ?? '')) {
      void enqueue(tabId, async () => badge(tabId, await preference(), (await readSession(tabId)) ?? undefined)).catch(() => {});
    }
    if (changeInfo.status !== 'loading') return;
    void enqueue(tabId, async () => {
      const session = await readSession(tabId);
      if (session) {
        session.paused = true;
        session.revision++;
        await saveSession(tabId, session);
      }
      await browser.action.setBadgeText({ tabId, text: '' });
      await browser.action.setTitle({ tabId, title: 'Frog · Adjust your background color' });
    }).catch(() => {});
  });
  browser.tabs.onRemoved.addListener(tabId => {
    void enqueue(tabId, () => browser.storage.session.remove(key(tabId))).catch(() => {});
  });
});
