# unCAGED Refactor Plan

Original baseline measured 2026-07-31 at `09a1b37`. Last updated 2026-08-03.

**Where things stand:** `src/` is **108 files / 29,507 lines**, down from
115 files / 44,751. Build warnings **45**, down from a 219 peak. `npm test`
28/28. All five originally-oversized files are split or deleted except
`PolySynth.jsx`, which Phase 6 covers and which nothing else is waiting on.

**What's left is Section 1.** Everything before it is orientation; everything
after it is history. A new session should read Section 1 and Section 2, and
touch Section 4 only to answer "why is it like this?"

## Status

| Phase | State | Notes |
|---|---|---|
| 0 — Safety net | done | 28 tests, baseline screenshots, `ARCHITECTURE.md` seeded |
| 1 — Delete | done | `index.js` 5,777 → 281; 7 orphan modules + `src/util.js` gone |
| 1b — Second dead-code sweep | done | 3,943 more lines; warnings 198 → 115. Added after Phase 4 — see §4.2 for why it couldn't have run earlier |
| 1c — Lint pass | done | warnings 115 → 45. See §1.3 for the categories deliberately left |
| 2 — `src/theory/` | done | 5 modules; `scales.js` deliberately not moved (`ARCHITECTURE.md` §6.1/§6.2) |
| 2b — `src/audio/` foundation | done | one `AudioContext`, `masterBus`, channel registry (`ARCHITECTURE.md` §2.4/§3) |
| 3 — Split `frets.js` | done | 6,974 lines → `src/fretboard/`, 9 files (`ARCHITECTURE.md` §6.3-§6.11) |
| 4 — Split progression + scales | done | → `src/progression/` 11 files, `src/scales/` 6 files (`ARCHITECTURE.md` §6.12-§6.27) |
| **5 — Kill the `window` bus** | **not started** | **§1.1. The critical path for session mode.** |
| 4c — Split `src/chords.js` | not started | §1.2. The last file that still looks like the old codebase |
| 6 — PolySynth | not started | §1.4. Optional, off the critical path |

---

## 1. What's left

### 1.1 Phase 5 — replace the `window` module bus

The only remaining phase that can change timing behavior, and the one thing
session mode is actually blocked on: a scheduler that sample-aligns drums,
synth and pitch analysis cannot be coordinated through `window.polySynthRef`
polling loops.

**Measured 2026-08-03** (re-count before starting; these move):

| Global | Refs | Notes |
|---|---|---|
| `window.polySynthRef` | 65 | **24 in `src/progression/controls.js` alone.** Playback surface already migrated in Phase 2b; what's left is the progression-sequencer-control surface. See `ARCHITECTURE.md` §3.1/§5.1. |
| `window.updateFretboardsForScaleChange` | 17 | 1 writer + 16 guarded readers in `src/scales/` |
| `window.processedProgression` / `currentProgression` | 19 | `PolySynth.jsx` mutates `currentProgression`'s array **in place** and relies on sharing one identity with `progressionState.currentProgression` — see `ARCHITECTURE.md` §6.12 before touching it |
| `window.App` | 8 | `App.js` exposes `getPolySynthEnabled`/`setPolySynthEnabled` for `progression/controls.js` |
| `window.highlightCurrentChord` | 6 | `PolySynth.jsx` only ever reaches `progressionList.js` through this |
| the fretboard/scale API surface | ~25 | `getFretboard`, `showChordOnFretboard`, `searchFretboardNote(s)`, `getPrimaryScale`, … — re-exported onto `window` by `src/index.js` |

**Three categories, and they need different treatment. Do not migrate all
of them.**

1. **Genuinely dead — delete, don't migrate.** Six globals are *read but
   never written anywhere in `src/`*, so every call site is permanently
   taking its else-branch: `notationStripOctave`, `noteArray`, `setRootNote`,
   `setScale`, `updateChordButtonStyles`, `updateScaleContextDisplay`. All
   six reads are guarded (`typeof x === 'function'`, a truthiness check, or a
   ternary fallback), which is exactly why nobody noticed. `share.js`'s
   `setRootNote`/`setScale` are catch-block fallbacks behind the imported
   `setPrimaryRootNote`/`setPrimaryScale`, so deleting them changes nothing.
   Verify the zero-writer claim with a fresh grep before deleting — this is
   the same class of dead code that `window.updateCrossReferenceDisplay`
   turned out to be in Phase 1b, and finding it took a writer/reader split,
   not a reference count.

2. **Plain imports — most of the list.** Now that Phases 3-4 gave every file
   a real module boundary, the fretboard/scale API surface and most
   progression state want an `import` statement, not a pub/sub bus. The
   original plan's step 1 ("add `src/core/appBus.js`") is **premature** —
   build the bus only for what's left after the imports land, which is likely
   just the React↔vanilla boundary.

3. **Genuinely needs indirection — the React↔vanilla boundary.** `App.js`
   ↔ `PolySynth.jsx` ↔ the vanilla UI. This is the part that justifies
   `appBus.js` + a `registry.js` for the few real singletons, and the part
   where the two polling loops live.

**Order:** dead globals first (free, shrinks the problem), then
`progression/controls.js`'s 24 `polySynthRef` refs (one file, already
isolated, largest single block), then `updateFretboardsForScaleChange`, then
the boundary. One global at a time, verified against the screenshots between
each.

**Keep in mind:**
- Deleting the two polling loops is the *last* step of each migration, not
  the first. They are `App.js`'s `findContainer` (a `setTimeout` recursion at
  ~`App.js:55-67`, polling for `#synthesizerTabContent` before portalling the
  synth into it) and `src/index.js`'s `setInterval`/30s-giveup waiting for
  the synth channel. `index.js`'s comment documents a real race this already
  caused, where re-running `initializeFretboard()` tore a portal target out
  from under a mounted React tree. Note `App.js`'s comment still says
  `frets.js`, deleted in Phase 3 — a known stale reference, not a live one.
- The Synthesizer tab is the highest-value thing to check after any change
  here — it is where that race lived.

### 1.2 Phase 4c — split `src/chords.js`

874 lines, and the last file in the tree with the shape the refactor exists
to remove: chord data + DOM table builders + fretboard glue fused together,
sitting at `src/` root. Five importers.

It is also half of the `theory/chords.js` ↔ `chords.js` **circular import**
that Phase 2 found, documented, and deliberately left alone (`ARCHITECTURE.md`
§6.1) because fixing it was out of scope for a phase whose file wasn't
`chords.js`. Splitting it here breaks that cycle as a side effect.

Apply the Phase 3/4 pattern exactly: investigate call sites first and report
a verified breakdown before editing, then one commit per module, barrel last.

### 1.3 Smaller leftovers

- **Two duplicate keys in `chordPatterns.js`** (`:397` `diminished7_A_string`,
  `:507` `augmented_E_string`), where a rename landed on a key already used
  elsewhere in the object. Musical call — which of two colliding voicings to
  keep. Not a lint nit: a duplicate key means the later entry silently wins,
  so the earlier voicing is one the chord grid can never display.
- **`no-loop-func` (13)** — needs real closure restructuring.
- **`react-hooks/exhaustive-deps` (8)** — adding deps changes behavior.
- **`no-unused-vars` (18) and `no-unreachable` (3) that were left on
  purpose**, because the warning is wrong about intent rather than the code
  being wrong. The `sizeN` consts in `styles/constants.js` are a complete 0-80px design-token
  scale (deleting unused rungs leaves gaps), and `PolySynth.jsx`'s
  `octaveUp`/`octaveDown`/`noteOn`/`noteOff` plus the `MonoSynth.js` /
  `ThemeSelector.jsx` unreachable blocks are **working code behind a
  deliberate off-switch** — a commented-out keyboard-listener block, or a
  bare `return;` / `return null;` at the top of a function. Either direction
  is a behavior change, not a cleanup.

### 1.4 Phase 6 — PolySynth (optional)

`PolySynth.jsx` is 3,891 lines, 117 `useState` calls, 6 `useEffect` — now the
largest file in the repo by more than 2×. Group the state into `useReducer`
per subsystem (oscillators, filter, envelope, effects, arpeggiator) and
extract each panel under `src/components/PolySynth/panels/`.

**Not a prerequisite for anything.** `SESSION_MODE_FEASIBILITY.md` §2.2 wraps
PolySynth behind a `noteOn`/`noteOff` adapter rather than opening it. Pure
cleanup, to be done when convenient or not at all. If it does happen, it can
also retire the microtonal methods (`getPitchValues`/`setPitchValues`/
`resetMicrotonalPitches`) that Phase 1b left exposed with zero callers.

### Deliberately out of scope

Consolidating the three styling systems (inline `.style`/`cssText`,
`index.css`, styled-components + theme context), migrating the vanilla-JS UI
to React, and adding a build step beyond CRA. Each is a bigger decision than
this plan, and each got easier as the phases above landed.

---

## 2. How to work on this

### 2.1 Working rules

- **Restructuring only.** No behavior changes unless the phase explicitly
  calls for them. If you find a latent bug while moving code, confirm whether
  it is pre-existing and say so — don't silently fix it inside a move.
- Vanilla JS + React, no TypeScript, no new dependencies without asking.
  Match the style of the surrounding code.
- **A phase is done when:** tests pass, the build gained no new warnings,
  `ARCHITECTURE.md` reflects the result, the Status table is updated, and it
  is one commit per step.
- **If something makes the plan wrong, update the plan and say so.** Do not
  silently deviate. Several sections below exist only because a previous
  session did this.

### 2.2 Verification tooling

Repo-tracked scripts, so their invocations stay stable across sessions and
their permissions can be allowlisted once:

- `npm test -- --watchAll=false` — 28 tests.
- `bash scripts/check-build.sh` — runs `npm run build` and diffs the ESLint
  warnings against **`docs/build-baseline.txt`**. Refresh with
  `--update-baseline`, committed alongside the change it validates. See the
  `check-build` skill.
- `bash scripts/dev-server.sh {start|stop|status}` +
  `node scripts/screenshot.js --out <dir> --tabs "..."` — see the `run-app`
  skill. `docs/baseline-screenshots/` holds the Phase 0 references.

Scratch output goes to `.tmp/` (gitignored). Commit `docs/build-baseline.txt`
itself when intentionally updated.

**Use plain `npm run build`, never `CI=true npm run build`** — `CI=true` turns
every pre-existing warning into a failure, which makes a clean phase look
broken.

### 2.3 Lessons that generalize

Distilled from Phases 3, 4 and 1b. These were each learned the expensive way.

1. **Verify a function's real callers by grep before assuming it belongs to a
   cluster** by name or file position. This caught `getFretboardForProgression`
   twice in one phase (looked adjacent to one cluster, called only from
   another) and `getChordDisplayName` once (expected to stay, had to move).
2. **State goes in one mutable object, not exported `let`s.** ES module named
   exports are live bindings importers cannot reassign. This is why
   `fretboardState` / `progressionState` / `scaleState` exist. `ARCHITECTURE.md`
   §6.3 has the full reasoning.
3. **Cross-imports back into the residual/barrel are the norm, not a smell.**
   Nearly every extracted module needed one. Safe because nothing is read at
   module top level. Use the bare-specifier convention: `from '.'` for a
   same-directory barrel, `from '..'` for a parent one.
4. **Don't force a 1:1 split when things are entangled** by shared
   event-listener wiring or a tight internal call chain. Keeping them one
   file was the right call every time it came up.
5. **Before a bulk mechanical rename:** grep for `window.<name>` (a
   word-boundary regex can't tell a bare identifier from a property access
   after `.` — this shipped a bug once), check for local shadowing
   (`grep -cE "\b(let|const|var)\s+<name>\b"`; if >1, find the second
   declaration), and watch the spread-operator trap (`[...someVar]` has a `.`
   immediately before the identifier).
6. **After each move, check `check-build.sh`'s diff for now-dead imports
   *and* now-dead exports.** Every step had 0-3 of these. Exports need a grep
   across all of `src/`, not just the files you touched.
7. **Compare warnings with line numbers *and* column padding normalized.**
   ESLint pads the message column to the longest message in a file's block,
   so when a file's warning count drops, surviving lines shift and read as
   "new". A raw line diff will lie to you.
8. **If something looks like a regression during `run-app` verification,
   check it against the prior commit before assuming you broke it.**
   `git stash` the edit, re-run the identical script, compare. This caught
   three false alarms across Phases 4 and 1b — a pre-existing display bug, a
   clipboard/TypeError pair, and Playwright timing flakiness that reproduces
   identically on unmodified code.
9. **Playwright selectors here are fiddly.** `getByText('A', {exact:true})`
   resolves to a hidden `<select>` `<option>`; use `getByRole('cell', ...)`.
   Chord-grid buttons aren't plain `<button>` text matches. When a selector
   fights back, prefer the unit tests (they assert exact structured output)
   plus a zero-console-error load check.
10. **Static screenshots are not enough when you edited code inside a live
    handler.** Drive the actual interaction. Phase 1b's edits sat inside
    click handlers that a page render never exercises.
11. **A file with an importer is not necessarily reachable, and a file with
    zero warnings is not necessarily clean** — an unreachable file produces
    no warnings at all, because webpack never compiles it. This is the whole
    reason Phase 1b existed; see §4.2.

### 2.4 Documentation discipline

**Not optional.** The most expensive thing about this codebase was that
answering "what connects to what" required re-reading thousands of lines.
Every phase that moves code must leave that answer written down.

`ARCHITECTURE.md` is the living map and must stay current: the audio signal
path, the channel/dispatch model, the timing model, the module ownership map,
and the shrinking list of surviving globals. Every extracted module gets a
header comment stating what it owns, what it depends on, and what depends on
it (`chordFingering.js:1-7` is the standard). Contracts go at the definition
site; a barrel should read as the public surface of its folder.

Do **not** narrate what the code already says. Document ownership,
invariants, signal flow, and cross-module contracts — the things true of the
system but not visible in any single file. If a comment restates the line
below it, delete the comment.

---

## 3. Session kickoff prompt

```
Work on the unCAGED refactor.

Read REFACTOR_PLAN.md first. Section 1 is what's left, section 2 is how to
work on it (rules, tooling, and hard-won lessons — read 2.3 properly).
The Status table shows what's done. Read ARCHITECTURE.md for module
contracts. Read SESSION_MODE_FEASIBILITY.md only if the work touches audio,
instruments, or scheduling.

Do NOT re-survey the codebase. Those documents already record the file
sizes, module contracts and signal paths, and they exist specifically so
that investigation is not repeated. Trust them — but re-measure any
specific count you are about to act on, since those drift. If you find
something that contradicts the docs, fix the document as part of your work.

Then:
1. Tell me which item from section 1 you are starting and your first few
   steps. Wait for my go-ahead before editing anything.
2. Do only that item. Do not begin the next one.
```

To resume mid-item, append what landed and what remains.

---

## 4. History

Compressed. Per-module detail lives in `ARCHITECTURE.md` §6.1-§6.27, which is
indexed by module rather than by phase; the per-step reasoning is in the git
commit messages. This section exists to answer "why is it like this?", not to
be re-read before working.

### 4.1 The original four problems (2026-07-31)

The survey that motivated all of this. Five files held 52% of 44,751 lines:
`frets.js` 6,974, `index.js` 5,777 (4,742 commented out), `progressionBuilder.js`
4,599, `PolySynth.jsx` 3,897, `scaleGenerator.js` 2,515. The largest single
function was 1,137 lines.

1. **`window` was the module bus** — ~50 globals; the vanilla-JS and React
   halves communicated exclusively through them plus polling loops. Module
   load order was load-bearing and undocumented. *(Phase 5 finishes this.)*
2. **Theory primitives were copy-pasted** — the 12-note chromatic array
   appeared verbatim in 20 places across 10 files, plus four separate
   octave-parsing helpers and two `noteToMidi`s. *(Phase 2.)*
3. **UI construction was fused to domain logic** — `createFretboardControls`
   built a panel *and* mutated the 20 module-level `let`s it controlled, so
   neither could move independently. *(Phases 3-4.)*
4. **No safety net** — `npm test` failed on the unmodified CRA stub. *(Phase 0.)*

### 4.2 Phases 0-4b, as they landed

- **Phase 0** — fixed `npm test`, added 28 characterization tests over the
  pure functions Phases 2-4 would relocate, captured baseline screenshots,
  seeded `ARCHITECTURE.md` with the *current* mess so later phases were a
  diff against a known state.
- **Phase 1** — stripped `index.js` to 281 lines and deleted 7 orphan
  modules. Kept every live statement as-is, including inert cruft, rather
  than turn a comment-stripping phase into a judgment-call phase. `src/util.js`
  turned out to be pure deletion, not the planned merge.
- **Phase 2** — landed as 5 modules, not 4, and deliberately did **not** move
  `scales.js`. Several "duplicates" named in the survey turned out to have
  genuinely different behavior, so merging them would have been a behavior
  change disguised as a refactor. They were left unmerged. This is the
  clearest example of why the rules say verify rather than assume.
- **Phase 2b** — one shared `AudioContext`, a master bus, and a channel
  registry. Checking the actual `window.polySynthRef` call sites (not the
  reference count) revealed it carried three unrelated surfaces; only the
  playback one migrated. The rest is Phase 5's problem, and §1.1 reflects it.
- **Phase 3** — `frets.js` → `src/fretboard/`, 8 extraction steps then the
  barrel. The barrel kept the public surface stable so no import site outside
  the folder changed until the final step, by design.
- **Phase 4** — `progressionBuilder.js` → `src/progression/` (11 steps), then
  `scaleGenerator.js` + `scales.js` → `src/scales/` (5 steps). Both halves got
  a call-graph investigation first; both found the plan's sketched layout
  wrong in specifics, and both were corrected before any code moved.
- **Phase 1b (2026-08-03)** — a second dead-code sweep, added *after* Phase 4
  because its findings were only visible once everything else had moved.
  Phase 1 hunted dead code two ways — orphans by import graph, and
  commented-out blocks — and every Phase 1b item evaded one of them:
  `progressions.js` (1,744 lines, zero live code) had a dynamic importer;
  `cross.js` had an importer that never used either imported name, and the
  global gating it was never assigned; `IntervalPractice/` (1,577 lines) was
  unreachable and therefore produced **zero warnings**, because webpack never
  compiled it. Also stripped the inert cruft Phase 1 had consciously
  deferred. 3,943 lines, warnings 198 → 115. Detail in `ARCHITECTURE.md` §7.
- **Phase 1c (2026-08-03)** — the mechanical lint pass, warnings 115 → 45.
  Every `eqeqeq` operand pair was checked before conversion rather than
  bulk-replaced. What was deliberately left, and why, is §1.3 — read it
  before "finishing the job".

### 4.3 Where the timing/scheduler work went

Phase 2b originally sketched a follow-on "Phase 2c" (`clock.js`/`scheduler.js`).
On 2026-08-01 that acquired a concrete shape — a Timing Grid tab with BPM,
time signature, a moving playhead and per-instrument lanes — which is new
user-facing behavior, not restructuring. It moved entirely into
`SESSION_MODE_FEASIBILITY.md` Stage 2 and is not a phase of this plan.
`src/audio/` gets no further phases here; Phase 2b's foundation is what
Phases 3-5 needed from it.
