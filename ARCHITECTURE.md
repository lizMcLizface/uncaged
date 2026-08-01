# unCAGED Architecture

Living document. Updated as `REFACTOR_PLAN.md` phases land — see that file for
why this exists and the documentation discipline it follows (§3). Seeded
2026-08-01 as the Phase 0 baseline (the pre-refactor shape, warts included)
and updated as Phases 1, 2 and 2b landed the same day. Sections describe the
*current* shape, not an aspirational one.

---

## 1. Runtime shape, in one paragraph

This is a Create React App page with two coexisting UIs that never fully
merged. The vanilla-JS half (`frets.js`, `progressionBuilder.js`,
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

`IntervalPractice.jsx`'s `getPolySynthRef()` helper (2 references) is
similarly untouched: it backs both playback (`playNotes`) and a third,
also-unrelated surface (`getPitchValues`/`setPitchValues`/
`resetMicrotonalPitches`, microtonal tuning controls), so splitting it
without touching the microtonal calls would have meant duplicating the
helper for no structural benefit. Left as one function reading
`window.polySynthRef`, both surfaces still bundled.

Three entry points now dispatch through the registry:

| Entry point | Where | Note format |
|---|---|---|
| Keyboard | `index.js`'s `onKeyPress`, bound via `document.addEventListener('keydown'/'keyup', onKeyPress)`. Maps `event.code` to a note via `keyToNote()` (`keyboard.js:29`). Gates on `isChannelEnabled('synth')`. | `"C#4"` (octave suffix, no `/`) |
| Mouse | `midi.js`'s `initializeMouseInput(playNote2Callback, stopNotes2Callback)`, wired from `index.js`'s `initializePolySynthMouse()`; the polling loop that waits for the synth to exist now polls `getChannel('synth')` instead of `window.polySynthRef`. | same |
| Programmatic | `frets.js`'s `playChordVoicing()`, `progressionBuilder.js`'s `triggerChordProgression()` (playback calls only - its `getProgressionSequencerState()` read stays on `window.polySynthRef`, see §3.1), and `MiniPiano.js`'s `getActivePolySynth()`. | same |

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
| `window.polySynthRef` (playback surface: `playNotes`/`stopNotes`/`stopAllNotes`/`isActive`/`activate`/`triggerChord`) | `App.js:26` | was counted in the ~115 below; now reached via `getChannel('synth')` (`src/audio/dispatch.js`) at every keyboard/mouse/programmatic call site (`index.js`, `frets.js`, `MiniPiano.js`, `progressionBuilder.js`'s `triggerChordProgression`) | **Migrated, Phase 2b (2026-08-01).** |
| `window.polySynthRef` (progression-sequencer-control surface: `getProgressionSequencerState`/`toggleProgressionSequencer`/`setProgressionData`/`setProgressionRate`/`setProgressionDuration`/`updateProgressionSettings`) | `App.js:26` | ~40, all in `progressionBuilder.js` | **Still live.** Not note dispatch - see §3.1. Migrates once `progressionBuilder.js` has a real module boundary (Phase 4). |
| `window.polySynthRef` (microtonal surface: `getPitchValues`/`setPitchValues`/`resetMicrotonalPitches`, bundled with a few playback calls in one shared helper) | `App.js:26` | 2 (`IntervalPractice.jsx`'s `getPolySynthRef()`) | **Still live** — see §3.1 for why this one helper wasn't split. |
| `window.polySynthEnabled` | `App.js:29` | was small; the `index.js`/`progressionBuilder.js`(click-gate)/`MiniPiano.js` reads that gated *playback* now read `isChannelEnabled('synth')` instead | **Migrated, Phase 2b**, except `IntervalPractice.jsx`'s bundled helper (still live, same reason as above). |
| `window.updateFretboardsForScaleChange` | `frets.js:6920` | 17 (1 write + call in `frets.js`, 16 guarded read/call sites in `scaleGenerator.js:2219-2424`) — verified exactly matches `REFACTOR_PLAN.md`'s count | Phase 5 step 3, or a plain import once `frets.js`/`scaleGenerator.js` don't need load-order independence |

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
`selectedNoteIndex`, and similar). These become ordinary imports once Phases
3-4 give each of these files a real module boundary — most don't need
Phase 5's event bus at all, just an import statement.

### 5.3 Correction to `REFACTOR_PLAN.md` §2.1: `gridData`/`outputNoteArray` are dead, not live

`REFACTOR_PLAN.md` §2.1 counted `window.gridData` (52 refs) and
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
`REFACTOR_PLAN.md` has been updated accordingly (§2.1, §2.5, Phase 1, Phase
5).

---

## 6. Module ownership map

| Folder / file | Owns | May import | Must not import it |
|---|---|---|---|
| `src/theory/` *(Phase 2)* | Note names, intervals, scale/chord data, roman numeral parsing. No DOM, with two documented exceptions below. | nothing app-specific, except `roman.js`'s one deliberate exception | everything else may import it |
| `src/audio/` *(Phase 2b landed 2026-08-01: `context.js`/`bus.js`/`dispatch.js`; `clock.js`/`scheduler.js` belong to `SESSION_MODE_FEASIBILITY.md` Stage 2's Timing Grid, not a `REFACTOR_PLAN.md` phase)* | The shared `AudioContext`, master bus, note-event/channel registry dispatch. | nothing app-specific today | UI modules should depend on it, not the reverse |
| `src/nodes/` | Framework-free Web Audio node wrappers (`Gain`, `Filter`, `Distortion`, …), a shared `.getNode()`/`.connect()` interface. | nothing app-specific | — |
| `chordFingering.js`, `chordPatterns.js` | `{string, fret, finger}` voicing logic — domain logic a future string-synth depends on. Framework-free by design (see header comment). | theory primitives only | must **not** move under `src/fretboard/ui/` when Phase 3 splits `frets.js` — noted explicitly in `REFACTOR_PLAN.md` Phase 3 |
| `src/fretboard/state.js` *(Phase 3, in progress, landed 2026-08-01)* | The ~28 module-level `let`s `frets.js` used to hold directly - Scale Position Grid row anchors/tuning + its persisted display settings, the fretboard instance registry, chord/display state, chord-fingering tab state, and the scale-change debounce timestamps - plus `refreshScalePositionTuning()` and `persistScalePositionGridSettings()`. Exported as one mutable object, `fretboardState`, not bare `let`s - see §6.3 for why. | `theory/notation`, `tuning` | everything that used to read/write these as bare identifiers now imports `fretboardState` instead |
| `src/fretboard/geometry.js` *(Phase 3, in progress, landed 2026-08-01)* | Pure fret-position and note-at-position math: `calculateFretPositions`, `calculateFretPosition`, `calculateNote`, `extractNoteName`, `extractOctave`, `getNoteAt`, `findNotePositions`. No DOM, no class instance - takes plain data (tuning array, fret count, fret-position table) in, plain data out. The `Fretboard` class keeps same-named methods that delegate to these (e.g. `calculateNote(a, b) { return geometryCalculateNote(a, b); }`), so its public API is unchanged. | `theory/notation` | — |
| `src/fretboard/markers.js` *(Phase 3, in progress, landed 2026-08-01)* | `createNoteShapeMarker` - builds one detached SVG shape element (circle/square/diamond/triangle/pentagon/hexagon/star/plus/cross) for a Scale Position Grid dot. Touches the DOM (`document.createElementNS`) but no app state - not framework-free the way `geometry.js` is, just state-free. | nothing app-specific | — |
| `src/fretboard/patterns.js` *(Phase 3, in progress, landed 2026-08-01)* | CAGED chord-pattern matching and generic fingering-shape scoring: `calculateChordPatternPositions`, `findChordPatternMatches`, `findOptimalChordShape`. Takes tuning/fretCount as parameters instead of reading `this.*`; calls `geometry.js`'s functions directly. Not framework-free - depends on `chordPatterns.js`'s canned shape library and `tuning.js`'s `isStandardGuitarTuning`. The `Fretboard` class keeps same-named delegate methods, matching the Phase 0 characterization tests that call them as instance methods. | `chordPatterns.js`, `tuning.js`, `theory/notation`, `src/fretboard/geometry.js` | — |
| `src/fretboard/Fretboard.js` *(Phase 3, in progress, landed 2026-08-01)* | The `Fretboard` class itself - DOM rendering (neck/fret grid, note/scale/chord marking, subscale boxes, chord-shape lines, CAGED/fingering display) for one fretboard instance. Also owns `GUITAR_TUNING`/`FRET_COUNT` (constructor defaults), `SCALE_COLORS`/`DEFAULT_COLORS` (marker coloring) and `addInteractiveEvent` (a generic DOM helper with no better home yet) - `frets.js` imports the first three plus the helper back for its own remaining UI code. | theory, `chordFingering`/`chordPatterns`, `tuning.js`, `src/fretboard/state.js`, `geometry.js`, `patterns.js` | must not import `frets.js` (would be circular - `frets.js` imports `Fretboard` from here) |
| `src/fretboard/ui/controls.js` *(Phase 3, in progress, landed 2026-08-01)* | The top bar (title + instrument/tuning picker), the tabbed-panel shell, the hotkey footer, and `createFretboardControls` - the orchestrator that builds the "Other Controls" panel and assembles all six tabs (Scale Information / Chord Progression / Scale Position Grid / Scale Selection / Other Controls / Synthesizer). Called once, from `initializeFretboard()` in `frets.js`. | `src/fretboard/state`, `src/fretboard/Fretboard` (`addInteractiveEvent`), `src/fretboard/ui/chordGrid`, `src/fretboard/ui/scalePositionGrid`, `scales.js`, `scaleGenerator.js`, `tuning.js`, `progressionBuilder.js`, and (cross-import, see §6.8) several glue functions from `frets.js` | — (see §6.8 for the two-way relationship with `frets.js`) |
| `src/fretboard/ui/chordGrid.js` *(Phase 3, in progress, landed 2026-08-01)* | The Chord Pattern Grid (12-note x 12-chord-type button table, color coded for scale compatibility) and the chord-fingering-shape pipeline it shares with the Roman-numeral chord display: matching `chordPatterns.js` shapes to a chord, a "best-effort" fallback grip, the position-picker tab bar, and the scale/chord-interval math (`getSemitoneFromReference`, `getScaleIntervalEntries`, `deriveChordSuffix`, `getScaleDescriptor`) that both this grid and `src/fretboard/ui/scalePositionGrid.js` depend on. See §6.9. | theory, `scales.js`, `scaleGenerator.js`, `chordFingering.js`, `src/fretboard/state`, `src/fretboard/Fretboard` (`addInteractiveEvent`), and (cross-import, see §6.9) glue functions from `frets.js` | must not import `src/fretboard/ui/scalePositionGrid.js` (the dependency runs one way - see §6.10) |
| `src/fretboard/ui/scalePositionGrid.js` *(Phase 3, in progress, landed 2026-08-01)* | The Scale Position Grid tab: one movable mini-fretboard pattern per (root string x scale degree) cell, the Focus Selector visibility matrix, and the per-cell rendering options (pattern/dot size, fret-label mode, note shapes, chord-name headers, etc.) on `fretboardState`. See §6.10. | theory, `scaleGenerator.js`, `chordFingering.js`, `src/fretboard/state`, `src/fretboard/Fretboard` (`FRET_COUNT`), `src/fretboard/markers`, `src/fretboard/ui/chordGrid` | — |
| `frets.js` (→ `src/fretboard/` in Phase 3) | The glue functions called from `index.js`/`chords.js`/`progressionBuilder.js` and from `src/fretboard/ui/controls.js`'s/`chordGrid.js`'s button handlers - `initializeFretboard`, chord display/search/pattern functions, `playChordVoicing`/`getChordVoicingNotes`, etc. State, geometry math, marker drawing, pattern matching, the class itself, the top bar/tab-shell/"Other Controls" panel, the chord grid, and the scale position grid moved to `src/fretboard/state.js`/`geometry.js`/`markers.js`/`patterns.js`/`Fretboard.js`/`ui/controls.js`/`ui/chordGrid.js`/`ui/scalePositionGrid.js` (see above); what's left is glue plus the six-line `CHORD_TYPE_TO_PATTERN_TYPE` map, pending only the barrel. | theory, `chordFingering`/`chordPatterns`, `progressionBuilder.js` (for the Chord Progression tab content), all of `src/fretboard/*` above, `src/fretboard/ui/controls.js` (for `createFretboardControls`), `src/fretboard/ui/chordGrid.js` (for the fingering-shape pipeline the glue functions call) | — |
| `progressionBuilder.js` (→ `src/progression/` in Phase 4) | Chord/roman token parsing (now `src/theory/roman.js` — see below), progression UI, URL share encode/decode. | theory, `scaleGenerator.js` (`getPrimaryScale`/`getPrimaryRootNote`) | — |
| `scaleGenerator.js` / `scales.js` (→ `src/scales/` in Phase 4) | Scale selection state + persistence, scale/root-note tables. **Not moved into `src/theory/` in Phase 2** — see §6.1 correction below. | theory | — |
| `src/components/PolySynth/` | The synth UI + the module-scope `AC`/node graph in §2.1. Slated to be wrapped behind a channel adapter (`SESSION_MODE_FEASIBILITY.md` §2.2), not opened, so Phase 6 (internal cleanup) is optional and off the critical path. | `src/nodes/`, `src/audio/` | — |
| `index.js` | Keyboard entry point (`onKeyPress`), mouse-input wiring, React root mount, a handful of `window.*` exports for `frets.js`/`scaleGenerator.js` to consume. 281 lines (Phase 1, was 5,777). Reads the `'synth'` channel via `src/audio/dispatch.js` (Phase 2b) rather than `window.polySynthRef`. | `src/audio/dispatch.js` | — |
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

- `src/theory/chords.js` imports `{ chords }` (the chord-suffix-list data)
  from `../chords.js` — a DOM-heavy file, not a theory module.
  `identifySyntheticChords` genuinely calls `matchChord(chord, chords, ...)`
  against that data; it looked like dead code at first (shadowed everywhere
  else by `matchChord`'s own `chords` parameter) but isn't. This import means
  merely importing the chord engine also runs `chords.js`'s module-scope
  `document.getElementById('chordPlaceholderContent')` — pre-existing
  behavior (`src/intervals.js` already imported `chords.js` the same way,
  a circular `chords.js` &lt;-&gt; `intervals.js` dependency that predates this
  phase), not something Phase 2 introduced. A future phase that gives
  `chords.js` a real module boundary (splitting its suffix-list data from
  its DOM builders) removes this.
- `src/theory/roman.js`'s `resolveRomanChord`/`resolveFallbackRomanChord`
  import `getPrimaryScale`/`getPrimaryRootNote` from `../scaleGenerator.js`
  (live scale-selection state) — required, not incidental: "which chord
  does 'I' mean" depends on the currently selected scale. `useSeventhChords`
  (progressionBuilder.js's triads-vs-sevenths toggle) is *not* imported the
  same way — it's threaded through as an explicit parameter
  (`resolveRomanChord(romanChord, useSeventhChords)`, default `false`) so
  this module doesn't reach back into the file it was extracted from.

### 6.2 Corrections to `REFACTOR_PLAN.md`'s Phase 2 bullet list

Investigating the "20 duplicate arrays / duplicate helpers" inventory in
`REFACTOR_PLAN.md` §2.2 while doing the move surfaced several pairs that are
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
`REFACTOR_PLAN.md`'s §6.1 resume block, verified against the current
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

---

## 7. Known-dead code (context for Phase 1)

**Removed in Phase 1 (2026-08-01):** everything `REFACTOR_PLAN.md` §2.5
listed - `App_new.js`, `App_backup.js`, `chord-examples.js`,
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

Confirmed still true and not yet acted on: nothing else in this list has
turned up since. If a later phase finds another orphan module, add it here
before deleting it, the same way this section tracked the Phase 0 finds
until Phase 1 cleared them.
