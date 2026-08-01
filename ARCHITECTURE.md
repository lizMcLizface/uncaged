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
| `frets.js` (→ `src/fretboard/` in Phase 3) | The `Fretboard` class, marker/shape drawing, CAGED pattern matching, the fretboard control panels, scale position grid, chord grid. State and geometry math moved to `src/fretboard/state.js`/`geometry.js` (see above); the rest is still one file, pending the remaining Phase 3 steps. | theory, `chordFingering`/`chordPatterns`, `progressionBuilder.js` (for the Chord Progression tab content), `src/fretboard/state.js`, `src/fretboard/geometry.js` | — |
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
