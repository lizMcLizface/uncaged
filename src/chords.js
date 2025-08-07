import { processChord } from "./intervals"
import {noteToMidi} from './midi';
import { getPrimaryScale, getPrimaryRootNote } from './scaleGenerator';
import { HeptatonicScales, getScaleNotes } from './scales';
import { getFretboard, showChordOnFretboard, showScaleOnFretboard, currentDisplayedChord } from './frets';

let chordSuffixesCommon = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', '7sus4', '7b9']
let chordSuffixesTriads = ['M', 'm', '+', 'o', 'b5', 'sus2', 'sus4']
let chordSuffixesSevenths = ['7', 'M7','mM7', 'm7', '+M7','+7','ø', 'o7', '7b5', 'm6', '6']
let chordSuffixesNines = ['M9', '9', '7b9', 'm9', 'mM9', '+M9', '+9', 'ø9', 'o9', 'ob9']
let chordSuffixesElevens = ['11', 'm11', 'M11', 'mM11', '+M11', '+11', 'ø11', 'o11']
let chordSuffixesThirteens = ['13', 'm13', 'M13', 'mM13', '+M13', '+13', 'ø13']

let chords = {
    'common': chordSuffixesCommon,
    'triads': chordSuffixesTriads,
    'sevenths': chordSuffixesSevenths,
    'nines': chordSuffixesNines,
    'elevens': chordSuffixesElevens,
    'thirteens': chordSuffixesThirteens
}

let processedChords = {};

for (let key in chords) {
    processedChords[key] = chords[key].map(suffix => {
        return {
            suffix: suffix,
            process: processChord('C' + suffix)
        };
    });
}

// console.log("Processed Chords:", processedChords);



const getElementByNote = (note) =>
  note && document.querySelector(`[note="${note}_chord"]`);
const getElementByMIDI = (note) =>
  note && document.querySelector(`[midi="${note}_chord"]`);

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

function highlightKeysForChords(notes){
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



let chordPlaceholder = document.getElementById('chordPlaceholderContent');

// Global variable to store selected root note for chords
let selectedChordRootNote = 'C'; // Default to C

// Create a table for selecting root notes for chords
function createChordRootNoteTable() {
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    let rootTableContainer = document.createElement('div');
    rootTableContainer.style.marginBottom = '20px';
    rootTableContainer.id = 'chordRootNoteTableContainer';
    
    let rootTableLabel = document.createElement('h3');
    rootTableLabel.textContent = 'Chord Root Note Selection';
    rootTableLabel.style.margin = '0 0 10px 0';
    rootTableLabel.style.fontSize = '16px';
    rootTableLabel.style.fontWeight = 'bold';
    
    let rootTable = document.createElement('table');
    rootTable.style.borderCollapse = 'collapse';
    rootTable.style.margin = '0';
    
    let row = document.createElement('tr');
    
    for (let note of chromaticNotes) {
        let cell = document.createElement('td');
        cell.style.border = '1px solid #ccc';
        cell.style.padding = '8px 12px';
        cell.style.textAlign = 'center';
        cell.style.cursor = 'pointer';
        cell.style.userSelect = 'none';
        cell.style.fontWeight = 'bold';
        cell.style.minWidth = '40px';
        
        cell.textContent = note;
        
        // Check if this note is currently selected
        let isSelected = (note === selectedChordRootNote);
        
        if (isSelected) {
            cell.style.backgroundColor = '#2196F3';
            cell.style.color = 'white';
        } else {
            cell.style.backgroundColor = '';
            cell.style.color = '';
        }
        
        // Add click event to select root note
        cell.onclick = function() {
            // Remove any existing tooltips
            const existingTooltips = document.querySelectorAll('.chord-root-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            
            // Select the clicked note (single selection only)
            selectedChordRootNote = note;
            
            // console.log('Selected chord root note:', selectedChordRootNote);
            // console.log('Current chord combinations:', selectedChordSuffixes.map(suffix => selectedChordRootNote + suffix));
            // Refresh both tables to update visual state
            createChordRootNoteTable();
            createChordSuffixTable();
        };
        
        // Add hover effects and tooltips
        cell.onmouseover = function() {
            if (!isSelected) {
                cell.style.backgroundColor = '#606d76ff';
            }
            
            // Add tooltip
            let tooltip = document.createElement('div');
            tooltip.className = 'chord-root-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.background = '#000';
            tooltip.style.color = 'white';
            tooltip.style.border = '1px solid #ccc';
            tooltip.style.padding = '6px 12px';
            tooltip.style.zIndex = 1000;
            tooltip.style.fontSize = '12px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            
            let tooltipText = `<strong>Chord Root:</strong> ${note}<br>`;
            tooltipText += `<em>Click to ${isSelected ? 'keep selected' : 'select'}</em>`;
            tooltip.innerHTML = tooltipText;
            
            document.body.appendChild(tooltip);

            
            highlightKeysForChords(processChord(note + selectedChordSuffixes[0])['notes']);

            cell.onmousemove = function(e) {
                tooltip.style.left = (e.pageX + 10) + 'px';
                tooltip.style.top = (e.pageY + 10) + 'px';
            };
        };
        
        cell.onmouseleave = function() {
            if (!isSelected) {
                cell.style.backgroundColor = '';
            }
            
            // Remove tooltip
            const existingTooltips = document.querySelectorAll('.chord-root-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            
            highlightKeysForChords(processChord(selectedChordRootNote + selectedChordSuffixes[0])['notes']);
            cell.onmousemove = null;
        };
        
        row.appendChild(cell);
    }
    
    rootTable.appendChild(row);
    rootTableContainer.appendChild(rootTableLabel);
    rootTableContainer.appendChild(rootTable);
    
    // Replace existing root note table or add new one
    const existingContainer = document.getElementById('chordRootNoteTableContainer');
    if (existingContainer) {
        chordPlaceholder.replaceChild(rootTableContainer, existingContainer);
    } else {
        chordPlaceholder.appendChild(rootTableContainer);
    }
    
    // Update cross-reference display when chord root note changes
    if (typeof window.updateCrossReferenceDisplay === 'function') {
        window.updateCrossReferenceDisplay();
    }
}


// Global variable to store selected chord suffixes (multiple selection)
let selectedChordSuffixes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', '7sus4', '7b9']; // Array to store multiple selections, default to Major

// Common chord types for the chord button grid
const commonChordTypes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', '7mb5'];

// Chord pattern matching functions (stubs for now)
const chordPatternMatchers = {
    'Major': (rootNote, scaleNotes) => {
        // Stub: return major chord patterns
        return [`${rootNote} Major Pattern 1`, `${rootNote} Major Pattern 2`];
    },
    'Minor': (rootNote, scaleNotes) => {
        // Stub: return minor chord patterns
        return [`${rootNote} Minor Pattern 1`, `${rootNote} Minor Pattern 2`];
    },
    '7': (rootNote, scaleNotes) => {
        // Stub: return dominant 7th chord patterns
        return [`${rootNote}7 Pattern 1`, `${rootNote}7 Pattern 2`];
    },
    '5': (rootNote, scaleNotes) => {
        // Stub: return power chord patterns
        return [`${rootNote}5 Pattern 1`];
    },
    'dim': (rootNote, scaleNotes) => {
        // Stub: return diminished chord patterns
        return [`${rootNote}dim Pattern 1`];
    },
    'dim7': (rootNote, scaleNotes) => {
        // Stub: return diminished 7th chord patterns
        return [`${rootNote}dim7 Pattern 1`];
    },
    'aug': (rootNote, scaleNotes) => {
        // Stub: return augmented chord patterns
        return [`${rootNote}aug Pattern 1`];
    },
    'sus2': (rootNote, scaleNotes) => {
        // Stub: return sus2 chord patterns
        return [`${rootNote}sus2 Pattern 1`];
    },
    'sus4': (rootNote, scaleNotes) => {
        // Stub: return sus4 chord patterns
        return [`${rootNote}sus4 Pattern 1`];
    },
    'maj7': (rootNote, scaleNotes) => {
        // Stub: return major 7th chord patterns
        return [`${rootNote}maj7 Pattern 1`];
    },
    'm7': (rootNote, scaleNotes) => {
        // Stub: return minor 7th chord patterns
        return [`${rootNote}m7 Pattern 1`];
    },
    '7mb5': (rootNote, scaleNotes) => {
        // Stub: return 7b5 chord patterns
        return [`${rootNote}7b5 Pattern 1`];
    }
};

// Create a chord button grid below the fretboard
function createChordButtonGrid() {
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    let gridContainer = document.createElement('div');
    gridContainer.style.marginTop = '20px';
    gridContainer.style.marginBottom = '20px';
    gridContainer.id = 'chordButtonGridContainer';
    
    let gridLabel = document.createElement('h3');
    gridLabel.textContent = 'Chord Pattern Grid';
    gridLabel.style.margin = '0 0 10px 0';
    gridLabel.style.fontSize = '16px';
    gridLabel.style.fontWeight = 'bold';
    
    let grid = document.createElement('table');
    grid.style.borderCollapse = 'collapse';
    grid.style.margin = '0';
    grid.style.width = '100%';
    
    // Create header row with chord types
    let headerRow = document.createElement('tr');
    
    // Empty corner cell
    let cornerCell = document.createElement('th');
    cornerCell.textContent = 'Note/Chord';
    cornerCell.style.border = '1px solid #ccc';
    cornerCell.style.padding = '6px 8px';
    cornerCell.style.backgroundColor = '#2a2a2aff';
    cornerCell.style.color = 'white';
    cornerCell.style.fontWeight = 'bold';
    cornerCell.style.fontSize = '12px';
    cornerCell.style.textAlign = 'center';
    headerRow.appendChild(cornerCell);
    
    // Add chord type header cells
    for (let chordType of commonChordTypes) {
        let cell = document.createElement('th');
        cell.textContent = chordType;
        cell.style.border = '1px solid #ccc';
        cell.style.padding = '6px 8px';
        cell.style.backgroundColor = '#2a2a2aff';
        cell.style.color = 'white';
        cell.style.fontWeight = 'bold';
        cell.style.fontSize = '11px';
        cell.style.textAlign = 'center';
        cell.style.minWidth = '50px';
        headerRow.appendChild(cell);
    }
    
    grid.appendChild(headerRow);
    
    // Create rows for each chromatic note
    for (let note of chromaticNotes) {
        let row = document.createElement('tr');
        
        // Create note label cell
        let noteCell = document.createElement('td');
        noteCell.textContent = note;
        noteCell.style.border = '1px solid #ccc';
        noteCell.style.padding = '6px 8px';
        noteCell.style.fontWeight = 'bold';
        noteCell.style.backgroundColor = '#383838ff';
        noteCell.style.color = 'white';
        noteCell.style.textAlign = 'center';
        noteCell.style.fontSize = '12px';
        noteCell.style.minWidth = '40px';
        row.appendChild(noteCell);
        
        // Create chord button cells
        for (let chordType of commonChordTypes) {
            let cell = document.createElement('td');
            cell.style.border = '1px solid #ccc';
            cell.style.padding = '4px';
            cell.style.textAlign = 'center';
            cell.style.backgroundColor = '#f8f9fa';
            
            // Create button
            let button = document.createElement('button');
            button.textContent = chordType;
            button.style.cssText = `
                width: 100%;
                height: 32px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                font-weight: bold;
                transition: all 0.2s ease;
                user-select: none;
                background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
                color: #333;
            `;
            
            // Add hover and click functionality
            button.addEventListener('mouseenter', () => {
                button.style.background = 'linear-gradient(to bottom, #e2e6ea, #dae0e5)';
                button.style.transform = 'translateY(-1px)';
                
                // Show chord pattern on fretboard temporarily
                showChordPatternOnFretboard(note, chordType, true);
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.background = 'linear-gradient(to bottom, #f8f9fa, #e9ecef)';
                button.style.transform = 'translateY(0)';
                
                // Restore previous fretboard state
                restoreFretboardState();
            });
            
            button.addEventListener('click', () => {
                // Toggle persistent display
                showChordPatternOnFretboard(note, chordType, false);
            });
            
            cell.appendChild(button);
            row.appendChild(cell);
        }
        
        grid.appendChild(row);
    }
    
    gridContainer.appendChild(gridLabel);
    gridContainer.appendChild(grid);
    
    // Return the grid container so it can be added to the fretboard area
    return gridContainer;
}

// Show chord pattern on fretboard with scale context
function showChordPatternOnFretboard(rootNote, chordType, isTemporary) {
    // Import scale functions to get current scale
    if (typeof getPrimaryScale === 'function' && typeof getPrimaryRootNote === 'function' && typeof getScaleNotes === 'function') {
        try {
            // Get current scale information
            const primaryScale = getPrimaryScale();
            const scaleRootNote = getPrimaryRootNote();
            
            if (primaryScale && scaleRootNote) {
                const [family, mode] = primaryScale.split('-');
                const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
                const scaleNotes = getScaleNotes(scaleRootNote, intervals);
                
                // Process the chord to get its notes
                const chordName = rootNote + chordType;
                const chordInfo = processChord(chordName);
                
                if (chordInfo && chordInfo.notes) {
                    // Get the fretboard instance
                    const fretboard = getFretboard('fretNotPlaceholder');
                    if (fretboard) {
                        // Clear previous markers
                        fretboard.clearMarkers();
                        fretboard.clearChordLines();
                        
                        // First, mark all scale notes in grey
                        scaleNotes.forEach(note => {
                            const noteName = typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note;
                            const positions = fretboard.findNotePositions(noteName);
                            
                            positions.forEach(pos => {
                                fretboard.markFret(pos.string, pos.fret, {
                                    backgroundColor: '#e0e0e0',
                                    borderColor: '#999999',
                                    borderWidth: 1,
                                    textColor: '#666666',
                                    size: 20,
                                    label: noteName,
                                    isRoot: false,
                                    useCustomStyle: true
                                });
                            });
                        });
                        
                        // Then, mark chord notes with their usual colorings
                        const chordNotes = chordInfo.notes.map(note => 
                            typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note
                        );
                        
                        // Remove scale notes octave info for comparison
                        const scaleNoteNames = scaleNotes.map(note => 
                            typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note
                        );
                        
                        const colorMap = ['#ff4444', '#ffcc44', '#44ff44', '#4444ff']; // Root, 3rd, 5th, 7th
                        
                        chordNotes.forEach((note, index) => {
                            const positions = fretboard.findNotePositions(note);
                            const isInScale = scaleNoteNames.includes(note);
                            const isRoot = index === 0;
                            
                            positions.forEach(pos => {
                                fretboard.markFret(pos.string, pos.fret, {
                                    backgroundColor: '#ffffff',
                                    borderColor: isInScale ? colorMap[index % colorMap.length] : '#ff0066', // Distinct color for out-of-scale notes
                                    borderWidth: isRoot ? 4 : 3,
                                    textColor: '#333333',
                                    size: isRoot ? 30 : 26,
                                    label: note,
                                    isRoot: isRoot,
                                    useCustomStyle: true
                                });
                            });
                        });
                        
                        console.log(`Displaying ${chordName} pattern ${isTemporary ? 'temporarily' : 'persistently'}`);
                        console.log(`Scale: ${scaleRootNote} ${family} (${scaleNoteNames.join(', ')})`);
                        console.log(`Chord: ${chordNotes.join(', ')}`);
                        
                        // Call the chord pattern matcher function
                        if (chordPatternMatchers[chordType]) {
                            const patterns = chordPatternMatchers[chordType](rootNote, scaleNoteNames);
                            console.log(`Available patterns: ${patterns.join(', ')}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Could not display chord pattern:', error);
            // Fallback to basic chord display
            highlightKeysForChords(processChord(rootNote + chordType)['notes']);
        }
    } else {
        // Fallback if scale functions aren't available
        highlightKeysForChords(processChord(rootNote + chordType)['notes']);
    }
}

// Restore fretboard to previous state
function restoreFretboardState() {
    // Try to restore the previous Roman numeral state
    if (typeof showScaleOnFretboard === 'function' && typeof currentDisplayedChord !== 'undefined') {
        if (currentDisplayedChord === null) {
            // Clear fretboard
            const fretboard = getFretboard('fretNotPlaceholder');
            if (fretboard) {
                fretboard.clearMarkers();
                fretboard.clearChordLines();
            }
        } else if (currentDisplayedChord === 0) {
            // Show scale
            showScaleOnFretboard();
        } else {
            // Show current chord
            showChordOnFretboard(currentDisplayedChord - 1);
        }
    }
}

// Create a table for selecting chord suffixes
function createChordSuffixTable() {
    let chordTableContainer = document.createElement('div');
    chordTableContainer.style.marginTop = '20px';
    chordTableContainer.style.marginBottom = '20px';
    chordTableContainer.id = 'chordSuffixTableContainer';
    
    let chordTableLabel = document.createElement('h3');
    chordTableLabel.textContent = 'Chord Type Selection (Multiple Selection Enabled)';
    chordTableLabel.style.margin = '0 0 10px 0';
    chordTableLabel.style.fontSize = '16px';
    chordTableLabel.style.fontWeight = 'bold';
    
    let chordTable = document.createElement('table');
    chordTable.style.borderCollapse = 'collapse';
    chordTable.style.margin = '0';
    chordTable.style.width = '100%';
    
    // Create rows for each chord category
    const chordCategories = Object.keys(chords);
    
    for (let category of chordCategories) {
        let row = document.createElement('tr');
        
        // Create category label cell (clickable for row selection)
        let categoryCell = document.createElement('td');
        categoryCell.style.border = '1px solid #ccc';
        categoryCell.style.padding = '8px 12px';
        categoryCell.style.fontWeight = 'bold';
        categoryCell.style.backgroundColor = '#2a2a2aff';
        categoryCell.style.minWidth = '100px';
        categoryCell.style.verticalAlign = 'top';
        categoryCell.style.cursor = 'pointer';
        categoryCell.style.userSelect = 'none';
        categoryCell.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        
        // Check if all chords in this category are selected
        const categoryChords = chords[category];
        const allCategorySelected = categoryChords.every(suffix => selectedChordSuffixes.includes(suffix));
        const someCategorySelected = categoryChords.some(suffix => selectedChordSuffixes.includes(suffix));
        
        if (allCategorySelected) {
            categoryCell.style.backgroundColor = '#4CAF50';
            categoryCell.style.color = 'white';
        } else if (someCategorySelected) {
            categoryCell.style.backgroundColor = '#FFC107';
            categoryCell.style.color = 'black';
        }
        
        // Add click event to category cell for row selection
        categoryCell.onclick = function() {
            // Remove any existing tooltips
            const existingTooltips = document.querySelectorAll('.chord-suffix-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            
            if (allCategorySelected) {
                // All are selected, deselect all in this category
                // But only if this wouldn't leave us with no selections
                const otherSelections = selectedChordSuffixes.filter(suffix => !categoryChords.includes(suffix));
                if (otherSelections.length > 0) {
                    selectedChordSuffixes = otherSelections;
                }
                // If this would leave us with no selections, do nothing
            } else {
                // Not all are selected, select all in this category
                categoryChords.forEach(suffix => {
                    if (!selectedChordSuffixes.includes(suffix)) {
                        selectedChordSuffixes.push(suffix);
                    }
                });
            }
            
            // console.log('Selected chord suffixes:', selectedChordSuffixes);
            // console.log('Full chords would be:', selectedChordSuffixes.map(suffix => selectedChordRootNote + suffix));
            
            // Refresh the table to update visual state
            createChordSuffixTable();
        };
        
        // Add hover effects for category cell
        categoryCell.onmouseover = function() {
            if (!allCategorySelected) {
                if (someCategorySelected) {
                    categoryCell.style.backgroundColor = '#FFD54F';
                } else {
                    categoryCell.style.backgroundColor = '#e0e0e0';
                }
            }
            
            // Add tooltip
            let tooltip = document.createElement('div');
            tooltip.className = 'chord-suffix-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.background = '#000';
            tooltip.style.color = 'white';
            tooltip.style.border = '1px solid #ccc';
            tooltip.style.padding = '6px 12px';
            tooltip.style.zIndex = 1000;
            tooltip.style.fontSize = '12px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            tooltip.style.maxWidth = '250px';
            
            let tooltipText = `<strong>Category:</strong> ${category}<br>`;
            if (allCategorySelected) {
                tooltipText += `<em>Click to deselect all in this category</em><br>`;
                tooltipText += `<small>(Only if other selections exist)</small>`;
            } else {
                tooltipText += `<em>Click to select all in this category</em>`;
            }
            tooltip.innerHTML = tooltipText;
            
            document.body.appendChild(tooltip);

            categoryCell.onmousemove = function(e) {
                tooltip.style.left = (e.pageX + 10) + 'px';
                tooltip.style.top = (e.pageY + 10) + 'px';
            };
        };
        
        categoryCell.onmouseleave = function() {
            if (allCategorySelected) {
                categoryCell.style.backgroundColor = '#4CAF50';
            } else if (someCategorySelected) {
                categoryCell.style.backgroundColor = '#FFC107';
            } else {
                categoryCell.style.backgroundColor = '#f5f5f5';
            }
            
            // Remove tooltip
            const existingTooltips = document.querySelectorAll('.chord-suffix-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            categoryCell.onmousemove = null;
        };
        
        row.appendChild(categoryCell);
        
        // Create cells for each chord suffix in this category
        for (let suffix of chords[category]) {
            let cell = document.createElement('td');
            cell.style.border = '1px solid #ccc';
            cell.style.padding = '8px 12px';
            cell.style.textAlign = 'center';
            cell.style.cursor = 'pointer';
            cell.style.userSelect = 'none';
            cell.style.minWidth = '60px';
            cell.style.fontFamily = 'monospace';
            
            cell.textContent = suffix;
            
            // Check if this chord suffix is currently selected
            let isSelected = selectedChordSuffixes.includes(suffix);
            
            if (isSelected) {
                cell.style.backgroundColor = '#4CAF50';
                cell.style.color = 'white';
                cell.style.fontWeight = 'bold';
            } else {
                cell.style.backgroundColor = '';
                cell.style.color = '';
                cell.style.fontWeight = '';
            }
            
            // Add click event to select chord suffix
            cell.onclick = function() {
                // Remove any existing tooltips
                const existingTooltips = document.querySelectorAll('.chord-suffix-tooltip');
                existingTooltips.forEach(tooltip => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                });
                
                // Toggle selection - if already selected, try to deselect
                if (isSelected) {
                    // Only deselect if this wouldn't leave us with no selections
                    if (selectedChordSuffixes.length > 1) {
                        const index = selectedChordSuffixes.indexOf(suffix);
                        selectedChordSuffixes.splice(index, 1);
                    }
                    // If this would leave us with no selections, do nothing
                } else {
                    // Add to selection
                    selectedChordSuffixes.push(suffix);
                }
                
                // console.log('Selected chord suffixes:', selectedChordSuffixes);
                // console.log('Full chords would be:', selectedChordSuffixes.map(suffix => selectedChordRootNote + suffix));
                
                // Refresh the table to update visual state
                createChordSuffixTable();
            };
            
            // Add hover effects and tooltips
            cell.onmouseover = function() {
                if (!isSelected) {
                    cell.style.backgroundColor = '#e8f5e8';
                }
                
                // Add tooltip
                let tooltip = document.createElement('div');
                tooltip.className = 'chord-suffix-tooltip';
                tooltip.style.position = 'absolute';
                tooltip.style.background = '#000';
                tooltip.style.color = 'white';
                tooltip.style.border = '1px solid #ccc';
                tooltip.style.padding = '6px 12px';
                tooltip.style.zIndex = 1000;
                tooltip.style.fontSize = '12px';
                tooltip.style.borderRadius = '4px';
                tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                tooltip.style.maxWidth = '200px';
                
                let fullChord = selectedChordRootNote + suffix;

                let processedChord = processChord(fullChord);

                let tooltipText = `<strong>Chord:</strong> ${fullChord}<br>`;
                tooltipText += `<strong>Suffix:</strong> ${suffix}<br>`;
                tooltipText += `<strong>Category:</strong> ${category}<br>`;
                tooltipText += `<strong>Chord Notes:</strong> ${processedChord['notes'].join(', ')}<br>`;
                if (isSelected) {
                    tooltipText += `<em>Click to deselect</em><br>`;
                    if (selectedChordSuffixes.length === 1) {
                        tooltipText += `<small>(Last selection - cannot deselect)</small>`;
                    }
                } else {
                    tooltipText += `<em>Click to select</em>`;
                }
                highlightKeysForChords(processedChord['notes']);
                tooltip.innerHTML = tooltipText;
                
                document.body.appendChild(tooltip);

                cell.onmousemove = function(e) {
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY + 10) + 'px';
                };
            };
            
            cell.onmouseleave = function() {
                if (!isSelected) {
                    cell.style.backgroundColor = '';
                }
                
                // Remove tooltip
                const existingTooltips = document.querySelectorAll('.chord-suffix-tooltip');
                existingTooltips.forEach(tooltip => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                });
                
                highlightKeysForChords(processChord(selectedChordRootNote + selectedChordSuffixes[0])['notes']);
                cell.onmousemove = null;
            };
            
            row.appendChild(cell);
        }
        
        chordTable.appendChild(row);
    }
    
    chordTableContainer.appendChild(chordTableLabel);
    chordTableContainer.appendChild(chordTable);
    
    // Replace existing chord suffix table or add new one
    const existingContainer = document.getElementById('chordSuffixTableContainer');
    if (existingContainer) {
        chordPlaceholder.replaceChild(chordTableContainer, existingContainer);
    } else {
        chordPlaceholder.appendChild(chordTableContainer);
    }
    
    // Update cross-reference display when chords change
    if (typeof window.updateCrossReferenceDisplay === 'function') {
        window.updateCrossReferenceDisplay();
    }
}

export {chords, processedChords, highlightKeysForChords, 
    createChordRootNoteTable, createChordSuffixTable, selectedChordRootNote, selectedChordSuffixes,
    getElementByNote, getElementByMIDI, keys_chords, createChordButtonGrid, commonChordTypes, chordPatternMatchers
};

