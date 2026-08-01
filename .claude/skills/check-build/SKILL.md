---
name: check-build
description: Run unCAGED's production build and diff its ESLint warnings against the committed baseline, to confirm a refactor step introduced zero new warnings. Use whenever a change should be behavior/warning-neutral (most REFACTOR_PLAN.md phases).
---

# Checking the build for warning regressions

`npm run build` (plain, not `CI=true npm run build`) prints ESLint warnings
for the whole `src/` tree - most of them pre-existing and unrelated to
whatever you just touched. The question that matters during a refactor
isn't "are there warnings" (yes, ~219 of them, always) but "did *this
change* add any" - answering that by eye means re-reading the whole list
every time.

`scripts/check-build.sh` automates the diff:

```bash
bash scripts/check-build.sh
```

- Runs `npm run build`.
- Extracts just the ESLint warnings block (between `[eslint]` and `Search
  for the keywords...` - skips the deprecation/Browserslist preamble and
  the file-size/deployment footer, which change on every build and would
  otherwise swamp the diff with noise).
- Diffs it against `docs/build-baseline.txt` (committed to the repo).
- Prints "No warning changes vs baseline" if clean, or a unified diff if
  not.

Raw build output and the extracted warnings land in `.tmp/` (gitignored) if
you need to inspect more than the diff - `.tmp/build-output.txt` (full) and
`.tmp/build-warnings.txt` (extracted).

## Reading the diff

A line that **moved** (same warning text, different line number) is not a
regression - it's expected whenever code shifts inside a file. Compare the
warning *messages*, not line numbers, before concluding something new
appeared. A genuinely **new** warning almost always means an import that
should have moved with the code it serves, or a variable that's now
actually unused and should be removed - not a warning to silence.

## Updating the baseline

Once you've confirmed every diffed line is explained by a move (not a real
new/removed warning), refresh the baseline:

```bash
bash scripts/check-build.sh --update-baseline
```

This overwrites `docs/build-baseline.txt` with the current build's
warnings and should be committed alongside the code change it validates -
treat it as part of that commit's diff, not a separate housekeeping commit.

## Why plain `npm run build`, not `CI=true npm run build`

This repo has dozens of pre-existing ESLint warnings (unused imports,
`no-loop-func`, `eqeqeq`, `default-case`, etc.) unrelated to any one
change. `CI=true` turns every warning into a hard build failure, which
makes an unrelated pre-existing warning look like something you just broke.
Plain `npm run build` exits 0 with warnings printed either way - this
script's diff is what tells you whether *your* change added anything, which
is the question that actually matters.

## Where this fits in the workflow

Pair with the `run-app` skill's screenshot check for full verification: the
build diff catches import/lint regressions, the screenshot catches visual
and runtime (console-error) regressions - neither one alone covers both.
`REFACTOR_PLAN.md` §3 (Phase 3's steps) is the canonical example of both
being run together before every commit.
