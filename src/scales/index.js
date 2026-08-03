// Public barrel for src/scales/. This is what src/scaleGenerator.js and
// src/scales.js were reduced to across REFACTOR_PLAN.md Phase 4's
// extraction steps: state.js, scaleData.js, ui/infoPanel.js,
// ui/rootNoteTable.js, ui/scaleTable.js all moved out (see ARCHITECTURE.md
// §6.23-6.26); what's left here is pure glue - the two DOM key-highlighting
// functions (highlightKeysForScales, from scales.js, and highlightScaleNotes,
// from scaleGenerator.js - two unrelated functions with similar names and
// jobs, both kept as-is rather than merged), updateCurrentScaleDisplay (the
// hub every UI cluster calls to refresh after a selection change), and the
// navigation-button wiring - plus the re-exports that make this folder's
// public surface a single import.
//
// External callers previously split their imports between
// `from './scaleGenerator'` and `from './scales'`; both files are deleted
// and every external importer now pulls everything from here
// (`from './scales'`, which now resolves to this directory's index). The
// export surface below is the union of what both files exported - this
// step is a pure move, not a public-API change.
//
// scales.js's own module-evaluation order is preserved: its content
// (including the `keys_chords` DOM-lookup table, built once at import time)
// runs before scaleGenerator.js's content below it, same as when
// scaleGenerator.js used to `import` from scales.js.
//
// Two-way imports with ./state.js, ./ui/scaleTable.js and
// ./ui/rootNoteTable.js are expected, not a sign of a design problem - see
// their own file headers for why.

import $ from 'jquery';
import { noteToMidi, keys } from '../midi';
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

const getElementByMIDI = (note) =>
  note && document.querySelector(`[midi="${note}_scale"]`);

const keys_chords = {
    60 : { element: getElementByMIDI("60"), note: "C",  octave: 4 },
    61 : { element: getElementByMIDI("61"), note: "C#", octave: 4 },
    62 : { element: getElementByMIDI("62"), note: "D",  octave: 4 },
    63 : { element: getElementByMIDI("63"), note: "D#", octave: 4 },
    64 : { element: getElementByMIDI("64"), note: "E",  octave: 4 },
    65 : { element: getElementByMIDI("65"), note: "F",  octave: 4 },
    66 : { element: getElementByMIDI("66"), note: "F#", octave: 4 },
    67 : { element: getElementByMIDI("67"), note: "G",  octave: 4 },
    68 : { element: getElementByMIDI("68"), note: "G#", octave: 4 },
    69 : { element: getElementByMIDI("69"), note: "A",  octave: 4 },
    70 : { element: getElementByMIDI("70"), note: "A#", octave: 4 },
    71 : { element: getElementByMIDI("71"), note: "B",  octave: 4 },
    72 : { element: getElementByMIDI("72"), note: "C",  octave: 5 },
    73 : { element: getElementByMIDI("73"), note: "C#", octave: 5 },
    74 : { element: getElementByMIDI("74"), note: "D",  octave: 5 },
    75 : { element: getElementByMIDI("75"), note: "D#", octave: 5 },
    76 : { element: getElementByMIDI("76"), note: "E",  octave: 5 },
    77 : { element: getElementByMIDI("77"), note: "F",  octave: 5 },
    78 : { element: getElementByMIDI("78"), note: "F#", octave: 5 },
    79 : { element: getElementByMIDI("79"), note: "G",  octave: 5 },
    80 : { element: getElementByMIDI("80"), note: "G#", octave: 5 },
    81 : { element: getElementByMIDI("81"), note: "A",  octave: 5 },
    82 : { element: getElementByMIDI("82"), note: "A#", octave: 5 },
    83 : { element: getElementByMIDI("83"), note: "B",  octave: 5 },
    84 : { element: getElementByMIDI("84"), note: "C",  octave: 6 },
};

function highlightKeysForScales(notes){
    for(var key in keys_chords) {
        if (keys_chords[key].element) {
            keys_chords[key].element.classList.remove('highlightedKey');
        }
    }
    // console.log("Highlighting keys for notes:", notes);
    if (notes && notes.length > 0) {
        notes.forEach(note => {
            var n = noteToMidi(note) + 12;
            let key = keys_chords[n];
            // console.log("Key for note:", note, "is", key, "MIDI:", n);
            if (key && key.element) {
                // console.log("Highlighting key:", key.note, "Octave:", key.octave);
                key.element.classList.add('highlightedKey');
            }
        });
    }
}

var currentScaleHighlight = []
function highlightScaleNotes(noteArray){
    for( const key of currentScaleHighlight){
        const midi = noteToMidi(key) + 12;
        keys[midi].element.classList.remove('scaleKey');
    }
    currentScaleHighlight = [];
    if(Array.isArray(noteArray)){
        for(const key of noteArray){
            const midi = noteToMidi(key) + 12;
            // console.log('key: ', key, ' midi note:', midi);
            // console.log(keys[midi])
            if(midi >=  parseInt($('#lowestNoteSelection').val()) && midi <=  parseInt($('#highestNoteSelection').val())){
            keys[midi].element.classList.add('scaleKey');;
            currentScaleHighlight.push(key);
            }
        }
    }else{
        const midi = noteToMidi(noteArray) + 12;
        keys[midi].element.classList.add('scaleKey');;
        currentScaleHighlight.push(noteArray);     
    }
}

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
    console.log('Updating scale notes for display:', rootNote, intervals);
    const scaleNotes = getScaleNotes(rootNote, intervals);

    console.log('Scale notes for display:', scaleNotes);
    highlightKeysForScales(scaleNotes);
    highlightScaleNotes(scaleNotes);

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
    highlightKeysForScales,
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
