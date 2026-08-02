// Keeps the chord progression in sync with the active scale/root note,
// which is owned by scaleGenerator.js and can change from several places
// in the app (the Scale Selection tab, hotkeys, a shared URL). Re-resolves
// any Roman-numeral chords in the progression against the new scale,
// refreshes the scale-notes display, and re-renders both the progression
// list and the main fretboard so mini pianos/staves and Roman numerals
// reflect the new context.
//
// precomputeAllPatternData/updateProgressionDisplay are imported back from
// progressionBuilder.js - neither has moved out of it yet (they belong to
// the not-yet-extracted progression-list cluster, see REFACTOR_PLAN.md's
// Phase 4 investigation note). displaySingleChordPattern/
// displayAllChordPatterns moved to fretboardDisplay.js in a later step and
// are imported from there instead. Same two-way-import shape as the rest
// of src/progression/ (ARCHITECTURE.md §6.13-§6.16).
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { getPrimaryScale, getPrimaryRootNote } from '../scaleGenerator';
import { getScaleNotes } from '../scales';
import { CHROMATIC } from '../theory/notes';
import { resolveRomanChord } from '../theory/roman';
import { progressionState } from './state';
import {
    precomputeAllPatternData,
    updateProgressionDisplay
} from '../progressionBuilder';
import {
    displaySingleChordPattern,
    displayAllChordPatterns
} from './fretboardDisplay';

/**
 * Set up listener for scale changes to update Roman numeral chords
 */
function setupScaleChangeListener() {
    // Store the current scale context for comparison
    let currentScale = getPrimaryScale();
    let currentRoot = getPrimaryRootNote();

    // Listen for scale change events from the scale generator
    window.addEventListener('scaleChanged', (event) => {
        const { primaryScale: newScale, rootNote: newRoot } = event.detail;

        if (newScale !== currentScale || newRoot !== currentRoot) {
            console.log('Scale change detected via event:', { oldScale: currentScale, newScale, oldRoot: currentRoot, newRoot });

            // Update stored values
            currentScale = newScale;
            currentRoot = newRoot;

            // Update progression display to refresh mini pianos and mini staves with new scale context
            updateProgressionDisplayForScaleChange();
        }
    });

    // Fallback: Check for scale changes periodically (in case event system fails)
    const checkForScaleChanges = () => {
        const newScale = getPrimaryScale();
        const newRoot = getPrimaryRootNote();

        if (newScale !== currentScale || newRoot !== currentRoot) {
            console.log('Scale change detected via polling fallback:', { oldScale: currentScale, newScale, oldRoot: currentRoot, newRoot });

            // Update stored values
            currentScale = newScale;
            currentRoot = newRoot;

            // Update progression display to refresh mini pianos and mini staves with new scale context
            updateProgressionDisplayForScaleChange();
        }
    };

    // Check every 2000ms for scale changes (reduced frequency since event system is primary)
    setInterval(checkForScaleChanges, 2000);

    // Also add a more frequent check specifically for scale notes display updates
    let lastDisplayedNotes = '';
    setInterval(() => {
        const scaleNotesDisplay = document.getElementById('scaleNotesDisplay');
        if (scaleNotesDisplay) {
            const currentDisplayedNotes = scaleNotesDisplay.textContent;
            if (currentDisplayedNotes === 'Loading...' || currentDisplayedNotes === 'No scale selected') {
                // Try to update if we're showing a fallback message
                updateScaleNotesDisplay();
            }
        }
    }, 1000);
}

/**
 * Initialize the scale notes display with retries to ensure data is loaded
 */
function initializeScaleNotesDisplay() {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 400;

    const tryUpdate = () => {
        const rootNote = getPrimaryRootNote();
        const primaryScale = getPrimaryScale();

        if (rootNote && primaryScale && primaryScale.intervals) {
            updateScaleNotesDisplay();
            return;
        }

        retryCount++;
        if (retryCount < maxRetries) {
            setTimeout(tryUpdate, retryDelay);
        } else {
            // Try to set a default
            const scaleNotesDisplay = document.getElementById('scaleNotesDisplay');
            if (scaleNotesDisplay) {
                scaleNotesDisplay.textContent = 'C D E F G A B';
            }
        }
    };

    tryUpdate();
}

/**
 * Update the scale notes display with current scale notes
 */
function updateScaleNotesDisplay() {
    const scaleNotesDisplay = document.getElementById('scaleNotesDisplay');
    if (!scaleNotesDisplay) return;

    try {
        const rootNote = getPrimaryRootNote();
        const primaryScale = getPrimaryScale();

        // Try to get scale notes, but provide fallbacks
        if (rootNote && primaryScale && primaryScale.intervals) {
            // Get the scale notes using the existing function
            const scaleNotes = getScaleNotes(rootNote, primaryScale.intervals);

            if (scaleNotes && scaleNotes.length > 0) {
                // Display the notes joined with spaces
                scaleNotesDisplay.textContent = scaleNotes.join(' ');
                return;
            }
        }

        // Fallback: Try to read from the current scale/root display elements
        const currentRootNode = document.getElementById('currentRootNode');
        const currentScaleNode = document.getElementById('currentScaleNode');

        if (currentRootNode && currentScaleNode) {
            const displayedRoot = currentRootNode.textContent?.trim();
            const displayedScale = currentScaleNode.textContent?.trim();

            // Simple fallback for common scales
            if (displayedRoot && displayedScale) {
                const fallbackNotes = generateFallbackScaleNotes(displayedRoot, displayedScale);
                if (fallbackNotes) {
                    scaleNotesDisplay.textContent = fallbackNotes;
                    return;
                }
            }
        }

        // If all else fails, try once more after a short delay
        setTimeout(() => {
            const retryRootNote = getPrimaryRootNote();
            const retryPrimaryScale = getPrimaryScale();

            if (retryRootNote && retryPrimaryScale && retryPrimaryScale.intervals) {
                const retryScaleNotes = getScaleNotes(retryRootNote, retryPrimaryScale.intervals);
                if (retryScaleNotes && retryScaleNotes.length > 0) {
                    scaleNotesDisplay.textContent = retryScaleNotes.join(' ');
                    return;
                }
            }

            scaleNotesDisplay.textContent = 'Loading...';
        }, 300);

    } catch (error) {
        console.error('Error updating scale notes display:', error);
        scaleNotesDisplay.textContent = 'Error loading notes';
    }
}

/**
 * Generate fallback scale notes for common scales
 * @param {string} root - Root note
 * @param {string} scaleName - Scale name
 * @returns {string|null} Scale notes string or null
 */
function generateFallbackScaleNotes(root, scaleName) {
    // Simple major scale pattern (whole and half steps)
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const chromaticNotes = CHROMATIC;

    // Find root note index
    let rootIndex = chromaticNotes.indexOf(root);
    if (rootIndex === -1) {
        // Try with flat notation
        const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        rootIndex = flatNotes.indexOf(root);
        if (rootIndex === -1) return null;
    }

    // For now, just handle major scales
    if (scaleName.toLowerCase().includes('major')) {
        const scaleNotes = majorIntervals.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return chromaticNotes[noteIndex];
        });
        return scaleNotes.join(' ');
    }

    return null;
}

/**
 * Update progression display when scale changes to refresh mini pianos, mini staves and Roman numerals
 */
function updateProgressionDisplayForScaleChange() {
    // First update any Roman numeral chords
    updateRomanNumeralChords();

    // Update the scale notes display
    updateScaleNotesDisplay();

    // Then refresh the entire progression display to update mini pianos and mini staves with new scale context
    // This ensures all mini pianos and mini staves (not just Roman numeral chords) show the updated scale
    updateProgressionDisplay();

    console.log('Progression display updated for scale change');
}

/**
 * Update Roman numeral chords when scale changes
 */
function updateRomanNumeralChords() {
    if (progressionState.currentProgression.length === 0) return;

    let progressionChanged = false;
    const indicesToInvalidate = [];

    // Update each Roman numeral chord in the progression
    progressionState.currentProgression.forEach((chord, index) => {
        if (chord.type === 'roman') {
            const updatedChord = resolveRomanChord(chord, progressionState.useSeventhChords);
            if (updatedChord && updatedChord.chordInfo) {
                // Update the chord with new scale context
                progressionState.currentProgression[index] = updatedChord;
                progressionChanged = true;
                indicesToInvalidate.push(index);

                console.log(`Updated Roman numeral ${chord.originalToken} to:`, updatedChord.chordInfo.name);
            } else {
                console.warn(`Could not resolve Roman numeral ${chord.originalToken} in new scale context`);
                // Keep the original chord but mark it as potentially invalid
                progressionState.currentProgression[index].isInvalid = true;
                indicesToInvalidate.push(index);
            }
        }
    });

    if (progressionChanged) {
        // Invalidate cached pattern data for changed chords
        indicesToInvalidate.forEach(index => {
            progressionState.precomputedPatternData.delete(index);
        });

        // Reset pattern selections for updated chords
        progressionState.selectedPatternIndexes.clear();

        // Precompute pattern data for updated chords
        precomputeAllPatternData();

        // Update the display
        updateProgressionDisplay();

        // Refresh fretboard display
        if (progressionState.hoveredChordIndex !== null && progressionState.currentProgression[progressionState.hoveredChordIndex]) {
            displaySingleChordPattern(progressionState.currentProgression[progressionState.hoveredChordIndex], progressionState.hoveredChordIndex, true);
        } else {
            displayAllChordPatterns();
        }
    }
}

export {
    setupScaleChangeListener,
    initializeScaleNotesDisplay
};
