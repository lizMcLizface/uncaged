// "Snap Shapes": choose each progression chord's fretboard shape so the whole
// progression sits inside ONE scale position, instead of each chord
// independently defaulting to its lowest-fret match (pattern index 0, the
// order src/progression/parse.js sorts `getChordPatternMatches` into).
//
// **What this module owns:** the mapping from "a scale position" to "which
// pattern index each chord should use", and the inverse question the Scale
// Position Grid asks - "which of my degree columns does the current
// progression use". It owns no UI: src/progression/controls.js builds the
// toggle/anchor dropdown, src/fretboard/ui/scalePositionGrid.js paints the
// highlight, and both read their answers from here.
//
// **A position is a grid row, not a fret number.** The anchor dropdown's
// entries are exactly the Scale Position Grid's rows (Root E / Root A / ...),
// each resolving to the absolute fret where the scale root sits on that row's
// string, and the window a shape has to fit into is that row's own window -
// both imported from ui/scalePositionGrid.js rather than re-derived, so the
// cell a user sees and the shape snapping picks cannot disagree. That import
// runs both ways (the grid imports getProgressionDegreeUsage back), the same
// two-way shape the rest of src/progression/ uses and safe for the same
// reason: neither side reads the other's exports at module top level
// (ARCHITECTURE.md §6.13-§6.22).
//
// **Snapping never overrides an explicitly-notated pattern.** A chord written
// `C-3` carries `defaultPatternIndex`, which is the user naming a shape by
// hand; those chords are excluded from selection (they still count toward
// scoring an Auto anchor, since they are part of where the progression sits).

import { areEnharmonicEquivalent, stripOctave as notationStripOctave } from '../theory/notation';
import { getPrimaryRootNote } from '../scales';
import { fretboardState } from '../fretboard/state';
import { findRowRootAbsoluteFret, getScalePositionWindow } from '../fretboard/ui/scalePositionGrid';
import { progressionState } from './state';

export const SNAP_ANCHOR_AUTO = 'auto';

// A shape that pokes outside the position's window is worse than one that
// merely sits off-center inside it, and by more than the widest possible
// off-center penalty (half a 7-fret window) - so fitting always wins, and
// centering only breaks ties among shapes that fit.
const OUTSIDE_WINDOW_WEIGHT = 10;

/**
 * @param {Object} pattern - a getChordPatternMatches() entry
 * @returns {{min: number, max: number}} fret span of the shape
 */
function patternFretRange(pattern) {
    const frets = pattern.positions.map(position => position.fret);
    return { min: Math.min(...frets), max: Math.max(...frets) };
}

/**
 * How badly a shape misses a position. Lower is better; 0 is a shape centered
 * exactly in the window.
 */
function patternCost(pattern, window) {
    const { min, max } = patternFretRange(pattern);
    const outside = Math.max(0, window.start - min) + Math.max(0, max - window.end);
    const offCenter = Math.abs((min + max) / 2 - (window.start + window.end) / 2);
    return outside * OUTSIDE_WINDOW_WEIGHT + offCenter;
}

/**
 * The chords snapping is allowed to move, with the shapes each can choose
 * from. Chords with no precomputed patterns (unresolvable tokens, or a chord
 * the shape library has nothing for) contribute nothing either way.
 * @returns {Array<{index: number, patterns: Array<Object>, locked: boolean}>}
 */
function getSnapCandidates() {
    const candidates = [];

    progressionState.currentProgression.forEach((chord, index) => {
        if (!chord) return;
        const patternData = progressionState.precomputedPatternData.get(index);
        if (!patternData || !patternData.patterns || patternData.patterns.length === 0) return;
        candidates.push({
            index,
            patterns: patternData.patterns,
            locked: chord.defaultPatternIndex !== undefined
        });
    });

    return candidates;
}

/**
 * The scale positions available to anchor on - the Scale Position Grid's rows,
 * in grid order, each carrying the absolute fret its root sits at for the
 * active scale/tuning. Recomputed on read rather than cached: both the row set
 * (tuning) and the anchor frets (scale root) change under it.
 * @returns {Array<{rowIndex: number, label: string, anchorFret: number}>}
 */
export function getSnapAnchorRows() {
    const rootNote = getPrimaryRootNote();
    if (!rootNote) return [];

    return fretboardState.SCALE_POSITION_ROW_STRINGS
        .map((stringIndex, rowIndex) => ({
            rowIndex,
            label: fretboardState.SCALE_POSITION_ROW_LABELS[rowIndex],
            anchorFret: findRowRootAbsoluteFret(stringIndex, rootNote)
        }))
        .filter(row => row.anchorFret !== null);
}

/**
 * Total miss across the progression if it were played in one position.
 */
function positionCost(anchorFret, candidates) {
    const window = getScalePositionWindow(anchorFret);
    return candidates.reduce(
        (total, candidate) => total + Math.min(...candidate.patterns.map(pattern => patternCost(pattern, window))),
        0
    );
}

/**
 * Which position the progression is anchored on: the user's pick, or - on
 * SNAP_ANCHOR_AUTO - the position the current chords fit into most tightly.
 * @returns {{rowIndex: number, label: string, anchorFret: number}|null}
 */
export function resolveSnapAnchorRow() {
    const rows = getSnapAnchorRows();
    if (rows.length === 0) return null;

    if (progressionState.snapAnchorRow !== SNAP_ANCHOR_AUTO) {
        const picked = rows.find(row => row.rowIndex === progressionState.snapAnchorRow);
        if (picked) return picked;
    }

    const candidates = getSnapCandidates();
    if (candidates.length === 0) return rows[0];

    return rows
        .map(row => ({ row, cost: positionCost(row.anchorFret, candidates) }))
        .reduce((best, entry) => (entry.cost < best.cost ? entry : best))
        .row;
}

/**
 * Point every snappable chord at its best shape for the anchored position, and
 * record which position that was (`progressionState.snapResolvedRow`, which is
 * what the grid accents). A no-op with the toggle off, so callers can invoke it
 * unconditionally after any change that could move the progression.
 * @returns {{rowIndex: number, label: string, anchorFret: number}|null}
 */
export function applySnapToProgression() {
    if (!progressionState.snapShapes) {
        progressionState.snapResolvedRow = null;
        return null;
    }

    const anchorRow = resolveSnapAnchorRow();
    progressionState.snapResolvedRow = anchorRow ? anchorRow.rowIndex : null;
    if (!anchorRow) return null;

    const window = getScalePositionWindow(anchorRow.anchorFret);

    getSnapCandidates().forEach(({ index, patterns, locked }) => {
        if (locked) return;

        let bestIndex = 0;
        let bestCost = Infinity;
        patterns.forEach((pattern, patternIndex) => {
            const cost = patternCost(pattern, window);
            if (cost < bestCost) {
                bestCost = cost;
                bestIndex = patternIndex;
            }
        });

        progressionState.selectedPatternIndexes.set(index, bestIndex);
    });

    return anchorRow;
}

/**
 * A chord's root as a bare note name, however it was written.
 */
function getChordRootNote(chord) {
    if (chord.resolvedRoot) {
        return notationStripOctave(chord.resolvedRoot);
    }
    if (chord.chordInfo && chord.chordInfo.notes && chord.chordInfo.notes.length > 0) {
        return notationStripOctave(chord.chordInfo.notes[0]);
    }
    return null;
}

/**
 * Which scale degrees the current progression uses, keyed by the Scale
 * Position Grid's own column index (0 = degree I), so the grid can light up
 * the cells a progression actually calls for.
 *
 * **Matched by root note, not by Roman numeral.** A chord written `Am` and a
 * chord written `vi` are the same cell, and a borrowed chord written `bVII`
 * carries a degree number but no column - its root is not in the scale, so it
 * is deliberately absent from the result rather than lighting up degree VII.
 *
 * @param {Array<string>} scaleNotes - the grid's working scale, in degree order
 * @returns {Map<number, Array<string>>} column index -> chord tokens using it
 */
export function getProgressionDegreeUsage(scaleNotes) {
    const usage = new Map();
    if (!Array.isArray(scaleNotes) || scaleNotes.length === 0) return usage;

    progressionState.currentProgression.forEach((chord) => {
        if (!chord || chord.isInvalid) return;

        const rootNote = getChordRootNote(chord);
        if (!rootNote) return;

        const column = scaleNotes.findIndex(note => areEnharmonicEquivalent(note, rootNote));
        if (column === -1) return;

        if (!usage.has(column)) {
            usage.set(column, []);
        }
        usage.get(column).push((chord.originalToken || rootNote).replace(/-\d+$/, ''));
    });

    return usage;
}
