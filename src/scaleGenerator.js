import $ from 'jquery';
import {HeptatonicScales, highlightKeysForScales, getScaleNotes} from './scales';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput} from './midi';
import { updateScaleInfoPanel } from './scales/ui/infoPanel';
import { createHeptatonicScaleTable, createQuickScalePicker } from './scales/ui/scaleTable';
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
} from './scales/state';

// Import progression refresh function (use dynamic import to avoid circular dependency)
let refreshProgressionDisplay = null;
try {
    import('./progressions').then(module => {
        refreshProgressionDisplay = module.refreshProgressionDisplay;
    });
} catch (e) {
    console.warn('Could not import progression refresh function:', e);
}


var currentScaleHighlight = []
function highlightScaleNotes(noteArray){
    for( var key of currentScaleHighlight){
        var midi = noteToMidi(key) + 12;
        keys[midi].element.classList.remove('scaleKey');
    }
    currentScaleHighlight = [];
    if(Array.isArray(noteArray)){
        for(var key of noteArray){
            var midi = noteToMidi(key) + 12;
            // console.log('key: ', key, ' midi note:', midi);
            // console.log(keys[midi])
            if(midi >=  parseInt($('#lowestNoteSelection').val()) && midi <=  parseInt($('#highestNoteSelection').val())){
            keys[midi].element.classList.add('scaleKey');;
            currentScaleHighlight.push(key);
            }
        }
    }else{
        var midi = noteToMidi(noteArray) + 12;
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

    // Refresh progression display if available
    if (refreshProgressionDisplay && typeof refreshProgressionDisplay === 'function') {
        refreshProgressionDisplay();
    }

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
}