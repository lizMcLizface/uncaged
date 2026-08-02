import { resolveRomanChord } from '../theory/roman';
import { subscribe as subscribeToInstrumentChanges } from '../tuning';
import { initializeNavigationButtonsDirect } from '../scaleGenerator';
import {
    progressionState,
    MINI_FRETBOARD_CONFIG
} from './state';
import {
    clearCache,
    precomputePatternData,
    parseProgressionInput
} from './parse';
import {
    loadSharedStateFromURL,
    applySharedState
} from './share';
import { getProcessedProgression } from './playback';
import {
    setupScaleChangeListener,
    initializeScaleNotesDisplay
} from './scaleSync';
import {
    displayScaleContext,
    displayAllChordPatterns
} from './fretboardDisplay';
import {
    createProgressionDisplaySection,
    updateProgressionDisplay
} from './progressionList';
import { createInputSection } from './input';
import { createProgressionControlsSection } from './controls';

/**
 * Get the fretboard instance for chord progression operations
 * @returns {Object|null} Fretboard instance or null if not available
 */
function getFretboardForProgression() {
    return window.chordProgressionFretboard || null;
}

/**
 * Chord Progression Builder
 *
 * This module handles the parsing, validation, and display of chord progressions
 * using both explicit chord names and Roman numeral notation.
 *
 * Pattern Notation:
 * Chords can specify a default pattern position using the syntax: chord-position
 * Examples:
 *   C-1      → C major chord, first pattern (pattern index 0)
 *   iv-3     → Fourth degree minor chord, third pattern (pattern index 2)
 *   Dm7-2    → D minor 7 chord, second pattern (pattern index 1)
 *
 * Sharing System:
 * The sharing functionality encodes the current state (chord progression with patterns,
 * UI settings, scale/root note) into a Base64-encoded URL parameter. When the page loads
 * with a share parameter, it automatically restores all settings and progressions.
 *
 * Example shared URL: https://site.com/?share=eyJwcm9ncmVzc2lvbiI6I...
 *
 * State includes:
 * - Chord progression with selected patterns (e.g., "C-1 Am-2 F-1 G-3")
 * - Show scale context toggle
 * - Mini fretboards toggle
 * - Mini pianos toggle
 * - Mini staves toggle
 * - Use seventh chords toggle
 * - Current root note (human readable, e.g., "C", "F♯")
 * - Current scale (human readable, e.g., "Major-1", "Minor-1")
 */

// Keep mini fretboards and cached pattern data in sync with the active
// instrument/tuning (changed via the picker in frets.js's top bar).
subscribeToInstrumentChanges((config) => {
    MINI_FRETBOARD_CONFIG.stringCount = config.stringCount;
    progressionState.precomputedPatternData.clear();
    progressionState.selectedPatternIndexes.clear();
    updateProgressionDisplay();
});

/**
 * Create the chord progression UI
 * @param {string} containerId - ID of the container element
 */
/**
 * Create the chord progression UI and return the container element
 * @param {Object} fretboard - Fretboard instance to interact with
 * @returns {HTMLElement} The chord progression container element
 */
function createChordProgressionUI(fretboard) {
    // Store fretboard reference for later use
    if (fretboard) {
        window.chordProgressionFretboard = fretboard;

        // Set up scale change listener
        setupScaleChangeListener();
    }

    // Create main container
    const progressionContainer = document.createElement('div');
    progressionContainer.className = 'chord-progression-container';
    progressionContainer.style.cssText = `
        margin: 20px 0;
        padding: 20px;
        background: #353535;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    // Create input section
    const inputSection = createInputSection();
    progressionContainer.appendChild(inputSection);

    // Create controls section
    const controlsSection = createProgressionControlsSection();
    progressionContainer.appendChild(controlsSection);

    // Create progression display section
    const displaySection = createProgressionDisplaySection();
    progressionContainer.appendChild(displaySection);

    // Reinitialize navigation buttons since we've created new root and scale buttons
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        initializeNavigationButtonsDirect();
        // Initialize the scale notes display with current scale (with retries)
        initializeScaleNotesDisplay();
    }, 100);

    return progressionContainer;
}

/**
 * Update the progression based on input text
 * @param {string} progressionText - Input text
 */
function updateProgression(progressionText) {
    const parsedProgression = parseProgressionInput(progressionText);

    // Resolve Roman numerals to actual chords
    const resolvedProgression = parsedProgression.map(chord => {
        if (chord.type === 'roman') {
            return resolveRomanChord(chord, progressionState.useSeventhChords) || chord;
        }
        return chord;
    });

    // Reset hover state when progression changes
    progressionState.hoveredChordIndex = null;

    progressionState.currentProgression = resolvedProgression;
    window.currentProgression = progressionState.currentProgression; // Update global reference

    // Also provide processed progression for sequencer
    window.processedProgression = getProcessedProgression();

    // If progression sequencer is currently playing, update it with new progression
    if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
        const state = window.polySynthRef.getProgressionSequencerState();
        if (state.playing && window.polySynthRef.updateProgressionSettings) {
            const processedProgression = getProcessedProgression();
            window.polySynthRef.updateProgressionSettings(processedProgression);
            console.log('🔄 Updated playing progression with', processedProgression.length, 'chords (with processed notes)');
        }
    }

    // Precompute pattern data for all chords to optimize hover performance
    precomputeAllPatternData();

    // Update display
    updateProgressionDisplay();

    // Update fretboard display
    displayAllChordPatterns();
}

/**
 * Precompute pattern data for all chords in the current progression
 */
function precomputeAllPatternData() {
    // Clear any pattern data for indices that exceed the current progression length
    const indicesToRemove = [];
    for (let index of progressionState.precomputedPatternData.keys()) {
        if (index >= progressionState.currentProgression.length) {
            indicesToRemove.push(index);
        }
    }
    indicesToRemove.forEach(index => {
        progressionState.precomputedPatternData.delete(index);
        progressionState.selectedPatternIndexes.delete(index);
    });

    // Compute pattern data for all current chords
    progressionState.currentProgression.forEach((chord, index) => {
        // Always recompute to ensure fresh data
        const patternData = precomputePatternData(chord, index);
        progressionState.precomputedPatternData.set(index, patternData);
    });
}

/**
 * Clear the current progression and default to scale display
 */
function clearProgression() {
    progressionState.currentProgression = [];
    window.currentProgression = progressionState.currentProgression; // Update global reference
    progressionState.hoveredChordIndex = null;
    progressionState.selectedPatternIndexes.clear();

    // Clear caches
    clearCache();

    const input = document.getElementById('chord-progression-input');
    if (input) {
        input.value = '';
    }

    updateProgressionDisplay();

    const fretboard = getFretboardForProgression();
    if (fretboard) {
        fretboard.clearMarkers();
        fretboard.clearChordLines();

        // Default back to scale display and activate scale button
        displayScaleContext();

        // Activate the scale button (first button in Roman numeral controls)
        const scaleButton = document.querySelector('[data-chord-index="0"]');
        if (scaleButton) {
            // Set visual state to active
            scaleButton.style.background = 'linear-gradient(to bottom, #d4edda, #c3e6cb)';
            scaleButton.style.color = '#155724';

            // Update the current displayed chord state in the parent context
            if (typeof window.currentDisplayedChord !== 'undefined') {
                window.currentDisplayedChord = 0; // Scale button
            }

            // Update button styles if the function exists
            if (typeof window.updateChordButtonStyles === 'function') {
                window.updateChordButtonStyles();
            }
        }
    }
}

// Public barrel surface for src/progression/ - same pattern as
// src/fretboard/index.js (Phase 3). createChordProgressionUI/
// loadSharedStateFromURL are this file's real external exports (used by
// src/fretboard/ui/controls.js); the rest are cross-imported back by
// sibling modules in this folder, same two-way-import shape documented in
// each of their own headers (ARCHITECTURE.md §6.13-§6.21).
export {
    createChordProgressionUI,
    updateProgression,
    clearProgression,
    loadSharedStateFromURL,
    applySharedState,
    getFretboardForProgression,
    precomputeAllPatternData
};
