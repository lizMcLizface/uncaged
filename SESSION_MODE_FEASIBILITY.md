# Session Mode — Feasibility Investigation

Target: a Rocksmith-style scale practice / session mode. Synthesized backing
(drums, bass, chords) at a chosen tempo, key and scale; the user plays along
on a real guitar; the app listens and gives feedback on whether what they
played fits the current context.

Constraints: no binary assets, must work as a static GitHub Pages site.

Verdict up front: **feasible, in stages.** The instrument and backing-track
half is straightforwardly achievable with what's already in the repo and
sounds better than you'd expect asset-free. The listening half is achievable
for single notes and approximate for chords, and is correctly treated as a
long-run goal.

Priority order (set 2026-08-01): **instrument voices first** — guitar, then
bass, then piano — then drum backing with bass on top, then input detection
last.

---

## 1. What already exists

More than I expected. This is not a from-scratch build.

| Piece | Where | Reusable as-is? |
|---|---|---|
| Absolute-timebase scheduler | `metronome.js` — `getTimeForBeat`, `getNextNoteTime`, `scheduleOnNextBeat`, lookahead `scheduler()` | Yes. This is the sequencer backbone. |
| Modular audio node library | `src/nodes/` — 19 nodes incl. Filter, EQ2, Distortion, Compressor, Reverb, LFO | Yes |
| Noise sources in AudioWorklet | `src/worklets/{white,pink,brown}-noise-processor.js` + `NoiseGenerator` | Yes — snare/hat/clap depend on these |
| Polyphonic synth voice engine | `PolySynth.jsx`, `playNotes(notes, volume, durationMs)` | Yes, via its imperative handle |
| Scale + chord theory | `scales.js`, `chords.js`, `chordPatterns.js`, `scaleGenerator.js` | Yes |
| **Real guitar fingerings** | `chordFingering.js` → `{string, fret, finger}` per voicing | **Yes — this is the key asset** |
| Progression sequencing | `progressionBuilder.js` + PolySynth's progression sequencer | Logic yes, timing no (see 3.2) |

`chordFingering.js` deserves special mention. It already computes which
string is fretted where for a given chord. That means the app knows the
exact pitch of each of the six strings for any voicing — which is precisely
the input a physically-modelled string synth needs. A "more faithful chord"
is not a new theory problem here; it's a synthesis problem, and the theory
half is done.

---

## 2. Feasibility by component

### 2.1 Drum synthesis — fully feasible

Classic analogue-style drum synthesis needs no samples. All of this is
oscillators, noise and envelopes, i.e. exactly what `src/nodes/` provides:

| Voice | Synthesis |
|---|---|
| Kick | Sine, pitch envelope ~150 Hz → 50 Hz over ~50 ms, amp decay ~300 ms |
| Snare | Noise burst (existing worklet) + two tuned oscillators (~180 Hz, ~330 Hz), bandpass, ~150 ms decay |
| Closed hat | 6 square oscillators at inharmonic ratios → highpass ~7 kHz, ~35 ms decay |
| Open hat | Same source, ~300 ms decay |
| Toms | Sine + pitch envelope, tuned per drum |
| Clap | 3–4 noise bursts ~10 ms apart + short noise tail |

This is the TR-808/909 topology. It is a solved problem, cheap on CPU, and
sounds like a drum machine rather than a drum kit — which for a practice
backing track is fine, arguably preferable. Budget: a `DrumVoice` module
plus a pattern bank. Small.

### 2.2 Instrument voices — the priority, and where the quality is

**This is the first thing to build.** Everything else is downstream of
having notes that sound like the instrument being taught.

#### Why not pure subtractive

The existing PolySynth is subtractive: oscillator + noise → filter →
envelope → effects. That topology is excellent for synth sounds and
mediocre for plucked strings, because a real string's timbre comes from a
decaying set of near-harmonic partials whose high end dies faster than the
low — an evolving spectrum a static filter plus ADSR only crudely imitates.
More knobs will not get there.

#### The synthesis technique

**Karplus-Strong** in an AudioWorklet: excite a delay line of length
`sampleRate / f0` with a noise burst, feed back through a lowpass. Asset-free,
very cheap, convincingly string-like, and it produces exactly the
decaying-partial behaviour subtractive synthesis can't. It replaces only the
oscillator stage — `Distortion`, `Delay`, `PingPongDelay`, `Reverb`,
`Filter`, `EQ2`, `Compressor` in `src/nodes/` all apply downstream unchanged.

#### The architecture: sibling channels, not one extended synth

*Decided 2026-08-01.* An earlier draft proposed retrofitting an `Instrument`
interface onto PolySynth and adding voices inside it. **Rejected** — that
quietly makes the Phase 6 PolySynth teardown (3,897 lines, 117 `useState`)
a prerequisite for hearing a single guitar note.

Instead: **each instrument is a separate channel with its own sub-tab**,
sitting beside PolySynth rather than inside it.

```
Instrument tab
├── common strip: master volume, spectrum, oscilloscope, peak meter,
│                 active-input selector
├── Synth    sub-tab  -> existing PolySynth, untouched
├── Piano    sub-tab  -> FM / EP voice          (new, greenfield)
├── Guitar   sub-tab  -> Karplus-Strong + bass  (new, greenfield)
└── Drums    sub-tab  -> synthesized kit        (new, greenfield)
```

A dispatch layer routes each note event to the selected channel; every
channel outputs to a shared master bus.

Why this is the cheaper path:

- **PolySynth is never opened.** It becomes an opaque box behind a
  `noteOn`/`noteOff` adapter and keeps working exactly as it does now.
- **New instruments are greenfield.** A guitar channel written fresh is a
  few hundred clean lines that inherit none of the existing state sprawl.
- **The visualisers already fit.** `Oscilloscope`, `Spectrogram`,
  `SpectrumAnalyzer` and `PeakMeter` all already take
  `{ audioCtx, sourceNode }` props — point them at the master bus and they
  work unmodified. This is the common strip, essentially for free.
- **The tab UI already exists.** `createTabbedPanel(tabs, defaultIndex,
  storageKey)` in `frets.js:2345` is generic and persists the active tab to
  localStorage.
- **The dispatch layer is small and double-counts as refactor progress.**
  ~16 live call sites, clustering into three entry points: keyboard
  (`onKeyPress`), mouse (`initializePolySynthMouse`), and programmatic
  (fretboard + progression). That dispatcher *is* the note bus Phase 5 wants,
  so this work advances the refactor rather than competing with it.

Two consequences to design around:

- **The shared `AudioContext` (§3.1) becomes non-negotiable and comes
  first.** Four channels plus the metronome would otherwise be five
  independent clocks. This is now the foundation, not a cleanup.
- **Drums aren't pitched.** The dispatch event needs to carry either a pitch
  or a drum-voice id, so define it as a small tagged event rather than a
  bare note string.

What this gives up: routing the guitar model through the synth's filter and
LFO, since they're no longer the same signal path. Niche, and worth the
trade.

#### Where effects live

The one real design decision. Recommendation:

- **Shared master chain** for the common processing (EQ, compression,
  reverb, delay) on the common strip — matches the "common elements"
  instinct and avoids four copies of the same effects UI.
- **One insert slot per channel** for instrument-specific colour. Guitar
  genuinely needs its own drive/amp stage, because guitar distortion is
  pre-fader and instrument-specific in a way master-bus distortion isn't.

Start with the master chain only; add the guitar insert when building the
guitar channel.

#### Guitar (first)

Combined with `chordFingering.js` this gets genuinely good:

1. Take the voicing's `{string, fret}` positions → per-string frequencies.
2. Excite each string with a small stagger (~15–25 ms per string) for a real
   strum rather than a block chord; reverse the order for upstrokes.
3. Damp muted/unplayed strings.
4. Vary excitation brightness with velocity for pick attack and dynamics.

That gives strummed guitar voiced exactly as a guitarist would fret it, from
data the app already computes. This is the direct answer to "play chords
more faithfully", and it's a better answer than more synth parameters.

#### Bass (second)

Your instinct is right — largely a retuned guitar: same engine, fewer
strings, longer delay line, heavier lowpass damping in the feedback loop.
Two refinements worth adding: thicker strings are measurably more
inharmonic, and bass notes want a longer, less bright excitation. Cheap to
add once the guitar engine exists.

#### Piano (third, and the hard one)

Worth setting expectations: **a convincing acoustic grand is the hardest of
the three asset-free.** Piano tone needs many partials with real
inharmonicity, register-dependent decay, multiple strings per note beating
slightly out of tune, and sympathetic resonance from undamped strings.
Additive or modal synthesis gets there but it is a real project, and a
mediocre acoustic piano sounds obviously fake in a way a mediocre plucked
string does not.

The pragmatic alternative: **electric piano.** A two-operator FM voice does
a Rhodes/Wurlitzer convincingly, it is genuinely cheap, and it takes the
existing distortion/chorus/delay chain beautifully. Recommend shipping an EP
voice first and treating acoustic piano as optional later work.

Note the app already has a `MiniPiano` component and piano-oriented UI, so
"piano" here means the *voice*, not new interface work.

### 2.3 Pitch detection, monophonic — feasible, with a latency floor

YIN or MPM in an AudioWorklet is the standard approach and is well
established in browsers. The constraint is physical:

- Low E (E2) = 82.4 Hz → 12.1 ms period.
- Autocorrelation needs ~3–4 periods for a stable estimate → ~2048–4096
  samples at 44.1 kHz → **46–93 ms detection latency on low notes.**
- Higher notes resolve faster; a windowed/multi-resolution approach helps.

Add measured round-trip audio latency (Chrome ~10–30 ms, Firefox ~20–50 ms)
and the realistic end-to-end budget is **~60–140 ms** between the user
plucking and the app knowing what was plucked.

That is fine for "did you play in-scale" and workable for rhythm scoring if
calibrated, but it means timing feedback must use a calibration offset, not
raw wall-clock arrival. `AudioContext.outputLatency` (available in Chrome
and Firefox since ~March 2025; still missing in Safari) plus a one-time
click-through loopback calibration covers this.

### 2.4 Chord detection, polyphonic — approximate only

This is the one place the Rocksmith comparison breaks down, and it's worth
being blunt about why: **Rocksmith had a 1/4" cable.** A clean, isolated,
single-instrument DI signal. A laptop microphone in a room is a
fundamentally worse input, and no algorithm closes that gap.

The realistic asset-free approach is chroma-vector template matching:
CQT → fold to 12 pitch classes → cosine-similarity against chord templates →
median filter + Viterbi smoothing with the current key as prior. This is the
established method and runs fine in a browser.

What that buys you: "that was C-major-ish" with decent reliability on clean
strums, degrading on distortion, fast changes, and extended harmony. What it
does not buy you: per-string verification of whether all six notes of a
voicing were fretted correctly. Neural transcription would do better but the
weights are an asset, which the constraints rule out.

**Recommendation:** design the scoring around what's reliable — scale
adherence, chord-tone targeting, onset timing, phrase-level feedback — and
treat chord identification as a soft signal. Notably, Rocksmith's *Session
Mode* (as opposed to lesson mode) scored loosely on exactly these terms, so
this is closer to the original than it sounds.

### 2.5 The microphone bleed problem — the real blocker

The backing track comes out the speakers and goes straight back into the
microphone. The detector then hears the app's own drums, bass and chords
mixed with the guitar.

Mitigations, in order of effectiveness:

1. **Require headphones.** Solves it completely. This should be a hard
   requirement communicated in the UI, not a suggestion.
2. Disable `echoCancellation`, `noiseSuppression` and `autoGainControl` in
   the `getUserMedia` constraints — all three mangle musical signal and must
   be off regardless. Note this means AEC is *not* available as a fallback.
3. Support input device selection, so a USB audio interface with a DI'd
   guitar can be used — the closest thing to the Rocksmith cable, and the
   configuration that makes chord detection actually good.
4. Detect probable bleed (correlation between output and input) and warn.

### 2.6 Static hosting — no obstacle

Everything is client-side. No server, no upload, no API. GitHub Pages is
fine. Two caveats, both in section 3.

---

## 3. What must be fixed first

These are prerequisites, not nice-to-haves. Three of the four are latent
bugs that already affect the app today.

### 3.1 There are two AudioContexts

`PolySynth.jsx:67` creates a module-level `const AC = new AudioContext()`.
`metronome.js:236/246/570` creates its own, separately.

Two AudioContexts have independent clocks and cannot be sample-synced. The
metronome already works around this with `performanceTimeToAudioTime()` and
a stored `audioContextStartTime` offset — a bridge between `performance.now()`
and audio time that will drift.

A backing track where drums, bass and chords must lock together requires
**one AudioContext, created once, shared**. This is the single most
important structural prerequisite.

### 3.2 Sequencing runs on `setTimeout`, not the audio clock

The metronome has a proper lookahead scheduler on the audio clock. The
progression sequencer and arpeggiator do not — they use chained `setTimeout`
with millisecond durations computed from a BPM slider read out of the DOM
(`progressionBuilder.js:155-190`, `PolySynth.jsx:945-1061`). `setTimeout` in
a busy tab drifts by tens of milliseconds, which is audible as sloppy timing
and fatal for scoring the user against a grid.

All sequenced playback needs to move onto the metronome's
`getTimeForBeat()` lookahead model.

### 3.3 HTTPS — already fine, no action needed

*Checked 2026-08-01.* The site is live at `https://liz.moe/uncaged/` and
serves over HTTPS, so `getUserMedia` will have its secure context when input
detection is eventually built. The `"homepage": "http://liz.moe/uncaged"` in
`package.json` is cosmetically stale but harmless — worth changing to
`https://` when convenient, nothing depends on it.

### 3.4 AudioWorklet paths work, but by coincidence

*Checked 2026-08-01.* `noiseGenerator.js:21-23` loads
`/white-noise-processor.js` from the domain root. Both
`https://liz.moe/white-noise-processor.js` and
`https://liz.moe/uncaged/white-noise-processor.js` currently serve the file,
so the worklets do load and there is no fallback error — consistent with
what you're seeing in the console.

This is a robustness nit rather than a bug: the absolute path only works
because `liz.moe` root happens to serve these files as well as
`/uncaged/`. If the root deployment ever changes, every worklet silently
degrades to the `ScriptProcessor` fallback with only a `console.error` to
show for it. Since drum and string synthesis will both depend on worklets,
switch the paths to `process.env.PUBLIC_URL` when touching this code, and
consider promoting that catch from `console.error` to something visible.

---

## 4. Build order

Ordered by the priorities set 2026-08-01. Each stage is independently
useful and shippable.

### Stage 1 — Instrument voices (the priority)

No sequencing, no microphone, no timing work. Just: notes played through the
app sound like the instrument.

1. **Shared `AudioContext` + master bus** (§3.1). The foundation — every
   channel and the metronome share one context and sum into one bus. The
   clock/scheduler half of the audio core is *not* needed yet; defer it.
2. **Common strip**: master volume + the four existing visualisers pointed
   at the master bus (they already take the right props), plus the
   active-input selector.
3. **Channel + dispatch layer**: a tagged note event, a channel registry,
   and the three entry points rewired off `window.polySynthRef`. Wrap the
   existing PolySynth as the first channel — behaviour unchanged.
4. **Karplus-Strong worklet** as a source node.
5. **Guitar channel**, with per-string voicing and strum stagger driven by
   `chordFingering.js`, plus its own drive insert.
6. **Bass channel** — retuned guitar, heavier damping.
7. **Piano channel** — 2-op FM electric piano. Acoustic grand optional later.

Deliverable: pick an instrument from a sub-tab; chord and scale playback
sounds like it. Steps 1–3 are the architecture and are worth doing on their
own — at that point PolySynth is just the first of N channels.

### Stage 2 — Drum backing

1. **Audio-clock scheduling** (§3.2) — the rest of the audio core. Required
   here, because drums must lock to a grid.
2. Drum voices per §2.1 + a pattern bank (rock/blues/funk/shuffle at
   minimum), tempo from the existing metronome.
3. Bass line generation on top, from the progression the app already builds.
4. Tempo/key/scale selection wired to the existing scale UI.

Deliverable: play-along backing tracks. This is the practice tool, and it
needs no microphone.

### Stage 3 — Input detection (long run)

Correctly deferred — latency, mic bleed and parsing difficulty all argue
for doing this last, once there is something worth playing along to.

1. Mic capture with `echoCancellation`/`noiseSuppression`/`autoGainControl`
   all disabled, input device selection, headphone requirement in the UI.
2. Round-trip latency calibration.
3. YIN worklet → monophonic note stream → scale-adherence and chord-tone
   feedback, visualised on the existing fretboard.
4. Spectral-flux onset detection → timing against the beat grid.
5. Chroma + template chord recognition, soft-scored, best-effort.

---

## 5. Effect on the refactor plan

The north star sharpens `REFACTOR_PLAN.md` rather than conflicting with it:

- **A new phase belongs in the plan: `src/audio/` — one context, one clock,
  one scheduler.** It splits across the stages above: the shared
  `AudioContext` is needed for Stage 1, the clock and scheduler for Stage 2.
  Both are fixes worth making regardless.
- **Phase 5 (kill the `window` bus) partly happens for free in Stage 1.**
  The channel dispatcher replaces `window.polySynthRef` at its ~16 live call
  sites, which is the single highest-traffic global (100 references). The
  rest of Phase 5 is still needed by Stage 2, where a scheduler must
  sample-align drums, bass and chords.
- **Phase 6 (PolySynth teardown) drops off the critical path entirely.**
  Under the channel architecture PolySynth is wrapped, not opened. It can be
  refactored whenever, or never.
- **Phase 2 (`src/theory/`) gets more valuable.** Scoring needs
  "is this note in the current scale / a chord tone" as a fast pure
  function — the same primitive currently duplicated 20 times.
- **`chordFingering.js` and `chordPatterns.js` should be treated as core
  domain, not fretboard UI helpers**, when Phase 3 splits `frets.js`. The
  synthesis engine will depend on them.

Nothing in the refactor plan needs to be undone. Two things need reordering,
and one phase needs adding.

---

## Sources

- [Pitch detection in Web Audio using autocorrelation (cwilso)](https://github.com/cwilso/PitchDetect)
- [How Browser-Based Pitch Detection Works — Web Audio API to WebAssembly](https://www.musicalboard.com/blog/2026-05-05-pitch-detection/)
- [MDN: AudioContext.outputLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency)
- [MDN: AudioContext.baseLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency)
- [Keeping audio and visuals in sync with the Web Audio API](https://www.jamieonkeys.dev/posts/web-audio-api-output-latency/)
- [Browser round-trip audio latency measurement (Superpowered)](https://github.com/superpoweredSDK/WebBrowserAudioLatencyMeasurement)
- [Template-Based Chord Recognition (AudioLabs Erlangen, FMP)](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C5/C5S2_ChordRec_Templates.html)
- [Chord Detector and Chromagram (adamstark)](https://github.com/adamstark/Chord-Detector-and-Chromagram)
- [The Constant-Q Transform — A Visual Guide](https://brendanjameslynskey.github.io/ConstantQ-Transform/)
