# Tip Calculator

A single-page tip calculator that tips on the **pre-tax** amount, splits the bill,
and can offset the tip by a service fee that is already on the check.

Installable on an iPhone home screen (Share → *Add to Home Screen*), where it runs
full screen with its own icon, works offline, and updates itself.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app — markup, styles, calculator, and update logic |
| `sw.js` | Service worker: offline cache + update detection |
| `manifest.webmanifest` | Web app manifest (name, colors, icons, standalone display) |
| `version.json` | Version marker the app polls to spot a new deploy |
| `icon.svg` | Icon source; the PNGs below are rendered from it |
| `apple-touch-icon.png` | 180×180 iOS home screen icon |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Manifest icons |
| `favicon.png` | 32×32 browser tab icon |

## Auto-update

The service worker caches the app so it launches instantly and keeps working with no
signal. It checks for a new version on launch, whenever the app returns to the
foreground, when the connection comes back, every 30 minutes while open, and on demand
if you tap the version line at the bottom.

When a new version is found:

- **Nothing typed in yet** → it is applied silently and the app reloads.
- **A calculation in progress** → an *Update available* banner appears instead. The
  current entry is saved and restored across the reload, so nothing is lost either way.

## Releasing a new version

Bump the version in **three** places — this is what the update check compares:

1. `index.html` → `const APP_VERSION = '…'` (and the `<b>v…</b>` in the version line)
2. `sw.js` → `const APP_VERSION = '…'`
3. `version.json` → `"version": "…"`

Push to the deployed branch; installed home screen copies pick it up on their next check.

## Regenerating the icons

Edit `icon.svg`, then re-render the PNGs at 180, 192, 512 (and the padded maskable
variant) with any SVG→PNG tool.
