---
name: run-app
description: Launch unCAGED's CRA dev server on Windows/Git Bash and drive it with Playwright to screenshot the UI (e.g. the fretboard), since Playwright is not a project dependency and chromium-cli is unavailable in this environment.
---

# Running unCAGED and taking a screenshot

This is a Create React App project (`react-scripts start`, port 3000). There
is no `chromium-cli` and no `playwright`/`puppeteer` in `node_modules`, so the
driver has to be bootstrapped via `npx` each time (or once, if the npx cache
survives between sessions).

## 1. Start the dev server

```bash
cd "c:\dev\pianote\uncaged"
(BROWSER=none npm run start > /tmp/dev-server.log 2>&1 &)
timeout 60 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 2; done' && echo READY
```

`BROWSER=none` stops CRA from trying to open a real browser window.

## 2. Make sure Playwright + Chromium are available

`npx playwright --version` works even without the package installed locally
(it fetches on demand), but a bare `node script.js` that does
`require('playwright')` will fail because npx installs into its own cache,
not the project's `node_modules`. Steps:

```bash
# Installs the browser binaries (~/AppData/Local/ms-playwright) if missing
npx playwright install chromium
```

Then find where npx cached the `playwright` package so it can be added to
`NODE_PATH`:

```bash
find "C:/Users/rimuru/AppData/Local/npm-cache/_npx" -maxdepth 3 -iname "playwright" 2>/dev/null
# -> C:/Users/rimuru/AppData/Local/npm-cache/_npx/<hash>/node_modules/playwright
```

The `<hash>` directory is stable across sessions as long as the npx cache
isn't cleared — re-run the `find` if it's not there anymore.

## 3. Write and run a screenshot script

Put a small script in the scratchpad dir (not the repo) and run it with
`NODE_PATH` pointed at the npx cache's `node_modules` (the parent of the
`playwright` dir found above):

```js
// screenshot.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.fretboard', { timeout: 15000 }); // wait for the thing you need
  await page.waitForTimeout(1000);

  // Full page:
  await page.screenshot({ path: '<scratchpad>/full.png', fullPage: true });

  // Or crop to one element (useful for the fretboard, which sits inside a
  // much taller mostly-empty dark page):
  const el = await page.$('.fretboard');
  await el.screenshot({ path: '<scratchpad>/fretboard-crop.png' });

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
```

```bash
NODE_PATH="C:/Users/rimuru/AppData/Local/npm-cache/_npx/<hash>/node_modules" \
  node "<scratchpad>/screenshot.js"
```

Then use the Read tool on the resulting PNG to view it.

## 4. Stop the server

```bash
netstat -ano | grep ":3000" | grep LISTENING | awk '{print $5}' | sort -u | \
  xargs -r -I{} taskkill //F //PID {}
```

(`npm run start &`'s `$!` is only the npm wrapper — it doesn't forward
SIGTERM to the actual node process — so killing by the port's PID is what
actually frees it.)

## Gotchas

- `.fretboard` renders near the top of a much taller page; a full-page
  screenshot will look like it's "cut off" with a huge empty area below —
  that's normal, crop to `.fretboard` instead if you just need that component.
- Windows PowerShell's `taskkill` needs `//F //PID` (double slash) when run
  through Git Bash, not `-F -PID`.
