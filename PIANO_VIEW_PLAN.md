# Piano View — Implementation Plan

Investigated 2026-08-03. Steps 1-7 landed 2026-08-03. Steps 8-9 remain, both
additive.

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
| Placement | **Replaces the fretboard in place.** Same slot in `#fretNotPlaceholder`; top bar and all six tabs unchanged. Not a seventh tab. §9 |

## Status

| Step | State | Notes |
|---|---|---|
| 1 — `keyModel.js` + `range.js` + tests | **done** 2026-08-03 | Pure. 25 tests in `src/piano.test.js` (53 total). Surfaced §4.1, the MIDI-convention seam |
| 2 — `Piano.js` renders static `<ul id="keyboard">` | **done** 2026-08-03 | §5.2 CSS variable work included. The dormant CSS works — see §5.3 |
| 3 — Rebuild the element tables, wire mouse + held keys | **done** 2026-08-03 | Mouse + held keys live. `keys_chords` deliberately not touched — §1.3 |
| 4 — Scale highlighting + labels | **done** 2026-08-03 | §2 palette, `mainFretboardLabelMode`, `'scaleChanged'`. Retired `highlightScaleNotes` — §1.3 |
| 5 — Convert the fretboard to the semitone palette | **done** 2026-08-03 | The only step that changed existing behavior. §2.1 |
| 6 — The view toggle | **done** 2026-08-03 | **Pulled ahead of 4-5** at the user's request, so the piano is reachable to play with. Hide/show only. §6.1 |
| 7 — Octave-count control | **done** 2026-08-03 | **Other Controls tab, not the top bar** — §6.2. Start octave + span, persisted |
| 8 — Chord superimposition | **superseded** 2026-08-03 | Widened into `VISUALIZATION_STACK_PLAN.md` — see §10.1 below. Lands as its step 8e |
| 9 — Instrument range overlay | not started | §8.2. Its shape is settled in advance by `VISUALIZATION_STACK_PLAN.md` §2.5: a renderer-level property of the keys, **not** a stack layer |
| 10 — Repoint `MiniPiano.js` *(optional)* | not started | Judge on merit — §3 |

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
| Scale highlighting | `src/scales/index.js` — `highlightKeysForScales` **and** `highlightScaleNotes` | Live, no-op — **but not for the reason this table implied. See §1.3** |
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

### 1.3 Correction, found in step 3: there were THREE keyboards, not one

§1.1 lists scale highlighting as one more thing that starts working once the
import-time key table is repopulated. **That is wrong, and the shape of the
mistake matters more than the fact of it.**

`src/scales/index.js` has its *own* `getElementByMIDI`, and it does not query
`[midi="N"]` — it queries **`[midi="N_scale"]`**. `keys_chords` is that
namespace's table. No markup in `src/` or `public/` has ever carried that
attribute, and none ever will now, because a single `<li>` cannot hold two
different `midi` values.

That is the surviving sibling of the `midi="N_chord"` namespace Phase 4c
deleted along with `highlightKeysForChords` (`ARCHITECTURE.md` §6.28). Three
attribute namespaces were designed — plain, `_scale`, `_chord` — which is
exactly what `theory/intervals.js`'s header means by "the scale piano, every
chord piano, and the fretboard". **Three separate keyboards were planned.**
Only the plain one is now built. §6.28 read the `_chord` deletion as removing
one limb of a single unbuilt feature; it was one of three.

So the two similarly-named highlighters in that file are dead for two
*different*, unrelated reasons, and only one of them is about the key table:

| Function | Namespace | Why it does nothing | Fixed by repopulating the table? |
|---|---|---|---|
| `highlightKeysForScales` (adds `highlightedKey`) | `midi="N_scale"` | Queries an attribute that has never existed | **No.** Nothing can fix it but changing the selector |
| `highlightScaleNotes` (adds `scaleKey`) | `midi="N"` — the real one | Its range gate reads `#lowestNoteSelection`/`#highestNoteSelection`, **neither of which exists anywhere**, so `parseInt(undefined)` is `NaN` and every comparison is false | Elements are real as of step 3; the phantom range gate still isn't |

Both verified 2026-08-03 by grep across all of `src/` and `public/`.

**Consequences.**

- **Step 3 repopulates `src/midi.js`'s `keys` only.** Repopulating
  `keys_chords` would be pure ceremony — it would still resolve nothing.
  §6's step-3 description says to do both; it is wrong and this supersedes
  it.
- ~~**Step 4 has a decision to make that the plan didn't know about**~~:
  **decided in step 4 — `highlightScaleNotes` deleted.** Once step 3 made
  `keys[midi].element` resolve, it stopped being harmlessly dead and became a
  *second writer* to `scaleKey` on the piano's own elements. What replaced it
  is strictly more: colour by semitone from the root instead of one flat
  purple, correct enharmonic spelling, and the displayed range as the
  visibility gate its phantom `#lowestNoteSelection`/`#highestNoteSelection`
  selects were reaching for. One call site, removed with it; `keys` and the
  `jquery` import in `src/scales/index.js` went dead with it and were removed
  too (§2.3 lesson 6).
- **The two extra namespaces are dead code**, in the same class as
  §6.28's `highlightKeysForChords`. Retiring `keys_chords`,
  `highlightKeysForScales` and their `getElementByMIDI` is a cleanup for
  after step 4 decides, not part of building the piano. **Still outstanding
  after step 4**, deliberately: unlike `highlightScaleNotes`,
  `highlightKeysForScales` *cannot* contend with the piano (wrong namespace),
  and it has ten call sites across `ui/rootNoteTable.js`/`ui/scaleTable.js`.
  That makes it a dead-code cleanup on its own schedule, not a piano step.

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

### 2.1 How it landed (step 5, 2026-08-03)

Done as written. Two things worth carrying forward:

**A single-scale screenshot barely shows the change, and that is not a sign
nothing happened.** Within one scale, degree order and semitone order ascend
together, so the hue *sequence* is nearly unchanged. The defect only exists
*between* scales — E Aeolian's ♭3 and E Ionian's ♮3 were both
`rgb(255, 204, 68)`, and are now `rgb(255, 211, 79)` and `rgb(210, 242, 95)`.
The verification therefore compares two scales and asserts measured
`borderColor` values rather than trusting the eye.

**Run the verification against the pre-change tree too.** `git stash`, re-run,
compare — §2.3 lesson 8, used here to *confirm* a change rather than to clear
a false alarm. Four of the six checks fail on the old code and the piano check
passes, which states precisely what this step fixed: the piano was already
right, the fretboard was the exception.

The line numbers in this section had drifted (the barrel's re-export was at
`:43`/`:1072`, not `:41`/`:933`); the grep before deleting is what mattered,
and it confirmed the "exactly one real consumer" claim exactly.

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

### 4.1 The MIDI-convention seam — found building step 1

**`src/piano/` is standard MIDI throughout: 60 = C4.** That is not a free
choice; it is forced, and the codebase disagrees with itself about it:

| Module | `C4` is | Used by the piano? |
|---|---|---|
| `theory/notation.js` — `noteToMidi`/`midiToNote` | **60** (`(octave + 1) * 12 + …`, `:100`) | **Yes** — the conversion everything goes through |
| `midi.js`'s `keys` table | **60** (`60: { note: "C", octave: 4 }`) | **Yes** — a descriptor's `midi` indexes it directly, and is the `midi="N"` attribute the CSS selects on |
| `theory/notes.js` — `noteToMidi`/`noteToName` | 48 | No. Its header already documents the divergence |
| `tuning.js` — `noteOctaveToSemitones` (`:41`) | 48 | No, and this is the trap |

`getNoteAtStringFret` returns `{letter, octave, name}` with **no MIDI
number**, so `range.js` has to derive one — and reusing `tuning.js`'s own
semitone math would put the entire instrument-range overlay an octave low,
invisibly, until step 9. It converts via `notation.js`'s `noteToMidi` on
slash-form input (`` `${letter}/${octave}` `` — `noteToMidi('E2')` silently
parses as E**4**, since `basicNoteToMidi` only reads an octave after a `/`).

A `TODO` at `tuning.js:41` records the underlying cleanup: collapse that
function onto standard MIDI and have `getNoteAtStringFret` return a `midi`
field, which would delete this conversion rather than document it. Not done
inside a feature step.

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

### 5.3 How it actually landed (step 2, 2026-08-03)

Confirmed dead before touching it: no `class="white"`, `class="black"`,
`.offset` or `#keyboard` reference exists anywhere in `src/` or `public/`.

**Two variables, not one.** The proposal above says "e.g. `--key-color`",
one hue per `<li>`. That does not survive contact with the striped
combination rules: `.scaleKey.highlightedKey` renders scale *and* chord as
alternating stripes, so it needs **two** hues simultaneously, and a single
variable collapses it to a solid block. So:

| Custom property | Drives | Variable? |
|---|---|---|
| `--scale-key-color` | `.scaleKey` | Yes — set per `<li>` from `getIntervalColor(semitone)` |
| `--highlight-key-color` | `.highlightedKey` | Yes |
| `--pressed-key-color` | `.pressedKey` | **No, deliberately** — transient input feedback must never read as harmonic information |

Defaults are declared once on `#keyboard li` (the pre-existing purple/blue/
amber), so an unset key looks exactly as the dead CSS did and a per-`<li>`
inline `style="--scale-key-color: …"` overrides it. Verified in the browser:
both solid states, all three striped combinations, and a per-key hue
override all render correctly (the step-4 palette path, proved before step 4
needs it).

**Two fixes the restructuring forced, both in dead CSS:**

- **Black-key positioning was fixed-width, not proportional.** `.black` had
  `margin: 0 0 0 -0.75rem` against a percentage-derived width, so it lined up
  at exactly one container width and drifted everywhere else — the reason the
  unused `.offset` class (a hand nudge of `-100%/--num-keys/3`) existed at
  all. Now `margin: 0 calc(-100% / var(--num-keys) / 4)` on both sides:
  a black key consumes zero layout advance and centres on the white/white
  boundary at any width and any key count. Measured in Chromium at 1600px:
  all 15 black keys land **0.00px** off their boundary and the 21 white keys
  span 1599.94 of 1600px. `.offset` is deleted.
- **`float: left` inside a `display: flex` parent is inert.** Replaced with
  `flex: none` so the percentage widths are actually authoritative.

`.white.pressedKey`'s `#d38703` was folded into the single
`--pressed-key-color` (`hsl(48, 97%, 42%)`) that `.black.pressedKey` and
every gradient already used; it was the only outlier.

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
7. **Octave-count control**, persisted via `pianoState`. Suggested 1-7
   octaves, default 3 from C2 — but pick by what stays readable at the app's
   real width, not by theory. ~~In the top bar (`ui/controls.js:409`
   `createTopBar`, beside the instrument picker)~~ — **moved to the Other
   Controls tab at the user's request, §6.2.**
8. **Chord superimposition** (§5.1), driven from the chord grid and
   Roman-numeral buttons, matching what the fretboard already shows.
9. **Instrument range overlay** (§8.2).
10. *(Optional, judge on merit — see §3)* Repoint `MiniPiano.js` onto
    `keyModel.js`.

Steps 1-4 are independently useful and reviewable before any toggle exists.
Step 5 is the only one that changes existing behavior.

### 6.1 Step 6 was taken early (2026-08-03)

Done after step 3 rather than after step 5, at the user's request: steps 4-5
are about how the piano *looks*, and judging that is much easier when you can
actually put the piano on screen and play it. Nothing in 4, 5 or 7 depended on
6 being later — the order in §6 is "independently useful", not a dependency
chain — and the toggle needs only what steps 2-3 built.

**What it is.** A segmented `View: [Fretboard | Piano]` switch in the top bar,
beside the instrument picker. `setMainViewMode(mode)`
(`src/fretboard/index.js`) sets `display` on `.fretboard` and on `#keyboard`
and persists to `pianoState`; the toggle repaints from a
`'mainViewModeChanged'` CustomEvent rather than from inside its own click
handler, so it stays correct whoever changes the mode. `src/piano/state.js`
landed here rather than in step 7, since view mode is one of the settings §4
already assigned to it.

**Visibility only, and it stays that way.** Neither element is ever destroyed
or rebuilt — the reason §7 gives (the Synthesizer tab's React portal target
lives in this same container) is the whole design, and the verification
clicks into that tab after a swap to prove it.

**§9's mobile worry does not apply, and the plan was wrong about why.** It
expected `reorganizeForMobile` (`public/index.html:903`) and the mobile CSS to
"need to learn the element can be absent". They don't: the fretboard is
*hidden*, never removed, so `querySelector('.fretboard')` keeps resolving and
that polling loop still terminates exactly as before. The real mobile work was
the opposite one — `#keyboard` needed the *same* `order: 3` slot rules
`.fretboard` already had in both `@media` blocks (`:392`, `:577`), plus
shorter key heights, or the piano would have landed at the bottom of the
mobile stack. Done.

**Verified** with a 9-check Playwright script: default view, both switch
directions, active-button state, the piano still playable while shown, the
Synthesizer tab intact after a swap, and the choice surviving a reload.

---

### 6.2 Step 7 as it landed (2026-08-03)

**Placed in the Other Controls tab, not the top bar.** The user's call, and
the right one: the top bar already carries the title, the view toggle, the
instrument picker and the scale quick-picker, and the piano range is a
set-once setting rather than something reached for constantly.

Two selects — start octave and span — plus a read-back of the range actually
shown (`C2–B4`). The read-back matters because what is asked for and what
fits are not always the same: the 88-key window ends at A0 and C8.

- **The span slides rather than truncating.** Asking for 7 octaves from C2
  would run past the top of the keyboard, so the *start* moves down to C1 and
  you get the seven octaves you asked for. Truncating instead would leave the
  select reading "7 octaves" while showing six and a bit.
- **1-7 octaves is a legibility ceiling, not a technical one.** Seven octaves
  is 49 white keys; at the app's real width that is about as narrow as a
  two-character label (`F♯`, `m3`) can usefully get. Key labels now scale off
  `--num-keys` in CSS (`clamp(7px, calc(100vw / var(--num-keys) / 5), 13px)`,
  with a smaller ramp for the half-width black keys), so they shrink with the
  key count and are correct on the first paint with no measuring.
- **`Full 88 keys` is a separate range mode**, added after the user asked for
  the whole keyboard at once. It is *not* an eighth octave count: a full
  keyboard is **A0-C8**, which is not a whole number of C-to-B octaves, so
  expressing it as a count would either clip A0-B0 off the bottom or overshoot
  the top. `pianoState.rangeMode` (`'octaves'` | `'full'`) carries it, and the
  start-octave select disables while it is active because it means nothing
  there. The labels do bottom out at their floor at 52 white keys; that is
  accepted deliberately - the keys stay pressable and the board still works as
  an input display, which is the point of the mode.
- **The read-back is computed, not observed.** This panel is built *before*
  `createPiano` runs, so asking the live piano for its range leaves the
  summary blank until the first change. `setPianoOctaveSpan` returns the
  applied `{lowOctave, octaveCount, lowMidi, highMidi}` instead.

**This is the step that made step 3's re-render promise reachable, and it
holds.** §8.1 predicted that a render happening mid-press would build `<li>`s
that never saw the `keydown`, and moved `currentPressed` out of
`src/index.js` so it could be reapplied. Step 3 built that path but had no way
to trigger it; step 7 does. Verified: hold a computer key, change the octave
count, and the held key is still lit on the freshly-built element — and
releasing it still clears. Mouse input rebinds onto the new elements too, and
the scale layer repaints itself from `piano.scale`.

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

**Landed in step 3**, as `keyboardState.currentPressed` in `src/keyboard.js`
— that file already owns "the computer keyboard as a musical input device",
so the held set belongs beside `keyToNote` rather than in a new module. The
reapplication itself lives in `syncPianoKeyState` (`src/fretboard/index.js`),
reached through `createPiano`'s `onRender` hook, which is what keeps
`src/piano/` from having to import `midi.js` or `keyboard.js` at all.

**Two stuck-highlight bugs, first reachable in step 3.** Both are in
`initializeMouseInput` and both predate this work — the function has never
run against a real key before, so they had no way to show. In each, the
`pressedKey` class is *added* unconditionally but *removed* inside a branch
gated on `pressedNotes.has(...)`, which is only true when the synth actually
sounded the note:

- gliding off a key with the synth disabled left it lit permanently;
- releasing the mouse anywhere other than over the key it started on
  (including off the piano entirely) left it lit.

Playwright caught both immediately — a static screenshot could not have.
Fixed by hoisting the un-highlight out of the audio gate at both sites,
into a shared `clearPressedHighlight(note)` that clears exactly one key
(never "all of them", which would wipe notes held on the computer keyboard).

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

**Landed in step 4**, all three modes, driven off the existing `Labels`
select — whose `change` handler now also calls `refreshPianoScale()`. Two
notes on how it came out:

- **Spelling comes from the scale's own note list, not from `midiToNote`.**
  §9 flags `currentScaleContext` as a module-level singleton set as a *side
  effect* of `getScaleNotes`, and warns the piano must not assume it is
  populated. `labels.js` sidesteps that entirely: it is handed the spelled
  `scaleNotes` array and keeps those spellings verbatim, so it never reads
  the singleton and there is nothing to be stale. That closes §9's fourth
  bullet for the piano's purposes.
- **Matching is by pitch class, computed through `noteToMidi`.** §5.1 says
  enharmonic matching must use `areEnharmonicEquivalent` rather than string
  equality. Going through MIDI is the same guarantee more cheaply — `Gb` and
  `F#` both land on 6 — and it also handles `Cb`/`B#`, which cross an octave
  boundary.

**Labels are horizontal, and the dormant CSS was wrong about this.** This
section originally endorsed `writing-mode: vertical-rl` — rotated,
bottom-to-top — on the grounds that the CSS already positioned labels for
free. Seeing it rendered settled it the other way: **a rotated flat sign (♭)
does not read as a flat**, which makes every flat-spelled scale look wrong,
and that is exactly what requirement 2 exists to get right. Changed to
horizontal, bottom-centre, matching `MiniPiano.js`'s SVG text
(`text-anchor: middle`, `y = height - 8`) so the big piano and the mini
pianos read identically. The root is bold, the same cue `MiniPiano.js:380`
uses.

---

## 9. Still open

- ~~**Does the piano need its own `.pressed` state?**~~ **Decided in step 3:
  no.** `.white.pressed`/`.black.pressed` (the physical depression effect)
  stay unused. `.pressedKey`'s amber already reads unambiguously as "this key
  is sounding", the two would have to be applied and cleared in lockstep at
  six separate call sites in `initializeMouseInput` plus two in
  `src/index.js`, and every one of those is a place a stuck highlight can
  survive — step 3 already found two such leaks (§8.1). Left as dead CSS
  rather than doubling that surface for a shadow.
- ~~**`--num-keys` has two different defaults** in the dead CSS — `55` for
  white keys and `50` for black keys.~~ **Resolved in step 2:** neither
  number meant anything (the author was mid-iteration). Unified to `52`, the
  white-key count of an 88-key piano, and `Piano.js` sets it explicitly from
  `countWhiteKeys()` anyway. **`--num-keys` is the white-key count, not the
  total** — that is the layout contract the whole block depends on.
- ~~**Does the piano belong in the tab shell or above it?**~~ **Decided
  2026-08-03: the piano replaces the fretboard in place.** It occupies the
  same slot in `#fretNotPlaceholder`, and the top bar and all six tabs stay
  exactly where they are. It is *not* a seventh tab. §7's "toggle by hiding,
  never by re-initializing" is therefore the whole of step 6. ~~The two
  `.fretboard` consumers in `public/index.html` (`:903`'s
  `reorganizeForMobile` and the mobile CSS at `:392`/`:577`) are the only
  things that need to learn the element can be absent.~~ **Wrong, found in
  step 6: the fretboard is only ever hidden, never removed, so both consumers
  keep working untouched. The real work was the reverse — `#keyboard` had to
  be added to the same mobile slot rules. §6.1.**
- **`currentScaleContext` is a module-level singleton**
  (`theory/notation.js:400`) set as a *side effect* of `getScaleNotes`. The
  piano must not assume it is populated — either call `setScaleContext`
  itself or take an explicit context. A latent sharp edge, not one the piano
  introduces.

---

## 10. Session kickoff prompt

```
Build the unCAGED piano view.

Read PIANO_VIEW_PLAN.md first, all of it — it is short and every section
is load-bearing. Section 1.1 is the finding the whole plan rests on and
the one most likely to be re-discovered the hard way. The Status table
shows what's done. Section 6 is the build order.

Then read REFACTOR_PLAN.md section 2 for the working rules, the
verification tooling and the lessons list (2.3 — read it properly), and
ARCHITECTURE.md for module contracts. You do NOT need to read
REFACTOR_PLAN.md section 1; the piano is not a refactor phase.

Do NOT re-survey the codebase. PIANO_VIEW_PLAN.md already records the
file:line of every piece this feature builds on, and it exists so that
investigation is not repeated. Trust it — but re-verify any specific
line number or count you are about to act on, since those drift. If you
find something that contradicts the doc, fix the doc as part of your
work and say so.

Three things that are easy to get wrong:
- This is a FEATURE, not a refactor. REFACTOR_PLAN.md 2.1's
  "restructuring only" rule does not apply. Its discipline does: one
  commit per step, tests green, no new build warnings, docs updated.
- Step 5 is the only step that changes existing behavior. Keep it in
  its own commit with before/after screenshots. Never fold it into
  another step.
- Most of this feature already exists and is inert (1.1). Reach for the
  existing code before writing new code, and if you find yourself
  reimplementing key highlighting, mouse input or a key table, stop and
  re-read 1.1.

Then:
1. Tell me which step from the Status table you are starting and your
   first few moves. Wait for my go-ahead before editing anything.
2. Do only that step. Do not begin the next one.
```

To resume mid-step, append what landed and what remains.

### 10.1 Step 8 became its own plan (2026-08-03)

Investigating step 8 found that "superimpose a chord on the piano" cannot be
done in the shape §6 assumed. `Piano.js` has one content writer
(`showScale`) and one remembered layer (`piano.scale`); the fretboard has no
representation of what it is showing at all, only six `fretboardState` flags
and a re-derivation ladder (`restoreFretboardState`,
`src/fretboard/index.js:437`) copied four times, already divergent. Adding
chords to the piano the current way means a second remembered layer, a
seventh flag, and a fifth copy of the ladder.

`VISUALIZATION_STACK_PLAN.md` is the alternative: one stack of layers with a
persistent base and pushable transient layers, rendered by both the
fretboard and the piano, with the `dimBelow` flag the user asked for. Step 8
lands as its **step 8e**, after the stack exists. Its §1.3 also finds that
the same design was attempted in 2019 and is still in the tree —
`highlightKeysForScales` and its ten hover call sites, dead for the selector
reason this document's §1.3 already recorded.

Nothing in steps 1-7 changes. §5.1's periodic/specific note-list model is
carried over unchanged as the new plan's layer payload.

**Verification for this feature specifically.** `REFACTOR_PLAN.md` §2.2's
tooling applies unchanged (`npm test -- --watchAll=false`,
`bash scripts/check-build.sh`, the `run-app` skill), with two additions:

- Steps 2-4 are the first time anything renders `#keyboard`, so a
  screenshot is the *primary* evidence, not a sanity check. `run-app`'s
  `--tabs` flag is not needed — the piano is above the tab strip.
- Step 3 cannot be verified by a screenshot at all: mouse and held-key
  highlighting only appear during interaction. Drive it with Playwright
  (`REFACTOR_PLAN.md` §2.3 lesson 10) and assert `pressedKey` lands on the
  right `<li>`. Lesson 9's warning about fiddly selectors applies — prefer
  `[midi="60"]` over text matching.
