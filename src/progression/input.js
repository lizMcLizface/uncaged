// The chord-progression text input: the field itself, its debounced
// input handler (which calls updateProgression after INPUT_DEBOUNCE_DELAY
// of inactivity), and the playback-blocking behavior that disables typing/
// keyboard shortcuts/paste while the built-in sequencer is running.
//
// updateProgression is imported back from the barrel
// (src/progression/index.js, formerly progressionBuilder.js, renamed in
// Phase 4's final step) - core residual orchestration. Same
// two-way-import shape as the rest of src/progression/
// (ARCHITECTURE.md §6.13-§6.21).
//
// window.polySynthRef here is the progression-sequencer-control surface
// ARCHITECTURE.md §5.1 documents as still live and unmigrated - untouched
// by this move, not this phase's job.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { progressionState, INPUT_DEBOUNCE_DELAY } from './state';
import { updateProgression } from '.';

/**
 * Create the input section of the UI
 * @returns {HTMLElement} Input section element
 */
function createInputSection() {
    const section = document.createElement('div');
    section.className = 'progression-input-section';
    section.style.cssText = `
        margin-bottom: 20px;
    `;

    // Create input label container with flex layout
    const labelContainer = document.createElement('div');
    labelContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        flex-wrap: wrap;
        gap: 12px;
    `;

    // Create input label
    const label = document.createElement('label');
    label.textContent = 'Enter Chord Progression:';
    label.style.cssText = `
        color: #fff;
        font-weight: bold;
        font-size: 14px;
        margin: 0;
    `;
    labelContainer.appendChild(label);

    // Create controls container for both root and scale
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
    `;

    // Create scale notes display container
    const scaleNotesContainer = document.createElement('div');
    scaleNotesContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: rgba(68, 255, 68, 0.1);
        border: 1px solid rgba(68, 255, 68, 0.3);
        border-radius: 6px;
        margin-left: 8px;
    `;

    // Create scale notes label
    const scaleNotesLabel = document.createElement('span');
    scaleNotesLabel.textContent = 'Notes:';
    scaleNotesLabel.style.cssText = `
        color: #c9c9c9ff;
        font-weight: bold;
        font-size: 12px;
        margin: 0;
    `;
    scaleNotesContainer.appendChild(scaleNotesLabel);

    // Create scale notes display
    const scaleNotesDisplay = document.createElement('div');
    scaleNotesDisplay.id = 'scaleNotesDisplay';
    scaleNotesDisplay.textContent = 'C D E F G A B';
    scaleNotesDisplay.style.cssText = `
        color: #c9c9c9ff;
        font-weight: normal;
        font-size: 12px;
        font-family: monospace;
        letter-spacing: 1px;
    `;
    scaleNotesContainer.appendChild(scaleNotesDisplay);

    controlsContainer.appendChild(scaleNotesContainer);
    labelContainer.appendChild(controlsContainer);
    section.appendChild(labelContainer);

    // Create help text
    const helpText = document.createElement('div');
    helpText.innerHTML = `
        <span style="color: #ccc; font-size: 12px;">
            Examples: "C7 D#m7b5 Gmajor" or "I IV ii V" or "bIII #V" or "Cmaj7 Am7 Dm7 G7"
        </span>
    `;
    helpText.style.marginBottom = '8px';
    section.appendChild(helpText);

    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'chord-progression-input';
    input.placeholder = 'e.g., I vi IV V or bIII #V or C Am F G or Cmaj7 Am7 Dm7 G7';
    input.style.cssText = `
        width: 100%;
        padding: 12px;
        font-size: 14px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: #fff;
        color: #333;
        box-sizing: border-box;
        margin-bottom: 10px;
    `;

    // Add input event listener with debouncing and playback blocking
    input.addEventListener('input', (e) => {
        // Check if progression is currently playing
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state && state.playing) {
                // Block text changes during playback to prevent confusion
                console.log('🚫 Blocking text changes during progression playback');
                e.preventDefault();
                e.stopPropagation();
                e.target.value = lastProgressionText || '';

                // Add visual feedback
                e.target.style.borderColor = '#ff6b6b';
                e.target.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
                setTimeout(() => {
                    e.target.style.borderColor = '';
                    e.target.style.boxShadow = '';
                }, 1000);

                return false;
            }
        }

        const progressionText = e.target.value;
        lastProgressionText = progressionText; // Update the stored value

        // Clear any existing timer
        if (progressionState.inputDebounceTimer) {
            clearTimeout(progressionState.inputDebounceTimer);
        }

        // Set a new timer to delay processing
        progressionState.inputDebounceTimer = setTimeout(() => {
            updateProgression(progressionText);
        }, INPUT_DEBOUNCE_DELAY);
    });

    // Store the initial value for blocking changes during playback
    let lastProgressionText = input.value;

    // Add keyboard shortcuts for better UX
    input.addEventListener('keydown', (e) => {
        // Check if progression is currently playing first
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state && state.playing) {
                // Allow Ctrl+A (select all) and navigation keys during playback
                const allowedKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'];
                const isCtrlA = e.ctrlKey && e.key === 'a';

                if (!allowedKeys.includes(e.key) && !isCtrlA) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Visual feedback for blocked keypress
                    input.style.borderColor = '#ff6b6b';
                    input.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
                    setTimeout(() => {
                        input.style.borderColor = '';
                        input.style.boxShadow = '';
                    }, 300);

                    return false;
                }
            }
        }
    });

    // Also block paste during playback
    input.addEventListener('paste', (e) => {
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state && state.playing) {
                e.preventDefault();
                e.stopPropagation();

                // Visual feedback
                input.style.borderColor = '#ff6b6b';
                input.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
                setTimeout(() => {
                    input.style.borderColor = '';
                    input.style.boxShadow = '';
                }, 300);

                return false;
            }
        }
    });

    section.appendChild(input);

    return section;
}

export { createInputSection };
