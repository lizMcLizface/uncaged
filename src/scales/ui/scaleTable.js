// The compact top-bar quick-picker (createQuickScalePicker) and the
// detailed "Heptatonic Scales" browsing table (createHeptatonicScaleTable),
// plus the roman-numeral helper both use for scale-degree/chord-card
// headings. Mutually dependent with rootNoteTable.js - see that file's
// header for why they cross-import rather than splitting further.
//
// Split out of scaleGenerator.js as part of REFACTOR_PLAN.md Phase 4 (the
// scaleGenerator.js/scales.js -> src/scales/ half).

import { HeptatonicScales, getScaleNotes } from '../scaleData';
import { identifySyntheticChords } from '../../theory/chords';
import { createScalePiano } from '../../components/MiniPiano/MiniPiano';
import {
    scaleState,
    getPrimaryScale,
    getPrimaryRootNote,
    toggleSelectionMode
} from '../state';
import { highlightKeysForScales, updateCurrentScaleDisplay } from '..';
import { createRootNoteTable, positionTooltipSmart } from './rootNoteTable';

function intToRoman(num){
    const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
    return romanNumerals[num] || "";
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

export { intToRoman, createQuickScalePicker, createHeptatonicScaleTable };
