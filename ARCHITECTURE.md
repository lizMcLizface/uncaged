# unCAGED Architecture

Living document. Updated as `REFACTOR_PLAN.md` phases land — see that file for
what's left to do (its §1) and the documentation discipline this follows
(its §2.4). Seeded 2026-08-01 as the Phase 0 baseline (the pre-refactor
shape, warts included); current through Phase 4c and `PIANO_VIEW_PLAN.md`
steps 1-7, 2026-08-03. Sections describe the *current* shape, not an
aspirational one — planned features live in `SESSION_MODE_FEASIBILITY.md`
and `PIANO_VIEW_PLAN.md`. Features land here the same way phases do (§6.29
is the first): this file maps what exists, whichever plan produced it.

**A known-false claim in this file's header for its first three days, now
true (`PIANO_VIEW_PLAN.md` step 5, 2026-08-03):** `src/theory/intervals.js`
says its palette is shared "so a given scale tone reads as the same label and
color everywhere in the app: the scale piano, every chord piano, and the
fretboard." The label half was always true; **the color half was not**, and
the fretboard was the sole exception — `markScale` colored by *scale degree*
via `SCALE_COLORS`, so a ♭3 and a natural 3 were both "degree 3" and came out
the same yellow, while the Scale Position Grid and every MiniPiano gave them
different colors. Measured before the change: E Aeolian's ♭3 and E Ionian's
♮3 were both `rgb(255, 204, 68)`. After: `rgb(255, 211, 79)` and
`rgb(210, 242, 95)`. `SCALE_COLORS` is deleted. The claim now holds for every
instrument in the app. See §6.30.

**Where the detail lives:** §6 is indexed by *module* (§6.1-§6.28, one per
extracted module, in the order they landed) rather than by phase, so it stays
useful once the phases are history. §5 is the shrinking list of surviving
`window.*` globals and is what Phase 5 should be read against.

---

## 1. Runtime shape, in one paragraph

This is a Create React App page with two coexisting UIs that never fully
merged. The vanilla-JS half (`src/fretboard/` - split out of a single
`frets.js` by `REFACTOR_PLAN.md` Phase 3 - plus `progressionBuilder.js`,
`scaleGenerator.js`, `scales.js`, `chords.js`, …) builds the fretboard, scale
tables and chord-progression UI by direct DOM manipulation, mounted once from
`index.js`. The React half (`App.js` and everything under `src/components/`)
renders a handful of overlay controls and the PolySynth panel, which is
portaled into a `<div id="synthesizerTabContent">` that the vanilla side
creates as one of its tabs. The two halves talk to each other almost
entirely through `window.*` globals (§5) rather than imports, because
neither side can `import` the other without restructuring the load order.

---

## 2. Audio signal path

**Fixed in Phase 2b (2026-08-01): there is now one shared `AudioContext`.**
Until this phase there were two independent ones - `PolySynth.jsx:67` and
`metronome.js:236/246/570` - with no way to sample-sync them. Both now
import `audioContext` from `src/audio/context.js`, created once at that
module's import time. See §2.4 for the new `src/audio/` module layout.
The rest of this section describes the signal path in its current,
single-context shape; historical detail on the two-context bug is kept
where it explains *why* a boundary exists.

### 2.1 The synth context (`PolySynth.jsx`)

`PolySynth.jsx:67` imports the shared context from `src/audio/context.js`
(pre-Phase-2b: `const AC = new AudioContext();`, created independently at
this same module scope). All synth-related nodes (`PolySynth.jsx:69-89`)
are created at that same module scope, once, shared by every mounted
instance of the component (there is only ever one).

Signal path, source to destination:

```
8x MonoSynth voice (synthArr[0..7])
        |  each voice internally: (osc1 [+ osc2, sub-osc] mixed)
        |    + (noise -> filtered/bypass mix) -> envelope gain -> filter -> volume
        v
synthMix        (Compressor, acts as a limiter across the 8 voices: threshold -6dB, ratio 20)
        v
masterDistortion -> masterFlanger -> masterChorus -> masterPhaser
        v
masterBitCrush -> masterDelay -> masterPingPong -> masterReverb -> masterEQ2 -> masterFilter
        v
masterLimiter   (Compressor, threshold -6dB, ratio 20)
        v
masterGain
        v
masterBus (src/audio/bus.js - a plain GainNode at unity gain; the seam
           future instrument channels sum into)
        v
audioContext.destination
```

Wired in `initSynth()`, `PolySynth.jsx:1410-1470`, called lazily from
`activateSynth()` on first use rather than at mount.

Analysers (`SpectrumAnalyzer`, `Spectrogram`, `Oscilloscope`,
`PolySynth.jsx:3687,3874,3877`) tap `masterGain` in parallel — they receive
`{ audioCtx: AC, sourceNode: masterGain }` and create their own internal
`AnalyserNode`, they do not sit in the main chain.

Every audio node wrapper in `src/nodes/` (`Gain`, `Filter`, `Distortion`,
`Flanger`, `Chorus`, `Phaser`, `Delay`, `PingPongDelay`, `Reverb`, `LFO`,
`BitCrusher`, `Compressor`, `EQ2`, `StereoPanner`, `Oscillator`,
`NoiseGenerator`, `OscNoiseMixer`, `SignalGenerator`, `Source`) shares a
`.getNode()` / `.connect()` shape and is framework-free — safe to reuse for
the channel architecture below.

### 2.2 The metronome context (`metronome.js`)

The `Metronome` class (`metronome.js:157`) holds `this.audioContext = null`
until first needed, then lazily assigns the shared `audioContext` from
`src/audio/context.js` (`metronome.js:236,246,570` - pre-Phase-2b, each of
these lazily constructed its own, separate `AudioContext`/`webkitAudioContext`,
a second, independent clock with no relationship to `AC` above). Its click
sound is still a minimal, self-contained path: `osc -> envelope (GainNode)
-> audioContext.destination` (`metronome.js:490,509-510`) — **deliberately
left as-is in Phase 2b**: it still does not route through `masterBus`, only
the context is now shared, not the routing. Folding the click into the
master bus is unnecessary busywork until something else needs to mix with
it; the two-context bug (unsyncable clocks) is what Phase 2b was for.

Because the metronome still bridges `performance.now()` time to audio-clock
time via `performanceTimeToAudioTime()` and a stored `audioContextStartTime`
offset (`metronome.js:243-261`), that bridging code is unchanged by Phase
2b — it still works, now computed against the shared context instead of a
private one. Retiring it in favor of a single authoritative clock is
`SESSION_MODE_FEASIBILITY.md` Stage 2's job (§4), not this one's — see the
note there for why that work isn't a `REFACTOR_PLAN.md` phase.

**Landed (Phase 2b, 2026-08-01):** one `AudioContext`, created once in
`src/audio/context.js`, shared by the synth, the metronome, and every future
channel (guitar, bass, piano, drums per `SESSION_MODE_FEASIBILITY.md`).

### 2.3 AudioWorklets — now PUBLIC_URL-relative

**Fixed in Phase 2b (2026-08-01).** `src/nodes/noiseGenerator.js:21-23`
used to load `/white-noise-processor.js`/`pink-`/`brown-` from the **domain
root**, not a relative path — it worked only because `liz.moe` root happened
to serve the same files as `/uncaged/`; if that had ever changed, worklets
would have silently degraded to a `ScriptProcessor` fallback with just a
`console.error`. Now loaded via `` `${process.env.PUBLIC_URL}/...` ``, so
the paths are correct regardless of deployment root.

### 2.4 `src/audio/`, as it landed (Phase 2b, 2026-08-01)

```
src/audio/context.js    the single shared AudioContext, created once at
                         import time. Everything else imports `audioContext`
                         from here instead of constructing its own.
src/audio/bus.js        masterBus - a plain GainNode between each channel's
                         output and audioContext.destination. Only
                         PolySynth's masterGain feeds it today; future
                         instrument channels sum in here too.
src/audio/dispatch.js   the channel registry that replaces
                         window.polySynthRef/window.polySynthEnabled at the
                         playback entry points - see §3 for the split
                         between what moved here and what didn't.
```

`src/audio/clock.js` and `src/audio/scheduler.js` are not part of this: they
belong to the Timing Grid feature tracked in `SESSION_MODE_FEASIBILITY.md`
Stage 2 (new user-facing behavior, not restructuring, so it isn't a
`REFACTOR_PLAN.md` phase) — lifting the metronome's lookahead scheduler out
and migrating the progression sequencer/arpeggiator off `setTimeout` happens
there, once that tab is actually being built.

---

## 3. Channel / dispatch model

**`src/audio/dispatch.js` (Phase 2b, 2026-08-01)** is a channel registry:
`registerChannel(id, channel)` / `getChannel(id)` / `setChannelEnabled(id,
bool)` / `isChannelEnabled(id)`. It is deliberately *not* a tagged-event bus
yet - it relocates the pointer that used to live on `window.polySynthRef`/
`window.polySynthEnabled`, without changing the shape of what's on the other
end of it. `App.js` registers PolySynth's imperative handle under the id
`'synth'` (`App.js:24-33`) in the same effect that still sets
`window.polySynthRef`/`window.polySynthEnabled`.

**The interface the playback entry points call** is the imperative handle
PolySynth exposes via `useImperativeHandle` (`PolySynth.jsx:1871-1876`):
`playNotes(notes, volume, durationMs)`, `stopNotes(notes)`,
`stopAllNotes()`, `isActive()`, `activate()`, `triggerChord(notes)`.

### 3.1 Two surfaces were sharing one global — only one moved

Investigating the ~115 references before writing `dispatch.js` surfaced that
`window.polySynthRef` was carrying two unrelated things:

- **The playback surface** (`playNotes`/`stopNotes`/`stopAllNotes`/
  `isActive`/`activate`/`triggerChord`) — the three entry points below.
  **This is what Phase 2b migrated onto `dispatch.js`.**
- **PolySynth's own progression-sequencer control surface**
  (`getProgressionSequencerState`, `toggleProgressionSequencer`,
  `setProgressionData`, `setProgressionRate`, `setProgressionDuration`,
  `updateProgressionSettings`) — one component (`progressionBuilder.js`)
  remote-controlling another component's internal sequencer feature. Not
  note dispatch. **Left on `window.polySynthRef` untouched** - ~40 remaining
  references, all inside `progressionBuilder.js`'s sequencer UI wiring.
  Migrating this belongs to a later phase, once `progressionBuilder.js` has
  a real module boundary (`REFACTOR_PLAN.md` Phase 4).

`IntervalPractice.jsx`'s `getPolySynthRef()` helper (2 references) was
similarly untouched by Phase 2b: it backed both playback (`playNotes`) and a
third, also-unrelated surface (`getPitchValues`/`setPitchValues`/
`resetMicrotonalPitches`, microtonal tuning controls), so splitting it
without touching the microtonal calls would have meant duplicating the
helper for no structural benefit.

**Resolved by deletion, Phase 1b (2026-08-03):** `components/IntervalPractice/`
turned out to be unmounted dead code and was removed (§7), so this helper
and both its references are gone. Phase 5 has one less special case; the
microtonal methods survive only as an uncalled part of `PolySynth.jsx`'s
imperative handle. See the §5.1 row.

Three entry points now dispatch through the registry:

| Entry point | Where | Note format |
|---|---|---|
| Keyboard | `index.js`'s `onKeyPress`, bound via `document.addEventListener('keydown'/'keyup', onKeyPress)`. Maps `event.code` to a note via `keyToNote()` (`keyboard.js:29`). Gates on `isChannelEnabled('synth')`. | `"C#4"` (octave suffix, no `/`) |
| Mouse | `midi.js`'s `initializeMouseInput(playNote2Callback, stopNotes2Callback)`, wired from `index.js`'s `initializePolySynthMouse()`; the polling loop that waits for the synth to exist now polls `getChannel('synth')` instead of `window.polySynthRef`. | same |
| Programmatic | `src/fretboard/index.js`'s `playChordVoicing()`, `progressionBuilder.js`'s `triggerChordProgression()` (playback calls only - its `getProgressionSequencerState()` read stays on `window.polySynthRef`, see §3.1), and `MiniPiano.js`'s `getActivePolySynth()`. | same |

Every call site still independently guards `getChannel('synth') &&
channel.playNotes` (mirroring the old `window.polySynthRef &&
window.polySynthRef.playNotes` guard exactly) — this phase relocated the
reference, it did not redesign the calling convention. A real tagged event
shape (`{ type, note, velocity, channel }`) is future work for when a second
channel (guitar/bass/piano/drums, `SESSION_MODE_FEASIBILITY.md`) actually
exists to dispatch to.

---

## 4. Timing model

Two unrelated timing systems coexist:

- **`metronome.js`** — the one properly-built piece. Absolute timebase
  (`referenceTime + beatNumber * timePerBeat`, not relative deltas) plus a
  lookahead scheduler: `scheduler()` wakes every `lookahead` ms (25ms) and
  schedules any note whose time falls within `scheduleAheadTime` (0.1s) using
  `getNextNoteTime()`/`getTimeForBeat()`. This is the sequencer backbone
  `SESSION_MODE_FEASIBILITY.md` recommends reusing.
- **Everything else is `setTimeout` chains with millisecond durations
  computed from a BPM value read directly out of a DOM slider**: the
  progression sequencer (`progressionBuilder.js:155-190`) and PolySynth's own
  arpeggiator (`PolySynth.jsx:945-1061`). `setTimeout` drift in a busy tab is
  tens of milliseconds — audible as sloppy timing, and fatal for any future
  feature that scores the user against a grid.

No code currently schedules against the metronome's clock except the
metronome's own click sound. Fix (`SESSION_MODE_FEASIBILITY.md` Stage 2,
the Timing Grid feature, deferred until that tab is actually being built):
`src/audio/clock.js` lifts the absolute timebase out of `metronome.js`;
`src/audio/scheduler.js` generalizes the lookahead loop into one queue for
all voices; the progression sequencer and arpeggiator migrate onto it.

---

## 5. Remaining globals

`window` is the only channel between the vanilla-JS and React halves. Not
every global below is equally real — one entry (`window.gridData` /
`window.outputNoteArray`) turned out, on inspection for this document, to
have **zero live references**; see the correction note at the end of this
section.

### 5.1 Live and high-traffic — partially migrated (Phase 2b), remainder is Phase 5 step 3

| Global | Writer | Live reference count | Status |
|---|---|---|---|
| `window.polySynthRef` (playback surface: `playNotes`/`stopNotes`/`stopAllNotes`/`isActive`/`activate`/`triggerChord`) | `App.js:26` | was counted in the ~115 below; now reached via `getChannel('synth')` (`src/audio/dispatch.js`) at every keyboard/mouse/programmatic call site (`index.js`, `src/fretboard/index.js`, `MiniPiano.js`, `progressionBuilder.js`'s `triggerChordProgression`) | **Migrated, Phase 2b (2026-08-01).** |
| `window.polySynthRef` (progression-sequencer-control surface: `getProgressionSequencerState`/`toggleProgressionSequencer`/`setProgressionData`/`setProgressionRate`/`setProgressionDuration`/`updateProgressionSettings`) | `App.js:26` | ~40, all in `progressionBuilder.js` | **Still live.** Not note dispatch - see §3.1. Migrates once `progressionBuilder.js` has a real module boundary (Phase 4). |
| `window.polySynthRef` (microtonal surface: `getPitchValues`/`setPitchValues`/`resetMicrotonalPitches`, bundled with a few playback calls in one shared helper) | `App.js:26` | **0** (was 2, in `IntervalPractice.jsx`'s `getPolySynthRef()`) | **Dead as of Phase 1b (2026-08-03)** — `components/IntervalPractice/` was deleted as unmounted dead code (§7), taking both references with it. §3.1's reason for not splitting this helper no longer applies because the helper is gone. `PolySynth.jsx` still exposes the three methods on its imperative handle with no caller; retiring them is Phase 6 cleanup, not Phase 5 migration. |
| `window.polySynthEnabled` | `App.js:29` | was small; the `index.js`/`progressionBuilder.js`(click-gate)/`MiniPiano.js` reads that gated *playback* now read `isChannelEnabled('synth')` instead | **Fully migrated.** Phase 2b moved every reader except `IntervalPractice.jsx`'s bundled helper; Phase 1b deleted that file (§7), so nothing reads this global any more. `App.js` still writes it. |
| `window.updateFretboardsForScaleChange` | `frets.js:6920` (pre-Phase-3 baseline; now `src/fretboard/index.js`) | 17 (1 write + call, now in `src/fretboard/index.js`; 16 guarded read/call sites in `scaleGenerator.js:2219-2424`) — verified exactly matches `REFACTOR_PLAN.md`'s count | Phase 5 step 3, or a plain import once `src/fretboard/index.js`/`scaleGenerator.js` don't need load-order independence |

### 5.2 Live, lower-traffic — remaining Phase 5 work

The rest of the ~70 distinct `window.*` writes: the fretboard API surface
re-exported onto `window` for `progressionBuilder.js`/`index.js` to call
(`getFretboard`, `showChordOnFretboard`, `showScaleOnFretboard`,
`searchFretboardNote(s)`, `quickSearchAndMark`, `quickChordPattern`,
`analyzeFretboardNotes`, `analyzeChordScaleCompatibility`,
`displayChordPatterns`, `showAllChordPatterns`, `getChordPatterns`,
`getPatternsByChordType`, `getFretboardNotes`, `updateChordGridColors`,
`mainFretboard`, `chordProgressionFretboard`, `currentDisplayedChord`); scale
state (`getPrimaryScale`, `getPrimaryRootNote`, `getScaleNotes`,
`HeptatonicScales`, `setScale`, `setRootNote`); and progression/selection
state (`currentProgression`, `processedProgression`, `selectedBarIndex`,
`selectedNoteIndex`, and similar). These become ordinary imports now that
Phases 3-4 have given each of these files a real module boundary — most
don't need Phase 5's event bus at all, just an import statement.

**Six of them are not live at all (measured 2026-08-03).** `notationStripOctave`,
`noteArray`, `setRootNote`, `setScale`, `updateChordButtonStyles` and
`updateScaleContextDisplay` are **read but never assigned anywhere in `src/`**,
so every one of their call sites permanently takes its else-branch:

| Global | Read at | Guard that always fails |
|---|---|---|
| `notationStripOctave` | `PolySynth.jsx:1218` | ternary, falls back to `note.replace(/\d+$/, '')` |
| `noteArray` | `PolySynth.jsx:3525` | ternary, falls back to `[]` |
| `updateChordButtonStyles` | `progression/index.js:241` | `typeof === 'function'` |
| `setRootNote` / `setScale` | `progression/share.js:220-224` | truthiness — and they are only a *catch-block fallback* behind the imported `setPrimaryRootNote`/`setPrimaryScale`, so nothing is lost |
| `updateScaleContextDisplay` | `progression/share.js:236` | truthiness |

These need **deletion, not migration** — the same class of dead code
`window.updateCrossReferenceDisplay` turned out to be in Phase 1b (§7).
Finding them required splitting writers from readers; a reference count hides
them completely, which is how they survived four phases. Re-run that split
before Phase 5 rather than trusting this table, since it drifts:

```sh
# for each window.<name>, count assignments vs total references
grep -rE "window\.<name> *=[^=]" src --include=*.js --include=*.jsx
```

### 5.3 Correction to the original survey: `gridData`/`outputNoteArray` are dead, not live

The original survey (now `REFACTOR_PLAN.md` §4.1, problem 1) counted
`window.gridData` (52 refs) and
`window.outputNoteArray` (27 refs) as live module-bus traffic and Phase 5
step 3 listed `gridData` as a migration target. Verified during this
session: **every one of those references is inside either `src/staves.js`
(imported by nothing — a dead file not previously listed in §2.5) or
commented-out/block-commented code in `index.js`/`progressions.js`.** The
one live, uncommented declaration, `index.js:955`'s `let outputNoteArray =
[]`, is a local variable that's never assigned to `window.outputNoteArray`
in live code (the assignment is commented out at `index.js:988`) and whose
only live "reader" is inside a `/* */`-commented example block
(`index.js:1018-1025`).

Consequence: these two globals need no migration. They disappear for free
when Phase 1 deletes `src/staves.js` and strips `index.js`'s dead code.
`REFACTOR_PLAN.md` was updated accordingly. Both globals are now gone
entirely - Phase 1 deleted `staves.js`, Phase 1b deleted `progressions.js`.

---

## 6. Module ownership map

| Folder / file | Owns | May import | Must not import it |
|---|---|---|---|
| `src/theory/` *(Phase 2)* | Note names, intervals, scale/chord data, roman numeral parsing. No DOM, with the documented exceptions below. | nothing app-specific, except `roman.js`'s deliberate exception and `chords.js`'s `../scales` import (§6.1) | everything else may import it |
| `src/theory/chordSuffixes.js` *(Phase 4c, second step, landed 2026-08-03 - `src/chords.js` deleted)* | The chord-suffix vocabulary (`chords`): which chord qualities the app can name, grouped by the category headings the UI shows them under, plus the standing TODO list of suffixes not yet in it. Pure data, **no imports at all** - which is what breaks the §6.1 cycle. Consumed by `theory/chords.js`'s `identifySyntheticChords` and `scales/ui/infoPanel.js`, both passing it to `matchChord` as the candidate set. See §6.28. | nothing | must stay import-free; anything it imported would re-enter the cycle |
| `src/audio/` *(Phase 2b landed 2026-08-01: `context.js`/`bus.js`/`dispatch.js`; `clock.js`/`scheduler.js` belong to `SESSION_MODE_FEASIBILITY.md` Stage 2's Timing Grid, not a `REFACTOR_PLAN.md` phase)* | The shared `AudioContext`, master bus, note-event/channel registry dispatch. | nothing app-specific today | UI modules should depend on it, not the reverse |
| `src/nodes/` | Framework-free Web Audio node wrappers (`Gain`, `Filter`, `Distortion`, …), a shared `.getNode()`/`.connect()` interface. | nothing app-specific | — |
| `chordFingering.js`, `chordPatterns.js` | `{string, fret, finger}` voicing logic — domain logic a future string-synth depends on. Framework-free by design (see header comment). | theory primitives only | must **not** move under `src/fretboard/ui/` — `REFACTOR_PLAN.md` Phase 3 called this out explicitly, and Phase 3's completed `src/fretboard/` split kept them where they were |
| `src/fretboard/state.js` *(Phase 3, in progress, landed 2026-08-01)* | The ~28 module-level `let`s `frets.js` used to hold directly - Scale Position Grid row anchors/tuning + its persisted display settings, the fretboard instance registry, chord/display state, chord-fingering tab state, and the scale-change debounce timestamps - plus `refreshScalePositionTuning()` and `persistScalePositionGridSettings()`. Exported as one mutable object, `fretboardState`, not bare `let`s - see §6.3 for why. | `theory/notation`, `tuning` | everything that used to read/write these as bare identifiers now imports `fretboardState` instead |
| `src/fretboard/geometry.js` *(Phase 3, in progress, landed 2026-08-01)* | Pure fret-position and note-at-position math: `calculateFretPositions`, `calculateFretPosition`, `calculateNote`, `extractNoteName`, `extractOctave`, `getNoteAt`, `findNotePositions`, plus `getSemitoneFromRoot`/`getIntervalLabelFromRoot` (the interval math `markScale` colors and labels from - see §6.30). No DOM, no class instance - takes plain data (tuning array, fret count, fret-position table) in, plain data out. The `Fretboard` class keeps same-named methods that delegate to these (e.g. `calculateNote(a, b) { return geometryCalculateNote(a, b); }`), so its public API is unchanged. | `theory/notation` | — |
| `src/fretboard/markers.js` *(Phase 3, in progress, landed 2026-08-01)* | `createNoteShapeMarker` - builds one detached SVG shape element (circle/square/diamond/triangle/pentagon/hexagon/star/plus/cross) for a Scale Position Grid dot. Touches the DOM (`document.createElementNS`) but no app state - not framework-free the way `geometry.js` is, just state-free. | nothing app-specific | — |
| `src/fretboard/patterns.js` *(Phase 3, in progress, landed 2026-08-01)* | CAGED chord-pattern matching and generic fingering-shape scoring: `calculateChordPatternPositions`, `findChordPatternMatches`, `findOptimalChordShape`. Takes tuning/fretCount as parameters instead of reading `this.*`; calls `geometry.js`'s functions directly. Not framework-free - depends on `chordPatterns.js`'s canned shape library and `tuning.js`'s `isStandardGuitarTuning`. The `Fretboard` class keeps same-named delegate methods, matching the Phase 0 characterization tests that call them as instance methods. | `chordPatterns.js`, `tuning.js`, `theory/notation`, `src/fretboard/geometry.js` | — |
| `src/fretboard/Fretboard.js` *(Phase 3, landed 2026-08-01)* | The `Fretboard` class itself - DOM rendering (neck/fret grid, note/scale/chord marking, subscale boxes, chord-shape lines, CAGED/fingering display) for one fretboard instance. Also owns `GUITAR_TUNING`/`FRET_COUNT` (constructor defaults), `DEFAULT_COLORS` (fallback marker coloring - the degree-indexed `SCALE_COLORS` was retired in §6.30) and `addInteractiveEvent` (a generic DOM helper with no better home yet) - `./index.js` imports `GUITAR_TUNING` back for its own glue code, `ui/scalePositionGrid.js` imports `FRET_COUNT`, and `ui/controls.js`/`ui/chordGrid.js` import `addInteractiveEvent`. | theory, `chordFingering`/`chordPatterns`, `tuning.js`, `src/fretboard/state.js`, `geometry.js`, `patterns.js` | must not import `./index.js` (would be circular - `index.js` imports `Fretboard` from here) |
| `src/fretboard/ui/controls.js` *(Phase 3, in progress, landed 2026-08-01)* | The top bar (title + instrument/tuning picker), the tabbed-panel shell, the hotkey footer, and `createFretboardControls` - the orchestrator that builds the "Other Controls" panel and assembles all six tabs (Scale Information / Chord Progression / Scale Position Grid / Scale Selection / Other Controls / Synthesizer). Called once, from `initializeFretboard()` in `frets.js`. | `src/fretboard/state`, `src/fretboard/Fretboard` (`addInteractiveEvent`), `src/fretboard/ui/chordGrid`, `src/fretboard/ui/scalePositionGrid`, `src/scales/`, `tuning.js`, `progressionBuilder.js`, and (cross-import, see §6.8) several glue functions from `frets.js` | — (see §6.8 for the two-way relationship with `frets.js`) |
| `src/fretboard/ui/chordGrid.js` *(Phase 3, in progress, landed 2026-08-01)* | The Chord Pattern Grid (12-note x 12-chord-type button table, color coded for scale compatibility) and the chord-fingering-shape pipeline it shares with the Roman-numeral chord display: matching `chordPatterns.js` shapes to a chord, a "best-effort" fallback grip, the position-picker tab bar, and the scale/chord-interval math (`getSemitoneFromReference`, `getScaleIntervalEntries`, `deriveChordSuffix`, `getScaleDescriptor`) that both this grid and `src/fretboard/ui/scalePositionGrid.js` depend on. See §6.9. | theory, `src/scales/`, `chordFingering.js`, `src/fretboard/state`, `src/fretboard/Fretboard` (`addInteractiveEvent`), and (cross-import, see §6.9) glue functions from `frets.js` | must not import `src/fretboard/ui/scalePositionGrid.js` (the dependency runs one way - see §6.10) |
| `src/fretboard/ui/scalePositionGrid.js` *(Phase 3, in progress, landed 2026-08-01)* | The Scale Position Grid tab: one movable mini-fretboard pattern per (root string x scale degree) cell, the Focus Selector visibility matrix, and the per-cell rendering options (pattern/dot size, fret-label mode, note shapes, chord-name headers, etc.) on `fretboardState`. See §6.10. | theory, `src/scales/`, `chordFingering.js`, `src/fretboard/state`, `src/fretboard/Fretboard` (`FRET_COUNT`), `src/fretboard/markers`, `src/fretboard/ui/chordGrid` | — |
| `src/fretboard/index.js` *(Phase 3, done 2026-08-01 - `frets.js` deleted)* | The public barrel for `src/fretboard/`: `initializeFretboard`, chord display/search/pattern glue functions, `playChordVoicing`/`getChordVoicingNotes`, the `CHORD_TYPE_TO_PATTERN_TYPE` map, and the re-exports that make this folder's surface a single import. Everything else that used to live in `src/frets.js` moved to `state.js`/`geometry.js`/`markers.js`/`patterns.js`/`Fretboard.js`/`ui/controls.js`/`ui/chordGrid.js`/`ui/scalePositionGrid.js` across this phase's earlier steps (see §6.3-6.10); this file is what remained plus the barrel role. See §6.11. | theory, `chordFingering`/`chordPatterns`, `../chords.js`, `../progressionBuilder.js` (for the Chord Progression tab content), all of `src/fretboard/*` above, `./ui/controls.js` (for `createFretboardControls`), `./ui/chordGrid.js` (for the fingering-shape pipeline the glue functions call) | — (two-way with `../chords.js` and with `./ui/controls.js`/`./ui/chordGrid.js` - see §6.11) |
| `src/progression/state.js` *(Phase 4, first step, landed 2026-08-01)* | The ~15 module-level `let`s `progressionBuilder.js` used to hold directly - current progression array, hovered/selected-pattern-index tracking, mini-fretboard/piano/stave display toggles, seventh-chords toggle, input-parse caches and debounce timer - plus `INPUT_DEBOUNCE_DELAY`/`CHORD_LINE_CONFIG`/`MINI_FRETBOARD_CONFIG`. Exported as one mutable object, `progressionState` (config constants as plain exports alongside it) - see §6.12 for why. | `tuning.js` | everything that used to read/write these as bare identifiers now imports `progressionState` instead |
| `src/progression/parse.js` *(Phase 4, second step, landed 2026-08-01)* | The tokenize -> parse -> fretboard-pattern-match pipeline: `parseProgressionInput`, `updateProgressionIncremental`, `compareTokenArrays`, `precomputePatternData`, `processDefaultPatternSelections`, `getChordPatternMatches`, `collectArpeggiationNotes`, `clearCache`. Roman-numeral parsing/resolution itself stays in `theory/roman.js` (Phase 2). | `theory/roman`, `theory/notation`, `tuning.js`, `chordFingering.js`, `src/progression/state`, and (cross-import, see §6.13) `getChordDisplayName`/`getFretboardForProgression` from `../progressionBuilder` | — (two-way with `progressionBuilder.js` - see §6.13, same shape as `src/fretboard/ui/{controls,chordGrid}.js` <-> `src/fretboard/index.js` in Phase 3 §6.8) |
| `src/progression/share.js` *(Phase 4, third step, landed 2026-08-01)* | URL-based sharing: `buildShareableState`/`encodeStateToURLParams`/`decodeStateFromURLParams` (human-readable format), `encodeStateToURL`/`decodeStateFromURL` (legacy Base64 fallback), `generateShareableURL`, `copyShareableURL`, `applySharedState`, `loadSharedStateFromURL`. | `src/scales/` (`getPrimaryScale`/`getPrimaryRootNote`/`setPrimaryRootNote`/`setPrimaryScale`), `src/progression/state`, and (cross-import, see §6.14) `updateProgression` from `../progressionBuilder` | — (two-way with `progressionBuilder.js`, same shape as §6.8/§6.13) |
| `src/progression/playback.js` *(Phase 4, fourth step, landed 2026-08-01)* | Turns a chord into concrete notes and plays them: `getProcessedChordNotes` (resolves the selected fretboard pattern, or falls back to chord theory), `getProcessedProgression`, `triggerChordProgression` (dispatches through the `'synth'` channel). | `theory/notation`, `tuning.js`, `audio/dispatch.js`, `src/progression/state`, `src/progression/parse` (`getChordPatternMatches`), and (cross-import, see §6.15) `getChordDisplayName` from `../progressionBuilder` | — (two-way with `progressionBuilder.js`, same shape as §6.13/§6.14) |
| `src/progression/scaleSync.js` *(Phase 4, fifth step, landed 2026-08-01)* | Keeps the progression in sync with the active scale/root: `setupScaleChangeListener` (event + polling-fallback listener), `initializeScaleNotesDisplay`, `updateScaleNotesDisplay`, `generateFallbackScaleNotes`, `updateProgressionDisplayForScaleChange`, `updateRomanNumeralChords` (re-resolves Roman-numeral chords against the new scale). | `src/scales/`, `theory/notes`, `theory/roman`, `src/progression/state`, `src/progression/fretboardDisplay` (`displaySingleChordPattern`/`displayAllChordPatterns`, repointed here in step 6 - see §6.17), and (cross-import, see §6.16) `precomputeAllPatternData`/`updateProgressionDisplay` from `../progressionBuilder` | — (two-way with `progressionBuilder.js`, same shape as §6.13-§6.15) |
| `src/progression/fretboardDisplay.js` *(Phase 4, sixth step, landed 2026-08-02)* | Draws chord/scale content on the main chord-progression fretboard (not the per-card mini fretboards): `displaySingleChordPattern`, `displayScaleContext`, `displayAllChordPatterns`. | `src/progression/state`, `src/progression/parse` (`precomputePatternData`), and (cross-import, see §6.17) `getFretboardForProgression` from `../progressionBuilder` | — (two-way with `progressionBuilder.js`, same shape as §6.13-§6.16; also imported by `src/progression/scaleSync.js`, repointed from `../progressionBuilder` in this step) |
| `src/progression/chordCard.js` *(Phase 4, seventh step, landed 2026-08-02; updated eighth step)* | The per-chord card in the progression display: `createChordElement` (name, notes, optional mini piano/stave, status indicator, hover/click handlers), `createPatternSelector` (the fret-pattern dropdown + prev/next buttons), `createMiniFretboardVisualization` (the SVG voicing diagram), `copySvgAsPng`, `showNotification`, `lightenColor` - all private except `createChordElement`. Also `getChordDisplayName`, moved here in step 7 rather than staying in `progressionBuilder.js` as earlier steps' notes expected - see §6.18. | theory, `src/scales/`, MiniPiano/MiniStave components, `audio/dispatch.js`, `src/progression/state`, `src/progression/parse` (`precomputePatternData`), `src/progression/playback`, `src/progression/fretboardDisplay`, and (cross-import, see §6.19) `updateProgressionDisplay` from `src/progression/progressionList` | two-way with `src/progression/parse.js`/`src/progression/playback.js` for `getChordDisplayName` (§6.18) and with `src/progression/progressionList.js` for `updateProgressionDisplay`/`createChordElement` (§6.19) - no longer any two-way relationship with `progressionBuilder.js` itself |
| `src/progression/progressionList.js` *(Phase 4, eighth step, landed 2026-08-02)* | Renders the chord-progression display: `createProgressionDisplaySection`, `updateProgressionDisplay`, `highlightCurrentChord` (private - only reached via `window.highlightCurrentChord`, which moved here with it). See §6.19. | `src/progression/state`, and (cross-import, see §6.19) `createChordElement` from `src/progression/chordCard` | two-way with `src/progression/chordCard.js` (§6.19) - the first Phase 4 module with no cross-import back into the `progressionBuilder.js` residual |
| `src/progression/input.js` *(Phase 4, ninth step, landed 2026-08-02)* | The chord-progression text input: `createInputSection` - the field, its debounced input handler (`updateProgression` after `INPUT_DEBOUNCE_DELAY`), and playback-blocking on input/keydown/paste while the sequencer is running. Self-contained, as the plan expected. See §6.20. | `src/progression/state`, and (cross-import, see §6.20) `updateProgression` from `../progressionBuilder` | two-way with `progressionBuilder.js` (same shape as §6.13-§6.19) |
| `src/progression/controls.js` *(Phase 4, tenth step, landed 2026-08-02)* | The "Other Controls" row above the chord-card display: scale-context/mini-fretboard/mini-piano/mini-stave/seventh-chords toggles, the stave-key and theory-mode selectors, the presets dropdown, Share/Clear buttons, the sequencer Loop toggle, and the rate/duration/chord-triggering synth row - one `buildXControls()` per group (or per entangled group-cluster, see §6.21), only the orchestrator `createProgressionControlsSection` exported. | theory-adjacent: `src/progression/state`, `src/progression/progressionList`, `src/progression/share`, `src/progression/playback`, `src/progression/fretboardDisplay`, and (cross-import, see §6.21/§6.22) `updateProgression`/`clearProgression` from `src/progression/index.js` (the barrel) | two-way with `src/progression/index.js` (same shape as §6.13-§6.20) |
| `src/progression/index.js` *(Phase 4, eleventh and final step, landed 2026-08-02 - `progressionBuilder.js` deleted)* | The public barrel for `src/progression/`: `createChordProgressionUI`, `updateProgression`, `clearProgression`, `getFretboardForProgression`, `precomputeAllPatternData`, plus the re-exports (`loadSharedStateFromURL`/`applySharedState`) that make this folder's surface a single import. Everything else that used to live in `progressionBuilder.js` moved to `state.js`/`parse.js`/`share.js`/`playback.js`/`scaleSync.js`/`fretboardDisplay.js`/`chordCard.js`/`progressionList.js`/`input.js`/`controls.js` across this phase's earlier steps (§6.12-§6.21); this file is what remained plus the barrel role. See §6.22. | theory, `src/scales/` (`initializeNavigationButtonsDirect`), `tuning.js`, all of `src/progression/*` above, and (cross-imported back by seven sibling modules, see §6.22) itself | two-way with `src/progression/{parse,share,scaleSync,fretboardDisplay,input,controls}.js` (§6.13-§6.21); external importer is `src/fretboard/ui/controls.js` (`createChordProgressionUI`/`loadSharedStateFromURL`, repointed from `../../progressionBuilder` to `../../progression` in this step) |
| `src/scales/state.js` *(Phase 4 second half, first step, landed 2026-08-02)* | Scale/root-note selection state (`scaleState`, one mutable object - same reasoning as `fretboardState`/`progressionState`), persistence, and the pure chromatic/enharmonic/navigation helpers. See §6.23. | `src/scales/scaleData`, and (cross-import, see §6.23/§6.26) `updateCurrentScaleDisplay` from `.` (the barrel), `createHeptatonicScaleTable` from `./ui/scaleTable` | two-way with `src/scales/index.js` and `src/scales/ui/scaleTable.js` |
| `src/scales/scaleData.js` *(Phase 4 second half, second step, landed 2026-08-02)* | Scale interval data (`HeptatonicScales`/`HexatonicScales`/`PentatonicScales`/`scales`), the precomputed-chord cache, `getScaleNotes`. Framework-free except for reading `theory/notation`'s scale-spelling context. See §6.24. | `../midi`, `theory/notation`, `theory/chords` | — |
| `src/scales/ui/infoPanel.js` *(Phase 4 second half, third step, landed 2026-08-02)* | The "Scale Information" panel: interval pattern, spelled notes, alternative names, scale piano, interval-color legend, per-degree triad/seventh chord cards. See §6.25. | `theory/chords`, `theory/chordSuffixes` (was `../chords.js` until Phase 4c), MiniPiano, `src/scales/state`, `src/scales/scaleData`, and (cross-import, see §6.26) `intToRoman` from `./scaleTable` | — |
| `src/scales/ui/rootNoteTable.js` *(Phase 4 second half, fourth step, landed 2026-08-03)* | The detailed "Root Note Selection" table (`createRootNoteTable`) plus `positionTooltipSmart`. See §6.26. | `src/scales/scaleData`, MiniPiano, `src/scales/state`, and (cross-import) `highlightKeysForScales`/`updateCurrentScaleDisplay` from `..` (the barrel), `createHeptatonicScaleTable` from `./scaleTable` | two-way with `src/scales/ui/scaleTable.js` - see §6.26 for why |
| `src/scales/ui/scaleTable.js` *(Phase 4 second half, fourth step, landed 2026-08-03)* | The compact top-bar quick-picker (`createQuickScalePicker`), the detailed "Heptatonic Scales" browsing table (`createHeptatonicScaleTable`), and `intToRoman`. See §6.26. | `src/scales/scaleData`, `theory/chords`, MiniPiano, `src/scales/state`, and (cross-import) `highlightKeysForScales`/`updateCurrentScaleDisplay` from `..` (the barrel), `createRootNoteTable`/`positionTooltipSmart` from `./rootNoteTable` | two-way with `src/scales/ui/rootNoteTable.js` - see §6.26 for why |
| `src/scales/index.js` *(Phase 4 second half, fifth and final step, landed 2026-08-03 - `scaleGenerator.js`/`scales.js` deleted)* | The public barrel for `src/scales/`: `highlightKeysForScales`/`highlightScaleNotes` (two unrelated DOM key-highlighting functions, not merged - see §6.27), `updateCurrentScaleDisplay` (the hub every UI cluster calls after a selection change), navigation-button wiring, plus the re-exports that make this folder's surface a single import. Everything else that used to live in `scaleGenerator.js`/`scales.js` moved to `state.js`/`scaleData.js`/`ui/infoPanel.js`/`ui/rootNoteTable.js`/`ui/scaleTable.js` across this phase's earlier steps (§6.23-6.26); this file is what remained from both plus the barrel role. See §6.27. **Not moved into `src/theory/` in Phase 2** — see §6.1/§6.2 correction; still not moved here either, pending a real `Scale` data model (see the project memory this session recorded). | `../midi`, `src/scales/scaleData`, `src/scales/ui/infoPanel`, `src/scales/ui/scaleTable`, `src/scales/state` | two-way with `src/scales/state.js`, `src/scales/ui/rootNoteTable.js`, `src/scales/ui/scaleTable.js` (§6.23/§6.26); every former `scaleGenerator.js`/`scales.js` external importer now pulls from here (`from './scales'` / `from '../scales'` etc., repointed in this step) |
| `src/piano/` *(`PIANO_VIEW_PLAN.md` steps 1-7, landed 2026-08-03 — a feature, not a refactor phase)* | The piano view. `keyModel.js`: which keys exist in a MIDI range, which are black, the white-key count `--num-keys` is set from, octave-span → MIDI range. `range.js`: the active instrument's playable range as `{ lowMidi, highMidi, openStrings }`. Both pure. `Piano.js`: the `<ul id="keyboard">` markup and the only DOM-touching file here — `<li midi="N" class="white\|black">` is a contract with `midi.js`/`scales/index.js`/`index.css`, not a free choice. `labels.js`: scale + root + label mode -> per-pitch-class colour and text, pure. `state.js`: `pianoState` (view mode, displayed range) + persistence. `index.js`: the barrel. Standard MIDI (60 = C4) throughout, forced by `midi.js`'s `keys` table; see §6.29 for the conversion trap at the `tuning.js` boundary. | `keyModel.js`: nothing at all. `range.js`: `tuning.js` (`getNoteAtStringFret`), `theory/notation` (`noteToMidi`). `Piano.js`: `./keyModel` only | `src/fretboard/index.js`'s `initializeFretboard` builds the keyboard into `#fretNotPlaceholder` after the fretboard element, hidden |
| `src/components/PolySynth/` | The synth UI + the module-scope `AC`/node graph in §2.1. Slated to be wrapped behind a channel adapter (`SESSION_MODE_FEASIBILITY.md` §2.2), not opened, so Phase 6 (internal cleanup) is optional and off the critical path. | `src/nodes/`, `src/audio/` | — |
| `index.js` (app entry point - not `src/fretboard/index.js`, the barrel) | Keyboard entry point (`onKeyPress`), mouse-input wiring, React root mount, a handful of `window.*` exports for `src/fretboard/index.js`/`src/scales/` to consume. 262 lines (was 5,777 before Phase 1, 281 after it, then Phase 1b stripped the inert cruft Phase 1 deferred - see §7). Reads the `'synth'` channel via `src/audio/dispatch.js` (Phase 2b) rather than `window.polySynthRef`. | `src/audio/dispatch.js` | — |
| `App.js` | React root component: theme provider, portals `PolySynthWrapper` into the vanilla UI's synth tab, sets `window.polySynthRef`/`window.polySynthEnabled` and registers the `'synth'` channel with `src/audio/dispatch.js` (Phase 2b). | `src/audio/dispatch.js` | — |

### 6.1 `src/theory/`, as it actually landed (Phase 2, 2026-08-01)

```
src/theory/notes.js       CHROMATIC (canonical 12-note sharp array) + normalize
                           + noteToMidi/noteToName, moved from src/midi.js.
src/theory/notation.js    moved from src/notation.js (already framework-free).
                           Its own, separate noteToMidi/noteToName/midiToNote -
                           see the correction below for why these don't share
                           notes.js's names.
src/theory/chords.js      moved from src/intervals.js: chord-name parsing,
                           interval derivation, note generation, chord
                           matching (processChord, resolveChord, matchChord,
                           identifySyntheticChords, ...).
src/theory/intervals.js   INTERVAL_COLORS/INTERVAL_LABELS + getIntervalColor/
                           getIntervalLabel - the semitone -> label/color
                           table shared by the fretboard and every mini piano.
src/theory/roman.js       roman-numeral parsing/resolution, lifted from
                           progressionBuilder.js:549-1073.
```

**Two deliberate exceptions to "no app-specific imports":**

- ~~`src/theory/chords.js` imports `{ chords }` (the chord-suffix-list data)
  from `../chords.js`~~ — **resolved by Phase 4c (2026-08-03), see §6.28.**
  As written in Phase 2: the import was to a DOM-heavy file, not a theory
  module, and `identifySyntheticChords` genuinely calls
  `matchChord(chord, chords, ...)` against that data (it looked like dead
  code at first, shadowed everywhere else by `matchChord`'s own `chords`
  parameter, but isn't). It meant merely importing the chord engine also ran
  `chords.js`'s module-scope
  `document.getElementById('chordPlaceholderContent')`, and it was half of a
  circular `chords.js` &lt;-&gt; `intervals.js` dependency that predated Phase 2.
  Phase 4c deleted `src/chords.js` and moved the data to
  `src/theory/chordSuffixes.js`, which has no imports at all — so both the
  cycle and the module-scope DOM lookup are gone, exactly as the "future
  phase that gives `chords.js` a real module boundary" note predicted.
  One app-specific import remains in this file and is *not* resolved:
  `getScaleNotes` from `../scales`, which resolves to the scales barrel and
  so still drags jQuery and that barrel's module-scope DOM lookups in behind
  it. Narrowing that specifier to `../scales/scaleData` is a scales-barrel
  decision, deliberately not made inside Phase 4c.
- `src/theory/roman.js`'s `resolveRomanChord`/`resolveFallbackRomanChord`
  import `getPrimaryScale`/`getPrimaryRootNote` from `../scaleGenerator.js`
  (live scale-selection state) — required, not incidental: "which chord
  does 'I' mean" depends on the currently selected scale. `useSeventhChords`
  (progressionBuilder.js's triads-vs-sevenths toggle) is *not* imported the
  same way — it's threaded through as an explicit parameter
  (`resolveRomanChord(romanChord, useSeventhChords)`, default `false`) so
  this module doesn't reach back into the file it was extracted from.

### 6.2 Corrections to the Phase 2 bullet list

Investigating the "20 duplicate arrays / duplicate helpers" inventory in
the original survey's duplication list (now `REFACTOR_PLAN.md` §4.1, problem
2) while doing the move surfaced several pairs that are
**not** safe drop-in duplicates, despite having matching or near-matching
names. Each was left in place rather than merged, to keep this a
restructuring-only phase:

- **`midi.js`'s `noteToMidi`/`noteToName` vs `notation.js`'s** — same
  argument shape (`"C#/4"`-style strings) but a *different MIDI-number
  convention*: `midi.js`'s `noteToMidi('C/4') === 48`, `notation.js`'s
  `noteToMidi('C/4') === 60` (standard MIDI, middle C). They already lived
  side by side under different aliased names before this phase (e.g.
  `frets.js` imports both, calling the second one `notationNoteToMidi`).
  This is why there are **two** modules, `src/theory/notes.js` (midi.js's
  pair, including its documented `noteToMidi`/`noteToName` asymmetry - see
  `midi.test.js`) and `src/theory/notation.js` (notation.js's pair), instead
  of the single `notes.js` the plan's bullet list originally sketched.
- **`MiniPiano.js`'s `normalizeNoteName` vs `MiniStave.js`'s** — different
  behavior, not just different code: MiniPiano's collapses enharmonics
  (`Db` -> `C#`, `B#` -> `C`, lossy); MiniStave's only maps accidental
  *symbols* to ASCII and explicitly preserves spelling (`Db` stays `Db`).
  Left as two separate, un-consolidated functions.
- **`MiniPiano.js`'s `extractOctave` vs `MiniStave.js`'s
  `parseNoteWithOctave`** — different note formats (`"C#/5"` slash-form vs
  `"C#4"` concatenated). Not merged.
- **`MiniPiano.js`'s `getSemitoneFromRoot` vs `frets.js`'s
  `getSemitoneFromReference`** — different algorithms (a local sharps-only
  semitone lookup table vs a round-trip through `notation.js`'s MIDI
  conversion, which understands flats). Only the *data* both were computing
  a color/label from (`INTERVAL_COLORS`/`INTERVAL_LABELS`) was safe to
  consolidate into `src/theory/intervals.js`; the semitone-computation
  functions themselves were left alone.
- **`src/scales.js` was not moved into `src/theory/`.** The plan's bullet
  called it "existing scales.js, data only" - it isn't: ~550 lines of pure
  scale data/functions plus ~60 lines of DOM-touching
  `highlightKeysForScales`/`keys_chords`/`getElementByNote`/`getElementByMIDI`
  at the bottom, mirroring `chords.js`'s split. Separating that pure half is
  real work (updating every one of `scales.js`'s many importers to pull from
  two modules instead of one) that belongs to Phase 4, which already plans
  `src/scales/state.js` and already lists the data half moving to
  `src/theory/` - this correction just makes that division point explicit
  rather than something Phase 2 could do as a side effect.

### 6.3 `src/fretboard/state.js` (Phase 3, first step, 2026-08-01): why a mutable object, not exported `let`s

`REFACTOR_PLAN.md` Phase 3 describes `state.js` as "the ~20 module-level
`let`s + persistence" (28, once counted exactly). Moving them turned up a
constraint the plan's one-line description didn't anticipate: **ES module
named exports are live bindings that importers cannot reassign.** `frets.js`
doesn't just read these values, it writes to most of them (`currentDisplayedChord
= 0`, `isUpdatingFretboards = true`, etc.) from ~30 call sites scattered
through the file. If `state.js` exported plain `let currentDisplayedChord`,
every one of those writes would either throw or silently fail once moved
out of the declaring module.

The fix: `state.js` exports one object, `fretboardState`, and every former
bare identifier became a property access (`fretboardState.currentDisplayedChord`).
Property mutation on an imported object works everywhere, in both
directions, with no live-binding restriction - this is the same shape as
`src/audio/dispatch.js`'s registry, just holding fretboard UI state instead
of channels. `frets.js` was mechanically rewritten at all ~188 read/write
sites; the one local shadow (`initializeFretboard()`'s own `const
mainFretboard`, distinct from the module-level pointer since before this
phase) was left untouched, not renamed.

**One barrel-export consequence:** `frets.js` used to `export { ...,
currentDisplayedChord }`, and `chords.js`/`index.js` imported that binding
directly, relying on the same live-binding behavior to see the *current*
value whenever they read it (not a snapshot from import time). An object
property can't be re-exported as a bare name and stay live the same way, so
the barrel now exports `fretboardState` itself instead, and both consumers
were updated to read `fretboardState.currentDisplayedChord`. This is the
only change Phase 3 has made so far to a file outside `frets.js`/
`src/fretboard/`; everything else this checkpoint touched stayed inside the
mechanical rename.

Verified via `npm test` (28/28), `npm run build`, and the `run-app` skill
(default load, Scale Position Grid tab, Other Controls chord-grid tab) with
zero console errors.

### 6.4 `src/fretboard/geometry.js` (Phase 3, second step, 2026-08-01)

Unlike `state.js`, this step had no surprises: `calculateNote`,
`extractNoteName` and `extractOctave` were already `this`-free (pure
functions that happened to be declared as class methods); `calculateFretPosition`,
`getNoteAt` and `findNotePositions` only touched `this.fretPositions`/
`this.tuning`/`this.fretCount` - plain data, not DOM - so they moved by
adding those as parameters. The `Fretboard` class methods of the same
names are now one-line delegates (the same shape the file already used for
`getPatternsByChordType`, a class method delegating to a same-named
module-level function - not a new pattern here). `calculateFretPositions`
(plural - builds the whole fret-position table from a fret count) moved
unchanged; it had no `this` dependency to begin with.

Verified via `npm test` (28/28, including the Phase 0 `calculateNote`/
`calculateChordPatternPositions` characterization tests, which exercise this
module through the class delegates), `npm run build`, and a `run-app`
screenshot pixel-identical to the pre-checkpoint baseline.

**Addendum (Phase 3 step 5, `Fretboard.js`):** `getIntervalLabelFromRoot`
(root note + target note -> `INTERVAL_LABELS` entry) joined this module -
see §6.7 for why it landed here rather than in `Fretboard.js` itself.

### 6.5 `src/fretboard/markers.js` (Phase 3, third step, 2026-08-01)

A single function, `createNoteShapeMarker`, moved verbatim - it was already
self-contained (a position/size/shape-name in, one detached SVG element
out; the only global it touches is `document`, to call
`createElementNS`). Used by the Scale Position Grid's mini-fretboard
renderer and legend, both still in `frets.js` pending the UI-builder split
later in Phase 3. No behavior to preserve beyond "same switch statement,
different file" - verified via `npm test` (28/28), `npm run build`, and a
`run-app` screenshot pixel-identical to the pre-checkpoint baseline.

### 6.6 `src/fretboard/patterns.js` (Phase 3, fourth step, 2026-08-01)

Three methods moved: `calculateChordPatternPositions` (only touched
`this.fretCount`), `findOptimalChordShape` (only touched
`this.extractNoteName`, itself already a geometry.js delegate by this
point), and `findChordPatternMatches` (the largest - touched `this.tuning`,
plus `this.extractNoteName`/`this.findNotePositions`/
`this.calculateChordPatternPositions`/`this.getNoteAt`, all either plain
data or other now-pure delegates). All three became parameterized pure
functions calling `geometry.js` directly rather than routing back through
`this`; the class keeps three one-line delegate methods, same shape as the
geometry.js and markers.js steps.

**Left in place, deliberately:** `displayChordWithPatterns` and
`showAllChordPatterns` call `this.clearMarkers()`/`this.drawChordShape()` -
real DOM writes - so they stay Fretboard class methods, not pattern-matching
logic. `getPatternsByChordType` was already a one-line pass-through to
`chordPatterns.js`'s function of the same name; there was nothing to
extract, so it's untouched.

One dead import fell out of this move: `isStandardGuitarTuning` (from
`tuning.js`) was only ever called inside `findChordPatternMatches`, so
`frets.js`'s import of it was removed rather than left to trip
`no-unused-vars` - `patterns.js` imports it directly instead.

Verified via `npm test` (28/28 - `findChordPatternMatches`/
`calculateChordPatternPositions` are exactly the two Phase 0 characterization
tests with the most specific assertions, checking exact match counts and
position data, not just "doesn't crash"), `npm run build`, and a `run-app`
check (zero console errors on load; interactive chord-button clicks weren't
screenshotted this round - the characterization tests already assert exact
structured output for this module, which is stronger coverage than a visual
diff would add here).

### 6.7 `src/fretboard/Fretboard.js` (Phase 3, fifth step, 2026-08-01)

The class (1,719 lines) moved verbatim - by this point in Phase 3 its
geometry/marker/pattern methods were already thin delegates to the four
modules above, so this step was mechanical: cut the class out, give it its
own import list, paste it into a new file.

**One real gap the mechanical move surfaced:** `getIntervalLabelFromRoot`, a
small pure helper (root note + target note -> interval label via
`INTERVAL_LABELS`), was defined in `frets.js` right after the class and
called from *both* the class and two of `frets.js`'s own remaining
functions (chord-grid/scale-info display). Since `Fretboard.js` can't
import from `frets.js` (that would be circular - `frets.js` imports
`Fretboard` from here), the helper moved to `src/fretboard/geometry.js`
instead (it's pure note-math, the same shape as everything else already
there), and both `frets.js` and `Fretboard.js` now import it from there.
`npm run build`'s `no-undef` ESLint rule caught the miss immediately (a
build error, not a silent bug) - the same rule that would catch any future
case like this.

**What moved into `Fretboard.js` alongside the class, and why:**
`GUITAR_TUNING`/`FRET_COUNT` (constructor defaults) and `SCALE_COLORS`/
`DEFAULT_COLORS` (marker colors) were already class-adjacent constants with
no other logical home; `addInteractiveEvent` is a generic DOM
enter/leave/click helper that happened to sit next to the class before
Phase 3 and has no better home among today's modules (not fret math, not
marker drawing, not pattern matching, not shared mutable state). All four
are still needed by `frets.js`'s own remaining UI-builder code
(`GUITAR_TUNING`/`SCALE_COLORS` are also in the public barrel export), so
`frets.js` imports them back from `Fretboard.js` rather than duplicating
them - the one-way dependency direction (`frets.js` -> `Fretboard.js`,
never the reverse) is what keeps this from being circular. Revisit this if
a later phase gives `addInteractiveEvent` a real home (e.g. a small
DOM-utils module shared across the eventual `src/fretboard/ui/*` split).

One `no-unused-vars` case fell out cleanly: `INTERVAL_LABELS` was only
still imported in `frets.js` for `getIntervalLabelFromRoot`'s sake; once
that moved, the import was dead and was removed (`getIntervalColor`, the
other name in that import, stays - still used).

The pre-existing `default-case` ESLint warning on `addInteractiveEvent`'s
switch statement (no `default:` branch) moved from `frets.js` to
`Fretboard.js` along with the function - same warning, new address, not a
regression.

Verified via `npm test` (28/28, including `frets.test.js`'s `import {
Fretboard } from './frets'`, proving the re-export chain works), `npm run
build`, and `run-app` screenshots of three tabs that each exercise a
different `Fretboard` instance/code path (main fretboard + Scale Position
Grid, Scale Information, Chord Progression's own mini-fretboard) - zero
console errors, main-fretboard screenshot pixel-identical to every prior
checkpoint's baseline.

### 6.8 `src/fretboard/ui/controls.js` (Phase 3, sixth step / step 6 of 8, 2026-08-01)

Five functions moved as one unit: `createTabbedPanel`, `attachHotkeyFooter`,
`createInstrumentTuningPicker`, `createTopBar`, and `createFretboardControls`
(the 1,137-line one). All five were only ever called from within this
cluster or from `initializeFretboard()` - none are in `frets.js`'s public
barrel export, and a grep confirmed no other file imports any of them
directly - so unlike `fretboardState`, this move needed no external call
sites updated, just one: `frets.js`'s `initializeFretboard()` now calls the
imported `createFretboardControls` instead of a same-file function.

**`createFretboardControls` was split per control group, not moved as one
function**, per the plan. Reading its body end-to-end first (rather than
trusting the plan's guess at the boundaries) showed the 1,137 lines are
almost entirely one flat DOM-construction sequence with a handful of
comment-delimited groups, most of which build buttons that are **never
appended to the DOM** - the original's own `appendChild` calls for them are
commented out (`// controlsContainer.appendChild(demoBoxButton);` etc.).
Only `clearButton`, `showAllButton`, and everything in the chord-type/
label-mode/roman-numeral-buttons/chord-info/fingering-tabs group are live.
The split mirrors the source's own comment groupings exactly rather than
inventing new boundaries:

- `buildDisplayControls` - Clear All / Show All Notes (live) plus Show
  Current Scale / Clear Boxes / Demo Box (dead)
- `buildNoteMarkingControls` - Mark Note input + demo note/octave/line/chord
  buttons (all dead - `noteInputContainer` is built and populated but never
  appended)
- `buildNoteSearchControls` - the note-search box (dead)
- `buildChordVisualizationControls` - chord-type select, label-mode select,
  the eight roman-numeral/scale buttons, chord info display, fingering tabs
  container (**live** - this is the actual "Other Controls" tab content)
- `buildChordPatternDemoControls` - the four chord-pattern demo buttons (dead)
- `buildOtherControlsPanel` - assembles the above into `controlsContainer`,
  appending only the live pieces, exactly matching the original's
  append/comment-out pattern
- `createFretboardControls` - now just: build the panel, insert the top bar,
  build the chord progression UI, build the chord grid / scale position grid
  (still in `frets.js`), assemble the six tabs, attach the hotkey footer

The dead groups are kept exactly as inert as they already were - deleting
them is a dead-code cleanup this phase doesn't call for (same reasoning as
Phase 1's leftover cruft note). `buttonStyle`/`buttonHoverStyle` are passed
as parameters into each sub-builder rather than hoisted to module scope, to
keep the diff a pure move.

**The two-way import this created, and why it's safe:** the button handlers
inside `controls.js` (Clear All, the roman-numeral buttons, the label-mode
select) call glue functions - `showChordOnFretboard`, `showScaleOnFretboard`,
`showChordPatternOnFretboard`, `restoreFretboardState`,
`updateChordButtonStyles`, `updateChordInfoDisplay`, `clearFingeringTabs` -
that stay in `frets.js` per this phase's own glue/UI-builder categorization
(they're called from `index.js`/`chords.js`/`progressionBuilder.js` too, not
just from one panel). `createFretboardControls` also still calls
`createChordButtonGrid`/`createScalePositionGrid`/`updateChordGridColors`/
`renderScalePositionGrid`, which haven't moved out of `frets.js` yet. Since
`frets.js` in turn imports `createFretboardControls` from `controls.js`, this
is a real circular import between the two files - the same shape as the
pre-existing `chords.js` <-> `theory/chords.js` cycle (§6.1), not a new
pattern. It's safe for the same reason: every cross-import is only read
inside a function body invoked later (a click handler, or
`initializeFretboard()` itself, both called after the module graph has
finished evaluating), never at module top-level, so neither module needs the
other to have finished initializing first. `frets.js` gained a second,
clearly-commented `export { ... }` statement (separate from the stable
public barrel) listing exactly the names `controls.js` cross-imports -
`showChordPatternOnFretboard`, `restoreFretboardState`,
`updateChordButtonStyles`, `updateChordInfoDisplay`, `clearFingeringTabs`,
`createChordButtonGrid`, `createScalePositionGrid`, `renderScalePositionGrid`
(`showChordOnFretboard`/`showScaleOnFretboard`/`updateChordGridColors` were
already in the public barrel). The chord-grid/scale-position-grid names in
that list are temporary - `controls.js`'s import of them will repoint at
`./chordGrid`/`./scalePositionGrid` once those files are extracted later in
this same phase, and the cross-import export list shrinks accordingly.

One stray pre-existing doc comment was reunited with its function: the
JSDoc block for `createTabbedPanel` had been separated from it (sitting
above `initializeScalesInFretboard`, ~190 lines before the function it
describes - an unrelated pre-existing quirk, not introduced by this phase).
It now sits directly above `createTabbedPanel` in `controls.js`, where it
belongs. The other pre-existing doc quirk - `createTopBar`'s JSDoc sitting
above `createInstrumentTuningPicker` instead of above `createTopBar` itself -
was left exactly as-is, moved verbatim; fixing it wasn't this phase's job.

Two now-genuinely-unused imports fell out of `frets.js`: `getInstrumentPresets`
and `setActiveInstrumentConfig` (from `tuning.js`) and the
`createChordProgressionUI`/`loadSharedStateFromURL` import (from
`progressionBuilder.js`) were only ever used inside the code that moved;
removed rather than left to warn. A handful of other "possibly unused"
imports the same grep flagged (`highlightKeysForScales`, `selectedRootNote`,
`selectedScales`, `createChordRootNoteTable`, `createChordSuffixTable`,
`selectedChordRootNote`, `selectedChordSuffixes`, `getElementByNote`,
`getElementByMIDI`, `filterEnharmonicMatches`, `tuningToSlashFormat`) were
checked against `git show HEAD:src/frets.js` and confirmed pre-existing -
not touched.

Verified via `npm test` (28/28), plain `npm run build` (a line-by-line diff
of every ESLint warning before vs. after the change showed the identical set
of 200 warnings, just shifted line numbers inside the now-shorter `frets.js`
- zero new warnings, none in the new `controls.js`), and the `run-app` skill:
default load, "Other Controls" tab, and "Scale Position Grid" tab all
screenshot correctly with zero browser console errors. An attempt to click a
roman-numeral chord button hit the exact `getByText(..., {exact:true})`
pitfall the Phase 3 resume notes warned about (`I` resolved to an unrelated
hidden `<select><option>`, not the chord button) - per that same guidance,
this was not worth fighting further given the unit tests and zero-error
screenshots already in hand.

### 6.9 `src/fretboard/ui/chordGrid.js` (Phase 3, seventh step / step 7 of 8, 2026-08-01)

The Chord Pattern Grid (the 12-note x 12-chord-type color-coded button
table) plus the entire chord-fingering-shape pipeline it shares with the
Roman-numeral chord display, matching the categorization sketched in
the Phase 3 resume block (since retired into `REFACTOR_PLAN.md` §2.3), verified against the current
function list rather than assumed - one addition surfaced that the sketch
missed: `normalizeIntervalLabel`, used only by `buildIntervalLabelMap`,
belongs with this group too (kept private, not exported - it has no
external caller). Sixteen functions moved: `normalizeIntervalLabel`,
`analyzeChordScaleCompatibility`, `createChordButtonGrid`,
`getCurrentScaleNoteNames`, `getScaleIntervalEntries`, `deriveChordSuffix`,
`buildDegreeHeaderLabel`, `getScaleDescriptor`, `getSemitoneFromReference`,
`updateChordGridColors`, `buildIntervalLabelMap`, `buildFingeringShapes`,
`getFingeringMarkerLabel`, `renderFingeringShape`, `clearFingeringTabs`,
`renderFingeringTabs`, plus the `SEMITONE_TO_SCALE_INTERVAL_LABEL` constant
(`MODE_DISPLAY_NAMES`, used only inside `getScaleDescriptor`, stayed
private). Matching `geometry.js`/`markers.js`/`patterns.js`'s convention
(export every top-level function inline, not a single curated list at the
bottom), everything except the two private helpers is `export function`.

**Not independent of the still-unmoved Scale Position Grid code**, unlike
steps 1-6: `createScalePositionMiniFretboard` and `renderScalePositionGrid`
(both still in `frets.js`, pending this phase's next step) call
`getSemitoneFromReference`, `getFingeringMarkerLabel`,
`getCurrentScaleNoteNames`, `getScaleIntervalEntries`, `getScaleDescriptor`,
`buildDegreeHeaderLabel` and the `SEMITONE_TO_SCALE_INTERVAL_LABEL`
constant - all now imported back from `chordGrid.js`. The dependency only
runs one way (nothing in the chord-grid group calls into the scale-position
functions), so this doesn't create a new cycle; it does mean `frets.js`
picked up a substantial new import list from `chordGrid.js` in this step,
which is expected to shrink again once the Scale Position Grid code moves
into its own module and can import `chordGrid.js` directly instead of via
`frets.js`.

**The two-way import with `frets.js`, and why it's safe:** `createChordButtonGrid`'s
hover/click handlers call `showChordPatternOnFretboard`, `restoreFretboardState`,
`getFretboard`, `playChordVoicing` and `getChordVoicingNotes` - glue that
stays in `frets.js` per this phase's own categorization (called from
`index.js`/`chords.js`/`progressionBuilder.js` too, not just from this
grid). `playChordVoicing`/`getChordVoicingNotes` were previously called only
from within `frets.js` itself and had no export; both were added to
`frets.js`'s temporary cross-import `export { ... }` block (the one §6.8
introduced for `controls.js`) alongside the pre-existing
`showChordPatternOnFretboard`/`restoreFretboardState`. Since `frets.js` in
turn imports fifteen names from `chordGrid.js`, this is the same shape as
the `controls.js` <-> `frets.js` cycle in §6.8 and the pre-existing
`chords.js` <-> `theory/chords.js` cycle in §6.1: every cross-import is only
touched inside a function body invoked later (a click/hover handler, or a
function called from `initializeFretboard()`'s deferred `setTimeout`),
never at module top-level.

**`controls.js` repointed, not left cross-importing through `frets.js`:**
`clearFingeringTabs`, `createChordButtonGrid` and `updateChordGridColors`
were part of `controls.js`'s temporary cross-import from `frets.js` (§6.8);
now that they live in `chordGrid.js`, `controls.js` imports them from
`./chordGrid` directly instead. `frets.js`'s temporary cross-import block
dropped both (no longer defined there to re-export) and gained
`playChordVoicing`/`getChordVoicingNotes` (newly needed by `chordGrid.js`,
described above); `createScalePositionGrid`/`renderScalePositionGrid` stay
in that block until this phase's next step extracts them.

Verified via `npm test` (28/28), plain `npm run build` (diffed every ESLint
warning message before vs. after, ignoring line numbers since most of
`frets.js` shifted: the total count was unchanged at 219, `frets.js`'s own
warnings reduced to exactly its three pre-existing ones -
`filterEnharmonicMatches`/`tuningToSlashFormat` unused imports and
`GENERIC_VISIBLE_FRET_START` unused const, all pre-dating this phase - and
`chordGrid.js`/`controls.js` introduced zero new warnings; two imports that
became genuinely unused in `frets.js` as a result of the move -
`classifyFingeringSource` from `chordFingering.js` and `addInteractiveEvent`
from `Fretboard.js` - were removed rather than left to warn, the same
policy step 6 used). The `run-app` skill confirmed the default load (Scale
Position Grid tab, which now round-trips through `chordGrid.js`'s exports
for its interval labels and renders identically to the pre-checkpoint
screenshot), the Scale Information tab (where the Chord Pattern Grid
actually lives - not "Other Controls", corrected from an initial wrong
guess while writing the verification script), and a hover+click on a chord
grid cell (confirms the `addInteractiveEvent` handlers and the
`showChordPatternOnFretboard`/`restoreFretboardState`/`playChordVoicing`
cross-import into `chordGrid.js` all still fire) - zero console errors
throughout.

### 6.10 `src/fretboard/ui/scalePositionGrid.js` (Phase 3, eighth/final step, 2026-08-01)

The Scale Position Grid tab: twenty functions moved as one contiguous block
(it was already contiguous in `frets.js`, unlike the chord-grid group in
§6.9 which was split across two locations) - `findRowRootAbsoluteFret`,
`getAbsoluteFretForDisplayColumn`, `shadeColor`, `getContrastTextColor`,
`createScalePositionMiniFretboard`, `scalePositionCellKey` and the nine
visibility/toggle helpers next to it, `styleScalePositionFocusCell`,
`buildScalePositionFocusMatrix`, `createScalePositionPlaceholderCell`,
`renderScalePositionGrid`, `createScalePositionGrid` - plus six config
constants that fed only this block: `SCALE_POSITION_DEGREES`,
`MINI_SCALE_FRET_COUNT`, `GENERIC_VISIBLE_FRET_START`,
`GENERIC_ROOT_DISPLAY_COLUMN`, `SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET`,
`SCALE_POSITION_STACK_SIZES`, and `NOTE_SHAPE_TYPES`.
`GENERIC_VISIBLE_FRET_START` was already dead (assigned, never read)
before this phase touched it - confirmed by grep before moving, kept dead
rather than cleaned up, same policy as Phase 1's leftover-cruft note and
step 6's dead button groups. Every function is `export function`, matching
`geometry.js`/`markers.js`/`patterns.js`/`chordGrid.js`'s convention of
exporting everything rather than curating a minimal surface - all twenty
are called from within this module's own `renderScalePositionGrid`, so a
minimal-export pass would have exported nearly all of them anyway.

One pre-existing doc-comment quirk carried over unfixed, matching step 6's
policy on the `createTabbedPanel`/`createTopBar` quirk: the JSDoc block
naming `createScalePositionMiniFretboard`'s parameters sits directly above
`shadeColor` instead of above the function it describes (`shadeColor` was
evidently inserted between them at some point in the file's history) - kept
verbatim, not this phase's job to fix.

**Depends on `chordGrid.js`, one-directional - the only non-independent
step in this phase.** Unlike steps 1-6, this module isn't self-contained:
`createScalePositionMiniFretboard` and `renderScalePositionGrid` call
`getSemitoneFromReference`, `getFingeringMarkerLabel`,
`getCurrentScaleNoteNames`, `getScaleIntervalEntries`, `getScaleDescriptor`,
`buildDegreeHeaderLabel` and the `SEMITONE_TO_SCALE_INTERVAL_LABEL`
constant, all from `./chordGrid` (§6.9) - a dependency `frets.js` was
carrying on `chordGrid.js`'s behalf until this step, per §6.9's note about
the import list it picked up. Nothing in `chordGrid.js` calls back into
`scalePositionGrid.js`, so this is a plain one-way import, not a new cycle;
`chordGrid.js`'s module ownership row above now states the converse
explicitly (must not import `scalePositionGrid.js`) to keep the direction
from silently reversing in a future edit.

**`frets.js`'s import list dropped substantially, both from `chordGrid.js`
and from its own remaining code.** With the Scale Position Grid code gone,
`frets.js` no longer needed six of the fifteen names it imported from
`chordGrid.js` in step 7 (`getSemitoneFromReference`,
`getCurrentScaleNoteNames`, `getScaleIntervalEntries`, `getScaleDescriptor`,
`buildDegreeHeaderLabel`, `SEMITONE_TO_SCALE_INTERVAL_LABEL`) plus
`getFingeringMarkerLabel` - all removed rather than left to warn. Ten more
imports fell out of `frets.js` entirely once the block moved -
`FRET_COUNT`, `getIntervalColor`, `noteArrayContains`,
`areEnharmonicEquivalent`, the `notation.js` `midiToNote`/`noteToMidi`
aliases, `normalizeNote`, `assignFingers`, `selectGripFromPositions`,
`createNoteShapeMarker` - each confirmed via grep to have zero remaining
call sites in `frets.js` before removal, same discipline as every prior
step. `frets.js` still imports `renderScalePositionGrid` (three glue call
sites remain: the scale-selection handler, the scale-change debounce
handler, and `initializeFretboardWithScale`'s deferred `setTimeout`), but
not `createScalePositionGrid` - nothing in `frets.js` itself calls it
anymore, since `controls.js` now gets it directly from
`./scalePositionGrid` (below) rather than cross-importing it through
`frets.js`.

**`controls.js` repointed, same treatment as step 7 gave `chordGrid.js`'s
three names:** `createScalePositionGrid`/`renderScalePositionGrid` were the
last two entries in `controls.js`'s temporary cross-import from `frets.js`
(§6.8); both now come from `./scalePositionGrid` directly. `frets.js`'s
temporary cross-import `export { ... }` block (introduced in §6.8, trimmed
in §6.9) is now down to exactly the glue `chordGrid.js` and `controls.js`
still need back: `showChordPatternOnFretboard`, `restoreFretboardState`,
`updateChordButtonStyles`, `updateChordInfoDisplay`, `playChordVoicing`,
`getChordVoicingNotes`.

Verified via `npm test` (28/28), plain `npm run build` (total warning count
unchanged at 219; `scalePositionGrid.js` carries exactly the four warnings
that moved with its code verbatim - the pre-existing
`GENERIC_VISIBLE_FRET_START` unused-const and three pre-existing `eqeqeq`
warnings inside the "dark duplicate" branch - and `frets.js` dropped to
its two remaining pre-existing warnings, `filterEnharmonicMatches`/
`tuningToSlashFormat`; zero new warnings anywhere, confirmed by a second
build pass after the `getFingeringMarkerLabel`/`createScalePositionGrid`
cleanup this step's first build pass surfaced). The `run-app` skill
confirmed the default load (Scale Position Grid tab, pixel-identical to
every prior checkpoint), a Pattern Size slider drag (exercises
`renderScalePositionGrid`'s re-render path end to end), and the Scale
Information tab's Chord Pattern Grid (confirms `chordGrid.js` is unaffected
by this step) - zero console errors throughout. A Focus Selector cell click
hit a Playwright selector ambiguity (a bare `table` selector matched more
than one on-page table) rather than an app issue - per the Phase 3 resume
notes' guidance on fighting fragile selectors, not pursued further given
the slider re-render and the unit tests already covering this path.

This closes out Phase 3's function-extraction work. `frets.js` is now pure
glue - the entry points other files import (`initializeFretboard`,
`getFretboard`, chord/scale display functions, search functions) plus the
button-handler-adjacent functions `controls.js` and `chordGrid.js`
cross-import. What remains for Phase 3 is the barrel
(`src/fretboard/index.js`) re-exporting today's public surface unchanged.

### 6.11 `src/fretboard/index.js` — the barrel, and the end of `src/frets.js` (Phase 3, final step, 2026-08-01)

`frets.js`'s remaining ~1,120 lines - by this point pure glue, per §6.10's
closing note - moved to `src/fretboard/index.js` verbatim, save for import
paths shifting one directory level deeper (`./theory/chords` →
`../theory/chords`, `./fretboard/state` → `./state`, etc.). `src/frets.js`
was then deleted rather than kept as a re-export shim: the plan's own
sketch names `src/fretboard/index.js` as the eighth and final Phase 3
target, not a ninth file alongside a retained `frets.js`, and a shim would
have meant two files owning one export list forever - the thing this whole
phase was undoing.

**Three external call sites changed, exactly as expected.** `REFACTOR_PLAN.md`
Phase 3's framing - "no import site outside the folder changes" - describes
why steps 1-8 could each land as an independently reviewable pure move
(frets.js's own export list stayed stable throughout, so nothing outside it
ever needed touching); it was never a claim that the final barrel step
itself would avoid updating `frets.js`'s own importers, since retiring
`frets.js` is the one point where that has to happen. All three - confirmed
by grepping `from '../frets'`/`from './frets'` across `src/` before this
step - were updated to `from './fretboard'`: `src/chords.js`,
`src/index.js` (the app entry point, not this barrel - the two are
same-named but different files, `src/index.js` vs `src/fretboard/index.js`),
and the Phase 0 characterization test file, which was also renamed from
`frets.test.js` to `fretboard.test.js` since the file it was named after no
longer exists.

**Two internal cross-imports repointed too.** `ui/controls.js` and
`ui/chordGrid.js` (§6.8, §6.9) imported their glue functions
(`showChordPatternOnFretboard`, `restoreFretboardState`,
`updateChordButtonStyles`, `updateChordInfoDisplay`, and for `chordGrid.js`
also `getFretboard`/`playChordVoicing`/`getChordVoicingNotes`) from
`'../../frets'`; both now import from `'..'` (the parent directory's
`index.js`, i.e. this barrel). The two-way import shape these files have
with the barrel is unchanged from the two-way shape they had with
`frets.js` - same reasoning applies (every cross-import is only touched
inside a function body invoked later, never at module top-level) - only the
target file's name changed. `ui/scalePositionGrid.js` (§6.10) never
imported from `frets.js` directly (it only depends on `chordGrid.js`), so
it needed no change here.

**Historical `Lifted from src/frets.js` provenance comments were left
alone**, in every module Phase 3 already extracted (`state.js`,
`geometry.js`, `markers.js`, `patterns.js`, `Fretboard.js`,
`ui/scalePositionGrid.js`) - they're accurate statements about where that
code came from, not claims about where it lives now, so deleting the file
they name doesn't make them wrong. A handful of comments describing
*current* relationships (not historical provenance) were updated where
they'd otherwise mislead: `state.js`'s "shared by frets.js and..." header,
its `mainFretboard` field comment, `geometry.js`'s
`getIntervalLabelFromRoot` doc comment, `Fretboard.js`'s header paragraph
about who imports `GUITAR_TUNING`/`FRET_COUNT`/`SCALE_COLORS`/
`addInteractiveEvent` back, and `markers.js`'s doc comment naming where
`createScalePositionMiniFretboard` lives. A few similar present-tense
mentions of `frets.js` in files this phase never touched
(`App.js`, `MiniPiano.js`, `progressionBuilder.js`, `theory/intervals.js`,
`theory/notes.js`, `tuning.js`) were left as-is - some predate this phase
entirely (e.g. `MiniPiano.js`'s comment already referred to
`getIntervalColor` as if still in `frets.js`, when Phase 2 had moved it to
`theory/intervals.js` months of phase-time earlier), and fixing them isn't
this step's job any more than step 6 rewriting `chords.js`'s pre-existing
quirks was its job. This document's own present-tense sections (§1, §3, §5,
the module ownership table) were updated instead, since keeping *this* file
accurate is what `REFACTOR_PLAN.md` §2.4 (documentation discipline) requires.

Verified via `npm test` (28/28, including `fretboard.test.js` importing
correctly under its new name and path), plain `npm run build` (total
warning count unchanged at 219; `src/fretboard/index.js` carries exactly
the two pre-existing `frets.js` warnings that moved with the glue code
verbatim - `filterEnharmonicMatches`/`tuningToSlashFormat` unused imports -
zero new warnings anywhere, including in `chords.js`/`src/index.js` after
their import-path change), and the `run-app` skill: all six tabs (Scale
Information, Chord Progression, Scale Position Grid, Scale Selection, Other
Controls, Synthesizer) load with zero console errors, including the
Synthesizer tab specifically - the one place `ARCHITECTURE.md` §1 and
`index.js`'s own comments flag a documented historical race between
`initializeFretboard()`'s re-run and React's portal mount into
`#fretNotPlaceholder`, so confirming it still mounts cleanly after this
much import-graph surgery was the highest-value single check available.

**Phase 3 is complete.** `src/frets.js` (originally 6,974 lines, 5,837 live)
no longer exists; its contents are `src/fretboard/state.js`, `geometry.js`,
`markers.js`, `patterns.js`, `Fretboard.js`, `ui/controls.js`,
`ui/chordGrid.js`, `ui/scalePositionGrid.js`, and `index.js` (this barrel).
Every external consumer imports the folder as a unit via `from
'./fretboard'`. Phase 4 (splitting `progressionBuilder.js` and
`scaleGenerator.js`/`scales.js`) is next per `REFACTOR_PLAN.md`.

### 6.12 `src/progression/state.js` (Phase 4, first step, 2026-08-01)

Same treatment as `src/fretboard/state.js` (§6.3), and for the same reason:
`progressionBuilder.js` held ~15 module-level `let`s that most of its
functions close over, some of them fully *reassigned* (not just
mutated-in-place) elsewhere in the file - e.g. `currentProgression =
resolvedProgression` in `updateProgression()`, `precomputedPatternData =
newPatternData` in `updateProgressionIncremental()` - which a bare ES module
export can't support for importers, so they're all fields on one exported
mutable object, `progressionState`, not individual `let`s. Every read/write
site in `progressionBuilder.js` was rewritten from a bare identifier to
`progressionState.<name>`. Three configuration constants that are only ever
property-mutated, never reassigned wholesale (`INPUT_DEBOUNCE_DELAY`,
`CHORD_LINE_CONFIG`, `MINI_FRETBOARD_CONFIG`), moved alongside as plain
named exports rather than fields on the object - the same distinction
`src/fretboard/state.js` draws for its own persistence-key constant.

Two things this step's verification caught, worth flagging for whoever does
the remaining Phase 4 steps:

- **A live external dependency on the wrapper array's identity.**
  `window.currentProgression = currentProgression` (a manual snapshot, not a
  live binding) is read by `PolySynth.jsx`, which in one place
  (`PolySynth.jsx:2014-2016`) mutates it **in place**
  (`window.currentProgression.length = 0; window.currentProgression.push(...)`).
  That only stays correct if `window.currentProgression` and
  `progressionState.currentProgression` are the *same array object* at every
  point PolySynth might run. `progressionBuilder.js` already re-pointed
  `window.currentProgression` by hand after every full reassignment (in
  `updateProgression()` and `clearProgression()`); that manual re-sync is
  unchanged, just now reading `progressionState.currentProgression` instead
  of a bare identifier. Migrating this to a real live reference (so the
  manual re-sync can be deleted) is Phase 5's job, not this one's.
- **A naive "not preceded by `.`" rename rule has a false-negative on spread
  syntax.** `[...currentProgression]` has a `.` immediately before the
  identifier (the last of the three spread dots), which is
  indistinguishable from property access to a simple regex lookbehind - one
  site (`updateProgressionIncremental()`) was missed by the mechanical pass
  for exactly this reason and caught by `npm run build`'s `no-undef` check,
  not silently. Grep `\.\.\.<name>\b` in addition to `\.` + `<name>`
  before trusting a bulk rename is complete, for future phases doing the
  same kind of rewrite in `scaleGenerator.js`.

One more disambiguation this step depended on: `buildShareableState()` /
`decodeStateFromURLParams()` / `applySharedState()` build and read a
*local* `state` object with field names that coincidentally match four
`progressionState` fields (`showMiniFretboards`, `showFretboardIntervals`,
`showMiniPianos`, `useSeventhChords`) - e.g.
`showMiniFretboards: showMiniFretboards` is an object-literal key (left,
unchanged) next to a `progressionState` read (right, renamed), and
`state.showMiniFretboards` (property access on the *unrelated* local
`state`) must never be confused with `progressionState.showMiniFretboards`.
Both objects happen to share these four names because the URL-share format
mirrors the toggle state it serializes, not because they're the same
object - full detail in `progressionBuilder.js`'s `buildShareableState`/
`applySharedState` functions themselves.

`currentProgression` and `selectedPatternIndexes` were also removed from
`progressionBuilder.js`'s tail `export { ... }` block - both are exported
today but grepping the whole of `src` for `from '../progressionBuilder'` /
`from './progressionBuilder'` (besides the one test-file comment) turned up
zero importers of either name; `src/fretboard/ui/controls.js` is the file's
only real external importer, and it only ever imports
`createChordProgressionUI`/`loadSharedStateFromURL`. Dead exports, not
live traffic - consistent with the other dead-code corrections this plan has
already made in Phase 1/2 (§7 below).

`npm test` (28/28) and plain `npm run build` pass - total warning count
unchanged at 219, the three warnings that live inside `progressionBuilder.js`
shifted line numbers only (the file is ~45 lines shorter after the
declaration block moved out), confirmed via `scripts/check-build.sh`'s diff
before updating the baseline. Verified via the `run-app` skill: default
load and the Chord Progression tab render identically to the Phase 3
baseline; typing `I IV V vi` into the progression input correctly parses
and resolves the roman-numeral chords against the active scale (exercising
`parseProgressionInput`/`precomputePatternData`/`resolveRomanChord` reading
and writing `progressionState`); toggling "Show Mini Pianos" and "Use
Seventh Chords" correctly re-rendered mini pianos and switched every chord
from a triad to its seventh (Em -> Em7, Am -> Am7, ...), which exercises
`progressionState.showMiniPianos`/`progressionState.useSeventhChords`
end-to-end, not just at parse time. Zero console errors in all of the
above. Remaining Phase 4 work for `progressionBuilder.js`: `parse.js`,
`share.js`, the `ui/*.js` split, then the barrel - see
`REFACTOR_PLAN.md`'s Phase 4 section for the current plan. `scaleGenerator.js`
/ `scales.js` -> `src/scales/` is a separate checkpoint after that.

### 6.13 `src/progression/parse.js` (Phase 4, second step, 2026-08-01)

The eight functions the plan named (`REFACTOR_PLAN.md`'s Phase 4 sketch)
turned out to already be one contiguous block in `progressionBuilder.js`
(`clearCache` through `collectArpeggiationNotes`, immediately after the
state block Phase 4 step 1 pulled out) - a pure cut-and-paste with import
paths adjusted, no reordering needed.

Two functions the moved block calls - `getChordDisplayName` and
`getFretboardForProgression` - are defined later in `progressionBuilder.js`
and were **not** moved here, even though `precomputePatternData`/
`getChordPatternMatches` need them. Both are called more from code that
stays in `progressionBuilder.js` (chord-element/pattern-selector rendering,
playback) than from what moved here, so moving them would just relocate the
cross-file dependency rather than remove it. `parse.js` imports them back
from `../progressionBuilder` instead - the same two-way-import shape Phase
3 used between `src/fretboard/ui/{controls,chordGrid}.js` and
`src/fretboard/index.js` (§6.8), safe for the same reason: neither is read
at module top level, only inside function bodies, so the circular import
resolves fine. This required adding both to `progressionBuilder.js`'s own
`export { ... }` block, where they weren't exported before (they had no
external callers, only internal ones) - a real, if narrow, widening of that
file's public surface, done because `parse.js` needs it, not because
anything outside `src/progression/` does.

Removing the block's four now-unused imports from `progressionBuilder.js`
(`parseChordToken`, `getActiveConfig as getActiveInstrumentConfig`,
`selectGripFromPositions`, and partially `resolveRomanChord`/
`getNoteAtStringFret` which stayed - grepped individually, both still have
call sites outside the moved block) was caught by `scripts/check-build.sh`'s
diff, not left as new warnings: a first build after the move showed three
new `no-unused-vars` hits, one per import that had zero remaining call
sites in `progressionBuilder.js` once its only uses moved to `parse.js`.

`npm test` (28/28) and plain `npm run build` pass - total warning count
unchanged at 219; the one warning that lived inside the moved block
(`if (intervalName == "P1")`, an `eqeqeq` hit) moved to `parse.js` verbatim,
same as Phase 3 always saw when a warning's line moved with its code.
Verified via the `run-app` skill: typed a full progression, then edited it
incrementally (added a fifth chord) to exercise `updateProgressionIncremental`/
`compareTokenArrays` specifically rather than just the full-reparse path,
and switched a chord's pattern-selector dropdown to confirm
`precomputePatternData`/`getChordPatternMatches` still drive the mini
fretboard's displayed voicing correctly (fret 0-2 -> fret 2-5 for the same
chord, everything else on the page unchanged) - zero console errors
throughout. Remaining Phase 4 work: `share.js`, the `ui/*.js` split, then
the barrel; `scaleGenerator.js`/`scales.js` -> `src/scales/` after that.

### 6.14 `src/progression/share.js` (Phase 4, third step, 2026-08-01)

The nine URL-sharing functions (`buildShareableState` through
`loadSharedStateFromURL`) were, like the `parse.js` block before them, one
contiguous section at the tail of `progressionBuilder.js` - straight
cut-and-paste. Only `updateProgression` is imported back (used once, inside
`applySharedState`'s fallback path when no `#chord-progression-input`
element exists yet) - same cross-import shape as `parse.js`'s
`getChordDisplayName`/`getFretboardForProgression` (§6.13).

Of the nine moved functions, only four have callers outside this module
(`generateShareableURL`, `copyShareableURL`, `loadSharedStateFromURL`,
`applySharedState` - the first two from the Share button's handler still in
`progressionBuilder.js`, the latter two are also `progressionBuilder.js`'s
own current export-list entries, one of which - `loadSharedStateFromURL` -
has a real external importer in `src/fretboard/ui/controls.js`). Those four
are `share.js`'s export list; `buildShareableState`/`encodeStateToURLParams`/
`decodeStateFromURLParams`/`encodeStateToURL`/`decodeStateFromURL` stay
module-private, called only by the other four within this file.

Two now-dead imports fell out of `progressionBuilder.js` (`setPrimaryRootNote`,
`setPrimaryScale` from `scaleGenerator.js` - both were called only inside
`applySharedState`, which moved) and were caught the same way as step 2's
three: a first build showed the `no-unused-vars` hits, not left as new
warnings. `getPrimaryScale`/`getPrimaryRootNote` from the same import stayed,
since `progressionBuilder.js` still reads them in half a dozen other places.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged;
the `encodeStateToURL` legacy-function `no-unused-vars` warning (pre-existing
- nothing in the app calls the Base64 path anymore, only the human-readable
one) moved to `share.js` verbatim. Verified via the `run-app` skill with the
one check this step's own code makes possible that earlier steps couldn't:
built a progression, toggled "Show Mini Pianos", clicked **Share**, captured
the resulting URL (`?p=I-1+IV-1+V-1+vi-1&r=E&s=Major-6&ui=fkn`), then
navigated to that exact URL fresh and confirmed the progression input,
pattern labels (`[Pattern 1]`), and the "Show Mini Pianos" toggle all came
back correctly - the full `buildShareableState` -> `encodeStateToURLParams`
-> `copyShareableURL` write path and `loadSharedStateFromURL` ->
`decodeStateFromURLParams` -> `applySharedState` read path, round-tripped
through an actual page load, not just a function call. Zero console errors.
Remaining Phase 4 work: the `ui/*.js` split, then the barrel;
`scaleGenerator.js`/`scales.js` -> `src/scales/` after that.

### 6.15 `src/progression/playback.js` (Phase 4, fourth step, 2026-08-01)

Unlike steps 2-3, this one **wasn't** a single contiguous block move without
adjustment - a pre-move call-graph check (grepping every call site of each
candidate function, not just trusting file position) found that
`getFretboardForProgression`, textually sandwiched between this group and
the rest of the file, is never actually called by any of the six playback
functions. Its three real callers (`displaySingleChordPattern`,
`displayScaleContext`, `displayAllChordPatterns`) are all still in
`progressionBuilder.js`, in what will become the fretboard-display cluster
- so it stayed put rather than moving on the strength of proximity alone.
This is the same "verify before trusting a categorization" lesson Phase 3's
resume notes flagged, applied here before it caused a wrong move rather
than after.

Of the six functions that did move, only three had callers outside this
block (`getProcessedChordNotes`, `getProcessedProgression`,
`triggerChordProgression` - called from `createProgressionControlsSection`,
`createChordElement`, and `createPatternSelector`, none of which have moved
out of `progressionBuilder.js` yet); those three are `playback.js`'s export
list. `convertNoteForPolySynth`/`getOneBeatDuration`/`getDurationInMs` stay
module-private, called only from within this file - same shape as
`parse.js`'s private helpers (§6.13).

One now-dead import fell out of `progressionBuilder.js`
(`getChordPatternMatches` from `./progression/parse` - its only call site
moved with `getProcessedChordNotes`), caught by `scripts/check-build.sh`'s
diff as a new `no-unused-vars` hit, same as every prior step.
`notationStripOctave`/`getNoteAtStringFret`/`getChannel`/`isChannelEnabled`
were checked the same way and confirmed still used elsewhere in
`progressionBuilder.js` (the not-yet-moved chord-card cluster), so those
imports stayed.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged,
only a line-number shift. Verified via the `run-app` skill: built a
progression and clicked a chord card, confirming the console log
(`Triggering chord 0: I (Em) [E2, B2, E3, G3, B3, E4]`) shows the full
`triggerChordProgression` -> `getProcessedChordNotes` -> cross-imported
`getChordDisplayName` path resolved correctly through the new module - zero
console errors. Remaining Phase 4 work: `scaleSync.js`,
`fretboardDisplay.js`, the chord-card cluster, `progressionList.js`,
`input.js`, `controls.js`, then the barrel; `scaleGenerator.js`/`scales.js`
-> `src/scales/` after that.

### 6.16 `src/progression/scaleSync.js` (Phase 4, fifth step, 2026-08-01)

Another contiguous block (`setupScaleChangeListener` through
`updateRomanNumeralChords`, right after `getFretboardForProgression` and
before `createInputSection`), straight cut-and-paste. Of the six functions,
only `setupScaleChangeListener` and `initializeScaleNotesDisplay` have
callers outside the block (both from `createChordProgressionUI`, which
hasn't moved), so those two are this module's export list;
`updateScaleNotesDisplay`/`generateFallbackScaleNotes`/
`updateProgressionDisplayForScaleChange`/`updateRomanNumeralChords` stay
private, called only from within this file.

This module needed four cross-imports back into `progressionBuilder.js` -
`precomputeAllPatternData`, `updateProgressionDisplay`,
`displaySingleChordPattern`, `displayAllChordPatterns` - all of which
belong to clusters (progression-list, fretboard-display) that haven't
moved out yet, so all four were plain internal functions with no export
before this step. Added to `progressionBuilder.js`'s export list, same
treatment `getChordDisplayName`/`getFretboardForProgression` got in §6.13.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings,
unchanged, one line-number shift for a warning that moved with its code.
Verification here needed an extra step beyond the usual `run-app` check: a
first attempt to confirm the scale-notes display (`#scaleNotesDisplay`)
updates after a root-note change found it stuck on the hardcoded default
text (`"C D E F G A B"`) or a `"Loading..."` fallback, which looked like a
regression. Checking against the pre-this-step commit (`git stash` the
edit, not the new file, then re-run the identical Playwright script)
reproduced the **exact same stuck text on unmodified code** - a
pre-existing display bug (in the same family as the "pre-existing
Playwright-timing flakiness" Phase 2's result note already documented for
this app), not something this step introduced. The console log trail
(`Scale change detected via event` -> `Progression display updated for
scale change`, both exact strings from the moved code) confirmed the
underlying logic ran correctly regardless. A stronger, non-flaky check
gave conclusive confirmation instead: changing the root-note dropdown from
E to A correctly re-resolved every Roman-numeral chord in a live
progression (`I (Em)` -> `I (Am)`, `IV (Am)` -> `IV (Dm)`, `V (Bm)` -> `V
(Em)`, `vi (CM)` -> `vi (FM)`) and their mini-fretboard voicings, end to
end through `updateRomanNumeralChords` -> `precomputeAllPatternData` ->
`updateProgressionDisplay`. Zero console errors throughout. Remaining
Phase 4 work: `fretboardDisplay.js`, the chord-card cluster,
`progressionList.js`, `input.js`, `controls.js`, then the barrel;
`scaleGenerator.js`/`scales.js` -> `src/scales/` after that.

### 6.17 `src/progression/fretboardDisplay.js` (Phase 4, sixth step, 2026-08-02)

Another contiguous block (`displaySingleChordPattern` through
`displayAllChordPatterns`, immediately before `clearProgression`), straight
cut-and-paste. This is the cluster `getFretboardForProgression` actually
belongs to - §6.15 already found, by grepping call sites rather than
trusting file position, that none of the six `playback.js` functions call
it and that its three real callers are these three functions. That held up
here: `getFretboardForProgression` stayed in `progressionBuilder.js`
(`clearProgression` also calls `displayScaleContext` directly and has no
other reason to move), and all three moved functions cross-import it back.

All three functions have callers outside this block, so all three are
exported: `displaySingleChordPattern`/`displayAllChordPatterns` from eight
call sites still in `progressionBuilder.js` (hover handlers, pattern-
selector change handlers, `updateProgression`) plus `scaleSync.js`
(cross-imported before this step, from `../progressionBuilder` - repointed
to `./fretboardDisplay` as part of this move, since re-exporting them
through `progressionBuilder.js` once they no longer live there would just
add an indirection); `displayScaleContext` from `clearProgression`, which
stays in `progressionBuilder.js`, so it's also a fourth cross-import back.

One now-dead import fell out of `progressionBuilder.js` (`CHORD_LINE_CONFIG`
from `./progression/state` - its only two call sites, both inside the moved
block, moved with it), caught by `scripts/check-build.sh`'s diff, same as
every prior step. `precomputePatternData` was checked the same way and
stayed, since `progressionBuilder.js` still calls it directly at two other
sites (`updateProgression`, `createPatternSelector`).

`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged;
the one warning affected by this move (`scaleSync.js`'s pre-existing
`'lastDisplayedNotes' is assigned a value but never used`) shifted from line
75 to 78, a pure line-number move from this step's own import-block edit,
not a new warning. Verified via the `run-app` skill: built a progression
(`I IV V vi`) and hovered the first chord card, confirming an orange
pattern line rendered across the main fretboard (fret 1-15 for `I (Em)`)
via `displaySingleChordPattern`; toggled "Show Scale Context" off and back
on to exercise `displayScaleContext`'s branch inside it; then clicked
**Clear Progression** and confirmed the fretboard reset to a full scale
display with no chord-pattern lines, exercising `clearProgression`'s
cross-imported call to `displayScaleContext` - zero console errors
throughout. Remaining Phase 4 work: the chord-card cluster,
`progressionList.js`, `input.js`, `controls.js`, then the barrel;
`scaleGenerator.js`/`scales.js` -> `src/scales/` after that.

### 6.18 `src/progression/chordCard.js` (Phase 4, seventh step, 2026-08-02)

Another contiguous block - `copySvgAsPng` through `createPatternSelector`,
immediately after the not-yet-moved progression-list functions
(`createProgressionDisplaySection`/`updateProgression`/`precomputeAllPatternData`/
`updateProgressionDisplay`/`highlightCurrentChord`) and immediately before
`clearProgression` - straight cut-and-paste, six functions matching the
plan's list plus one it didn't: `getChordDisplayName`.

The plan's investigation note (and §6.13/§6.15) expected `getChordDisplayName`
to stay in `progressionBuilder.js`, cross-imported by `parse.js`/`playback.js`,
because at the time most of its callers lived there. That was true when
those steps landed, but it stopped being true once this step's own cluster
was identified: grepping every call site before moving anything (the same
check that caught `getFretboardForProgression` in §6.15/§6.17) found
`getChordDisplayName`'s only two remaining callers inside
`progressionBuilder.js` were `createChordElement` and `createPatternSelector`
- both moving in this step. Leaving it behind would have meant a four-way
cross-import (`parse.js`, `playback.js`, and this new module all reaching
into a `progressionBuilder.js` that no longer had any callers of its own)
instead of moving it to where its callers actually are. So it moved, and
`parse.js`/`playback.js` had their existing `getChordDisplayName` imports
repointed from `../progressionBuilder` to `./chordCard`.

That repointing creates two new two-way-import pairs that, unlike every
prior Phase 4 cross-import, are both between already-extracted modules
rather than between an extracted module and the `progressionBuilder.js`
residual: `chordCard.js` imports `precomputePatternData` from `parse.js`
while `parse.js` imports `getChordDisplayName` back from `chordCard.js`;
`chordCard.js` imports `getProcessedChordNotes`/`getProcessedProgression`/
`triggerChordProgression` from `playback.js` while `playback.js` imports
`getChordDisplayName` back from `chordCard.js`. Both resolve safely for the
same reason every other cross-import in `src/progression/` does - neither
side reads the other's export at module top level, only inside function
bodies - confirmed by the clean build and passing tests below, not just
asserted.

One more cross-import went the other way: `updateProgressionDisplay`
(called from `createPatternSelector`'s change handler) hasn't moved out of
`progressionBuilder.js` yet (progression-list cluster, still pending), so
`chordCard.js` imports it back - the same shape `scaleSync.js` already
established.

Only `createChordElement` has a caller outside this block
(`createProgressionDisplaySection`, still in `progressionBuilder.js`), so
it's this module's sole non-`getChordDisplayName` export; `createPatternSelector`/
`createMiniFretboardVisualization`/`copySvgAsPng`/`showNotification`/
`lightenColor` stay private, called only from within this file - same
call-chain shape (`createChordElement` -> `createPatternSelector` ->
`createMiniFretboardVisualization` -> `copySvgAsPng` -> `showNotification`,
plus `lightenColor`) the investigation note described.

Sixteen imports fell out of `progressionBuilder.js` as dead
(`intervalToSemitones`, `HeptatonicScales`/`getScaleNotes`, `getPrimaryScale`/
`getPrimaryRootNote`, `notationStripOctave`, `CHROMATIC`, `createChordPiano`/
`createMixedPiano`, `createChordStave`/`createMixedStave`,
`getNoteAtStringFret`, `getChannel`/`isChannelEnabled`, `getProcessedChordNotes`,
`triggerChordProgression`) - every one of them had zero remaining call sites
once this block's only uses of them moved, caught by
`scripts/check-build.sh`'s diff as new `no-unused-vars` hits, same as every
prior step. `getPrimaryScale`/`getPrimaryRootNote` were double-checked
individually since `scaleGenerator.js`'s import also carries
`initializeNavigationButtonsDirect`, which does still have a call site
(`createChordProgressionUI`) - that one import stayed, narrowed to just the
name still used.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged
except one line-number-only shift (`parse.js`'s pre-existing `eqeqeq`
warning moved two lines for this step's header-comment edit). Verified via
the `run-app` skill: built a progression, enabled "Show Mini Pianos" and
"Show Mini Staves" (exercising `createChordElement`'s optional branches),
confirmed all four chord cards rendered with correct names (`I (Em)`
through `vi (CM)`), notes, mini pianos, and mini staves (including a
correctly-rendered sharp for `V (Bm)`); changed the first card's
pattern-selector dropdown and confirmed the main fretboard's pattern line
changed shape to match; clicked the next-pattern button; clicked the card
to trigger playback; and right-clicked a mini-fretboard SVG to trigger
`copySvgAsPng`, confirming the "downloaded as PNG" notification appeared
(`showNotification`'s clipboard-unavailable fallback path, expected in
headless Chromium) - zero console errors throughout. Remaining Phase 4
work: `progressionList.js`, `input.js`, `controls.js`, then the barrel;
`scaleGenerator.js`/`scales.js` -> `src/scales/` after that.

### 6.19 `src/progression/progressionList.js` (Phase 4, eighth step, 2026-08-02)

Three functions matching the plan's list exactly - `createProgressionDisplaySection`,
`updateProgressionDisplay`, `highlightCurrentChord` - but **not** a
contiguous block this time, unlike every step since `parse.js`/`share.js`:
`updateProgression` and `precomputeAllPatternData` sit between
`createProgressionDisplaySection` and `updateProgressionDisplay` in
`progressionBuilder.js`, and neither is part of this cluster (both stay -
`updateProgression` is core residual orchestration, `precomputeAllPatternData`
is already cross-imported by `scaleSync.js`). The move pulled the three
target functions out individually rather than as one cut block, leaving
`updateProgression`/`precomputeAllPatternData` untouched in place.

This is the first Phase 4 module with **no** cross-import back into the
`progressionBuilder.js` residual - checked the same way as every other
step (grep every call site before assuming), and none of the three
functions' bodies touch anything that hasn't already moved:
`createProgressionDisplaySection` is pure DOM, `highlightCurrentChord` only
touches `progressionState` and DOM, `updateProgressionDisplay` only touches
`progressionState` and `createChordElement` (already in `chordCard.js`).
`window.highlightCurrentChord = highlightCurrentChord` - PolySynth.jsx's
only way to reach it - moved along with the function itself, since nothing
in `progressionBuilder.js`'s own residual called `highlightCurrentChord`
directly (only the window assignment did).

Moving `updateProgressionDisplay` out meant repointing three existing
cross-imports of it that all pointed at `../progressionBuilder`:
`chordCard.js`'s (§6.18) and `scaleSync.js`'s (§6.16) now import it from
`./progressionList` instead. `chordCard.js`'s repoint creates a second
two-way pair between already-extracted modules (the first was
`chordCard.js` <-> `parse.js`/`playback.js` for `getChordDisplayName`, §6.18):
`progressionList.js` imports `createChordElement` from `chordCard.js`,
`chordCard.js` imports `updateProgressionDisplay` back from
`progressionList.js`. Safe for the same reason as every other cross-import
here - neither side reads the other's export at module top level.
`progressionBuilder.js` itself now has no direct import of `chordCard.js`
at all; it only reaches `createChordElement` transitively, through
`progressionList.js`'s own import of it.

One now-dead import fell out of `progressionBuilder.js` (`createChordElement`,
which had only been needed inside the just-moved `updateProgressionDisplay`),
caught by `scripts/check-build.sh`'s diff, same as every prior step.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged
except one line-number-only shift (`scaleSync.js`'s pre-existing
`'lastDisplayedNotes'` warning moved for this step's header-comment edit).
Verified via the `run-app` skill: built a progression (`I IV V vi`,
confirmed 4 cards rendered via `createProgressionDisplaySection`/
`updateProgressionDisplay`), toggled "Show Intervals" and confirmed the
same 4 cards re-rendered with the toggle applied (`updateProgressionDisplay`
still driving re-renders through its new cross-import path), then started
the built-in sequencer (**Loop Progression**) and read each chord card's
`boxShadow` style mid-playback - one card showed the expected
`rgb(76, 175, 80) 0px 0px 15px` highlight while the others were unstyled,
confirming `window.highlightCurrentChord` (called from `PolySynth.jsx`)
correctly reaches `highlightCurrentChord` in its new location end-to-end -
zero console errors throughout. Remaining Phase 4 work: `input.js`,
`controls.js`, then the barrel; `scaleGenerator.js`/`scales.js` ->
`src/scales/` after that.

### 6.20 `src/progression/input.js` (Phase 4, ninth step, 2026-08-02)

Self-contained, exactly as the investigation note predicted - one function,
`createInputSection`, cut and pasted as-is. Its only external dependencies
are `progressionState`/`INPUT_DEBOUNCE_DELAY` (already in `state.js`) and
`updateProgression`, which stays in `progressionBuilder.js` (core residual
orchestration) and is cross-imported back - `updateProgression` was already
exported for `share.js`'s cross-import (§6.14), so this step only added a
second consumer to that export's comment, not a new export.

`createInputSection`'s only caller is `createChordProgressionUI`, still in
`progressionBuilder.js`, so it's this module's sole export.
`INPUT_DEBOUNCE_DELAY` fell out of `progressionBuilder.js`'s own import of
`state.js` as dead (its only remaining use had been inside the just-moved
function), caught by `scripts/check-build.sh`'s diff.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings, unchanged,
with **zero** line-number shifts this time (`check-build.sh` reported no
diff at all against the baseline) - the first Phase 4 step where every
touched file's warnings landed on already-baselined line numbers. Verified
via the `run-app` skill: typed a progression character-by-character (not
`fill()`, to exercise the actual debounce timer) and confirmed 4 chord
cards appeared after `INPUT_DEBOUNCE_DELAY` elapsed; appended a chord and
confirmed the card count went to 5; selected all and retyped a shorter
progression and confirmed it dropped to 3 - each transition exercising the
full `input` event -> debounce timer -> cross-imported `updateProgression`
path from the new module - zero console errors throughout. Remaining Phase
4 work: `controls.js`, then the barrel; `scaleGenerator.js`/`scales.js` ->
`src/scales/` after that.

### 6.21 `src/progression/controls.js` (Phase 4, tenth step, 2026-08-02)

The largest single move of Phase 4 - `createProgressionControlsSection`
was 907 lines (139-1045), the only function between
`createChordProgressionUI` and `updateProgression`. Confirmed by grep
before moving, same as every step: 14 distinct control groups, all with
their only external caller being `createChordProgressionUI` (which stays
in `progressionBuilder.js` and needed a single cross-import back for the
orchestrator).

Two clusters of the 14 groups turned out entangled by shared
event-listener wiring - discovered the same way the chord-card cluster's
internal call chain was (tracing actual references, not just adjacency)
- and are built together in one `buildXControls()` each rather than
split further, matching the "tightly coupled -> one function" call
`chordCard.js` already made (§6.18):

- **`buildMiniFretboardControls()`** - the mini-fretboard toggle's own
  change listener reaches into the fretboard-intervals and arpeggiation
  toggles' *container elements* (`fretboardIntervalsToggleContainer.style.display`,
  `arpeggiationToggleContainer.style.display`) to show/hide them, so all
  three groups build together and the split only changes *which function's
  scope* holds the container references, not the runtime wiring itself -
  event listener registration order and final DOM structure are byte-for-byte
  the same as before.
- **`buildStaveControls()`** - the mini-staves toggle checkbox has
  **three separate `change` listeners** registered on it: its own (toggles
  `progressionState.showMiniStaves`), one added by the stave-key selector
  code (toggles `staveKeyContainer.style.display`), and one added by the
  stave-theory-mode toggle code (toggles **both** `staveKeyContainer.style.display`
  *and* `staveTheoryModeContainer.style.display` - redundant with the
  second listener for the stave-key half, but that redundancy already
  existed in `progressionBuilder.js` before this move and is preserved
  exactly, not simplified, per this phase's no-behavior-changes rule).
  Building separately would mean passing the checkbox out of one function
  and back into two others for no structural benefit, so all three stay
  one function with the same three-listener registration order as before.

The other eight groups (`buildScaleContextToggle`, `buildMiniPianoToggle`,
`buildSeventhChordsToggle`, `buildPresetsDropdown`, `buildShareButton`,
`buildClearButton`, `buildProgressionSequencerToggleButton`,
`buildSynthControlsContainer`) had no cross-group references and split
one-to-one. `buildSynthControlsContainer` itself stayed one function
rather than three (rate/duration/chord-triggering) for the same reason as
`buildStaveControls`: its trailing periodic-sync code
(`setInterval`/`setTimeout` at the group's end) calls back into
`updateRateControl`/`updateDurationControl`, closures declared inside the
rate/duration halves - splitting those out would mean returning the
closures themselves across a function boundary for a container that's
visually and behaviorally one row anyway.

All ~23 `window.polySynthRef` reads/writes in this function landed inside
exactly three of the resulting groups - `buildProgressionSequencerToggleButton`
and the rate/duration halves of `buildSynthControlsContainer` - none in the
other eleven. None were touched, per ARCHITECTURE.md §5.1 (Phase 5's job).

`updateProgression`/`clearProgression` are cross-imported back from
`progressionBuilder.js` (core residual orchestration, called from the
seventh-chords toggle, the presets dropdown, and the Clear button) - both
were already exported for earlier steps' cross-imports, so this only added
a third/fourth consumer to those comments, not new exports.

Two now-dead imports fell out of `progressionBuilder.js`:
`generateShareableURL`/`copyShareableURL` (both had been imported only for
the Share button, which moved; `copyShareableURL` is imported directly
from `share.js` inside `controls.js` now) and `displaySingleChordPattern`
(imported only for the scale-context toggle's hover-refresh branch, which
also moved - `displayAllChordPatterns`/`displayScaleContext` stayed
imported since `updateProgression`/`clearProgression` in the residual
still call them directly). Both `generateShareableURL` and
`copyShareableURL` were also removed from `progressionBuilder.js`'s own
export list - grepping confirmed zero external importers of either name
via that path (only `share.js` itself and `controls.js` import them
directly now), so this wasn't just an unused import but a real narrowing
of the file's public surface, the same kind of correction Phase 1/2 made
for genuinely dead exports (§7).

`npm test` (28/28) and plain `npm run build` pass - 219 warnings,
unchanged, with zero line-number shifts (`check-build.sh` reported no diff
at all, same as step 9). Verified via the `run-app` skill with the most
thorough pass of any Phase 4 step, given the size of what moved: built a
progression, then exercised each entangled cluster specifically - toggled
"Show Mini Fretboards" and confirmed the "Show Intervals" container's
visibility flipped with it; toggled "Show Mini Staves" and confirmed both
the stave-key dropdown and theory-mode checkbox appeared, changed the key
to G and toggled theory mode on, then toggled mini staves back off and
confirmed both containers hid again (exercising all three listeners on one
checkbox, in both directions); toggled "Use Seventh Chords" and confirmed
the first chord's name changed from `I (Em)` to `I (Em7)`; selected a
preset from the dropdown and confirmed the input field and card count
updated; clicked Share and Enable Chord Triggering. Two console messages
appeared during this pass - a clipboard `NotAllowedError` from the Share
button and a `TypeError: node.className.includes is not a function` from
elsewhere in the app - both looked concerning enough to investigate before
trusting them as pre-existing: `git stash`-ed `progressionBuilder.js` back
to the pre-this-step commit (keeping the new `controls.js` file moved
aside so the stashed file would still build), re-ran the identical
Playwright script, and got byte-identical output including both messages -
confirming neither is a regression from this move, the same
verify-before-trusting-an-alarm pattern §6.16 already used once. Zero
*new* console errors from the move itself. Remaining Phase 4 work: rename
the residual to `src/progression/index.js` as the barrel;
`scaleGenerator.js`/`scales.js` -> `src/scales/` after that.

### 6.22 `src/progression/index.js` (Phase 4, eleventh step, 2026-08-02 - `progressionBuilder.js` deleted)

The last Phase 4 step for the progression split: rename what's left of
`progressionBuilder.js` (`getFretboardForProgression`, `createChordProgressionUI`,
`updateProgression`, `precomputeAllPatternData`, `clearProgression` - 265
lines) to `src/progression/index.js`, the barrel, same pattern
`src/fretboard/index.js` used at the end of Phase 3 (§6.11). Straight
`git mv`-equivalent (Write + delete, since the file also needed every
relative import path adjusted for its new location one directory deeper):
`./theory/roman` -> `../theory/roman`, `./tuning` -> `../tuning`,
`./scaleGenerator` -> `../scaleGenerator`, and all nine `./progression/*`
imports -> `./*` (same directory now).

Seven sibling modules had a cross-import of some residual function
pointed at `'../progressionBuilder'`; all seven were repointed to the bare
current-directory specifier `'.'`, which Node/webpack resolve to
`./index.js` - the same bare-specifier convention `src/fretboard/ui/{controls,chordGrid}.js`
already used for their own barrel cross-import (`from '..'`, §6.8), just
one directory level shallower here since the barrel and its siblings share
a directory instead of parent/child:

- `parse.js`, `fretboardDisplay.js` - `getFretboardForProgression`
- `scaleSync.js` - `precomputeAllPatternData`
- `share.js`, `input.js`, `controls.js` - `updateProgression`
- `controls.js` - `clearProgression` (same import statement as `updateProgression`)

The one external importer, `src/fretboard/ui/controls.js`, had its
`from '../../progressionBuilder'` repointed to `from '../../progression'`
(`createChordProgressionUI`/`loadSharedStateFromURL`) - same bare-barrel
pattern one level up.

One more dead export fell out during this step, caught the same way
step 1's `currentProgression`/`selectedPatternIndexes` were (§6.12):
`parseProgressionInput` was in `progressionBuilder.js`'s own export list
but grepping every `from '<path>/progressionBuilder'` (and, after the
rename, every `from '.'`/`from './progression'`-style import of it) across
`src/` found zero external importers - only the file's own internal call
site inside `updateProgression` remained. Dropped from the barrel's export
list rather than carried forward as another dead re-export.

`npm test` (28/28) and plain `npm run build` pass - 219 warnings,
unchanged, three line-number-only shifts (`parse.js`/`scaleSync.js`/`share.js`'s
pre-existing warnings moved 1-2 lines for this step's header-comment
edits). Verified via the `run-app` skill with the most end-to-end check of
any Phase 4 step, since this one touches every module's import
resolution at once: confirmed the Chord Progression tab and default load
both render with zero console errors (`node scripts/screenshot.js`, exit
0); then a full round trip through the barrel's real exports - typed a
progression (`createChordProgressionUI` -> `createInputSection`/
`createProgressionControlsSection`/`createProgressionDisplaySection` all
render; typing -> `updateProgression` -> 4 cards), clicked **Clear
Progression** (`clearProgression` -> 0 cards, empty input), rebuilt the
progression with "Show Mini Pianos" enabled, clicked **Share**, read the
resulting URL from the clipboard (`?p=I-1+IV-1+V-1+vi-1&r=E&s=Major-6&ui=fkn`),
then navigated to that exact URL fresh in the same browser session and
confirmed the input, all 4 cards, and the mini-piano toggle state all
restored correctly - exercising `loadSharedStateFromURL`/`applySharedState`
through `src/fretboard/ui/controls.js`'s newly-repointed external import,
not just an internal call. Zero console errors throughout. This closes out
the `progressionBuilder.js` -> `src/progression/` split entirely (11
steps, `progressionBuilder.js` deleted, 4,119 lines -> 11 files under
`src/progression/`); remaining Phase 4 work is `scaleGenerator.js`/`scales.js`
-> `src/scales/`, a separate checkpoint requiring its own
investigate-before-editing pass (unlike `progressionBuilder.js`, it hasn't
had a call-graph investigation yet).

### 6.23 `src/scales/state.js` (Phase 4 second half, first step, 2026-08-02)

An investigation pass preceded this step (not summarized here - see the
session that reported it) and found the plan's original five-file sketch
(`state.js` + three `ui/*.js` + a barrel) needed two corrections before any
code moved: `scaleGenerator.js`'s "root note table" and "scale table" UI
builders call each other (not a one-way dependency), and the real hub
function (`updateCurrentScaleDisplay`, called from nearly every cluster)
belongs in the eventual barrel, not scattered across the UI files. `scales.js`
stays under `src/scales/` rather than splitting its data half into
`src/theory/` - Rene decided the current dictionary-shaped scale data
(`HeptatonicScales` etc.) isn't worth relocating as-is; a `src/theory/`
wrapper is a later phase, once a real state-based `Scale` model replaces the
dictionaries.

Same treatment as `src/fretboard/state.js` (§6.3) and `src/progression/state.js`
(§6.12): six module-level values (`selectedScales`, `exclusiveMode`,
`primaryScaleIndex`, `selectedRootNote`, `primaryRootNoteIndex`,
`enharmonicDisplayPreferences`) are reassigned - not just mutated - from
inside `createRootNoteTable`, `createHeptatonicScaleTable`,
`createQuickScalePicker`, and `initializeNavigationButtonsDirect`, none of
which have moved yet, so they're all fields on one exported mutable object,
`scaleState`, not individual `let`s. Every bare read/write site in the
still-local half of `scaleGenerator.js` was mechanically rewritten to
`scaleState.<name>` (a `perl` word-boundary substitution per name, verified
clean afterward - no pre-existing dot-access or spread-operator false
negatives on any of the six names, unlike §6.12's `[...currentProgression]`
case). Two accidental renames landed *inside* string-literal `console.log`
label text (`'Current selectedRootNote:'` -> `'Current
scaleState.selectedRootNote:'`) since the regex doesn't distinguish a
quoted string from code; both were caught by grepping for
`'[^']*scaleState\.` after the bulk rename and reverted to their original
text, keeping only the real code-reference renames.

`var currentScaleHighlight` (used solely inside `highlightScaleNotes`, never
read elsewhere) stayed a private module-level var wherever `highlightScaleNotes`
ends up (not moved this step) rather than joining `scaleState` - nothing
outside that one function touches it. `getSelectedScales`/`clearSelectedScales`/
`addSelectedScale`/`removeSelectedScale`/`getPrimaryScaleChords`/
`getAllSelectedScaleChords` moved here verbatim but are fully dead - zero
callers anywhere in `src/`, internal or external, confirmed by grep before
moving (not just "unused export" the way Phase 4's earlier dead-export
corrections were - these have no callers at all, only their own
declarations). They weren't re-exported (matching their already-unexported
status), which is why `scripts/check-build.sh`'s diff now shows them as
`no-unused-vars` in `state.js` - they were never flagged before because
sitting inside `scaleGenerator.js`'s live `export { ... }` block masked
their dead status from ESLint. `scalePositionDarkDuplicate` is a second,
unrelated orphan `let` (zero readers) that moved the same way - a leftover
with the same name as `fretboardState.scalePositionDarkDuplicate` (the real
one, migrated to `src/fretboard/state.js` in Phase 3), not the same
variable.

`refreshChordsForRootNote` moved here too, not into the future
`rootNoteTable.js` as the investigation's first-pass categorization
suggested - reading its body showed it's pure state+cache glue (reads
`scaleState`, calls `getPrimaryRootNote`/`precomputeScaleChords`, touches no
DOM), so keeping it beside the state it reads avoids a needless cross-import
once `rootNoteTable.js` exists.

Two cross-imports back into the still-2,062-line `scaleGenerator.js` were
needed (`createHeptatonicScaleTable`, `updateCurrentScaleDisplay` - neither
has moved yet): `applyExclusiveSelection` calls both directly, and five of
the moved functions call `updateCurrentScaleDisplay`. `HeptatonicScales`/
`precomputeScaleChords`/`getChordsForScale` are imported from `../scales`
(unmoved `scales.js`) - both cross-import paths get repointed once their
targets move (`../scaleGenerator` -> `./scaleTable` or `..` for the barrel;
`../scales` -> `./scaleData`), same as `src/progression/scaleSync.js`'s
repoint in §6.16 -> §6.17.

The one constraint that reached outside `scaleGenerator.js`: `selectedRootNote`/
`selectedScales`/`exclusiveMode` were exported as bare `let` bindings before
this step and read as such by four external files. ES module named exports
are live bindings importers can't reassign - the same reason `fretboardState`
(§6.3) and `progressionState` (§6.12) exist - so a plain re-export of
`scaleState.exclusiveMode` under the old bare name isn't possible, and this
couldn't be deferred to a future barrel step the way function re-exports can
be. `index.js` (8 read sites - `selectedScales[0]`, `selectedRootNote[0]`,
6x `exclusiveMode` in keyboard-shortcut branches) and `cross.js` (3 read
sites) were updated to import `scaleState` and read `scaleState.<name>`.
`keyboard.js` and `fretboard/index.js` imported `selectedRootNote`/
`selectedScales` but never used them (confirmed by grep) - dropped from
their import lists rather than repointed.

`getPrimaryScaleChords`/`getAllSelectedScaleChords` were dropped from
`scaleGenerator.js`'s own re-export list - grepping every `from
'.../scaleGenerator'` path across `src/` found zero external importers of
either name (same check §6.12/§6.22 used for `currentProgression`/
`parseProgressionInput`), so re-exporting them forward would just have
carried a dead export into the next file. `scaleGenerator.js` itself now
imports `scaleState` and 23 functions back from `./scales/state` and
re-exports the subset external files still need under the old
`./scaleGenerator` path, unchanged, until the barrel step repoints them.

`npm test` (28/28) and `bash scripts/check-build.sh` pass - baseline moved
219 -> 207 warnings, entirely explained: 4 warnings removed (the two dropped
unused imports in `keyboard.js`/`fretboard/index.js`), 10 `no-loop-func`
warnings resolved (closures over `scaleState.<name>` - a stable imported
reference - no longer trip ESLint's "unsafe reference to a loop-scoped
variable" check the way closures over a bare mutable `let` did), 7 new
`no-unused-vars` warnings in `state.js` for the confirmed-dead functions
above (previously masked, not newly broken), the rest pure line-number
shifts. Baseline updated and committed alongside this change. Verified via
the `run-app` skill: zero console errors across all six tabs; the Scale
Information panel rendered correctly for the default E Aeolian selection;
on the Scale Selection tab, clicking a scale-family-grid cell (`Dorian`)
correctly updated the header, both dropdowns, the fretboard note colors,
and the grid's own highlight - the `applyExclusiveSelection` ->
`updateCurrentScaleDisplay`/`createHeptatonicScaleTable` cross-import chain,
exercised end-to-end; the quick-picker's `#quickRootSelect`/
`#quickScaleFamilySelect` dropdowns (`createQuickScalePicker`'s
`applySelection` closure) correctly changed `#currentRootNode`/
`#currentScaleNode` (E Aeolian -> C Aeolian -> C "Lydian #9"), a second,
independent write path into `scaleState` exercised separately from the grid
click. Remaining steps: `scaleData.js` (from `scales.js`), `infoPanel.js`,
then the mutually-dependent `rootNoteTable.js`/`scaleTable.js` pair, then
the barrel.

### 6.24 `src/scales/scaleData.js` (Phase 4 second half, step 2, 2026-08-02)

The pure half of `scales.js` - `HeptatonicScales`/`HexatonicScales`/
`PentatonicScales`/`scales` (the family-list array), the chord cache
(`precomputeScaleChords` and five helpers around it), and `getScaleNotes` -
moved as one contiguous block (lines 13-386 and 443-619 of the pre-move
file, split only by the DOM tail sitting between them) into
`src/scales/scaleData.js`. `scales.js` itself is not deleted, same
shrinking-residual treatment `scaleGenerator.js` is getting: it keeps
`highlightKeysForScales` and the `keys_chords` DOM lookup table it needs
(the one piece of the original file that touches the DOM), now 93 lines,
and imports the moved names back from `./scales/scaleData` to re-export
them under its own unchanged `export { ... }` list - none of `scales.js`'s
14 external importers needed a single import-path change this step.

`getScaleFromId` stayed unexported from `scaleData.js` - it was exported
from `scales.js` before, but grepping every `from '.../scales'` path across
`src/` found zero external importers (only `precomputeScaleChords`'s own
internal call), so this narrows the surface the same way `state.js`'s
`getPrimaryScaleChords`/`getAllSelectedScaleChords` did in §6.23. Two
dead re-exports were dropped outright rather than carried into either new
file: `generateProperScale` (imported into `scales.js`, re-exported, never
called anywhere - not even inside `scales.js` itself) and `setScaleContext`/
`getScaleContext` (used internally by `getScaleNotes`, so `scaleData.js`
still imports them from `theory/notation.js` directly, but had zero
external consumers via the `./scales` path so aren't re-exported forward).
Two more dead imports fell out of `scales.js`'s own top - `notationMidiToNote`/
`notationNoteToMidi` (aliased imports from `theory/notation.js`, never
referenced anywhere in the file, confirmed by grep before dropping).

`translateNotes`/`stripOctave` were a different case: real re-exports with
real external consumers via the `./scales` path (unlike the three above),
but the consumers turned out to already import the *same* `theory/notation.js`
functions a second time under aliased names for unrelated reasons.
`fretboard/index.js` imported `translateNotes, stripOctave` bare from
`../scales` *and* `translateNotes as notationTranslateNotes, stripOctave as
notationStripOctave` from `../theory/notation` in the same file - both
pairs resolve to the identical underlying functions, since `scales.js` was
just forwarding them unchanged. Rather than choosing between `scaleData.js`
and the `scales.js` residual as an arbitrary new home for a pass-through
that isn't really "scale data," both bare names were merged into the
existing `../theory/notation` import (now importing `translateNotes`/
`stripOctave` under both their bare and aliased names from one statement),
eliminating the redirect entirely. `scaleGenerator.js` imported the same
two names from `./scales` too, but never actually called them anywhere in
its body (a pre-existing dead import, unrelated to this phase) - dropped
outright rather than repointed.

`npm test` (28/28) and `bash scripts/check-build.sh` pass - baseline moved
207 -> 203 warnings, all explained: 4 warnings removed (the dead
`translateNotes`/`stripOctave` import in `scaleGenerator.js`, the dead
`notationMidiToNote`/`notationNoteToMidi` imports in `scales.js`), 2
line-number-only shifts in `fretboard/index.js` (its notation import block
grew by two names), zero new warnings in `scaleData.js` itself. Baseline
updated. Verified via `run-app`: zero console errors across all six tabs;
Scale Information's chord panel and Chord Progression's resolved chords
(`I (Em)` -> `vi (CM)` against E Aeolian, correct notes and mini-fretboard
patterns) both came back pixel/data-identical to the pre-step baseline,
confirming `getScaleNotes` and the chord cache still drive both features
correctly from their new module. Remaining steps: `infoPanel.js`, then the
mutually-dependent `rootNoteTable.js`/`scaleTable.js` pair, then the
barrel.

### 6.25 `src/scales/ui/infoPanel.js` (Phase 4 second half, step 3, 2026-08-02)

The "Scale Information" tab's panel builder - `updateScaleInfoPanel`,
`buildDegreeChords`, `buildChordSection`, `makeChordCardDivider`,
`bumpOctave` - moved as one contiguous block (`scaleGenerator.js`'s
original lines 947-1247, sitting right between the root-note-table and
scale-table clusters). None of the five have any caller outside this block
except `updateScaleInfoPanel` itself, called once from
`updateCurrentScaleDisplay` - confirmed by grep before moving, same check
every prior step used - so it's the module's sole export.

`intToRoman` (chord-card heading numerals) stayed behind in
`scaleGenerator.js` rather than moving with its caller here - it has three
call sites total and only one is in this block; the other two are in
`createQuickScalePicker`/`createHeptatonicScaleTable`, which haven't moved
yet. Moving it now would mean moving it again once the scale-table cluster
does, so `infoPanel.js` cross-imports it back instead - the same
one-function-stays-behind-for-its-real-cluster call `playback.js` made for
`getFretboardForProgression` in §6.15. This creates a two-way import
between `scaleGenerator.js` and `infoPanel.js` (`infoPanel.js` imports
`intToRoman`, `scaleGenerator.js` imports `updateScaleInfoPanel`) - safe for
the same reason every other cross-import in this refactor is: neither side
reads the other's binding at module top level, only inside function bodies
invoked well after both modules have finished loading.

Three now-unused imports fell out of `scaleGenerator.js`, caught by
`scripts/check-build.sh`'s diff as new `no-unused-vars` hits before they
were removed, same as every prior step: `matchChord` (its only call site
was inside `buildDegreeChords`, which moved - `identifySyntheticChords`
from the same `theory/chords.js` import stayed, still used by
`createHeptatonicScaleTable`), the entire `import { chords } from
'./chords'` (nothing else in `scaleGenerator.js` ever read it), and three
of the five names from the `MiniPiano.js` import
(`createIntervalPiano`/`getIntervalInfo`/`getSynthBaseOctave`/
`DEFAULT_BASE_OCTAVE` all moved with the block; `createScalePiano` stayed,
since `createRootNoteTable`/`createHeptatonicScaleTable` still call it
directly at three other sites).

`npm test` (28/28) and `bash scripts/check-build.sh` pass - baseline
unchanged at 203 warnings, both diffed lines pure line-number shifts (the
`MiniPiano.js` import's unused-name warnings moved up one line;
`createHeptatonicScaleTable`'s pre-existing `eqeqeq` warning moved up 318
lines, matching how much shorter `scaleGenerator.js` got). Verified via
`run-app`: zero console errors across the touched tabs; the Scale
Information panel rendered pixel-identical to the pre-step screenshot for
E Aeolian, including every roman-numeral chord-card heading (`I` through
`VII`), confirming the `intToRoman` cross-import resolves correctly at
render time. Remaining steps: the mutually-dependent
`rootNoteTable.js`/`scaleTable.js` pair, then the barrel.

### 6.26 `src/scales/ui/rootNoteTable.js` + `src/scales/ui/scaleTable.js` (Phase 4 second half, step 4, 2026-08-03)

The last and largest pair of clusters, landed together in one commit since
they're genuinely interdependent - confirmed by the investigation before
touching any code, not assumed from the plan's sketch: `createRootNoteTable`
calls `createHeptatonicScaleTable` three times (root-note changes rebuild
the scale table so its highlighting stays current) and
`createHeptatonicScaleTable` calls `createRootNoteTable` once (it embeds a
fresh root-note table inside its own browsing UI). Splitting them into
separate commits would have left one half unable to build in isolation, the
same reasoning that kept `chordCard.js`'s internal cluster and
`controls.js`'s mini-fretboard/mini-staves groups together as one function
each in the progression split (§6.18/§6.21).

`rootNoteTable.js` holds `positionTooltipSmart` (moved here rather than
`scaleTable.js` - four of its six call sites are in `createRootNoteTable`,
two in `createHeptatonicScaleTable`) and `createRootNoteTable` itself.
`scaleTable.js` holds `intToRoman` (moved here rather than staying behind in
`scaleGenerator.js` as §6.25 anticipated - once `createQuickScalePicker`/
`createHeptatonicScaleTable` moved, `infoPanel.js`'s cross-import of it was
repointed from `../../scaleGenerator` to the same-directory `./scaleTable`,
avoiding a needless bounce through the barrel-to-be), `createQuickScalePicker`,
and `createHeptatonicScaleTable`. Both files cross-import from the other
(`rootNoteTable.js` imports `createHeptatonicScaleTable` from `./scaleTable`;
`scaleTable.js` imports `createRootNoteTable`/`positionTooltipSmart` from
`./rootNoteTable`) - safe for the same reason every cross-import in this
refactor is: neither file has any top-level executable code (confirmed by
grep before writing either file), only function/import/export declarations,
so nothing reads the other's binding before both modules finish loading.

Both files also cross-import `updateCurrentScaleDisplay` from
`../../scaleGenerator` (not yet moved - it's slated for the eventual
barrel) and `HeptatonicScales`/`getScaleNotes` from `../scaleData`, but
**not** `highlightKeysForScales` from there - that one is still on
`scales.js` itself (the DOM-touching residual §6.24 left behind), so both
files import it from `../../scales` instead. A first build caught this
exact mistake (`Attempted import error: 'highlightKeysForScales' is not
exported from '../scaleData'`) before it reached `npm test`, fixed by
splitting the two imports.

`state.js`'s existing cross-import of `createHeptatonicScaleTable`
(pointed at `../scaleGenerator` since §6.23, before this cluster had moved)
was repointed to `./ui/scaleTable`, the same repoint pattern
`scaleSync.js` → `fretboardDisplay.js` used in §6.16 → §6.17.
`scaleGenerator.js` itself now imports `createHeptatonicScaleTable`/
`createQuickScalePicker` back from `./scales/ui/scaleTable` purely to keep
re-exporting them under its own `export { ... }` list - neither is called
from anywhere still inside `scaleGenerator.js`, only from external files
still importing the old path (`index.js`, `keyboard.js`, `cross.js`,
`fretboard/index.js`).

Two rounds of now-dead imports fell out of `scaleGenerator.js`, both caught
by `scripts/check-build.sh`'s diff before being removed rather than left as
new warnings: `identifySyntheticChords` (its only real call sites were
commented-out code, not live) and `createScalePiano` (used only by the
three functions that moved), then a second round -
`getChromaticPosition`/`getPreferredDisplay`/`setEnharmonicPreference`/
`sortRootNotesAndUpdateIndex`/`toggleSelectionMode` - a leftover of §6.23's
original `state.js` import list that had no remaining callers once this
step's functions (their only users) moved out.

`npm test` (28/28) and `bash scripts/check-build.sh` pass - baseline moved
203 -> 202 (one net warning removed, the dead `scales` import from
`scaleGenerator.js`'s `./scales` import line, itself unrelated dead weight
this step's editing surfaced - `HeptatonicScales`/`highlightKeysForScales`/
`getScaleNotes` from the same import stayed, still used by
`updateCurrentScaleDisplay`); every other diffed line is a pure line-number
shift or a warning moving with its code (`scaleTable.js` picked up the
`eqeqeq` warning that used to live in `createHeptatonicScaleTable`'s old
position in `scaleGenerator.js`). Verified via `run-app`: zero console
errors across all six tabs, pixel-identical Scale Selection tab rendering
against the pre-step baseline; then exercised both cross-import directions
directly - clicking the `Dorian` cell in the heptatonic table (E Aeolian ->
E Dorian, `applyExclusiveSelection` -> `updateCurrentScaleDisplay` +
`createHeptatonicScaleTable`'s self-rebuild) and selecting a new root via
the quick-picker (`G`, `createQuickScalePicker`'s `applySelection` calling
`createHeptatonicScaleTable` across the file boundary) - both updated the
header, dropdowns, fretboard note colors, and the grid's own highlight
correctly, zero console errors.

This closes out the `scaleGenerator.js`/`scales.js` -> `src/scales/` split's
function-extraction work. Remaining: rename the `scaleGenerator.js`
residual to `src/scales/index.js` as the barrel, folding in `scales.js`'s
remaining DOM tail and repointing every external importer of both old
paths.

### 6.27 `src/scales/index.js` (Phase 4 second half, fifth and final step, 2026-08-03 - `scaleGenerator.js`/`scales.js` deleted)

The last step for this phase-half, and the only two-file barrel merge in
either phase: unlike `frets.js` → `src/fretboard/index.js` or
`progressionBuilder.js` → `src/progression/index.js` (one shrinking
residual becoming one barrel), this step merges **two** residuals -
`scaleGenerator.js`'s (`highlightScaleNotes`, `updateCurrentScaleDisplay`,
the placeholder-clearing side effect, `initializeNavigationButtons`/
`initializeNavigationButtonsDirect`, the module-load self-invocation) and
`scales.js`'s (`getElementByNote`/`getElementByMIDI`/`keys_chords`/
`highlightKeysForScales`) - into one `src/scales/index.js`. Both source
files are deleted in the same commit.

The two files' content is concatenated in their original relative
evaluation order: `scales.js`'s content first, `scaleGenerator.js`'s
second, matching the order ES modules already evaluated them in before
this move (`scaleGenerator.js` `import`ed from `./scales`, so `scales.js`'s
top-level code - including `keys_chords`'s object literal, which calls
`document.querySelector` once per entry at import time - always ran
first). Concatenating them in a different order would have been a
behavior change disguised as a file move.

`highlightKeysForScales` (from `scales.js`, keyed through its own
`keys_chords` lookup table) and `highlightScaleNotes` (from
`scaleGenerator.js`, keyed through `midi.js`'s `keys`) are two different,
unrelated functions that happen to have similar names and do similar jobs
- both calls appear back-to-back in `updateCurrentScaleDisplay`
(`highlightKeysForScales(scaleNotes); highlightScaleNotes(scaleNotes);`).
They stayed exactly as separate as they always were; this step did not
investigate whether they could be merged, since that would be a real
behavior-neutral refactor of pre-existing duplication, out of scope for a
phase whose job is moving code, not fixing it (same call Phase 2 made for
several other same-named-but-different pairs - see §6.2).

Four confirmed-dead imports from `./midi` were dropped when writing the
barrel's own import block rather than carried forward: `noteToName`,
`getElementByNote`, `getElementByMIDI`, `initializeMouseInput` - all four
were already unused throughout the old `scaleGenerator.js` (pre-existing
dead weight, not something this phase's earlier steps had touched since
none of them happened to edit that particular import line). Dropping them
here was safe from a naming-collision angle too: `scales.js`'s own local
`getElementByNote`/`getElementByMIDI` (different implementations, used by
`keys_chords`) now live in the same file, and would have collided with
`midi.js`'s same-named exports had they been imported.

Every external file that used to split its imports between `from
'./scaleGenerator'` (or a relative variant) and `from './scales'` had both
statements merged into one, pointed at the `./scales` path (unchanged
text - once `scales.js` is deleted and `src/scales/index.js` exists, that
bare specifier resolves to the barrel automatically; only files that
imported **exclusively** from the `scaleGenerator.js` path needed their
import *path* text changed, to the equivalent `scales` depth). Fourteen
files were touched this way: `chords.js`, `cross.js`, `index.js`,
`keyboard.js`, `fretboard/Fretboard.js`, `fretboard/index.js`,
`fretboard/ui/chordGrid.js`, `fretboard/ui/controls.js`,
`fretboard/ui/scalePositionGrid.js`, `progression/chordCard.js`,
`progression/index.js`, `progression/scaleSync.js`, `progression/share.js`,
`theory/roman.js`. Two files (`theory/chords.js`, `scales.test.js`)
needed no change at all - they already imported only from the `scales`
path with nothing to merge. The three internal cross-imports from
`src/scales/state.js`/`ui/rootNoteTable.js`/`ui/scaleTable.js` that had
been pointing at `../scaleGenerator` (a real file, before this step) were
repointed to the bare-specifier barrel convention Phase 3/4 already
established - `from '.'` for `state.js` (sibling of the barrel),
`from '..'` for the two `ui/*.js` files (one directory below it), same
shape as `src/fretboard/ui/{controls,chordGrid}.js` → `src/fretboard/index.js`
(§6.8) and `src/progression/*.js` → `src/progression/index.js` (§6.22).

A handful of comments describing *current* relationships (not historical
"lifted from" provenance, which stayed untouched) were updated where
they'd otherwise mislead: `progression/scaleSync.js`'s header ("owned by
scaleGenerator.js" → "owned by src/scales/"), `theory/roman.js`'s header
(the `../scaleGenerator` path in its own explanatory comment),
`progressionBuilder.test.js`'s comment above the `resolveRomanChord`
describe block, and `scales.test.js`'s header (the stale "relocates this
into src/theory/scales.js" note from before Phase 2's own correction,
doubly stale now).

`npm test` (28/28) and `bash scripts/check-build.sh` pass - baseline moved
202 -> 198 warnings, all four removed warnings accounted for by the
confirmed-dead `./midi` imports above (verified by diffing warning
*messages* with line numbers stripped, not just line-by-line, given how
many files shifted by exactly one line from the import merges - every
other diffed line matched content-for-content, just relocated). Verified
via the `run-app` skill with the widest check of this entire phase-half,
since this step touches every external importer's module resolution at
once: zero console errors across all six tabs, pixel-identical default
load against the Phase-4-step-1 baseline screenshot; then a full round
trip through the barrel's real exports and several of its external
consumers' repointed imports - typed a progression, toggled "Show Mini
Pianos", clicked Share, reloaded fresh from the resulting URL
(`?p=I-1+IV-1+V-1+vi-1&r=E&s=Major-6&ui=fkn`) and confirmed the input, all
four chord cards (with correct notes/mini-pianos/mini-fretboards), and the
toggle state all restored correctly - exercising `src/scales/`'s exports
through `src/progression/share.js`'s repointed import, not just a direct
call. Zero console errors throughout.

This closes out the `scaleGenerator.js`/`scales.js` -> `src/scales/` split
entirely: 5 steps, `scaleGenerator.js` (2,515 lines) + `scales.js` (638
lines) -> 6 files under `src/scales/`, both original files deleted. This
also closes out Phase 4 as a whole - both halves
(`progressionBuilder.js` -> `src/progression/` and
`scaleGenerator.js`/`scales.js` -> `src/scales/`) are now complete.

---

### 6.28 `src/chords.js` -> `src/theory/chordSuffixes.js` (Phase 4c, 2026-08-03 - `src/chords.js` deleted)

**Planned as a split, landed as a deletion.** `REFACTOR_PLAN.md` §1.2, as
it read before this phase, described 874 lines of "chord data + DOM table builders + fretboard glue
fused together" and prescribed the Phase 3/4 treatment: investigate call
sites, then one commit per extracted module. The investigation is what
changed the shape of the phase - ~750 of those lines had no reachable
caller, so there was nothing to extract. Two of the file's twelve exports
were live. This is §7's pattern, not §6's, and it is the second time the
"investigate first" rule (`REFACTOR_PLAN.md` §2.3 rule 1) turned a planned
split into something else.

What was live, and now lives in `src/theory/chordSuffixes.js`:

| Export | Consumers |
|---|---|
| `chords` (six suffix arrays + the category dict) | `theory/chords.js`'s `identifySyntheticChords`; `scales/ui/infoPanel.js` - both pass it to `matchChord` as the candidate set |

What was deleted, verified against bare identifiers, `window.*` property
access and dynamic imports across `src/` **and** `public/`:

- `getProcessedChords`/`initializeProcessedChords`/`processedChords` - no
  callers at all.
- `createChordRootNoteTable` + `createChordSuffixTable`, and the
  `selectedChordRootNote`/`selectedChordSuffixes` state they toggled - only
  ever called *each other*. Both appended to a module-scope
  `document.getElementById('chordPlaceholderContent')`, an id present in
  neither `src/` nor `public/`, so either would have thrown on its first
  `appendChild` had anything reached it.
- `createChordButtonGrid`, `commonChordTypes`, `chordPatternMatchers` and
  local `showChordPatternOnFretboard`/`restoreFretboardState` - **superseded
  by `src/fretboard/ui/chordGrid.js`** (§6.9), which Phase 3 lifted out of
  `frets.js` and which `ui/controls.js` is what actually builds the grid.
  The `chords.js` copy was the stale twin: its `commonChordTypes` still
  ended in `'7mb5'` where the live one has `'m7b5'`, and its matchers
  returned placeholder strings (`` `${rootNote} Major Pattern 1` ``). A
  second Phase 1b lesson restated: a file having a live importer says
  nothing about whether any *given* export in it is reachable.
- `highlightKeysForChords` + `keys_chords` + `getElementByNote`/
  `getElementByMIDI`, and its one call site in the `catch` block of
  `src/fretboard/index.js`'s `showChordPatternOnFretboard`. Not merely
  unused - **provably a no-op**: `keys_chords` is built at import time from
  `document.querySelector('[midi="60_chord"]')` and 24 siblings, and
  nothing in `src/` or `public/index.html` ever produces a `midi="N_chord"`
  or `note="X_chord"` attribute (no static markup, no `setAttribute`, no
  template literal), so all 25 `element` fields are `null` and both of its
  loops fall through. Deleted per `REFACTOR_PLAN.md` §1.1's rule for dead
  globals - delete, don't migrate.

**Pre-existing, out of scope, still true:** `highlightKeysForScales` in
`src/scales/index.js` (§6.27) has exactly the same defect against
`[midi="N_scale"]`, and `src/midi.js`'s `keys` table against bare
`[midi="N"]`. There are **no `midi=` attributes anywhere in
`public/index.html`** - the whole `[midi=...]` piano-key DOM contract is
unfulfilled app-wide. Phase 4c deleted only the `_chord` third of it,
because that was the third inside the file it was chartered to touch.
Anyone wiring up a real piano keyboard should start here.

**Why this breaks the §6.1 cycle.** The `theory/chords.js` &lt;-&gt;
`chords.js` circular import existed only because `chords.js` imported
`processChord` back out of the engine for its DOM tooltips - all of it in
the deleted set. `chordSuffixes.js` has no imports at all, so nothing
points back, and importing the chord engine no longer runs a module-scope
`document.getElementById`. §6.1's "a future phase that gives `chords.js` a
real module boundary removes this" is now discharged.

**One header claim was corrected rather than carried over.** A first draft
of `chordSuffixes.js` said the group order was load-bearing. It is not:
`matchChord` dispatches on group *name* against the input's note count
(`theory/chords.js:604-605`), so a 3-note input is only ever matched
against `'triads'` and a 4-note one only against `'sevenths'`, leaving
`'common'`/`'nines'`/`'elevens'`/`'thirteens'` reachable only for
collections of some other size. Renaming a group, or moving a suffix
between groups, changes which names a chord can report; reordering them
does not.

**Verified** with 28/28 tests, warnings 43 -> 34 (nine of them
`no-loop-func`, which `REFACTOR_PLAN.md`'s lint-leftovers list had
counted as needing real
closure restructuring - they were all inside the dead tooltip builders),
then in the browser: the Scale Information panel still names every degree's
triad and seventh through `matchChord` (`Em`/`F#o`/`GM7`/`F#ø`/`D7`), and
12 hover+click interactions across the live Chord Pattern Grid's 156 cells
produced zero page or console errors - that grid's hover handler being
where the deleted `highlightKeysForChords` call sat.

### 6.29 `src/piano/` (`PIANO_VIEW_PLAN.md` steps 1-4, 6 and 7, 2026-08-03)

The first module here that is **not** a refactor product: new code for the
piano view, not a relocation. Two files so far, both pure, neither reachable
from the app yet — `PIANO_VIEW_PLAN.md`'s step 2 is what first renders them.

```
src/piano/keyModel.js   which keys exist in a MIDI range, in order, and
                         which are black. No imports at all. Also
                         countWhiteKeys (what --num-keys is set from) and
                         octaveSpanToMidiRange (step 7's control).
src/piano/range.js      the active instrument's playable range in piano
                         terms: { lowMidi, highMidi, openStrings }, from a
                         tuning array + a practical fret limit.
```

**Standard MIDI (60 = C4) is the convention inside this folder**, and it is
forced rather than chosen: a key descriptor's `midi` is used directly as an
index into `src/midi.js`'s `keys` table and as the `midi="N"` attribute
`src/index.css`'s dormant key styling selects on, and both of those are
standard. `src/theory/notation.js` agrees. The two modules that do **not**
are `src/theory/notes.js` (documented in its own header since Phase 2) and
`src/tuning.js`'s private `noteOctaveToSemitones` (`:41`), both of which
place C4 at 48.

That second one is a live trap, not a curiosity: `getNoteAtStringFret`
returns `{letter, octave, name}` with no MIDI number, so anything converting
a fretted note to a piano key must go through `notation.js`'s `noteToMidi`
with **slash-form** input (`'E/2'`; `noteToMidi('E2')` parses as E4, because
`basicNoteToMidi` only reads an octave after a `/`). `range.js` does. Reusing
`tuning.js`'s semitone math instead would shift the whole instrument-range
overlay down an octave with nothing to catch it. A `TODO` at `tuning.js:41`
records the real fix — collapse that function onto standard MIDI and let
`getNoteAtStringFret` return a `midi` field — which would delete the
conversion rather than document it; it is deliberately not done inside a
feature step.

**Verified** with 25 new tests in `src/piano.test.js` (53 total, up from 28)
and `check-build.sh` at 34 warnings, unchanged. Note that the build is *not*
evidence here: nothing imports `src/piano/` yet, so webpack never compiled
it — §2.3 lesson 11 in reverse. The tests are the only thing exercising this
code until step 2.

**Step 2 (2026-08-03) added `Piano.js` and `index.js`**, and with them the
first markup the dormant piano CSS has ever had to attach to:

```
src/piano/Piano.js      builds <ul id="keyboard"><li class="white|black"
                         midi="N">, sets --num-keys, shows/hides. The only
                         DOM-touching file in the folder.
src/piano/index.js      the barrel: createPiano/getPiano plus the pure
                         helpers.
```

**Three names in that markup are contracts, not choices.** `[midi="N"]` is
what `src/midi.js`'s `getElementByMIDI` queries, so it is how `keys`,
`keys_chords` and `initializeMouseInput` find a key; `white`/`black` are what
`src/index.css` styles; `#keyboard` is the container those rules hang off.
Rendering this markup is the whole of why steps 3-4 are wiring rather than
new code (`PIANO_VIEW_PLAN.md` §1.1).

**Where it mounts.** `initializeFretboard()` (`src/fretboard/index.js`)
inserts it into `#fretNotPlaceholder` directly after `mainFretboard.fretboardElement`,
so the piano occupies the fretboard's own slot with the top bar and all six
tabs untouched. It is built **once, hidden**, and from here on only ever
shown or hidden — never rebuilt. That is not stylistic: this container also
hosts the Synthesizer tab's React portal target, and re-running
`initializeFretboard()` used to pull it out from under a mounted React tree
(`src/index.js:230-236`). `Piano.js` keeps the single instance in a
module-level `activePiano` reachable via `getPiano()`, rather than adding a
`window.*` global that Phase 5 would then have to remove.

**The CSS restructuring (`PIANO_VIEW_PLAN.md` §5.2/§5.3) happened here**,
while the block was still dead and editing it was free. State stays in the
classes (`.scaleKey`/`.highlightedKey`/`.pressedKey`); hue moved into
`--scale-key-color`/`--highlight-key-color`, defaulted on `#keyboard li` and
overridable per `<li>`, so step 4's semitone palette has somewhere to write.
`--pressed-key-color` is deliberately *not* variable. Two colour variables
rather than the one the plan sketched, because the striped
scale-plus-chord rules need two hues at once. Two latent layout bugs in the
same block were fixed at the same time: black keys had a fixed `-0.75rem`
margin against percentage widths (now proportional, and the unused `.offset`
nudge that existed to paper over it is deleted), and `float: left` was inert
inside the `display: flex` parent (now `flex: none`).

**Verified** with 53/53 tests, `check-build.sh` at 34 warnings unchanged, and
in Chromium: the default view is pixel-unchanged with the piano hidden and
zero console errors, and with the keyboard revealed all 15 black keys measure
0.00px off their white-key boundary at 1600px while the 21 white keys span
1599.94 of 1600px. Every highlight state and striped combination renders, and
a per-`<li>` hue override works.

**Step 3 (2026-08-03) made the dormant input machinery live.** No new input
code was written; what changed is that the tables it reads now resolve.

`src/midi.js`'s `keys` was a module-scope object literal whose 88 entries each
called `getElementByMIDI(...)` **at import time**, long before anything
rendered a keyboard — so every `element` was permanently `null` and every
reader silently no-opped. Those initializers are now `null` and
`refreshKeyElements()` re-resolves them against the live DOM.

**The ordering problem is solved from both ends rather than by sequencing.**
Two independent things must happen before a key can be clicked: the piano
must render, and the synth channel must exist (`src/index.js` polls for it).
Neither can wait on the other. So `initializeMouseInput(play, stop)` now
*stores* its callbacks and binds what exists, and `refreshKeyElements()` binds
whatever it just found — whichever runs second completes the wiring. Binding
is idempotent (a `WeakSet` of bound elements, and the document-level `mouseup`
registered once), which is also what makes step 7's re-render safe. Its
`pressedNotes`/`isMouseDown`/`currentMouseNote` moved from per-call closure to
module scope for the same reason: a glide from a key bound in one pass to a
key bound in another would otherwise leak a held note. Measured in the
browser: the log went from `0 piano keys` to `36 piano keys`.

`src/keyboard.js` gained `keyboardState.currentPressed`, the held-note set
that was a private `var` in `src/index.js`. It moved because a render that
happens mid-press builds `<li>`s that never saw the `keydown`;
`syncPianoKeyState` (`src/fretboard/index.js`) reapplies `pressedKey` from it
after every render. That function is `createPiano`'s `onRender` hook, and it
is the reason `src/piano/` imports neither `midi.js` nor `keyboard.js` — the
mount site owns the wiring to DOM-keyed tables elsewhere.

**`src/scales/index.js`'s `keys_chords` was deliberately NOT repopulated**,
against what `PIANO_VIEW_PLAN.md` §6 originally said. That file has its own
`getElementByMIDI` querying **`[midi="N_scale"]`**, an attribute namespace no
markup in `src/` or `public/` has ever carried. It is the surviving sibling of
the `midi="N_chord"` namespace §6.28 deleted: three keyboards were designed
(plain, `_scale`, `_chord` — `theory/intervals.js`'s "the scale piano, every
chord piano, and the fretboard"), and only the plain one is built. So
`highlightKeysForScales` is dead for a reason no table refresh can fix, while
its similarly-named neighbour `highlightScaleNotes` uses the *real* namespace
and is dead for an unrelated second reason: its range gate reads
`#lowestNoteSelection`/`#highestNoteSelection`, neither of which exists, so
every comparison is against `NaN`. `PIANO_VIEW_PLAN.md` §1.3 has the full
correction; step 4 decides between reviving the latter and retiring both.
Null guards were added to `highlightScaleNotes` because step 3 is what makes
its `keys[midi].element` dereferences reachable at all.

**Two pre-existing stuck-highlight bugs surfaced and were fixed** in
`initializeMouseInput`: `pressedKey` was added unconditionally but removed
only inside a branch gated on the note having actually sounded, so gliding off
a key with the synth disabled, or releasing the mouse away from the key it
started on, left it lit forever. Neither had ever been reachable. Both sites
now call a shared `clearPressedHighlight(note)` that clears exactly one key —
never all of them, since `src/index.js` uses the same class for
computer-keyboard notes.

**Verified** with 53/53 tests, `check-build.sh` at 34 warnings (baseline
refreshed: the same four `no-loop-func` messages, shifted uniformly by +18
lines — §2.3 lesson 7), and an 8-check Playwright interaction script (lesson
10: none of this is visible in a static screenshot) covering mousedown, glide
between keys, mouseup, release-outside, and computer-key down/up, asserting on
`[midi="N"]` rather than text (lesson 9). Zero console errors on load and on
the Synthesizer tab, which is the first thing to check after touching
`#fretNotPlaceholder`.

**Step 6 (2026-08-03) added the view toggle**, taken ahead of steps 4-5 at the
user's request so the piano could actually be used. `src/piano/state.js`
landed with it: `pianoState` (view mode, displayed octave range) plus
localStorage persistence, one mutable object for the §6.3 reason.

`setMainViewMode(mode)` lives in `src/fretboard/index.js`, not in
`src/piano/`, because it is the only place that knows about both elements —
`src/piano/` still has no knowledge of the fretboard. It sets `display` on
`.fretboard` and `#keyboard`, persists, and dispatches a
`'mainViewModeChanged'` CustomEvent. The top bar's segmented
`View: [Fretboard | Piano]` control (`ui/controls.js`'s `createViewModeToggle`)
repaints from that event rather than from inside its own click handler, so it
stays correct regardless of who changed the mode — the same pub/sub shape §7
insisted on for `'scaleChanged'`, and again with no new `window.*` global.

**The swap is `display` and nothing else.** Both elements are built once at
init and neither is ever destroyed, which is what keeps the Synthesizer tab's
React portal target safe; the verification clicks into that tab after a swap
specifically to prove it. This is the same reasoning that makes the six tabs
toggle by `display` rather than unmounting.

`public/index.html`'s two mobile `@media` blocks gained `#keyboard` rules
mirroring `.fretboard`'s `order: 3` slot, so the piano lands in the same place
in the mobile stack. `reorganizeForMobile`'s `.fretboard` polling needed no
change at all: the element is hidden, never removed, so the query keeps
resolving — `PIANO_VIEW_PLAN.md` §9 predicted the opposite and is corrected
there.

**Verified** with 53/53 tests, 34 warnings unchanged, and a 9-check Playwright
script: default view, both switch directions, active-button state, the piano
still playable while shown, the Synthesizer tab intact after a swap, and the
choice surviving a reload. Zero console errors.

**Step 4 (2026-08-03) put the scale on the keys.** `src/piano/labels.js` is
the new pure module: spelled scale notes + root + label mode → a map of pitch
class to `{semitone, color, label}`, which `Piano.js`'s `showScale` applies as
`scaleKey` plus a per-`<li>` `--scale-key-color` and the key's text.

**Colour is by semitone from the root, via `theory/intervals.js`'s palette.**
This is the first instrument in the app to satisfy the claim that file's
header makes; the main fretboard remains the exception this document's header
records, until step 5. A ♭3 and a natural 3 are different colours here and
the same colour there — that inconsistency is now visible on one screen, and
is exactly what step 5 exists to remove.

Three details worth knowing:

- **Matching is by pitch class, through `noteToMidi`**, so a scale lights in
  every rendered octave and enharmonics collapse by construction (`Gb` and
  `F#` both → 6, and `Cb`/`B#` cross the octave boundary correctly). Nothing
  compares note-name strings.
- **Spelling is taken from the `scaleNotes` array verbatim**, never from
  `midiToNote`. That deliberately avoids `theory/notation.js`'s
  `currentScaleContext`, a module-level singleton set as a side effect of
  `getScaleNotes` — the piano never reads it, so it can never read it stale.
- **`labelMode` is `fretboardState.mainFretboardLabelMode`**, the existing
  `Labels` select, not a second control. `'finger'` is guitar-only and falls
  back to note names rather than blanking the key.

Labels render horizontally at the bottom-centre of each key, deliberately
matching `MiniPiano.js`'s SVG text placement (`text-anchor: middle`,
`y = height - 8`) and its bold-root cue, so the big piano and the mini pianos
read the same. The dormant CSS's `writing-mode: vertical-rl` was dropped once
it was on screen: a rotated flat sign (♭) does not read as a flat.

`refreshPianoScale()` lives in `src/fretboard/index.js` for the same reason
`syncPianoKeyState` does: it is the file that already knows `src/scales/` and
`fretboardState`, and keeping those reads on this side is what lets
`labels.js` stay a pure function of its arguments. It has its own
`'scaleChanged'` listener, separate from the fretboard's — that one debounces
and drops events whose root+scale matches the last, which is right for its
expensive re-render and wrong for a piano that may have been hidden at the
time. A CustomEvent listener rather than an entry in
`window.updateFretboardsForScaleChange`, so the piano still costs Phase 5
nothing.

**`highlightScaleNotes` was deleted here** — the §1.3 decision falling due.
Once step 3 made `keys[midi].element` resolve, it stopped being harmlessly
dead and became a second writer to `scaleKey` on the piano's own elements. Its
one call site went with it, and `keys` plus the `jquery` import in
`src/scales/index.js` went dead and were removed (§2.3 lesson 6).
`highlightKeysForScales` survives: it queries the `midi="N_scale"` namespace
and so cannot contend with anything, and its ten call sites make retiring it a
dead-code cleanup on its own schedule.

**Verified** with 65/65 tests (12 new, all on `labels.js` — including that a
♭3 and a natural 3 come out different colours) and a 14-check Playwright
script: 7 pitch classes lit per octave across all three, root colour and
label, m3 colour, consistent colour across octaves, sharp spelling preserved,
out-of-scale keys unlabelled, all three label modes, and a root change
repainting. 34 warnings unchanged, zero console errors.

**Step 7 (2026-08-03) made the displayed range adjustable**, and with it the
piano's only routine re-render. `setPianoOctaveSpan(lowOctave, octaveCount)`
writes `pianoState`, persists, and rebuilds; the control (start octave, span,
and a read-back of the range actually shown) sits in the **Other Controls
tab** rather than the top bar, at the user's request — the top bar is already
carrying four things and this is a set-once setting.

Two behaviours worth knowing:

- **A span that would run past C8 slides its start down** instead of being
  truncated, so "7 octaves" from C2 renders as C1–B7 and the select stays
  truthful. `keyModel.js`'s clamp still has the last word at the bottom.
- **Key label size is derived from `--num-keys` in CSS**
  (`clamp(7px, calc(100vw / var(--num-keys) / 5), 13px)`, with a smaller ramp
  for half-width black keys), so labels shrink with the key count and are
  right on the first paint without measuring anything.
- **`Full 88 keys` is a separate `pianoState.rangeMode`, not an eighth octave
  count.** A full keyboard is A0-C8, which is not a whole number of C-to-B
  octaves; as a count it would clip the bottom or overshoot the top. At 52
  white keys the labels bottom out, accepted deliberately - the keys stay
  pressable and the board still reads as an input display.

**The re-render path is now exercised, and everything hanging off a key
element survives it**: the scale layer repaints from `piano.scale`, and
`onRender` → `syncPianoKeyState` re-resolves `src/midi.js`'s `keys`, rebinds
mouse input to the new elements, and reapplies notes held on the computer
keyboard. That last one is the payoff for moving `currentPressed` into
`keyboardState` in step 3 — step 3 built the path but had no way to trigger
it. Verified directly: hold a key, change the octave count, and the held key
is still lit on an element that never saw the `keydown`.

**Verified** with 65/65 tests, 34 warnings unchanged, and a 15-check
Playwright script covering the default range, 7 octaves, 1 octave, clamping
at the bottom, `--num-keys` tracking the white count, scale survival across a
rebuild, mouse rebinding, the held-key case above, and persistence across a
reload. Zero console errors.

### 6.30 The fretboard's scale palette (`PIANO_VIEW_PLAN.md` step 5, 2026-08-03)

The one step of the piano feature that changed **existing** behavior, kept in
its own commit for that reason.

`Fretboard.js`'s `markScale` colored scale notes by their **position in the
scale array** — `SCALE_COLORS[scaleIndex + 1]`, a fixed seven-entry
degree→hue table. Every other surface in the app colors by **semitone
distance from the root**, through `theory/intervals.js`'s
`getIntervalColor`. The two disagree wherever a degree can be altered:

| | Degree-indexed (old) | Semitone (new) |
|---|---|---|
| E Aeolian ♭3 (G) | `#ffcc44` | `#ffd34f` |
| E Ionian ♮3 (G♯) | `#ffcc44` — **same** | `#d2f25f` — different |

So a minor scale and its parallel major were colored identically on the
fretboard while reading correctly everywhere else. Both numbers above are
measured in Chromium, before and after, not read off the source.

**Why it looks like a small change in a single-scale screenshot:** within one
scale, degree order and semitone order ascend together, so the *sequence* of
hues barely moves. The defect only appears when comparing two scales, which
is why the verification does exactly that.

`markScale` now derives colour and label from one value:

```
getSemitoneFromRoot(root, note)  ->  getIntervalColor(semitone)
                                 ->  INTERVAL_LABELS[semitone]
```

`getSemitoneFromRoot` is new in `geometry.js`, but the computation is not: it
was already the discarded middle of `getIntervalLabelFromRoot`, which
computed `(targetMidi - rootMidi + 12) % 12` purely to index a label table
and threw the number away. Extracting it means colour and label can no longer
disagree about what interval a note is. `getIntervalLabelFromRoot` now calls
it, so there is one implementation rather than two.

`SCALE_COLORS` is **deleted**, along with its re-export through
`src/fretboard/index.js`. Verified by grep first, the way Phase 4c did: one
real consumer (`markScale`), plus the barrel's import and export lines and
two mentions in `Fretboard.js`'s own header comment. Nothing outside
`src/fretboard/` ever imported it. (`PIANO_VIEW_PLAN.md` §2 cited the barrel
lines as `:41`/`:933`; they had drifted to `:43`/`:1072` — re-measure, as
§2.3 says.) `DEFAULT_COLORS` survives as the fallback for an unparseable
note.

**Verified** with 65/65 tests, 34 warnings unchanged, before/after fretboard
screenshots of the same two scales, and a 6-check Playwright script asserting
measured `borderColor` values: ♭3 and ♮3 now differ, the root is stable
across scales, all three match `theory/intervals.js`'s palette exactly, and
the piano agrees with the fretboard on the same page. Running that same
script against the stashed pre-change tree fails four of the six and passes
the piano check — which is the clearest statement of what this step fixed:
the piano was already right, the fretboard was the exception.

---

## 7. Known-dead code (Phases 1 and 1b)

**Removed in Phase 1 (2026-08-01):** everything the original survey's dead-weight
list named - `App_new.js`, `App_backup.js`, `chord-examples.js`,
`metronome-example.js`, `util/dutyCycleDemo.js`, `components/RouteHelper.js`,
`staves.js` (173 lines, imported by nothing - its only reference was a
commented-out `// import './staves';` in `index.js:17`), the empty
`src/polysynthFull/` tree, and `Untitled-1.ipynb`. Also removed:
`src/util.js`, which turned out to have zero importers anywhere in `src` -
`src/util/util.js` was already a superset (same `minTime`, `clamp`,
`getNoteInfo`, `WAVEFORM`, `FILTER`, `REVERB`, plus `NOISE`,
`ENVELOPE_SHAPE`, `generateEnvelopeCurve` that `src/util.js` never had) with
four live importers (`nodes/gain.js`, `components/Knob/Knob.jsx`,
`components/MonoSynth/MonoSynth.js`, `components/PolySynth/PolySynth.jsx`),
so this was a straight deletion rather than a merge. `index.js` dropped from
5,777 to 281 lines - see the module ownership map above and
`REFACTOR_PLAN.md`'s Phase 1 result note for what stayed and why.

**Removed in Phase 1b (2026-08-03):** a second wave, invisible to Phase 1
and only findable once Phases 2-4 had moved everything else. Phase 1 hunted
orphans by import graph and stripped comments file-by-file; each item below
evades one of those two methods.

| Removed | Lines | Why Phase 1 missed it |
|---|---|---|
| `src/progressions.js` | 1,744 | Not an orphan by import graph - `scaleGenerator.js` (now `src/scales/index.js`) dynamically `import()`ed it. But it has **zero non-comment lines** and no exports at all, so the `refreshProgressionDisplay` that import reached for was always `undefined` and its guarded call site was a permanent no-op. |
| `src/synth.js` | 227 | Same shape: entirely commented out, but `keyboard.js` imported 19 names from it (all resolving to `undefined`). |
| `src/cross.js` | 254 | Has live code, so comment-stripping wouldn't touch it, and it had an importer (`keyboard.js`) so the import graph called it reachable. But `keyboard.js` used neither imported name, and **nothing anywhere assigns `window.updateCrossReferenceDisplay`** - so the scale/chord cross-reference table had no way to be built or shown. The four `typeof window.updateCrossReferenceDisplay === 'function'` guards in `chords.js` and `scales/ui/scaleTable.js` went with it. |
| `src/components/IntervalPractice/` | 1,577 | Unreachable from `src/index.js` - nothing mounts it. Contributed **zero build warnings precisely because webpack never compiled it**, which is why Phase 1's warning-driven pass never saw it. |
| `src/components/ThemeManagerApp/`, `src/components/CollapsibleMetronome/` | 36 | Same. |

Also stripped in Phase 1b, not deleted: `keyboard.js`'s entire 24-line
import header (every name unused - 39 warnings in a 61-line file) and its
dead `modifiers` export; `src/index.js`'s 18 dead bindings, six empty
function stubs and duplicated `reportWebVitals()` call, all of which Phase
1's result note consciously deferred rather than turn a comment-stripping
phase into a judgment-call phase; and `src/fretboard/index.js`'s 12-name
dead import block. Build warnings fell **198 -> 115** across the sweep and
`src/` fell to 29,611 lines (3,943 deleted, net 3,926), with zero genuinely
new warnings at any step.

Consequence for Phase 5: `IntervalPractice.jsx` held the microtonal
`window.polySynthRef` surface that §3.1 declined to split out of its
`getPolySynthRef()` helper. That surface now has **zero consumers** -
`PolySynth.jsx` still exposes `getPitchValues`/`setPitchValues`/
`resetMicrotonalPitches` on its imperative handle, but nothing calls them.
See the §5.1 row.

If a later phase finds another orphan module, add it here before deleting
it, the same way this section tracked the Phase 0 finds until Phase 1
cleared them - and note which of the two detection methods above it evaded,
since that is what made this second wave worth a phase of its own.
