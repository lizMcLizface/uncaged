// Draws chord/scale content on the main chord-progression fretboard (not
// the per-card mini fretboards, see src/progression/chordCard.js). Used
// when a chord is hovered/selected, when the active scale changes, and to
// reset the display when the progression is cleared.
//
// **Markers go through the visualization stack; chord lines do not.**
// VISUALIZATION_STACK_PLAN.md section 8.2 left this file as "the one
// documented legacy writer", fighting the stack rather than using it, and
// every symptom that decision predicted turned up in use: clearing the
// progression blanked the neck instead of falling back to the scale, leaving
// a card left it blank too, and moving between a card and its mini piano
// swapped between two different renderings of the same chord (the direct
// path's plain white markers and the stack's dimmed-and-labelled ones).
// A hovered chord is now `pushChordPreview` / `popPreviewLayer` like every
// other preview source, so "what is underneath" is the base scale layer and
// is never destroyed.
//
// Chord *lines* stay a direct call: they are a separate SVG overlay with
// their own keyed lifecycle and the stack does not model them
// (VISUALIZATION_STACK_PLAN.md section 2.5). This file still owns them, and
// `drawChordLine`/`clearChordLines` are the only fretboard methods it calls.
//
// getFretboardForProgression is imported back from the barrel
// (src/progression/index.js, formerly progressionBuilder.js, renamed in
// Phase 4's final step) rather than moved here - despite sitting right
// next to this block by file position, grepping its call sites found its
// three real callers are these three functions, not anything in the
// residual (REFACTOR_PLAN.md's Phase 4 investigation note, and the same
// "verify before trusting proximity" lesson ARCHITECTURE.md §6.15 already
// caught once). Same two-way-import shape as the rest of src/progression/
// (ARCHITECTURE.md §6.13-§6.21).
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { progressionState, CHORD_LINE_CONFIG } from './state';
import { precomputePatternData } from './parse';
import { getFretboardForProgression } from '.';
import { pushChordPreview, popPreviewLayer } from '../fretboard';

/**
 * Whether the tab's "Show Scale Context" checkbox wants the active scale
 * visible under a hovered chord.
 *
 * A missing checkbox counts as *enabled*, which inverts the old reading
 * (`scaleToggle && scaleToggle.checked`). The checkbox is created checked
 * (controls.js), so "absent" only happens before the progression UI is
 * built - and defaulting to hiding the scale there would blank the neck for
 * a reason that has nothing to do with what the user chose.
 */
function isScaleContextEnabled() {
    const scaleToggle = document.getElementById('chord-progression-scale-toggle');
    return scaleToggle ? scaleToggle.checked : true;
}

/**
 * Display a single chord pattern on the fretboard
 *
 * The chord itself is a preview layer, so the active scale stays underneath
 * it - dimmed and labelled with "Show Scale Context" on, hidden with it off -
 * and `displayAllChordPatterns` reveals it again by popping rather than by
 * redrawing. The marker styling is now the stack's, shared with every other
 * chord source, which is what makes hovering a card and hovering its mini
 * piano look the same instead of like two different features.
 *
 * @param {Object} chord - Chord data
 * @param {number} index - Chord index
 * @param {boolean} isHighlighted - Whether this chord should be highlighted
 */
function displaySingleChordPattern(chord, index, isHighlighted = false) {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;

    // Use precomputed pattern data if available
    let patternData = progressionState.precomputedPatternData.get(index);
    if (!patternData || !patternData.chord || patternData.chord !== chord) {
        // Fallback to computing on demand, or recompute if chord has changed
        patternData = precomputePatternData(chord, index);
        progressionState.precomputedPatternData.set(index, patternData);
    }

    // Chord lines are this file's own overlay and are rebuilt every call;
    // the markers underneath them are the stack's and are pushed, not drawn.
    fretboard.clearChordLines();

    const { chordNotes, patterns, displayName } = patternData;
    pushChordPreview(chordNotes, chordNotes && chordNotes[0], displayName, {
        hideScale: !isScaleContextEnabled()
    });

    const selectedPatternIndex = progressionState.selectedPatternIndexes.get(index) || 0;
    if (!patterns.length || selectedPatternIndex >= patterns.length) return;

    const pattern = patterns[selectedPatternIndex];

    // Add pattern lines with dynamic styling
    if (pattern.positions.length > 1) {
        const linePoints = pattern.positions.map(pos => ({
            string: pos.string,
            fret: pos.fret
        }));

        const lineConfig = isHighlighted ? {
            color: '#ff3d00', // Brighter orange for highlighted
            lineWidth: CHORD_LINE_CONFIG.highlightedWidth,
            style: 'solid',
            opacity: CHORD_LINE_CONFIG.hoverOpacity,
            label: '',
            labelPosition: 'middle'
        } : {
            color: '#ff6b35',
            lineWidth: CHORD_LINE_CONFIG.normalWidth,
            style: 'solid',
            opacity: CHORD_LINE_CONFIG.normalOpacity,
            label: '',
            labelPosition: 'middle'
        };

        fretboard.drawChordLine(`progression-pattern-${index}`, linePoints, lineConfig);
    }
}

/**
 * Display all chord patterns from the progression on the fretboard - which
 * is also "nothing is hovered any more", and how the neck gets back to the
 * scale after a card is left or the progression is cleared.
 *
 * Popping the preview is the whole of that restore. There used to be a
 * `displayScaleContext` here that reached for `window.showScaleOnFretboard`
 * and, failing that, dispatched a synthetic `mouseenter` at the Scale button
 * - VISUALIZATION_STACK_PLAN.md section 8.2's legacy path. Both branches
 * re-derived a scale that the base layer had never stopped holding, and
 * neither ran when "Show Scale Context" was off, which is why leaving a card
 * (and clearing the progression) left a blank neck.
 */
function displayAllChordPatterns() {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;

    // Clear only chord lines; the scale under them is the base layer and
    // comes back on its own once the hovered chord is popped.
    fretboard.clearChordLines();
    popPreviewLayer();

    if (progressionState.currentProgression.length === 0) return;

    // Color cycle for different chords
    const colors = [
        '#1f77b4', // blue
        '#ff7f0e', // orange
        '#2ca02c', // green
        '#d62728', // red
        '#9467bd', // purple
        '#8c564b', // brown
        '#e377c2', // pink
        '#7f7f7f', // gray
        '#bcbd22', // olive
        '#17becf'  // cyan
    ];

    progressionState.currentProgression.forEach((chord, index) => {
        // Use precomputed pattern data if available
        let patternData = progressionState.precomputedPatternData.get(index);
        if (!patternData || !patternData.chord || patternData.chord !== chord) {
            // Fallback to computing on demand, or recompute if chord has changed
            patternData = precomputePatternData(chord, index);
            progressionState.precomputedPatternData.set(index, patternData);
        }

        const { patterns } = patternData;
        if (!patterns.length) return;

        const selectedPatternIndex = progressionState.selectedPatternIndexes.get(index) || 0;
        if (selectedPatternIndex >= patterns.length) return;

        const pattern = patterns[selectedPatternIndex];
        const color = colors[index % colors.length];

        // Draw pattern lines with thicker lines
        if (pattern.positions.length > 1) {
            const linePoints = pattern.positions.map(pos => ({
                string: pos.string,
                fret: pos.fret
            }));

            fretboard.drawChordLine(`progression-all-${index}`, linePoints, {
                color: color,
                lineWidth: CHORD_LINE_CONFIG.normalWidth,
                style: 'solid',
                opacity: CHORD_LINE_CONFIG.normalOpacity,
                label: '',
                labelPosition: 'middle'
            });
        }
    });
}

export {
    displaySingleChordPattern,
    displayAllChordPatterns
};
