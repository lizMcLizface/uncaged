/**
 * The layer builders: the only place that knows what a "scale layer" or a
 * "chord layer" is made of.
 *
 * Pure - names and options in, a layer object out. No DOM, no app state, no
 * knowledge of either renderer.
 *
 * Owns the choice of colour and label for a layer's notes, which is why the
 * two renderers cannot disagree about a scale: they are handed the same
 * layer. Colour is keyed by **semitone from the layer's root**, never by
 * scale degree - PIANO_VIEW_PLAN.md section 2, settled for the fretboard in
 * its step 5 and for the piano in its step 4.
 *
 * Depends on `theory/intervals` (the shared semitone palette) and
 * `./flatten` (note parsing only).
 *
 * **Deliberate duplication, for one step.** `piano/labels.js`'s
 * `buildScaleKeyStyles`/`getKeyLabel` compute the same thing in the piano's
 * own shape. Step 8a cannot delete them without touching `Piano.js`, which
 * is step 8b's job; 8b retires them when the piano starts rendering the
 * stack. If you are reading this after 8b has landed, they should be gone -
 * if they aren't, that is the bug.
 */

import { getIntervalColor, getIntervalLabel } from '../theory/intervals';
import { parseLayerNote } from './flatten';

/**
 * The base layer's id. Fixed, because "replace the scale" has to be able to
 * find it, and because a second scale layer is never meaningful.
 */
export const SCALE_LAYER_ID = 'scale';

/**
 * Strip the octave while keeping the spelling: 'Eb/5' -> 'Eb'.
 *
 * Not `theory/notation`'s `stripOctave`, which normalises accidentals too.
 * A layer shows the scale's own spelling - that is what
 * PIANO_VIEW_PLAN.md's requirement 2 is about, and re-normalising here would
 * undo it.
 */
function nameWithoutOctave(noteName) {
    const slashIndex = noteName.indexOf('/');
    return slashIndex === -1 ? noteName : noteName.slice(0, slashIndex);
}

/**
 * The text on a marked note.
 *
 * `'finger'` is a guitar concept with no meaning on a piano, and blanking
 * the label would read as a bug, so it falls back to the note name
 * (PIANO_VIEW_PLAN.md section 8.3). The fretboard overrides this per
 * position, where a finger number does exist.
 */
export function noteLabelFor(spelledName, semitone, labelMode) {
    if (labelMode === 'interval' && Number.isFinite(semitone)) return getIntervalLabel(semitone);
    return spelledName;
}

/**
 * The active scale, as the persistent base layer.
 *
 * Periodic throughout: a scale is a set of pitch classes, so every octave of
 * each one lights. The octaves in `scaleNotes` ('E/5', 'F#/5', ...) are an
 * artifact of how `getScaleNotes` generates them and carry no meaning - which
 * is also why the trailing repeated root collapses into the first rather
 * than producing a duplicate entry.
 *
 * @param {string[]} scaleNotes - spelled, e.g. ['E/5','F#/5','G/5',...]
 * @param {string} rootNote - e.g. 'E'. Colours are measured from this.
 * @param {'note'|'interval'|'finger'} [labelMode]
 */
export function scaleLayer(scaleNotes, rootNote, labelMode = 'note') {
    const layer = {
        id: SCALE_LAYER_ID,
        notes: [],
        dimBelow: false,
        hideBelow: false,
        transient: false
    };

    const root = parseLayerNote(rootNote);
    if (!root || !Array.isArray(scaleNotes)) return layer;

    const seen = new Set();
    scaleNotes.forEach(noteName => {
        if (typeof noteName !== 'string') return;
        const parsed = parseLayerNote(noteName);
        if (!parsed || seen.has(parsed.pitchClass)) return;
        seen.add(parsed.pitchClass);

        const spelled = nameWithoutOctave(noteName);
        const semitone = (parsed.pitchClass - root.pitchClass + 12) % 12;
        layer.notes.push({
            note: spelled,
            color: getIntervalColor(semitone),
            label: noteLabelFor(spelled, semitone, labelMode),
            isRoot: semitone === 0,
            semitone
        });
    });

    return layer;
}

/**
 * A chord, hovered or selected.
 *
 * **Octaves are kept exactly as given.** A chord resolved from a fretboard
 * fingering arrives as sounding pitches ('E/2', 'B/2', 'E/3', ...) and must
 * light those keys and no others; a chord with no playable shape arrives as
 * bare pitch classes and lights every octave. Both are correct, and which
 * one it is is the caller's decision, not this function's
 * (VISUALIZATION_STACK_PLAN.md section 5.2).
 *
 * `positions` rides along untouched for the fretboard renderer. A fingering
 * is a set of (string, fret) pairs and is not derivable from a note list, so
 * it cannot be flattened; the piano ignores it and renders `notes`.
 *
 * @param {{
 *   id?: string, label?: string, notes?: string[], rootNote?: string,
 *   labelMode?: string, positions?: Array<object>|null,
 *   dimBelow?: boolean, hideBelow?: boolean, transient?: boolean
 * }} options
 */
export function chordLayer(options = {}) {
    const {
        id = 'chord',
        label = '',
        notes: noteNames = [],
        rootNote = null,
        labelMode = 'note',
        positions = null,
        dimBelow = false,
        hideBelow = false,
        transient = true
    } = options;

    const layer = {
        id,
        label,
        notes: [],
        positions,
        dimBelow,
        hideBelow,
        transient
    };

    if (!Array.isArray(noteNames)) return layer;
    const root = rootNote ? parseLayerNote(rootNote) : null;

    // Specific notes dedupe by pitch, periodic ones by pitch class: a
    // fingering that doubles the root two octaves apart is two keys, but a
    // chord listing 'E' twice is one.
    const seen = new Set();
    noteNames.forEach(noteName => {
        if (typeof noteName !== 'string') return;
        const parsed = parseLayerNote(noteName);
        if (!parsed) return;

        const key = parsed.specific ? `m${parsed.midi}` : `p${parsed.pitchClass}`;
        if (seen.has(key)) return;
        seen.add(key);

        const spelled = nameWithoutOctave(noteName);
        const semitone = root ? (parsed.pitchClass - root.pitchClass + 12) % 12 : null;
        layer.notes.push({
            note: noteName,
            color: semitone === null ? null : getIntervalColor(semitone),
            label: noteLabelFor(spelled, semitone, labelMode),
            isRoot: semitone === 0,
            semitone
        });
    });

    return layer;
}

/**
 * An arbitrary set of notes in one colour - a single marked note, a search
 * result, an interval being demonstrated.
 *
 * The escape hatch that keeps sources from inventing their own layer shapes:
 * anything that is neither a scale nor a chord goes through here rather than
 * hand-building an object.
 */
export function noteLayer(options = {}) {
    const {
        id = 'notes',
        label = '',
        notes: noteNames = [],
        color = null,
        showLabels = true,
        dimBelow = false,
        hideBelow = false,
        transient = true
    } = options;

    const layer = { id, label, notes: [], dimBelow, hideBelow, transient };
    if (!Array.isArray(noteNames)) return layer;

    const seen = new Set();
    noteNames.forEach(noteName => {
        if (typeof noteName !== 'string') return;
        const parsed = parseLayerNote(noteName);
        if (!parsed) return;

        const key = parsed.specific ? `m${parsed.midi}` : `p${parsed.pitchClass}`;
        if (seen.has(key)) return;
        seen.add(key);

        layer.notes.push({
            note: noteName,
            color,
            label: showLabels ? nameWithoutOctave(noteName) : '',
            isRoot: false,
            semitone: null
        });
    });

    return layer;
}
