// Renders the chord-progression display: the section that holds one card
// per chord (delegating each card to src/progression/chordCard.js) and the
// hover/playback highlighting on top of it.
//
// Unlike every other Phase 4 module so far, this one needs no cross-import
// back into progressionBuilder.js - createProgressionDisplaySection/
// updateProgressionDisplay/highlightCurrentChord only ever called things
// that had already moved (progressionState, createChordElement) or DOM
// globals. createChordElement/scaleSync.js/fretboardDisplay.js's existing
// cross-imports of updateProgressionDisplay are repointed here from
// progressionBuilder.js.
//
// window.highlightCurrentChord - PolySynth.jsx's only way to reach this
// function - moved along with the function itself rather than staying
// behind, since nothing else in progressionBuilder.js called
// highlightCurrentChord directly.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { progressionState } from './state';
import { createChordElement } from './chordCard';

/**
 * Create the progression display section
 * @returns {HTMLElement} Display section element
 */
function createProgressionDisplaySection() {
    const section = document.createElement('div');
    section.className = 'progression-display-section';
    section.id = 'progression-display-section';
    section.style.cssText = `
        min-height: 60px;
    `;

    // Initially empty - will be populated by updateProgression
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Enter a chord progression above to see it displayed here';
    placeholder.style.cssText = `
        color: #999;
        font-style: italic;
        text-align: center;
        padding: 20px;
    `;
    section.appendChild(placeholder);

    return section;
}

/**
 * Update the visual display of the progression
 * @param {number} currentChordIndex - Index of currently playing chord (optional)
 */
function updateProgressionDisplay(currentChordIndex = -1) {
    const displaySection = document.getElementById('progression-display-section');
    if (!displaySection) return;

    displaySection.innerHTML = '';

    if (progressionState.currentProgression.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.textContent = 'Enter a chord progression above to see it displayed here';
        placeholder.style.cssText = `
            color: #999;
            font-style: italic;
            text-align: center;
            padding: 20px;
        `;
        displaySection.appendChild(placeholder);
        return;
    }

    // Create chord list
    const chordList = document.createElement('div');
    chordList.className = 'chord-list';
    chordList.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
    `;

    progressionState.currentProgression.forEach((chord, index) => {
        const chordElement = createChordElement(chord, index);

        // Highlight current chord if specified (without scaling to avoid UI shifts)
        if (index === currentChordIndex) {
            chordElement.style.boxShadow = '0 0 15px #4CAF50';
            chordElement.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(76, 175, 80, 0.1))';
            chordElement.style.border = '2px solid #4CAF50';
            chordElement.style.transition = 'all 0.3s ease';
        }
        // Note: Default border is already set in createChordElement, no need to override it here

        chordList.appendChild(chordElement);
    });

    displaySection.appendChild(chordList);
}

/**
 * Highlight the currently playing chord in the progression display
 * @param {number} chordIndex - Index of the chord to highlight
 */
function highlightCurrentChord(chordIndex) {
    // Remove previous highlighting but preserve original borders
    const chordElements = document.querySelectorAll('.chord-element');
    chordElements.forEach((element, idx) => {
        element.style.boxShadow = '';
        element.style.background = '';
        element.style.transform = '';

        // Restore original border based on chord status
        const chord = progressionState.currentProgression[idx];
        if (chord) {
            let borderColor = '#666'; // Default
            if (chord.isInvalid) {
                borderColor = '#ff4444'; // Red for invalid chords
            } else if (chord.isFallback) {
                borderColor = '#ffaa00'; // Orange for fallback resolution
            }
            element.style.border = `2px solid ${borderColor}`;
        } else {
            // Fallback to default border
            element.style.border = '2px solid #666';
        }
    });

    // Add highlighting to current chord (without scaling to avoid UI shifts)
    if (chordIndex >= 0 && chordIndex < chordElements.length) {
        const currentElement = chordElements[chordIndex];
        currentElement.style.boxShadow = '0 0 15px #4CAF50';
        currentElement.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(76, 175, 80, 0.1))';
        currentElement.style.border = '2px solid #4CAF50';
        currentElement.style.transition = 'all 0.3s ease';
    }
}

// Make highlightCurrentChord globally accessible
window.highlightCurrentChord = highlightCurrentChord;

export {
    createProgressionDisplaySection,
    updateProgressionDisplay
};
