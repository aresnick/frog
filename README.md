# Frog

A WXT Chrome extension that finds a comfortable background color and applies it automatically across websites. Frog changes the page background and neutral content surfaces directly; it does not place a tinted overlay over the page. Text, images, videos, background images, and colored controls retain their own colors.

## Install directly from this repository

No Node.js installation or build step is needed to use Frog.

1. Clone the repository, or download GitHub’s **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder itself—the folder containing this README and `manifest.json`.
4. Allow website access if Chrome asks, then pin Frog from the extensions menu.

The checked-in `manifest.json`, JavaScript, icons, and assets form a ready-to-load production extension. The WXT/TypeScript source is included alongside it for development.

## Find and save your color

1. Open Frog’s toolbar popup and click **Find my color**.
2. Preview **A** and **B** on the page, then choose **Prefer A**, **Prefer B**, **About the same**, or **Neither feels comfortable**. Both previews must be viewed before choosing.
3. The guide searches **saturation → brightness → hue**, then rechecks saturation and brightness. Other controls stay fixed within each comparison. Neutral results skip hue. The guide uses broad candidates followed by smaller steps, including hue wraparound.
4. In review, compare **Your result**, **Starting color**, and **Original page**. Click **Save for all websites** to persist the selected background color. Saving the original page instead turns Frog off globally.

A colored result usually takes around 15–25 choices. Switch at your own pace: there is no automatic flashing or countdown. **Finish early** goes to review; **Keep adjusting** performs another fine-tuning pass. The guide finds a comfortable sampled setting rather than guaranteeing a unique global optimum.

Trial backgrounds affect only the calibration tab and its reachable frames. They never replace your saved preference. **Pause**, the panel’s close button, and **Cancel** return to the currently saved global preference; Pause preserves progress and Cancel discards it. Reloading pauses the guide and applies the saved global preference automatically. Reopen the popup to **Resume calibration**. Progress is stored per tab for the current browser session and is cleared when the tab/browser closes or the extension reloads.

## Automatic backgrounds and manual controls

Your chosen background and global on/off state persist locally across browser restarts. They apply to existing tabs, new pages, navigations, reloads, and reachable frames. White/gray content surfaces and dynamically inserted neutral panels also receive the color. Existing page styles are restored when Frog is off. Strongly colored controls and surfaces, background images, images, video, SVG, and canvas are preserved. Closed shadow roots and content drawn into images/canvases cannot be recolored as normal page backgrounds.

The popup’s **Background color** switch turns automatic backgrounds on or off across websites. Under **Manual sliders**:

- **Hue:** 0–360°, around the color wheel.
- **Saturation:** 0–100%, from gray to a strong color.
- **Brightness:** 20–100%, the brightness of the background color.

Manual adjustments save immediately across websites. **Reset** restores 185°, 25%, 100%, keeping the global on/off state. A new saved global preference takes precedence over any open trial previews and pauses those guides. Settings from earlier Frog versions are migrated automatically.

Frog changes background colors, rather than filtering foreground content or dimming the entire screen. Zero saturation and 100% brightness paints white; **Original page** restores the website’s own background colors. These are separate calibration choices.

## Load or update in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Reload the existing installation, or choose **Load unpacked** and select the repository folder containing `manifest.json`.
3. Allow website access if Chrome asks: this version needs permission to recolor pages automatically.
4. Refresh any pages with the previous Frog overlay or guide open. Pin Frog from the extensions menu.

Chrome blocks extension changes to internal pages, the Chrome Web Store, and some built-in viewers. File pages require **Allow access to file URLs** in Frog’s extension details. Website access restricted in Chrome’s extension settings also limits automatic application.

Permissions: `storage` saves preferences and session progress; `scripting` and `activeTab` support the popup and on-page guide; `<all_urls>` host access and a content script allow backgrounds to apply automatically across supported websites. There are no analytics, remote services, or network requests.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
npm run typecheck
npm run build
npm test
npm run zip
```

WXT builds into `.output/chrome-mv3`. Both `npm run build` and `npm run zip` then refresh the checked-in runtime files at the repository root, removing old generated assets. Commit those refreshed files with source changes so people can continue loading the repository directly. The ZIP is `.output/frog-1.3.0-chrome.zip`. The frog’s vector source is `public/icon/frog.svg`.

Root-level `manifest.json`, `background.js`, `calibration.js`, `popup.html`, `assets/`, `chunks/`, `content-scripts/`, and `icon/` are generated distribution files. Edit the source in `entrypoints/`, `utils/`, `public/`, and `wxt.config.ts`, then build. The exporter records its owned paths in `scripts/chrome-build-files.json` and never cleans source directories.

Tests cover calibration order, hue wraparound, fixed non-target controls, endpoints, neutral results, ties/rejection, restoration, serialization, HSB colors, the white-versus-original distinction, preference migration, and the persistent global off state. The distribution test checks that the root manifest and all referenced runtime resources are present. Browser checks cover background-only rendering, dynamic surfaces, global propagation, reload/new-tab persistence, calibration previews and saving, foreground preservation, and restricted pages.
