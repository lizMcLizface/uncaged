// The chord-progression "Other Controls" row: the toggles, dropdowns, and
// buttons above the chord-card display. Split per control-group the same
// way Phase 3 split createFretboardControls (src/fretboard/ui/controls.js)
// into buildXControls() helpers - only the orchestrator,
// createProgressionControlsSection, is exported; every buildXControls()
// stays module-private.
//
// Three groups of controls turned out entangled by shared event-listener
// wiring, not independently movable one-to-one with the plan's original
// group list, so they're built together in one function each rather than
// split further (same "tightly coupled -> one function" call the
// chord-card cluster made, ARCHITECTURE.md §6.18):
//   - buildMiniFretboardControls(): the mini-fretboard toggle's change
//     listener shows/hides the fretboard-intervals and arpeggiation
//     toggles' containers, so all three are built and wired together.
//   - buildStaveControls(): the mini-staves toggle checkbox has THREE
//     separate change listeners registered on it - its own, one added by
//     the stave-key selector, one added by the stave-theory-mode toggle
//     (which also re-toggles the stave-key container's visibility,
//     redundant with the stave-key selector's own listener but preserved
//     exactly as-is, not simplified, per this phase's no-behavior-changes
//     rule). Building them separately would mean passing the checkbox out
//     and back in for no structural benefit.
//   - buildSynthControlsContainer(): rate control, duration control, and
//     the chord-triggering checkbox are visually one row, and the
//     container's periodic sync (setInterval/setTimeout at the end) calls
//     back into the rate/duration controls' own update functions, so they
//     stay nested here rather than becoming three more top-level exports.
//
// updateProgression/clearProgression are imported back from the barrel
// (src/progression/index.js, formerly progressionBuilder.js, renamed in
// Phase 4's final step) - both are core residual orchestration, not part
// of any control-group cluster. Same two-way-import shape as the rest of
// src/progression/ (ARCHITECTURE.md §6.13-§6.21).
//
// window.polySynthRef/window.processedProgression/window.showScaleContext/
// window.App here are the progression-sequencer-control surface
// ARCHITECTURE.md §5.1 documents as still live and unmigrated - untouched
// by this move, not this phase's job.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { progressionState } from './state';
import { updateProgressionDisplay } from './progressionList';
import { copyShareableURL } from './share';
import { getProcessedProgression } from './playback';
import { displaySingleChordPattern, displayAllChordPatterns } from './fretboardDisplay';
import { updateProgression, clearProgression } from '.';

/**
 * Build the "Show Scale Context" toggle
 * @returns {HTMLElement} Toggle container
 */
function buildScaleContextToggle() {
    const scaleToggleContainer = document.createElement('div');
    scaleToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const scaleToggleCheckbox = document.createElement('input');
    scaleToggleCheckbox.type = 'checkbox';
    scaleToggleCheckbox.id = 'chord-progression-scale-toggle';
    scaleToggleCheckbox.checked = true; // Default to showing scale context
    scaleToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Initialize window variable to match checkbox state
    window.showScaleContext = scaleToggleCheckbox.checked;

    // Add change event listener to refresh display
    scaleToggleCheckbox.addEventListener('change', () => {
        // Update the window variable to stay in sync
        window.showScaleContext = scaleToggleCheckbox.checked;

        // Refresh the current display
        if (progressionState.hoveredChordIndex !== null && progressionState.currentProgression[progressionState.hoveredChordIndex]) {
            displaySingleChordPattern(progressionState.currentProgression[progressionState.hoveredChordIndex], progressionState.hoveredChordIndex, true);
        } else {
            displayAllChordPatterns();
        }

        // Also refresh mini pianos and mini staves if they are enabled
        if (progressionState.showMiniPianos || progressionState.showMiniStaves) {
            updateProgressionDisplay();
        }
    });

    const scaleToggleLabel = document.createElement('label');
    scaleToggleLabel.htmlFor = 'chord-progression-scale-toggle';
    scaleToggleLabel.textContent = 'Show Scale Context';
    scaleToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    scaleToggleContainer.appendChild(scaleToggleCheckbox);
    scaleToggleContainer.appendChild(scaleToggleLabel);

    return scaleToggleContainer;
}

/**
 * Build the mini-fretboard toggle plus the fretboard-intervals and
 * arpeggiation toggles it shows/hides.
 * @returns {{miniFretboardToggleContainer: HTMLElement, fretboardIntervalsToggleContainer: HTMLElement, arpeggiationToggleContainer: HTMLElement}}
 */
function buildMiniFretboardControls() {
    // Mini fretboard intervals toggle (only show when mini fretboards are enabled)
    const fretboardIntervalsToggleContainer = document.createElement('div');
    fretboardIntervalsToggleContainer.style.cssText = `
        display: ${progressionState.showMiniFretboards ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
        margin-left: 16px;
    `;

    const fretboardIntervalsToggleCheckbox = document.createElement('input');
    fretboardIntervalsToggleCheckbox.type = 'checkbox';
    fretboardIntervalsToggleCheckbox.id = 'chord-progression-fretboard-intervals-toggle';
    fretboardIntervalsToggleCheckbox.checked = progressionState.showFretboardIntervals;
    fretboardIntervalsToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Add change event listener to refresh display
    fretboardIntervalsToggleCheckbox.addEventListener('change', (e) => {
        progressionState.showFretboardIntervals = e.target.checked;
        updateProgressionDisplay(); // Refresh to show intervals or note names
    });

    const fretboardIntervalsToggleLabel = document.createElement('label');
    fretboardIntervalsToggleLabel.htmlFor = 'chord-progression-fretboard-intervals-toggle';
    fretboardIntervalsToggleLabel.textContent = 'Show Intervals';
    fretboardIntervalsToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    fretboardIntervalsToggleContainer.appendChild(fretboardIntervalsToggleCheckbox);
    fretboardIntervalsToggleContainer.appendChild(fretboardIntervalsToggleLabel);

    // Arpeggiation notes toggle (only show when mini fretboards are enabled)
    const arpeggiationToggleContainer = document.createElement('div');
    arpeggiationToggleContainer.style.cssText = `
        display: ${progressionState.showMiniFretboards ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
        margin-left: 16px;
    `;

    const arpeggiationToggleCheckbox = document.createElement('input');
    arpeggiationToggleCheckbox.type = 'checkbox';
    arpeggiationToggleCheckbox.id = 'chord-progression-arpeggiation-toggle';
    arpeggiationToggleCheckbox.checked = progressionState.showArpeggiationNotes;
    arpeggiationToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Add change event listener to refresh display
    arpeggiationToggleCheckbox.addEventListener('change', (e) => {
        progressionState.showArpeggiationNotes = e.target.checked;
        updateProgressionDisplay(); // Refresh to show/hide arpeggiation notes
    });

    const arpeggiationToggleLabel = document.createElement('label');
    arpeggiationToggleLabel.htmlFor = 'chord-progression-arpeggiation-toggle';
    arpeggiationToggleLabel.textContent = 'Show Arpeggiation';
    arpeggiationToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    arpeggiationToggleContainer.appendChild(arpeggiationToggleCheckbox);
    arpeggiationToggleContainer.appendChild(arpeggiationToggleLabel);

    // Mini fretboard toggle
    const miniFretboardToggleContainer = document.createElement('div');
    miniFretboardToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const miniFretboardToggleCheckbox = document.createElement('input');
    miniFretboardToggleCheckbox.type = 'checkbox';
    miniFretboardToggleCheckbox.id = 'chord-progression-mini-fretboard-toggle';
    miniFretboardToggleCheckbox.checked = progressionState.showMiniFretboards;
    miniFretboardToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Add change event listener to refresh display
    miniFretboardToggleCheckbox.addEventListener('change', (e) => {
        progressionState.showMiniFretboards = e.target.checked;
        fretboardIntervalsToggleContainer.style.display = e.target.checked ? 'flex' : 'none';
        arpeggiationToggleContainer.style.display = e.target.checked ? 'flex' : 'none';
        updateProgressionDisplay(); // Refresh the entire display to show/hide mini fretboards
    });

    const miniFretboardToggleLabel = document.createElement('label');
    miniFretboardToggleLabel.htmlFor = 'chord-progression-mini-fretboard-toggle';
    miniFretboardToggleLabel.textContent = 'Show Mini Fretboards';
    miniFretboardToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    miniFretboardToggleContainer.appendChild(miniFretboardToggleCheckbox);
    miniFretboardToggleContainer.appendChild(miniFretboardToggleLabel);

    return {
        miniFretboardToggleContainer,
        fretboardIntervalsToggleContainer,
        arpeggiationToggleContainer
    };
}

/**
 * Build the "Show Mini Pianos" toggle
 * @returns {HTMLElement} Toggle container
 */
function buildMiniPianoToggle() {
    const miniPianoToggleContainer = document.createElement('div');
    miniPianoToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const miniPianoToggleCheckbox = document.createElement('input');
    miniPianoToggleCheckbox.type = 'checkbox';
    miniPianoToggleCheckbox.id = 'chord-progression-mini-piano-toggle';
    miniPianoToggleCheckbox.checked = progressionState.showMiniPianos;
    miniPianoToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Add change event listener to refresh display
    miniPianoToggleCheckbox.addEventListener('change', (e) => {
        progressionState.showMiniPianos = e.target.checked;
        updateProgressionDisplay(); // Refresh the entire display to show/hide mini pianos
    });

    const miniPianoToggleLabel = document.createElement('label');
    miniPianoToggleLabel.htmlFor = 'chord-progression-mini-piano-toggle';
    miniPianoToggleLabel.textContent = 'Show Mini Pianos';
    miniPianoToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    miniPianoToggleContainer.appendChild(miniPianoToggleCheckbox);
    miniPianoToggleContainer.appendChild(miniPianoToggleLabel);

    return miniPianoToggleContainer;
}

/**
 * Build the mini-staves toggle, the stave-key selector, and the
 * stave-theory-mode toggle. Entangled by three change listeners registered
 * on one checkbox - see this file's header for why they're built together.
 * @returns {{miniStavesToggleContainer: HTMLElement, staveKeyContainer: HTMLElement, staveTheoryModeContainer: HTMLElement}}
 */
function buildStaveControls() {
    // Mini staves toggle
    const miniStavesToggleContainer = document.createElement('div');
    miniStavesToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const miniStavesToggleCheckbox = document.createElement('input');
    miniStavesToggleCheckbox.type = 'checkbox';
    miniStavesToggleCheckbox.id = 'chord-progression-mini-staves-toggle';
    miniStavesToggleCheckbox.checked = progressionState.showMiniStaves;
    miniStavesToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Add change event listener to refresh display
    miniStavesToggleCheckbox.addEventListener('change', (e) => {
        progressionState.showMiniStaves = e.target.checked;
        updateProgressionDisplay(); // Refresh the entire display to show/hide mini staves
    });

    const miniStavesToggleLabel = document.createElement('label');
    miniStavesToggleLabel.htmlFor = 'chord-progression-mini-staves-toggle';
    miniStavesToggleLabel.textContent = 'Show Mini Staves';
    miniStavesToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    miniStavesToggleContainer.appendChild(miniStavesToggleCheckbox);
    miniStavesToggleContainer.appendChild(miniStavesToggleLabel);

    // Stave key selector (only show when mini staves are enabled)
    const staveKeyContainer = document.createElement('div');
    staveKeyContainer.style.cssText = `
        display: ${progressionState.showMiniStaves ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
    `;

    const staveKeyLabel = document.createElement('span');
    staveKeyLabel.textContent = 'Stave Key:';
    staveKeyLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
    `;

    const staveKeyDropdown = document.createElement('select');
    staveKeyDropdown.id = 'chord-progression-stave-key';
    staveKeyDropdown.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #666;
        border-radius: 4px;
        background: #333;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
    `;

    // Add key signature options
    const keyOptions = [
        { value: 'C', label: 'C Major / A Minor' },
        { value: 'G', label: 'G Major / E Minor' },
        { value: 'D', label: 'D Major / B Minor' },
        { value: 'A', label: 'A Major / F# Minor' },
        { value: 'E', label: 'E Major / C# Minor' },
        { value: 'B', label: 'B Major / G# Minor' },
        { value: 'F#', label: 'F# Major / D# Minor' },
        { value: 'C#', label: 'C# Major / A# Minor' },
        { value: 'F', label: 'F Major / D Minor' },
        { value: 'Bb', label: 'Bb Major / G Minor' },
        { value: 'Eb', label: 'Eb Major / C Minor' },
        { value: 'Ab', label: 'Ab Major / F Minor' },
        { value: 'Db', label: 'Db Major / Bb Minor' },
        { value: 'Gb', label: 'Gb Major / Eb Minor' },
        { value: 'Cb', label: 'Cb Major / Ab Minor' }
    ];

    keyOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        optionElement.selected = option.value === progressionState.staveKey;
        staveKeyDropdown.appendChild(optionElement);
    });

    staveKeyDropdown.addEventListener('change', (e) => {
        progressionState.staveKey = e.target.value;
        if (progressionState.showMiniStaves) {
            updateProgressionDisplay(); // Refresh display with new key signature
        }
    });

    // Update stave key container visibility when mini staves toggle changes
    miniStavesToggleCheckbox.addEventListener('change', (e) => {
        staveKeyContainer.style.display = e.target.checked ? 'flex' : 'none';
    });

    staveKeyContainer.appendChild(staveKeyLabel);
    staveKeyContainer.appendChild(staveKeyDropdown);

    // Theory mode toggle for mini staves
    const staveTheoryModeContainer = document.createElement('div');
    staveTheoryModeContainer.style.cssText = `
        display: ${progressionState.showMiniStaves ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
    `;

    const staveTheoryModeCheckbox = document.createElement('input');
    staveTheoryModeCheckbox.type = 'checkbox';
    staveTheoryModeCheckbox.id = 'chord-progression-stave-theory-mode';
    staveTheoryModeCheckbox.checked = progressionState.staveTheoryMode;
    staveTheoryModeCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    staveTheoryModeCheckbox.addEventListener('change', (e) => {
        progressionState.staveTheoryMode = e.target.checked;
        if (progressionState.showMiniStaves) {
            updateProgressionDisplay(); // Refresh display with new mode
        }
    });

    const staveTheoryModeLabel = document.createElement('label');
    staveTheoryModeLabel.htmlFor = 'chord-progression-stave-theory-mode';
    staveTheoryModeLabel.textContent = 'Theory Mode (4th octave)';
    staveTheoryModeLabel.style.cssText = `
        color: white;
        font-size: 14px;
        font-weight: normal;
        cursor: pointer;
    `;

    // Update theory mode container visibility when mini staves toggle changes
    miniStavesToggleCheckbox.addEventListener('change', (e) => {
        staveKeyContainer.style.display = e.target.checked ? 'flex' : 'none';
        staveTheoryModeContainer.style.display = e.target.checked ? 'flex' : 'none';
    });

    staveTheoryModeContainer.appendChild(staveTheoryModeCheckbox);
    staveTheoryModeContainer.appendChild(staveTheoryModeLabel);

    return {
        miniStavesToggleContainer,
        staveKeyContainer,
        staveTheoryModeContainer
    };
}

/**
 * Build the "Use Seventh Chords" toggle
 * @returns {HTMLElement} Toggle container
 */
function buildSeventhChordsToggle() {
    const chordsToggleContainer = document.createElement('div');
    chordsToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const chordsToggleCheckbox = document.createElement('input');
    chordsToggleCheckbox.type = 'checkbox';
    chordsToggleCheckbox.id = 'chord-progression-sevenths-toggle';
    chordsToggleCheckbox.checked = progressionState.useSeventhChords;
    chordsToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;

    // Add change event listener to reprocess progression
    chordsToggleCheckbox.addEventListener('change', (e) => {
        progressionState.useSeventhChords = e.target.checked;

        // Reprocess the current progression to apply the toggle
        const inputElement = document.getElementById('chord-progression-input');
        if (inputElement && inputElement.value.trim()) {
            updateProgression(inputElement.value);
        }
    });

    const chordsToggleLabel = document.createElement('label');
    chordsToggleLabel.htmlFor = 'chord-progression-sevenths-toggle';
    chordsToggleLabel.textContent = 'Use Seventh Chords';
    chordsToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;

    chordsToggleContainer.appendChild(chordsToggleCheckbox);
    chordsToggleContainer.appendChild(chordsToggleLabel);

    return chordsToggleContainer;
}

/**
 * Build the predefined-progressions presets dropdown
 * @returns {HTMLElement} Dropdown container
 */
function buildPresetsDropdown() {
    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const presetsLabel = document.createElement('span');
    presetsLabel.textContent = 'Presets:';
    presetsLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        font-weight: bold;
    `;

    const presetsDropdown = document.createElement('select');
    presetsDropdown.id = 'chord-progression-presets';
    presetsDropdown.style.cssText = `
        padding: 8px;
        font-size: 14px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: #fff;
        color: #333;
        cursor: pointer;
        min-width: 200px;
    `;

    // Add predefined chord progressions
    const presets = [
        { name: 'Select a preset...', value: '' },
        { name: 'I-V-vi-IV (Pop progression)', value: 'I V vi IV' },
        { name: 'vi-IV-I-V (Pop progression)', value: 'vi IV I V' },
        { name: 'I-vi-IV-V (Pop progression)', value: 'I vi IV V' },
        { name: 'IV-V-I-VI (Pop progression)', value: 'IV V I VI' },
        { name: 'ii-V-I (Jazz standard)', value: 'ii V I' },
        { name: 'ii-V-I-VI (Jazz standard 2)', value: 'ii V I VI' },
        { name: 'i-VII-VI-V (Minor progression)', value: 'i VII VI V' },
        { name: 'I-vi-ii-V (Jazz circle)', value: 'I vi ii V' },
        { name: 'I-IV-V (Classic cadence)', value: 'I IV V' },
        { name: 'I-IV-V-I (Classic cadence)', value: 'I IV V I' },
        { name: 'i-VII-VI-VII (Minor progression)', value: 'i VII VI VII' },
        { name: 'I-IV-V-IV (Classic cadence)', value: 'I IV V IV' },
        { name: 'vi-V-IV-V (Minor progression)', value: 'vi V IV V' },
        { name: 'I-bVII-IV-I (Mixolydian)', value: 'I bVII IV I' },
        { name: 'i-bVI-bVII-i (Minor natural)', value: 'i bVI bVII i' },
        { name: 'I-iii-vi-IV (Alt pop)', value: 'I iii vi IV' },
        { name: 'vi-ii-V-I (Jazz turnaround)', value: 'vi ii V I' },
        { name: 'C-Am-F-G (Key of C)', value: 'C Am F G' },
        { name: 'Dm7-G7-Cmaj7 (Jazz ii-V-I)', value: 'Dm7 G7 Cmaj7' },
        { name: 'Am-F-C-G (Key of C minor)', value: 'Am F C G' },
        { name: 'Cmaj7-Am7-Dm7-G7', value: 'Cmaj7 Am7 Dm7 G7' }
    ];

    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.name;
        presetsDropdown.appendChild(option);
    });

    // Add change event listener to populate input
    presetsDropdown.addEventListener('change', (e) => {
        if (e.target.value) {
            const inputElement = document.getElementById('chord-progression-input');
            if (inputElement) {
                inputElement.value = e.target.value;
                updateProgression(e.target.value);
            }
            // Reset dropdown to "Select a preset..."
            presetsDropdown.selectedIndex = 0;
        }
    });

    presetsContainer.appendChild(presetsLabel);
    presetsContainer.appendChild(presetsDropdown);

    return presetsContainer;
}

/**
 * Build the "Share" button
 * @returns {HTMLElement} Share button
 */
function buildShareButton() {
    const shareButton = document.createElement('button');
    shareButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        Share
    `;
    shareButton.title = 'Copy shareable URL to clipboard';
    shareButton.style.cssText = `
        padding: 8px 16px;
        background: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
    `;

    shareButton.addEventListener('mouseenter', () => {
        shareButton.style.background = '#218838';
        shareButton.style.transform = 'translateY(-1px)';
    });

    shareButton.addEventListener('mouseleave', () => {
        shareButton.style.background = '#28a745';
        shareButton.style.transform = 'translateY(0)';
    });

    shareButton.addEventListener('click', async () => {
        const success = await copyShareableURL();

        // Provide visual feedback using textContent to avoid SVG issues
        const originalHTML = shareButton.innerHTML;
        const originalBg = shareButton.style.background;

        if (success) {
            shareButton.textContent = '✅ Copied!';
            shareButton.style.background = '#20c997';
        } else {
            shareButton.textContent = '❌ Failed';
            shareButton.style.background = '#dc3545';
        }

        // Reset after 2 seconds
        setTimeout(() => {
            shareButton.innerHTML = originalHTML;
            shareButton.style.background = originalBg;
        }, 2000);
    });

    return shareButton;
}

/**
 * Build the "Clear Progression" button
 * @returns {HTMLElement} Clear button
 */
function buildClearButton() {
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Progression';
    clearButton.style.cssText = `
        padding: 8px 16px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: background 0.2s;
    `;

    clearButton.addEventListener('mouseenter', () => {
        clearButton.style.background = '#c82333';
    });

    clearButton.addEventListener('mouseleave', () => {
        clearButton.style.background = '#dc3545';
    });

    clearButton.addEventListener('click', () => {
        clearProgression();
    });

    return clearButton;
}

/**
 * Build the "Loop Progression" / "Stop Loop" sequencer toggle button
 * @returns {HTMLElement} Toggle button
 */
function buildProgressionSequencerToggleButton() {
    const progressionToggleButton = document.createElement('button');
    progressionToggleButton.textContent = 'Loop Progression';
    progressionToggleButton.id = 'progression-sequencer-toggle';
    progressionToggleButton.style.cssText = `
        padding: 8px 16px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: background 0.2s;
        margin-left: 8px;
    `;

    let isProgressionLooping = false;

    const updateProgressionToggleButton = () => {
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            isProgressionLooping = state.playing;
            progressionToggleButton.textContent = isProgressionLooping ? 'Stop Loop' : 'Loop Progression';
            progressionToggleButton.style.background = isProgressionLooping ? '#dc3545' : '#6c757d';
        }
    };

    progressionToggleButton.addEventListener('mouseenter', () => {
        if (!isProgressionLooping) {
            progressionToggleButton.style.background = '#5a6268';
        } else {
            progressionToggleButton.style.background = '#c82333';
        }
    });

    progressionToggleButton.addEventListener('mouseleave', () => {
        progressionToggleButton.style.background = isProgressionLooping ? '#dc3545' : '#6c757d';
    });

    progressionToggleButton.addEventListener('click', () => {
        if (!window.polySynthRef) {
            console.warn('PolySynth not available');
            return;
        }

        if (!window.polySynthRef.toggleProgressionSequencer) {
            console.warn('Progression sequencer not available');
            return;
        }

        if (progressionState.currentProgression.length === 0) {
            alert('Please create a progression first');
            return;
        }

        // Update the processed progression before toggling
        window.processedProgression = getProcessedProgression();
        console.log('Processed progression data:', window.processedProgression);

        // If the sequencer has a method to set the progression before starting, use it
        if (window.polySynthRef.setProgressionData) {
            window.polySynthRef.setProgressionData(window.processedProgression);
        }

        window.polySynthRef.toggleProgressionSequencer();

        // Update button state after a brief delay
        setTimeout(updateProgressionToggleButton, 100);
    });

    // Update button state periodically
    setInterval(updateProgressionToggleButton, 500);

    return progressionToggleButton;
}

/**
 * Build the synth controls row: rate, duration, and the chord-triggering
 * checkbox, plus their periodic sync against PolySynth state.
 * @returns {HTMLElement} Synth controls container
 */
function buildSynthControlsContainer() {
    // Create synth controls container
    const synthControlsContainer = document.createElement('div');
    synthControlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
        flex-wrap: wrap;
    `;

    // Rate Control
    const rateLabel = document.createElement('label');
    rateLabel.textContent = 'Rate: ';
    rateLabel.style.cssText = `
        color: var(--text-color);
        font-size: 14px;
        font-weight: bold;
    `;

    const rateSelect = document.createElement('select');
    rateSelect.style.cssText = `
        padding: 4px 8px;
        background: var(--bg-color);
        color: var(--text-color);
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 14px;
    `;

    const rateOptions = [
        { value: -2, label: 'Sixteenth' },
        { value: -1, label: 'Eighth' },
        { value: 0, label: 'Quarter' },
        { value: 1, label: 'Half' },
        { value: 2, label: 'Whole' }
    ];

    rateOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (option.value === 0) optionElement.selected = true; // Default to quarter note
        rateSelect.appendChild(optionElement);
    });

    rateSelect.addEventListener('change', () => {
        userChangingRate = true;
        const rate = parseInt(rateSelect.value);

        // Add visual feedback for the change
        rateSelect.style.borderColor = '#4CAF50';
        rateSelect.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.5)';

        console.log('Rate changed to:', rate);
        console.log('PolySynth ref available:', !!window.polySynthRef);
        console.log('setProgressionRate method available:', !!(window.polySynthRef && window.polySynthRef.setProgressionRate));

        if (window.polySynthRef && window.polySynthRef.setProgressionRate) {
            window.polySynthRef.setProgressionRate(rate);
            console.log('Setting progression rate to:', rate);

            // Verify the change took effect
            setTimeout(() => {
                if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
                    const state = window.polySynthRef.getProgressionSequencerState();
                    console.log('Current progression state after rate change:', state);
                }
                userChangingRate = false; // Reset flag after change is complete

                // Reset visual feedback
                rateSelect.style.borderColor = '';
                rateSelect.style.boxShadow = '';
            }, 100);
        } else {
            console.warn('PolySynth ref or setProgressionRate method not available');
            userChangingRate = false;

            // Reset visual feedback
            rateSelect.style.borderColor = '';
            rateSelect.style.boxShadow = '';
        }
    });

    // Function to update rate control from PolySynth state
    let lastKnownRate = 0;
    let userChangingRate = false;
    const updateRateControl = () => {
        // Don't override if user is currently interacting with the control
        if (userChangingRate || document.activeElement === rateSelect) {
            return;
        }

        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            // Convert duration string back to integer
            const rateValue = state.rate === 'sixteenth' ? -2 :
                             state.rate === 'eighth' ? -1 :
                             state.rate === 'quarter' ? 0 :
                             state.rate === 'half' ? 1 :
                             state.rate === 'whole' ? 2 : 0;

            // Only update if the value actually changed and user isn't currently selecting
            if (rateValue !== lastKnownRate && parseInt(rateSelect.value) !== rateValue) {
                lastKnownRate = rateValue;
                rateSelect.value = rateValue;
            }
        }
    };

    // Duration Control
    const durationLabel = document.createElement('label');
    durationLabel.textContent = 'Duration: ';
    durationLabel.style.cssText = `
        color: var(--text-color);
        font-size: 14px;
        font-weight: bold;
        margin-left: 8px;
    `;

    const durationSelect = document.createElement('select');
    durationSelect.style.cssText = `
        padding: 4px 8px;
        background: var(--bg-color);
        color: var(--text-color);
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 14px;
    `;

    const durationOptions = [
        { value: -2, label: 'Sixteenth' },
        { value: -1, label: 'Eighth' },
        { value: 0, label: 'Quarter' },
        { value: 1, label: 'Half' },
        { value: 2, label: 'Whole' }
    ];

    durationOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (option.value === 0) optionElement.selected = true; // Default to quarter note
        durationSelect.appendChild(optionElement);
    });

    // Function to update duration control from PolySynth state
    let lastKnownDuration = 0;
    let userChangingDuration = false;

    durationSelect.addEventListener('change', () => {
        userChangingDuration = true;
        const duration = parseInt(durationSelect.value);

        // Add visual feedback for the change
        durationSelect.style.borderColor = '#4CAF50';
        durationSelect.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.5)';

        console.log('Duration changed to:', duration);
        console.log('PolySynth ref available:', !!window.polySynthRef);
        console.log('setProgressionDuration method available:', !!(window.polySynthRef && window.polySynthRef.setProgressionDuration));

        if (window.polySynthRef && window.polySynthRef.setProgressionDuration) {
            window.polySynthRef.setProgressionDuration(duration);
            console.log('Setting progression duration to:', duration);

            // Verify the change took effect
            setTimeout(() => {
                if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
                    const state = window.polySynthRef.getProgressionSequencerState();
                    console.log('Current progression state after duration change:', state);
                }
                userChangingDuration = false; // Reset flag after change is complete

                // Reset visual feedback
                durationSelect.style.borderColor = '';
                durationSelect.style.boxShadow = '';
            }, 100);
        } else {
            console.warn('PolySynth ref or setProgressionDuration method not available');
            userChangingDuration = false;

            // Reset visual feedback
            durationSelect.style.borderColor = '';
            durationSelect.style.boxShadow = '';
        }
    });

    const updateDurationControl = () => {
        // Don't override if user is currently interacting with the control
        if (userChangingDuration || document.activeElement === durationSelect) {
            return;
        }

        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            // Convert duration string back to integer
            const durationValue = state.duration === 'sixteenth' ? -2 :
                                 state.duration === 'eighth' ? -1 :
                                 state.duration === 'quarter' ? 0 :
                                 state.duration === 'half' ? 1 :
                                 state.duration === 'whole' ? 2 : 0;

            // Only update if the value actually changed and user isn't currently selecting
            if (durationValue !== lastKnownDuration && parseInt(durationSelect.value) !== durationValue) {
                lastKnownDuration = durationValue;
                durationSelect.value = durationValue;
            }
        }
    };

    // Enable Chord Triggering Checkbox
    const chordTriggeringLabel = document.createElement('label');
    chordTriggeringLabel.style.cssText = `
        display: flex;
        align-items: center;
        color: var(--text-color);
        font-size: 14px;
        font-weight: bold;
        margin-left: 12px;
        cursor: pointer;
    `;

    const chordTriggeringCheckbox = document.createElement('input');
    chordTriggeringCheckbox.type = 'checkbox';
    chordTriggeringCheckbox.checked = true; // Default to enabled
    chordTriggeringCheckbox.style.cssText = `
        margin-right: 6px;
        cursor: pointer;
    `;

    const chordTriggeringText = document.createElement('span');
    chordTriggeringText.textContent = 'Enable Chord Triggering';

    const updateChordTriggeringState = () => {
        if (window.App && window.App.getPolySynthEnabled) {
            chordTriggeringCheckbox.checked = window.App.getPolySynthEnabled();
        }
    };

    chordTriggeringCheckbox.addEventListener('change', () => {
        if (window.App && window.App.setPolySynthEnabled) {
            window.App.setPolySynthEnabled(chordTriggeringCheckbox.checked);
        }
    });

    chordTriggeringLabel.appendChild(chordTriggeringCheckbox);
    chordTriggeringLabel.appendChild(chordTriggeringText);

    // Add elements to synth controls container
    synthControlsContainer.appendChild(rateLabel);
    synthControlsContainer.appendChild(rateSelect);
    synthControlsContainer.appendChild(durationLabel);
    synthControlsContainer.appendChild(durationSelect);
    synthControlsContainer.appendChild(chordTriggeringLabel);

    // Update states periodically (less frequent for rate/duration to avoid overriding user input)
    setInterval(updateChordTriggeringState, 500);

    // Initial sync for rate/duration controls, then only when progression state changes
    setTimeout(() => {
        updateRateControl();
        updateDurationControl();
    }, 1000);

    return synthControlsContainer;
}

/**
 * Create the progression controls section
 * @returns {HTMLElement} Controls section element
 */
function createProgressionControlsSection() {
    const section = document.createElement('div');
    section.className = 'progression-controls-section';
    section.style.cssText = `
        margin: 15px 0;
        display: flex;
        gap: 15px;
        align-items: center;
        flex-wrap: wrap;
    `;

    const scaleToggleContainer = buildScaleContextToggle();
    const {
        miniFretboardToggleContainer,
        fretboardIntervalsToggleContainer,
        arpeggiationToggleContainer
    } = buildMiniFretboardControls();
    const miniPianoToggleContainer = buildMiniPianoToggle();
    const {
        miniStavesToggleContainer,
        staveKeyContainer,
        staveTheoryModeContainer
    } = buildStaveControls();
    const chordsToggleContainer = buildSeventhChordsToggle();
    const presetsContainer = buildPresetsDropdown();
    const shareButton = buildShareButton();
    const clearButton = buildClearButton();
    const progressionToggleButton = buildProgressionSequencerToggleButton();
    const synthControlsContainer = buildSynthControlsContainer();

    section.appendChild(scaleToggleContainer);
    section.appendChild(miniFretboardToggleContainer);
    section.appendChild(fretboardIntervalsToggleContainer);
    section.appendChild(arpeggiationToggleContainer);
    section.appendChild(miniPianoToggleContainer);
    section.appendChild(miniStavesToggleContainer);
    section.appendChild(staveKeyContainer);
    section.appendChild(staveTheoryModeContainer);
    section.appendChild(chordsToggleContainer);
    section.appendChild(presetsContainer);
    section.appendChild(shareButton);
    section.appendChild(clearButton);
    section.appendChild(progressionToggleButton);
    section.appendChild(synthControlsContainer);

    return section;
}

export { createProgressionControlsSection };
