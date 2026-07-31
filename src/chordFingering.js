/**
 * Shared, framework-free logic for suggesting guitar chord fingerings.
 * Operates on plain {string, fret} position objects — no dependency on the
 * Fretboard class or any particular coordinate system, so it can be reused
 * by both the main fretboard (real absolute frets) and the scale position
 * grid's mini SVG fretboards (relative display columns resolved to frets).
 */

/**
 * Assign a best-effort finger number to each position of a chord voicing.
 * This is a simple, "somewhat natural" heuristic, not classical fingering
 * theory: fingers are assigned to distinct fretted positions in ascending
 * order, with a single barre detected at the lowest fret when it covers
 * multiple strings. It does not consider hand geometry, alternate-finger
 * preference, or thumb use.
 *
 * @param {Array<{string: number, fret: number}>} positions - one entry per
 *   string actually sounded in the voicing (fret 0 = open string).
 * @returns {Array} the same array, each position augmented with `.finger`:
 *   0 = open string, 1-4 = index..pinky, null = unplayable by this heuristic
 *   (more distinct fretted positions than fingers can cover).
 */
export function assignFingers(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
        return positions;
    }

    positions.forEach(pos => {
        if (pos.fret === 0) {
            pos.finger = 0;
        }
    });

    const fretted = positions.filter(pos => pos.fret > 0);
    if (fretted.length === 0) {
        return positions;
    }

    const distinctFrets = [...new Set(fretted.map(pos => pos.fret))].sort((a, b) => a - b);
    const minFret = distinctFrets[0];
    const atMinFret = fretted.filter(pos => pos.fret === minFret);
    // A barre only makes sense when it covers >=2 strings at the lowest fret
    // and there's a manageable number of remaining frets left to cover.
    const useBarre = atMinFret.length >= 2 && distinctFrets.length >= 2 && distinctFrets.length <= 4;

    if (useBarre) {
        atMinFret.forEach(pos => { pos.finger = 1; });
        const remainingFrets = distinctFrets.slice(1);
        remainingFrets.forEach((fret, index) => {
            const finger = index < 3 ? index + 2 : null;
            fretted.filter(pos => pos.fret === fret).forEach(pos => { pos.finger = finger; });
        });
        return positions;
    }

    distinctFrets.forEach((fret, index) => {
        const finger = index < 4 ? index + 1 : null;
        fretted.filter(pos => pos.fret === fret).forEach(pos => { pos.finger = finger; });
    });

    return positions;
}

/**
 * Reduce a list of candidate positions (which may include multiple
 * occurrences per string) down to a single playable grip: one position per
 * string, preferring whichever occurrence sits closest to a preferred fret.
 * @param {Array<{string: number, fret: number}>} positions
 * @param {number} preferredFret
 * @returns {Array} one entry per represented string, sorted by string index
 */
export function selectGripFromPositions(positions, preferredFret = 0) {
    if (!Array.isArray(positions) || positions.length === 0) {
        return [];
    }

    const byString = new Map();
    positions.forEach(pos => {
        const existing = byString.get(pos.string);
        if (!existing || Math.abs(pos.fret - preferredFret) < Math.abs(existing.fret - preferredFret)) {
            byString.set(pos.string, pos);
        }
    });

    return [...byString.values()].sort((a, b) => a.string - b.string);
}

/**
 * Classify whether a chord match came from a known chordPatterns.js shape
 * ('predefined') or was generated generically ('best-effort').
 * @param {{patternName?: string}|null} match
 * @returns {'predefined'|'best-effort'}
 */
export function classifyFingeringSource(match) {
    return match && match.patternName ? 'predefined' : 'best-effort';
}

const chordFingering = {
    assignFingers,
    selectGripFromPositions,
    classifyFingeringSource
};

export default chordFingering;
