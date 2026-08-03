# The Visualization Stack — Implementation Plan

Investigated and built 2026-08-03. **Complete — all six steps landed.**
This document is now a *record* rather than a plan: §1 is why it existed,
§2-§5 are the design as built, and §6.1-§6.6 are how each step actually
went. Read §10 if you are picking the project up fresh.

This is `PIANO_VIEW_PLAN.md` **step 8** ("chord superimposition") widened
into the refactor it turned out to require. Read `PIANO_VIEW_PLAN.md` §5.1
first — its note-list highlight model is the layer payload this plan builds
around, and it does not change.

Goal: one place that answers **"what is currently shown on the main
display?"** — a stack of visualization layers, with a persistent base (the
active scale) that transient sources can push onto and pop off again, and a
`dimBelow` flag so a hovered chord reads against a dimmed scale rather than
competing with it. Both the fretboard and the piano render the same stack.

**Verdict up front: the app has no answer to that question today.** What is
shown is *re-derived on demand* by re-running whichever producer function
matches a ladder of six `fretboardState` flags. There is no representation
of the current display anywhere — which is why "undo this hover" is a
function (`restoreFretboardState`, `src/fretboard/index.js:437`) rather than
a pop, and why every new hover source has to teach that function about
itself. See §1; it is the finding that shapes everything below.

Decisions taken 2026-08-03, before any code:

| Question | Decision |
|---|---|
| Scope of "the stack" | **The main display only** — the main fretboard and the piano, which share `#fretNotPlaceholder` and are mutually exclusive. Mini fretboards and mini pianos are *sources*, never targets. §3.4 |
| Layer payload | **`PIANO_VIEW_PLAN.md` §5.1's note list**, unchanged, plus an optional fretboard-only `positions` array for fingerings. §2.2 |
| Overlap rule | **Top layer wins the key it owns; lower layers dim.** Not stripes. §2.4 |
| A selected chord | **Pushes over the scale, keeping it visible.** The user's call, 2026-08-03. Replacing the scale becomes the *option* (`hideBelow`), not the default. §8.1 |
| `pressedKey` | **Not a layer.** Transient input feedback, orthogonal to the stack, must survive every stack render. §2.5 |
| Where it lives | **New `src/visualization/`** — it is neither the fretboard's nor the piano's; both are renderers. §4 |
| Migration | **Strangler, not big bang.** The stack becomes the source of truth one producer at a time; §6's order is load-bearing. |

## Status

| Step | State | Notes |
|---|---|---|
| 8a — `stack.js` + tests, no renderers | **done** 2026-08-03 | Pure. 59 tests in `src/visualization.test.js` (124 total). Two deviations, both §6's step 8a records: base/overlays as separate fields, and `hideBelow` |
| 8b — Piano renderer, scale as a base layer | **done** 2026-08-03 | 17-check Playwright run, output proved identical against the stashed tree. `src/piano/labels.js` retired. §6.2 |
| 8c — Fretboard renderer behind the same API | **done** 2026-08-03 | Marker-level parity with `markScale` asserted across 3 scales × 2 label modes, and mutation-checked. Still uncalled. §6.3 |
| 8d — Move the Roman-numeral + chord-grid producers onto push/pop | **done** 2026-08-03 | `restoreFretboardState`, `isInHoverState`, both Sets and 3 of the 4 ladders deleted. 16-check interaction run. §6.4 |
| 8e — Chord superimposition on the piano (the original step 8) | **done** 2026-08-03 | `PIANO_VIEW_PLAN.md` step 8 is complete. §6.5 |
| 8f — Wire the hover sources that never worked | **done** 2026-08-03 | `highlightKeysForScales`, `keys_chords` and their `getElementByMIDI` retired. 9-check run. §6.6 |

---

## 1. What exists today

### 1.1 There is no "current display" — there are six flags and a ladder

`fretboardState` (`src/fretboard/state.js:41-55`) carries six fields that
between them *imply* what is on screen. No field holds it.

| Field | Meaning | Written by |
|---|---|---|
| `currentDisplayedChord` | `null` = nothing, `0` = scale, `1..7` = Roman numeral | the Roman-numeral click handler, `ui/controls.js:1284-1305` |
| `currentChordGridSelection` | `{note, chordType}` or `null` | the chord grid's click handler, `ui/chordGrid.js:281` |
| `isInHoverState` | "the thing on screen is temporary" | set true on hover-enter, false on leave and on click |
| `fretboardsShowingScale` | Set of container ids | **`markScale` itself**, `Fretboard.js:890` |
| `fretboardsShowingChords` | Set of container ids | `showScaleOnFretboard`, `:568` |
| `chordFingeringShapes` + `selectedFingeringTabIndex` | which shape of the displayed chord is rendered | `showChordOnFretboard`, `showChordPatternOnFretboard` |

Restoring after a hover is `restoreFretboardState()`
(`src/fretboard/index.js:437-462`), an if/else ladder over three of those
flags that **re-runs the producer**:

```
currentChordGridSelection ? showChordPatternOnFretboard(...)
: currentDisplayedChord === null ? clearMarkers + clearChordLines + clearFingeringTabs
: currentDisplayedChord === 0   ? showScaleOnFretboard()
:                                  showChordOnFretboard(n - 1)
```

The same ladder is open-coded a second time in `refreshFretboardDisplay`
(`:286-298`), a third time in the label-mode `change` handler
(`ui/controls.js:1208-1214`), and a fourth, differently, inside
`updateFretboardsForScaleChange` (`:667-700`). Four copies, already
divergent: only one of them clears the fingering tabs.

**Consequences that are not obvious until you try to add a source.**

- Every producer must also be a *restorer*. `showScaleOnFretboard` begins
  with `clearMarkers` + `clearChordLines` + `clearFingeringTabs` (`:557`)
  because it cannot know what it is replacing.
- A renderer mutates global tracking state: `markScale` adds to
  `fretboardsShowingScale` (`Fretboard.js:890`), `clearMarkers` deletes from
  it (`:667`) — but only when `isUpdatingFretboards` is false. Drawing and
  bookkeeping are the same call.
- Hover is a *boolean*, so hovers cannot nest and the second hover source to
  fire wins silently.
- Only "scale" and "chord" are expressible. Anything else — a fingering
  preview from a mini fretboard, a single note, an instrument range — has no
  flag, so it has nowhere to be remembered.

### 1.2 The piano has none of this, and that is the immediate blocker

`Piano.js` has exactly one content writer, `showScale` (`:132`), and one
remembered layer, `piano.scale` (`:88`), which exists so a range re-render
can repaint itself. There is no chord path at all.

Step 8 as `PIANO_VIEW_PLAN.md` §6 wrote it — "chord superimposition, driven
from the chord grid and the Roman-numeral buttons" — therefore means adding
`piano.chord`, a second remembered layer, plus a seventh `fretboardState`
flag to know whether to restore it, plus a fifth copy of the ladder to
restore it *with*. **That is the work this plan exists to not do.**

### 1.3 The feature was attempted in 2019 and is still in the tree, dead

`highlightKeysForScales` (`src/scales/index.js:98`) adds `highlightedKey` to
keyboard elements. It has **ten live call sites** — nine in
`ui/rootNoteTable.js` (`:462, :495, :526, :572, :604, :634, :704, :736,
:766`), one in `ui/scaleTable.js` (`:490`) — and every one of them is a
hover handler. `scaleTable.js:531-538` is the shape in miniature: on
`mouseleave` it re-derives the *selected* scale's notes and re-highlights
them. Push on enter, pop on leave, hand-rolled.

None of it renders, for the reason `PIANO_VIEW_PLAN.md` §1.3 documents: it
queries `[midi="N_scale"]`, an attribute namespace nothing has ever carried.
It is dead for a *selector* reason, not a design reason. **The design was
right and is what this plan builds.**

The dead CSS says the same thing even more plainly (`src/index.css:219-280`):

| Class | Role it encodes |
|---|---|
| `.scaleKey` | the persistent base layer |
| `.highlightedKey` | a layer pushed on top of it |
| `.scaleKey.highlightedKey` | both at once, striped |
| `.pressedKey` | input state, striped against *either* |

A two-layer stack with an explicit overlap rule, written in CSS in 2019,
with no code that ever pushed the second layer. §2.4 revisits the striping
decision deliberately rather than inheriting it.

### 1.4 What is already right and must be reused

| Piece | Where | Why it matters here |
|---|---|---|
| The `'C'` vs `'C/4'` periodic/specific convention | `Fretboard.markNote` `:898`, `geometry.js:148-171`, `PIANO_VIEW_PLAN.md` §5.1 | The layer payload. Do not invent a flag |
| Semitone → colour/label | `theory/intervals.js` | Both renderers already use it (`labels.js`, `markScale` since step 5) |
| Enharmonic-safe matching via MIDI pitch class | `piano/labels.js:31` | The comparison every layer merge needs |
| Fingering → sounding pitches | `getChordVoicingNotes`, `src/fretboard/index.js:317` | Turns a fretboard shape into a piano layer. §5.2 |
| `'scaleChanged'` CustomEvent | `src/scales/index.js:193` | How the base layer refreshes. **Not** `window.updateFretboardsForScaleChange`, which `REFACTOR_PLAN.md` Phase 5 exists to delete |
| `addInteractiveEvent(el, 'enter'\|'leave', fn)` | `Fretboard.js:73` | The repo's hover-binding convention, mouse + touch. Every §6 step-8f source uses it |
| One-mutable-state-object rule | `REFACTOR_PLAN.md` §2.3 rule 2 | The stack is state; it gets an object, not exported `let`s |

---

## 2. The model

### 2.1 A stack of layers, bottom-first

```js
visualizationState.layers = [
  { id: 'scale',       … },   // base — the active scale, always present
  { id: 'chord-hover', … }    // transient — pushed on enter, popped on leave
];
```

Index 0 is the base and is replaced, never popped. Everything above it is
pushed by a source that is responsible for popping it. Ids are unique: a
push with an existing id replaces that layer in place rather than stacking a
duplicate, so a source that fails to pop cannot leak more than one layer.

### 2.2 Layer shape

```js
{
  id: 'chord-hover',          // unique, the pop handle
  label: 'E minor',           // for the chord-info panel; optional
  notes: [                    // PIANO_VIEW_PLAN.md §5.1, unchanged
    { note: 'E',   color: '#…', label: 'R',  isRoot: true },
    { note: 'G/3', color: '#…', label: 'm3' }
  ],
  positions: [ { string, fret, note, intervalLabel, isRoot, finger } ],
  dimBelow: true,
  transient: true
}
```

- **`notes`** is the portable payload. `'E'` = that pitch class in every
  octave; `'E/3'` = that one pitch. Both renderers understand it.
- **`positions`** is a fretboard-only enrichment: a *fingering* is a set of
  (string, fret) pairs and is not derivable from a note list. When present
  the fretboard renders it instead of `notes`; the piano ignores it and
  renders `notes`. §5.2 covers producing both halves from one shape.
- **`dimBelow`** is the user-facing flag from the brief: everything under
  this layer renders dimmed.
- **`hideBelow`** is its stronger sibling, added in 8a once a selected chord
  became a push rather than a replace (§8.1): "show this instead of what is
  under it" has to stay expressible, and expressing it as a *flag* rather
  than as "replace the base" keeps the scale one `hideBelow: false` away.
- **`transient`** marks a layer that must never survive a base change —
  a hover preview is stale the moment the scale moves.

`color` and `label` stay per-note rather than per-layer because that is
already true of every producer in the codebase: `markScale` colours each
note by its own semitone, `renderFingeringShape` cycles four colours across
positions (`ui/chordGrid.js:626`).

### 2.3 Operations

```js
setBaseLayer(layer)   // replace index 0; drops every transient layer above it
pushLayer(layer)      // add or replace by id
popLayer(id)          // remove by id; no-op if absent
clearTransient()      // pop everything above the base
getLayers()           // bottom-first, for renderers
subscribe(cb)         // renderers attach here
```

Every mutation notifies subscribers once, synchronously. Renderers are pure
functions of the layer list — they never read `fretboardState`.

`popLayer` being a no-op when absent is what makes a `mouseleave` that fires
without its `mouseenter` (tab switch, element removed mid-hover) harmless.
The current code has no such guarantee: a stray `restoreFretboardState()`
re-runs a producer.

### 2.4 Flattening and dimming

Bottom-first, later wins:

1. Walk the layers bottom to top, accumulating a map keyed by **MIDI pitch
   class for periodic notes, MIDI number for specific ones**. A later layer's
   entry replaces an earlier one for the same key.
2. Record, per entry, the index of the layer that produced it.
3. Let `topDim` be the highest index with `dimBelow: true`. Any entry from a
   layer below `topDim` renders dimmed.

**Overlap is winner-takes-all, not striped.** The dead CSS stripes
`.scaleKey.highlightedKey`, which shows both hues in one key — right when
the two layers mean unrelated things, wrong here: a chord tone *is* a scale
tone, and striping it against its own scale colour reads as a conflict where
there is none. Winner-takes-all also degrades correctly on the fretboard,
which has no equivalent of a striped marker.

`hideBelow` drops the hidden layers' entries entirely rather than marking
them, so a renderer cannot forget to skip them.

Dimming is a render concern, expressed per renderer:

| Renderer | Dimmed looks like |
|---|---|
| Piano | a `dimKey` class alongside `scaleKey`; `filter: saturate(0.35) brightness(0.75)`, so it stays the *same hue*, just recessed. One CSS rule, no second colour variable |
| Fretboard | the existing marker, at reduced border width and `opacity ~0.4`, label kept. `markFret` already takes `borderWidth`/`size` options (`Fretboard.js:683-695`); this needs an `opacity` option added |

Keeping the hue and changing only its intensity is the point: the scale must
still be *readable* underneath, or `dimBelow` is just "hide".

### 2.5 What is deliberately not a layer

- **`pressedKey`.** Live input feedback, on its own CSS class and its own
  fixed colour (`index.css:118-120` states the reasoning). The stack renderer
  must only add and remove classes it owns — `scaleKey`, `rootKey`, `dimKey`,
  `highlightedKey` — so a key held down survives a re-render. `PIANO_VIEW_PLAN.md`
  §8.1's `syncPianoKeyState` reapplication already covers the *range* re-render;
  this is the same invariant for the *content* re-render, and 8b's test asserts it.
- **Chord lines** (`drawChordLine` / `clearChordLines`). A separate SVG
  overlay with its own keyed lifecycle, used by the progression view. Out of
  scope; the fretboard renderer leaves it alone. Revisit only if 8d's
  fingering layers need connecting lines.
- **Mini fretboards and mini pianos.** §3.4.
- **The instrument-range overlay** (`PIANO_VIEW_PLAN.md` step 9). It is a
  property of the *keys*, not a highlight, and it must show under everything
  including an empty stack. Renderer-level, not a layer — decided here so
  step 9 does not have to relitigate it.

---

## 3. The seams

### 3.1 Two display languages, one stack

The fretboard maps one pitch class to ~4 positions; the piano maps it to one
key per octave. A pitch class is the common currency and both already speak
it. Where they diverge is the chord case, and the divergence is real, not
incidental:

| | Fretboard | Piano |
|---|---|---|
| A scale | every position of every scale pitch class | every key of every scale pitch class |
| A chord | **one fingering** — specific (string, fret) pairs, chosen by `buildFingeringShapes` | the chord's sounding pitches, specific octaves |

So a chord layer carries both: `positions` for the fretboard, `notes` (in
`'E/2'` specific form) for the piano, produced from the same shape. §5.2.

### 3.2 The base layer's owner

The base is the *persistent selection*: the active scale by default, or a
clicked chord. That is `currentDisplayedChord` and
`currentChordGridSelection` today. Those two fields survive 8d, demoted to
what they actually are — a record of which button is active, for button
styling — while the *display* consequence moves to `setBaseLayer`.
`isInHoverState`, `fretboardsShowingScale` and `fretboardsShowingChords`
do not survive. §6 step 8d's migration table.

### 3.3 Scale changes

The base layer is rebuilt from `'scaleChanged'`, joining the piano's existing
listener (`src/fretboard/index.js:720`). `setBaseLayer` dropping transients
(§2.3) is what makes "the scale changed while a chord was hovered" correct
by construction — `updateFretboardsForScaleChange:669` currently special-cases
exactly that with an `isInHoverState` check.

**Do not extend `window.updateFretboardsForScaleChange`.** 17 references,
`REFACTOR_PLAN.md` Phase 5 deletes it. The stack subscribes to the event, so
this plan costs Phase 5 nothing and shrinks the ladder Phase 5 has to
untangle.

### 3.4 Mini fretboards and mini pianos are sources, not targets

There are three families of small renderer — `MiniPiano.js`'s SVG pianos
(`progression/chordCard.js:37`, `scales/ui/scaleTable.js:501`),
`createScalePositionMiniFretboard` (`ui/scalePositionGrid.js:132`), and the
progression cards' mini fretboards (`progression/chordCard.js:576`). Each
renders one fixed thing and is self-contained.

**They render their own content and push onto the main stack on hover. They
never subscribe to it.** Otherwise every card in a progression would repaint
on every hover anywhere, and the multi-instance bookkeeping that
`fretboardsShowingScale` exists for comes straight back.

This is the boundary that keeps the refactor from sprawling. State it in
`src/visualization/index.js`'s header.

---

## 4. Proposed layout

```
src/visualization/
  stack.js        pure: visualizationState + setBaseLayer/pushLayer/
                  popLayer/clearTransient/getLayers/subscribe.
                  No DOM, no app state, no imports from fretboard/ or piano/
  flatten.js      pure: layers -> resolved entries
                  { pitchClass|midi, color, label, isRoot, dimmed, layerIndex }
                  Enharmonics collapse through MIDI, per piano/labels.js:31
  layers.js       pure builders: scaleLayer(scaleNotes, root, labelMode),
                  chordLayer(shape, …), noteLayer(notes, color). The only
                  place that knows what a "scale layer" looks like
  index.js        barrel + the §3.4 boundary in its header
```

Renderers live with their renderer, not here:

- `src/piano/Piano.js` gains `renderStack(entries)`; `showScale` becomes a
  thin wrapper over `setBaseLayer(scaleLayer(...))` and is then deleted in 8d.
- `src/fretboard/Fretboard.js` gains `renderStack(entries, layers)` — it needs
  the raw layers too, for `positions`.
- Subscription wiring lives in `src/fretboard/index.js`, which already owns
  both objects (`refreshPianoScale`, `setMainViewMode`) and is already the
  file that knows about `src/scales/`.

Header comments per `REFACTOR_PLAN.md` §2.4; `chordFingering.js:1-7` is the
standard.

**`flatten.js` is the file to get right first.** It is pure, it is where
every ordering and dimming bug will live, and it is testable without a DOM —
the same argument `PIANO_VIEW_PLAN.md` §6 made for `keyModel.js`, which held.

---

## 5. Chord superimposition — the original step 8

### 5.1 On the fretboard

Already works. `renderFingeringShape` (`ui/chordGrid.js:617`) draws the
picked shape. 8d re-expresses it as a layer without changing what is drawn:
`positions` carries exactly what that function already iterates, and the
renderer keeps its colour cycle and dashed/solid known-shape distinction
(`:626-639`). **8d must not change fretboard output** — it is a
restructuring step, `REFACTOR_PLAN.md` §2.1's rule applies to it even though
this plan as a whole is a feature.

### 5.2 On the piano

New, and the one genuinely new piece of theory wiring — except it isn't:

```js
bestShape.positions.map(p => fretboard.getNoteAt(p.string, p.fret))
// -> ['E/2','B/2','E/3','G#/3','B/3','E/4']
```

which is `getChordVoicingNotes` (`src/fretboard/index.js:317`) minus its
final `.replace('/', '')` — that function already resolves the *displayed*
shape to sounding pitches, for playback. Extract the shared middle; do not
copy the shape-picking, which is the only place that knows which shape is on
screen.

Two consequences worth stating before they are discovered:

- **The piano shows the fingering's real octaves.** A guitar E-minor shape
  lights E2 through E4 — six keys, some doubled, not a tidy root-position
  triad. That is correct and is the point (it is what the guitarist is
  actually playing), but it *will* look wrong to someone expecting a triad,
  and at the default three-octave range from C2 part of it may sit off the
  keyboard. Accept it, and note that `PIANO_VIEW_PLAN.md` §8.2's "fit to
  instrument" action is the escape hatch.
- **Chords with no playable shape.** `buildFingeringShapes` can return
  nothing (`index.js:417` handles it). The piano layer then falls back to the
  chord's pitch classes, periodic — a real display, not a blank.

---

## 6. Build order

One commit per step; tests green, no new build warnings, `ARCHITECTURE.md`
updated (`REFACTOR_PLAN.md` §2.2).

**8a — `stack.js` + `flatten.js` + `layers.js` + unit tests. Pure, no DOM,
nothing calls them.** Test: push/pop/replace-by-id, pop of an absent id,
`setBaseLayer` dropping transients, later-layer-wins on an overlapping pitch
class, `dimBelow` marking exactly the layers below it, enharmonic collapse
(`Gb` layer over an `F#` layer is one entry), and periodic-vs-specific
(`'E'` covers `'E/4'`, `'E/4'` does not cover `'E/5'`). This is the step
where a bug stays invisible until everything sits on it.

### 6.1 How 8a landed (2026-08-03)

Done as written, 59 tests, no new build warnings. Four things worth carrying
forward:

**Base and overlays are separate fields, not one array with the base at
index 0** (§2.1 described the latter). With one array, "the base is replaced,
never popped" is a *convention* that `pushLayer` and `popLayer` each need a
guard to uphold, an overlay whose id collides with the base is a silent trap,
and "no base at all" — a real state today, `currentDisplayedChord === null` —
needs a sentinel. With two fields every one of those is structural.
`getLayers()` still presents one bottom-first list, which is all a renderer
ever sees, so nothing downstream knows the difference. `stack.js`'s header
records this.

**`transient` defaults to true, and `transient: false` is what "pinned"
means.** That fell out of §8.1's answer: a chord selected (not hovered) is an
overlay that must outlive a scale change. So `setBaseLayer` drops only the
transient ones. No extra concept was needed for the pinned case — it is one
flag on a layer that already existed.

**`hideBelow` was added here**, for the same reason (§2.2).

**A no-op does not notify.** `popLayer` of an absent id, `clearTransient`
with nothing transient, a push of an invalid layer — all return `false` and
leave subscribers alone. This is the property that makes hover handlers safe
to write, and it is asserted directly rather than left implicit.

**`layers.js` duplicates `piano/labels.js` for exactly one step.**
`buildScaleKeyStyles` and `getKeyLabel` compute a scale's colours and labels
in the piano's own shape; `scaleLayer` computes them in the stack's. 8a could
not delete them without touching `Piano.js`. **8b must**, and both file
headers say so — if that duplication survives 8b, it is a bug.

**8b — Piano renders the stack.** `Piano.renderStack`, subscribed in
`src/fretboard/index.js`; `refreshPianoScale` becomes `setBaseLayer(scaleLayer(…))`.
Adds the `dimKey` CSS rule. **Piano first, deliberately**: it has exactly one
content writer today (§1.2), so this step is a swap rather than an untangle,
and it puts a working stack on screen before any fretboard risk. Verify with
a pushed dummy layer from the console and assert a held computer key stays
lit across a push (§2.5).

### 6.2 How 8b landed (2026-08-03)

Done as written. The piano's rendered output is **byte-identical** to before
the swap — dumped every lit key's classes, `--scale-key-color` and label,
ran the same script against the stashed pre-change tree, and diffed: 0
differing keys across note mode, interval mode and back. On that tree 16 of
the 17 checks pass and the only failure is the `dimKey` rule, which is
precisely what this step adds. §2.3 lesson 8 used to confirm a *non*-change.

**`renderStack` is the piano's whole content API now.** `showScale`,
`clearScale` and `piano.scale` are gone; `piano.resolved` holds the last
flattened stack so a range re-render repaints itself. `Piano.js` still
imports nothing from `src/visualization/` — `src/fretboard/index.js`
subscribes it, the same division that already keeps `midi.js` and
`keyboard.js` out of that folder.

**`src/piano/labels.js` is deleted**, as 8a promised. Its coverage moved to
`visualization.test.js` rather than being dropped; `piano.test.js` says so
where the two `labels:` blocks used to be. `refreshPianoScale` became
`refreshScaleLayer` — it sets the base layer now, and the old name described
a third of what it does.

**`setMainViewMode` stopped repainting on the way in.** The piano renders
every stack change whether it is the visible view or not, so "it may have
gone stale while hidden" is no longer a case that exists.

**The near-miss worth generalizing: a CSS transition makes `getComputedStyle`
lie.** The keys carry a blanket `transition: 0.25s`, so `filter` *animates*.
Reading the computed style synchronously after adding `dimKey` returns frame
zero, and a transition out of `filter: none` starts at the identity
`saturate(1) brightness(1)` — a value that is neither `none` nor the target.
The first assertion ("did the filter change?") passed against a rule that
could have said anything. Settle first, then assert the exact declared value.
This is §2.3 lesson 10's shape applied to CSS rather than to handlers: the
static read is not the thing you care about.

**Two pieces of dead wiring found in passing**, both relevant to 8f and
neither touched here:

- **`#prevRootBtn` / `#nextRootBtn` / `#prevScaleBtn` / `#nextScaleBtn` do
  not exist anywhere in the repo.** `src/scales/index.js:236-470` attaches
  click and hover handlers to all four, twice over. Verified by grep across
  `src/`, `public/` and every `.html`/`.js`/`.css` outside `node_modules`.
  ~~Those hover handlers are among `highlightKeysForScales`'s ten call
  sites~~ — **wrong, corrected in 8f: they are not.** Those handlers call
  `navigateTo…` and `updateCurrentScaleDisplay`, never
  `highlightKeysForScales`. Two unrelated pieces of dead wiring that happen
  to sit in the same file, and 8f did not shrink because of it. The
  phantom-button handlers are still there, still their own cleanup.
- **The Roman-numeral buttons and the `Labels` select live in the Other
  Controls tab panel**, which is `display: none` until that tab is opened.
  Worth knowing before 8f wires hover sources: they are not reachable by a
  click until the tab is open, and any Playwright check has to open it first.

**8c — Fretboard renders the stack, alongside its existing path.** `renderStack`
+ the `opacity` option on `markFret`. Nothing calls it yet; `markScale` and
`renderFingeringShape` still run the show. Screenshot-compare a
stack-rendered scale against a `markScale` scale — identical output is the
pass condition.

### 6.3 How 8c landed (2026-08-03)

Done as written, and still called by nothing: `markScale` and
`renderFingeringShape` remain the live path.

**Parity is asserted structurally, not by screenshot.** The plan said to
screenshot-compare; comparing the `markers` map is strictly better and is
what landed. That map holds every styling option each marker was built from,
so a divergence names the field instead of being something to spot by eye
(§2.3 lesson 9). Asserted across three scales — C major, E aeolian for
sharps, B♭ major for flats — in both label modes, six tests, and **the
markers come out identical in all six**. That covers the thing most likely
to have diverged: `markScale` labels from `notationTranslateNotes`'s output
while `scaleLayer` keeps `getScaleNotes`'s spelling verbatim, and the two
agree.

**The parity test was mutation-checked.** Changing one number in
`renderStack` (a non-root border from 3 to 2) fails all six. Worth the two
minutes after step 8b shipped a CSS assertion that passed against a value it
should have rejected.

**`calculateMidi` extracted in `geometry.js`.** `calculateNote` already
computed the MIDI number and threw it away after spelling the note — the
same shape as `PIANO_VIEW_PLAN.md` step 5's `getSemitoneFromRoot`
extraction, and taken for the same reason: the stack keys on MIDI numbers,
and re-deriving one by parsing `calculateNote`'s *output* would round-trip
through a spelling decision it has no reason to depend on. `calculateNote`
now calls it, so there is one implementation. This touches the hottest
function on the fretboard, so it got a browser check on top of the unit
tests.

**`markFret` gained an `opacity` option**, defaulting to 1 - so every
existing call site is untouched - and emitting nothing at all unless it is
set.

**Fingering `positions` are deliberately NOT rendered yet.** §2.2 defines
them and §5.1 says 8d re-expresses `renderFingeringShape` without changing
what it draws. Building the renderer half a step early would mean guessing
the producer's shape; 8d moves both together against that function's real
output. `renderStack`'s header says so at the definition site.

**One thing 8d inherits:** `renderStack` calls `clearMarkers`, which still
deletes from `fretboardState.fretboardsShowingScale` (`Fretboard.js:666`).
Harmless while nothing calls `renderStack`, and it disappears with the Set
in 8d - but it is the one place the new renderer still touches the old
bookkeeping.

**8d — Move the producers over. The load-bearing step.**

| Today | After |
|---|---|
| `showScaleOnFretboard()` | `setBaseLayer(scaleLayer(…))` |
| `showChordOnFretboard(i)` / `showChordPatternOnFretboard(n, t)` | build the shape, `pushLayer(chordLayer({transient: false, dimBelow: true, …}))` — **over** the scale, not replacing it (§8.1) |
| the same three, with `isTemporary: true` | `pushLayer({…, transient: true, dimBelow: true})` |
| `restoreFretboardState()` | `popLayer(id)` — **deleted** |
| `isInHoverState` | **deleted** |
| `fretboardsShowingScale` / `fretboardsShowingChords` | **deleted** — the stack is the tracking |
| `markScale`'s write to `fretboardsShowingScale` (`Fretboard.js:890`) | **deleted** — drawing stops doing bookkeeping |
| `currentDisplayedChord`, `currentChordGridSelection` | kept, demoted to button-styling state (§3.2) |
| the ladder's 2nd/3rd/4th copies (`index.js:286`, `controls.js:1208`, `index.js:667`) | gone — each becomes a `setBaseLayer` |

Grep every deleted field across all of `src/` before deleting it
(`REFACTOR_PLAN.md` §2.3 rule 6). `fretboardsShowingScale` in particular is
read in `Fretboard.js`, `index.js` and `progression/`.

### 6.4 How 8d landed (2026-08-03)

**One commit, not two, and the plan was wrong to ask for two.** §6 said to
restructure with identical output first and flip the behaviour after. That
sequence cannot be built: reproducing "a chord replaces the scale" on a
*shared* stack means `hideBelow: true`, and since the piano has no chord
layer until 8e, the intermediate commit would have shown a **blank keyboard**
whenever a chord was selected — a regression invented purely to preserve the
two-step, and undone immediately. The destination was already decided (§8.1),
so 8d went straight there.

The safety net moved rather than disappeared: `buildFingeringPositions`
(extracted from `renderFingeringShape`) is now the only place that decides
what a chord's markers look like, and both the stack and the old direct path
went through it — so the chord markers are identical *by construction*, which
the before/after screenshots confirm (same frets, same colours, same labels;
only the scale underneath changed). 8c's parity tests already covered the
scale markers.

**What actually got deleted.**

| Gone | Was |
|---|---|
| `restoreFretboardState` | a 25-line re-derivation, called from two hover sites |
| `isInHoverState` | a boolean that could not represent two hovers |
| `fretboardsShowingScale` / `fretboardsShowingChords` | Sets that drawing code registered *itself* in |
| 3 of the 4 ladder copies | `refreshFretboardDisplay`, the label-mode handler, and `updateFretboardsForScaleChange`'s two-Set walk |
| `renderFingeringShape` | nothing left in it once its middle was extracted |

One ladder survives, as `reapplySelection`, and it is genuinely needed: a
Roman-numeral chord's *notes* depend on the scale, so a scale change has to
rebuild it.

**`Fretboard.js` no longer imports `fretboardState` at all.** Not a goal, but
the clearest measure of the change: the only reason the renderer knew about
application state was to register itself in those two Sets from inside the
render. With the Sets gone, drawing and bookkeeping stopped being the same
call, and the class now draws what it is told and nothing else.

**Two ids, not one.** A selected chord (`'chord'`, pinned) and a hovered one
(`'chord-hover'`, transient) must be separate, or hovering while something is
selected would replace the selection and leaving would pop it. That
distinction is exactly what `restoreFretboardState` hand-rolled by
re-deriving the selection from flags.

**Hovering the Scale button pushes the scale *again*, with `hideBelow`.**
It reads oddly until you see why: the scale is always the base layer, so
"preview the scale alone" is not about adding it, it is about hiding the
chord on top - and `hideBelow` on a pushed copy does that for exactly as long
as the pointer is there, with nothing to remember on the way out.

**The position-picker tabs went through the stack too**, which the plan did
not mention. They called `renderFingeringShape` directly, so after 8d they
would have drawn markers the next stack change wiped. `showFingeringShape`
re-pushes the *live* chord layer with new positions, copying it rather than
rebuilding it so id, label, root and transience cannot drift.

**Verified** with a 16-check Playwright run driving the real handlers: hover
leaves the scale dimmed underneath and the chord undimmed; leaving restores
the neck *exactly* (byte-compared marker dumps); five hovers in a row leak
nothing; hovering while a chord is selected and then leaving restores the
**selection**, not the bare scale; the selection survives a label-mode
change; clicking the active button off leaves the bare scale; the chord grid
behaves the same; and the piano dims off the same stack. 123 tests, 34
warnings unchanged, zero page errors.

One check initially "passed" because a `.catch(() => {})` swallowed a hover
that could not happen (wrong tab open) - fixed rather than accepted. Third
step running, third time a green check needed checking.

**Known gap, and it is 8e's:** on the piano a hovered chord currently dims
the whole scale and puts nothing on top, because chord layers carry
`positions` (fretboard-only) and no `notes` yet. Correct-but-incomplete, and
one field away from finished.

**8e — Chord superimposition on the piano (§5.2).** The original step 8, and
by now a layer builder plus a call site. This is where `PIANO_VIEW_PLAN.md`
step 8 can be marked done.

### 6.5 How 8e landed (2026-08-03)

Small, as 8d predicted: chord layers already carried `positions`, and this
adds `notes`. The whole step is `getShapeSoundingNotes` - the shared middle
§5.2 identified inside `getChordVoicingNotes`, which was already resolving a
displayed fingering to its sounding pitches for the synth and then stripping
the `/`. The synth wants to *play* what is shown; the piano wants to *light*
it. One function, two callers, and `getChordVoicingNotes` is now that plus
`.replace('/', '')`.

**The piano shows the fingering's real octaves, doublings included.** Hovering
V in E Aeolian lights B2, F♯3, B3, D4, F♯4 - five keys across three pitch
classes, because the guitar shape doubles B and F♯ an octave apart. F♯2 stays
dimmed: it is in the scale but not under anyone's fingers. §5.2 warned this
"will look wrong to someone expecting a triad"; seen on screen it reads as
the point of the feature rather than a defect.

**A bug caught by writing the change, not by running it.** 8d's
`showFingeringShape` rebuilds the live chord layer when the position picker
changes; adding `notes` meant it had to rebuild those too, and the obvious
`{...layer, notes: soundingNotes}` would have assigned **raw note names where
resolved objects belong** - a layer that renders nothing, from a code path
only reachable by clicking a position tab. Fixed by rebuilding through
`chordLayer` instead of spreading, which required layers to remember their
own `rootNote` and `labelMode`. There is now a unit test for exactly that
round-trip.

**Verified** with a 7-check Playwright run: the chord lights specific
undimmed keys, the scale stays visible dimmed underneath, the lit keys are
specific pitches rather than every octave, a doubled pitch class lights more
than one key, and leaving restores the piano exactly. 124 tests, 34 warnings
unchanged, zero page errors.

**8f — Wire the sources that never worked.** Hovering a chord-grid cell, a
Roman-numeral button, a mini piano, a mini fretboard, a scale-table cell or a
root-note cell pushes a `dimBelow` layer and pops it on leave, via
`addInteractiveEvent`. Retire `highlightKeysForScales`, `keys_chords` and
their `getElementByMIDI` (`src/scales/index.js:60-120`) — its ten call sites
become pushes, which is the cleanup `PIANO_VIEW_PLAN.md` §1.3 left
outstanding, now with somewhere to land.

### 6.6 How 8f landed (2026-08-03)

**The 2019 feature renders.** `highlightKeysForScales` had **twelve** call
sites, not the ten §1.3 counted (nine in `ui/rootNoteTable.js`, **two** in
`ui/scaleTable.js`, and one in `scales/index.js` itself). Eleven were hover
previews in a single uniform shape - compute the hovered scale's notes and
highlight them on enter, recompute the *selected* scale's notes and
re-highlight those on leave. Push and pop, hand-rolled, against a keyboard
that never existed. They are now `pushScalePreview` / `popPreviewLayer`.

The twelfth, in `updateCurrentScaleDisplay`, was not a preview at all: it
highlighted the newly selected scale, three lines above the `'scaleChanged'`
dispatch that already tells the stack to rebuild its base layer. It was
deleted rather than converted - it was the third mechanism for one job, and
the only one that never worked.

`highlightKeysForScales`, `keys_chords` and this file's own
`getElementByMIDI` are **gone**, and with them `src/scales/index.js`'s import
of `src/midi.js`: **the scales module no longer touches the DOM keyboard at
all.** That also retires the module-evaluation-order constraint
`ARCHITECTURE.md` §6.27 recorded, which existed only because `keys_chords`
resolved elements at import time.

**A correction to §6.2.** That section claimed the phantom nav buttons'
handlers were among `highlightKeysForScales`'s call sites, so 8f would partly
be deleting handlers for buttons that were never built. **They are not** -
verified by grep. Two unrelated pieces of dead wiring in one file. The
phantom-button handlers survive, still their own cleanup, and 8f was no
smaller for it.

**`CHORD_HOVER_LAYER_ID` became `PREVIEW_LAYER_ID`.** With scale-table,
root-note, chord-grid and Roman-numeral sources all pushing previews, "chord
hover" was the wrong name. One preview id for all of them, deliberately: only
one thing is under the pointer at a time, so whichever fires last replaces
the previous preview rather than stacking on it.

**Two preview flavours, and the difference is the point.**

| Source | Flag | Why |
|---|---|---|
| scale table, root-note table | `hideBelow` | "what would *this* scale look like" - showing it against the current one would read as a chord over a scale, which it is not |
| chord grid, Roman numerals, card mini piano/fretboard | `dimBelow` | a chord *is* part of the scale under it, and seeing which scale tones it uses is the reason to look |

**Mini pianos and mini fretboards push, exactly as §3.4 requires** - the
progression cards' mini piano and mini fretboard now put their chord on the
main display on hover, and neither subscribes to the stack. `pushChordPreview`
strips octaves on purpose, the opposite of what a *selected* chord does
(§5.2 keeps a fingering's real pitches): the source is a mini piano showing
pitch classes in one octave, and lighting different keys from the thing being
hovered would read as a mismatch rather than as extra precision.

**Not wired, deliberately:** the Scale Position Grid's mini fretboards. Those
show scale *positions* - a region of the neck rather than a note set - which
is a layer kind the model does not have yet, and inventing one to finish a
step is how §3.4's boundary gets lost. The Scale Information panel's scale
piano is also left alone: it shows the scale that is already on the display,
so previewing it would do nothing.

**Verified** with a 9-check run over the newly live sources, plus re-running
8b's, 8d's and 8e's scripts unchanged as regression (17/17, 16/16, 7/7). Two
of the new checks initially failed on selectors, not on code: both tables
live in `#scaleControlsContainer` and have no ids, and indexing
`document.querySelectorAll('table')` instead picks up a zero-height table
from a closed tab.

8a-8c are independently useful and reviewable. 8d is the only step that
touches existing fretboard behaviour and must produce *identical* output.
8e-8f are additive.

---

## 7. Risks

- **8d is a four-copy ladder collapse across three files.** The copies have
  already diverged (only one clears fingering tabs, §1.1). Collapsing them
  will change behaviour *somewhere*; the question is where, and it should be
  a deliberate answer per divergence, written down, not absorbed silently.
- **`markScale` writing to `fretboardsShowingScale` guarded by
  `isUpdatingFretboards`** (`Fretboard.js:666`) is a re-entrancy guard around
  a bookkeeping side effect. Removing the side effect removes the reason for
  the guard, but `isUpdatingFretboards` is read elsewhere — check before
  assuming it goes too.
- **Mini renderers pushing on hover means hover handlers on elements that get
  rebuilt** (progression cards re-render on edit). A layer whose source
  element is destroyed mid-hover never pops. `popLayer`'s no-op-if-absent
  helps on the way out but not on the way in; 8f needs a `clearTransient()`
  on the re-render path of any source that rebuilds itself.
- **The progression view has its own display path** (`fretboardDisplay.js`)
  that calls `fretboard.displayChord` and `clearMarkers` directly, and reaches
  the scale through `window.showScaleOnFretboard` (`:128`) with a
  synthetic-`mouseenter` fallback (`:132-137`). It writes to the same
  fretboard, so it will fight the stack. **Decided — §8.2: it stays as the
  one documented legacy writer.** The risk does not go away, it is accepted;
  do not rediscover it in 8f and treat it as a regression.
- **`PIANO_VIEW_PLAN.md` step 9 (instrument range) lands after this.** §2.5
  settles its shape in advance so it does not arrive as a fourth kind of thing.

---

## 8. Decisions and what is still open

### 8.1 A selected chord pushes over the scale — decided 2026-08-03

The user's call, against this document's original recommendation, and it
changes 8d's shape rather than deferring a toggle: **push is the default
behaviour, and hiding the scale is the alternative option.** So a clicked
chord becomes a pinned overlay (`transient: false`) over the scale base,
`dimBelow: true`, and the scale stays readable underneath it. Replacing the
scale outright is `hideBelow: true` on the same layer — a setting, not a
different code path.

This is still a visible behaviour change (today the scale disappears when a
chord is selected) and still gets its own commit with before/after
screenshots inside 8d, per `PIANO_VIEW_PLAN.md` step 5's precedent. What
changed is which way round the default sits.

Consequences already absorbed in 8a: `transient` and `hideBelow` exist, so
8d only has to pick the flags. `setBaseLayer` keeps meaning "the scale
changed", which is now its only meaning.

### 8.2 The legacy fretboard writers — partly decided

The user's answer was conditional: *if* the display in question is the one
under the Other Controls tab, it can be legacied away as redundant. It is
not, and the distinction matters:

| Writer | Where | State |
|---|---|---|
| `buildDisplayControls`, `buildNoteMarkingControls`, `buildNoteSearchControls`, `buildChordPatternDemoControls` | Other Controls tab | **Already dead** — their `appendChild` calls were commented out before this work (`ui/controls.js:540-548`). Only `Clear All` / `Show All` are live |
| `progression/fretboardDisplay.js` | **Chord Progression tab** | **Live.** Calls `fretboard.displayChord` and `clearMarkers` directly, and reaches the scale through `window.showScaleOnFretboard` with a synthetic-`mouseenter` fallback (`:128-137`) |

So the redundant thing is already inert, and deleting it is a dead-code
cleanup on its own schedule, not part of 8d. The *live* second writer is the
progression one. **Default taken, pending a word otherwise: 8d documents it
as the one legacy writer and leaves it working; it does not move onto the
stack and it does not get deleted.** It writes to the same fretboard, so it
will visibly fight a pushed layer — that is a known, accepted limitation
until it is dealt with, not something to discover in 8f.

**A second live direct writer, found in 8d:** the `Show All Notes` button
(`ui/controls.js`) calls `fretboard.markAllNotes()`, which draws every note
on the neck outside the stack. Left as-is deliberately — "every note" is a
debugging view, not a layer anything stacks onto — and the next stack change
simply paints over it, which is a reasonable escape. Recorded so it is not
mistaken later for something 8d missed.

### 8.3 Still open

- **Does a clicked chord replace the base, or push over it?** — decided,
  §8.1.
- **Does the piano get the fingering-vs-pitch-class distinction visually?**
  The fretboard distinguishes known shapes from best-effort ones with
  solid/dashed borders (`ui/chordGrid.js:633`). The piano has no equivalent
  and probably should not invent one.
- **Layer count ceiling.** Nothing needs more than base + one hover today.
  A stack that permits ten is not more code, but a UI that produces three
  overlapping dimmed layers is unreadable. Suggest: allow any depth, dim only
  relative to the topmost `dimBelow`, and see whether anything ever pushes two.

---

## 9. Session kickoff prompt

**This plan is finished.** The prompt below is kept for the shape of it; if
you are starting a session now, use §10 instead.

<details>
<summary>The original kickoff prompt (steps 8a-8f)</summary>

```
Continue the unCAGED visualization stack.

Read VISUALIZATION_STACK_PLAN.md first, all of it. Section 1 is the
finding the plan rests on: there is no representation of what is on
screen, only six flags and a re-derivation ladder. The Status table
shows what's done; section 6 is the build order.

Then read PIANO_VIEW_PLAN.md sections 5.1 and 8, REFACTOR_PLAN.md
section 2 for the working rules and the lessons list (2.3 - read it
properly), and ARCHITECTURE.md for module contracts.

Three things that are easy to get wrong:
- The stack is the MAIN display only. Mini fretboards and mini pianos
  push onto it and never subscribe to it (section 3.4).
- pressedKey is not a layer (section 2.5).
- Do NOT re-survey the codebase; re-verify line numbers before acting.
```

</details>

**Verification.** `REFACTOR_PLAN.md` §2.2's tooling unchanged
(`npm test -- --watchAll=false`, `bash scripts/check-build.sh`, the
`run-app` skill), with two additions:

- 8a is pure and gets real unit tests, in `src/visualization.test.js`
  alongside `src/piano.test.js` — the ordering and dimming rules are exactly
  the kind of thing the repo's characterization tests are good at.
- 8b, 8d and 8f cannot be verified by a screenshot: push/pop only exists
  during interaction. Drive them with Playwright (`REFACTOR_PLAN.md` §2.3
  lesson 10) and assert the classes on specific `[midi="N"]` and
  `[data-string][data-fret]` elements — lesson 9's warning about fiddly
  selectors applies. **Assert the pop, not just the push**: leaking a layer
  on `mouseleave` is the failure mode this whole design exists to prevent,
  and it is invisible in a static capture.

---

## 10. Where things stand, and what is next

**Done, 2026-08-03, six commits** (`58a3ce1`, `a371be3`, `171a7af`,
`1a8769a`, `3f9e81c`, `e17a330`). 124 tests, 34 build warnings unchanged
throughout, zero page errors.

### 10.1 What exists now

| | |
|---|---|
| `src/visualization/` | `stack.js` (base + overlays, push/pop/subscribe), `flatten.js` (ordering, specificity, dim/hide), `layers.js` (`scaleLayer`/`chordLayer`/`noteLayer`), `index.js` |
| Renderers | `Piano.renderStack(resolved)` and `Fretboard.renderStack(resolved, layers)`. Neither imports the stack; `src/fretboard/index.js` subscribes both |
| Producers | all in `src/fretboard/index.js`: `refreshScaleLayer` (base), `pushChordLayer`, `pushScalePreview`, `pushChordPreview`, `popPreviewLayer`, `popChordLayers`, `showFingeringShape`, `reapplySelection` |
| Sources | Roman numerals, chord grid, scale table, root-note table, progression cards' mini piano and mini fretboard |

**The rules, in one line each.** Later layers win; specific beats periodic
only *within* a layer; `dimBelow`/`hideBelow` measure from the topmost layer
that sets them; an overlay is transient unless it says `transient: false`;
`pressedKey` is not a layer and survives every render.

### 10.2 Known gaps, all deliberate

- **The Scale Position Grid's mini fretboards do not push.** They show a
  *region* of the neck, not a note set — a layer kind the model does not
  have. §6.6.
- **Two live direct writers remain outside the stack**:
  `progression/fretboardDisplay.js` (the Chord Progression tab) and the
  `Show All Notes` button. Both paint over the stack and are painted over by
  it. §8.2.
- **The phantom nav-button handlers survive.** `src/scales/index.js:236-470`
  wires click and hover handlers onto `#prevRootBtn`, `#nextRootBtn`,
  `#prevScaleBtn`, `#nextScaleBtn`, none of which exist anywhere in the repo.
  Unrelated to this plan (see the correction in §6.6) and still its own
  dead-code cleanup.
- **`window.currentDisplayedChord`** (`src/index.js:29`) is a *snapshot copy*
  of `fretboardState.currentDisplayedChord` taken at module load;
  `progression/index.js:236` writes to it expecting an effect. It has none.
  Pre-existing, untouched, and squarely `REFACTOR_PLAN.md` Phase 5's business.

### 10.3 Re-runnable verification

The Playwright scripts live in `.tmp/` (gitignored, so they survive on disk
but not in the repo). Start the dev server first
(`bash scripts/dev-server.sh start`):

| Script | Asserts |
|---|---|
| `node .tmp/verify-8b.js .tmp/out.json` | piano renders the scale; `pressedKey` survives a repaint; the `dimKey` CSS |
| `node .tmp/verify-8d.js .tmp/out.json` | hover/pop on the neck, no leaked layers, selection restored after a preview |
| `node .tmp/verify-8e.js .tmp/out.json` | the chord's real sounding pitches on the piano |
| `node .tmp/verify-8f.js .tmp/out.json` | scale-table, root-note and mini-fretboard previews |

All four passed together at `e17a330`. If a future change breaks one, that is
signal, not flake — but check it against the previous commit before assuming
(`REFACTOR_PLAN.md` §2.3 lesson 8).

### 10.4 What to do next

**`PIANO_VIEW_PLAN.md` step 9 — the instrument-range overlay** — is the only
piece of the piano feature still outstanding, and §2.5 already settled its
shape: it is a **renderer-level property of the keys, not a stack layer**, so
it must show under everything, including an empty stack. `src/piano/range.js`
and its tests already exist from step 1. Start there.

Optional after that: `PIANO_VIEW_PLAN.md` step 10 (repoint `MiniPiano.js`
onto `keyModel.js`), which that plan's §3 says to judge on merit rather than
assume.

### 10.5 Kickoff prompt for a new session

```
Continue unCAGED. The visualization stack (VISUALIZATION_STACK_PLAN.md)
is COMPLETE - read its section 10 for what exists and what is next, and
sections 2 and 3 for the layer model, but do not re-plan it.

The next piece of work is PIANO_VIEW_PLAN.md step 9, the instrument
range overlay. Read that plan's section 8.2 (the design) and
VISUALIZATION_STACK_PLAN.md section 2.5 (why it is NOT a stack layer -
that is already decided, do not relitigate it).

Then read REFACTOR_PLAN.md section 2 for the working rules, the
verification tooling and the lessons list (2.3 - read it properly), and
ARCHITECTURE.md sections 6.29-6.31 for the piano and the stack.

Do NOT re-survey the codebase. Those docs record the file:line of every
piece involved. Trust them, but re-verify any specific line number or
count you are about to act on, since those drift. If you find something
that contradicts a doc, fix the doc as part of your work and say so.

Three things that are easy to get wrong:
- The range overlay is a property of the KEYS, not a layer. If you find
  yourself calling pushLayer for it, stop and re-read section 2.5.
- Two ranges must not be conflated: the piano's displayed octave range
  (user-chosen) and the instrument's playable range. PIANO_VIEW_PLAN.md
  section 8.2.
- A green check is not proof. This project shipped a CSS assertion that
  passed against the wrong value (a transition made getComputedStyle
  return frame zero) and a Playwright check that passed because a
  swallowed .catch() meant it never ran. Mutation-check anything
  load-bearing.

Then:
1. Tell me what you are starting and your first few moves. Wait for my
   go-ahead before editing anything.
2. Do only that step.
```
