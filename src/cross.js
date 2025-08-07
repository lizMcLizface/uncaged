
import {processChord} from './intervals';
import {HeptatonicScales, scales, getScaleNotes, highlightKeysForScales} from './scales';
import {createHeptatonicScaleTable, selectedRootNote, selectedScales} from './scaleGenerator';
import {chords, processedChords, highlightKeysForChords, createChordRootNoteTable, createChordSuffixTable, selectedChordRootNote, selectedChordSuffixes} from './chords';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI} from './midi';

let crossReferencePlaceholder = document.getElementById('crossreferencePlaceholder');

/**
 * Creates a cross-reference table showing the relationship between a scale and chords
 * @param {string} scaleFamily - The scale family (e.g., 'Major', 'Harmonic Minor')
 * @param {number} scaleMode - The mode number (1-based index)
 * @param {string} rootNote - The root note of the scale (e.g., 'C', 'D#')
 * @param {Array<string>} chordSuffixes - Array of chord suffixes to analyze
 * @returns {HTMLDivElement} - A div containing the cross-reference table
 */
function createScaleChordCrossReference(scaleFamily, scaleMode, rootNote, chordSuffixes) {
    // Get scale information
    const scaleInfo = HeptatonicScales[scaleFamily][scaleMode - 1];
    const scaleNotes = getScaleNotes(rootNote, scaleInfo.intervals);
    
    // Remove octave information from scale notes to get just note names
    const scaleNoteNames = scaleNotes.map(note => {
        if (typeof note === 'string' && note.includes('/')) {
            return note.split('/')[0];
        }
        return note;
    });
    
    // Create the main container div
    const containerDiv = document.createElement('div');
    containerDiv.className = 'scale-chord-cross-reference';
    containerDiv.style.margin = '10px 0';
    containerDiv.style.border = '1px solid #ccc';
    containerDiv.style.borderRadius = '6px';
    containerDiv.style.padding = '8px';
    containerDiv.style.backgroundColor = '#f9f9f9';
    
    // // Create title
    // const title = document.createElement('h3');
    // title.textContent = `${rootNote} ${scaleInfo.name} vs Chords`;
    // title.style.marginTop = '0';
    // title.style.marginBottom = '15px';
    // title.style.textAlign = 'center';
    // title.style.color = '#333';
    // containerDiv.appendChild(title);
    
    // Create the table
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.backgroundColor = 'white';
    table.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
    table.style.fontSize = '13px'; // Smaller font size
    
    // Create header row
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = '#4a4a4a';
    headerRow.style.color = 'white';
    
    // First cell (empty corner)
    const cornerCell = document.createElement('th');
    cornerCell.textContent = `${rootNote} ${scaleInfo.name} / chords`;
    cornerCell.style.padding = '4px 6px';
    cornerCell.style.border = '1px solid #ddd';
    cornerCell.style.textAlign = 'center';
    cornerCell.style.fontWeight = 'bold';
    cornerCell.style.fontSize = '10px';
    cornerCell.style.lineHeight = '1.2';
    headerRow.appendChild(cornerCell);
    
    // Chord header cells
    chordSuffixes.forEach(suffix => {
        const chordCell = document.createElement('th');
        chordCell.textContent = suffix;
        chordCell.style.padding = '4px 3px';
        chordCell.style.border = '1px solid #ddd';
        chordCell.style.textAlign = 'center';
        chordCell.style.fontWeight = 'bold';
        chordCell.style.fontSize = '10px';
        chordCell.style.minWidth = '45px';
        chordCell.style.lineHeight = '1.2';
        headerRow.appendChild(chordCell);
    });
    
    table.appendChild(headerRow);
    
    // Create rows for each scale note
    scaleNoteNames.forEach((scaleNote, noteIndex) => {
        const row = document.createElement('tr');
        row.style.backgroundColor = noteIndex % 2 === 0 ? '#333333ff' : 'white';
        
        // Scale note cell (row header)
        const noteCell = document.createElement('td');
        noteCell.textContent = scaleNote;
        noteCell.style.padding = '4px 6px';
        noteCell.style.border = '1px solid #ddd';
        noteCell.style.fontWeight = 'bold';
        noteCell.style.backgroundColor = '#383838ff';
        noteCell.style.textAlign = 'center';
        noteCell.style.fontSize = '12px';
        noteCell.style.lineHeight = '1.2';
        row.appendChild(noteCell);
        
        // Chord analysis cells
        chordSuffixes.forEach(suffix => {
            const chordCell = document.createElement('td');
            chordCell.style.padding = '3px 2px';
            chordCell.style.border = '1px solid #ddd';
            chordCell.style.textAlign = 'center';
            chordCell.style.fontSize = '12px';
            chordCell.style.lineHeight = '1.2';
            
            try {
                // Process the chord built on this scale note
                const chordName = scaleNote + suffix;
                const chordInfo = processChord(chordName);
                
                if (chordInfo && chordInfo.notes && Array.isArray(chordInfo.notes)) {
                    // Remove octave information from chord notes
                    const chordNotes = chordInfo.notes.map(note => {
                        if (typeof note === 'string' && note.includes('/')) {
                            return note.split('/')[0];
                        }
                        return note;
                    });
                    
                    // Check how many chord notes are in the scale
                    const notesInScale = chordNotes.filter(note => scaleNoteNames.includes(note));
                    const matchPercentage = Math.round((notesInScale.length / chordNotes.length) * 100);
                    
                    // Set cell content and color based on match percentage
                    chordCell.textContent = `${matchPercentage}%`;
                    
                    if (matchPercentage === 100) {
                        chordCell.style.backgroundColor = '#4CAF50'; // Green for perfect match
                        chordCell.style.color = 'white';
                        chordCell.style.fontWeight = 'bold';
                    } else if (matchPercentage >= 75) {
                        chordCell.style.backgroundColor = '#8BC34A'; // Light green for good match
                        chordCell.style.color = 'white';
                    } else if (matchPercentage >= 50) {
                        chordCell.style.backgroundColor = '#FFC107'; // Yellow for partial match
                        chordCell.style.color = 'black';
                    } else if (matchPercentage > 0) {
                        chordCell.style.backgroundColor = '#FF9800'; // Orange for poor match
                        chordCell.style.color = 'white';
                    } else {
                        chordCell.style.backgroundColor = '#F44336'; // Red for no match
                        chordCell.style.color = 'white';
                    }
                    
                    // Add tooltip with chord notes
                    chordCell.title = `${chordName}: ${chordNotes.join(', ')}`;
                    
                } else {
                    chordCell.textContent = 'N/A';
                    chordCell.style.backgroundColor = '#9E9E9E';
                    chordCell.style.color = 'white';
                    chordCell.title = `Could not process chord: ${chordName}`;
                }
            } catch (error) {
                chordCell.textContent = 'Error';
                chordCell.style.backgroundColor = '#9E9E9E';
                chordCell.style.color = 'white';
                chordCell.title = `Error processing ${scaleNote}${suffix}: ${error.message}`;
            }
            
            row.appendChild(chordCell);
        });
        
        table.appendChild(row);
    });
    
    containerDiv.appendChild(table);
    
    // Add legend
    // const legend = document.createElement('div');
    // legend.style.marginTop = '10px';
    // legend.style.fontSize = '12px';
    // legend.style.color = '#666';
    // legend.innerHTML = `
    //     <strong>Legend:</strong>
    //     <span style="background:#4CAF50; color:white; padding:2px 5px; margin:0 3px; border-radius:3px;">100%</span> Perfect match
    //     <span style="background:#8BC34A; color:white; padding:2px 5px; margin:0 3px; border-radius:3px;">75%+</span> Good match
    //     <span style="background:#FFC107; color:black; padding:2px 5px; margin:0 3px; border-radius:3px;">50%+</span> Partial match
    //     <span style="background:#FF9800; color:white; padding:2px 5px; margin:0 3px; border-radius:3px;">&lt;50%</span> Poor match
    //     <span style="background:#F44336; color:white; padding:2px 5px; margin:0 3px; border-radius:3px;">0%</span> No match
    // `;
    // containerDiv.appendChild(legend);
    
    return containerDiv;
}

/**
 * Updates the cross-reference placeholder with tables for all selected scales
 */
function updateCrossReferenceDisplay() {
    if (!crossReferencePlaceholder) {
        console.warn('crossReferencePlaceholder element not found');
        return;
    }
    
    // Clear existing content
    crossReferencePlaceholder.innerHTML = '';
    
    // Get current selections
    const rootNotes = Array.isArray(selectedRootNote) ? selectedRootNote : [selectedRootNote];
    const scales = selectedScales;
    const chords = selectedChordSuffixes;
    
    if (scales.length === 0 || chords.length === 0) {
        const message = document.createElement('div');
        message.textContent = 'Select scales and chords to see cross-reference analysis';
        message.style.textAlign = 'center';
        message.style.color = '#666';
        message.style.fontStyle = 'italic';
        message.style.padding = '20px';
        crossReferencePlaceholder.appendChild(message);
        return;
    }
    
    let counter = 0;
    // Create tables for each combination of root note and scale
    rootNotes.forEach(rootNote => {
            if (counter == 3) {
                const message = document.createElement('div');
                message.textContent = 'Maximum of 3 cross-reference tables reached. Please deselect some scales or chords.';
                message.style.textAlign = 'center';
                message.style.color = '#f44336';
                message.style.fontStyle = 'italic';
                message.style.padding = '20px';
                crossReferencePlaceholder.appendChild(message);
                counter++;
                return;
            }
            if (counter >3){
                return;
            }
        scales.forEach(scaleId => {
            const [family, mode] = scaleId.split('-');
            const modeNumber = parseInt(mode, 10);
            
            try {
                const table = createScaleChordCrossReference(family, modeNumber, rootNote, chords);
                crossReferencePlaceholder.appendChild(table);
                counter++;
            } catch (error) {
                console.error(`Error creating cross-reference table for ${rootNote} ${family} mode ${modeNumber}:`, error);
            }
        });
    });
}

export {createScaleChordCrossReference, updateCrossReferenceDisplay};