import $ from 'jquery';
import {HeptatonicScales, scales, highlightKeysForScales, getScaleNotes, precomputeScaleChords, getChordsForScale, translateNotes, stripOctave} from './scales';
import {identifySyntheticChords} from './intervals';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput} from './midi';
import { createScalePiano } from './components/MiniPiano/MiniPiano';

// Import progression refresh function (use dynamic import to avoid circular dependency)
let refreshProgressionDisplay = null;
try {
    import('./progressions').then(module => {
        refreshProgressionDisplay = module.refreshProgressionDisplay;
    });
} catch (e) {
    console.warn('Could not import progression refresh function:', e);
}

// Global array to store selected scales
let selectedScales = ['Major-1']; // Default to first scale
let exclusiveMode = false; // Toggle between exclusive and multiple selection modes

/**
 * Smart tooltip positioning function that keeps tooltips within viewport bounds
 * @param {HTMLElement} tooltip - The tooltip element
 * @param {MouseEvent} e - The mouse event
 */
function positionTooltipSmart(tooltip, e) {
    // Get tooltip dimensions after it's been added to DOM
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate preferred position (bottom-right of cursor)
    let left = e.pageX + 10;
    let top = e.pageY + 10;
    
    // Check if tooltip would go off the right edge
    if (left + tooltipRect.width > viewportWidth) {
        left = e.pageX - tooltipRect.width - 10; // Position to the left of cursor
    }
    
    // Check if tooltip would go off the bottom edge
    if (top + tooltipRect.height > viewportHeight) {
        top = e.pageY - tooltipRect.height - 10; // Position above cursor
    }
    
    // Ensure tooltip doesn't go off the left edge
    if (left < 0) {
        left = 10; // Small margin from left edge
    }
    
    // Ensure tooltip doesn't go off the top edge
    if (top < 0) {
        top = 10; // Small margin from top edge
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// Primary scale index for navigation through multiple selected scales
let primaryScaleIndex = 0;

// Global variable to store selected root notes (can be array or single string)
let selectedRootNote = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']; // Default to C

// Primary root note index for navigation through multiple selected root notes
let primaryRootNoteIndex = 0;

// Global object to store user's enharmonic display preferences
// Maps chromatic positions to preferred display (sharp or flat)
let enharmonicDisplayPreferences = {
    1: 'C♯',  // Default to sharp for C♯/D♭
    3: 'D♯',  // Default to sharp for D♯/E♭
    6: 'F♯',  // Default to sharp for F♯/G♭
    8: 'G♯',  // Default to sharp for G♯/A♭
    10: 'A♯'  // Default to sharp for A♯/B♭
};

// Helper function to get chromatic position of a note
function getChromaticPosition(note) {
    const chromaticNotes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const flatToSharp = { 'D♭': 'C♯', 'E♭': 'D♯', 'G♭': 'F♯', 'A♭': 'G♯', 'B♭': 'A♯' };
    
    // Convert flat to sharp for lookup
    const normalizedNote = flatToSharp[note] || note;
    return chromaticNotes.indexOf(normalizedNote);
}

// Helper function to get the preferred display for a note
function getPreferredDisplay(note) {
    const position = getChromaticPosition(note);
    if (position !== -1 && enharmonicDisplayPreferences[position]) {
        return enharmonicDisplayPreferences[position];
    }
    return note; // Return original if no preference or not an enharmonic note
}

// Helper function to set enharmonic display preference
function setEnharmonicPreference(note) {
    const position = getChromaticPosition(note);
    if (position !== -1) {
        enharmonicDisplayPreferences[position] = note;
    }
}

// Helper function to sort root notes in chromatic order
function sortRootNotesChronomatically(noteArray) {
    if (!Array.isArray(noteArray)) return noteArray;
    
    // Define chromatic order including both sharp and flat versions
    const chromaticOrder = [
        'C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'
    ];
    
    // Create a map for quick lookup of chromatic positions
    const chromaticPositions = {};
    chromaticOrder.forEach((note, index) => {
        chromaticPositions[note] = index;
    });
    
    // Sort the array based on chromatic positions
    return noteArray.slice().sort((a, b) => {
        const posA = chromaticPositions[a] !== undefined ? chromaticPositions[a] : 999;
        const posB = chromaticPositions[b] !== undefined ? chromaticPositions[b] : 999;
        return posA - posB;
    });
}

// Helper function to sort root notes and update the primary index accordingly
function sortRootNotesAndUpdateIndex(noteArray, currentPrimaryNote) {
    if (!Array.isArray(noteArray)) return noteArray;
    
    // Define enharmonic equivalents for finding the correct index
    const enharmonicPairs = {
        'C♯': 'D♭', 'D♭': 'C♯',
        'D♯': 'E♭', 'E♭': 'D♯', 
        'F♯': 'G♭', 'G♭': 'F♯',
        'G♯': 'A♭', 'A♭': 'G♯',
        'A♯': 'B♭', 'B♭': 'A♯'
    };
    
    const sortedArray = sortRootNotesChronomatically(noteArray);
    
    // Update primary index to match the new position of the current primary note or its enharmonic equivalent
    if (currentPrimaryNote) {
        let newIndex = sortedArray.indexOf(currentPrimaryNote);
        
        // If exact match not found, try to find enharmonic equivalent
        if (newIndex === -1 && enharmonicPairs[currentPrimaryNote]) {
            const enharmonicEquivalent = enharmonicPairs[currentPrimaryNote];
            newIndex = sortedArray.indexOf(enharmonicEquivalent);
        }
        
        // Only update the index if we found a match (either exact or enharmonic)
        if (newIndex !== -1) {
            primaryRootNoteIndex = newIndex;
        }
    }
    
    return sortedArray;
}

// Function to get the current primary scale
function getPrimaryScale() {
    if (selectedScales.length === 0) return null;
    if (primaryScaleIndex >= selectedScales.length) {
        primaryScaleIndex = 0; // Reset if index is out of bounds
    }
    return selectedScales[primaryScaleIndex];
}

// Function to navigate to next scale
function navigateToNextScale() {
    if (selectedScales.length <= 1) return false; // No navigation needed
    primaryScaleIndex = (primaryScaleIndex + 1) % selectedScales.length;
    updateCurrentScaleDisplay();
    return true;
}

// Function to navigate to previous scale
function navigateToPreviousScale() {
    if (selectedScales.length <= 1) return false; // No navigation needed
    primaryScaleIndex = (primaryScaleIndex - 1 + selectedScales.length) % selectedScales.length;
    updateCurrentScaleDisplay();
    return true;
}

// Function to get the current primary root note
function getPrimaryRootNote() {
    let rootNote;
    if (Array.isArray(selectedRootNote)) {
        if (selectedRootNote.length === 0) return 'C';
        if (primaryRootNoteIndex >= selectedRootNote.length) {
            primaryRootNoteIndex = 0; // Reset if index is out of bounds
        }
        rootNote = selectedRootNote[primaryRootNoteIndex];
    } else {
        rootNote = selectedRootNote;
    }
    
    // Return the preferred display version of this root note
    return getPreferredDisplay(rootNote);
}

// Function to navigate to next root note
function navigateToNextRootNote() {
    if (!Array.isArray(selectedRootNote) || selectedRootNote.length <= 1) return false; // No navigation needed
    primaryRootNoteIndex = (primaryRootNoteIndex + 1) % selectedRootNote.length;
    updateCurrentScaleDisplay();
    return true;
}

// Function to navigate to previous root note
function navigateToPreviousRootNote() {
    if (!Array.isArray(selectedRootNote) || selectedRootNote.length <= 1) return false; // No navigation needed
    primaryRootNoteIndex = (primaryRootNoteIndex - 1 + selectedRootNote.length) % selectedRootNote.length;
    updateCurrentScaleDisplay();
    return true;
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
    
    // Show navigation indicators
    // let indicators = [];
    // if (selectedScales.length > 1) {
    //     indicators.push(`Scale: ${primaryScaleIndex + 1}/${selectedScales.length}`);
    // }
    // if (Array.isArray(selectedRootNote) && selectedRootNote.length > 1) {
    //     indicators.push(`Root: ${primaryRootNoteIndex + 1}/${selectedRootNote.length}`);
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

// Utility functions to manage selected scales
function getSelectedScales() {
    return selectedScales.slice(); // Return a copy of the array
}

function clearSelectedScales() {
    selectedScales = [];
    primaryScaleIndex = 0;
    // Refresh the table to update visual state
    createHeptatonicScaleTable();
    updateCurrentScaleDisplay();
}

function addSelectedScale(scaleId) {
    if (!selectedScales.includes(scaleId)) {
        selectedScales.push(scaleId);
        
        // Precompute chords for this scale with current root note(s)
        const rootNotes = Array.isArray(selectedRootNote) ? selectedRootNote : [selectedRootNote];
        for (const rootNote of rootNotes) {
            precomputeScaleChords(scaleId, rootNote);
        }
        
        // If this is the first scale being added, make it primary
        if (selectedScales.length === 1) {
            primaryScaleIndex = 0;
        }
        // Refresh the table to update visual state
        createHeptatonicScaleTable();
        updateCurrentScaleDisplay();
    }
}

function removeSelectedScale(scaleId) {
    const index = selectedScales.indexOf(scaleId);
    if (index > -1) {
        selectedScales.splice(index, 1);
        // Adjust primary scale index if needed
        if (primaryScaleIndex >= selectedScales.length) {
            primaryScaleIndex = Math.max(0, selectedScales.length - 1);
        } else if (primaryScaleIndex > index) {
            primaryScaleIndex--;
        }
        // Refresh the table to update visual state
        createHeptatonicScaleTable();
        updateCurrentScaleDisplay();
    }
}

function toggleSelectionMode() {
    exclusiveMode = !exclusiveMode;
    
    // If switching to exclusive mode and multiple items are selected, keep only the first one
    if (exclusiveMode && selectedScales.length > 1) {
        selectedScales = [selectedScales[0]];
        primaryScaleIndex = 0;
    }
    
    // Handle root note selection mode change
    if (exclusiveMode && Array.isArray(selectedRootNote)) {
        // Switch to exclusive mode - keep only the first selected root note
        selectedRootNote = selectedRootNote[0];
        primaryRootNoteIndex = 0;
    }
    
    // console.log(`Selection mode: ${exclusiveMode ? 'Exclusive' : 'Multiple'}`);
    // Don't call createHeptatonicScaleTable here - let the event listener handle it
}

// Try to get the new scale controls container first, fallback to old one
let placeholder = document.getElementById('scaleControlsContainer') || document.getElementById('placeholderContent');
if (placeholder) {
    while (placeholder.firstChild) {
        placeholder.removeChild(placeholder.firstChild);
    }
}

function intToRoman(num){
    const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
    return romanNumerals[num] || "";
}

// Create a table for selecting root notes
function createRootNoteTable() {
    const chromaticNotes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    
    // Define enharmonic equivalents for accidental notes
    const enharmonicPairs = {
        'C♯': 'D♭',
        'D♯': 'E♭', 
        'F♯': 'G♭',
        'G♯': 'A♭',
        'A♯': 'B♭'
    };

    let rootTableContainer = document.createElement('div');
    rootTableContainer.style.marginBottom = '15px';
    
    let rootTableLabel = document.createElement('h3');
    rootTableLabel.textContent = 'Root Note Selection';
    rootTableLabel.style.margin = '0 0 8px 0';
    rootTableLabel.style.fontSize = '17px';
    rootTableLabel.style.fontWeight = 'bold';
    
    let rootTable = document.createElement('table');
    rootTable.style.borderCollapse = 'collapse';
    rootTable.style.margin = '0';
    
    let row = document.createElement('tr');
    
    // Add "All" cell at the beginning
    let allCell = document.createElement('td');
    allCell.style.border = '1px solid #ccc';
    allCell.style.padding = '6px 8px';
    allCell.style.textAlign = 'center';
    allCell.style.cursor = 'pointer';
    allCell.style.userSelect = 'none';
    allCell.style.fontWeight = 'bold';
    allCell.style.fontSize = '18px';
    allCell.style.minWidth = '32px';
    allCell.style.backgroundColor = '#353535ff';
    allCell.style.fontStyle = 'italic';
    
    allCell.textContent = 'All';
    
    // Check if all notes are selected (considering only one version of each enharmonic pair)
    let allNotesSelected = false;
    if (Array.isArray(selectedRootNote)) {
        // Count unique chromatic positions, considering enharmonic equivalents
        const selectedChromaticPositions = new Set();
        selectedRootNote.forEach(note => {
            // Map each note to its chromatic position
            const chromaticIndex = chromaticNotes.indexOf(note);
            if (chromaticIndex !== -1) {
                selectedChromaticPositions.add(chromaticIndex);
            } else {
                // Check if it's an enharmonic equivalent
                for (const [sharp, flat] of Object.entries(enharmonicPairs)) {
                    if (note === flat) {
                        const sharpIndex = chromaticNotes.indexOf(sharp);
                        if (sharpIndex !== -1) {
                            selectedChromaticPositions.add(sharpIndex);
                        }
                    }
                }
            }
        });
        allNotesSelected = (selectedChromaticPositions.size === chromaticNotes.length);
    }
    
    if (allNotesSelected) {
        allCell.style.backgroundColor = '#2196F3';
        allCell.style.color = 'white';
    }
    
    // Add click event for "All" cell
    allCell.onclick = function() {
        // Remove any existing tooltips
        const existingTooltips = document.querySelectorAll('.scale-tooltip');
        existingTooltips.forEach(tooltip => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
        
        if (exclusiveMode) {
            // In exclusive mode, "All" doesn't make sense, so do nothing
            // Could alternatively select 'C' or show a message
            return;
        } else {
            // In multiple mode, toggle between all selected and just 'C'
            if (Array.isArray(selectedRootNote)) {
                // Count unique chromatic positions to check if all are selected
                const selectedChromaticPositions = new Set();
                selectedRootNote.forEach(note => {
                    const chromaticIndex = chromaticNotes.indexOf(note);
                    if (chromaticIndex !== -1) {
                        selectedChromaticPositions.add(chromaticIndex);
                    } else {
                        // Check if it's an enharmonic equivalent
                        for (const [sharp, flat] of Object.entries(enharmonicPairs)) {
                            if (note === flat) {
                                const sharpIndex = chromaticNotes.indexOf(sharp);
                                if (sharpIndex !== -1) {
                                    selectedChromaticPositions.add(sharpIndex);
                                }
                            }
                        }
                    }
                });
                
                if (selectedChromaticPositions.size === chromaticNotes.length) {
                    // All are selected, reset to just 'C'
                    selectedRootNote = 'C';
                    primaryRootNoteIndex = 0;
                } else {
                    // Not all selected, select all (using sharp versions by default)
                    selectedRootNote = [...chromaticNotes];
                    primaryRootNoteIndex = 0;
                }
            } else {
                // Not all selected, select all
                selectedRootNote = [...chromaticNotes];
                primaryRootNoteIndex = 0;
            }
            refreshChordsForRootNote(); // Refresh chords for updated root notes
        }
        
        // console.log('Selected root note(s):', selectedRootNote);
        // Refresh both tables to update visual state
        createHeptatonicScaleTable();
        updateCurrentScaleDisplay();
    };
    
    // Add hover effects and tooltips for "All" cell
    allCell.onmouseover = function() {
        if (!allNotesSelected) {
            allCell.style.backgroundColor = '#3a3a3aff';
        }
        
        // Add tooltip
        let tooltip = document.createElement('div');
        tooltip.className = 'scale-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.background = '#000';
        tooltip.style.color = 'white';
        tooltip.style.border = '1px solid #ccc';
        tooltip.style.padding = '4px 8px';
        tooltip.style.zIndex = 1000;
        tooltip.style.fontSize = '11px';
        
        let tooltipText = `<strong>All Root Notes</strong><br>`;
        if (exclusiveMode) {
            tooltipText += `<em>Not available in exclusive mode</em>`;
        } else {
            tooltipText += `<em>Click to ${allNotesSelected ? 'reset to C only' : 'select all notes'}</em>`;
        }
        tooltip.innerHTML = tooltipText;
        
        document.body.appendChild(tooltip);

        allCell.onmousemove = function(e) {
            positionTooltipSmart(tooltip, e);
        };
    };
    
    allCell.onmouseleave = function() {
        if (!allNotesSelected) {
            allCell.style.backgroundColor = '#393939ff';
        }
        
        // Remove tooltip
        const existingTooltips = document.querySelectorAll('.scale-tooltip');
        existingTooltips.forEach(tooltip => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
        allCell.onmousemove = null;
    };
    
    row.appendChild(allCell);
    
    // Helper function to check if a note is selected
    function isNoteSelected(note) {
        if (exclusiveMode) {
            // Check if the note or its enharmonic equivalent is selected
            const position = getChromaticPosition(note);
            if (Array.isArray(selectedRootNote)) {
                return selectedRootNote.some(selectedNote => getChromaticPosition(selectedNote) === position);
            } else {
                return getChromaticPosition(selectedRootNote) === position;
            }
        } else {
            if (Array.isArray(selectedRootNote)) {
                // Check if the note or its enharmonic equivalent is selected
                const position = getChromaticPosition(note);
                return selectedRootNote.some(selectedNote => getChromaticPosition(selectedNote) === position);
            } else {
                return getChromaticPosition(selectedRootNote) === getChromaticPosition(note);
            }
        }
    }
    
    // Helper function to create a click handler for a note
    function createNoteClickHandler(note, alternativeNote = null) {
        return function() {
            console.log('Root note clicked:', note, 'Current selectedRootNote:', selectedRootNote);
            
            // Remove any existing tooltips
            const existingTooltips = document.querySelectorAll('.scale-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            
            // If there's an alternative note and it's currently selected, switch the display preference
            // This handles enharmonic switching (e.g., D♯ ↔ E♭) without changing the actual selection
            if (alternativeNote && isNoteSelected(alternativeNote)) {
                console.log(`Switching display preference from ${getPreferredDisplay(alternativeNote)} to ${note}`);
                console.log(`Selected root notes before: ${Array.isArray(selectedRootNote) ? selectedRootNote.join(', ') : selectedRootNote}`);
                console.log(`Primary index before: ${primaryRootNoteIndex}`);
                
                // Update the enharmonic display preference to the newly clicked note
                setEnharmonicPreference(note);
                
                console.log(`Selected root notes after: ${Array.isArray(selectedRootNote) ? selectedRootNote.join(', ') : selectedRootNote}`);
                console.log(`Primary index after: ${primaryRootNoteIndex}`);
                console.log(`getPrimaryRootNote() now returns: ${getPrimaryRootNote()}`);
                
                // Refresh the display to show the new enharmonic preference
                refreshChordsForRootNote();
                createHeptatonicScaleTable();
                updateCurrentScaleDisplay();
                return;
            }
            
            if (exclusiveMode) {
                // In exclusive mode, always select the clicked note
                selectedRootNote = note;
                primaryRootNoteIndex = 0;
                console.log('Set root note to:', selectedRootNote);
                refreshChordsForRootNote(); // Refresh chords for new root note
            } else {
                // In multiple mode, toggle selection
                if (Array.isArray(selectedRootNote)) {
                    // Already in array mode
                    const index = selectedRootNote.indexOf(note);
                    if (index > -1) {
                        // Note is selected, remove it
                        selectedRootNote.splice(index, 1);
                        // Adjust primary root note index if needed
                        if (primaryRootNoteIndex >= selectedRootNote.length) {
                            primaryRootNoteIndex = Math.max(0, selectedRootNote.length - 1);
                        } else if (primaryRootNoteIndex > index) {
                            primaryRootNoteIndex--;
                        }
                        // If array becomes empty, default to 'C'
                        if (selectedRootNote.length === 0) {
                            selectedRootNote = 'C';
                            primaryRootNoteIndex = 0;
                        }
                        refreshChordsForRootNote(); // Refresh chords for updated root notes
                    } else {
                        // Note is not selected, add it
                        selectedRootNote.push(note);
                        // Sort the array chronomatically and update primary index
                        const currentPrimary = getPrimaryRootNote();
                        selectedRootNote = sortRootNotesAndUpdateIndex(selectedRootNote, currentPrimary);
                        refreshChordsForRootNote(); // Refresh chords for new root note
                    }
                } else {
                    // Convert to array mode
                    if (selectedRootNote === note) {
                        // Clicking the same note - convert to array with just 'C'
                        selectedRootNote = 'C';
                        primaryRootNoteIndex = 0;
                        refreshChordsForRootNote(); // Refresh chords for reset root note
                    } else {
                        // Clicking a different note - convert to array with both
                        selectedRootNote = [selectedRootNote, note];
                        // Sort the array chronomatically and update primary index
                        const currentPrimary = getPrimaryRootNote();
                        selectedRootNote = sortRootNotesAndUpdateIndex(selectedRootNote, currentPrimary);
                        refreshChordsForRootNote(); // Refresh chords for new root notes
                    }
                }
            }
            
            console.log('Final selectedRootNote:', selectedRootNote, 'Primary index:', primaryRootNoteIndex);
            console.log('getPrimaryRootNote() returns:', getPrimaryRootNote());
            
            // Refresh both tables to update visual state
            createHeptatonicScaleTable();
            updateCurrentScaleDisplay();
        };
    }
    
    for (let note of chromaticNotes) {
        let cell = document.createElement('td');
        cell.style.border = '1px solid #ccc';
        cell.style.padding = '0';
        cell.style.textAlign = 'center';
        cell.style.userSelect = 'none';
        cell.style.fontWeight = 'bold';
        cell.style.fontSize = '12px';
        cell.style.minWidth = '32px';
        cell.style.position = 'relative';
        
        // Check if this note has an enharmonic equivalent
        if (enharmonicPairs[note]) {
            // Create split cell with both sharp and flat versions
            const flatNote = enharmonicPairs[note];
            
            // Create two sub-divs for the split cell
            let topDiv = document.createElement('div');
            topDiv.style.height = '50%';
            topDiv.style.display = 'flex';
            topDiv.style.alignItems = 'center';
            topDiv.style.justifyContent = 'center';
            topDiv.style.cursor = 'pointer';
            topDiv.style.padding = '3px 4px';
            topDiv.style.borderBottom = '0.5px solid #ccc';
            topDiv.textContent = note; // Sharp version
            
            let bottomDiv = document.createElement('div');
            bottomDiv.style.height = '50%';
            bottomDiv.style.display = 'flex';
            bottomDiv.style.alignItems = 'center';
            bottomDiv.style.justifyContent = 'center';
            bottomDiv.style.cursor = 'pointer';
            bottomDiv.style.padding = '3px 4px';
            bottomDiv.textContent = flatNote; // Flat version
            
            // Check selection status - only show the preferred enharmonic version as selected
            const chromaticPos = getChromaticPosition(note);
            const isThisChromaticPositionSelected = (exclusiveMode ? 
                getChromaticPosition(selectedRootNote) === chromaticPos :
                (Array.isArray(selectedRootNote) ? 
                    selectedRootNote.some(sel => getChromaticPosition(sel) === chromaticPos) :
                    getChromaticPosition(selectedRootNote) === chromaticPos));
            
            const preferredNote = getPreferredDisplay(note);
            const sharpSelected = isThisChromaticPositionSelected && preferredNote === note;
            const flatSelected = isThisChromaticPositionSelected && preferredNote === flatNote;
            
            // Style the selected version
            if (sharpSelected) {
                topDiv.style.backgroundColor = '#2196F3';
                topDiv.style.color = 'white';
            }
            if (flatSelected) {
                bottomDiv.style.backgroundColor = '#2196F3';
                bottomDiv.style.color = 'white';
            }
            
            // Add click handlers
            topDiv.onclick = createNoteClickHandler(note, flatNote);
            bottomDiv.onclick = createNoteClickHandler(flatNote, note);
            
            // Add hover effects for sharp version
            topDiv.onmouseover = function() {
                if (!sharpSelected) {
                    topDiv.style.backgroundColor = '#6a8090ff';
                }
                
                // Add tooltip and keyboard highlighting
                let tooltip = document.createElement('div');
                tooltip.className = 'scale-tooltip';
                tooltip.style.position = 'absolute';
                tooltip.style.background = '#000';
                tooltip.style.color = 'white';
                tooltip.style.border = '1px solid #ccc';
                tooltip.style.padding = '8px 12px';
                tooltip.style.zIndex = 1000;
                tooltip.style.fontSize = '11px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                
                let tooltipText = `<strong>Root Note:</strong> ${note}<br>`;
                if (exclusiveMode) {
                    tooltipText += `<em>Click to ${sharpSelected ? 'keep selected' : (isThisChromaticPositionSelected ? 'switch to sharp' : 'select')}</em>`;
                } else {
                    tooltipText += `<em>Click to ${sharpSelected ? 'deselect' : (isThisChromaticPositionSelected ? 'switch to sharp' : 'select')}</em>`;
                }
                
                // Create a container for text and mini piano
                const tooltipContent = document.createElement('div');
                tooltipContent.innerHTML = tooltipText;
                tooltip.appendChild(tooltipContent);

                // Add mini piano visualization if scale is available
                if (selectedScales.length > 0) {
                    let firstScaleId = selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let scales = HeptatonicScales;
                    
                    try {
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(note, intervals);
                        
                        // Highlight keyboard for preview
                        highlightKeysForScales(scaleNotes);
                        
                        // Create mini piano
                        const scaleNotesNoOctave = scaleNotes.map(n => typeof n === 'string' && n.includes('/') ? n.split('/')[0] : n);
                        const miniPiano = createScalePiano(scaleNotesNoOctave, note);
                        
                        if (miniPiano) {
                            const pianoContainer = document.createElement('div');
                            pianoContainer.style.cssText = `
                                margin-top: 8px;
                                border-top: 1px solid #444;
                                padding-top: 8px;
                                text-align: center;
                            `;
                            
                            const pianoLabel = document.createElement('div');
                            pianoLabel.textContent = `${note} ${family}`;
                            pianoLabel.style.cssText = `
                                font-size: 10px;
                                color: #ccc;
                                margin-bottom: 4px;
                            `;
                            
                            pianoContainer.appendChild(pianoLabel);
                            pianoContainer.appendChild(miniPiano);
                            tooltip.appendChild(pianoContainer);
                        }
                    } catch (error) {
                        console.warn('Error creating mini piano for scale tooltip:', error);
                        // Fallback to just keyboard highlighting
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(note, intervals);
                        highlightKeysForScales(scaleNotes);
                    }
                }
                
                document.body.appendChild(tooltip);

                topDiv.onmousemove = function(e) {
                    positionTooltipSmart(tooltip, e);
                };
            };
            
            topDiv.onmouseleave = function() {
                if (!sharpSelected) {
                    topDiv.style.backgroundColor = '';
                }
                
                // Remove tooltip and restore original keyboard highlighting
                const existingTooltips = document.querySelectorAll('.scale-tooltip');
                existingTooltips.forEach(tooltip => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                });
                
                // Restore original scale highlighting
                if (selectedScales.length > 0) {
                    let scales = HeptatonicScales;
                    let firstScaleId = selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                    let scaleNotes = getScaleNotes(getPrimaryRootNote(), intervals);
                    highlightKeysForScales(scaleNotes);
                }
                topDiv.onmousemove = null;
            };
            
            // Add hover effects for flat version (similar to sharp)
            bottomDiv.onmouseover = function() {
                if (!flatSelected) {
                    bottomDiv.style.backgroundColor = '#6a8090ff';
                }
                
                let tooltip = document.createElement('div');
                tooltip.className = 'scale-tooltip';
                tooltip.style.position = 'absolute';
                tooltip.style.background = '#000';
                tooltip.style.color = 'white';
                tooltip.style.border = '1px solid #ccc';
                tooltip.style.padding = '8px 12px';
                tooltip.style.zIndex = 1000;
                tooltip.style.fontSize = '11px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                
                let tooltipText = `<strong>Root Note:</strong> ${flatNote}<br>`;
                if (exclusiveMode) {
                    tooltipText += `<em>Click to ${flatSelected ? 'keep selected' : (isThisChromaticPositionSelected ? 'switch to flat' : 'select')}</em>`;
                } else {
                    tooltipText += `<em>Click to ${flatSelected ? 'deselect' : (isThisChromaticPositionSelected ? 'switch to flat' : 'select')}</em>`;
                }
                
                // Create a container for text and mini piano
                const tooltipContent = document.createElement('div');
                tooltipContent.innerHTML = tooltipText;
                tooltip.appendChild(tooltipContent);

                // Add mini piano visualization if scale is available
                if (selectedScales.length > 0) {
                    let firstScaleId = selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let scales = HeptatonicScales;
                    
                    try {
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(flatNote, intervals);
                        
                        // Highlight keyboard for preview
                        highlightKeysForScales(scaleNotes);
                        
                        // Create mini piano
                        const scaleNotesNoOctave = scaleNotes.map(n => typeof n === 'string' && n.includes('/') ? n.split('/')[0] : n);
                        const miniPiano = createScalePiano(scaleNotesNoOctave, flatNote);
                        
                        if (miniPiano) {
                            const pianoContainer = document.createElement('div');
                            pianoContainer.style.cssText = `
                                margin-top: 8px;
                                border-top: 1px solid #444;
                                padding-top: 8px;
                                text-align: center;
                            `;
                            
                            const pianoLabel = document.createElement('div');
                            pianoLabel.textContent = `${flatNote} ${family}`;
                            pianoLabel.style.cssText = `
                                font-size: 10px;
                                color: #ccc;
                                margin-bottom: 4px;
                            `;
                            
                            pianoContainer.appendChild(pianoLabel);
                            pianoContainer.appendChild(miniPiano);
                            tooltip.appendChild(pianoContainer);
                        }
                    } catch (error) {
                        console.warn('Error creating mini piano for scale tooltip:', error);
                        // Fallback to just keyboard highlighting
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(flatNote, intervals);
                        highlightKeysForScales(scaleNotes);
                    }
                }
                
                document.body.appendChild(tooltip);

                bottomDiv.onmousemove = function(e) {
                    positionTooltipSmart(tooltip, e);
                };
            };
            
            bottomDiv.onmouseleave = function() {
                if (!flatSelected) {
                    bottomDiv.style.backgroundColor = '';
                }
                
                const existingTooltips = document.querySelectorAll('.scale-tooltip');
                existingTooltips.forEach(tooltip => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                });
                
                // Restore original scale highlighting
                if (selectedScales.length > 0) {
                    let scales = HeptatonicScales;
                    let firstScaleId = selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                    let scaleNotes = getScaleNotes(getPrimaryRootNote(), intervals);
                    highlightKeysForScales(scaleNotes);
                }
                bottomDiv.onmousemove = null;
            };
            
            cell.appendChild(topDiv);
            cell.appendChild(bottomDiv);
            
        } else {
            // Regular note cell (no enharmonic equivalent)
            cell.style.padding = '6px 8px';
            cell.style.cursor = 'pointer';
            cell.textContent = note;
            
            // Check if this note is currently selected
            let isSelected = isNoteSelected(note);
            
            if (isSelected) {
                cell.style.backgroundColor = '#2196F3';
                cell.style.color = 'white';
            } else {
                cell.style.backgroundColor = '';
                cell.style.color = '';
            }
            
            // Add click event to select root note
            cell.onclick = createNoteClickHandler(note);
            
            // Add hover effects and tooltips
            cell.onmouseover = function() {
                if (!isSelected) {
                    cell.style.backgroundColor = '#6a8090ff';
                }
                
                // Add tooltip
                let tooltip = document.createElement('div');
                tooltip.className = 'scale-tooltip';
                tooltip.style.position = 'absolute';
                tooltip.style.background = '#000';
                tooltip.style.color = 'white';
                tooltip.style.border = '1px solid #ccc';
                tooltip.style.padding = '8px 12px';
                tooltip.style.zIndex = 1000;
                tooltip.style.fontSize = '11px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                
                let tooltipText = `<strong>Root Note:</strong> ${note}<br>`;
                if (exclusiveMode) {
                    tooltipText += `<em>Click to ${isSelected ? 'keep selected' : 'select'}</em>`;
                } else {
                    tooltipText += `<em>Click to ${isSelected ? 'deselect' : 'select'}</em>`;
                }
                
                // Create a container for text and mini piano
                const tooltipContent = document.createElement('div');
                tooltipContent.innerHTML = tooltipText;
                tooltip.appendChild(tooltipContent);

                // Add mini piano visualization if scale is available
                if (selectedScales.length > 0) {
                    let firstScaleId = selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let scales = HeptatonicScales;
                    
                    try {
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(note, intervals);
                        
                        // Highlight keyboard for preview
                        highlightKeysForScales(scaleNotes);
                        
                        // Create mini piano
                        const scaleNotesNoOctave = scaleNotes.map(n => typeof n === 'string' && n.includes('/') ? n.split('/')[0] : n);
                        const miniPiano = createScalePiano(scaleNotesNoOctave, note);
                        
                        if (miniPiano) {
                            const pianoContainer = document.createElement('div');
                            pianoContainer.style.cssText = `
                                margin-top: 8px;
                                border-top: 1px solid #444;
                                padding-top: 8px;
                                text-align: center;
                            `;
                            
                            const pianoLabel = document.createElement('div');
                            pianoLabel.textContent = `${note} ${family}`;
                            pianoLabel.style.cssText = `
                                font-size: 10px;
                                color: #ccc;
                                margin-bottom: 4px;
                            `;
                            
                            pianoContainer.appendChild(pianoLabel);
                            pianoContainer.appendChild(miniPiano);
                            tooltip.appendChild(pianoContainer);
                        }
                    } catch (error) {
                        console.warn('Error creating mini piano for scale tooltip:', error);
                        // Fallback to just keyboard highlighting
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(note, intervals);
                        highlightKeysForScales(scaleNotes);
                    }
                }
                
                document.body.appendChild(tooltip);

                cell.onmousemove = function(e) {
                    positionTooltipSmart(tooltip, e);
                };
            };
            
            cell.onmouseleave = function() {
                if (!isSelected) {
                    cell.style.backgroundColor = '';
                }
                
                // Remove tooltip
                const existingTooltips = document.querySelectorAll('.scale-tooltip');
                existingTooltips.forEach(tooltip => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                });
                
                if (selectedScales.length > 0) {
                    let scales = HeptatonicScales;
                    let firstScaleId = selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                    let scaleNotes = getScaleNotes(getPrimaryRootNote(), intervals);
                    highlightKeysForScales(scaleNotes);
                }
                cell.onmousemove = null;
            };
        }
        
        row.appendChild(cell);
    }
    
    rootTable.appendChild(row);
    rootTableContainer.appendChild(rootTableLabel);
    rootTableContainer.appendChild(rootTable);
    
    return rootTableContainer;
}

// Create a table for the 7 heptatonic base scales and their scale degrees
function createHeptatonicScaleTable() {
    // Update placeholder reference to use the new container if available
    let currentPlaceholder = document.getElementById('scaleControlsContainer');
    if (!currentPlaceholder) {
        // Fallback to old placeholder if new one doesn't exist yet
        currentPlaceholder = document.getElementById('placeholderContent');
    }
    if (!currentPlaceholder) {
        console.warn('No placeholder found for scales - deferring initialization');
        // Try again in a bit if no container is available
        setTimeout(createHeptatonicScaleTable, 200);
        return;
    }
    
    // Clear all existing content
    while (currentPlaceholder.firstChild) {
        currentPlaceholder.removeChild(currentPlaceholder.firstChild);
    }

    // Create toggle switch container
    let toggleContainer = document.createElement('div');
    toggleContainer.style.marginBottom = '15px';
    toggleContainer.style.display = 'flex';
    toggleContainer.style.alignItems = 'center';
    toggleContainer.style.gap = '8px';
    
    // Create toggle switch
    let toggleSwitch = document.createElement('label');
    toggleSwitch.style.position = 'relative';
    toggleSwitch.style.display = 'inline-block';
    toggleSwitch.style.width = '50px';
    toggleSwitch.style.height = '28px';
    
    let toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = exclusiveMode;
    toggleInput.style.opacity = '0';
    toggleInput.style.width = '0';
    toggleInput.style.height = '0';
    
    let slider = document.createElement('span');
    slider.style.position = 'absolute';
    slider.style.cursor = 'pointer';
    slider.style.top = '0';
    slider.style.left = '0';
    slider.style.right = '0';
    slider.style.bottom = '0';
    slider.style.backgroundColor = exclusiveMode ? '#4CAF50' : '#ccc';
    slider.style.transition = '0.4s';
    slider.style.borderRadius = '28px';
    
    let sliderButton = document.createElement('span');
    sliderButton.style.position = 'absolute';
    sliderButton.style.content = '';
    sliderButton.style.height = '22px';
    sliderButton.style.width = '22px';
    sliderButton.style.left = exclusiveMode ? '25px' : '3px';
    sliderButton.style.bottom = '3px';
    sliderButton.style.backgroundColor = 'white';
    sliderButton.style.transition = '0.4s';
    sliderButton.style.borderRadius = '50%';
    
    slider.appendChild(sliderButton);
    toggleSwitch.appendChild(toggleInput);
    toggleSwitch.appendChild(slider);
    
    // Add label text
    let toggleLabel = document.createElement('span');
    toggleLabel.textContent = exclusiveMode ? 'Exclusive Selection' : 'Multiple Selection';
    toggleLabel.style.fontWeight = 'bold';
    toggleLabel.style.fontSize = '14px';
    
    // Add clear button
    let clearButton = document.createElement('button');
    clearButton.textContent = 'Clear All';
    clearButton.style.padding = '6px 12px';
    clearButton.style.backgroundColor = '#f44336';
    clearButton.style.color = 'white';
    clearButton.style.border = 'none';
    clearButton.style.borderRadius = '3px';
    clearButton.style.cursor = 'pointer';
    clearButton.style.fontSize = '14px';
    clearButton.style.marginLeft = '8px';
    
    clearButton.onclick = function() {
        selectedScales = ['Major-1']; // Reset to default first scale
        primaryScaleIndex = 0;
        selectedRootNote = 'C'; // Reset root note to C
        primaryRootNoteIndex = 0;
        createHeptatonicScaleTable();
        updateCurrentScaleDisplay();
    };
    
    // Add event listener to toggle
    toggleInput.addEventListener('change', function() {
        toggleSelectionMode();
        createHeptatonicScaleTable();
    });
    
    toggleContainer.appendChild(toggleSwitch);
    toggleContainer.appendChild(toggleLabel);
    toggleContainer.appendChild(clearButton);
    currentPlaceholder.appendChild(toggleContainer);

    // Add root note selection table
    let rootNoteTable = createRootNoteTable();
    currentPlaceholder.appendChild(rootNoteTable);

    let scales = HeptatonicScales;

    let scaleNames = Object.keys(scales);
    // console.log('scaleNames:', scaleNames);

    // Calculate the maximum number of modes in any scale family
    let maxModes = 0;
    for (let scaleName of scaleNames) {
        maxModes = Math.max(maxModes, scales[scaleName].length);
    }
    const numColumns = maxModes + 1; // +1 for the scale name column

    let table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.margin = '15px 0';
    table.style.fontSize = '18px';

    // Dynamic number of rows: 1 header row + number of scale families
    for (let i = 0; i < scaleNames.length + 1; i++) {
        let row = document.createElement('tr');
        // Dynamic number of columns: 1 for scale name + max number of modes
        for (let j = 0; j < numColumns; j++) {
            let cell = document.createElement('td');
            cell.style.border = '1px solid #ccc';
            cell.style.padding = '4px 8px';
            cell.style.fontSize = '16px';
            if (j==0){
                cell.style.fontWeight = 'bold';
                cell.style.backgroundColor = '#474747ff';
                cell.textContent = i === 0 ? 'Scale' : `${scaleNames[i-1]}`;
                
                // Add click functionality to select/deselect entire row
                if (i > 0 && !exclusiveMode) { // Skip the header row and disable in exclusive mode
                    cell.style.cursor = 'pointer';
                    cell.style.userSelect = 'none';
                    
                    cell.onclick = function() {
                        // Remove any existing tooltips
                        const existingTooltips = document.querySelectorAll('.scale-tooltip');
                        existingTooltips.forEach(tooltip => {
                            if (tooltip.parentNode) {
                                tooltip.parentNode.removeChild(tooltip);
                            }
                        });
                        
                        const scaleName = scaleNames[i-1];
                        const rowScaleIds = [];
                        
                        // Generate all scale IDs for this row (dynamically based on number of modes)
                        const numModes = scales[scaleName].length;
                        for (let col = 1; col <= numModes; col++) {
                            rowScaleIds.push(`${scaleName}-${col}`);
                        }
                        
                        // Check if all scales in this row are selected
                        const allSelected = rowScaleIds.every(id => selectedScales.includes(id));
                        
                        if (allSelected) {
                            if (exclusiveMode) {
                                // In exclusive mode, prevent deselection - do nothing
                                // Keep current selection
                            } else {
                                // In multiple mode, only deselect if we have other selections
                                const otherSelections = selectedScales.filter(id => !rowScaleIds.includes(id));
                                if (otherSelections.length > 0) {
                                    // We have other selections, safe to deselect this row
                                    rowScaleIds.forEach(id => {
                                        const index = selectedScales.indexOf(id);
                                        if (index > -1) {
                                            selectedScales.splice(index, 1);
                                        }
                                    });
                                }
                                // If no other selections, do nothing (keep this row selected)
                            }
                        } else {
                            if (exclusiveMode) {
                                // In exclusive mode, clear all selections first, then select this row
                                selectedScales = [];
                                selectedScales.push(...rowScaleIds);
                            } else {
                                // In multiple mode, add all unselected scales in this row
                                rowScaleIds.forEach(id => {
                                    if (!selectedScales.includes(id)) {
                                        selectedScales.push(id);
                                    }
                                });
                            }
                        }
                        
                        // console.log('Selected scales:', selectedScales);
                        
                        // Refresh the table to update visual state
                        createHeptatonicScaleTable();
                        updateCurrentScaleDisplay();
                    };
                    
                    // Add tooltip for row selection
                    cell.onmouseover = function() {
                        const scaleName = scaleNames[i-1];
                        const rowScaleIds = [];
                        
                        // Generate all scale IDs for this row (dynamically based on number of modes)
                        const numModes = scales[scaleName].length;
                        for (let col = 1; col <= numModes; col++) {
                            rowScaleIds.push(`${scaleName}-${col}`);
                        }
                        
                        const allSelected = rowScaleIds.every(id => selectedScales.includes(id));
                        
                        let tooltip = document.createElement('div');
                        tooltip.className = 'scale-tooltip';
                        tooltip.style.position = 'absolute';
                        tooltip.style.background = '#000';
                        tooltip.style.color = 'white';
                        tooltip.style.border = '1px solid #ccc';
                        tooltip.style.padding = '4px 8px';
                        tooltip.style.zIndex = 1000;
                        tooltip.style.fontSize = '11px';
                        tooltip.innerHTML = `
                            <strong>Scale Family:</strong> ${scaleName}<br>
                            <em>Click to ${allSelected ? 'deselect' : 'select'} entire row</em>
                        `;
                        document.body.appendChild(tooltip);

                        cell.onmousemove = function(e) {
                            positionTooltipSmart(tooltip, e);
                        };
                        cell.onmouseleave = function() {
                            document.body.removeChild(tooltip);
                            cell.onmousemove = null;
                            cell.onmouseleave = null;
                        };
                    };
                }
            }
            else if (i === 0 && j > 0) {
                cell.style.fontWeight = 'bold';
                cell.style.backgroundColor = '#474747ff';
                cell.textContent = j === 0 ? 'Degree' : `${intToRoman(j)}`;
            }
            else{
                let currentScale = scales[scaleNames[i-1]];
                
                // Check if this column index exists for this scale family
                if (j-1 < currentScale.length) {
                    let scaleName = currentScale[j-1]['name'];
                    let scaleId = `${scaleNames[i-1]}-${j}`;

                    cell.textContent = scaleName;
                    cell.style.cursor = 'pointer';
                    cell.style.userSelect = 'none';
                    
                    // Check if this scale is already selected
                    if (selectedScales.includes(scaleId)) {
                        cell.style.backgroundColor = '#4CAF50';
                        cell.style.color = 'white';
                    } else {
                        cell.style.backgroundColor = '';
                        cell.style.color = '';
                    }
                    
                    // Add click event to toggle selection
                    cell.onclick = function() {
                        // Remove any existing tooltips
                        const existingTooltips = document.querySelectorAll('.scale-tooltip');
                        existingTooltips.forEach(tooltip => {
                            if (tooltip.parentNode) {
                                tooltip.parentNode.removeChild(tooltip);
                            }
                        });
                        
                        const index = selectedScales.indexOf(scaleId);
                        
                        if (exclusiveMode) {
                            if (index > -1) {
                                // In exclusive mode, prevent deselection of current element - do nothing
                                // Already selected element stays selected
                            } else {
                                // Scale is not selected, clear all and select only this one
                                selectedScales = [scaleId];
                                primaryScaleIndex = 0;
                                // In exclusive mode, always refresh the entire table
                                createHeptatonicScaleTable();
                                updateCurrentScaleDisplay();
                            }
                        } else {
                            // Multiple selection mode (original behavior)
                            if (index > -1) {
                                // Prevent deselection of last element in multiple mode
                                if (selectedScales.length > 1) {
                                    // Scale is selected, remove it (only if not the last one)
                                    selectedScales.splice(index, 1);
                                    cell.style.backgroundColor = '';
                                    cell.style.color = '';
                                }
                                // If it's the last element, do nothing (keep it selected)
                            } else {
                                // Scale is not selected, add it
                                selectedScales.push(scaleId);
                                cell.style.backgroundColor = '#4CAF50';
                                cell.style.color = 'white';
                            }
                            
                            // Update cross-reference display when scales change in multiple mode
                            if (typeof window.updateCrossReferenceDisplay === 'function') {
                                window.updateCrossReferenceDisplay();
                            }
                            updateCurrentScaleDisplay();
                        }
                        
                        // console.log('Selected scales:', selectedScales);
                    };
                    
                    cell.onmouseover = function() {
                        const interval = currentScale[j-1]?.intervals || '';
                        const altNames = currentScale[j-1]?.alternativeNames || [];
                        let tooltip = document.createElement('div');
                        tooltip.className = 'scale-tooltip';
                        tooltip.style.position = 'absolute';
                        tooltip.style.background = '#000';
                        tooltip.style.color = 'white';
                        tooltip.style.border = '1px solid #ccc';
                        tooltip.style.padding = '8px 12px';
                        tooltip.style.zIndex = 1000;
                        tooltip.style.fontSize = '11px';
                        tooltip.style.borderRadius = '4px';
                        tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                        
                        // Create a container for text content
                        const tooltipContent = document.createElement('div');
                        
                        // Format alternative names as bulleted list
                        let altNamesHtml = '';
                        if (altNames && altNames.length > 0) {
                            const altNamesList = altNames.map(name => `• ${name}`).join('<br>');
                            altNamesHtml = `<br><strong>Alternative Names:</strong><br>${altNamesList}`;
                        }
                        
                        tooltipContent.innerHTML = `
                            <strong>Scale:</strong> ${scaleName}<br>
                            <strong>Interval:</strong> ${interval}<br>
                            <em>Click to ${selectedScales.includes(scaleId) ? 'deselect' : 'select'}</em>${altNamesHtml}
                        `;
                        tooltip.appendChild(tooltipContent);
                        
                        let scaleNotes = getScaleNotes(getPrimaryRootNote(), currentScale[j-1].intervals);
                        // console.log("Scale Notes for", scaleName, ":", scaleNotes);
                        highlightKeysForScales(scaleNotes);
                        
                        // Add mini piano visualization
                        try {
                            const pianoContainer = document.createElement('div');
                            pianoContainer.style.marginTop = '8px';
                            pianoContainer.style.padding = '4px';
                            pianoContainer.style.backgroundColor = 'rgba(255,255,255,0.1)';
                            pianoContainer.style.borderRadius = '3px';
                            
                            const pianoSvg = createScalePiano(scaleNotes, getPrimaryRootNote());
                            if (pianoSvg) {
                                pianoContainer.appendChild(pianoSvg);
                                tooltip.appendChild(pianoContainer);
                            }
                        } catch (e) {
                            console.warn('Error creating mini piano for scale tooltip:', e);
                        }
                        
                        if (scales[scaleNames[i-1]][j-1].intervals.length === 7) {
                            let identifiedChords_3 = identifySyntheticChords(scales[scaleNames[i-1]][j-1], 3);
                            let identifiedChords_4 = identifySyntheticChords(scales[scaleNames[i-1]][j-1], 4);

                            // console.log('Identified Chords:', identifiedChords);
                            tooltipContent.innerHTML += `<br><em>Identified Chords:</em><br>`;
                            for (let k = 0; k < identifiedChords_3.length; k++) {
                                tooltipContent.innerHTML += `${intToRoman(k+1)}: Triad - ${identifiedChords_3[k].matches}, Seventh - ${identifiedChords_4[k].matches}<br>`;
                            }


                            // identifiedChords.forEach(chord => {
                            //     tooltip.innerHTML += `${chord.chord} - ${selectedRootNote[0]}${chord.matches}<br>`;
                            // });
                        }
                        
                        document.body.appendChild(tooltip);

                        cell.onmousemove = function(e) {
                            positionTooltipSmart(tooltip, e);
                        };
                        cell.onmouseleave = function() {
                            document.body.removeChild(tooltip);
                            cell.onmousemove = null;
                            cell.onmouseleave = null;
                            let firstScaleId = selectedScales[0];
                            let [family, mode] = firstScaleId.split('-');
                            let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                            let scaleNotes = getScaleNotes(getPrimaryRootNote(), intervals);
                            // console.log("Scale Notes for", scaleName, ":", scaleNotes);
                            highlightKeysForScales(scaleNotes);
                        };
                    };
                } else {
                    // Empty cell for scale families with fewer modes
                    cell.textContent = '';
                    cell.style.backgroundColor = '#f9f9f9';
                    cell.style.cursor = 'default';
                }
                
            }
            row.appendChild(cell);
        }
        table.appendChild(row);
    }
    currentPlaceholder.appendChild(table);

    // Update cross-reference display when scales change
    if (typeof window.updateCrossReferenceDisplay === 'function') {
        window.updateCrossReferenceDisplay();
    }

    // Update the current scale display
    updateCurrentScaleDisplay();

    return;

}

/**
 * Get precomputed chords for the current primary scale and root note
 * @returns {object|null} Precomputed chord data or null if not available
 */
function getPrimaryScaleChords() {
    const primaryScale = getPrimaryScale();
    const primaryRootNote = getPrimaryRootNote();
    
    if (!primaryScale || !primaryRootNote) {
        return null;
    }
    
    return getChordsForScale(primaryScale, primaryRootNote);
}

/**
 * Get precomputed chords for all selected scales with current root note
 * @returns {Array<object>} Array of chord data for all selected scales
 */
function getAllSelectedScaleChords() {
    const primaryRootNote = getPrimaryRootNote();
    if (!primaryRootNote) {
        return [];
    }
    
    return selectedScales.map(scaleId => {
        return getChordsForScale(scaleId, primaryRootNote);
    }).filter(chordData => chordData !== null);
}

/**
 * Refresh chord cache for all selected scales when root note changes
 */
function refreshChordsForRootNote() {
    const primaryRootNote = getPrimaryRootNote();
    if (!primaryRootNote) {
        return;
    }
    
    selectedScales.forEach(scaleId => {
        precomputeScaleChords(scaleId, primaryRootNote);
    });
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

// Initialize navigation buttons when the module loads
initializeNavigationButtons();




export {
    createHeptatonicScaleTable, 
    selectedRootNote, 
    selectedScales,
    getPrimaryScale,
    navigateToNextScale,
    navigateToPreviousScale,
    getPrimaryRootNote,
    navigateToNextRootNote,
    navigateToPreviousRootNote,
    updateCurrentScaleDisplay,
    getPrimaryScaleChords,
    getAllSelectedScaleChords,
    refreshChordsForRootNote,
    initializeNavigationButtons
}