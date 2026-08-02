// Draws chord/scale content on the main chord-progression fretboard (not
// the per-card mini fretboards, see the chord-card cluster still in
// progressionBuilder.js). Used when a chord is hovered/selected, when the
// active scale changes, and to reset the display when the progression is
// cleared.
//
// getFretboardForProgression is imported back from progressionBuilder.js
// rather than moved here - despite sitting right next to this block by file
// position, grepping its call sites found its three real callers are these
// three functions, not anything in progressionBuilder.js's own residual
// (REFACTOR_PLAN.md's Phase 4 investigation note, and the same "verify
// before trusting proximity" lesson ARCHITECTURE.md §6.15 already caught
// once). Same two-way-import shape as the rest of src/progression/
// (ARCHITECTURE.md §6.13-§6.16).
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { progressionState, CHORD_LINE_CONFIG } from './state';
import { precomputePatternData } from './parse';
import { getFretboardForProgression } from '../progressionBuilder';

/**
 * Display a single chord pattern on the fretboard
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

    // Clear only chord lines, keep scale context if enabled
    fretboard.clearChordLines();

    // Show scale context if toggle is checked
    const scaleToggle = document.getElementById('chord-progression-scale-toggle');
    const showScaleContext = scaleToggle && scaleToggle.checked;

    if (showScaleContext) {
        // Re-display scale context
        displayScaleContext();
    } else {
        // Clear all markers if scale context is disabled
        fretboard.clearMarkers();
    }

    // Display chord notes regardless of whether patterns exist
    const { chordNotes, patterns, displayName, hasPatterns } = patternData;
    const chordIntervalLabels = chord.chordInfo && Array.isArray(chord.chordInfo.intervals)
        ? chord.chordInfo.intervals
        : [];
    const chordDisplayOptions = {
        clearFirst: false,
        showLines: false,
        showScaleContext: showScaleContext,
        showIntervals: progressionState.showFretboardIntervals,
        intervalLabels: chordIntervalLabels
    };

    // If no patterns are available, show chord notes with enhanced visibility when hovered
    if (!hasPatterns) {
        // Display the chord normally
        fretboard.displayChord(chordNotes, displayName, chordDisplayOptions);

        // If highlighted (hovered), add a visual indicator by displaying again with different name
        if (isHighlighted) {
            // Add a special indicator to the chord name to show it's being highlighted
            const highlightedName = `🎯 ${displayName} (Notes Only)`;
            fretboard.displayChord(chordNotes, highlightedName, {
                ...chordDisplayOptions,
                forceHighlight: true // If this option exists
            });
        }
        return;
    }

    // Regular chord display for chords with patterns
    fretboard.displayChord(chordNotes, displayName, chordDisplayOptions);

    const selectedPatternIndex = progressionState.selectedPatternIndexes.get(index) || 0;
    if (selectedPatternIndex >= patterns.length) return;

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
 * Display scale context on the fretboard
 */
function displayScaleContext() {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;

    // Try to access the global scale display function
    if (typeof window.showScaleOnFretboard === 'function') {
        window.showScaleOnFretboard(false); // false to not clear existing content
    } else {
        // Fallback: try to trigger scale display through button click
        const scaleButton = document.querySelector('[data-chord-index="0"]');
        if (scaleButton) {
            // Simulate scale button activation without clearing other content
            const event = new Event('mouseenter');
            scaleButton.dispatchEvent(event);
        }
    }
}

/**
 * Display all chord patterns from the progression on the fretboard
 */
function displayAllChordPatterns() {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;

    // Clear only chord lines, preserve scale context if enabled
    fretboard.clearChordLines();

    // Show scale context if toggle is checked
    const scaleToggle = document.getElementById('chord-progression-scale-toggle');
    const showScaleContext = scaleToggle && scaleToggle.checked;

    if (showScaleContext) {
        displayScaleContext();
    } else {
        fretboard.clearMarkers();
    }

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
    displayScaleContext,
    displayAllChordPatterns
};
