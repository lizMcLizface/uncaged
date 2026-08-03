// Public barrel for src/scales/. This is what src/scaleGenerator.js and
// src/scales.js were reduced to across REFACTOR_PLAN.md Phase 4's
// extraction steps: state.js, scaleData.js, ui/infoPanel.js,
// ui/rootNoteTable.js, ui/scaleTable.js all moved out (see ARCHITECTURE.md
// §6.23-6.26); what's left here is pure glue - updateCurrentScaleDisplay
// (the hub every UI cluster calls to refresh after a selection change) and
// the navigation-button wiring, plus the re-exports that make this folder's
// public surface a single import.
//
// The two DOM key-highlighting functions this file used to own are both
// gone: highlightScaleNotes in PIANO_VIEW_PLAN.md step 4, and
// highlightKeysForScales (with its keys_chords lookup table) in
// VISUALIZATION_STACK_PLAN.md step 8f - see the note at their former site.
//
// External callers previously split their imports between
// `from './scaleGenerator'` and `from './scales'`; both files are deleted
// and every external importer now pulls everything from here
// (`from './scales'`, which now resolves to this directory's index). The
// export surface below is the union of what both files exported - this
// step is a pure move, not a public-API change.
//
// scales.js's own module-evaluation order used to matter here, because
// `keys_chords` resolved DOM elements once at import time. That table is gone
// (step 8f) and nothing in this file reads the DOM at module scope any more,
// so the ordering constraint ARCHITECTURE.md §6.27 recorded no longer binds.
//
// Two-way imports with ./state.js, ./ui/scaleTable.js and
// ./ui/rootNoteTable.js are expected, not a sign of a design problem - see
// their own file headers for why.

import { HeptatonicScales, HexatonicScales, PentatonicScales, scales, getScaleNotes, precomputeScaleChords, precomputeChordsForScales, getPrecomputedChords, getChordsForScale, clearChordCache, getChordCacheStats } from './scaleData';
import { updateScaleInfoPanel } from './ui/infoPanel';
import { createHeptatonicScaleTable, createQuickScalePicker } from './ui/scaleTable';
import {
    scaleState,
    persistScaleSelection,
    getPrimaryScale,
    navigateToNextScale,
    navigateToPreviousScale,
    getPrimaryRootNote,
    navigateToNextRootNote,
    navigateToPreviousRootNote,
    navigateRootUpExclusive,
    navigateRootDownExclusive,
    navigateModeUpExclusive,
    navigateModeDownExclusive,
    navigateScaleFamilyUpExclusive,
    navigateScaleFamilyDownExclusive,
    navigateSequentialUpExclusive,
    navigateSequentialDownExclusive,
    setPrimaryRootNote,
    setPrimaryScale,
    refreshChordsForRootNote
} from './state';



// `highlightScaleNotes` was deleted in PIANO_VIEW_PLAN.md step 4, which is
// where §1.3 said the decision fell due. It applied `scaleKey` to
// src/midi.js's `keys` - the same class, on the same elements, that
// src/piano/Piano.js's showScale now owns - so once step 3 made those
// elements real it was no longer harmlessly dead, it was a second writer to
// the piano's own state. It had also never worked: its range gate read
// #lowestNoteSelection/#highestNoteSelection, neither of which exists
// anywhere in src/ or public/, so every comparison was against NaN.
//
// What replaces it is strictly more: colour by semitone from the root rather
// than one flat purple, correct enharmonic spelling, and the displayed range
// as the visibility gate the phantom selects were reaching for.
//
// `highlightKeysForScales`, `keys_chords` and this file's own
// `getElementByMIDI` were retired in VISUALIZATION_STACK_PLAN.md step 8f.
// They were the third and last mechanism for "show a scale on the keyboard",
// and the only one that never worked: the `midi="N_scale"` attribute they
// queried has never existed in any markup. Their twelve call sites were all
// hover previews - push on enter, hand-rolled restore on leave - and they are
// now real pushes and pops against the visualization stack, which paints both
// the piano and the fretboard.

// Function to update the current scale display in the HTML
function updateCurrentScaleDisplay() {
    persistScaleSelection();

    const currentScaleNode = document.getElementById('currentScaleNode');
    const currentRootNode = document.getElementById('currentRootNode');
    if (!currentScaleNode) return;

    const primaryScale = getPrimaryScale();
    if (!primaryScale) {
        currentScaleNode.textContent = 'No Scale Selected';
        if (currentRootNode) currentRootNode.textContent = '';
        return;
    }

    const [family, mode] = primaryScale.split('-');
    const scales = HeptatonicScales;
    const scaleName = scales[family][parseInt(mode, 10) - 1].name;
    const rootNote = getPrimaryRootNote();
    
    console.log('updateCurrentScaleDisplay - Scale:', scaleName, 'Root:', rootNote);
    
    // Display format: "Root ScaleName" for scale, just root note for root display
    currentScaleNode.textContent = `${scaleName}`;
    if (currentRootNode) {
        currentRootNode.textContent = rootNote;
    }

    // Keep the top-bar quick-picker selects in sync when a change originated
    // elsewhere (e.g. clicking the detailed scale-family/root tables)
    const quickRootSelect = document.getElementById('quickRootSelect');
    if (quickRootSelect) quickRootSelect.value = rootNote;
    const quickScaleFamilySelect = document.getElementById('quickScaleFamilySelect');
    if (quickScaleFamilySelect) quickScaleFamilySelect.value = family;
    const quickScaleModeSelect = document.getElementById('quickScaleModeSelect');
    if (quickScaleModeSelect) quickScaleModeSelect.value = mode;

    // Refresh the persistent "Scale Information" panel for the new scale
    updateScaleInfoPanel();

    // Show navigation indicators
    // let indicators = [];
    // if (scaleState.selectedScales.length > 1) {
    //     indicators.push(`Scale: ${scaleState.primaryScaleIndex + 1}/${scaleState.selectedScales.length}`);
    // }
    // if (Array.isArray(scaleState.selectedRootNote) && scaleState.selectedRootNote.length > 1) {
    //     indicators.push(`Root: ${scaleState.primaryRootNoteIndex + 1}/${scaleState.selectedRootNote.length}`);
    // }
    // if (indicators.length > 0) {
    //     currentScaleNode.textContent += ` (${indicators.join(', ')})`;
    // }

    // Update keyboard highlighting for the primary scale
    const intervals = scales[family][parseInt(mode, 10) - 1].intervals;
    const scaleNotes = getScaleNotes(rootNote, intervals);

    // The keyboard used to be highlighted from here, through
    // highlightKeysForScales. The 'scaleChanged' event below already tells
    // src/fretboard/index.js to rebuild the visualization stack's base layer,
    // which paints the piano AND the fretboard - so this was the third
    // mechanism for one job, and the only one that never worked.
    // Notify fretboards about scale changes via custom event
    const scaleChangeEvent = new CustomEvent('scaleChanged', {
        detail: {
            primaryScale: getPrimaryScale(),
            rootNote: getPrimaryRootNote(),
            scaleNotes: scaleNotes
        }
    });
    window.dispatchEvent(scaleChangeEvent);

    // let scale = scales[family][parseInt(mode, 10) - 1];
    // console.log("Current Scale:", scaleName, "Root Note:", rootNote);
    // console.log("Scale Notes:", scaleNotes);
    // let identifiedChords_3 = identifySyntheticChords(scale, 3, rootNote);
    // let identifiedChords_4 = identifySyntheticChords(scaleNotes, 4, rootNote);
    // let identifiedChords_5 = identifySyntheticChords(scaleNotes, 5, rootNote);

    // console.log("Identified 3-note chords:", identifiedChords_3);
    // console.log("Identified 4-note chords:", identifiedChords_4);
    // console.log("Identified 5-note chords:", identifiedChords_5);

}

// Try to get the new scale controls container first, fallback to old one
let placeholder = document.getElementById('scaleControlsContainer') || document.getElementById('placeholderContent');
if (placeholder) {
    while (placeholder.firstChild) {
        placeholder.removeChild(placeholder.firstChild);
    }
}


/**
 * Initialize navigation buttons for scale and root note navigation
 */
function initializeNavigationButtons() {
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
        // Scale navigation buttons
        const prevScaleBtn = document.getElementById('prevScaleBtn');
        const nextScaleBtn = document.getElementById('nextScaleBtn');
        
        // Root note navigation buttons
        const prevRootBtn = document.getElementById('prevRootBtn');
        const nextRootBtn = document.getElementById('nextRootBtn');
        
        if (prevScaleBtn) {
            prevScaleBtn.addEventListener('click', function() {
                if (navigateToPreviousScale()) {
                    // Scale changed, trigger any necessary updates
                    if (typeof window.updateFretboardsForScaleChange === 'function') {
                        const primaryScale = getPrimaryScale();
                        const rootNote = getPrimaryRootNote();
                        window.updateFretboardsForScaleChange({
                            primaryScale: primaryScale,
                            rootNote: rootNote
                        });
                    }
                }
            });
            
            // Add hover effects
            prevScaleBtn.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#666';
            });
            prevScaleBtn.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '#444';
            });
        }
        
        if (nextScaleBtn) {
            nextScaleBtn.addEventListener('click', function() {
                if (navigateToNextScale()) {
                    // Scale changed, trigger any necessary updates
                    if (typeof window.updateFretboardsForScaleChange === 'function') {
                        const primaryScale = getPrimaryScale();
                        const rootNote = getPrimaryRootNote();
                        window.updateFretboardsForScaleChange({
                            primaryScale: primaryScale,
                            rootNote: rootNote
                        });
                    }
                }
            });
            
            // Add hover effects
            nextScaleBtn.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#666';
            });
            nextScaleBtn.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '#444';
            });
        }
        
        if (prevRootBtn) {
            prevRootBtn.addEventListener('click', function() {
                if (navigateToPreviousRootNote()) {
                    // Root note changed, trigger any necessary updates
                    refreshChordsForRootNote();
                    if (typeof window.updateFretboardsForScaleChange === 'function') {
                        const primaryScale = getPrimaryScale();
                        const rootNote = getPrimaryRootNote();
                        window.updateFretboardsForScaleChange({
                            primaryScale: primaryScale,
                            rootNote: rootNote
                        });
                    }
                }
            });
            
            // Add hover effects
            prevRootBtn.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#666';
            });
            prevRootBtn.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '#444';
            });
        }
        
        if (nextRootBtn) {
            nextRootBtn.addEventListener('click', function() {
                if (navigateToNextRootNote()) {
                    // Root note changed, trigger any necessary updates
                    refreshChordsForRootNote();
                    if (typeof window.updateFretboardsForScaleChange === 'function') {
                        const primaryScale = getPrimaryScale();
                        const rootNote = getPrimaryRootNote();
                        window.updateFretboardsForScaleChange({
                            primaryScale: primaryScale,
                            rootNote: rootNote
                        });
                    }
                }
            });
            
            // Add hover effects
            nextRootBtn.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#666';
            });
            nextRootBtn.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '#444';
            });
        }
    });
}

/**
 * Initialize navigation buttons directly (for dynamically created elements)
 */
function initializeNavigationButtonsDirect() {
    // Scale navigation buttons
    const prevScaleBtn = document.getElementById('prevScaleBtn');
    const nextScaleBtn = document.getElementById('nextScaleBtn');
    
    // Root note navigation buttons
    const prevRootBtn = document.getElementById('prevRootBtn');
    const nextRootBtn = document.getElementById('nextRootBtn');
    
    if (prevScaleBtn) {
        // Remove existing listeners to avoid duplicates
        prevScaleBtn.replaceWith(prevScaleBtn.cloneNode(true));
        const newPrevScaleBtn = document.getElementById('prevScaleBtn');
        
        newPrevScaleBtn.addEventListener('click', function() {
            if (navigateToPreviousScale()) {
                // Scale changed, trigger any necessary updates
                if (typeof window.updateFretboardsForScaleChange === 'function') {
                    const primaryScale = getPrimaryScale();
                    const rootNote = getPrimaryRootNote();
                    window.updateFretboardsForScaleChange({
                        primaryScale: primaryScale,
                        rootNote: rootNote
                    });
                }
            }
        });
        
        // Add hover effects
        newPrevScaleBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#666';
        });
        newPrevScaleBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#444';
        });
    }
    
    if (nextScaleBtn) {
        // Remove existing listeners to avoid duplicates
        nextScaleBtn.replaceWith(nextScaleBtn.cloneNode(true));
        const newNextScaleBtn = document.getElementById('nextScaleBtn');
        
        newNextScaleBtn.addEventListener('click', function() {
            if (navigateToNextScale()) {
                // Scale changed, trigger any necessary updates
                if (typeof window.updateFretboardsForScaleChange === 'function') {
                    const primaryScale = getPrimaryScale();
                    const rootNote = getPrimaryRootNote();
                    window.updateFretboardsForScaleChange({
                        primaryScale: primaryScale,
                        rootNote: rootNote
                    });
                }
            }
        });
        
        // Add hover effects
        newNextScaleBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#666';
        });
        newNextScaleBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#444';
        });
    }
    
    if (prevRootBtn) {
        // Remove existing listeners to avoid duplicates
        prevRootBtn.replaceWith(prevRootBtn.cloneNode(true));
        const newPrevRootBtn = document.getElementById('prevRootBtn');
        
        newPrevRootBtn.addEventListener('click', function() {
            if (navigateToPreviousRootNote()) {
                // Root note changed, trigger any necessary updates
                refreshChordsForRootNote();
                if (typeof window.updateFretboardsForScaleChange === 'function') {
                    const primaryScale = getPrimaryScale();
                    const rootNote = getPrimaryRootNote();
                    window.updateFretboardsForScaleChange({
                        primaryScale: primaryScale,
                        rootNote: rootNote
                    });
                }
            }
        });
        
        // Add hover effects
        newPrevRootBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#666';
        });
        newPrevRootBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#444';
        });
    }
    
    if (nextRootBtn) {
        // Remove existing listeners to avoid duplicates
        nextRootBtn.replaceWith(nextRootBtn.cloneNode(true));
        const newNextRootBtn = document.getElementById('nextRootBtn');
        
        newNextRootBtn.addEventListener('click', function() {
            if (navigateToNextRootNote()) {
                // Root note changed, trigger any necessary updates
                refreshChordsForRootNote();
                if (typeof window.updateFretboardsForScaleChange === 'function') {
                    const primaryScale = getPrimaryScale();
                    const rootNote = getPrimaryRootNote();
                    window.updateFretboardsForScaleChange({
                        primaryScale: primaryScale,
                        rootNote: rootNote
                    });
                }
            }
        });
        
        // Add hover effects
        newNextRootBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#666';
        });
        newNextRootBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#444';
        });
    }
}

// Initialize navigation buttons when the module loads
initializeNavigationButtons();

export {
    HeptatonicScales,
    HexatonicScales,
    PentatonicScales,
    scales,
    getScaleNotes,
    precomputeScaleChords,
    precomputeChordsForScales,
    getPrecomputedChords,
    getChordsForScale,
    clearChordCache,
    getChordCacheStats,
    createHeptatonicScaleTable,
    createQuickScalePicker,
    scaleState,
    getPrimaryScale,
    navigateToNextScale,
    navigateToPreviousScale,
    getPrimaryRootNote,
    navigateToNextRootNote,
    navigateToPreviousRootNote,
    updateCurrentScaleDisplay,
    refreshChordsForRootNote,
    initializeNavigationButtons,
    initializeNavigationButtonsDirect,
    setPrimaryRootNote,
    setPrimaryScale,
    navigateRootUpExclusive,
    navigateRootDownExclusive,
    navigateModeUpExclusive,
    navigateModeDownExclusive,
    navigateScaleFamilyUpExclusive,
    navigateScaleFamilyDownExclusive,
    navigateSequentialUpExclusive,
    navigateSequentialDownExclusive
};
