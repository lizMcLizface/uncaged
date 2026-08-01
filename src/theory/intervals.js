/**
 * Semitone -> interval label/color, shared so a given scale tone reads as
 * the same label and color everywhere in the app: the scale piano, every
 * chord piano, and the fretboard. Framework-free.
 *
 * Consolidated in Phase 2 from two verified-identical copies:
 * components/MiniPiano/MiniPiano.js's INTERVAL_COLORS/INTERVAL_LABELS and
 * frets.js's inline getIntervalColor color array / SEMITONE_TO_INTERVAL_LABEL.
 */

const INTERVAL_COLORS = [
    '#ff4d4d', // R
    '#ff8a3d', // b2
    '#ffb347', // 2
    '#ffd34f', // b3
    '#d2f25f', // 3
    '#8fdc5b', // 4
    '#4dd6b8', // b5
    '#45b6ff', // 5
    '#5a88ff', // b6
    '#7a6cff', // 6
    '#a46cff', // b7
    '#d26bff'  // 7
];

const INTERVAL_LABELS = ['R', 'm2', 'M2', 'm3', 'M3', 'P4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7'];

/**
 * Color for a given interval distance from a reference root.
 * @param {number} semitone - 0-11
 * @returns {string} Hex color
 */
function getIntervalColor(semitone) {
    return INTERVAL_COLORS[((semitone % 12) + 12) % 12];
}

/**
 * Standard interval name for a given semitone distance (0-11).
 * @param {number} semitone
 * @returns {string}
 */
function getIntervalLabel(semitone) {
    return INTERVAL_LABELS[((semitone % 12) + 12) % 12];
}

export { INTERVAL_COLORS, INTERVAL_LABELS, getIntervalColor, getIntervalLabel };
