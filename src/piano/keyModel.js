/**
 * Which piano keys exist in a MIDI range, in order, and which of them are
 * black. Pure data in, pure data out - no DOM, no app state, no imports.
 *
 * This is the model `src/piano/Piano.js` renders into `<ul id="keyboard">`
 * and the only part of the piano `MiniPiano.js` could ever share (its own
 * SVG geometry cannot be - see PIANO_VIEW_PLAN.md section 3).
 *
 * MIDI numbering here is the standard convention: 60 = C4. That is what
 * `src/midi.js`'s `keys` table and `src/theory/notation.js` both use, so a
 * descriptor's `midi` can be used directly as `keys[midi]` and as the
 * `midi="N"` attribute the dormant CSS selects on. Note that
 * `src/theory/notes.js` and `src/tuning.js` use a different, non-standard
 * octave convention internally (C4 = 48); nothing in `src/piano/` may use
 * their semitone math without converting first.
 */

// Pitch classes 0-11 from C. The five that are black on a keyboard.
const BLACK_PITCH_CLASSES = [1, 3, 6, 8, 10];

/**
 * The playable window. `src/midi.js`'s `keys` table and its
 * `initializeMouseInput` handler cover exactly MIDI 21 (A0) to 108 (C8), so
 * a key outside this range would render but be inert. Ranges are clamped to
 * it rather than silently producing dead keys.
 */
export const LOWEST_KEY_MIDI = 21;  // A0
export const HIGHEST_KEY_MIDI = 108; // C8

/**
 * Pitch class 0-11 (0 = C) of a MIDI note.
 */
export function pitchClassOf(midi) {
    return ((midi % 12) + 12) % 12;
}

/**
 * Scientific-pitch octave number of a MIDI note (60 -> 4).
 */
export function octaveOf(midi) {
    return Math.floor(midi / 12) - 1;
}

/**
 * Whether a MIDI note falls on a black key.
 */
export function isBlackKey(midi) {
    return BLACK_PITCH_CLASSES.includes(pitchClassOf(midi));
}

/**
 * Every key from lowMidi to highMidi inclusive, low to high.
 *
 * The range is clamped to LOWEST_KEY_MIDI..HIGHEST_KEY_MIDI; an inverted or
 * non-numeric range yields an empty array rather than throwing, so a bad
 * octave setting degrades to "no keys" instead of a render crash.
 *
 * @returns {Array<{midi: number, pitchClass: number, octave: number, isBlack: boolean}>}
 */
export function buildKeyRange(lowMidi, highMidi) {
    if (!Number.isFinite(lowMidi) || !Number.isFinite(highMidi)) return [];

    const low = Math.max(LOWEST_KEY_MIDI, Math.ceil(lowMidi));
    const high = Math.min(HIGHEST_KEY_MIDI, Math.floor(highMidi));

    const keyRange = [];
    for (let midi = low; midi <= high; midi++) {
        keyRange.push({
            midi,
            pitchClass: pitchClassOf(midi),
            octave: octaveOf(midi),
            isBlack: isBlackKey(midi)
        });
    }
    return keyRange;
}

/**
 * How many of the given key descriptors are white.
 *
 * This is what `--num-keys` is set from: `src/index.css` sizes white keys as
 * `100% / var(--num-keys)` and floats them, with black keys positioned
 * against that same unit, so the divisor is the white-key count and not the
 * total.
 */
export function countWhiteKeys(keyRange) {
    return keyRange.reduce((count, key) => (key.isBlack ? count : count + 1), 0);
}

/**
 * The MIDI range covering `octaveCount` octaves starting at C of `lowOctave`.
 *
 * Exactly 12 * octaveCount keys - C2 for 3 octaves is C2..B4, not C2..C5.
 * The result is clamped to the playable window, so a span that runs off
 * either end is truncated rather than producing inert keys.
 */
export function octaveSpanToMidiRange(lowOctave, octaveCount) {
    const lowMidi = (lowOctave + 1) * 12;
    return {
        lowMidi: Math.max(LOWEST_KEY_MIDI, lowMidi),
        highMidi: Math.min(HIGHEST_KEY_MIDI, lowMidi + octaveCount * 12 - 1)
    };
}
