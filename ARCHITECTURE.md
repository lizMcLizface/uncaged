# unCAGED Architecture

Living document. Updated as `REFACTOR_PLAN.md` phases land — see that file for
why this exists and the documentation discipline it follows (§3). This
revision (2026-08-01) is the Phase 0 baseline: the *current*, pre-refactor
shape, warts included. Sections are not aspirational.

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

**There are two independent `AudioContext`s today.** This is the single
most important fact in this document and the reason Phase 2b exists.

### 2.1 The synth context (`PolySynth.jsx`)

Created once at module scope — `PolySynth.jsx:67`, `const AC = new
AudioContext();` — not inside a component, so it exists from the moment the
module is imported, before any user gesture. All synth-related nodes
(`PolySynth.jsx:69-89`) are created at that same module scope, once, shared
by every mounted instance of the component (there is only ever one).

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
AC.destination
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
until first needed, then lazily creates its own, separate
`AudioContext`/`webkitAudioContext` (`metronome.js:236,246,568`) — a second,
independent clock with no relationship to `AC` above. Its click sound is a
minimal, self-contained path: `osc -> envelope (GainNode) ->
this.audioContext.destination` (`metronome.js:490,509-510`) — it does not
route through the synth's master bus at all.

Because the two contexts can't be sample-synced, the metronome bridges
`performance.now()` time to its own audio-clock time via
`performanceTimeToAudioTime()` and a stored `audioContextStartTime` offset
(`metronome.js:243-261`) — a drift-prone workaround for not sharing a clock,
not a design choice.

**Fix (Phase 2b):** one `AudioContext`, created once in
`src/audio/context.js`, shared by the synth, the metronome, and every future
channel (guitar, bass, piano, drums per `SESSION_MODE_FEASIBILITY.md`).

### 2.3 AudioWorklets — work, but by coincidence

`src/nodes/noiseGenerator.js:21-23` loads
`/white-noise-processor.js`/`pink-`/`brown-` from the **domain root**, not a
relative path. It works today only because `liz.moe` root happens to serve
the same files as `/uncaged/`. If that ever changes, worklets silently
degrade to a `ScriptProcessor` fallback with just a `console.error`
(confirmed live in a real Chromium run, 2026-08-01 — see run-app skill
notes). Fix when touched: `process.env.PUBLIC_URL`-relative paths (Phase 2b).

---

## 3. Channel / dispatch model

There is no formal dispatcher yet — this section documents the de facto one,
which Phase 2b/5 will replace with `src/audio/dispatch.js`.

**The interface every entry point calls** is the imperative handle PolySynth
exposes via `useImperativeHandle` (`PolySynth.jsx:1871-1876`):
`playNotes(notes, volume, durationMs)`, `stopNotes(notes)`,
`stopAllNotes()`, `isActive()`, `activate()`. `App.js` stores this ref on
`window.polySynthRef` (`App.js:24-31`) once the portal has actually mounted
`PolySynthWrapper` — the highest-traffic global in the app (~115 references
across 6 files).

Three entry points dispatch through it, all going through
`window.polySynthRef` rather than a shared import:

| Entry point | Where | Note format |
|---|---|---|
| Keyboard | `index.js`'s `onKeyPress`, bound via `document.addEventListener('keydown'/'keyup', onKeyPress)` at `index.js:2615`. Maps `event.code` to a note via `keyToNote()` (`keyboard.js:29`). | `"C#4"` (octave suffix, no `/`) |
| Mouse | `midi.js`'s `initializeMouseInput(playNote2Callback, stopNotes2Callback)`, wired at `index.js:5739`, attaches listeners to elements found via `getElementByMIDI()`. | same |
| Programmatic | Fretboard (`frets.js:6138-6144`, chord-click handlers) and progression builder/sequencer (`progressionBuilder.js`, PolySynth's own progression sequencer) call `window.polySynthRef.playNotes(...)` directly for preview/playback. | same |

There is no tagged event shape (`{ type, note, velocity, channel }` or
similar) — every call site independently guards `window.polySynthRef &&
window.polySynthRef.playNotes`. This is what `src/audio/dispatch.js`
(Phase 2b) formalizes: one tagged note event, one channel registry, these
three entry points rewired to publish to it instead of reaching into
`window`.

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
metronome's own click sound. Fix (Phase 2b/5, staged per
`SESSION_MODE_FEASIBILITY.md` §4): `src/audio/clock.js` lifts the absolute
timebase out of `metronome.js`; `src/audio/scheduler.js` generalizes the
lookahead loop into one queue for all voices; the progression sequencer and
arpeggiator migrate onto it.

---

## 5. Remaining globals

`window` is the only channel between the vanilla-JS and React halves. Not
every global below is equally real — one entry (`window.gridData` /
`window.outputNoteArray`) turned out, on inspection for this document, to
have **zero live references**; see the correction note at the end of this
section.

### 5.1 Live and high-traffic — migrate first (Phase 5 step 3)

| Global | Writer | Live reference count | Removed by |
|---|---|---|---|
| `window.polySynthRef` | `App.js:26` | ~115, across `index.js`, `progressionBuilder.js`, `frets.js`, `App.js`, `MiniPiano.js`, `IntervalPractice.jsx` | `src/audio/dispatch.js` (Phase 2b), consumed by Phase 5 |
| `window.polySynthEnabled` | `App.js:29` | small, gates `index.js`'s `onKeyPress` | same |
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
| `src/theory/` *(Phase 2, not yet created)* | Note names, intervals, scale/chord data, roman numeral parsing. No DOM. | nothing app-specific | everything else may import it |
| `src/audio/` *(Phase 2b, not yet created)* | The shared `AudioContext`, master bus, clock, lookahead scheduler, note-event dispatch/channel registry. | `src/theory/`, `src/nodes/` | UI modules should depend on it, not the reverse |
| `src/nodes/` | Framework-free Web Audio node wrappers (`Gain`, `Filter`, `Distortion`, …), a shared `.getNode()`/`.connect()` interface. | nothing app-specific | — |
| `chordFingering.js`, `chordPatterns.js` | `{string, fret, finger}` voicing logic — domain logic a future string-synth depends on. Framework-free by design (see header comment). | theory primitives only | must **not** move under `src/fretboard/ui/` when Phase 3 splits `frets.js` — noted explicitly in `REFACTOR_PLAN.md` Phase 3 |
| `frets.js` (→ `src/fretboard/` in Phase 3) | The `Fretboard` class, fret geometry, marker/shape drawing, CAGED pattern matching, the fretboard control panels, scale position grid, chord grid. | theory, `chordFingering`/`chordPatterns`, `progressionBuilder.js` (for the Chord Progression tab content) | — |
| `progressionBuilder.js` (→ `src/progression/` in Phase 4) | Chord/roman token parsing, progression UI, URL share encode/decode. | theory, `scaleGenerator.js` (`getPrimaryScale`/`getPrimaryRootNote`) | — |
| `scaleGenerator.js` / `scales.js` (→ `src/scales/` in Phase 4, data half to `src/theory/`) | Scale selection state + persistence, scale/root-note tables. | theory | — |
| `src/components/PolySynth/` | The synth UI + the module-scope `AC`/node graph in §2.1. Slated to be wrapped behind a channel adapter (`SESSION_MODE_FEASIBILITY.md` §2.2), not opened, so Phase 6 (internal cleanup) is optional and off the critical path. | `src/nodes/`, `src/audio/` once it exists | — |
| `index.js` | Currently: keyboard entry point (`onKeyPress`), mouse-input wiring, React root mount. 5,777 lines, 243 live (Phase 1 target: strip the rest). | — | — |
| `App.js` | React root component: theme provider, portals `PolySynthWrapper` into the vanilla UI's synth tab, sets `window.polySynthRef`. | — | — |

---

## 7. Known-dead code (context for Phase 1)

Beyond `REFACTOR_PLAN.md` §2.5's list (`App_new.js`, `App_backup.js`,
`chord-examples.js`, `metronome-example.js`, `util/dutyCycleDemo.js`,
`components/RouteHelper.js`, the empty `src/polysynthFull/` tree,
`Untitled-1.ipynb`, the `util.js`/`util/util.js` duplication): **add
`src/staves.js`** (173 lines) — imported by nothing; its only reference is a
commented-out `// import './staves';` in `index.js:17`. Confirmed via
`grep` for any live import path, 2026-08-01. See §5.3 above for why this
matters beyond line count.
