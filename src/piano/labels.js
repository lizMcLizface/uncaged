/**
 * What a scale looks like on the piano: which pitch classes are in it, what
 * colour each one gets, and what text sits on the key.
 *
 * Pure - no DOM, no app state. `Piano.js` applies what this returns.
 *
 * Depends on `theory/notation` (note name -> MIDI) and `theory/intervals`
 * (the semitone -> colour/label palette every other piano and the Scale
 * Position Grid already use).
 *
 * **Colour is keyed by semitone from the root, not by scale degree.** That is
 * the whole point of PIANO_VIEW_PLAN.md §2: a ♭3 and a natural 3 are
 * different intervals and must not share a colour. The main fretboard is
 * currently the app's one exception, and step 5 converts it.
 */

import { noteToMidi } from '../theory/notation';
import { getIntervalColor, getIntervalLabel } from '../theory/intervals';

/**
 * Pitch class 0-11 of a note name, with or without an octave ('Eb', 'F#/3').
 *
 * Enharmonics collapse here by construction - 'Gb' and 'F#' both give 6 -
 * which is why nothing downstream compares note-name strings. §5.1 calls for
 * `areEnharmonicEquivalent` rather than string equality; going through MIDI
 * is the same guarantee arrived at more cheaply, and it also folds in the
 * awkward pairs (`Cb` -> 11, `B#` -> 0) that cross an octave boundary.
 *
 * @returns {number|null} null if the name can't be parsed
 */
export function noteNameToPitchClass(noteName) {
    if (!noteName || typeof noteName !== 'string') return null;
    const withOctave = noteName.includes('/') ? noteName : `${noteName}/4`;
    try {
        return ((noteToMidi(withOctave) % 12) + 12) % 12;
    } catch (error) {
        return null;
    }
}

/**
 * Strip the octave from a spelled note name, keeping the spelling.
 * 'Eb/5' -> 'Eb'. Not `theory/notation`'s `stripOctave`, which normalises
 * the accidental symbols as well; the piano wants exactly what the scale
 * context spelled.
 */
function nameWithoutOctave(noteName) {
    const slashIndex = noteName.indexOf('/');
    return slashIndex === -1 ? noteName : noteName.slice(0, slashIndex);
}

/**
 * Turn a scale into per-pitch-class display instructions.
 *
 * Keyed by pitch class, so one entry covers that note in every octave - the
 * "periodic" half of §5.1's highlight model, which is what a scale is. The
 * octaves in `scaleNotes` (`getScaleNotes` returns 'E/5', 'F#/5', …) are an
 * artifact of how it generates them and carry no meaning here.
 *
 * @param {string[]} scaleNotes - spelled, e.g. ['E/5','F#/5','G/5',…]
 * @param {string} rootNote - e.g. 'E'. Colours are measured from this.
 * @param {'note'|'interval'|'finger'} [labelMode]
 * @returns {Map<number, {semitone: number, color: string, label: string}>}
 */
export function buildScaleKeyStyles(scaleNotes, rootNote, labelMode = 'note') {
    const styles = new Map();
    if (!Array.isArray(scaleNotes)) return styles;

    const rootPitchClass = noteNameToPitchClass(rootNote);
    if (rootPitchClass === null) return styles;

    scaleNotes.forEach(noteName => {
        const pitchClass = noteNameToPitchClass(noteName);
        if (pitchClass === null || styles.has(pitchClass)) return;

        const semitone = (pitchClass - rootPitchClass + 12) % 12;
        styles.set(pitchClass, {
            semitone,
            color: getIntervalColor(semitone),
            label: getKeyLabel(nameWithoutOctave(noteName), semitone, labelMode)
        });
    });

    return styles;
}

/**
 * The text on an in-scale key.
 *
 * `'finger'` is a guitar concept with no meaning on a piano, and falling
 * through to a blank label would read as a bug, so it deliberately shows the
 * note name instead of nothing (§8.3).
 */
export function getKeyLabel(spelledName, semitone, labelMode) {
    if (labelMode === 'interval') return getIntervalLabel(semitone);
    return spelledName;
}
