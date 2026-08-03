// URL-based sharing for the chord progression builder: encode the current
// progression/UI-toggle/scale state into URL parameters (a compact
// human-readable format, plus a legacy Base64 fallback), and decode +
// apply it back on load.
//
// updateProgression is imported back from the barrel
// (src/progression/index.js, formerly progressionBuilder.js, renamed in
// Phase 4's final step) rather than moved here - applySharedState() is
// this module's only caller of it, and it's the app's main
// progression-input entry point, called from many places that stay in the
// residual. Same two-way-import shape REFACTOR_PLAN.md Phase 3 used
// between src/fretboard/ui/*.js and src/fretboard/index.js, and Phase 4's
// own parse.js <-> the barrel (ARCHITECTURE.md §6.8/§6.13) - safe because
// nothing here is read at module top level.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { getPrimaryScale, getPrimaryRootNote, setPrimaryRootNote, setPrimaryScale } from '../scales';
import { progressionState } from './state';
import { updateProgression } from '.';

/**
 * Build a shareable state object containing all relevant progression and UI state
 * @returns {Object} State object for sharing
 */
function buildShareableState() {
    const state = {
        // Chord progression with selected patterns
        progression: progressionState.currentProgression.map((chord, index) => {
            const baseToken = chord.originalToken ? chord.originalToken.replace(/-\d+$/, '') : '';
            const selectedPattern = progressionState.selectedPatternIndexes.get(index);

            if (selectedPattern !== undefined && selectedPattern !== null) {
                return `${baseToken}-${selectedPattern + 1}`;
            }
            return baseToken;
        }).join(' '),

        // UI state flags - read from actual UI elements
        showScaleContext: (() => {
            const scaleToggle = document.getElementById('chord-progression-scale-toggle');
            return scaleToggle ? scaleToggle.checked : (window.showScaleContext || true); // Default to true if no checkbox found
        })(),
        showMiniFretboards: progressionState.showMiniFretboards,
        showFretboardIntervals: progressionState.showFretboardIntervals,
        showMiniPianos: progressionState.showMiniPianos,
        useSeventhChords: progressionState.useSeventhChords,

        // Scale settings (human readable)
        rootNote: getPrimaryRootNote() || 'C',
        scale: getPrimaryScale() || 'Major-1'
    };

    return state;
}

/**
 * Encode state object to human-readable URL parameters
 * @param {Object} state - State object to encode
 * @returns {URLSearchParams} URL parameters object
 */
function encodeStateToURLParams(state) {
    const params = new URLSearchParams();

    // Core progression - this is the most important part
    if (state.progression) {
        params.set('p', state.progression);
    }

    // Scale settings (compact format)
    if (state.rootNote && state.rootNote !== 'C') {
        params.set('r', state.rootNote);
    }
    if (state.scale && state.scale !== 'Major-1') {
        params.set('s', state.scale);
    }

    // UI flags - only include if different from defaults
    const flags = [];
    if (!state.showScaleContext) flags.push('h'); // hide scale context
    if (state.showMiniFretboards) flags.push('f'); // show fretboards
    if (state.showMiniPianos) flags.push('k'); // show keyboards (pianos)
    if (!state.useSeventhChords) flags.push('n'); // no sevenths

    if (flags.length > 0) {
        params.set('ui', flags.join(''));
    }

    return params;
}

/**
 * Decode URL parameters back to state object
 * @param {URLSearchParams} params - URL parameters to decode
 * @returns {Object} Decoded state object
 */
function decodeStateFromURLParams(params) {
    const state = {
        // Defaults
        showScaleContext: true,
        showMiniFretboards: false,
        showMiniPianos: false,
        useSeventhChords: true,
        rootNote: 'C',
        scale: 'Major-1'
    };

    // Decode progression
    if (params.has('p')) {
        state.progression = params.get('p');
    }

    // Decode scale settings
    if (params.has('r')) {
        state.rootNote = params.get('r');
    }
    if (params.has('s')) {
        state.scale = params.get('s');
    }

    // Decode UI flags
    if (params.has('ui')) {
        const flags = params.get('ui');
        state.showScaleContext = !flags.includes('h');
        state.showMiniFretboards = flags.includes('f');
        state.showMiniPianos = flags.includes('k');
        state.useSeventhChords = !flags.includes('n');
    }

    return state;
}

/**
 * Legacy function - Encode state object to URL-safe string (Base64)
 * @param {Object} state - State object to encode
 * @returns {string} Base64 encoded state string
 */
function encodeStateToURL(state) {
    const stateString = JSON.stringify(state);
    return btoa(encodeURIComponent(stateString));
}

/**
 * Legacy function - Decode URL-safe string back to state object
 * @param {string} encodedState - Base64 encoded state string
 * @returns {Object|null} Decoded state object or null if invalid
 */
function decodeStateFromURL(encodedState) {
    try {
        const stateString = decodeURIComponent(atob(encodedState));
        return JSON.parse(stateString);
    } catch (error) {
        console.warn('Failed to decode state from URL:', error);
        return null;
    }
}

/**
 * Generate a shareable URL for the current state
 * @returns {string} Shareable URL
 */
function generateShareableURL() {
    const state = buildShareableState();
    console.log('Sharing state:', state);

    const currentURL = new URL(window.location);

    // Clear existing parameters
    currentURL.search = '';

    // Use the new human-readable parameter encoding
    const urlParams = encodeStateToURLParams(state);

    // Add parameters to URL
    for (const [key, value] of urlParams) {
        currentURL.searchParams.set(key, value);
    }

    return currentURL.toString();
}

/**
 * Copy the shareable URL to clipboard
 * @returns {Promise<boolean>} Success status
 */
async function copyShareableURL() {
    try {
        const shareableURL = generateShareableURL();
        await navigator.clipboard.writeText(shareableURL);

        // Update the current page URL with new format
        const state = buildShareableState();
        const newURL = new URL(window.location);
        newURL.search = '';

        const urlParams = encodeStateToURLParams(state);
        for (const [key, value] of urlParams) {
            newURL.searchParams.set(key, value);
        }

        window.history.replaceState({}, '', newURL);

        return true;
    } catch (error) {
        console.error('Failed to copy URL to clipboard:', error);
        return false;
    }
}

/**
 * Apply state from a decoded state object
 * @param {Object} state - State object to apply
 */
function applySharedState(state) {
    if (!state) return;

    // Apply scale settings first (these affect chord resolution)
    if (state.rootNote && state.scale) {
        // Set root note and scale using the proper functions
        try {
            setPrimaryRootNote(state.rootNote);
            setPrimaryScale(state.scale);
        } catch (error) {
            console.warn('Failed to set scale settings:', error);
            // Fallback to window functions if they exist
            if (window.setRootNote) {
                window.setRootNote(state.rootNote);
            }
            if (window.setScale) {
                window.setScale(state.scale);
            }
        }
    }

    // Apply UI state flags and sync checkboxes
    if (state.showScaleContext !== undefined) {
        window.showScaleContext = state.showScaleContext;
        const scaleToggle = document.getElementById('chord-progression-scale-toggle');
        if (scaleToggle) {
            scaleToggle.checked = state.showScaleContext;
        }
        if (window.updateScaleContextDisplay) {
            window.updateScaleContextDisplay();
        }
    }

    if (state.showMiniFretboards !== undefined) {
        progressionState.showMiniFretboards = state.showMiniFretboards;
        const miniFretboardToggle = document.getElementById('chord-progression-mini-fretboard-toggle');
        if (miniFretboardToggle) {
            miniFretboardToggle.checked = state.showMiniFretboards;
        }
        // Update the visibility of the intervals toggle based on mini fretboards setting
        const fretboardIntervalsContainer = document.querySelector('#chord-progression-fretboard-intervals-toggle').parentElement;
        if (fretboardIntervalsContainer) {
            fretboardIntervalsContainer.style.display = state.showMiniFretboards ? 'flex' : 'none';
        }
    }

    if (state.showFretboardIntervals !== undefined) {
        progressionState.showFretboardIntervals = state.showFretboardIntervals;
        const fretboardIntervalsToggle = document.getElementById('chord-progression-fretboard-intervals-toggle');
        if (fretboardIntervalsToggle) {
            fretboardIntervalsToggle.checked = state.showFretboardIntervals;
        }
    }

    if (state.showMiniPianos !== undefined) {
        progressionState.showMiniPianos = state.showMiniPianos;
        const miniPianoToggle = document.getElementById('chord-progression-mini-piano-toggle');
        if (miniPianoToggle) {
            miniPianoToggle.checked = state.showMiniPianos;
        }
    }

    if (state.useSeventhChords !== undefined) {
        progressionState.useSeventhChords = state.useSeventhChords;
        const seventhsToggle = document.getElementById('chord-progression-sevenths-toggle');
        if (seventhsToggle) {
            seventhsToggle.checked = state.useSeventhChords;
        }
    }

    // Apply chord progression last (after scale settings are configured)
    if (state.progression) {
        // Update the progression input if it exists
        const progressionInput = document.querySelector('#chord-progression-input');
        if (progressionInput) {
            progressionInput.value = state.progression;
            // Trigger input event to parse the progression
            progressionInput.dispatchEvent(new Event('input'));
        } else {
            // If no input field, directly update the progression
            updateProgression(state.progression);
        }
    }
}

/**
 * Load shared state from URL parameters on page load
 */
function loadSharedStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    let state = null;

    // Try new parameter format first
    if (urlParams.has('p')) {
        // New human-readable format
        state = decodeStateFromURLParams(urlParams);
        console.log('Loaded state from URL parameters:', state);
    } else {
        // Try legacy Base64 format for backward compatibility
        const encodedState = urlParams.get('share');
        if (encodedState) {
            state = decodeStateFromURL(encodedState);
            console.log('Loaded state from legacy Base64 format:', state);
        }
    }

    if (state) {
        // Apply state after a short delay to ensure all components are initialized
        setTimeout(() => {
            applySharedState(state);
        }, 100);
    }
}

export {
    generateShareableURL,
    copyShareableURL,
    loadSharedStateFromURL,
    applySharedState
};
