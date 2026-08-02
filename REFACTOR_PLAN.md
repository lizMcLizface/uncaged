# unCAGED Refactor Plan

Baseline measured 2026-07-31 at `09a1b37`.

## Status

**Update this table as part of each phase's commit.** It is how a new
session finds its place without re-reading the codebase.

| Phase | State | Commit | Notes |
|---|---|---|---|
| 0 — Safety net | done | `07a8b12` | `npm test` fixed (App.test.js + 4 new characterization test files, 28 tests); ARCHITECTURE.md seeded; baseline screenshots in `docs/baseline-screenshots/`; playwright added as devDependency |
| 1 — Delete | done | this commit | `index.js` 5,777 → 281 lines (stripped commented-out blocks only, no live statements removed); 7 orphan modules + empty `polysynthFull/` tree + `Untitled-1.ipynb` deleted; `src/util.js` deleted (zero importers - `src/util/util.js` was already the live superset, no merge needed) |
| 2 — `src/theory/` | done | this commit | Landed as 5 modules, not the 4 the plan sketched, and `scales.js` was **not** moved - see the Phase 2 result note below and `ARCHITECTURE.md` §6.1/§6.2 for why. |
| 2b — `src/audio/` foundation (context, bus, dispatch) | done | this commit | one shared `AudioContext`, `masterBus`, and a channel registry replacing `window.polySynthRef`/`polySynthEnabled` at the playback entry points only - see the Phase 2b result note and `ARCHITECTURE.md` §3.1 for the two surfaces that turned out to share that one global |
| 3 — Split `frets.js` | done | this commit | `src/frets.js` (6,974 lines) is now `src/fretboard/`: `state.js` (`ARCHITECTURE.md` §6.3), `geometry.js` (§6.4), `markers.js` (§6.5), `patterns.js` (§6.6), `Fretboard.js` (§6.7), `ui/controls.js` (§6.8), `ui/chordGrid.js` (§6.9), `ui/scalePositionGrid.js` (§6.10), `index.js` (§6.11, the barrel - `frets.js` deleted, its 3 external importers repointed to `./fretboard`). |
| 4 — Split progression + scales | in progress | this commit | Step 9/? - `src/progression/state.js`, `parse.js`, `share.js`, `playback.js`, `scaleSync.js`, `fretboardDisplay.js`, `chordCard.js`, `progressionList.js`, `input.js` landed (`ARCHITECTURE.md` §6.12-§6.20). Remaining: `controls.js`, the barrel; then `scaleGenerator.js`/`scales.js` -> `src/scales/` as a separate checkpoint. |
| 5 — Kill the `window` bus | not started | — | |
| 6 — PolySynth | not started | — | optional, off critical path |

Goal: break the five oversized files into modules that match how the code
actually divides, and replace the `window`-object module bus with real
imports. No behavior changes — every phase below is restructuring only.

Longer-term target: a Rocksmith-style session/scale practice mode with
synthesized backing and play-along feedback. See `SESSION_MODE_FEASIBILITY.md`.
That investigation added Phase 2b below and moved Phase 5 onto the critical
path. Phase 2b originally sketched a follow-on "Phase 2c" (clock +
scheduler); that work has since moved entirely into
`SESSION_MODE_FEASIBILITY.md` (2026-08-01) as part of a larger Timing Grid
feature (Stage 2) — it's new user-facing behavior, not restructuring, so it
doesn't belong in this plan's phase list. Nothing else here changed.

---

## 1. Baseline

44,751 lines across 115 source files. Five files hold 52% of that.

| File | Lines | Live code | Composition |
|---|---|---|---|
| `src/frets.js` | 6,974 | 5,837 | `Fretboard` class (2,000) + control panel builders (1,400) + scale-position grid (1,400) + chord grid / fingering / glue (2,000) |
| `src/index.js` | 5,777 | **243** | 4,742 lines commented out, 792 blank |
| `src/progressionBuilder.js` | 4,599 | 3,499 | chord + roman parsing (1,200) + DOM builders (2,500) + URL sharing (300) |
| `src/components/PolySynth/PolySynth.jsx` | 3,897 | 3,282 | one component, 117 `useState` calls, 6 `useEffect` |
| `src/scaleGenerator.js` | 2,515 | 1,925 | two table builders at 737 and 440 lines |

Largest single functions:

| Function | Lines | File |
|---|---|---|
| `createFretboardControls` | 1,137 | `frets.js:2732` |
| `createProgressionControlsSection` | 912 | `progressionBuilder.js:1761` |
| `createRootNoteTable` | 737 | `scaleGenerator.js:572` |
| `renderScalePositionGrid` | 712 | `frets.js:5063` |
| `createHeptatonicScaleTable` | 440 | `scaleGenerator.js:1721` |
| `createMiniFretboardVisualization` | 431 | `progressionBuilder.js:3037` |

---

## 2. The four structural problems

### 2.1 `window` is the module bus

~50 distinct globals. Writes: `frets.js` 17, `progressionBuilder.js` 12,
`index.js` 12, `staves.js` 10, `App.js` 3. `window.polySynthRef` is
referenced ~115 times, `window.updateFretboardsForScaleChange` 17.

**Correction (Phase 0, 2026-08-01):** the original count of this section
also included `window.gridData` (52 refs) and `window.outputNoteArray` (27
refs) as live traffic. They are not. Every one of those references lives in
either `src/staves.js` — imported by nothing, see the correction to §2.5
below — or commented-out code in `index.js`/`progressions.js`. Both globals
have zero live readers or writers and need no migration in Phase 5; they
disappear for free when Phase 1 deletes `src/staves.js` and strips
`index.js`. Full detail in `ARCHITECTURE.md` §5.3.

The vanilla-JS half and the React half communicate exclusively through
these globals, plus polling loops that wait for the other side to appear
(`App.js:47-59` polls for `#synthesizerTabContent`; `index.js:5747` polls
for `window.polySynthRef` on a 100ms interval with a 30s giveup). The
comment at `index.js:5738` documents a race this already caused, where
re-running `initializeFretboard()` tore a portal target out from under a
mounted React tree.

Consequence: module load order is load-bearing and undocumented, and
nothing can be unit-tested in isolation.

### 2.2 Music theory primitives are copy-pasted

`['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']` appears verbatim
in **20 places** across 10 files (`chords.js` x2, `frets.js` x5,
`progressionBuilder.js` x4, `PolySynth.jsx` x2, `IntervalPractice.jsx` x2,
`MonoSynth.js`, `notation.js`, `tuning.js`, plus 2 in commented-out
`index.js`).

Duplicated helpers:

- `noteToMidi` / `noteToName` — `midi.js:12,44` **and** `notation.js:441,448`
- `normalizeNoteName` — `MiniPiano.js:54`, `MiniStave.js:48`; plus
  `normalizeNote2` (`midi.js:1`) and `normalizeNote` (`notation.js:493`)
- octave parsing — `extractOctave` (`MiniPiano.js:226`, `frets.js` method),
  `parseNoteOctave` (`tuning.js:17`), `parseNoteWithOctave` (`MiniStave.js:152`)
- semitone-from-root — `getSemitoneFromRoot` (`MiniPiano.js:167`),
  `getSemitoneFromReference` (`frets.js:4283`)

There is no theory module; there are twelve partial ones.

### 2.3 UI construction is fused to domain logic

| File | `createElement` | `.style.` | `cssText` | `addEventListener` |
|---|---|---|---|---|
| `frets.js` | 199 | 202 | 173 | 82 |
| `progressionBuilder.js` | 89 | 150 | 71 | 41 |
| `scaleGenerator.js` | 64 | 221 | 29 | 29 |

`createFretboardControls` builds a control panel *and* mutates the ~20
module-level `let`s it controls (`frets.js:182-195`), so the panel and the
state it drives cannot be moved independently. Same shape in
`createProgressionControlsSection` and `createRootNoteTable`.

Styling is spread across three systems that don't know about each other:
inline `.style`/`cssText` writes (above), `index.css` (1,853 lines), and
styled-components + the theme context.

### 2.4 No safety net

`src/App.test.js` is the unmodified CRA stub — it asserts on a "learn
react" link that does not exist, so `npm test` fails today. There is no
other test. Every refactor step below is currently unverifiable except by
eye.

### 2.5 Dead weight

Imported by nothing: `App_new.js`, `App_backup.js`, `chord-examples.js`,
`metronome-example.js`, `util/dutyCycleDemo.js`, `components/RouteHelper.js`,
`staves.js` (173 lines — added to this list in Phase 0; its only reference
anywhere is a commented-out `// import './staves';` in `index.js:17`, so the
~10 `window.*` writes counted against it in §2.1 are dead code, not live
module-bus traffic).
`src/polysynthFull/components/PolySynth/` is an empty directory tree.
`src/util.js` (78 lines) and `src/util/util.js` (212 lines) are separate
files. `Untitled-1.ipynb` is a tracked 102 KB notebook.

---

## 3. Documentation discipline

**This applies to every phase below and is not optional.** The single most
expensive thing about this codebase right now is that answering "what
connects to what" requires re-reading thousands of lines. Every phase that
moves code must leave that answer written down, or the next piece of work
re-derives it from scratch.

The bar is not "add comments". It is: *someone picking this up cold should
be able to find the signal path and the module contracts without grepping.*

### 3.1 `ARCHITECTURE.md` — living map, updated as phases land

A single document describing the runtime shape, kept current rather than
written once. It must cover:

- **The audio signal path, explicitly.** Every source → per-channel insert →
  master bus → analyser tap → destination. Where the single `AudioContext`
  is created and who may create nodes on it. This is the thing that is
  currently impossible to know without reading four files.
- **The channel/dispatch model.** The tagged note event shape, the channel
  registry, which entry points dispatch (keyboard, mouse, programmatic) and
  what each targets.
- **The timing model.** Which clock is authoritative, what schedules against
  it, and what is still on `setTimeout` at any given moment.
- **Module ownership map.** For each top-level folder: what it owns, what it
  may import, what must never import it.
- **Remaining globals.** A shrinking list of surviving `window.*` entries
  with the phase that will remove each. When the list empties, delete it.

### 3.2 Per-module headers

Every module extracted by a phase gets a header comment stating what it
owns, what it depends on, and what depends on it. The existing header in
`chordFingering.js:1-7` is the standard to match — it explains the module's
role and why it is framework-free, which is exactly the information that
does not survive in the code itself.

### 3.3 Contracts at the definition site

Event shapes, the `Instrument`/channel interface, and barrel exports are
documented where they are defined, not in the consumers. A barrel file
(`src/*/index.js`) should read as the public surface of its folder.

### 3.4 What not to document

Do not narrate what the code already says. Document ownership, invariants,
signal flow, and cross-module contracts — the things that are true of the
system but not visible in any single file. If a comment restates the line
below it, delete the comment.

### 3.5 Definition of done

No phase is complete until `ARCHITECTURE.md` reflects its result. Treat this
as part of the phase's exit criteria, alongside the tests and screenshots.

### 3.6 Verification tooling — where the baseline lives, how to run it

Every phase step needs the same three checks: tests pass, the build gained
no new warnings, and the UI still renders. Repo-tracked scripts do all
three so their Bash invocations stay stable across sessions (fixed repo
path, not a new scratch-directory path every time) and their permissions
can be allowlisted once instead of re-approved per session:

- `npm test -- --watchAll=false` — unit tests (28 as of Phase 3).
- `bash scripts/check-build.sh` — runs `npm run build`, diffs the ESLint
  warnings block against the committed baseline at
  **`docs/build-baseline.txt`**, and reports what changed. See the
  `check-build` skill for the full workflow, including how and when to
  refresh the baseline (`bash scripts/check-build.sh --update-baseline`,
  committed alongside the change it validates). The baseline currently
  reflects the tree as of the Phase 3 barrel step (219 warnings,
  2026-08-01) — every phase after that should leave it unchanged unless a
  warning genuinely moved or was cleaned up.
- `bash scripts/dev-server.sh {start|stop|status}` +
  `node scripts/screenshot.js --out <dir> --tabs "..."` — starts/stops the
  CRA dev server and drives it with Playwright to screenshot the UI. See
  the `run-app` skill. `docs/baseline-screenshots/` holds the Phase 0
  reference screenshots (fretboard, scale table, progression builder, synth
  tab) that later phases were verified against by eye.

Scratch output from both scripts (build logs, one-off screenshots) goes to
`.tmp/` (gitignored) — don't commit anything from there; commit
`docs/build-baseline.txt` itself when it's intentionally updated.

---

## 4. Phases

Ordered so each is independently verifiable and the timing-sensitive work
comes last. Commit after each phase so anything can be bisected.

### Phase 0 — Safety net

Without this the rest is guesswork.

1. Fix `npm test` — delete the stub assertion in `App.test.js` or the file.
2. Add characterization tests for the pure functions Phases 2–4 relocate.
   These are already pure, so the tests are cheap and they cover exactly
   what moves:
   - `parseChordToken`, `resolveRomanChord`, `romanToDegree`,
     `parseRomanNumeral` (`progressionBuilder.js`)
   - `Fretboard.calculateNote`, `findChordPatternMatches`,
     `calculateChordPatternPositions` (`frets.js`)
   - `getScaleNotes` (`scales.js`), `noteToMidi` / `noteToName` (`midi.js`)
3. Capture baseline screenshots with the `run-app` skill: fretboard, scale
   table, progression builder, synth tab.

4. Seed `ARCHITECTURE.md` (§3.1) with the *current* shape, including the
   two AudioContexts and the split timing model. Documenting the mess before
   changing it makes each later phase a diff against a known baseline.

Exit criteria: `npm test` green, screenshots archived, `ARCHITECTURE.md`
seeded.

### Phase 1 — Delete

Mechanical, near-zero risk. Git history preserves everything.

1. `index.js`: strip commented-out blocks. **5,777 → ~250 lines.**
2. Remove the seven orphan modules listed in 2.5 (including `staves.js`).
3. Remove the empty `src/polysynthFull/` tree.
4. Remove `Untitled-1.ipynb`.
5. Merge `src/util.js` into `src/util/util.js`, update importers.

Expected: ~10,000 lines gone, zero functional change. Verify against
Phase 0 screenshots.

**Result (2026-08-01):** `index.js` landed at 281 lines - every live
(uncommented) statement was kept as-is, in its original relative order,
including a few pieces of live-but-inert leftover cruft (a handful of
now-pointless empty function stubs, an unused destructure, a literally
duplicated `reportWebVitals()` boilerplate call) that a stricter dead-code
pass could still remove later; none of it is behavior-visible today, so it
was left alone rather than turning a comment-stripping phase into a
judgment-call phase. Step 5 turned out to be pure deletion, not a merge:
`src/util.js` had zero importers anywhere in `src`, while `src/util/util.js`
already contained everything in it plus more (NOISE, ENVELOPE_SHAPE,
generateEnvelopeCurve, extra WAVEFORM entries) and already had four live
importers. No importer updates were needed.

### Phase 2 — Extract `src/theory/`

The keystone. One home for the primitives duplicated in 2.2, no DOM
imports anywhere in the folder.

```
src/theory/notes.js       CHROMATIC, normalize, parse, toMidi, fromMidi,
                          transpose, enharmonic preference
src/theory/intervals.js   semitone -> label, interval colors
src/theory/scales.js      existing scales.js, data only
src/theory/chords.js      chord spelling, suffix derivation
src/theory/roman.js       roman parsing/resolution, lifted from
                          progressionBuilder.js:549-1073
```

Then replace all 20 chromatic-array copies and the duplicate helpers with
imports. Phase 0's tests cover this directly.

This phase is what makes 3–5 tractable: every large file currently carries
its own theory tail, and those tails are most of what makes the files look
unrelated to each other.

**Result (2026-08-01):** landed as five modules instead of four -
`notes.js`, `notation.js`, `chords.js`, `intervals.js`, `roman.js` - and
`scales.js` was deliberately **not** moved. Both deviations came from
verifying rather than assuming the "duplicate" characterizations in §2.2:
several pairs that share a name (`midi.js`/`notation.js`'s
`noteToMidi`/`noteToName`; `MiniPiano.js`/`MiniStave.js`'s
`normalizeNoteName`; `MiniPiano.js`'s `extractOctave` vs `MiniStave.js`'s
`parseNoteWithOctave`; `MiniPiano.js`'s `getSemitoneFromRoot` vs `frets.js`'s
`getSemitoneFromReference`) turned out to have different behavior, not just
different code, so merging them would have been a behavior change disguised
as a refactor. They were left in place, unmerged - full detail, including
why `scales.js` stays split between data and DOM (mirroring `chords.js`) and
why that split is Phase 4's job, is in `ARCHITECTURE.md` §6.1/§6.2.

What *did* land: the verified-identical pieces - the 12-note chromatic array
(all 20 copies), the natural-note semitone map (6 internal copies inside
`notation.js` alone, plus `tuning.js`'s), `normalizeNote2`/`normalizeNote`'s
shared body, and the interval-color/label tables duplicated between
`MiniPiano.js` and `frets.js` - are now single sources of truth. Roman
numeral parsing/resolution moved to `roman.js` with one signature change:
`resolveRomanChord`/`resolveFallbackRomanChord` take `useSeventhChords` as
an explicit parameter (default `false`) instead of closing over
`progressionBuilder.js`'s module-level toggle, so the new module doesn't
import back into the file it came from; all three call sites were updated
to pass it explicitly, and the Phase 0 characterization test's one-argument
call keeps passing unchanged against the parameter default. Two `Fixed a
latent bug while moving code` items ended up being "confirmed pre-existing,
not introduced here" instead: `src/intervals.js` (now `theory/chords.js`)
already had a load-bearing import of `chords.js`'s DOM-heavy suffix-list
data (it looked dead - shadowed everywhere else by `matchChord`'s own
`chords` parameter - until deleting it broke `identifySyntheticChords`),
and `scales.js` &lt;-&gt; `intervals.js` already had a circular import before this
phase; both were kept exactly as they were, not "fixed," since fixing
either is a real behavior-neutral refactor of `chords.js`/`scales.js`
themselves, out of scope for a phase whose file wasn't `chords.js` or
`scales.js`. `npm test` (28/28) and `npm run build` pass; verified visually
against the Phase 0 baseline screenshots via the `run-app` skill, plus a
same-harness A/B screenshot comparison against the pre-Phase-2 commit to
rule out a rendering difference the first comparison surfaced (it turned
out to be pre-existing Playwright-timing flakiness in this app, reproducing
identically on unmodified code, not a regression - see the commit for
detail if this needs re-verifying later).

### Phase 2b — Extract `src/audio/`: one context, one bus, one dispatcher

Added by the session-mode investigation. Independently worth doing — these
are live bugs, not just future blockers. Scoped to the foundation only —
the clock/scheduler half moved to `SESSION_MODE_FEASIBILITY.md` (see the
result note below for why).

Today there are **two AudioContexts** (`PolySynth.jsx:67` and
`metronome.js:236/246/570`), bridged by `performanceTimeToAudioTime()` and a
stored offset that will drift.

```
src/audio/context.js      the single shared AudioContext, created once
src/audio/bus.js          master sum -> gain -> analyser tap -> destination
src/audio/dispatch.js     tagged note event -> channel registry
```

Migrate `PolySynth.jsx`'s and `metronome.js`'s independent `AudioContext`s
onto the shared one. `dispatch.js` subsumes `window.polySynthRef`, the
highest-traffic global in Phase 5, at ~16 live call sites across the three
entry points (keyboard, mouse, programmatic) documented in
`ARCHITECTURE.md` §3.

While in here, make the AudioWorklet paths in `noiseGenerator.js:21-23`
relative via `process.env.PUBLIC_URL`. They currently load from the domain
root and work only because `liz.moe` root serves the same files as
`/uncaged/` — verified 2026-08-01. If that ever changes, every worklet
silently degrades to `ScriptProcessor` with just a `console.error`.

Do this after Phase 1 and alongside or after Phase 2. It does not depend on
Phases 3–4.

**Result (2026-08-01):** landed as scoped - `src/audio/context.js`,
`src/audio/bus.js`, `src/audio/dispatch.js`, plus the `noiseGenerator.js`
worklet-path fix. `PolySynth.jsx` and `metronome.js` both now import the one
shared `audioContext` instead of constructing their own; `PolySynth.jsx`'s
master chain now terminates at `masterBus` instead of `AC.destination`
directly (a plain unity-gain `GainNode` in between - no audible change).
The metronome's click intentionally still bypasses the master bus, only the
context is shared, not the routing - see `ARCHITECTURE.md` §2.2.

Before writing `dispatch.js`, checking the actual `window.polySynthRef` call
sites (not just the reference count in §2.1) surfaced that it carries two
unrelated things: a **playback surface** (`playNotes`/`stopNotes`/
`stopAllNotes`/`isActive`/`activate`/`triggerChord`) used at the three entry
points this section describes, and a **progression-sequencer-control
surface** (`getProgressionSequencerState`/`toggleProgressionSequencer`/
`setProgressionRate`/`setProgressionDuration`/`setProgressionData`/
`updateProgressionSettings`) used only inside `progressionBuilder.js`'s own
sequencer UI - one component remote-controlling another's internal feature,
not note dispatch. Per a mid-phase decision, `dispatch.js` migrated only the
playback surface (`index.js`'s keyboard/mouse entry points, `frets.js`'s
`playChordVoicing`, `progressionBuilder.js`'s `triggerChordProgression`,
`MiniPiano.js`'s `getActivePolySynth`); the sequencer-control surface
(~40 references) stays on `window.polySynthRef` until `progressionBuilder.js`
has a real module boundary (Phase 4). `IntervalPractice.jsx`'s
`getPolySynthRef()` helper (2 references) was also left untouched - it
bundles playback with a third, unrelated microtonal-tuning surface
(`getPitchValues`/`setPitchValues`/`resetMicrotonalPitches`) in one function,
and splitting just the playback half out would have meant duplicating the
helper for no structural benefit. Full detail in `ARCHITECTURE.md` §3.1 and
§5.1. `npm test` (28/28) and `npm run build` pass; verified visually via the
`run-app` skill (fretboard, scale grid, chord progression, synth tabs) with
zero browser console/page errors, including after exercising the keyboard
note-play path through the new registry.

`clock.js`/`scheduler.js` were originally sketched here as a follow-on
"Phase 2c," deferred until something needed a timing grid. On 2026-08-01
that "something" got a concrete shape — a Timing Grid tab (BPM/time
signature/bar count, a moving playhead, per-instrument lanes fillable
manually or from the Chord Progression tab) — which is new user-facing
behavior, not restructuring, so it doesn't belong in this plan's phase list.
That work, including `clock.js`/`scheduler.js` and the `setTimeout`
migration, now lives entirely in `SESSION_MODE_FEASIBILITY.md`'s Stage 2.
`src/audio/` gets no further phases in *this* plan — Phase 2b's foundation
is what the rest of the refactor (Phases 3-5) needed from it.

### Phase 3 — Split `frets.js`

Along the seams already visible in the file.

```
src/fretboard/Fretboard.js          the class, DOM rendering only
src/fretboard/geometry.js           fret positions, note-at-position math
src/fretboard/markers.js            marker/shape drawing, createNoteShapeMarker
src/fretboard/patterns.js           CAGED matching, fingering shapes
src/fretboard/state.js              the ~20 module-level `let`s + persistence
src/fretboard/ui/controls.js        the 1,137-line panel, split per control group
src/fretboard/ui/chordGrid.js
src/fretboard/ui/scalePositionGrid.js
src/fretboard/index.js              barrel, re-exports today's 24 exports unchanged
```

The barrel keeping the existing public surface means **no import site
outside the folder changes**, which keeps this phase reviewable as a pure
move. Extract `state.js` first — the panel builders can't move until the
state they mutate has a home.

Note: `chordFingering.js` and `chordPatterns.js` are domain logic, not
fretboard UI helpers — they produce `{string, fret, finger}` voicings that a
future string-synthesis engine depends on. Keep them out of
`src/fretboard/ui/`; they belong next to `src/theory/`.

**Progress (2026-08-01), step 1/8 - `state.js`:** landed as planned, with
one deviation the plan's one-liner didn't anticipate: ES module named
exports are live bindings importers cannot reassign, and `frets.js` writes
to most of these ~28 values from dozens of call sites, so `state.js`
exports one mutable object (`fretboardState`) rather than individual `let`s
- full reasoning in `ARCHITECTURE.md` §6.3. All ~188 bare-identifier
read/write sites in `frets.js` were mechanically rewritten to
`fretboardState.<name>`, except the one pre-existing local shadow inside
`initializeFretboard()` (its own `const mainFretboard`, unrelated to the
module-level pointer). One consequence reached outside `frets.js`: the
barrel's `export { currentDisplayedChord }` couldn't stay a live binding as
a re-exported object property, so the barrel now exports `fretboardState`
instead, and its two external consumers (`chords.js`, `index.js`) were
updated to read `fretboardState.currentDisplayedChord` - the only
Phase-3-so-far change outside `frets.js`/`src/fretboard/`. `npm test`
(28/28) and `npm run build` pass; verified via the `run-app` skill (default
load, Scale Position Grid tab, Other Controls chord-grid tab) with zero
console errors. Remaining steps: geometry, markers, patterns, the
`Fretboard` class, the three UI builders (`controls`/`chordGrid`/
`scalePositionGrid`), then the barrel.

**Progress (2026-08-01), step 2/8 - `geometry.js`:** landed with no
surprises, unlike step 1. `calculateNote`/`extractNoteName`/`extractOctave`
were already `this`-free despite being class methods; `calculateFretPosition`/
`getNoteAt`/`findNotePositions` only needed `this.fretPositions`/
`this.tuning`/`this.fretCount` passed in as plain-data parameters - none of
the six touch the DOM. The `Fretboard` class methods of the same names are
now one-line delegates, the same shape the file already used for
`getPatternsByChordType`. Full detail in `ARCHITECTURE.md` §6.4. `npm test`
(28/28) and `npm run build` pass; a `run-app` screenshot came back
pixel-identical to the pre-checkpoint baseline. Remaining steps: markers,
patterns, the `Fretboard` class, the three UI builders, then the barrel.

**Progress (2026-08-01), step 3/8 - `markers.js`:** landed as planned,
verbatim - `createNoteShapeMarker` was already self-contained (position/
size/shape-name in, one detached SVG element out), so this was a pure
move, no delegation shim needed since it was already a standalone function,
not a class method. Full detail in `ARCHITECTURE.md` §6.5. `npm test`
(28/28) and `npm run build` pass; a `run-app` screenshot came back
pixel-identical to the pre-checkpoint baseline. Remaining steps: patterns,
the `Fretboard` class, the three UI builders, then the barrel.

**Progress (2026-08-01), step 4/8 - `patterns.js`:** landed as planned.
`calculateChordPatternPositions`, `findChordPatternMatches` and
`findOptimalChordShape` became parameterized pure functions (tuning/
fretCount passed in, geometry.js called directly); the class keeps
one-line delegates for all three, same shape as the geometry.js/markers.js
steps. `displayChordWithPatterns`/`showAllChordPatterns` stayed put - they
call `this.clearMarkers()`/`this.drawChordShape()`, real DOM writes, so
they're display logic, not pattern matching. One unused import
(`isStandardGuitarTuning`) fell out of `frets.js` as a result and was
removed rather than left to warn. Full detail in `ARCHITECTURE.md` §6.6.
`npm test` (28/28, including the two most specific Phase 0 characterization
tests) and `npm run build` pass; zero console errors on a `run-app` load
check. Remaining steps: the `Fretboard` class, the three UI builders, then
the barrel.

**Progress (2026-08-01), step 5/8 - `Fretboard.js`:** the class (1,719
lines) moved verbatim - by this point its geometry/marker/pattern methods
were already thin delegates, so this was mechanical. One real gap
surfaced: `getIntervalLabelFromRoot`, needed by both the class and two of
`frets.js`'s own functions, couldn't live in either file without creating
a circular import, so it moved to `geometry.js` instead (caught immediately
by `npm run build`'s `no-undef` check, not a silent bug). `GUITAR_TUNING`/
`FRET_COUNT`/`SCALE_COLORS`/`DEFAULT_COLORS`/`addInteractiveEvent` moved
into `Fretboard.js` alongside the class since they had no better home;
`frets.js` imports the four it still needs back from there. Full detail,
including why this one-way dependency direction isn't circular, in
`ARCHITECTURE.md` §6.7. `npm test` (28/28) and `npm run build` pass;
`run-app` screenshots of three tabs exercising different `Fretboard`
instances came back with zero console errors, main fretboard pixel-identical
to every prior checkpoint. Remaining steps: the three UI builders, then the
barrel.

**Progress (2026-08-01), step 6/8 - `src/fretboard/ui/controls.js`:** landed
as five functions moved together (`createTabbedPanel`, `attachHotkeyFooter`,
`createInstrumentTuningPicker`, `createTopBar`, `createFretboardControls`) -
none were called from outside this cluster, so unlike earlier steps this one
needed no external call-site updates, just `frets.js`'s `initializeFretboard()`
switching to an import. `createFretboardControls` (1,137 lines) was split
per control group into `buildDisplayControls`/`buildNoteMarkingControls`/
`buildNoteSearchControls`/`buildChordVisualizationControls`/
`buildChordPatternDemoControls`/`buildOtherControlsPanel`, matching the
source's own comment-delimited groups rather than a guessed split - reading
the function end-to-end first showed most of those groups build buttons that
are never appended to the DOM (dead code kept exactly as inert as it already
was, not cleaned up). This step introduced a real two-way import between
`frets.js` and `controls.js` (button handlers need glue functions that stay
in `frets.js`; `frets.js` needs `createFretboardControls` back) - safe for
the same reason the pre-existing `chords.js`/`theory/chords.js` cycle is
(nothing is read at module top-level), not a new pattern, but worth flagging
since steps 1-5 didn't need one. Full detail, including the exact
cross-imported name list, in `ARCHITECTURE.md` §6.8. `npm test` (28/28) and
plain `npm run build` pass with the identical 200 pre-existing warnings
(diffed line-by-line, zero new ones); `run-app` screenshots (default load,
Other Controls tab, Scale Position Grid tab) show zero console errors and
correct rendering. Remaining steps: chord grid, scale position grid, then
the barrel.

**Progress (2026-08-01), step 7/8 - `src/fretboard/ui/chordGrid.js`:**
landed as sixteen functions moved together (the Chord Pattern Grid button
table plus the entire chord-fingering-shape pipeline it shares with the
Roman-numeral chord display), matching the plan's §6.1 categorization with
one addition the sketch missed - `normalizeIntervalLabel` belongs here too,
kept private since it has no caller outside `buildIntervalLabelMap`. Unlike
steps 1-6, this one isn't independent of the still-unmoved Scale Position
Grid code: `createScalePositionMiniFretboard`/`renderScalePositionGrid`
(still in `frets.js`) call six of the moved functions plus the moved
`SEMITONE_TO_SCALE_INTERVAL_LABEL` constant, so `frets.js` picked up a
substantial new import list from `chordGrid.js` - one-directional, not a
new cycle, and expected to shrink once the Scale Position Grid code moves
into its own module and can import `chordGrid.js` directly. `controls.js`
was repointed to import `clearFingeringTabs`/`createChordButtonGrid`/
`updateChordGridColors` from `./chordGrid` directly rather than continuing
to cross-import them through `frets.js`, shrinking that temporary list
further (it now holds only the still-unmoved `createScalePositionGrid`/
`renderScalePositionGrid`, plus two newly-added entries -
`playChordVoicing`/`getChordVoicingNotes` - that `chordGrid.js` itself
needs back from `frets.js`). Two imports fell out of `frets.js` as a
result and were removed rather than left to warn: `classifyFingeringSource`
(`chordFingering.js`) and `addInteractiveEvent` (`Fretboard.js`). Full
detail in `ARCHITECTURE.md` §6.9. `npm test` (28/28) and plain `npm run
build` pass - total warning count unchanged at 219, `frets.js` reduced to
exactly its three pre-existing warnings, zero new ones in `chordGrid.js`/
`controls.js`. `run-app` screenshots (default load / Scale Position Grid
tab, the Scale Information tab where the Chord Pattern Grid actually lives,
and a hover+click on a grid cell to exercise the cross-imported glue) show
zero console errors and correct rendering. Remaining steps: scale position
grid, then the barrel.

**Progress (2026-08-01), step 8/8 - `src/fretboard/ui/scalePositionGrid.js`:**
landed as twenty functions plus six config constants, already contiguous in
`frets.js` unlike the chord-grid group, so this was mechanical. Not
independent of `chordGrid.js` the way steps 1-6 were independent of each
other: `createScalePositionMiniFretboard`/`renderScalePositionGrid` call
six functions and one constant from `chordGrid.js`, a dependency `frets.js`
was carrying on its behalf since step 7 - one-directional, not a new cycle.
`controls.js` was repointed to import `createScalePositionGrid`/
`renderScalePositionGrid` from `./scalePositionGrid` directly instead of
cross-importing through `frets.js`, the same treatment step 7 gave
`chordGrid.js`'s three names; `frets.js`'s temporary cross-import block is
now down to exactly the glue `chordGrid.js`/`controls.js` still need back.
Seventeen now-unused imports fell out of `frets.js` as a result and were
removed rather than left to warn (`FRET_COUNT`, `getIntervalColor`,
`noteArrayContains`, `areEnharmonicEquivalent`, two `notation.js` aliases,
`normalizeNote`, `assignFingers`, `selectGripFromPositions`,
`createNoteShapeMarker`, plus seven chord-grid-only names and
`createScalePositionGrid` itself that a first build pass surfaced were no
longer called anywhere in `frets.js`). Full detail in `ARCHITECTURE.md`
§6.10. `npm test` (28/28) and plain `npm run build` pass - total warning
count unchanged at 219; `scalePositionGrid.js` carries exactly the four
warnings that moved with its code verbatim (one pre-existing unused const,
three pre-existing `eqeqeq`), `frets.js` down to its two remaining
pre-existing ones, zero new warnings anywhere. `run-app` screenshots
(default load / Scale Position Grid tab - pixel-identical to every prior
checkpoint, a Pattern Size slider drag to confirm the re-render path, and
the Scale Information tab's Chord Pattern Grid to confirm `chordGrid.js` is
unaffected) show zero console errors. This closes Phase 3's
function-extraction work - `frets.js` is now pure glue. Remaining: the
barrel (`src/fretboard/index.js`).

**Progress (2026-08-01), final step - the barrel, `src/fretboard/index.js`:**
`frets.js`'s remaining ~1,120 lines of glue moved verbatim (import paths
only) into `src/fretboard/index.js`, and `src/frets.js` was deleted - not
kept as a re-export shim, since the plan names the barrel as the eighth and
final target, not a ninth file. This is the one point in Phase 3 where
import sites outside `src/fretboard/` had to change, by design (every
earlier step kept `frets.js`'s own export list stable specifically so nothing
outside it needed touching until this step): `src/chords.js`, `src/index.js`
(the app entry point - a different file from this barrel despite the shared
basename) and the Phase 0 characterization test file all now import `from
'./fretboard'`; the test file was also renamed `frets.test.js` →
`fretboard.test.js` since the file it was named after no longer exists.
`ui/controls.js` and `ui/chordGrid.js`'s cross-imports of glue functions
repointed from `'../../frets'` to `'..'` (this barrel) - same two-way-import
shape as before, just a new target name; `ui/scalePositionGrid.js` needed no
change since it never imported from `frets.js` directly. Historical `Lifted
from src/frets.js` provenance comments in the already-extracted modules were
left alone (accurate statements about where code came from, not about where
it lives now); a handful of comments describing *current* relationships were
updated where they'd otherwise mislead - full list in `ARCHITECTURE.md`
§6.11, which also covers why a few `frets.js` mentions in files this phase
never touched were left as pre-existing, out-of-scope quirks. `npm test`
(28/28) and plain `npm run build` pass - total warning count unchanged at
219, `src/fretboard/index.js` carries exactly the two pre-existing
`frets.js` warnings that moved with the glue code, zero new warnings
anywhere. `run-app` screenshots of all six tabs show zero console errors,
including the Synthesizer tab specifically - the one place a documented
historical race (React's portal mount into `#fretNotPlaceholder` vs.
`initializeFretboard()`'s re-run) lived, so confirming it still mounts
cleanly after this much import-graph surgery was the highest-value check
available.

**Phase 3 is complete.** `src/frets.js` (originally 6,974 lines, 5,837 live)
is now nine files under `src/fretboard/`, and every external consumer
imports the folder as a unit.

### Phase 4 — Split the other two

Same treatment, same barrel trick.

```
src/progression/parse.js      tokenizing, chord/roman parsing
src/progression/resolve.js    roman -> concrete chord, transposition
src/progression/share.js      URL encode/decode/apply (4285-4599)
src/progression/ui/*.js       input, controls, display, mini-fretboard, pattern selector
src/progression/index.js      barrel

src/scales/state.js           selection state + persistence
src/scales/ui/rootNoteTable.js
src/scales/ui/scaleTable.js
src/scales/ui/infoPanel.js
src/scales/index.js           barrel
```

`progressionBuilder.js`'s first ~1,200 lines are already cleanly
separable from its DOM half — start there.

**Progress (2026-08-01), step 1 - `src/progression/state.js`:** landed as
planned, with the addition of a `state.js` the plan's own sketch didn't
list - not needed to spell out for `src/fretboard/`, but `progressionBuilder.js`
turned out to have the same shape `frets.js` did: ~15 module-level `let`s
most of the file's functions close over, several of them fully reassigned
(not just mutated-in-place) elsewhere, so the same `fretboardState`-style
mutable-object pattern applied - `progressionState`, one object, every bare
read/write site rewritten to `progressionState.<name>`. Full detail,
including two things this step's verification caught (a live external
dependency on `window.currentProgression`/`progressionState.currentProgression`
sharing one array identity for `PolySynth.jsx`'s in-place mutation, and a
spread-syntax false-negative in the mechanical rename pass caught by
`npm run build`, not silently), in `ARCHITECTURE.md` §6.12. `npm test`
(28/28) and plain `npm run build` pass (219 warnings, unchanged - only line
numbers shifted); verified via the `run-app` skill including actually
typing a progression and toggling two of the migrated state fields
(`showMiniPianos`, `useSeventhChords`) to confirm they drive re-render
end-to-end, not just at parse time - zero console errors. Remaining steps:
`parse.js`, `share.js`, the `ui/*.js` split, then the barrel.

**Progress (2026-08-01), step 2 - `src/progression/parse.js`:** landed as
planned - the eight named functions turned out to already be one
contiguous block right after the state block step 1 removed, so this was a
pure cut-and-paste with import paths adjusted, no reordering. Two functions
the block calls (`getChordDisplayName`, `getFretboardForProgression`) were
left behind in `progressionBuilder.js` rather than moved, since both are
called more from code that stays there than from what moved - `parse.js`
imports them back, the same two-way-import shape Phase 3 used for
`ui/controls.js`/`ui/chordGrid.js` <-> `frets.js` (now `src/fretboard/index.js`).
That required adding both to `progressionBuilder.js`'s own export list,
where they weren't exported before. Three now-dead imports
(`parseChordToken`, `getActiveInstrumentConfig`, `selectGripFromPositions`)
fell out of `progressionBuilder.js` as a result and were caught by
`scripts/check-build.sh`'s diff (three new `no-unused-vars` hits on the
first build after the move) rather than left in. Full detail in
`ARCHITECTURE.md` §6.13. `npm test` (28/28) and plain `npm run build` pass -
219 warnings, unchanged, the one warning inside the moved block relocated
to `parse.js` verbatim. Verified via `run-app`: typed a progression, edited
it incrementally (exercising `updateProgressionIncremental`/
`compareTokenArrays`, not just full reparse), and switched a chord's
pattern-selector dropdown to confirm `precomputePatternData`/
`getChordPatternMatches` still drive the displayed voicing correctly -
zero console errors. Remaining steps: `share.js`, the `ui/*.js` split, then
the barrel.

**Progress (2026-08-01), step 3 - `src/progression/share.js`:** landed as
planned - the nine URL-sharing functions were another contiguous block (the
file's tail, right before the export statement), so another straight
cut-and-paste. Only `updateProgression` needed a cross-import back into
`progressionBuilder.js`, for `applySharedState`'s one fallback call site.
Two now-dead imports (`setPrimaryRootNote`/`setPrimaryScale`) fell out of
`progressionBuilder.js` the same way step 2's did - caught by
`scripts/check-build.sh`'s diff, not left in. Full detail in
`ARCHITECTURE.md` §6.14. `npm test` (28/28) and plain `npm run build` pass -
219 warnings, unchanged. Verified via `run-app` with a real round trip this
step's own code made possible: built a progression, toggled a UI flag,
clicked Share, then navigated to the resulting URL fresh in the same
browser session and confirmed the progression, pattern selections, and
toggle all restored correctly - zero console errors. Remaining steps: the
`ui/*.js` split, then the barrel.

**Investigation (2026-08-01), before starting the `ui/*.js` split:** the
remaining ~3,300 lines don't split cleanly along the plan's original
`input.js`/`controls.js`/`display.js`/`miniFretboard.js`/`patternSelector.js`
sketch - tracing actual call sites (not just function names/position, the
same lesson §6.15 below re-learned the hard way with
`getFretboardForProgression`) found six clusters instead:

- **playback** (~180 lines) - landed as `playback.js`, see step 4/§6.15.
- **chord card** (~1,160 lines) - `createChordElement` ->
  `createPatternSelector` -> `createMiniFretboardVisualization` ->
  `copySvgAsPng` -> `showNotification`, plus `lightenColor`. Tightly
  coupled, one file, not further split.
- **fretboard display** (~190 lines) - `displaySingleChordPattern`,
  `displayScaleContext`, `displayAllChordPatterns`. Called by the chord-card
  cluster (hover), scale sync, controls, and `clearProgression`.
- **scale sync** (~256 lines) - `setupScaleChangeListener`,
  `initializeScaleNotesDisplay`, `updateScaleNotesDisplay`,
  `generateFallbackScaleNotes`, `updateProgressionDisplayForScaleChange`,
  `updateRomanNumeralChords`.
- **progression list** (~118 lines) - `createProgressionDisplaySection`,
  `updateProgressionDisplay`, `highlightCurrentChord`.
- **input** (205 lines) - `createInputSection`, self-contained.
- **controls** (912 lines) - `createProgressionControlsSection`, needs the
  same per-control-group split `createFretboardControls` got in Phase 3.
  Still has ~40 direct `window.polySynthRef` reads/writes for the
  progression-sequencer-control surface `ARCHITECTURE.md` §5.1 deferred
  until this file has "a real module boundary" - that's what this phase is
  building, but migrating those references off `window` is still Phase 5's
  job, not this one's.

The residual - `createChordProgressionUI`, `updateProgression`,
`clearProgression`, `getChordDisplayName`, `getFretboardForProgression` -
is needed back by three or more of the files above each, the same shape
`frets.js` had before becoming `src/fretboard/index.js`'s barrel in Phase 3.
It isn't a file to further split; it's what `progressionBuilder.js` itself
turns into at the end of this phase.

Planned order (least-coupled first): `playback.js` (done) -> `scaleSync.js`
-> `fretboardDisplay.js` -> the chord-card cluster -> `progressionList.js`
-> `input.js` -> `controls.js` -> rename the residual to
`src/progression/index.js`, repointing `src/fretboard/ui/controls.js`'s one
external import.

**Progress (2026-08-01), step 4 - `src/progression/playback.js`:** landed,
with one correction to the investigation above: `getFretboardForProgression`
looked like part of this cluster by file position, but grepping its actual
call sites found none of the six playback functions call it - its three
real callers are all in the still-unmoved fretboard-display cluster, so it
stayed in `progressionBuilder.js` rather than moving. Of the six functions
that did move, three (`getProcessedChordNotes`, `getProcessedProgression`,
`triggerChordProgression`) are called from code that hasn't moved yet
(controls, chord card), so those three are this module's export list;
`convertNoteForPolySynth`/`getOneBeatDuration`/`getDurationInMs` stay
private. One now-dead import (`getChordPatternMatches`) fell out of
`progressionBuilder.js`, caught by `scripts/check-build.sh`'s diff. Full
detail in `ARCHITECTURE.md` §6.15. `npm test` (28/28) and plain `npm run
build` pass - 219 warnings, unchanged. Verified via `run-app`: clicked a
chord card and confirmed the console log shows
`triggerChordProgression` -> `getProcessedChordNotes` -> the cross-imported
`getChordDisplayName` resolving correctly - zero console errors. Remaining
steps: `scaleSync.js`, `fretboardDisplay.js`, the chord-card cluster,
`progressionList.js`, `input.js`, `controls.js`, then the barrel.

**Progress (2026-08-01), step 5 - `src/progression/scaleSync.js`:** landed
- another contiguous block, straight cut-and-paste. Only
`setupScaleChangeListener`/`initializeScaleNotesDisplay` have callers
outside the block (both from `createChordProgressionUI`), so those two are
exported; the other four stay private. Needed four cross-imports back into
`progressionBuilder.js` (`precomputeAllPatternData`,
`updateProgressionDisplay`, `displaySingleChordPattern`,
`displayAllChordPatterns` - none had moved yet, so none were exported
before this step). Full detail in `ARCHITECTURE.md` §6.16. `npm test`
(28/28) and plain `npm run build` pass - 219 warnings, unchanged.
Verification hit a false alarm worth remembering: the scale-notes display
text looked stuck after a root-note change, but `git stash`-ing back to the
pre-step commit reproduced the identical stuck text on unmodified code - a
pre-existing display bug, not a regression from this move. Confirmed the
actual logic instead: changing the root-note dropdown correctly re-resolved
every Roman-numeral chord in a live progression and their mini-fretboard
voicings (`I (Em)` -> `I (Am)` etc. when the root moved E -> A) - zero
console errors. Remaining steps: `fretboardDisplay.js`, the chord-card
cluster, `progressionList.js`, `input.js`, `controls.js`, then the barrel.

**Progress (2026-08-02), step 6 - `src/progression/fretboardDisplay.js`:**
landed - another contiguous block, straight cut-and-paste. This confirmed
step 4's finding: `getFretboardForProgression` (still textually sandwiched
between this block and the rest of the file) belongs to this cluster, not
`playback.js` - its three real callers, `displaySingleChordPattern`/
`displayScaleContext`/`displayAllChordPatterns`, are exactly the three
functions that moved here, so it stayed in `progressionBuilder.js` and all
three cross-import it back. A fourth cross-import went the other way:
`clearProgression` (staying in `progressionBuilder.js`) calls
`displayScaleContext` directly, so that's exported here too, not just the
two functions `scaleSync.js` already needed. `scaleSync.js`'s existing
cross-import of `displaySingleChordPattern`/`displayAllChordPatterns` was
repointed from `../progressionBuilder` to `./fretboardDisplay`, since
re-exporting them through `progressionBuilder.js` once they no longer live
there would just add an indirection. One now-dead import fell out of
`progressionBuilder.js` (`CHORD_LINE_CONFIG`), caught by
`scripts/check-build.sh`'s diff. Full detail in `ARCHITECTURE.md` §6.17.
`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged,
one line-number-only shift. Verified via `run-app`: built a progression,
hovered a chord card and confirmed an orange pattern line rendered on the
main fretboard, toggled "Show Scale Context" off/on, then clicked **Clear
Progression** and confirmed the fretboard reset to a full scale display
with no chord lines - zero console errors. Remaining steps: the chord-card
cluster, `progressionList.js`, `input.js`, `controls.js`, then the barrel.

**Progress (2026-08-02), step 7 - `src/progression/chordCard.js`:** landed
- another contiguous block: the six functions the plan named
(`createChordElement`, `createPatternSelector`, `createMiniFretboardVisualization`,
`copySvgAsPng`, `showNotification`, `lightenColor`) plus `getChordDisplayName`,
which the plan expected to stay behind but grepping its call sites (before
moving anything, the same check §6.15/§6.17 already used once each) found
had zero remaining callers in `progressionBuilder.js` once this cluster
moved - both were inside it. So it moved too, and `parse.js`/`playback.js`
had their existing cross-imports of it repointed from `../progressionBuilder`
to `./chordCard`. That creates two cross-import pairs between
already-extracted modules rather than with the residual
(`chordCard.js` <-> `parse.js`, `chordCard.js` <-> `playback.js`) - safe for
the same reason every other one is: nothing is read at module top level.
`updateProgressionDisplay` still hasn't moved out of `progressionBuilder.js`
(progression-list cluster, still pending), so `chordCard.js` cross-imports
that one back. Sixteen now-dead imports fell out of `progressionBuilder.js`,
caught by `scripts/check-build.sh`'s diff, same as every prior step. Full
detail in `ARCHITECTURE.md` §6.18. `npm test` (28/28) and plain `npm run
build` pass - 219 warnings, unchanged except one line-number-only shift.
Verified via `run-app`: built a progression with mini pianos and mini
staves enabled, confirmed all four cards rendered correctly (names, notes,
mini piano/stave, sharps correct for `V (Bm)`); changed a pattern-selector
dropdown and confirmed the main fretboard's pattern line updated to match;
clicked a card to trigger playback; right-clicked a mini-fretboard SVG and
confirmed the "downloaded as PNG" notification appeared - zero console
errors. Remaining steps: `progressionList.js`, `input.js`, `controls.js`,
then the barrel.

**Progress (2026-08-02), step 8 - `src/progression/progressionList.js`:**
landed - the plan's three named functions
(`createProgressionDisplaySection`, `updateProgressionDisplay`,
`highlightCurrentChord`), but not contiguous this time: `updateProgression`/
`precomputeAllPatternData` sit between the first and the other two and stay
behind (core residual orchestration and an already cross-imported function,
respectively), so the three moved individually rather than as one cut
block. First Phase 4 module with no cross-import back into
`progressionBuilder.js` at all - verified by grepping every call site
before moving, same as always, and none of the three touch anything that
hadn't already moved. `window.highlightCurrentChord = highlightCurrentChord`
moved with the function since nothing else in `progressionBuilder.js`
called it directly - PolySynth.jsx only ever reaches it through the global.
Repointed three existing cross-imports of `updateProgressionDisplay`
(`chordCard.js`, `scaleSync.js`) from `../progressionBuilder` to
`./progressionList`; `chordCard.js`'s repoint creates a second two-way pair
between already-extracted modules (`progressionList.js` <-> `chordCard.js`,
alongside step 7's `chordCard.js` <-> `parse.js`/`playback.js`). One
now-dead import (`createChordElement`) fell out of `progressionBuilder.js`,
caught by `scripts/check-build.sh`'s diff. Full detail in `ARCHITECTURE.md`
§6.19. `npm test` (28/28) and plain `npm run build` pass - 219 warnings,
unchanged except one line-number-only shift. Verified via `run-app`: built
a progression (4 cards rendered), toggled "Show Intervals" and confirmed
all 4 cards re-rendered correctly, then started the built-in sequencer and
read each card's `boxShadow` mid-playback - exactly one card showed the
green highlight at a time, confirming `window.highlightCurrentChord` ->
`highlightCurrentChord` works end-to-end from its new location - zero
console errors. Remaining steps: `input.js`, `controls.js`, then the
barrel.

**Progress (2026-08-02), step 9 - `src/progression/input.js`:** landed -
self-contained exactly as the investigation note predicted, one function
(`createInputSection`) cut and pasted as-is. Only cross-import is
`updateProgression` (core residual orchestration, already exported for
`share.js`'s cross-import in step 3 - this step just added a second
consumer to that export's comment). `INPUT_DEBOUNCE_DELAY` fell out of
`progressionBuilder.js`'s import as dead, caught by
`scripts/check-build.sh`'s diff. Full detail in `ARCHITECTURE.md` §6.20.
`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged,
with zero line-number shifts (the first step where `check-build.sh`
reported no diff at all). Verified via `run-app`: typed a progression
character-by-character to exercise the actual debounce timer (4 cards
appeared), appended a chord (5 cards), then selected-all and retyped a
shorter progression (3 cards) - each transition confirming the `input`
event -> debounce -> cross-imported `updateProgression` path works from
the new module - zero console errors. Remaining steps: `controls.js`, then
the barrel.

### Phase 5 — Replace `window` with an event bus

The only phase that can change timing behavior, hence last and
incremental.

1. Add `src/core/appBus.js` — small pub/sub.
2. Add `src/core/registry.js` — the few genuine singletons (fretboard
   instance, synth ref).
3. Migrate one global at a time, highest-traffic first: `polySynthRef`
   (~115 refs, largely subsumed by Phase 2b's dispatcher), then
   `updateFretboardsForScaleChange` (17). (`gridData` and `outputNoteArray`
   were originally listed here too but turned out to be dead code, not live
   globals — see the §2.1 correction and `ARCHITECTURE.md` §5.3. They need
   no migration; Phase 1 deleting `staves.js` removes them for free.)
4. Delete the polling loops in `App.js:47-59` and `index.js:5747` as their
   globals are migrated.

Test each global's migration against the Phase 0 screenshots before
starting the next.

### Phase 6 — PolySynth

Independent of 2–5; can run in parallel or be deferred. Note that the
channel architecture in `SESSION_MODE_FEASIBILITY.md` §2.2 wraps PolySynth
behind a `noteOn`/`noteOff` adapter rather than opening it, so this phase is
**not** a prerequisite for any session-mode work — it is pure cleanup, to be
done when convenient or not at all.

1. Group the 117 `useState` calls into `useReducer` per subsystem:
   oscillators, filter, envelope, effects, arpeggiator.
2. Extract each panel into its own component under
   `src/components/PolySynth/panels/`.

---

## 5. Sequencing

Phases 0–2 deliver most of the benefit for a fraction of the risk: ~10,000
lines deleted and the duplication root cause fixed, with no timing
behavior touched. Phase 2b is small and fixes live bugs. Phases 3–4 are
large but mechanical given the barrels. Phase 5 is the only one that
warrants caution — and it is now a prerequisite for session mode, since a
scheduler that sample-aligns drums, synth and pitch analysis cannot be
coordinated through `window.polySynthRef` polling loops.

Deliberately out of scope: consolidating the three styling systems,
migrating the vanilla-JS UI to React, and adding a build step beyond CRA.
Each is a bigger decision than this plan, and each gets easier once the
phases above are done.

---

## 6. Session kickoff prompt

Paste this to start or resume the work in a fresh session. It is written to
keep context cost low: the documents already contain the survey, so the
agent should not repeat it.

```
Work on the unCAGED refactor.

Read REFACTOR_PLAN.md first — section 3 has the working rules, section 4
the phases, and the Status table at the top shows what is already done.
Read ARCHITECTURE.md if it exists. Read SESSION_MODE_FEASIBILITY.md only
if the phase touches audio, instruments, or scheduling.

Do NOT re-survey the codebase. Those documents already record the file
sizes, duplication counts, module contracts and signal paths, and they
exist specifically so that investigation is not repeated. Trust them. If
you find something that contradicts them, fix the document as part of your
work rather than working around it.

Then:
1. Determine the next phase from the Status table, confirming against
   `git log --oneline -10`.
2. Tell me which phase you are starting and your first few steps. Wait for
   my go-ahead before editing anything.
3. Do only that phase. Do not begin the next one.

Rules:
- Restructuring only. No behavior changes unless the phase explicitly
  calls for them.
- Vanilla JS + React, no TypeScript, no new dependencies without asking.
  Match the style of the surrounding code.
- A phase is done when: tests pass, ARCHITECTURE.md reflects the result,
  the Status table is updated, and it is one commit.
- If something makes the plan wrong, update the plan and tell me. Do not
  silently deviate.
```

To resume at a specific phase, append a line such as `Start at Phase 2b.`
To pick up mid-phase, append what was already done and what remains.

### 6.1 Resuming Phase 3 at step 6/8 (the UI-builder split)

**Superseded 2026-08-01: Phase 3 is complete** - all 8 steps landed, see the
Phase 3 Result notes above and `ARCHITECTURE.md` §6.3-6.11. This whole
section is now historical (kept for the resume-prompt insights below, which
are still generally useful technique - live-binding exports, checking for
local shadowing before bulk renames, the delegate-method convention - for
whoever tackles Phase 4 or 5 next), not something to act on.

Steps 1-5 (`state.js`, `geometry.js`, `markers.js`, `patterns.js`,
`Fretboard.js`) are done, one commit each, `ARCHITECTURE.md` §6.3-6.7 and
the Result notes above cover what landed and why. What remains is the
largest, most interconnected part of Phase 3. Paste the block below to
resume it in a fresh session - it distills what steps 1-5 learned the hard
way, so step 6 doesn't repeat the same mistakes.

```
Resume REFACTOR_PLAN.md Phase 3 at step 6/8 - the UI-builder split.

Read REFACTOR_PLAN.md (Phase 3's Result notes, steps 1-5) and
ARCHITECTURE.md §6.3-6.7 first. Steps 1-5 already extracted state.js,
geometry.js, markers.js, patterns.js and Fretboard.js from frets.js,
each its own commit, each tests+build verified. Do NOT re-derive that
work or re-survey those files - trust the docs.

frets.js is now ~4,600 lines (was 6,940), all vanilla-JS UI construction
that mounts Fretboard instances and wires them to the DOM. The plan's
Phase 3 sketch names three targets:

    src/fretboard/ui/controls.js        the control panel builders
    src/fretboard/ui/chordGrid.js
    src/fretboard/ui/scalePositionGrid.js
    src/fretboard/index.js              barrel, re-exports today's
                                         exports unchanged

A first-pass categorization of frets.js's current top-level functions
(by line number, as of the step-5 commit) - verify this before trusting
it, it was made by scanning function names/line ranges, not by tracing
every call graph:

- Control panel: createTabbedPanel, attachHotkeyFooter,
  createInstrumentTuningPicker, createTopBar, createFretboardControls
  (the ~1,137-line one - split it per control group as the plan says,
  don't move it as one function)
- Chord grid: createChordButtonGrid, analyzeChordScaleCompatibility,
  getCurrentScaleNoteNames, getScaleIntervalEntries, deriveChordSuffix,
  buildDegreeHeaderLabel, getScaleDescriptor, getSemitoneFromReference,
  updateChordGridColors, buildIntervalLabelMap, buildFingeringShapes,
  getFingeringMarkerLabel, renderFingeringShape, clearFingeringTabs,
  renderFingeringTabs
- Scale Position Grid: findRowRootAbsoluteFret,
  getAbsoluteFretForDisplayColumn, shadeColor, getContrastTextColor,
  createScalePositionMiniFretboard, scalePositionCellKey and the ~12
  toggle/visibility helpers next to it, styleScalePositionFocusCell,
  buildScalePositionFocusMatrix, createScalePositionPlaceholderCell,
  renderScalePositionGrid, createScalePositionGrid
- Likely glue that stays close to the barrel rather than belonging to
  one UI builder (called from index.js/chords.js/progressionBuilder.js,
  not just from one panel): getChordVoicingNotes, playChordVoicing,
  showChordPatternOnFretboard, restoreFretboardState,
  showChordOnFretboard, showScaleOnFretboard, updateChordInfoDisplay,
  updateChordButtonStyles, updateFretboardsForScaleChange,
  searchFretboardNote(s), quickSearchAndMark, getFretboardNotes,
  analyzeFretboardNotes, createSubscaleBoxPattern, displayChordPatterns,
  showAllChordPatterns, quickChordPattern, createFretboard, getFretboard,
  initializeFretboard(WithScale) - check REFACTOR_PLAN.md Phase 3's note
  that the barrel must re-export today's public names unchanged before
  moving any of these.

Insights from steps 1-5, apply them here:

1. fretboardState is a mutable OBJECT (fretboardState.foo), not
   individual `let`s - ES module named exports are live bindings
   importers can't reassign, which is why state.js was built that way.
   Every new ui/*.js file reads/writes fretboardState.foo directly, same
   as frets.js does today - don't reintroduce bare module-level `let`s
   for anything that's actually shared state.

2. Before any bulk mechanical rename (e.g. if a helper moves and its
   call sites need updating across hundreds of lines), grep for
   `window.<name>` first. A naive word-boundary regex rename doesn't
   distinguish a bare identifier from a property access after `.` -
   step 1 shipped a bug where `window.mainFretboard` got rewritten to
   `window.fretboardState.mainFretboard` this way, caught before commit
   by grepping `window\.fretboardState\.` afterward. Do the same grep
   for any name you rename in bulk.

3. Check for local shadowing before bulk-renaming a name: a `const`/
   `let` inside a function body can share a name with something at
   module scope (step 1 found `initializeFretboard()`'s own local
   `const mainFretboard`, unrelated to the module-level one an the same
   name). `grep -c "\b(let|const|var)\s+<name>\b"` across the file - if
   it's more than 1, find the second declaration before renaming.

4. Before moving any function currently in frets.js's `export { ... }`
   barrel block, `grep -rn "from '\.\./frets'\|from '\./frets'" src` to
   find every external file importing it directly (not just via
   `window.*`). If the moved thing stops being a plain re-exportable
   binding (e.g. it becomes a property on some object), those external
   files need updating too - this happened once already:
   `currentDisplayedChord` became `fretboardState.currentDisplayedChord`,
   and chords.js/index.js both had to switch from importing the bare
   name to importing `fretboardState` and reading the property. Full
   writeup in ARCHITECTURE.md §6.3.

5. If a function is needed by two files that must not import each other
   (e.g. two sibling ui/*.js files, or a ui/*.js file and frets.js's own
   remaining glue), it needs a third home - don't guess, grep both
   sides' usage first. getIntervalLabelFromRoot needed this treatment
   in step 5 (moved to geometry.js since both frets.js and Fretboard.js
   needed it and neither could import the other) - full writeup in
   ARCHITECTURE.md §6.7.

6. Verify with `npm test` and plain `npm run build` - NOT `CI=true npm
   run build`. This repo has dozens of pre-existing ESLint warnings
   (unused imports, no-loop-func, eqeqeq, default-case, etc.) unrelated
   to this refactor; `CI=true` turns every warning into a build failure,
   which makes it look like the phase broke something when it didn't.
   Plain `npm run build` exits 0 with warnings printed - diff the
   frets.js/fretboard/* section of that warning list before vs. after
   your change to confirm you introduced nothing new (a genuinely new
   `no-unused-vars` hit almost always means an import that should have
   moved or been dropped).

7. The codebase already has a delegate-method convention for exactly
   this situation (a class/object method whose logic moved to a
   module-level function of the same name): `method(x) { return
   sameNameFunction(x); }`. It works because a bare identifier inside a
   method body resolves via lexical/module scope, not `this` - reuse it
   rather than inventing a different shim.

8. For DOM-heavy pieces, Playwright button/tab clicks in a run-app
   check are worth attempting but selectors here are fiddly - chord
   grid buttons aren't always plain <button> text matches, and
   `getByText(..., {exact:true})` can resolve to a hidden `<select>`
   `<option>` sharing the same text. If a selector fights back, prefer:
   (a) the existing unit tests, which already assert exact structured
   output for the pattern-matching path and are stronger evidence than
   a screenshot; (b) a zero-console-error page-load check plus a
   pixel-diff against the previous checkpoint's screenshot, which has
   caught every real regression so far without needing per-button
   interaction tests.

Work in the same checkpoint style as steps 1-5: one commit per module
(controls.js, then chordGrid.js, then scalePositionGrid.js, then the
barrel - or a different split if your verification of the categorization
above suggests otherwise), tests + build green before each commit,
ARCHITECTURE.md and the Status table updated per-checkpoint not just at
the end. Tell me your categorization and first steps before editing
anything, the same way the last session did.
```

To pick up mid-checkpoint within step 6 (e.g. controls.js half-done),
append what was already extracted and what remains, same as any other
mid-phase resume.
