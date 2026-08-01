# unCAGED Refactor Plan

Baseline measured 2026-07-31 at `09a1b37`.

## Status

**Update this table as part of each phase's commit.** It is how a new
session finds its place without re-reading the codebase.

| Phase | State | Commit | Notes |
|---|---|---|---|
| 0 — Safety net | done | `07a8b12` | `npm test` fixed (App.test.js + 4 new characterization test files, 28 tests); ARCHITECTURE.md seeded; baseline screenshots in `docs/baseline-screenshots/`; playwright added as devDependency |
| 1 — Delete | done | this commit | `index.js` 5,777 → 281 lines (stripped commented-out blocks only, no live statements removed); 7 orphan modules + empty `polysynthFull/` tree + `Untitled-1.ipynb` deleted; `src/util.js` deleted (zero importers - `src/util/util.js` was already the live superset, no merge needed) |
| 2 — `src/theory/` | not started | — | |
| 2b — `src/audio/` | not started | — | |
| 3 — Split `frets.js` | not started | — | |
| 4 — Split progression + scales | not started | — | |
| 5 — Kill the `window` bus | not started | — | |
| 6 — PolySynth | not started | — | optional, off critical path |

Goal: break the five oversized files into modules that match how the code
actually divides, and replace the `window`-object module bus with real
imports. No behavior changes — every phase below is restructuring only.

Longer-term target: a Rocksmith-style session/scale practice mode with
synthesized backing and play-along feedback. See `SESSION_MODE_FEASIBILITY.md`.
That investigation added Phase 2b below and moved Phase 5 onto the critical
path; nothing else here changed.

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

### Phase 2b — Extract `src/audio/`: one context, one clock

Added by the session-mode investigation. Independently worth doing — these
are live bugs, not just future blockers.

Today there are **two AudioContexts** (`PolySynth.jsx:67` and
`metronome.js:236/246/570`), bridged by `performanceTimeToAudioTime()` and a
stored offset that will drift. And sequencing is split across two timing
models: the metronome's audio-clock lookahead scheduler, versus chained
`setTimeout` with BPM read from a DOM slider in the progression sequencer
and arpeggiator (`progressionBuilder.js:155-190`, `PolySynth.jsx:945-1061`).

```
src/audio/context.js      the single shared AudioContext, created once
src/audio/clock.js        absolute timebase, lifted from metronome.js
src/audio/scheduler.js    lookahead scheduling, one queue for all voices
```

Then migrate the progression sequencer and arpeggiator off `setTimeout` onto
`scheduler`.

Split this by need: `context.js` plus a master bus is the foundation of the
channel architecture and comes first; `clock.js`/`scheduler.js` are only
required once something must lock to a grid (drums). See the staging in
`SESSION_MODE_FEASIBILITY.md` §4.

The same phase should add `src/audio/bus.js` (master sum → gain → analyser
tap → destination) and `src/audio/dispatch.js` (tagged note event → channel
registry). The dispatcher subsumes `window.polySynthRef`, the highest-traffic
global in Phase 5, at ~16 live call sites.

While in here, make the AudioWorklet paths in `noiseGenerator.js:21-23`
relative via `process.env.PUBLIC_URL`. They currently load from the domain
root and work only because `liz.moe` root serves the same files as
`/uncaged/` — verified 2026-08-01. If that ever changes, every worklet
silently degrades to `ScriptProcessor` with just a `console.error`.

Do this after Phase 1 and alongside or after Phase 2. It does not depend on
Phases 3–4.

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
