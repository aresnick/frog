# Frog

A small Chrome extension built with WXT and TypeScript. Click the frog in your toolbar to open three sliders that update the current page live:

- **Hue:** 0–360°, covering the full color wheel.
- **Saturation:** 0–100%, from neutral to a strong tint.
- **Brightness:** 20–100%, from dimmed to original brightness.

Move any slider to enable the tint, or use the **Page tint** switch. **Reset** restores the default values (185°, 25%, 100%) while preserving the on/off state. Your last-used slider values are saved locally. Each tab keeps its own active tint, which clears when the page reloads or navigates. Opening the popup restores that page’s current values, or your saved values if the page is untinted.

The filter multiplies page colors by the selected tint and brightness, preserving black text and existing page styles. Zero saturation with 100% brightness is neutral; zero saturation with lower brightness provides neutral dimming. Different hues can still have different perceived brightness. Links, scrolling, forms, and fixed-position elements remain interactive.

## Load or update in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. For an existing installation, click its **Reload** button. For a new installation, choose **Load unpacked** and select `.output/chrome-mv3` from this project.
3. Refresh any pages that still have the previous blue filter applied.
4. Pin **Frog** from Chrome’s extensions menu, then click the frog icon on a website.

Chrome prevents extensions from modifying internal pages, the Chrome Web Store, and certain built-in viewers. On unsupported pages, Frog disables the controls and explains why. For local HTML files, enable **Allow access to file URLs** in Frog’s extension details.

The extension requests `activeTab` and `scripting` to change the page after you open the popup, and `storage` to remember slider values on your device. It has no analytics, remote service, or network requests.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

WXT opens a development browser with the extension installed.

```sh
npm run typecheck
npm run build
npm run zip
```

The unpacked production extension is in `.output/chrome-mv3`; the ZIP is `.output/frog-1.1.0-chrome.zip`. The frog’s vector source is `public/icon/frog.svg`; the toolbar icons are PNG versions at 16, 32, 48, and 128 pixels.

## Planned: guided tint calibration

The current version provides manual sliders. A future guided A/B calibration will help explore comfortable combinations on the current page:

1. Start from the current tint and preserve it for cancellation. Show a neutral on-page control panel while previewing each candidate over the whole page.
2. Explore saturation first, brightness second, and hue third, keeping the other values fixed during each phase. Treat this ordering as a starting hypothesis.
3. Compare broadly spaced candidates, retain a preferred value and a runner-up, then refine around the preferred range. Hue wraps around the color wheel, so it cannot use a simple linear binary search. Skip hue comparisons when saturation is near zero.
4. After finding a hue, briefly revisit saturation and brightness to account for interactions.
5. Compare the result with the starting tint and no filter, then offer use, further adjustment, or restoration of the previous settings.

Each comparison offers **Prefer A**, **Prefer B**, **About the same**, and **Neither feels comfortable**. Users switch candidates at their own pace, with no automatic flashing or countdown. Vary presentation order and keep the prompt consistent: “Which makes this page more comfortable to look at and read?”

Aim for roughly 15–25 choices, support finishing early, and preserve progress when controls close. Keep the manual sliders available. The goal is a repeatably comfortable range; no assumption of a single mathematical optimum or a monotonic preference curve is required.
