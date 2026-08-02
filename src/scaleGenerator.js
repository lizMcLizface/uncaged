import $ from 'jquery';
import {HeptatonicScales, scales, highlightKeysForScales, getScaleNotes, translateNotes, stripOctave} from './scales';
import {identifySyntheticChords, matchChord} from './theory/chords';
import {chords} from './chords';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput} from './midi';
import { createScalePiano, createIntervalPiano, getIntervalInfo, getSynthBaseOctave, DEFAULT_BASE_OCTAVE } from './components/MiniPiano/MiniPiano';
import {
    scaleState,
    persistScaleSelection,
    getChromaticPosition,
    getPreferredDisplay,
    setEnharmonicPreference,
    sortRootNotesAndUpdateIndex,
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
    toggleSelectionMode,
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
    if (Array.isArray(scaleState.selectedRootNote)) {
        // Count unique chromatic positions, considering enharmonic equivalents
        const selectedChromaticPositions = new Set();
        scaleState.selectedRootNote.forEach(note => {
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
        
        if (scaleState.exclusiveMode) {
            // In exclusive mode, "All" doesn't make sense, so do nothing
            // Could alternatively select 'C' or show a message
            return;
        } else {
            // In multiple mode, toggle between all selected and just 'C'
            if (Array.isArray(scaleState.selectedRootNote)) {
                // Count unique chromatic positions to check if all are selected
                const selectedChromaticPositions = new Set();
                scaleState.selectedRootNote.forEach(note => {
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
                    scaleState.selectedRootNote = 'C';
                    scaleState.primaryRootNoteIndex = 0;
                } else {
                    // Not all selected, select all (using sharp versions by default)
                    scaleState.selectedRootNote = [...chromaticNotes];
                    scaleState.primaryRootNoteIndex = 0;
                }
            } else {
                // Not all selected, select all
                scaleState.selectedRootNote = [...chromaticNotes];
                scaleState.primaryRootNoteIndex = 0;
            }
            refreshChordsForRootNote(); // Refresh chords for updated root notes
        }
        
        // console.log('Selected root note(s):', scaleState.selectedRootNote);
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
        if (scaleState.exclusiveMode) {
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
        if (scaleState.exclusiveMode) {
            // Check if the note or its enharmonic equivalent is selected
            const position = getChromaticPosition(note);
            if (Array.isArray(scaleState.selectedRootNote)) {
                return scaleState.selectedRootNote.some(selectedNote => getChromaticPosition(selectedNote) === position);
            } else {
                return getChromaticPosition(scaleState.selectedRootNote) === position;
            }
        } else {
            if (Array.isArray(scaleState.selectedRootNote)) {
                // Check if the note or its enharmonic equivalent is selected
                const position = getChromaticPosition(note);
                return scaleState.selectedRootNote.some(selectedNote => getChromaticPosition(selectedNote) === position);
            } else {
                return getChromaticPosition(scaleState.selectedRootNote) === getChromaticPosition(note);
            }
        }
    }
    
    // Helper function to create a click handler for a note
    function createNoteClickHandler(note, alternativeNote = null) {
        return function() {
            console.log('Root note clicked:', note, 'Current selectedRootNote:', scaleState.selectedRootNote);
            
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
                console.log(`Selected root notes before: ${Array.isArray(scaleState.selectedRootNote) ? scaleState.selectedRootNote.join(', ') : scaleState.selectedRootNote}`);
                console.log(`Primary index before: ${scaleState.primaryRootNoteIndex}`);
                
                // Update the enharmonic display preference to the newly clicked note
                setEnharmonicPreference(note);
                
                console.log(`Selected root notes after: ${Array.isArray(scaleState.selectedRootNote) ? scaleState.selectedRootNote.join(', ') : scaleState.selectedRootNote}`);
                console.log(`Primary index after: ${scaleState.primaryRootNoteIndex}`);
                console.log(`getPrimaryRootNote() now returns: ${getPrimaryRootNote()}`);
                
                // Refresh the display to show the new enharmonic preference
                refreshChordsForRootNote();
                createHeptatonicScaleTable();
                updateCurrentScaleDisplay();
                return;
            }
            
            if (scaleState.exclusiveMode) {
                // In exclusive mode, always select the clicked note
                scaleState.selectedRootNote = note;
                scaleState.primaryRootNoteIndex = 0;
                console.log('Set root note to:', scaleState.selectedRootNote);
                refreshChordsForRootNote(); // Refresh chords for new root note
            } else {
                // In multiple mode, toggle selection
                if (Array.isArray(scaleState.selectedRootNote)) {
                    // Already in array mode
                    const index = scaleState.selectedRootNote.indexOf(note);
                    if (index > -1) {
                        // Note is selected, remove it
                        scaleState.selectedRootNote.splice(index, 1);
                        // Adjust primary root note index if needed
                        if (scaleState.primaryRootNoteIndex >= scaleState.selectedRootNote.length) {
                            scaleState.primaryRootNoteIndex = Math.max(0, scaleState.selectedRootNote.length - 1);
                        } else if (scaleState.primaryRootNoteIndex > index) {
                            scaleState.primaryRootNoteIndex--;
                        }
                        // If array becomes empty, default to 'C'
                        if (scaleState.selectedRootNote.length === 0) {
                            scaleState.selectedRootNote = 'C';
                            scaleState.primaryRootNoteIndex = 0;
                        }
                        refreshChordsForRootNote(); // Refresh chords for updated root notes
                    } else {
                        // Note is not selected, add it
                        scaleState.selectedRootNote.push(note);
                        // Sort the array chronomatically and update primary index
                        const currentPrimary = getPrimaryRootNote();
                        scaleState.selectedRootNote = sortRootNotesAndUpdateIndex(scaleState.selectedRootNote, currentPrimary);
                        refreshChordsForRootNote(); // Refresh chords for new root note
                    }
                } else {
                    // Convert to array mode
                    if (scaleState.selectedRootNote === note) {
                        // Clicking the same note - convert to array with just 'C'
                        scaleState.selectedRootNote = 'C';
                        scaleState.primaryRootNoteIndex = 0;
                        refreshChordsForRootNote(); // Refresh chords for reset root note
                    } else {
                        // Clicking a different note - convert to array with both
                        scaleState.selectedRootNote = [scaleState.selectedRootNote, note];
                        // Sort the array chronomatically and update primary index
                        const currentPrimary = getPrimaryRootNote();
                        scaleState.selectedRootNote = sortRootNotesAndUpdateIndex(scaleState.selectedRootNote, currentPrimary);
                        refreshChordsForRootNote(); // Refresh chords for new root notes
                    }
                }
            }
            
            console.log('Final selectedRootNote:', scaleState.selectedRootNote, 'Primary index:', scaleState.primaryRootNoteIndex);
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
            const isThisChromaticPositionSelected = (scaleState.exclusiveMode ? 
                getChromaticPosition(scaleState.selectedRootNote) === chromaticPos :
                (Array.isArray(scaleState.selectedRootNote) ? 
                    scaleState.selectedRootNote.some(sel => getChromaticPosition(sel) === chromaticPos) :
                    getChromaticPosition(scaleState.selectedRootNote) === chromaticPos));
            
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
                if (scaleState.exclusiveMode) {
                    tooltipText += `<em>Click to ${sharpSelected ? 'keep selected' : (isThisChromaticPositionSelected ? 'switch to sharp' : 'select')}</em>`;
                } else {
                    tooltipText += `<em>Click to ${sharpSelected ? 'deselect' : (isThisChromaticPositionSelected ? 'switch to sharp' : 'select')}</em>`;
                }
                
                // Create a container for text and mini piano
                const tooltipContent = document.createElement('div');
                tooltipContent.innerHTML = tooltipText;
                tooltip.appendChild(tooltipContent);

                // Add mini piano visualization if scale is available
                if (scaleState.selectedScales.length > 0) {
                    let firstScaleId = scaleState.selectedScales[0];
                    let [family, mode] = firstScaleId.split('-');
                    let scales = HeptatonicScales;
                    
                    try {
                        let intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        let scaleNotes = getScaleNotes(note, intervals);
                        
                        // Highlight keyboard for preview
                        highlightKeysForScales(scaleNotes);
                        console.log(`Scale notes for ${note}:`, scaleNotes);

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
                if (scaleState.selectedScales.length > 0) {
                    let scales = HeptatonicScales;
                    let firstScaleId = scaleState.selectedScales[0];
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
                if (scaleState.exclusiveMode) {
                    tooltipText += `<em>Click to ${flatSelected ? 'keep selected' : (isThisChromaticPositionSelected ? 'switch to flat' : 'select')}</em>`;
                } else {
                    tooltipText += `<em>Click to ${flatSelected ? 'deselect' : (isThisChromaticPositionSelected ? 'switch to flat' : 'select')}</em>`;
                }
                
                // Create a container for text and mini piano
                const tooltipContent = document.createElement('div');
                tooltipContent.innerHTML = tooltipText;
                tooltip.appendChild(tooltipContent);

                // Add mini piano visualization if scale is available
                if (scaleState.selectedScales.length > 0) {
                    let firstScaleId = scaleState.selectedScales[0];
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
                if (scaleState.selectedScales.length > 0) {
                    let scales = HeptatonicScales;
                    let firstScaleId = scaleState.selectedScales[0];
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
                if (scaleState.exclusiveMode) {
                    tooltipText += `<em>Click to ${isSelected ? 'keep selected' : 'select'}</em>`;
                } else {
                    tooltipText += `<em>Click to ${isSelected ? 'deselect' : 'select'}</em>`;
                }
                
                // Create a container for text and mini piano
                const tooltipContent = document.createElement('div');
                tooltipContent.innerHTML = tooltipText;
                tooltip.appendChild(tooltipContent);

                // Add mini piano visualization if scale is available
                if (scaleState.selectedScales.length > 0) {
                    let firstScaleId = scaleState.selectedScales[0];
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
                
                if (scaleState.selectedScales.length > 0) {
                    let scales = HeptatonicScales;
                    let firstScaleId = scaleState.selectedScales[0];
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

/**
 * Render a permanent info panel for the currently selected scale (name,
 * interval pattern, alternative names, a mini piano, and identified
 * triads/sevenths per degree) into #scaleInfoPanel. This is the same
 * information the scale-family table's hover tooltip shows, just made
 * persistent for the "Scale Information" tab instead of hover-only.
 * Called from updateCurrentScaleDisplay so it refreshes on every scale change.
 */
/**
 * Shift a "Note/octave" string's octave number by `bump` (used when a
 * stacked-third chord tone wraps past the top of scaleNotes back to a
 * lower scale degree - that tone is actually a step higher in pitch than
 * its raw scaleNotes entry, not back down at the scale's base octave).
 * @param {string} noteWithOctave - e.g. "C/5"
 * @param {number} bump - octaves to add
 * @returns {string}
 */
function bumpOctave(noteWithOctave, bump) {
    if (!bump) return noteWithOctave;
    const match = /^(.*)\/(-?\d+)$/.exec(noteWithOctave);
    if (!match) return noteWithOctave;
    return `${match[1]}/${parseInt(match[2], 10) + bump}`;
}

/**
 * Build the stacked-thirds chord for every degree of a scale, at a given
 * chord length (3 = triad, 4 = seventh). Mirrors generateSyntheticChords'
 * indexing (every other scale step, wrapping) but, unlike
 * identifySyntheticChords, never throws when a chord doesn't match any
 * known chord type - some scales (e.g. Blues Minor) don't yield "proper"
 * named chords at every degree. Callers treat an empty `matches` array as
 * a synthetic (unnamed) chord and fall back to showing just the root note.
 *
 * Returns both a bare-letter `chord` (for chord-matching/name/interval text,
 * which can't take octave-tagged input) and a `chordWithOctave` carrying
 * each tone's real pitch (bumped up an octave whenever the stacked-third
 * index wraps past the top of scaleNotes) so playback and any octave-aware
 * display can use the note's actual register in the scale rather than
 * re-deriving it from scratch.
 * @param {Array<string>} scaleNotes - getScaleNotes() output (with octave; includes the trailing octave-duplicate root)
 * @param {number} length - 3 for triads, 4 for sevenths
 * @returns {Array<{ chord: string[], chordWithOctave: string[], scaleDegrees: number[], matches: string[] }>}
 */
function buildDegreeChords(scaleNotes, length) {
    const degreeCount = scaleNotes.length - 1;
    const result = [];
    for (let i = 0; i < degreeCount; i++) {
        const scaleDegrees = [];
        const chord = [];
        const chordWithOctave = [];
        for (let j = 0; j < length; j++) {
            const rawIndex = i + j * 2;
            const index = rawIndex % degreeCount;
            const octaveBump = Math.floor(rawIndex / degreeCount);
            scaleDegrees.push(index + 1);
            chord.push(scaleNotes[index].slice(0, -2));
            chordWithOctave.push(bumpOctave(scaleNotes[index], octaveBump));
        }
        const matches = matchChord(chord, chords, false) || [];
        result.push({ chord, chordWithOctave, scaleDegrees, matches });
    }
    return result;
}

/**
 * Build one Triad or Seventh block (name/notes/intervals/scale-degrees +
 * its own mini piano) for a chord card. The mini piano is colored relative
 * to scaleRootNote (not the chord's own root) so a given scale tone is the
 * same color on every card and on the scale piano above them.
 * @param {string} label - 'Triad' or 'Seventh'
 * @param {{ chord: string[], scaleDegrees: number[], matches: string[] }} chordInfo
 * @param {string} scaleRootNote
 * @returns {HTMLElement}
 */
function buildChordSection(label, chordInfo, scaleRootNote) {
    const chordRoot = chordInfo.chord[0];
    const chordName = `${chordRoot}${chordInfo.matches[0] || ''}`;
    const intervalLabels = chordInfo.chord.map(note => getIntervalInfo(chordRoot, note).label);

    const section = document.createElement('div');
    section.style.cssText = `margin: 6px 0;`;

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: max-content 1fr;
        column-gap: 6px;
        row-gap: 2px;
        font-size: 11px;
        margin-bottom: 6px;
    `;
    [
        [`${label}:`, chordName],
        ['Notes:', `[${chordInfo.chord.join(', ')}]`],
        ['Intervals:', `[${intervalLabels.join(', ')}]`],
        ['Scale notes:', `[${chordInfo.scaleDegrees.join(', ')}]`]
    ].forEach(([labelText, valueText]) => {
        const labelCell = document.createElement('div');
        labelCell.textContent = labelText;
        labelCell.style.cssText = `text-align: right; opacity: 0.85; white-space: nowrap;`;
        const valueCell = document.createElement('div');
        valueCell.textContent = valueText;
        valueCell.style.cssText = `text-align: left;`;
        grid.appendChild(labelCell);
        grid.appendChild(valueCell);
    });
    section.appendChild(grid);

    try {
        const pianoSvg = createIntervalPiano({ notes: chordInfo.chordWithOctave, rootNote: scaleRootNote });
        if (pianoSvg) section.appendChild(pianoSvg);
    } catch (e) {
        console.warn(`Error creating ${label} chord piano:`, e);
    }

    return section;
}

function makeChordCardDivider() {
    const hr = document.createElement('hr');
    hr.style.cssText = `border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 6px 0;`;
    return hr;
}

function updateScaleInfoPanel() {
    const container = document.getElementById('scaleInfoPanel');
    if (!container) return;

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const primaryScale = getPrimaryScale();
    const rootNote = getPrimaryRootNote();
    if (!primaryScale || !rootNote) return;

    const [family, modeStr] = primaryScale.split('-');
    const modeNum = parseInt(modeStr, 10);
    const scaleData = HeptatonicScales[family] && HeptatonicScales[family][modeNum - 1];
    if (!scaleData) return;

    const panel = document.createElement('div');
    panel.style.cssText = `
        background: hsla(0, 0%, 24%, 1.00);
        border-radius: 8px;
        padding: 16px;
        color: #fff;
        margin-bottom: 16px;
    `;

    // Info column (heading, interval/notes text, scale piano, color legend)
    // and the chord cards sit side by side in contentRow below, instead of
    // the chord cards stacking underneath the info - keeps the panel from
    // growing so tall.
    const infoColumn = document.createElement('div');
    // flex-grow: 0 so this column hugs its own content width instead of
    // stretching to fill leftover row space (which pushed the chord cards
    // far to the right, reading as a big gap).
    infoColumn.style.cssText = `flex: 0 1 260px;`;

    const heading = document.createElement('h3');
    heading.textContent = `${rootNote} ${scaleData.name}`;
    heading.style.cssText = `margin: 0 0 8px 0; font-size: 20px;`;
    infoColumn.appendChild(heading);

    // getScaleNotes always anchors a scale's root to DEFAULT_BASE_OCTAVE
    // (see MiniPiano.js); shift every note by however far the synth's
    // selected octave (Z/X) has moved from that anchor, so the panel's
    // pianos - both the scale piano and every triad/seventh chord card -
    // track the synth's register instead of always sitting at the anchor.
    const octaveShift = getSynthBaseOctave() - DEFAULT_BASE_OCTAVE;
    const scaleNotes = getScaleNotes(rootNote, scaleData.intervals).map(note => bumpOctave(note, octaveShift));

    const intervalLine = document.createElement('div');
    intervalLine.innerHTML = `<strong>Interval:</strong> ${scaleData.intervals.join(' ')}`;
    intervalLine.style.cssText = `margin-bottom: 6px; font-size: 13px;`;
    infoColumn.appendChild(intervalLine);

    const scaleNotesLine = document.createElement('div');
    // Drop the trailing octave-duplicate root that getScaleNotes appends.
    const displayScaleNotes = scaleNotes.slice(0, -1).map(note => note.slice(0, -2));
    scaleNotesLine.innerHTML = `<strong>Scale Notes:</strong> ${displayScaleNotes.join(', ')}`;
    scaleNotesLine.style.cssText = `margin-bottom: 6px; font-size: 13px;`;
    infoColumn.appendChild(scaleNotesLine);

    if (scaleData.alternativeNames && scaleData.alternativeNames.length > 0) {
        const altDiv = document.createElement('div');
        altDiv.style.cssText = `margin-bottom: 10px; font-size: 13px;`;
        altDiv.innerHTML = `<strong>Alternative Names:</strong><br>${scaleData.alternativeNames.map(name => `• ${name}`).join('<br>')}`;
        infoColumn.appendChild(altDiv);
    }

    try {
        const pianoContainer = document.createElement('div');
        pianoContainer.style.cssText = `
            margin: 10px 0;
            padding: 8px;
            background: rgba(255,255,255,0.08);
            border-radius: 4px;
            display: inline-block;
        `;
        const pianoSvg = createScalePiano(scaleNotes, rootNote);
        if (pianoSvg) {
            pianoContainer.appendChild(pianoSvg);
            infoColumn.appendChild(pianoContainer);
        }
    } catch (e) {
        console.warn('Error creating scale info piano:', e);
    }

    // Legend mapping each scale tone to the interval color used on the
    // pianos above (and throughout the Scale Position Grid), so it's clear
    // what "the color of this key" means.
    try {
        const legendDiv = document.createElement('div');
        legendDiv.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
            margin: 8px 0 12px 0;
            font-size: 11px;
        `;

        const seenSemitones = new Set();
        scaleNotes.forEach(note => {
            const { semitone, label, color } = getIntervalInfo(rootNote, note);
            if (seenSemitones.has(semitone)) return;
            seenSemitones.add(semitone);

            const entry = document.createElement('span');
            entry.style.cssText = `display: inline-flex; align-items: center; gap: 4px;`;

            const swatch = document.createElement('span');
            swatch.style.cssText = `
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 3px;
                background: ${color};
                border: 1px solid rgba(255,255,255,0.4);
            `;
            entry.appendChild(swatch);

            const text = document.createElement('span');
            text.textContent = label;
            entry.appendChild(text);

            legendDiv.appendChild(entry);
        });

        infoColumn.appendChild(legendDiv);
    } catch (e) {
        console.warn('Error creating scale info color legend:', e);
    }

    const contentRow = document.createElement('div');
    contentRow.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 16px;
    `;
    contentRow.appendChild(infoColumn);
    panel.appendChild(contentRow);

    if (scaleData.intervals.length >= 3) {
        // Per-degree triad/seventh chord cards (name, notes, intervals, scale
        // degrees, and a mini piano for each), fully replacing the old plain-
        // text chord list. Chords are built via the same stacked-thirds
        // approach regardless of scale shape; when a degree's stack doesn't
        // match any known chord type (e.g. in Blues Minor), it's still shown
        // with its root note only and flagged as synthetic rather than
        // dropped, since it's still a usable chord tone grouping.
        const triadChords = buildDegreeChords(scaleNotes, 3);
        const seventhChords = buildDegreeChords(scaleNotes, 4);

        const chordCardsDiv = document.createElement('div');
        chordCardsDiv.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            align-content: flex-start;
            gap: 10px;
            flex: 2 1 120px;
        `;

        seventhChords.forEach((seventhInfo, degree) => {
            const triadInfo = triadChords[degree];
            const isSynthetic = triadInfo.matches.length === 0 || seventhInfo.matches.length === 0;
            const chordRootLetter = seventhInfo.chord[0];

            const chordCard = document.createElement('div');
            chordCard.style.cssText = `
                background: ${isSynthetic ? 'rgba(255,193,7,0.14)' : 'rgba(255,255,255,0.08)'};
                border: 1px solid ${isSynthetic ? 'rgba(255,193,7,0.4)' : 'rgba(255,255,255,0.12)'};
                border-radius: 6px;
                padding: 8px 10px;
                text-align: center;
                width: 200px;
            `;

            const heading = document.createElement('div');
            heading.textContent = `${intToRoman(degree + 1)}${isSynthetic ? ' (synthetic)' : ''} - ${chordRootLetter}`;
            heading.style.cssText = `font-size: 16px; font-weight: bold; margin-bottom: 4px;`;
            chordCard.appendChild(heading);

            chordCard.appendChild(makeChordCardDivider());
            chordCard.appendChild(buildChordSection('Triad', triadInfo, rootNote));
            chordCard.appendChild(makeChordCardDivider());
            chordCard.appendChild(buildChordSection('Seventh', seventhInfo, rootNote));

            chordCardsDiv.appendChild(chordCard);
        });
        contentRow.appendChild(chordCardsDiv);
    }

    container.appendChild(panel);
}

/**
 * Build the compact top-bar quick-picker: three selects (root, scale family,
 * mode) plus a combined "C Aeolian"-style name display. This is separate from
 * (and stays in sync with) the detailed root-note/scale-family tables built
 * by createHeptatonicScaleTable, which remain available for browsing.
 * Reuses the #currentRootNode/#currentScaleNode ids so updateCurrentScaleDisplay
 * keeps the name display current without any changes to that function's core logic.
 */
function createQuickScalePicker() {
    const container = document.getElementById('quickScaleControls');
    if (!container) {
        setTimeout(createQuickScalePicker, 200);
        return;
    }

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const chromaticNotes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const scaleFamilies = Object.keys(HeptatonicScales);

    const primaryScale = getPrimaryScale() || `${scaleFamilies[0]}-1`;
    const [initialFamily, initialModeStr] = primaryScale.split('-');
    const initialMode = parseInt(initialModeStr, 10) || 1;
    const initialRoot = getPrimaryRootNote() || chromaticNotes[0];

    const selectStyle = `
        padding: 5px 8px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 13px;
        background: #222;
        color: #e3e3e3;
        cursor: pointer;
    `;

    // Combined "C Aeolian" name display, to the left of the selects
    const nameDisplay = document.createElement('div');
    nameDisplay.style.cssText = `
        display: flex;
        align-items: center;
        gap: 5px;
        font-weight: bold;
        font-size: 16px;
        color: #fff;
        min-width: 130px;
    `;
    const rootSpan = document.createElement('span');
    rootSpan.id = 'currentRootNode';
    rootSpan.textContent = initialRoot;
    const scaleSpan = document.createElement('span');
    scaleSpan.id = 'currentScaleNode';
    scaleSpan.textContent = HeptatonicScales[initialFamily][initialMode - 1].name;
    nameDisplay.appendChild(rootSpan);
    nameDisplay.appendChild(scaleSpan);
    container.appendChild(nameDisplay);

    const rootSelect = document.createElement('select');
    rootSelect.id = 'quickRootSelect';
    rootSelect.style.cssText = selectStyle;
    chromaticNotes.forEach(note => {
        const option = document.createElement('option');
        option.value = note;
        option.textContent = note;
        if (note === initialRoot) option.selected = true;
        rootSelect.appendChild(option);
    });
    container.appendChild(rootSelect);

    const familySelect = document.createElement('select');
    familySelect.id = 'quickScaleFamilySelect';
    familySelect.style.cssText = selectStyle;
    scaleFamilies.forEach(family => {
        const option = document.createElement('option');
        option.value = family;
        option.textContent = family;
        if (family === initialFamily) option.selected = true;
        familySelect.appendChild(option);
    });
    container.appendChild(familySelect);

    const modeSelect = document.createElement('select');
    modeSelect.id = 'quickScaleModeSelect';
    modeSelect.style.cssText = selectStyle;
    for (let modeNum = 1; modeNum <= 7; modeNum++) {
        const option = document.createElement('option');
        option.value = String(modeNum);
        option.textContent = intToRoman(modeNum);
        if (modeNum === initialMode) option.selected = true;
        modeSelect.appendChild(option);
    }
    container.appendChild(modeSelect);

    function applySelection() {
        scaleState.selectedRootNote = [rootSelect.value];
        scaleState.primaryRootNoteIndex = 0;
        scaleState.selectedScales = [`${familySelect.value}-${modeSelect.value}`];
        scaleState.primaryScaleIndex = 0;
        updateCurrentScaleDisplay();
        // Keep the detailed browser tables' highlighting in sync
        createHeptatonicScaleTable();
    }

    rootSelect.addEventListener('change', applySelection);
    familySelect.addEventListener('change', applySelection);
    modeSelect.addEventListener('change', applySelection);
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
    toggleInput.checked = scaleState.exclusiveMode;
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
    slider.style.backgroundColor = scaleState.exclusiveMode ? '#4CAF50' : '#ccc';
    slider.style.transition = '0.4s';
    slider.style.borderRadius = '28px';
    
    let sliderButton = document.createElement('span');
    sliderButton.style.position = 'absolute';
    sliderButton.style.content = '';
    sliderButton.style.height = '22px';
    sliderButton.style.width = '22px';
    sliderButton.style.left = scaleState.exclusiveMode ? '25px' : '3px';
    sliderButton.style.bottom = '3px';
    sliderButton.style.backgroundColor = 'white';
    sliderButton.style.transition = '0.4s';
    sliderButton.style.borderRadius = '50%';
    
    slider.appendChild(sliderButton);
    toggleSwitch.appendChild(toggleInput);
    toggleSwitch.appendChild(slider);
    
    // Add label text
    let toggleLabel = document.createElement('span');
    toggleLabel.textContent = scaleState.exclusiveMode ? 'Exclusive Selection' : 'Multiple Selection';
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
        scaleState.selectedScales = ['Major-1']; // Reset to default first scale
        scaleState.primaryScaleIndex = 0;
        scaleState.selectedRootNote = 'C'; // Reset root note to C
        scaleState.primaryRootNoteIndex = 0;
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
                if (i > 0 && !scaleState.exclusiveMode) { // Skip the header row and disable in exclusive mode
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
                        const allSelected = rowScaleIds.every(id => scaleState.selectedScales.includes(id));
                        
                        if (allSelected) {
                            if (scaleState.exclusiveMode) {
                                // In exclusive mode, prevent deselection - do nothing
                                // Keep current selection
                            } else {
                                // In multiple mode, only deselect if we have other selections
                                const otherSelections = scaleState.selectedScales.filter(id => !rowScaleIds.includes(id));
                                if (otherSelections.length > 0) {
                                    // We have other selections, safe to deselect this row
                                    rowScaleIds.forEach(id => {
                                        const index = scaleState.selectedScales.indexOf(id);
                                        if (index > -1) {
                                            scaleState.selectedScales.splice(index, 1);
                                        }
                                    });
                                }
                                // If no other selections, do nothing (keep this row selected)
                            }
                        } else {
                            if (scaleState.exclusiveMode) {
                                // In exclusive mode, clear all selections first, then select this row
                                scaleState.selectedScales = [];
                                scaleState.selectedScales.push(...rowScaleIds);
                            } else {
                                // In multiple mode, add all unselected scales in this row
                                rowScaleIds.forEach(id => {
                                    if (!scaleState.selectedScales.includes(id)) {
                                        scaleState.selectedScales.push(id);
                                    }
                                });
                            }
                        }
                        
                        // console.log('Selected scales:', scaleState.selectedScales);
                        
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
                        
                        const allSelected = rowScaleIds.every(id => scaleState.selectedScales.includes(id));
                        
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
                    if (scaleState.selectedScales.includes(scaleId)) {
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
                        
                        const index = scaleState.selectedScales.indexOf(scaleId);
                        
                        if (scaleState.exclusiveMode) {
                            if (index > -1) {
                                // In exclusive mode, prevent deselection of current element - do nothing
                                // Already selected element stays selected
                            } else {
                                // Scale is not selected, clear all and select only this one
                                scaleState.selectedScales = [scaleId];
                                scaleState.primaryScaleIndex = 0;
                                // In exclusive mode, always refresh the entire table
                                createHeptatonicScaleTable();
                                updateCurrentScaleDisplay();
                            }
                        } else {
                            // Multiple selection mode (original behavior)
                            if (index > -1) {
                                // Prevent deselection of last element in multiple mode
                                if (scaleState.selectedScales.length > 1) {
                                    // Scale is selected, remove it (only if not the last one)
                                    scaleState.selectedScales.splice(index, 1);
                                    cell.style.backgroundColor = '';
                                    cell.style.color = '';
                                }
                                // If it's the last element, do nothing (keep it selected)
                            } else {
                                // Scale is not selected, add it
                                scaleState.selectedScales.push(scaleId);
                                cell.style.backgroundColor = '#4CAF50';
                                cell.style.color = 'white';
                            }
                            
                            // Update cross-reference display when scales change in multiple mode
                            if (typeof window.updateCrossReferenceDisplay === 'function') {
                                window.updateCrossReferenceDisplay();
                            }
                            updateCurrentScaleDisplay();
                        }
                        
                        // console.log('Selected scales:', scaleState.selectedScales);
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
                            <em>Click to ${scaleState.selectedScales.includes(scaleId) ? 'deselect' : 'select'}</em>${altNamesHtml}
                        `;
                        tooltip.appendChild(tooltipContent);
                        
                        let scaleNotes = getScaleNotes(getPrimaryRootNote(), currentScale[j-1]?.intervals);
                        // console.log("Scale Notes for", scaleName, ":", scaleNotes);
                        if (currentScale[j-1]?.intervals) {
                            highlightKeysForScales(scaleNotes);
                        }
                        
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
                        
                        if (scales[scaleNames[i-1]][j-1]?.intervals?.length === 7) {
                            let identifiedChords_3 = identifySyntheticChords(scales[scaleNames[i-1]][j-1], 3);
                            let identifiedChords_4 = identifySyntheticChords(scales[scaleNames[i-1]][j-1], 4);

                            // console.log('Identified Chords:', identifiedChords);
                            tooltipContent.innerHTML += `<br><em>Identified Chords:</em><br>`;
                            for (let k = 0; k < identifiedChords_3.length; k++) {
                                tooltipContent.innerHTML += `${intToRoman(k+1)}: Triad - ${identifiedChords_3[k].matches}, Seventh - ${identifiedChords_4[k].matches}<br>`;
                            }


                            // identifiedChords.forEach(chord => {
                            //     tooltip.innerHTML += `${chord.chord} - ${scaleState.selectedRootNote[0]}${chord.matches}<br>`;
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
                            let firstScaleId = scaleState.selectedScales[0];
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