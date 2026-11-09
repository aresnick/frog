import { browser } from 'wxt/browser';
import { applyTint, normalizeSettings } from '../utils/tint';

export default defineBackground(() => {
  const updates = new Map<number, Promise<unknown>>();

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || message?.type !== 'frog:set-tint') return;
    const { tabId } = message;
    if (!Number.isInteger(tabId) || tabId < 0) return;
    const settings = normalizeSettings(message.settings);
    const enabled = message.enabled === true;

    // Serialize changes so a fast drag cannot apply stale values. Background
    // work can finish even when the popup closes immediately after a change.
    const update = (updates.get(tabId) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await browser.scripting.executeScript({
          target: { tabId }, func: applyTint, args: [settings, enabled],
        });
        await browser.storage.local.set({ frogSettings: settings });
        await browser.action.setBadgeBackgroundColor({ tabId, color: '#386b4f' });
        await browser.action.setBadgeText({ tabId, text: enabled ? 'ON' : '' });
        await browser.action.setTitle({ tabId, title: 'Frog · Adjust your page tint' });
      });
    updates.set(tabId, update);
    void update.then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    ).finally(() => {
      if (updates.get(tabId) === update) updates.delete(tabId);
    });
    return true;
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return;
    void Promise.all([
      browser.action.setBadgeText({ tabId, text: '' }),
      browser.action.setTitle({ tabId, title: 'Frog · Adjust your page tint' }),
    ]).catch(() => {});
  });
});
