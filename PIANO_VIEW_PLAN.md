# Piano View — Implementation Plan

Investigated 2026-08-03. Not started.

Goal: let the user hide the main fretboard at the top of the page and show a
multi-octave piano keyboard in its place, carrying the same scale
information, able to have a chord fingering superimposed on it, playable, and
showing the current instrument's playable range.

**Verdict up front: this is not a new component. It is the missing DOM for a
piano that is already written.** `src/index.css`, `src/midi.js`,
`src/index.js` and `src/scales/index.js` between them already contain a
styled, layered-highlight, mouse-and-keyboard-playable 88-key piano — with
no markup anywhere that it can attach to. Six of the seven requirements are
wiring, not invention. See §1.1; it is the finding that shapes everything
below.

Decisions taken 2026-08-03, before any code:

| Question | Decision |
|---|---|
| Scale-note palette | **Semitone-based `getIntervalColor`, and convert the main fretboard to it too.** Its own step — it visibly changes existing UI. §2 |
| Key labels | **Scale notes only**, spelled correctly for the active scale, and **honoring the existing `Labels` switch**. §8.3 |
| Relationship to `MiniPiano.js` | **New `src/piano/`.** Less is shareable than first thought — see §3. |
| Playability | **Yes** — click/mouse *and* live highlighting of keys held on the computer keyboard. §8.1 |
| Instrument range | **Yes** — show each instrument's lowest open string and highest practical fret on the piano. §8.2 |

---

## 1. What already exists

### 1.1 The dormant piano — the central finding

There is a complete piano implementation in the repo with **no `#keyboard`
markup anywhere in `src/` or `public/`**. Every piece below is live,
styled, imported code that currently does nothing:

| Piece | Where | State |
|---|---|---|
| Key styling — `.white`/`.black`, 3D shadows, vertical labels, first/last-child radii | `src/index.css:104-150` | Styled, unused |
| **Layered highlight system** — `.scaleKey` (purple), `.highlightedKey` (blue), `.pressedKey` (amber), **plus striped `repeating-linear-gradient` combinations** for scale+chord and pressed+chord | `src/index.css:160-225` | Styled, unused |
| **`--num-keys` CSS variable** driving `width: calc(100% / var(--num-keys, 55))` | `src/index.css:125`, `:139`, `:278` | **Read in three places, never set anywhere** |
| Held-key highlighting — `classList.add('pressedKey')` / `.remove(...)` on keydown/keyup | `src/index.js:186`, `:201` | Live handler, no-op |
| 88-key element table (MIDI 21-108) | `src/midi.js:237+` `keys` | Built at import, all `element` null |
| Mouse input — press, drag across keys, release | `src/midi.js` `initializeMouseInput` | Function ready, finds 0 keys |
| Scale highlighting | `src/scales/index.js:87` `highlightKeysForScales` | Live, no-op |
| Physical-key → note map (two-row layout) | `src/keyboard.js` `keyToNote` | **Live and working** — drives the synth today |

The CSS expects `<ul id="keyboard"><li class="white" midi="60">…`. Nothing
builds it. `--num-keys` being read but never written is the clearest single
tell: the key-width math was designed for a **configurable key count**, which
is requirement 1, already anticipated.

`ARCHITECTURE.md` §6.28 records the deleted `_chord` third of this same
contract (Phase 4c removed `highlightKeysForChords`, a provable no-op against
`[midi="N_chord"]`). This section is the rest of the story: that was not an
isolated dead function, it was one limb of an entire unbuilt feature — the
app's namesake.

**Consequence: build the piano as HTML `<li>` elements, not SVG.** Doing so
makes `keys`, `initializeMouseInput`, `pressedKey` highlighting and
`highlightKeysForScales` all start working, rather than reimplementing four
things that exist. This is the single highest-leverage decision in the plan.

### 1.2 Everything else already in place

| Piece | Where | Reusable? |
|---|---|---|
| Correct enharmonic spelling per scale | `src/theory/notation.js` — `setScaleContext`, `midiToNote(midi)` returns `Eb/4` not `D#/4` | **Yes.** Requirement 2, solved |
| Semitone→color/label palette | `src/theory/intervals.js` — `getIntervalColor`, `getIntervalLabel` | Yes |
| Chord fingering → real sounding pitches | `src/fretboard/index.js:195` `getChordVoicingNotes` — resolves the displayed shape, then `getNoteAt(string, fret)` per position | **Yes.** Requirement 4's hard part, solved |
| Instrument range inputs | `src/tuning.js` — `getActiveConfig().tuning`, `getNoteAtStringFret(i, fret)` → `{letter, octave, name}`, `subscribe(cb)` | **Yes.** Requirement 6, solved. §8.2 |
| Label mode | `fretboardState.mainFretboardLabelMode` (`'note'`\|`'interval'`\|`'finger'`), `ui/controls.js:1089-1115` | Yes. §8.3 |
| Scale-change notification | `'scaleChanged'` CustomEvent, `src/scales/index.js:193` | **Yes — and use it.** §7 |
| Settings persistence pattern | `fretboardState` + `localStorage`, `src/fretboard/state.js:102-131` | Yes, copy it |

`getChordVoicingNotes` deserves the same mention `chordFingering.js` got in
`SESSION_MODE_FEASIBILITY.md` §1. Requirement 4 sounds like new theory work.
It is not — that function already turns a chord into the exact pitches the
strings sound, octaves included. The piano needs the same list with `/` kept
rather than stripped.

---

## 2. The blocking design problem: two scale-color systems

The app colors scale notes two ways, and they disagree semantically.

| System | Where | Keyed by | Consequence |
|---|---|---|---|
| `SCALE_COLORS` | `src/fretboard/Fretboard.js:56`, used once at `:869` in `markScale` | **Scale degree** — `scaleIndex + 1` | A ♭3 and a natural 3 are both "degree 3" → same yellow. Same for ♭7/7 |
| `getIntervalColor` | `src/theory/intervals.js` | **Semitone** — 0-11 from root | ♭3 and 3 differ |

Everything except the main fretboard uses the semitone palette.
`theory/intervals.js`'s header claims its palette is shared "so a given scale
tone reads as the same label and color everywhere in the app: the scale
piano, every chord piano, and the fretboard." The label half is true; **the
color half is false**, and the fretboard is the sole exception. Recorded in
`ARCHITECTURE.md`'s header until this lands.

**Decision: convert the fretboard to the semitone palette**, so the piano and
fretboard agree without propagating the degree-indexed quirk into a second
instrument. Cheap and contained:

- `SCALE_COLORS` has exactly **one** real consumer, `Fretboard.js:869`. It is
  re-exported through `src/fretboard/index.js` (`:41`, `:933`) but **nothing
  outside the folder imports it** — re-verify by grep before deleting, the
  way Phase 4c did.
- `markScale` already computes what is needed one line later:
  `getIntervalLabelFromRoot` (`src/fretboard/geometry.js:120`) derives
  `(targetMidi - rootMidi + 12) % 12` and discards it after indexing
  `INTERVAL_LABELS`. Extract that as `getSemitoneFromRoot(root, target)` and
  both label and color come from it.

**This is a deliberate visual change, not a refactor.** Its own commit, its
own before/after screenshots, never bundled with a move —
`REFACTOR_PLAN.md` §2.1's rule with the sign flipped.

---

## 3. `MiniPiano.js`: what is and isn't shareable

`MiniPiano.js` (747 lines, SVG, 4 call sites) is the obvious starting point
and the wrong thing to edit:

1. **One octave, hardcoded.** `WHITE_KEYS` (7) and `BLACK_KEYS` (5) are
   iterated directly; `BLACK_KEY_POSITIONS` maps to white-key indices
   0.5-5.5; width is a fixed `140`. No octave dimension exists.
2. **Key identity is normalized to sharps, and the label reuses it.**
   `normalizeNoteName()` maps `Eb`→`D#`, then `text.textContent = note` uses
   that normalized name (`:381` white, `:432` black). The sharp spelling is
   *structurally* forced. **This blocks requirement 2.**
3. **Highlight matching is pitch-class only** — `normalizedNotes.includes(note)`
   (`:342`, `:393`). No octave to compare. **This blocks requirement 4.**

Requirements 2 and 4 are therefore **one change**: a key needs
`(pitchClass, octave)` identity plus a separate display label. Do not plan
them as two features.

**Revision to the earlier decision, stated honestly.** The original intent
was "new `src/piano/`, sharing extracted primitives", with an optional later
step repointing `MiniPiano.js` onto them. §1.1 shrinks what "primitives"
means: the big piano is HTML `<li>` driven by `--num-keys` and CSS float,
`MiniPiano` is SVG with computed x/width. **The pixel geometry cannot be
shared.** What still can:

- which keys exist in a MIDI range, in order, and which are black — a pure
  key *model*
- note → MIDI → correctly-spelled label
- semitone → interval color

Those are worth putting in `src/piano/keyModel.js` and `labels.js`. The
optional "repoint MiniPiano" step (§6 step 9) is correspondingly **less
attractive than when it was proposed** and should be judged on its merits
after step 8, not assumed. `REFACTOR_PLAN.md` §2.3 rule 4 — don't force a
1:1 split when things are genuinely different — applies.

---

## 4. Proposed layout

```
src/piano/
  keyModel.js     pure: (lowMidi, highMidi) -> ordered key descriptors
                  { midi, pitchClass, octave, isBlack }. No DOM, no
                  app state. The part MiniPiano could share.
  labels.js       pure: midi + labelMode -> display string, via
                  theory/notation's scale context and
                  theory/intervals' labels
  range.js        pure: instrument config -> { lowMidi, highMidi }
                  and per-string open-string pitches (§8.2)
  Piano.js        builds <ul id="keyboard"><li class="white|black"
                  midi="N">, sets --num-keys, applies highlight
                  classes. The only DOM-touching file
  state.js        pianoState: octave count, low octave, view mode,
                  practical fret limit, localStorage persistence
                  (copy src/fretboard/state.js's pattern)
  index.js        barrel: createPiano, showScaleOnPiano,
                  showChordOnPiano, setPianoOctaves, setPianoRange...
```

Header comments per `REFACTOR_PLAN.md` §2.4 — what it owns, what it depends
on, what depends on it; `chordFingering.js:1-7` is the standard.

`keyModel.js` is worth getting right first: everything is a function of it,
and it is the only part `MiniPiano.js` would ever want back.

---

## 5. The highlight model

### 5.1 Periodic vs specific

The user's framing is already this codebase's convention, and it is two
cases:

- **Periodic** — "all E keys in red": a pitch class, every octave.
- **Specific** — "E/4 in red": one key.

Model both as one list so callers never pick an API:

```js
[ { note: 'E',   color: '#ff4d4d' },   // pitch class -> every octave
  { note: 'E/4', color: '#ff4d4d' } ]  // has an octave -> that key only
```

Presence of `/` selects the behavior. This is exactly what
`Fretboard.markNote` (`Fretboard.js:898`) documents — "`'C'`, `'F#'`, `'Bb'`
for all octaves, or `'C/4'`, `'F#/3'` for specific octave" — and what
`geometry.js:148-171` implements. Follow it rather than inventing a flag, so
piano and fretboard describe highlights identically.

Feed it from a real fingering with:

```js
bestShape.positions.map(p => fretboard.getNoteAt(p.string, p.fret))
// -> ['E/2','B/2','E/3','G#/3','B/3','E/4']
```

which is `getChordVoicingNotes` minus its final `.replace('/', '')`. Extract
the shared part; do not copy the shape-picking logic, which is the only place
that knows which shape is *displayed*.

Enharmonic matching must use `theory/notation`'s `areEnharmonicEquivalent`,
never string equality, or a `Gb` in a chord misses an `F#` key.

### 5.2 Reconciling the interval palette with the existing CSS

Tension to resolve deliberately: `index.css`'s dormant system encodes
**three states with fixed colors** (`.scaleKey` purple, `.highlightedKey`
blue, `.pressedKey` amber, plus striped combinations), while requirement 3
wants **twelve interval colors**.

Proposal: keep the classes for *state* and make the *hue* variable.

- `.pressedKey` keeps its fixed amber and must visually win — it is
  transient, high-frequency feedback and should never be confused with
  harmonic information.
- `.scaleKey` / `.highlightedKey` become CSS-variable driven (e.g.
  `background: var(--key-color)`), with `Piano.js` setting `--key-color` per
  `<li>` from `getIntervalColor(semitone)`. The existing
  `repeating-linear-gradient` combination rules then keep working for
  overlaps, reading the variable instead of a literal.

Editing that CSS block is **zero-risk today precisely because it is dead** —
nothing renders it (§1.1). That will stop being true the moment step 2
lands, so do the CSS restructuring in step 2 or earlier, not after.

---

## 6. Build order

One commit per step; tests green, no new build warnings
(`REFACTOR_PLAN.md` §2.2).

1. **`keyModel.js` + `range.js` + unit tests.** Pure, no DOM. Test black-key
   placement, octave boundaries, and the range math against a few
   `INSTRUMENT_PRESETS` entries. The only step where a bug stays invisible
   until everything sits on top of it. Fits the repo's existing 28
   pure-function characterization tests exactly.
2. **`Piano.js` renders a static `<ul id="keyboard">`** into
   `#fretNotPlaceholder`, hardcoded range, sets `--num-keys`, no
   highlighting, not yet reachable from the UI. Includes the §5.2 CSS
   variable restructuring. **First visual proof the dormant CSS works.**
3. **Rebuild the element tables** so `src/midi.js`'s `keys` and
   `src/scales/index.js`'s `keys_chords` populate after the piano renders,
   then call `initializeMouseInput`. See §7 — this is the step that makes
   the dormant machinery live, and the one with a real ordering trap.
4. **Scale highlighting + labels** — `getIntervalColor` by semitone from the
   root, in-scale keys only, spelled via the scale context, honoring
   `mainFretboardLabelMode` (§8.3). Subscribe to `'scaleChanged'` (§7).
5. **Convert the fretboard to the semitone palette**, retire `SCALE_COLORS`
   (§2). Standalone commit, before/after screenshots, nothing else in it.
6. **The view toggle** — hide the fretboard, show the piano (§7).
7. **Octave-count control** in the top bar (`ui/controls.js:409`
   `createTopBar`, beside the instrument picker), persisted via `pianoState`.
   Suggested 1-7 octaves, default 3 from C2 — but pick by what stays
   readable at the app's real width, not by theory.
8. **Chord superimposition** (§5.1), driven from the chord grid and
   Roman-numeral buttons, matching what the fretboard already shows.
9. **Instrument range overlay** (§8.2).
10. *(Optional, judge on merit — see §3)* Repoint `MiniPiano.js` onto
    `keyModel.js`.

Steps 1-4 are independently useful and reviewable before any toggle exists.
Step 5 is the only one that changes existing behavior.

---

## 7. Wiring — the three things to get right

**Subscribe to `'scaleChanged'`; do not add a function global.** Two
mechanisms exist and only one is acceptable:

- `window.updateFretboardsForScaleChange` — a function global with 17 refs
  that `REFACTOR_PLAN.md` Phase 5 exists to delete. **Do not extend it.**
- the `'scaleChanged'` CustomEvent (`src/scales/index.js:193`) — a real
  pub/sub edge, already consumed this way by `progression/scaleSync.js:41`.
  **Use this.**

So adding the piano costs Phase 5 **nothing**. Doing it the other way would
add a third consumer to the exact global Phase 5 must remove.

**The element tables are built at import time — this is the ordering trap.**
`src/midi.js`'s `keys` and `src/scales/index.js`'s `keys_chords` are `const`
object literals that call `getElementByMIDI` **once, at module scope**. The
piano renders long afterwards, so they will still be all-null even after the
markup exists. Step 3 must convert them to something re-populatable (a
`refreshKeyElements()` the piano calls after render, or a lazy lookup) —
otherwise everything downstream silently no-ops exactly as it does today, and
it will look like the markup is wrong. `ARCHITECTURE.md` §6.27 notes
`scales/index.js` deliberately preserves `keys_chords`'s module-evaluation
order; changing it to lazy is a behavior change there and needs its own note.

**Toggle by hiding, never by re-initializing.** `#fretNotPlaceholder` is a
static div (`public/index.html:764`); `initializeFretboard()`
(`src/fretboard/index.js:91`) builds into it and `createFretboardControls`
inserts the top bar *before* `fretboard.fretboardElement`
(`ui/controls.js:1527`), with the six tabs as siblings. The toggle swaps the
`.fretboard` element for the piano and leaves the top bar and tab shell
alone. It must **not** tear down and rebuild the container:
`src/index.js:234` documents a real race where re-running
`initializeFretboard()` pulled `#synthesizerTabContent` out from under a
mounted React tree. `REFACTOR_PLAN.md` §1.1 flags the Synthesizer tab as the
highest-value check after any change here — it is the first tab to open when
verifying step 6.

Two consumers of the raw `.fretboard` element assume it is always present:

- `public/index.html:903` — `reorganizeForMobile()` polls for `.fretboard`
  on a `setInterval` and sets `order`/`height` on it.
- the mobile CSS at `public/index.html:392` and `:577`.

Whether the piano gets the same mobile treatment or its own is a step-6
judgment call, but a conscious one.

---

## 8. Resolved 2026-08-03

### 8.1 Playability — yes, both kinds

**Click/mouse: already written.** `initializeMouseInput` (`src/midi.js`)
handles press, drag across keys, and release for MIDI 21-108, routing through
the synth channel. It reports "initialized for 0 piano keys" today. Step 3
calls it after render; no new playback code.

**Held-key highlighting: already written too.** `src/index.js:158-202`
maintains `currentPressed` (notes in `Name/Octave` form, e.g. `'E/4'` —
already §5.1's format) on `keydown`/`keyup`, plays through the synth, and
does `keys[midi].element.classList.add('pressedKey')` (`:186`) /
`.remove(...)` (`:201`). It is
a no-op only because `keys[midi].element` is null. **Fixing the table in step
3 makes held-key highlighting work with no new logic.**

One real gap: `currentPressed` is a module-level `var` in `src/index.js`
(`:37`), not exported, so the piano cannot read the held set for a re-render
that happens mid-press (e.g. changing octave count while holding keys). Per
`REFACTOR_PLAN.md` §2.3 rule 2 this wants moving into a small exported state
object rather than being exported as a bare `let`. Small, and step 3's
natural companion.

Note `PolySynth.jsx` has its *own* `keydown`/`keyup` block commented out at
`:2081-2097` (the "working code behind a deliberate off-switch"
`REFACTOR_PLAN.md` §1.2 lists). `src/index.js`'s handler is the live one.
**Do not re-enable PolySynth's** — that would double-trigger every note.

### 8.2 Instrument range — yes

All inputs exist in `src/tuning.js`:

- **Lowest note** = lowest open string. Compute as the min over
  `getNoteAtStringFret(i, 0)` for all strings — do **not** take the last
  tuning entry. Tuning arrays are conventionally descending
  (`guitar6: ['E4','B3','G3','D3','A2','E2']`) but that is a convention, not
  a guarantee, and a min is the same cost.
- **Highest practical** = max over `getNoteAtStringFret(i, practicalFret)`.
  The user suggested fret 18; `FRET_COUNT` is 21 and is the *displayed*
  count, not a playability claim. Make the practical limit a `pianoState`
  setting defaulting to 18, so it is adjustable without a code change.
- **Live updates**: `tuning.js`'s `subscribe(cb)` already notifies on
  instrument change — the same hook `initializeFretboard` uses at
  `src/fretboard/index.js:112`.

The range spans a bass low B0 (`bass5`/`bass6`) to a guitar high E4 + 18
frets, so the union across presets is roughly **B0-A#5** — worth knowing when
choosing default octave counts in step 7.

**Two different ranges must not be conflated.** The piano's own displayed
octave range (requirement 1, user-chosen) and the instrument's playable range
(this) are independent. Suggested treatment: render out-of-range keys dimmed
rather than hiding them, and offer a "fit to instrument" action that sets the
displayed range to cover the playable one. Marking each open string's pitch
is a cheap addition once `range.js` returns them.

This also settles an earlier open question: **yes, the piano should respect
the instrument picker** — not for tuning, which is meaningless for a piano,
but for this range display. The picker therefore stays visible in piano view.

### 8.3 Label mode — respect the existing switch

The piano honors `fretboardState.mainFretboardLabelMode`, driven by the
`Labels` select at `ui/controls.js:1089-1115`, rather than adding a second
control:

| Mode | Piano behavior |
|---|---|
| `'note'` | Correctly-spelled note name (`Eb`, not `D#`) via the scale context |
| `'interval'` | `getIntervalLabel(semitone)` from the root — `R`, `m3`, `P5` |
| `'finger'` | **Guitar-specific, meaningless on a piano.** Fall back to `'note'` |

Labels on in-scale keys only, per the decision above. The dormant CSS already
positions them: `.white`/`.black` use `writing-mode: vertical-rl` with
`justify-content: right`, i.e. rotated at the near end of the key — so the
label is just the `<li>`'s text content, no extra layout work.

`'finger'` needs a decision recorded in code, not silence: a piano showing
guitar finger numbers is wrong, and falling through to a blank label would
look like a bug.

---

## 9. Still open

- **Does the piano need its own `.pressed` state?** `index.css:150` defines
  `.white.pressed` (a physical depression effect) separately from
  `.pressedKey` (the amber highlight). Only `.pressedKey` is referenced by
  any JS. Whether mouse/keyboard input should also apply `.pressed` for the
  tactile look is a step-3 call.
- **`--num-keys` has two different defaults** in the dead CSS — `55` for
  white keys (`:125`) and `50` for black keys (`:139`, `:278`). Since
  `Piano.js` will always set it explicitly this is probably harmless, but the
  inconsistency suggests the original author was mid-iteration, so don't
  treat either number as meaningful.
- **Does the piano belong in the tab shell or above it?** The plan assumes it
  replaces `.fretboard` in place, keeping the top bar and all six tabs. If it
  should instead be a seventh tab, step 6 changes shape substantially.
- **`currentScaleContext` is a module-level singleton**
  (`theory/notation.js:400`) set as a *side effect* of `getScaleNotes`. The
  piano must not assume it is populated — either call `setScaleContext`
  itself or take an explicit context. A latent sharp edge, not one the piano
  introduces.
