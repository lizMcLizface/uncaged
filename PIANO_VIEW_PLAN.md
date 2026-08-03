# Piano View — Implementation Plan

Investigated 2026-08-03. Not started.

Goal: let the user hide the main fretboard at the top of the page and show a
multi-octave piano keyboard in its place, carrying the same scale
information, and able to have a chord fingering superimposed on it.

Verdict up front: **all four requirements are achievable, and three of the
four have their hard part already written somewhere in the repo.** The work
is mostly a key model plus wiring. The one genuine design problem is that the
app currently has two disagreeing scale-color systems (§2), and resolving it
is now an explicit step rather than a side effect.

Decisions taken 2026-08-03, before any code (see §2, §4, §6 for what each
one rules out):

| Question | Decision |
|---|---|
| Scale-note palette | **Semitone-based `getIntervalColor`, and convert the main fretboard to it too** so the whole app finally agrees. Its own step, because it visibly changes the existing fretboard. |
| Key labels | **Scale notes only**, correctly spelled for the active scale. |
| Relationship to `MiniPiano.js` | **New `src/piano/`, sharing extracted primitives.** `MiniPiano.js`'s four call sites are not touched. |

---

## 1. What already exists

More than expected, same as `SESSION_MODE_FEASIBILITY.md` §1 found.

| Piece | Where | Reusable? |
|---|---|---|
| SVG key geometry, black-key offsets, playable-on-click wiring | `src/components/MiniPiano/MiniPiano.js` (747 lines) | **Concept yes, code no** — see §3 |
| Correct enharmonic spelling per scale | `src/theory/notation.js` — `setScaleContext`/`getScaleContext`, `midiToNote(midi)` returns `Eb/4` not `D#/4` | **Yes.** This is requirement 2, already solved |
| Semitone→color/label palette | `src/theory/intervals.js` — `getIntervalColor`, `getIntervalLabel` | Yes |
| Chord fingering → real sounding pitches | `src/fretboard/index.js:195` `getChordVoicingNotes` — resolves the best shape then `fretboard.getNoteAt(string, fret)` per position | **Yes.** This is requirement 4's hard part, already solved |
| Scale-change notification | `window` `'scaleChanged'` CustomEvent, dispatched by `src/scales/index.js:193`, consumed by `src/progression/scaleSync.js:41` | **Yes — and use it.** See §7 |
| Settings persistence pattern | `fretboardState` + `localStorage`, `src/fretboard/state.js:102-131` | Yes, copy it |
| Note format | `Name/Octave` (`"Eb/4"`) throughout; PolySynth wants `"Eb4"` | — |

`getChordVoicingNotes` deserves the same special mention `chordFingering.js`
got in the session-mode doc. Requirement 4 — "superimpose a chord fingering
which corresponds to actual notes" — sounds like it needs new theory work.
It does not. That function already turns a chord into the exact pitches the
six strings sound, octaves included. The piano needs the same list with `/`
kept instead of stripped.

---

## 2. The blocking design problem: two scale-color systems

The app colors scale notes two different ways, and they disagree
semantically.

| System | Where | Keyed by | Consequence |
|---|---|---|---|
| `SCALE_COLORS` | `src/fretboard/Fretboard.js:56`, used once at `:869` in `markScale` | **Scale degree** — `scaleIndex + 1`, the note's position in the scale array | A ♭3 and a natural 3 are both "degree 3" and get the same yellow. Same for ♭7/7. |
| `INTERVAL_COLORS` / `getIntervalColor` | `src/theory/intervals.js` | **Semitone** — 0-11 from the root | ♭3 and 3 are different colors |

Everything except the main fretboard uses the semitone palette: the Scale
Position Grid, the scale piano, every chord piano. `theory/intervals.js`'s
own header claims its palette is shared "so a given scale tone reads as the
same label and color everywhere in the app: the scale piano, every chord
piano, and the fretboard" — **that claim is currently false**, and the main
fretboard is the single exception.

**Decision: convert the fretboard to the semitone palette.** So the piano
and the fretboard agree, which is what "the same color as they are for the
guitar" actually asks for, without propagating the degree-indexed quirk into
a second instrument.

This is cheap and well-contained:

- `SCALE_COLORS` has exactly **one** real consumer, `Fretboard.js:869`. It is
  re-exported through `src/fretboard/index.js` (`:41`, `:933`) but **nothing
  outside the folder imports it** — verify with a fresh grep before deleting,
  the same way Phase 4c did.
- `markScale` already computes what is needed one line later:
  `getIntervalLabelFromRoot(normalizedRoot, matchedScaleNote)`
  (`src/fretboard/geometry.js:120`) derives the exact `(targetMidi -
  rootMidi + 12) % 12` semitone distance and throws it away after indexing
  `INTERVAL_LABELS`. Extract that distance as a sibling
  `getSemitoneFromRoot(rootNote, targetNote)` and both the label and the
  color come from it.

**This is a deliberate visual change to existing UI, not a refactor.** It
gets its own commit and its own before/after screenshot check, and it must
not be bundled into a step that also moves code — `REFACTOR_PLAN.md` §2.1's
rule about not hiding behavior changes inside moves applies with the sign
flipped.

---

## 3. Why `MiniPiano.js` cannot just be resized

`MiniPiano.js` is the obvious starting point and the wrong one to edit. It
has three properties that are correct for a 140px one-octave thumbnail and
fatal for a full keyboard:

1. **One octave, hardcoded.** `WHITE_KEYS` (7 entries) and `BLACK_KEYS` (5)
   are iterated directly, and `BLACK_KEY_POSITIONS` maps to white-key
   indices 0.5-5.5. Width is a fixed `140`. There is no octave dimension
   anywhere in the module.
2. **Key identity is normalized to sharps, and the label reuses it.**
   `normalizeNoteName()` maps `Eb`→`D#`, and `createMiniPiano` then sets
   `text.textContent = note` using that same normalized name (`:381` for
   white keys, `:432` for black). So the label is *structurally* forced to
   the sharp spelling. **This single line is what blocks requirement 2.**
3. **Highlight matching is pitch-class only.** `normalizedNotes.includes(note)`
   (`:342`, `:393`) — there is no octave to compare, so "highlight E/4 but
   not E/3" cannot be expressed. **This is what blocks requirement 4.**

Requirements 2 and 4 are therefore the same underlying change: **a key needs
`(pitchClass, octave)` identity and a separate display label.** Do not treat
them as two features.

Editing `MiniPiano.js` in place to add all this means touching a 747-line
module with four live call sites (`progression/chordCard.js`,
`scales/ui/infoPanel.js`, `scales/ui/rootNoteTable.js`,
`scales/ui/scaleTable.js`) and real regression risk to the chord, scale,
interval and mixed pianos — for no benefit to any of them, since they are
all correct as one-octave thumbnails.

**Decision: new `src/piano/`, sharing extracted primitives.** Repointing
`MiniPiano.js` onto the shared key model is an *optional* later step (§6),
explicitly not a prerequisite.

---

## 4. Proposed layout

```
src/piano/
  keyModel.js     pure: octave range -> ordered key list, each
                  { midi, pitchClass, octave, isBlack, x, width }
                  no DOM, no app state. The thing MiniPiano could
                  later share.
  labels.js       pure: midi -> display label for the active scale,
                  via theory/notation's scale context
  highlight.js    pure: the highlight-set model (§5) -> midi -> style
  Piano.js        the SVG renderer + click-to-play, built on the above
  state.js        pianoState: octave count, low octave, view mode,
                  localStorage persistence (copy src/fretboard/state.js)
  index.js        barrel: createPiano, showScaleOnPiano,
                  showChordOnPiano, setPianoOctaves, ...
```

Header comments per `REFACTOR_PLAN.md` §2.4: what it owns, what it depends
on, what depends on it. `chordFingering.js:1-7` is the standard.

`keyModel.js` is the piece worth getting right first, because everything
else is a function of it and because it is the only part `MiniPiano.js`
would ever want back.

---

## 5. The highlight model (requirement 4)

The user's framing is already the right abstraction, and it is two cases:

- **Periodic** — "highlight all E keys in red". A pitch class, every octave.
- **Specific** — "highlight E/4 in red". One key.

Model both as one list of entries so a caller never has to pick an API:

```js
[ { note: 'E',    color: '#ff4d4d' },   // pitch class -> every octave
  { note: 'E/4',  color: '#ff4d4d' } ]  // has an octave -> that key only
```

The presence of `/` selects the behavior. This is **already the established
convention in this codebase** — `Fretboard.markNote` (`Fretboard.js:898`)
documents exactly this: "`'C'`, `'F#'`, `'Bb'` for all octaves, or `'C/4'`,
`'F#/3'` for specific octave", and `geometry.js:148-171` implements the same
split. Follow it rather than inventing a flag; it keeps the piano and the
fretboard describing highlights the same way, which matters when a later
session drives both from one source.

Feeding it from a real chord fingering is then:

```js
bestShape.positions.map(p => fretboard.getNoteAt(p.string, p.fret))
// -> ['E/2','B/2','E/3','G#/3','B/3','E/4']
```

which is `getChordVoicingNotes` minus its final `.replace('/', '')`. Extract
the shared part rather than copying the shape-picking logic — that function
is the only place that knows how to pick the *displayed* shape, and a second
copy would drift.

Enharmonic matching must go through `theory/notation`'s
`areEnharmonicEquivalent`, not string equality, or a `Gb` in the chord will
miss an `F#` key.

---

## 6. Build order

Each step is one commit, tests green, no new build warnings
(`REFACTOR_PLAN.md` §2.2).

1. **`keyModel.js` + unit tests.** Pure, no DOM, no UI. Octave range in,
   ordered key list with geometry out. Test the black-key offsets and the
   octave boundaries — this is the only step where a bug is invisible until
   everything is built on it. The repo's 28 characterization tests are all
   over pure functions; this fits that pattern exactly.
2. **`Piano.js` renders a static keyboard** into `#fretNotPlaceholder`,
   hardcoded octave range, no highlighting, not yet reachable from the UI.
3. **Scale highlighting + labels** — `getIntervalColor` by semitone from the
   root, labels for in-scale keys only, spelled through the scale context.
   Subscribe to `'scaleChanged'` (§7).
4. **Convert the fretboard to the semitone palette** and retire
   `SCALE_COLORS` (§2). Standalone commit, before/after screenshots, no
   other changes in it.
5. **The view toggle** — hide the fretboard, show the piano (§7).
6. **Octave-count control** in the top bar (`ui/controls.js:409`
   `createTopBar`, next to the instrument picker), persisted via
   `pianoState` + `localStorage`. Suggested range 1-7, default 3 starting at
   C2 — pick by what stays readable at the app's actual width, not by
   theory.
7. **Chord superimposition** (§5), driven from the chord grid and the
   Roman-numeral buttons, matching what the fretboard already shows.
8. *(Optional, not a prerequisite)* Repoint `MiniPiano.js` onto
   `keyModel.js`. Only worth doing if steps 1-7 leave the geometry genuinely
   identical; if it needs a special case, leave `MiniPiano.js` alone and say
   so, per `REFACTOR_PLAN.md` §2.3 rule 4.

Steps 1-3 are independently useful and can be reviewed before the toggle
exists. Step 4 is the only one that changes existing behavior.

---

## 7. Wiring — the two things to get right

**Subscribe to `'scaleChanged'`, do not add a function global.** The piano
needs to re-render when the scale or root changes. There are two mechanisms
in the codebase and only one of them is acceptable:

- `window.updateFretboardsForScaleChange` — a function global with 17 refs
  that `REFACTOR_PLAN.md` Phase 5 exists to delete. **Do not extend it.**
- the `'scaleChanged'` CustomEvent (`src/scales/index.js:193`) — already a
  real pub/sub edge, already used this way by `progression/scaleSync.js:41`.
  **Use this.**

This is the answer to "will this change what's needed later": adding the
piano through the event adds **nothing** to Phase 5's burden. Doing it the
other way would add a third consumer to the exact global Phase 5 has to
remove.

**Toggle by hiding, never by re-initializing.** `#fretNotPlaceholder` is a
static div in `public/index.html:764`; `initializeFretboard()`
(`src/fretboard/index.js:91`) builds the Fretboard into it and
`createFretboardControls` inserts the top bar *before*
`fretboard.fretboardElement` (`ui/controls.js:1527`), with all six tabs as
siblings.

So the toggle swaps the `.fretboard` element for the piano element and
leaves the top bar and tab shell alone. It must **not** tear down and rebuild
the container: `src/index.js:234` documents a real race where re-running
`initializeFretboard()` pulled `#synthesizerTabContent` out from under a
mounted React tree. `REFACTOR_PLAN.md` §1.1 flags the Synthesizer tab as the
highest-value thing to check after any change in this area — that applies
here, and it is the first tab to open when verifying step 5.

Two more consumers of the raw `.fretboard` element to check when it can be
hidden:

- `public/index.html:903` — `reorganizeForMobile()` polls for
  `.fretboard` on a `setInterval` and sets `order`/`height` on it.
- the mobile CSS blocks at `public/index.html:392` and `:577`.

Neither knows the element can be absent. Whether the piano gets the same
mobile treatment or its own is a judgment call for step 5, but it has to be
a conscious one.

---

## 8. Open questions, deliberately deferred

- **Does the piano need its own playability?** `MiniPiano.js` already has
  `makePianoPlayable` (`:270`) routing clicks through `audio/dispatch`'s
  synth channel. The full piano almost certainly wants this, but it is
  additive and off the critical path for all four stated requirements.
- **Should the piano respect the instrument picker?** A piano has no tuning,
  so `subscribeToInstrumentChanges` is meaningless to it. Probably the
  picker should be hidden or disabled in piano view. Not decided.
- **Interval labels vs note names.** The fretboard has
  `fretboardState.mainFretboardLabelMode` (`'interval'` vs note name). The
  decision above is note names for in-scale keys; whether the piano should
  honor that existing toggle instead of ignoring it is worth revisiting once
  step 3 is real.
- **`currentScaleContext` is a module-level singleton** in
  `theory/notation.js:400`, set as a *side effect* of `getScaleNotes`. The
  piano must not assume it is populated — either call `setScaleContext`
  itself or read spelling through an explicitly passed context. This is a
  latent sharp edge, not a bug the piano introduces.
