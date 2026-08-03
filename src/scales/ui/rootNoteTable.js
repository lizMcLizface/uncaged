// The detailed "Root Note Selection" table: a 12-cell chromatic root-note
// picker plus the "All" cell, in both exclusive (radio-button-style, one
// root at a time) and multiple (checkbox-style) selection modes. Mutually
// dependent with scaleTable.js - selecting a root note here rebuilds the
// heptatonic scale table there, and building the heptatonic table embeds a
// fresh copy of this table inside itself (its own row/mode browsing needs
// root-note selection too) - so the two cross-import each other rather than
// splitting further.
//
// Split out of scaleGenerator.js as part of REFACTOR_PLAN.md Phase 4 (the
// scaleGenerator.js/scales.js -> src/scales/ half).

import { HeptatonicScales, getScaleNotes } from '../scaleData';
import { createScalePiano } from '../../components/MiniPiano/MiniPiano';
import {
    scaleState,
    getChromaticPosition,
    getPreferredDisplay,
    setEnharmonicPreference,
    sortRootNotesAndUpdateIndex,
    getPrimaryRootNote,
    refreshChordsForRootNote
} from '../state';
import { highlightKeysForScales, updateCurrentScaleDisplay } from '..';
import { createHeptatonicScaleTable } from './scaleTable';

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

export { createRootNoteTable, positionTooltipSmart };
