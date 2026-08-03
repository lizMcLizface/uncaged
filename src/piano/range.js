/**
 * The active instrument's playable range, expressed in piano terms.
 *
 * Owns: turning a tuning array into { lowMidi, highMidi } plus the MIDI
 * number of each open string, so the piano can dim out-of-range keys and
 * mark open strings (PIANO_VIEW_PLAN.md section 8.2).
 *
 * Depends on: `src/tuning.js` for the fretted-note math and
 * `src/theory/notation.js` for the note -> MIDI conversion. Takes the tuning
 * array as an argument rather than reading `getActiveConfig()` itself, so it
 * stays pure and testable; whoever renders subscribes to `tuning.js`'s
 * `subscribe()` and passes the new tuning in.
 *
 * The instrument's playable range and the piano's own displayed octave range
 * are independent and must not be conflated - this module answers only the
 * former.
 *
 * MIDI numbers out of here are standard (60 = C4), matching
 * `src/piano/keyModel.js` and `src/midi.js`'s `keys` table. `tuning.js`
 * reports notes as { letter, octave } with no MIDI number and uses a
 * different octave convention internally, so the conversion below goes
 * through `notation.js` rather than reusing that math.
 */

import { getNoteAtStringFret } from '../tuning';
import { noteToMidi } from '../theory/notation';

/**
 * Highest fret treated as playable. `FRET_COUNT` (21) is how many frets the
 * fretboard *displays*, not a claim about what is comfortably reachable, so
 * this is a separate number and a `pianoState` setting rather than a
 * constant derived from it.
 */
export const DEFAULT_PRACTICAL_FRET = 18;

/**
 * Standard MIDI number for a { letter, octave } pair, or null if it cannot
 * be represented (`noteToMidi` throws outside 0-127).
 */
function toMidi(note) {
    if (!note) return null;
    try {
        return noteToMidi(`${note.letter}/${note.octave}`);
    } catch (error) {
        return null;
    }
}

/**
 * The instrument's playable range and its open strings.
 *
 * `lowMidi` is the minimum over every open string, not the last tuning
 * entry: tuning arrays are conventionally descending, but that is a
 * convention rather than a guarantee and a min costs the same.
 *
 * @param {string[]} tuning - open-string notes, e.g. ['E4','B3',...]
 * @param {number} [practicalFret] - highest fret considered playable
 * @returns {{lowMidi: number, highMidi: number,
 *            openStrings: Array<{stringIndex: number, midi: number, name: string}>}|null}
 *          null if the tuning is empty or no string could be resolved
 */
export function getInstrumentRange(tuning, practicalFret = DEFAULT_PRACTICAL_FRET) {
    if (!Array.isArray(tuning) || tuning.length === 0) return null;

    const openStrings = [];
    let lowMidi = null;
    let highMidi = null;

    for (let stringIndex = 0; stringIndex < tuning.length; stringIndex++) {
        const openMidi = toMidi(getNoteAtStringFret(stringIndex, 0, tuning));
        const topMidi = toMidi(getNoteAtStringFret(stringIndex, practicalFret, tuning));
        if (openMidi === null || topMidi === null) continue;

        openStrings.push({ stringIndex, midi: openMidi, name: tuning[stringIndex] });
        lowMidi = lowMidi === null ? openMidi : Math.min(lowMidi, openMidi);
        highMidi = highMidi === null ? topMidi : Math.max(highMidi, topMidi);
    }

    if (lowMidi === null) return null;
    return { lowMidi, highMidi, openStrings };
}

/**
 * Whether a MIDI note falls inside a range returned by getInstrumentRange.
 * A null range (no resolvable tuning) counts everything as in range, so the
 * piano renders normally rather than dimming every key.
 */
export function isInInstrumentRange(midi, range) {
    if (!range) return true;
    return midi >= range.lowMidi && midi <= range.highMidi;
}
