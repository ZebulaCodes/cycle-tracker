# Cycle Tracker

A small Progressive Web App (PWA) for tracking a monthly cycle. Plain HTML, CSS and JavaScript, no build step.

All entries are saved only on the phone (browser localStorage). Nothing is sent to a server.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout: summary card, calendar, day sheet |
| `app.js` | Calendar, day sheet, cycle math and predictions |
| `store.js` | Saving and loading entries (the only file to change for a different storage method) |
| `style.css` | Styles, including dark mode |
| `manifest.json` | App name, icon and colors, used when installing |
| `sw.js` | Service worker, lets the app open offline |

## Run on your computer

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Install on Android

1. Host the folder on HTTPS (for example GitHub Pages).
2. Open the URL in Chrome on the phone.
3. Tap **Install app** when prompted, or use the ⋮ menu → **Add to Home screen** / **Install app**.

## Updating

After changing files, bump `CACHE` in `sw.js` (e.g. `cycle-tracker-v2`) and add any new files to its list.
