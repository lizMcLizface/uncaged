/**
 * Pure fret-position and note-at-position math for the main Fretboard.
 * No DOM, no class instance - everything here takes plain data (a tuning
 * array, a fret count, a fret-position table) and returns plain data, so
 * it's usable outside a mounted Fretboard (and independently testable).
 *
 * Lifted from the Fretboard class in src/frets.js as part of
 * REFACTOR_PLAN.md Phase 3. The class keeps thin methods of the same name
 * that forward to these, so its public API is unchanged.
 */

import { noteToMidi, midiToNote, stripOctave, areEnharmonicEquivalent, normalizeNote } from '../theory/notation';
import { INTERVAL_LABELS } from '../theory/intervals';

// Calculate fret positions using the rule of 18 (each fret divides remaining string length by 18)
export function calculateFretPositions(fretCount) {
    const positions = [0]; // Open string position at 0%

    // Calculate what the full string length should be so that the 15th fret ends at 100%
    // Work backwards from the desired end position
    let totalLength = 100;
    let tempLength = totalLength;

    // Calculate the theoretical positions if we started with this length
    const tempPositions = [0];
    for (let fret = 1; fret <= fretCount; fret++) {
        const fretDistance = tempLength / 17.817;
        tempPositions.push(totalLength - tempLength + fretDistance);
        tempLength -= fretDistance;
    }

    // Scale so that the last fret (15th) is at 100%
    const lastFretPosition = tempPositions[fretCount];
    const scaleFactor = 100 / lastFretPosition;

    // Apply scaling to all positions
    for (let fret = 1; fret <= fretCount; fret++) {
        positions.push(tempPositions[fret] * scaleFactor);
    }

    return positions;
}

/**
 * Calculate the horizontal position for a fret (same logic as dot inlays),
 * given a fretboard's precomputed fretPositions table (see
 * calculateFretPositions above).
 */
export function calculateFretPosition(fretPositions, fret) {
    if (fret === 0) {
        return 0; // Nut position
    } else {
        // Position in the center of the fret space, same as dot inlays
        const prevFretPos = fret > 1 ? fretPositions[fret - 1] : 0;
        const currentFretPos = fretPositions[fret];
        return (prevFretPos + currentFretPos) / 2;
    }
}

/**
 * The MIDI number sounding at a string and fret. Standard convention,
 * 60 = C4 - the same one src/piano/ and theory/notation.js use.
 *
 * Extracted from calculateNote below, which computed it and then discarded
 * it after spelling the note. Exactly the shape of PIANO_VIEW_PLAN.md step
 * 5's getSemitoneFromRoot extraction, and for the same reason: the
 * visualization stack keys on MIDI numbers, and re-deriving one by parsing
 * calculateNote's *output* would round-trip through a spelling decision it
 * has no reason to depend on.
 */
export function calculateMidi(openStringNote, fret) {
    // Tuning strings are stored as "D4" (no separator, see tuning.js),
    // but noteToMidi only recognizes the "D/4" slash format - without it,
    // it silently defaults every string to octave 4, discarding the
    // string's real tuning octave. The stale "+ 12" this used to carry was
    // compensating for that (making open strings all land around octave
    // 5), not a real conversion need.
    const slashed = openStringNote.includes('/')
        ? openStringNote
        : openStringNote.replace(/^([A-Ga-g][#♯b♭]*)(-?\d+)$/, '$1/$2');
    return noteToMidi(slashed) + fret;
}

/**
 * Calculate the note at a specific string and fret using enhanced notation
 */
export function calculateNote(openStringNote, fret) {
    return midiToNote(calculateMidi(openStringNote, fret));
}

/**
 * Extract note name without octave from a full note string
 * Handles both "C/4" and "C4" formats, with proper notation support
 */
export function extractNoteName(noteString) {
    if (!noteString) return '';
    return stripOctave(noteString);
}

/**
 * Extract octave number from a full note string
 * Returns null if no octave found
 */
export function extractOctave(noteString) {
    if (!noteString) return null;
    // Handle format like "C/4"
    if (noteString.includes('/')) {
        const parts = noteString.split('/');
        return parts.length > 1 ? parseInt(parts[1]) : null;
    }
    // Handle format like "C4" (fallback)
    const match = noteString.match(/(\d+)$/);
    return match ? parseInt(match[1]) : null;
}

/**
 * Get the note at a specific string and fret, given a tuning array and the
 * fretboard's fret count.
 */
export function getNoteAt(tuning, fretCount, stringIndex, fret) {
    if (stringIndex < 0 || stringIndex >= tuning.length || fret < 0 || fret > fretCount) {
        return null;
    }
    return calculateNote(tuning[stringIndex], fret);
}

/**
 * Semitones from a root note up to a target note, 0-11, ignoring octave and
 * spelling ('Gb' and 'F#' give the same answer).
 *
 * This was the discarded middle of `getIntervalLabelFromRoot`, which computed
 * it only to index a label table. It is separate now because the *colour* is
 * keyed by the same number: PIANO_VIEW_PLAN.md §2, which is what makes a ♭3
 * and a natural 3 read differently instead of both being "degree 3".
 *
 * @returns {number|null} null if either note can't be parsed
 */
export function getSemitoneFromRoot(rootNote, targetNote) {
    if (!rootNote || !targetNote) {
        return null;
    }

    try {
        const normalizedRoot = stripOctave(normalizeNote(rootNote));
        const normalizedTarget = stripOctave(normalizeNote(targetNote));

        const rootMidi = noteToMidi(`${normalizedRoot}/4`);
        const targetMidi = noteToMidi(`${normalizedTarget}/4`);
        return (targetMidi - rootMidi + 12) % 12;
    } catch (error) {
        return null;
    }
}

/**
 * Interval label (from src/theory/intervals.js's INTERVAL_LABELS) between
 * a root note and a target note, ignoring octave. Used by both the
 * Fretboard class and src/fretboard/index.js's chord-display glue, so it
 * lives here rather than in either.
 */
export function getIntervalLabelFromRoot(rootNote, targetNote) {
    const semitoneDistance = getSemitoneFromRoot(rootNote, targetNote);
    if (semitoneDistance === null) {
        return '';
    }
    return INTERVAL_LABELS[semitoneDistance] || '';
}

/**
 * Find all positions of a specific note on the fretboard, given a tuning
 * array and the fretboard's fret count.
 */
export function findNotePositions(tuning, fretCount, targetNote) {
    const positions = [];

    // Check if targeting a specific octave or all octaves
    const hasSpecificOctave = targetNote.includes('/');
    let targetNoteName, targetOctave;

    if (hasSpecificOctave) {
        targetNoteName = extractNoteName(targetNote);
        targetOctave = extractOctave(targetNote);
    } else {
        targetNoteName = targetNote;
        targetOctave = null;
    }

    tuning.forEach((stringNote, stringIndex) => {
        for (let fret = 0; fret <= fretCount; fret++) {
            const note = calculateNote(stringNote, fret);
            const noteName = extractNoteName(note);
            const noteOctave = extractOctave(note);

            let shouldInclude = false;

            if (hasSpecificOctave) {
                // Match both note name and octave using enharmonic equivalence
                shouldInclude = (areEnharmonicEquivalent(noteName, targetNoteName) && noteOctave === targetOctave);
            } else {
                // Match just the note name using enharmonic equivalence
                shouldInclude = areEnharmonicEquivalent(noteName, targetNoteName);
            }

            if (shouldInclude) {
                positions.push({ string: stringIndex, fret, note });
            }
        }
    });

    return positions;
}
