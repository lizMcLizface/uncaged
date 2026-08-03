---
name: run-app
description: Launch unCAGED's CRA dev server on Windows/Git Bash and drive it with Playwright to screenshot the UI (e.g. the fretboard). Playwright is a project devDependency as of 2026-08-01.
---

# Running unCAGED and taking a screenshot

This is a Create React App project (`react-scripts start`, port 3000).
`playwright` is a devDependency in `package.json` (added 2026-08-01) and
Chromium is installed at `~/AppData/Local/ms-playwright`.

Two repo-tracked scripts do the actual work - `scripts/dev-server.sh` and
`scripts/screenshot.js`. Use them instead of writing ad-hoc scratchpad
scripts: their Bash invocations are stable across sessions (fixed repo
path, not a new session-scratch-dir UUID every time), so the permission
`Bash(node scripts/screenshot.js *)` / `Bash(bash scripts/dev-server.sh *)`
allowlisted once in `.claude/settings.json` covers every future call - no
re-approval per session.

## 1. Start the dev server

```bash
bash scripts/dev-server.sh start
```

Waits for port 3000 to answer and prints `READY`. Safe to call if it's
already running (no-ops). Logs to `.tmp/dev-server.log` (gitignored) if you
need to debug a startup failure.

## 2. Playwright + Chromium are already available

Nothing to bootstrap in the common case - `scripts/screenshot.js` lives
inside the repo, so `require('playwright')` resolves through the repo's own
`node_modules` (no `NODE_PATH` workaround needed). Verify quickly if unsure:

```bash
node -e "console.log(require.resolve('playwright'))"
```

If that fails (e.g. `node_modules` was wiped), reinstall:

```bash
npm install --save-dev playwright
npx playwright install chromium
```

## 3. Take screenshots

```bash
node scripts/screenshot.js --out .tmp/shots --tabs "Chord Progression,Other Controls,Scale Position Grid,Scale Information,Synthesizer"
```

- `--out <dir>` (required) - where PNGs land. Use `.tmp/<something>`
  (gitignored) for one-off verification.
- `--tabs "A,B,C"` (optional) - clicks each tab by exact text match after
  the default load, screenshotting after each. Omit for just the default
  view.
- `--url` (default `http://localhost:3000`), `--wait-for` (default
  `.fretboard`), `--width`/`--height` (default 1600x1200) - override as
  needed.

Always writes `00-default.png` first, then `NN-<slug>.png` per tab, plus
`errors.json` (every `pageerror` and `console.error` collected across the
whole run). Exits 1 if any errors were collected - check `$?` rather than
re-parsing `errors.json` for a quick pass/fail.

Then use the Read tool on the resulting PNGs to view them.

## 4. Stop the server

```bash
bash scripts/dev-server.sh stop
```

(`npm run start &`'s own PID is just the npm wrapper - it doesn't forward
SIGTERM to the actual node process - so the script kills whatever is
actually listening on port 3000 instead.)

## Gotchas

- `.fretboard` renders near the top of a much taller page; a full-page
  screenshot will look like it's "cut off" with a huge empty area below -
  crop to one element instead if you just need that component (add an
  `--out` run with a narrower `--wait-for`, or extend
  `scripts/screenshot.js` if you need per-element crops regularly).
- Tab-click selectors are fiddly: `page.getByText(label, {exact:true})` can
  resolve to a hidden `<select><option>` sharing the same text instead of
  the visible tab (hit this clicking a roman-numeral chord button in
  REFACTOR_PLAN.md Phase 3). If a `--tabs` click fails, prefer the existing
  unit tests plus a zero-error screenshot over fighting the selector further
  - that combination has caught every real regression so far.
- Windows PowerShell's `taskkill` needs `//F //PID` (double slash) when run
  through Git Bash, not `-F -PID` - already handled inside
  `scripts/dev-server.sh`, only relevant if you're editing that script.
- jsdom (used by `npm test`, via the `nwsapi` selector engine) is stricter
  than real Chromium about malformed CSS selectors — e.g.
  `document.querySelectorAll('[data-animation')` (unclosed bracket, in
  `src/metronome.js:3`) throws in jsdom on import but is silently tolerated
  in a real browser. Confirmed via this skill 2026-08-01: loading the app in
  headless Chromium produces zero `pageerror` events. If a component test
  needs to import through that chain, mock the module rather than "fixing"
  the selector to match jsdom — the real-browser behavior is what matters
  and is unaffected either way (the `animations` const is unused dead code).

## Checking the build instead of (or alongside) the UI

For ESLint-warning regression checks (not visual ones), use the
`check-build` skill (`scripts/check-build.sh` + `docs/build-baseline.txt`
- see `REFACTOR_PLAN.md` §2.2 for what the baseline is and when to update it).
