---
name: run-app
description: Launch unCAGED's CRA dev server on Windows/Git Bash and drive it with Playwright to screenshot the UI (e.g. the fretboard). Playwright is a project devDependency as of 2026-08-01.
---

# Running unCAGED and taking a screenshot

This is a Create React App project (`react-scripts start`, port 3000).
`playwright` is a devDependency in `package.json` (added 2026-08-01) and
Chromium is installed at `~/AppData/Local/ms-playwright`, so no npx-cache
hunting is needed — `require('playwright')` resolves normally from
`node_modules` for anything run with `cwd` inside the repo.

## 1. Start the dev server

```bash
cd "c:\dev\pianote\uncaged"
(BROWSER=none npm run start > /tmp/dev-server.log 2>&1 &)
timeout 60 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 2; done' && echo READY
```

`BROWSER=none` stops CRA from trying to open a real browser window.

## 2. Playwright + Chromium are already available

Nothing to bootstrap in the common case. Verify quickly if unsure:

```bash
cd "c:\dev\pianote\uncaged" && node -e "console.log(require.resolve('playwright'))"
```

If that fails (e.g. `node_modules` was wiped), reinstall:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

## 3. Write and run a screenshot script

The script itself must live in the scratchpad dir (not the repo), but it
needs `NODE_PATH` pointed at the *project's* `node_modules` so
`require('playwright')` resolves — a script outside the repo tree does not
pick that up automatically:

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
cd "c:\dev\pianote\uncaged"
NODE_PATH="c:\dev\pianote\uncaged\node_modules" node "<scratchpad>/screenshot.js"
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
- jsdom (used by `npm test`, via the `nwsapi` selector engine) is stricter
  than real Chromium about malformed CSS selectors — e.g.
  `document.querySelectorAll('[data-animation')` (unclosed bracket, in
  `src/metronome.js:3`) throws in jsdom on import but is silently tolerated
  in a real browser. Confirmed via this skill 2026-08-01: loading the app in
  headless Chromium produces zero `pageerror` events. If a component test
  needs to import through that chain, mock the module rather than "fixing"
  the selector to match jsdom — the real-browser behavior is what matters
  and is unaffected either way (the `animations` const is unused dead code).
