import $ from 'jquery';
import { selectedRootNote, selectedScales, getPrimaryScale, getPrimaryRootNote } from './scaleGenerator';
import { identifySyntheticChords } from './intervals';
import { HeptatonicScales } from './scales';
import {outputNoteArray, drawNotes, outputDiv} from './index'
import { noteToMidi, noteToName } from './midi';
import {updateOutputText, highlightBothPositions} from './index.js';

// Import VexFlow components for staff display
const { Vex, Formatter, Renderer, Stave, Accidental, StaveNote, BarNote, Beam, Dot, StaveConnector, Voice, GhostNote } = require("vexflow");
const { Factory } = Vex.Flow;

let chord_csv = `Name , Style, Length, Chord Progression
50s progression, Major, 4, I vi IV V
IV V I vi, Major, 4, IV V I vi
I V vi IV, Major, 4, I V vi IV
I IV bVII IV, Mixed, 4, I IV bVII IV
ii V I, Major, 3, ii V I
ii bII7 I, Major, 3, ii bII7 I
ii bIII+ I, Mixed, 3, ii bIII+ I
Pachelbels Progression, Major, 5, I V vi iii IV
Effective, Unknown, 4, vi V IV V
I IV vi V, Major, 4, I IV vi V
I V IV V, Major, 4, I V IV V
The Cadential, Unknown, 5, IV ii I6_4 V I
Stepwise Down, Unknown, 4, I V6 vi V
Stepwise Up, Unknown, 4, I ii7 I6 IV
Newcomer, Major, 4, I iii6_4 vi IV
I6 Precadence, Major, 3, IV I6 V
Simple, Major, 3, IV I6 ii
Applied Vii0, Unknown, 3, V viio/vi vi
Mixolydian Cadence, Mix, 4, I bVII IV I
Cadencing via bVII, Mix, 5, I V IV bVII I
vii07/V V I, Major, 3, vii07/V V I
Andalusian, PD, 4, iv III bII I
Backdoor, Major, 3, ii bVII7 I
Bird Changes, Major, 20, I viiø–III7 vi–II7 v–I7, IV7 iv–♭VII7 iii–VI7 ♭iii–♭VI7, ii V7 I–VI7 ii–V
Chromatic 5-6, Mix, 4, I V bVII IV
Circle, Major, 4, vi ii V I
Coltrane Changes, Major, 6, I-V/bVI bVI-V/III III-V I
Eight Bar Blues, Major, 8, I V IV IV I V I V
Folia, Minor, 17, i V i bVII bIII bVII i V i V i bVII bIII bVII i V i
Irregular, Major, 2, V7 III7
Montgomery-Ward, Major, 4, I IV ii V
Pachelbels Canon, Major, 8, I V vi iii IV I IV V
Passamezzo antico, Minor, 8, i VII i V  III VII i V i
I V vi IV, Major, 4, i V vi IV
Ragtime, Major, 4, III7 VI7 ii7 V7
Rhythm changes, Major, 12, I iv ii V/I I7 iv I V I/III7 VI7 II7 V7
Romanesca, Major, 9, III VII i V III VII i V i
Sixteen Bar Blues, Major, 16, I I I I I I I I IV IV I I V IV I I
Stomp, Major, 15, IV7 #ivdim7 I7 I7 IV7 #ivdim7 I7 I7 IV7 #ivdim7 I7 V7/V/V V7/V V7 I7
Twelve Bar Blues, Major, 12, I I I I IV IV I I V IV I V
I vi ii V, Major, 4, I vi ii V
bVII V7 cadence, Mix, 3, bVII V7 I
V IV I turnaround, Major, 3, V IV I
I bVII bVI bVII, Minor, 4, I bVII bVI bVII
IVD7 V7 iii7 vi, Major, 4, IVD7 V7 iii7 vi
bVI bVII I, Major, 3, bVI bVII I
`

let chord_progressions = {};
chord_csv.split('\n').forEach(line => {
    if (line.trim() === '' || line.startsWith('Name')) return; // Skip empty lines and header
    const [name, style, length, progression] = line.split(',').map(item => item.trim());
    chord_progressions[name] = {
        style: style,
        length: parseInt(length, 10),
        progression: progression
    };
});

// console.log(chord_progressions);

let placeholder = document.getElementById('ProgressionTabPlaceholder');

// Global variable to store selected chord progression (single selection)
let selectedProgression = '50s progression'; // Default to first progression

// Global variables for progression realization options
let progressionOptions = {
    voicing: 'natural',           // 'natural', 'first_inversion', 'leading'
    splitChord: true,            // true/false
    lowerOctave: 3,              // 1-7
    upperOctave: 5,              // 1-7
    root: 'both',                // 'lower', 'upper', 'both'
    third: 'upper',               // 'lower', 'upper', 'both'
    fifth: 'upper',               // 'lower', 'upper', 'both'
    seventh: 'upper',             // 'lower', 'upper', 'both'
    ninth: 'upper',               // 'lower', 'upper', 'both'
    playStyle: 'block',          // 'block', 'arpeggiated', 'broken'
    timing: 'even',              // 'even', 'swing', 'rubato'
    velocity: 'medium',          // 'soft', 'medium', 'loud', 'dynamic'
    sustain: true,               // true/false - use sustain pedal
    bassLine: 'root',            // 'root', 'walking', 'pedal', 'none'
    rhythm: 'whole',             // 'whole', 'half', 'quarter', 'eighth', 'sixteenth'
    noteDuration: 'whole',       // 'whole', 'half', 'quarter', 'eighth', 'sixteenth' - auto-repeats to fill bar
    chordRepeat: 1,              // 1-4 - number of times each bar is repeated
    arpeggioMode: false,         // true/false - enable arpeggio mode
    arpeggioDirection: 'up',     // 'up', 'down', 'random', 'up-down', 'down-up'
    chordType: 'triads',         // 'triads', 'seventh', 'ninth' - determines chord complexity
};

// Create a table for selecting chord progressions
function createProgressionTable() {
    // Only clear and recreate the table container, not the entire placeholder
    const existingTable = document.getElementById('progressionTableContainer');
    if (existingTable) {
        placeholder.removeChild(existingTable);
    }
    
    let progressionTableContainer = document.createElement('div');
    progressionTableContainer.style.marginBottom = '20px';
    progressionTableContainer.id = 'progressionTableContainer';
    
    let progressionTableLabel = document.createElement('h3');
    progressionTableLabel.textContent = 'Chord Progression Selection';
    progressionTableLabel.style.margin = '0 0 10px 0';
    progressionTableLabel.style.fontSize = '16px';
    progressionTableLabel.style.fontWeight = 'bold';
    
    let progressionTable = document.createElement('table');
    progressionTable.style.borderCollapse = 'collapse';
    progressionTable.style.margin = '0';
    progressionTable.style.width = '100%';
    
    // Get all progression names
    const progressionNames = Object.keys(chord_progressions);
    
    // Create rows with at most 8 entries per row
    const maxPerRow = 8;
    let currentRow = null;
    let cellsInCurrentRow = 0;
    
    for (let i = 0; i < progressionNames.length; i++) {
        const progressionName = progressionNames[i];
        const progressionData = chord_progressions[progressionName];
        
        // Create a new row if needed
        if (cellsInCurrentRow === 0 || cellsInCurrentRow >= maxPerRow) {
            currentRow = document.createElement('tr');
            progressionTable.appendChild(currentRow);
            cellsInCurrentRow = 0;
        }
        
        let cell = document.createElement('td');
        cell.style.border = '1px solid #ccc';
        cell.style.padding = '8px 12px';
        cell.style.textAlign = 'center';
        cell.style.cursor = 'pointer';
        cell.style.userSelect = 'none';
        cell.style.fontWeight = 'bold';
        cell.style.minWidth = '120px';
        cell.style.fontSize = '12px';
        cell.style.verticalAlign = 'middle';
        
        cell.textContent = progressionName;
        
        // Check if this progression is currently selected
        let isSelected = selectedProgression === progressionName;
        
        if (isSelected) {
            cell.style.backgroundColor = '#4CAF50';
            cell.style.color = 'white';
        } else {
            cell.style.backgroundColor = '';
            cell.style.color = '';
        }
        
        // Add click event to select progression
        cell.onclick = function(e) {
            // Remove any existing tooltips
            const existingTooltips = document.querySelectorAll('.progression-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            
            // Exclusive selection - always select the clicked progression
            selectedProgression = progressionName;
            
            console.log('Selected chord progression:', selectedProgression);
            console.log('Progression details:', chord_progressions[selectedProgression]);
            
            // Refresh the table to update visual state
            createProgressionTable();
            
            // Update staff display when progression changes
            drawProgressionStaff();
        };
        
        // Add hover effects and tooltips
        cell.onmouseover = function() {
            if (!isSelected) {
                cell.style.backgroundColor = '#e8f5e8';
            }
            
            // Add tooltip
            let tooltip = document.createElement('div');
            tooltip.className = 'progression-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.background = '#000';
            tooltip.style.color = 'white';
            tooltip.style.border = '1px solid #ccc';
            tooltip.style.padding = '6px 12px';
            tooltip.style.zIndex = 1000;
            tooltip.style.fontSize = '12px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            tooltip.style.maxWidth = '300px';
            
            let tooltipText = `<strong>Progression:</strong> ${progressionName}<br>`;
            tooltipText += `<strong>Style:</strong> ${progressionData.style}<br>`;
            tooltipText += `<strong>Length:</strong> ${progressionData.length} chords<br>`;
            tooltipText += `<strong>Chords:</strong> ${progressionData.progression}<br>`;
            if (isSelected) {
                tooltipText += `<em>Currently selected</em>`;
            } else {
                tooltipText += `<em>Click to select</em>`;
            }
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
            const existingTooltips = document.querySelectorAll('.progression-tooltip');
            existingTooltips.forEach(tooltip => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            });
            cell.onmousemove = null;
        };
        
        currentRow.appendChild(cell);
        cellsInCurrentRow++;
    }
    
    progressionTableContainer.appendChild(progressionTableLabel);
    progressionTableContainer.appendChild(progressionTable);
    
    // Insert the table at the beginning of the placeholder
    if (placeholder.firstChild) {
        placeholder.insertBefore(progressionTableContainer, placeholder.firstChild);
    } else {
        placeholder.appendChild(progressionTableContainer);
    }
}

// Create options panel for progression realization
function createProgressionOptionsPanel() {
    let optionsContainer = document.createElement('div');
    optionsContainer.style.marginTop = '20px';
    optionsContainer.style.padding = '15px';
    optionsContainer.style.border = '1px solid #ccc';
    optionsContainer.style.borderRadius = '5px';
    optionsContainer.style.backgroundColor = '#353535ff';
    optionsContainer.id = 'progressionOptionsContainer';
    
    let optionsLabel = document.createElement('h3');
    optionsLabel.textContent = 'Progression Realization Options';
    optionsLabel.style.margin = '0 0 15px 0';
    optionsLabel.style.fontSize = '16px';
    optionsLabel.style.fontWeight = 'bold';
    
    optionsContainer.appendChild(optionsLabel);
    
    // Create a grid layout for options
    let optionsGrid = document.createElement('div');
    optionsGrid.style.display = 'grid';
    optionsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    optionsGrid.style.gap = '15px';
    
    // Helper function to create option groups
    function createOptionGroup(label, options, currentValue, onChange, isDisabled = false) {
        let group = document.createElement('div');
        
        let groupLabel = document.createElement('label');
        groupLabel.textContent = label + ':';
        groupLabel.style.fontWeight = 'bold';
        groupLabel.style.display = 'block';
        groupLabel.style.marginBottom = '5px';
        groupLabel.style.fontSize = '12px';
        
        let select = document.createElement('select');
        select.style.width = '100%';
        select.style.padding = '4px 8px';
        select.style.fontSize = '12px';
        select.disabled = isDisabled;
        
        if (isDisabled) {
            select.style.backgroundColor = '#e9ecef';
            select.style.color = '#6c757d';
        }
        
        // Add options
        Object.keys(options).forEach(key => {
            let option = document.createElement('option');
            option.value = key;
            option.textContent = options[key];
            if (key === currentValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        select.onchange = onChange;
        
        group.appendChild(groupLabel);
        group.appendChild(select);
        
        return { group, select };
    }
    
    // Helper function to create number input
    function createNumberInput(label, min, max, currentValue, onChange, isDisabled = false) {
        let group = document.createElement('div');
        
        let groupLabel = document.createElement('label');
        groupLabel.textContent = label + ':';
        groupLabel.style.fontWeight = 'bold';
        groupLabel.style.display = 'block';
        groupLabel.style.marginBottom = '5px';
        groupLabel.style.fontSize = '12px';
        
        let input = document.createElement('input');
        input.type = 'number';
        input.min = min;
        input.max = max;
        input.value = currentValue;
        input.style.width = '100%';
        input.style.padding = '4px 8px';
        input.style.fontSize = '12px';
        input.disabled = isDisabled;
        
        if (isDisabled) {
            input.style.backgroundColor = '#e9ecef';
            input.style.color = '#6c757d';
        }
        
        input.onchange = onChange;
        
        group.appendChild(groupLabel);
        group.appendChild(input);
        
        return { group, input };
    }
    
    // Voicing options
    const voicingGroup = createOptionGroup('Voicing', {
        'natural': 'Always Natural',
        'first_inversion': 'Always First Inversion', 
        'leading': 'Leading Voice'
    }, progressionOptions.voicing, function(e) {
        progressionOptions.voicing = e.target.value;
        // console.log('Voicing changed to:', progressionOptions.voicing);
        drawProgressionStaff();
    });
    
    // Chord type options
    const chordTypeGroup = createOptionGroup('Chord Type', {
        'triads': 'Triads (3 notes)',
        'seventh': 'Seventh Chords (4 notes)',
        'ninth': 'Ninth Chords (5 notes)'
    }, progressionOptions.chordType, function(e) {
        progressionOptions.chordType = e.target.value;
        console.log('Chord type changed to:', progressionOptions.chordType);
        drawProgressionStaff();
    });
    
    // Split chord option
    const splitChordGroup = createOptionGroup('Split Chord', {
        'true': 'Yes',
        'false': 'No'
    }, progressionOptions.splitChord.toString(), function(e) {
        progressionOptions.splitChord = e.target.value === 'true';
        // console.log('Split chord changed to:', progressionOptions.splitChord);
        // Refresh options to enable/disable lower octave
        createProgressionOptionsPanel();
        drawProgressionStaff();
    });
    
    // Lower octave (only enabled if split chord is yes)
    const lowerOctaveGroup = createNumberInput('Lower Octave', 1, 7, progressionOptions.lowerOctave, function(e) {
        progressionOptions.lowerOctave = parseInt(e.target.value);
        // console.log('Lower octave changed to:', progressionOptions.lowerOctave);
        drawProgressionStaff();
    }, !progressionOptions.splitChord);
    
    // Upper octave (always enabled)
    const upperOctaveGroup = createNumberInput('Upper Octave', 1, 7, progressionOptions.upperOctave, function(e) {
        progressionOptions.upperOctave = parseInt(e.target.value);
        // console.log('Upper octave changed to:', progressionOptions.upperOctave);
        drawProgressionStaff();
    });
    
    // Voice distribution options
    const rootGroup = createOptionGroup('Root Note', {
        'lower': 'Lower',
        'upper': 'Upper',
        'both': 'Both'
    }, progressionOptions.root, function(e) {
        progressionOptions.root = e.target.value;
        // console.log('Root distribution changed to:', progressionOptions.root);
        drawProgressionStaff();
    });
    
    const thirdGroup = createOptionGroup('Third', {
        'lower': 'Lower',
        'upper': 'Upper', 
        'both': 'Both'
    }, progressionOptions.third, function(e) {
        progressionOptions.third = e.target.value;
        // console.log('Third distribution changed to:', progressionOptions.third);
        drawProgressionStaff();
    });
    
    const fifthGroup = createOptionGroup('Fifth', {
        'lower': 'Lower',
        'upper': 'Upper',
        'both': 'Both'
    }, progressionOptions.fifth, function(e) {
        progressionOptions.fifth = e.target.value;
        // console.log('Fifth distribution changed to:', progressionOptions.fifth);
        drawProgressionStaff();
    });
    
    const seventhGroup = createOptionGroup('Seventh', {
        'lower': 'Lower',
        'upper': 'Upper',
        'both': 'Both'
    }, progressionOptions.seventh, function(e) {
        progressionOptions.seventh = e.target.value;
        // console.log('Seventh distribution changed to:', progressionOptions.seventh);
        drawProgressionStaff();
    });
    
    const ninthGroup = createOptionGroup('Ninth', {
        'lower': 'Lower',
        'upper': 'Upper',
        'both': 'Both'
    }, progressionOptions.ninth, function(e) {
        progressionOptions.ninth = e.target.value;
        // console.log('Ninth distribution changed to:', progressionOptions.ninth);
        drawProgressionStaff();
    });
    
    // Play style options
    const playStyleGroup = createOptionGroup('Play Style', {
        'block': 'Block Chords',
        'arpeggiated': 'Arpeggiated',
        'broken': 'Broken Chords'
    }, progressionOptions.playStyle, function(e) {
        progressionOptions.playStyle = e.target.value;
        // console.log('Play style changed to:', progressionOptions.playStyle);
        drawProgressionStaff();
    });
    
    // Timing options
    const timingGroup = createOptionGroup('Timing', {
        'even': 'Even',
        'swing': 'Swing',
        'rubato': 'Rubato'
    }, progressionOptions.timing, function(e) {
        progressionOptions.timing = e.target.value;
        // console.log('Timing changed to:', progressionOptions.timing);
        drawProgressionStaff();
    });
    
    // Velocity options
    const velocityGroup = createOptionGroup('Velocity', {
        'soft': 'Soft (pp)',
        'medium': 'Medium (mf)',
        'loud': 'Loud (ff)',
        'dynamic': 'Dynamic'
    }, progressionOptions.velocity, function(e) {
        progressionOptions.velocity = e.target.value;
        // console.log('Velocity changed to:', progressionOptions.velocity);
        drawProgressionStaff();
    });
    
    // Sustain pedal
    const sustainGroup = createOptionGroup('Sustain Pedal', {
        'true': 'Yes',
        'false': 'No'
    }, progressionOptions.sustain.toString(), function(e) {
        progressionOptions.sustain = e.target.value === 'true';
        // console.log('Sustain changed to:', progressionOptions.sustain);
        drawProgressionStaff();
    });
    
    // Bass line options
    const bassLineGroup = createOptionGroup('Bass Line', {
        'root': 'Root Notes Only',
        'walking': 'Walking Bass',
        'pedal': 'Pedal Tone',
        'none': 'No Bass'
    }, progressionOptions.bassLine, function(e) {
        progressionOptions.bassLine = e.target.value;
        // console.log('Bass line changed to:', progressionOptions.bassLine);
        drawProgressionStaff();
    });
    
    // Rhythm options with buttons
    const rhythmGroup = createOptionGroup('Rhythm', {
        'whole': 'Whole Notes',
        'half': 'Half Notes',
        'quarter': 'Quarter Notes',
        'eighth': 'Eighth Notes',
        'sixteenth': 'Sixteenth Notes'
    }, progressionOptions.rhythm, function(e) {
        progressionOptions.rhythm = e.target.value;
        // console.log('Rhythm changed to:', progressionOptions.rhythm);
        drawProgressionStaff();
    });
    
    // Note duration options
    const noteDurationGroup = createOptionGroup('Note Duration', {
        'whole': 'Whole Notes',
        'half': 'Half Notes', 
        'quarter': 'Quarter Notes',
        'eighth': 'Eighth Notes',
        'sixteenth': 'Sixteenth Notes'
    }, progressionOptions.noteDuration, function(e) {
        progressionOptions.noteDuration = e.target.value;
        // console.log('Note duration changed to:', progressionOptions.noteDuration);
        drawProgressionStaff();
    });
    
    // Chord repeat options
    const chordRepeatGroup = createNumberInput('Chord Repeat', 1, 4, progressionOptions.chordRepeat, function(e) {
        progressionOptions.chordRepeat = parseInt(e.target.value);
        console.log('Chord repeat changed to:', progressionOptions.chordRepeat);
        drawProgressionStaff();
    });
    
    // Arpeggio mode toggle
    const arpeggioModeGroup = createOptionGroup('Arpeggio Mode', {
        'false': 'Block Chords',
        'true': 'Arpeggio'
    }, progressionOptions.arpeggioMode.toString(), function(e) {
        progressionOptions.arpeggioMode = e.target.value === 'true';
        // console.log('Arpeggio mode changed to:', progressionOptions.arpeggioMode);
        // Refresh options to enable/disable arpeggio direction
        createProgressionOptionsPanel();
        drawProgressionStaff();
    });
    
    // Arpeggio direction (only enabled if arpeggio mode is on)
    const arpeggioDirectionGroup = createOptionGroup('Arpeggio Direction', {
        'up': 'Up',
        'down': 'Down',
        'random': 'Random',
        'up-down': 'Up then Down',
        'down-up': 'Down then Up'
    }, progressionOptions.arpeggioDirection, function(e) {
        progressionOptions.arpeggioDirection = e.target.value;
        // console.log('Arpeggio direction changed to:', progressionOptions.arpeggioDirection);
        drawProgressionStaff();
    }, !progressionOptions.arpeggioMode);
    
    // Create a container that combines the rhythm option with buttons
    let rhythmAndButtonsContainer = document.createElement('div');
    rhythmAndButtonsContainer.appendChild(rhythmGroup.group);
    
    // Add action buttons below rhythm option
    let buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '10px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '5px';
    buttonContainer.style.flexDirection = 'column';
    
    // Add to Output button
    let addButton = document.createElement('button');
    addButton.textContent = 'Add to Output';
    addButton.style.padding = '6px 12px';
    addButton.style.backgroundColor = '#4CAF50';
    addButton.style.color = 'white';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.cursor = 'pointer';
    addButton.style.fontSize = '11px';
    addButton.style.fontWeight = 'bold';
    
    addButton.onclick = function() {
        addProgressionToOutput();
    };
    
    // Replace Output button
    let replaceButton = document.createElement('button');
    replaceButton.textContent = 'Replace Output';
    replaceButton.style.padding = '6px 12px';
    replaceButton.style.backgroundColor = '#FF5722';
    replaceButton.style.color = 'white';
    replaceButton.style.border = 'none';
    replaceButton.style.borderRadius = '4px';
    replaceButton.style.cursor = 'pointer';
    replaceButton.style.fontSize = '11px';
    replaceButton.style.fontWeight = 'bold';
    
    replaceButton.onclick = function() {
        replaceOutputWithProgression();
    };
    
    buttonContainer.appendChild(addButton);
    buttonContainer.appendChild(replaceButton);
    // rhythmAndButtonsContainer.appendChild(buttonContainer);
    
    // Add all groups to the grid
    optionsGrid.appendChild(voicingGroup.group);
    optionsGrid.appendChild(chordTypeGroup.group);
    optionsGrid.appendChild(splitChordGroup.group);
    optionsGrid.appendChild(lowerOctaveGroup.group);
    optionsGrid.appendChild(upperOctaveGroup.group);
    optionsGrid.appendChild(rootGroup.group);
    optionsGrid.appendChild(thirdGroup.group);
    optionsGrid.appendChild(fifthGroup.group);
    optionsGrid.appendChild(seventhGroup.group);
    optionsGrid.appendChild(ninthGroup.group);
    optionsGrid.appendChild(playStyleGroup.group);
    optionsGrid.appendChild(timingGroup.group);
    optionsGrid.appendChild(velocityGroup.group);
    optionsGrid.appendChild(sustainGroup.group);
    optionsGrid.appendChild(bassLineGroup.group);
    optionsGrid.appendChild(rhythmAndButtonsContainer);
    optionsGrid.appendChild(noteDurationGroup.group);
    optionsGrid.appendChild(chordRepeatGroup.group);
    optionsGrid.appendChild(arpeggioModeGroup.group);
    optionsGrid.appendChild(arpeggioDirectionGroup.group);
    optionsGrid.appendChild(buttonContainer);
    
    optionsContainer.appendChild(optionsGrid);
    
    // Replace existing options panel or add new one
    const existingOptions = document.getElementById('progressionOptionsContainer');
    if (existingOptions) {
        placeholder.replaceChild(optionsContainer, existingOptions);
    } else {
        placeholder.appendChild(optionsContainer);
    }
}

// Create progression staff display
function createProgressionStaffDisplay() {
    let staffContainer = document.createElement('div');
    staffContainer.style.marginTop = '20px';
    staffContainer.style.padding = '10px'; // Reduced from 15px to 10px
    staffContainer.style.border = '1px solid #ccc';
    staffContainer.style.borderRadius = '5px';
    staffContainer.style.backgroundColor = '#fff';
    staffContainer.id = 'progressionStaffContainer';
    
    let staffLabel = document.createElement('h3');
    staffLabel.textContent = 'Chord Progression Preview';
    staffLabel.style.margin = '0 0 10px 0'; // Reduced bottom margin from 15px to 10px
    staffLabel.style.fontSize = '16px';
    staffLabel.style.fontWeight = 'bold';
    
    staffContainer.appendChild(staffLabel);
    
    // Create div for the staff display
    let staffDiv = document.createElement('div');
    staffDiv.id = 'progressionStaffDiv';
    staffDiv.style.width = '100%';
    staffDiv.style.minHeight = '120px';
    staffDiv.style.border = '1px solid #eee';
    staffDiv.style.borderRadius = '3px';
    staffDiv.style.backgroundColor = '#fafafa';
    
    staffContainer.appendChild(staffDiv);
    
    // Replace existing staff container or add new one
    const existingStaff = document.getElementById('progressionStaffContainer');
    if (existingStaff) {
        placeholder.replaceChild(staffContainer, existingStaff);
    } else {
        placeholder.appendChild(staffContainer);
    }
    
    // Draw the staff with current progressions
    drawProgressionStaff();
}

// Setup staves similar to index.js setupStaves function
function setupProgressionStaves(div, divisions = 1) {
    // Clear existing content
    while (div.hasChildNodes()) {
        div.removeChild(div.lastChild);
    }

    const renderer = new Renderer(div, Renderer.Backends.SVG);
    
    var displayWidth = div.offsetWidth || 800; // fallback width
    renderer.resize(displayWidth, 180); // Reduced height from 320 to 180
    const context = renderer.getContext();

    var maxWidth = displayWidth - 100;
    
    if (divisions <= 1) {
        // Single stave system
        const trebleStave = new Stave(30, 20, maxWidth); // Moved up from 80 to 20
        const bassStave = new Stave(30, 80, maxWidth);   // Moved up from 160 to 80
        
        trebleStave.addClef("treble");
        bassStave.addClef("bass");
        
        // Use C major for now (could be made configurable)
        trebleStave.addKeySignature('C');
        bassStave.addKeySignature('C');

        trebleStave.setContext(context).draw();
        bassStave.setContext(context).draw();

        new StaveConnector(bassStave, trebleStave)
            .setType('single')
            .setContext(context)
            .draw();

        new StaveConnector(trebleStave, bassStave)
            .setType('brace')
            .setContext(context)
            .draw();

        return { renderer, context, displayWidth: maxWidth, trebleStave, bassStave };
    } else {
        // Multiple stave system for showing multiple chords
        var divWidth = maxWidth / divisions;
        var trebleStaves = [];
        var bassStaves = [];
        
        // Create first staves with clefs and key signatures
        trebleStaves.push(new Stave(30, 20, divWidth)); // Moved up from 80 to 20
        bassStaves.push(new Stave(30, 80, divWidth));   // Moved up from 200 to 80

        trebleStaves[0].addClef("treble");
        bassStaves[0].addClef("bass");
        trebleStaves[0].addKeySignature('C');
        bassStaves[0].addKeySignature('C');

        // Create additional staves
        for (var i = 1; i < divisions; ++i) {
            trebleStaves.push(new Stave(trebleStaves[i-1].width + trebleStaves[i-1].x, 20, divWidth)); // Updated y position
            bassStaves.push(new Stave(bassStaves[i-1].width + bassStaves[i-1].x, 80, divWidth));       // Updated y position
        }
            
        // Draw all staves
        for (var stave of trebleStaves) {
            stave.setContext(context).draw();
        }
        for (var stave of bassStaves) {
            stave.setContext(context).draw();
        }

        // Add connectors
        new StaveConnector(bassStaves[0], trebleStaves[0])
            .setType('single')
            .setContext(context)
            .draw();

        new StaveConnector(trebleStaves[0], bassStaves[0])
            .setType('brace')
            .setContext(context)
            .draw();

        return { renderer, context, displayWidth: divWidth, trebleStaves, bassStaves };
    }
}

var noteArray = [];

// Helper function to get note position in chromatic scale
function getNotePosition(noteName) {
    const noteMap = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
        'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    return noteMap[noteName] || 0;
}

// Helper function to sort notes by pitch for arpeggio
function sortNotesByPitch(notes) {
    return notes.slice().sort((a, b) => {
        if (!a.includes('/') || !b.includes('/')) return 0;
        
        const [noteNameA, octaveA] = a.split('/');
        const [noteNameB, octaveB] = b.split('/');
        
        const pitchA = parseInt(octaveA) * 12 + getNotePosition(noteNameA);
        const pitchB = parseInt(octaveB) * 12 + getNotePosition(noteNameB);
        
        return pitchA - pitchB;
    });
}

// Helper function to apply arpeggio ordering
function applyArpeggioOrdering(notes, direction) {
    if (notes.length <= 1) return notes;
    
    const sortedNotes = sortNotesByPitch(notes);
    
    switch (direction) {
        case 'up':
            return sortedNotes;
        case 'down':
            return sortedNotes.reverse();
        case 'random':
            const shuffled = [...sortedNotes];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        case 'up-down':
            if (sortedNotes.length < 3) return sortedNotes;
            return [...sortedNotes, ...sortedNotes.slice(-2, 0).reverse()];
        case 'down-up':
            if (sortedNotes.length < 3) return sortedNotes.reverse();
            const reversed = [...sortedNotes].reverse();
            return [...reversed, ...reversed.slice(-2, 0).reverse()];
        default:
            return sortedNotes;
    }
}

// Function to apply leading voice logic to chord progressions
function applyLeadingVoice(chordProgression) {
    if (!chordProgression || chordProgression.length === 0) {
        return chordProgression;
    }
    
    const result = [];
    
    for (let chordIndex = 0; chordIndex < chordProgression.length; chordIndex++) {
        const currentChord = chordProgression[chordIndex];
        
        if (chordIndex === 0) {
            // First chord - keep as is
            result.push([...currentChord]);
            continue;
        }
        
        const previousChord = result[chordIndex - 1];
        const adjustedChord = [];
        
        // Process each note in the current chord
        for (let noteIndex = 0; noteIndex < currentChord.length; noteIndex++) {
            let currentNote = currentChord[noteIndex];
            
            if (!currentNote.includes('/')) {
                adjustedChord.push(currentNote);
                continue;
            }
            
            const [currentNoteName, currentOctaveStr] = currentNote.split('/');
            let currentOctave = parseInt(currentOctaveStr);
            
            // Find the closest voice in the previous chord to follow
            let bestMatch = null;
            let smallestInterval = Infinity;
            
            for (const prevNote of previousChord) {
                if (!prevNote.includes('/')) continue;
                
                const [prevNoteName, prevOctaveStr] = prevNote.split('/');
                const prevOctave = parseInt(prevOctaveStr);
                
                // Calculate interval between notes
                const currentPos = getNotePosition(currentNoteName);
                const prevPos = getNotePosition(prevNoteName);
                
                // Try different octaves to find the smallest interval
                for (let octaveOffset = -1; octaveOffset <= 2; octaveOffset++) {
                    const testOctave = currentOctave + octaveOffset;
                    if (testOctave < 1 || testOctave > 7) continue;
                    
                    const interval = Math.abs((testOctave * 12 + currentPos) - (prevOctave * 12 + prevPos));
                    
                    if (interval < smallestInterval) {
                        smallestInterval = interval;
                        bestMatch = {
                            octave: testOctave,
                            interval: interval
                        };
                    }
                }
            }
            
            // Apply the best octave found, or keep original if no good match
            if (bestMatch && smallestInterval <= 12) { // Within an octave
                adjustedChord.push(`${currentNoteName}/${bestMatch.octave}`);
            } else {
                // Fallback: apply simple ascending rule
                // If this note is lower in pitch than the highest note in previous chord, raise octave
                let highestPrevNote = 0;
                for (const prevNote of previousChord) {
                    if (!prevNote.includes('/')) continue;
                    const [prevNoteName, prevOctaveStr] = prevNote.split('/');
                    const prevOctave = parseInt(prevOctaveStr);
                    const prevPos = getNotePosition(prevNoteName);
                    const prevPitch = prevOctave * 12 + prevPos;
                    highestPrevNote = Math.max(highestPrevNote, prevPitch);
                }
                
                const currentPos = getNotePosition(currentNoteName);
                let currentPitch = currentOctave * 12 + currentPos;
                
                // If current note is significantly lower than the highest previous note, raise octave
                while (currentPitch < highestPrevNote - 6 && currentOctave < 7) { // Allow up to 6 semitones below
                    currentOctave++;
                    currentPitch = currentOctave * 12 + currentPos;
                }
                
                adjustedChord.push(`${currentNoteName}/${currentOctave}`);
            }
        }
        
        result.push(adjustedChord);
    }
    
    return result;
}

// Draw progression on staff
function drawProgressionStaff() {
    const staffDiv = document.getElementById('progressionStaffDiv');
    if (!staffDiv) return;
    
    // Get the selected progression for display
    if (!selectedProgression) return;
    
    const progressionData = chord_progressions[selectedProgression];
    if (!progressionData) return;
    
    // Parse the chord symbols from the progression
    const chordSymbols = progressionData.progression.split(' ').filter(chord => chord.trim() !== '');
    const numChords = Math.min(chordSymbols.length, 8); // Limit to 8 chords for display
    
    // Setup staves based on number of chords
    const { renderer, context, displayWidth, trebleStaves, bassStaves, trebleStave, bassStave } = 
        setupProgressionStaves(staffDiv, numChords);
    
    // Get primary scale and root note
    const primaryScale = getPrimaryScale();
    const primaryRootNote = getPrimaryRootNote();
    
    if (!primaryScale || !primaryRootNote) {
        console.error('No primary scale or root note selected');
        return;
    }
    
    const [scaleFamily, scaleMode] = primaryScale.split('-');
    let chordNotes = getProgressionNotes(selectedProgression, scaleFamily, scaleMode, primaryRootNote);
    console.log('Chord notes:', chordNotes);

    noteArray = []; // Reset note array for new progression

    // Collect all chord notes first, then apply voice leading
    var allTrebleChords = [];
    var allBassChords = [];
    var chordSampleNotes = [];
    
    for (let i = 0; i < chordSymbols.length; i++) {
        const chordSymbol = chordSymbols[i];
        const notes = chordNotes[i];

        const currentNotes = notes.chord; // Contains an array like [C, E, G]
        const rootNote = currentNotes[0]; // First note is always the root

        // Apply natural voicing logic first if selected
        let trebleNotes, bassNotes;
        
        if (progressionOptions.voicing === 'natural') {
            // For natural voicing, always put root in bass and other notes in treble
            // trebleNotes = currentNotes.slice(1).map(note => `${note}/${progressionOptions.upperOctave}`); // All notes except root go to treble
            // bassNotes = [`${rootNote}/${progressionOptions.splitChord ? progressionOptions.lowerOctave : progressionOptions.upperOctave}`]; // Root always in bass
            trebleNotes = currentNotes.slice(0).map(note => `${note}/${progressionOptions.upperOctave}`); // 
            bassNotes = []
            
            // console.log(`Chord ${i + 1} natural voicing - treble:`, trebleNotes, `bass:`, bassNotes);
        } else {
            // Default behavior for other voicing types
            trebleNotes = currentNotes.slice(0).map(note => `${note}/${progressionOptions.upperOctave}`); // Convert to VexFlow format with upper octave
            bassNotes = [];
        }
        
        // Apply split chord logic only if not using natural voicing
        if (progressionOptions.splitChord) {
            // console.log(`Chord ${i + 1} split chord enabled ${progressionOptions.bassLine}`);
            let thirdNote = currentNotes[1];
            let fifthNote = currentNotes[2];
            let seventhNote = currentNotes[3] || null; // Optional seventh note
            let ninthNote = currentNotes[4] || null; // Optional ninth note

            if(progressionOptions.third === 'lower') {
                trebleNotes = trebleNotes.filter(note => !note.startsWith(thirdNote)); // Remove third from treble
                bassNotes.push(`${thirdNote}/${progressionOptions.lowerOctave}`); // Add third to bass
            }
            if(progressionOptions.fifth === 'lower') {
                trebleNotes = trebleNotes.filter(note => !note.startsWith(fifthNote)); // Remove fifth from treble
                bassNotes.push(`${fifthNote}/${progressionOptions.lowerOctave}`); // Add
                // fifth to bass
            }
            if(progressionOptions.seventh === 'lower' && seventhNote) {
                trebleNotes = trebleNotes.filter(note => !note.startsWith(seventhNote)); // Remove seventh from treble
                bassNotes.push(`${seventhNote}/${progressionOptions.lowerOctave}`); // Add seventh to bass
            }
            if(progressionOptions.ninth === 'lower' && ninthNote) {
                trebleNotes = trebleNotes.filter(note => !note.startsWith(ninthNote)); // Remove ninth from treble
                bassNotes.push(`${ninthNote}/${progressionOptions.lowerOctave}`); // Add ninth to bass
            }
            if(progressionOptions.root === 'lower') {
                trebleNotes = trebleNotes.filter(note => !note.startsWith(currentNotes[0])); // Remove root from treble
                bassNotes.push(`${currentNotes[0]}/${progressionOptions.lowerOctave}`); // Add root to bass
            }

            if(progressionOptions.third === 'both') {
                bassNotes.push(`${thirdNote}/${progressionOptions.lowerOctave}`); // Add third to bass
            }
            if(progressionOptions.fifth === 'both') {
                bassNotes.push(`${fifthNote}/${progressionOptions.lowerOctave}`); // Add fifth to bass
            }
            if(progressionOptions.seventh === 'both' && seventhNote) {
                bassNotes.push(`${seventhNote}/${progressionOptions.lowerOctave}`); // Add seventh to bass
            }
            if(progressionOptions.ninth === 'both' && ninthNote) {
                bassNotes.push(`${ninthNote}/${progressionOptions.lowerOctave}`); // Add ninth to bass
            }

            if (progressionOptions.bassLine === 'root') {
                bassNotes.push(`${currentNotes[0]}/${progressionOptions.lowerOctave}`); // Root note as whole note in bass
                // console.log(`Chord ${i + 1} bass notes:`, bassNotes);
            }
        }
        
        // console.log(`Chord ${i + 1} final - treble:`, trebleNotes, `bass:`, bassNotes);
        
        // Store the processed chord notes for voice leading processing
        allTrebleChords.push([...trebleNotes]);
        allBassChords.push([...bassNotes]);
    }
    if(progressionOptions.voicing === 'natural') {
        for(let i = 0; i < allTrebleChords.length; i++) {
            let currentTrebleNotes = allTrebleChords[i];
            let currentBassNotes = allBassChords[i];

            let currentTrebleMidi = currentTrebleNotes.map(note => {
                return noteToMidi(note) + 12;
            });
            let currentBassMidi = currentBassNotes.map(note => {
                return noteToMidi(note) + 12;
            });

            let currentTrebleNote = currentTrebleMidi[0];
            for(let j = 1; j < currentTrebleMidi.length; j++) {
                if(currentTrebleMidi[j] < currentTrebleNote) {
                    currentTrebleMidi[j] += 12;
                }
                currentTrebleNote = currentTrebleMidi[j];
            }
            currentTrebleNotes = currentTrebleMidi.map(midi => noteToName(midi));

            let currentBassNote = currentBassMidi[0];
            for(let j = 1; j < currentBassMidi.length; j++) {
                if(currentBassMidi[j] < currentBassNote) {
                    currentBassMidi[j] += 12;
                }   
                currentBassNote = currentBassMidi[j];
            }
            currentBassNotes = currentBassMidi.map(midi => noteToName(midi));


            // console.log('Current treble notes:', currentTrebleNotes, 'MIDI:', currentTrebleMidi);
            // console.log('Current bass notes:', currentBassNotes, 'MIDI:', currentBassMidi);

            allTrebleChords[i] = currentTrebleNotes;
            allBassChords[i] = currentBassNotes;
        }
    }
    
    // Apply voicing transformations based on the selected voicing option
    if (progressionOptions.voicing === 'leading') {
        // console.log('Applying leading voice logic...');
        // console.log('Before voice leading - treble:', allTrebleChords);
        // console.log('Before voice leading - bass:', allBassChords);
        
        allTrebleChords = applyLeadingVoice(allTrebleChords);
        allBassChords = applyLeadingVoice(allBassChords);
        
        // console.log('After voice leading - treble:', allTrebleChords);
        // console.log('After voice leading - bass:', allBassChords);
    }
    // Natural voicing is already handled above during chord processing
    
    // Now process the voice-led chords for display
    for (let i = 0; i < chordSymbols.length; i++) {
        const trebleNotes = allTrebleChords[i];
        const bassNotes = allBassChords[i];

        // Separate notes by staff, but keep track of which are chord notes vs bass line
        let actualTrebleChordNotes = [];  // Main chord notes on treble staff
        let actualTrebleBassNotes = [];   // Bass line notes that ended up on treble staff
        let actualBassChordNotes = [];    // Main chord notes on bass staff  
        let actualBassBassNotes = [];     // Bass line notes on bass staff
        
        let currentNoteArray = [];
        
        // Process treble notes (main chord notes)
        for (let note of trebleNotes) {
            if (note.includes('/')) {
                const [noteName, octave] = note.split('/');
                if (parseInt(octave) >= 4) {
                    actualTrebleChordNotes.push(note);
                } else {
                    actualBassChordNotes.push(note);
                }
            }
            currentNoteArray.push(note);
        }
        
        // Process bass notes (bass line notes)
        for (let note of bassNotes) {
            if (note.includes('/')) {   
                const [noteName, octave] = note.split('/');
                if (parseInt(octave) < 4) {
                    actualBassBassNotes.push(note);
                } else {
                    actualTrebleBassNotes.push(note);
                }
            }
            currentNoteArray.push(note);
        }
        
        noteArray.push({
            allNotes: currentNoteArray,
            trebleChordNotes: actualTrebleChordNotes,
            trebleBassNotes: actualTrebleBassNotes,
            bassChordNotes: actualBassChordNotes,
            bassBassNotes: actualBassBassNotes
        });

        // Combine notes for each staff, with chord notes first (for arpeggio) then bass notes
        const finalTrebleNotes = [...actualTrebleChordNotes, ...actualTrebleBassNotes];
        const finalBassNotes = [...actualBassChordNotes, ...actualBassBassNotes];

        chordSampleNotes.push({
            treble: finalTrebleNotes,
            bass: finalBassNotes,
            // Keep track of which notes are chord vs bass for arpeggio logic
            trebleChordCount: actualTrebleChordNotes.length,
            bassChordCount: actualBassChordNotes.length
        });
        console.log(`Chord ${i + 1} notes:`, chordSampleNotes[i]);
        // console.log(`Chord ${i + 1} treble notes:`, chordSampleNotes[i].treble);
        // console.log(`Chord ${i + 1} bass notes:`, chordSampleNotes[i].bass);
    }

    // Create sample notes for each chord (this is a simplified example)
    // In a full implementation, you would convert Roman numeral notation to actual chord notes
    for (let i = 0; i < numChords; i++) {
        const chordSymbol = chordSymbols[i];
        
        // Create simple placeholder notes (this would need proper chord conversion)
        // const sampleNotes = getSampleNotesForChord(chordSymbol, i);
        const sampleNotes = chordSampleNotes[i];
        let currentTrebleStave, currentBassStave;
        
        if (trebleStaves && bassStaves) {
            // Multiple staves
            currentTrebleStave = trebleStaves[i];
            currentBassStave = bassStaves[i];
        } else {
            // Single stave (only show first chord)
            if (i === 0) {
                currentTrebleStave = trebleStave;
                currentBassStave = bassStave;
            } else {
                break; // Skip additional chords for single stave
            }
        }
        
        // Determine if arpeggio mode should be applied (only to chord notes, not bass line)
        const trebleChordNotes = sampleNotes.treble.slice(0, sampleNotes.trebleChordCount || sampleNotes.treble.length);
        const trebleBassNotes = sampleNotes.treble.slice(sampleNotes.trebleChordCount || sampleNotes.treble.length);
        const shouldArpeggiate = progressionOptions.arpeggioMode && trebleChordNotes.length > 1;
        
        // Calculate durations
        const displayDuration = progressionOptions.noteDuration === 'whole' ? 'w' :
                               progressionOptions.noteDuration === 'half' ? 'h' :
                               progressionOptions.noteDuration === 'quarter' ? 'q' :
                               progressionOptions.noteDuration === 'eighth' ? '8' :
                               progressionOptions.noteDuration === 'sixteenth' ? '16' : 'w';
        
        // For arpeggio mode, calculate individual note duration based on number of notes
        let arpeggioDuration = displayDuration;
        let bassNoteDuration = displayDuration; // Bass notes should match total arpeggio duration
        
        if (shouldArpeggiate) {
            // Adjust duration for individual arpeggio notes
            const noteCount = trebleChordNotes.length;
            if (displayDuration === 'w' && noteCount <= 4) {
                arpeggioDuration = noteCount === 2 ? 'h' : noteCount === 3 ? 'q' : noteCount === 4 ? 'q' : 'q';
                // Bass note duration remains 'w' to match the total duration
            } else if (displayDuration === 'h' && noteCount <= 4) {
                arpeggioDuration = noteCount === 2 ? 'q' : noteCount === 3 ? '8' : noteCount === 4 ? '8' : '8';
                // Bass note duration remains 'h' to match the total duration
            } else {
                arpeggioDuration = '8'; // Default for complex arpeggios
                // Keep bass note duration as original for complex cases
            }
            bassNoteDuration = getFractionalLength(displayDuration, noteCount);
            console.log(`Arpeggio duration for ${trebleChordNotes.length} notes:`, arpeggioDuration);
            console.log(`Bass note duration for arpeggio: ${bassNoteDuration} for ${noteCount} notes`);
        }
        
        // Draw treble notes if any
        if (sampleNotes.treble.length > 0) {
            if (shouldArpeggiate) {
                // Arpeggio mode - create all notes with proper timing
                const arpeggioNotes = applyArpeggioOrdering(trebleChordNotes, progressionOptions.arpeggioDirection);
                
                let trebleVoice = new Voice({ 
                    num_beats: 4, 
                    beat_value: 4 
                });
                trebleVoice.setStrict(false);
                const trebleNoteObjects = [];
                
                // Add each arpeggio note
                for (let note of arpeggioNotes) {
                    trebleNoteObjects.push(new StaveNote({
                        keys: [note],
                        duration: arpeggioDuration
                    }));
                }
                
                // If there are bass line notes on treble staff, we need to handle them differently
                // For now, let's add them as a simultaneous chord with the first arpeggio note
                if (trebleBassNotes.length > 0 && trebleNoteObjects.length > 0) {
                    // Replace the first arpeggio note with a chord that includes bass notes
                    const firstArpeggioNote = arpeggioNotes[0];
                    const combinedKeys = [firstArpeggioNote, ...trebleBassNotes];
                    
                    trebleNoteObjects[0] = new StaveNote({
                        keys: combinedKeys,
                        duration: arpeggioDuration
                    });
                }
                
                // Add tickables and draw
                if (trebleNoteObjects.length > 0) {
                    trebleVoice.addTickables(trebleNoteObjects);
                    new Formatter().joinVoices([trebleVoice]).format([trebleVoice], displayWidth - 50);
                    trebleVoice.draw(context, currentTrebleStave);
                }
            } else {
                // Block chord mode - all notes together
                let trebleVoice = new Voice({ 
                    num_beats: 4, 
                    beat_value: 4 
                });
                trebleVoice.setStrict(false);
                const trebleNoteObjects = [];
                
                trebleNoteObjects.push(new StaveNote({
                    keys: sampleNotes.treble,
                    duration: displayDuration
                }));
                
                if (trebleNoteObjects.length > 0) {
                    trebleVoice.addTickables(trebleNoteObjects);
                    new Formatter().joinVoices([trebleVoice]).format([trebleVoice], displayWidth - 50);
                    trebleVoice.draw(context, currentTrebleStave);
                }
            }
        }
        
        // Draw bass notes if any
        // Bass notes are ALWAYS drawn as block chords, even in arpeggio mode
        if (sampleNotes.bass.length > 0) {
            // Bass line always uses block chord mode with duration matching the total arpeggio duration
            let bassVoice = new Voice({ num_beats: 4, beat_value: 4 });
            bassVoice.setStrict(false); // Allow for flexible durations
            const bassNoteObjects = [];
            
            // If bassNoteDuration contains a dot, add a dot to the note
            if (bassNoteDuration.includes('.')) {
                // Remove the dot for VexFlow duration, add Dot after
                const baseDuration = bassNoteDuration.replace('.', '');
                const bassNote = new StaveNote({
                    clef: "bass",
                    keys: sampleNotes.bass,
                    duration: baseDuration,
                    dots: 1
                });
                Dot.buildAndAttach([bassNote], {all: true});
                bassNoteObjects.push(bassNote);
            } else {
                // Single chord with the bass note duration (matches total arpeggio duration)
                bassNoteObjects.push(new StaveNote({
                    clef: "bass",
                    keys: sampleNotes.bass,
                    duration: bassNoteDuration
                }));
            }
            
            if (bassNoteObjects.length > 0) {
                bassVoice.addTickables(bassNoteObjects);
                new Formatter().joinVoices([bassVoice]).format([bassVoice], displayWidth - 50);
                bassVoice.draw(context, currentBassStave);
            }
        }
        
        // Add chord symbol as text
        if (currentTrebleStave) {
            let chordLabel = chordSymbol;
            
            // Add chord repeat indicator if chord repeat > 1
            if (progressionOptions.chordRepeat > 1) {
                chordLabel += ` (repeat ${progressionOptions.chordRepeat}x)`;
            }
            
            // Add arpeggio indicator
            if (progressionOptions.arpeggioMode) {
                const directionSymbol = {
                    'up': '↑',
                    'down': '↓', 
                    'random': '⟲',
                    'up-down': '↕',
                    'down-up': '↕'
                }[progressionOptions.arpeggioDirection] || '~';
                chordLabel += ` ${directionSymbol}`;
            }
            
            const text = new Vex.Flow.TextNote({
                text: chordLabel,
                font: {
                    family: "Arial",
                    size: 14,
                    weight: "bold"
                },
                duration: 'w',
                y_shift: -40
            })
            .setLine(0)
            .setStave(currentTrebleStave);

            let textVoice = new Voice({ num_beats: 4, beat_value: 4 });
            textVoice.setStrict(false); // Allow for flexible durations
            textVoice.addTickables([text]);
            
            new Formatter().joinVoices([textVoice]).format([textVoice], displayWidth - 50);
            text.setContext(context).draw();
        }
    }
    // outputNoteArray = noteArray; // Store the note array globally for further processing
    // drawNotes(outputDiv, outputNoteArray, false);
}

// Helper function to get sample notes for a chord symbol
// This is a simplified version - a full implementation would need proper Roman numeral parsing
function getSampleNotesForChord(chordSymbol, position) {
    // Simple mapping for common chord symbols to notes
    const chordMap = {
        'I': { treble: ['c/4', 'e/4', 'g/4'], bass: ['c/3'] },
        'ii': { treble: ['d/4', 'f/4', 'a/4'], bass: ['d/3'] },
        'iii': { treble: ['e/4', 'g/4', 'b/4'], bass: ['e/3'] },
        'IV': { treble: ['f/4', 'a/4', 'c/5'], bass: ['f/3'] },
        'V': { treble: ['g/4', 'b/4', 'd/5'], bass: ['g/3'] },
        'vi': { treble: ['a/4', 'c/5', 'e/5'], bass: ['a/3'] },
        'vii': { treble: ['b/4', 'd/5', 'f/5'], bass: ['b/3'] }
    };
    
    // Remove common modifiers and get base chord
    const baseChord = chordSymbol.replace(/[♭#b]+/g, '').replace(/[0-9o+]+/g, '').replace(/\//g, '');
    
    // Return sample notes or default
    return chordMap[baseChord] || { treble: ['c/4', 'e/4', 'g/4'], bass: ['c/3'] };
}

// Initialize the progression table, options panel, and staff display
createProgressionTable();
createProgressionOptionsPanel();
createProgressionStaffDisplay();

function numeralToChord(numeral, rootNote, scaleFamily, scaleIndex, scaleRoot, triads, seventhChords, ninthChords) {
    const numeral_ = numeral.trim();
    
    // Determine which chord array to use based on the global chord type setting
    let chordArray;
    switch (progressionOptions.chordType) {
        case 'triads':
            chordArray = triads;
            break;
        case 'seventh':
            chordArray = seventhChords;
            break;
        case 'ninth':
            chordArray = ninthChords;
            break;
        default:
            chordArray = triads; // fallback to triads
            break;
    }

    if(numeral === 'I' || numeral === 'i')
        return chordArray[0];
    else if(numeral === 'ii' || numeral === 'II')
        return chordArray[1];
    else if(numeral === 'iii' || numeral === 'III')
        return chordArray[2];
    else if(numeral === 'IV' || numeral === 'iv')
        return chordArray[3];
    else if(numeral === 'V' || numeral === 'v')
        return chordArray[4];
    else if(numeral === 'vi' || numeral === 'VI')
        return chordArray[5];
    else if(numeral === 'vii' || numeral === 'VII')
        return chordArray[6];
    else 
        throw new Error(`Unknown numeral: ${numeral}`);
}

function getFractionalLength(duration, noteCount) {
    let noteDurations = ['w', 'h', 'q', '8', '16'];
    let baseDuration = noteDurations.indexOf(duration);

    if(noteCount == 1) return noteDurations[baseDuration];
    if(noteCount == 2) return noteDurations[baseDuration];
    if(noteCount == 3) return noteDurations[baseDuration + 1]+ '.';
    if(noteCount == 4) return noteDurations[baseDuration];
    else throw new Error(`Unsupported note count: ${noteCount}`);
}

function getProgressionNotes(progressionName, scaleFamily, scaleIndex, rootNote){
    // console.log('getProgressionNotes called with:', progressionName, scaleFamily, scaleIndex, rootNote);

    progressionName = progressionName.trim();
    if (!chord_progressions[progressionName]) {
        console.error('Progression not found:', progressionName);
        return [];
    }
    let progression = chord_progressions[progressionName].progression;
    progression = progression.replace('-', ' ')
    // console.log('Parsed progression:', progression);

    let progressionNotes = [];
    let chords = progression.split(' ').filter(chord => chord.trim() !== '');
    // console.log('Chords in progression:', chords);

    // console.log(HeptatonicScales)

    let scale = HeptatonicScales[scaleFamily][scaleIndex - 1];

    // Generate chord arrays based on the selected chord type
    let identifiedChords_3 = identifySyntheticChords(scale, 3, rootNote);
    let identifiedChords_4 = identifySyntheticChords(scale, 4, rootNote);
    // let identifiedChords_5 = identifySyntheticChords(scale, 5, rootNote);

    var notes = [];
    
    for (let c = 0; c < chords.length; c++) {
        let chord = chords[c];
        chord = chord.trim();
        // console.log('Processing chord:', chord);
        
        // Raise an error if the chord contains a '/'
        if (chord.includes('/')) {
            throw new Error(`Chord "${chord}" contains a slash (/) which is not allowed.`);
        }
        notes.push(numeralToChord(chord, scale[c], scaleFamily, scaleIndex, rootNote, identifiedChords_3, identifiedChords_4, identifiedChords_4));
    }
    return notes;
}

// Test the progression functionality with primary scale/root
function testProgressionFunctionality() {
    const primaryScale = getPrimaryScale();
    const primaryRootNote = getPrimaryRootNote();
    
    if (primaryScale && primaryRootNote) {
        const [scaleFamily, scaleMode] = primaryScale.split('-');
        getProgressionNotes('50s progression', scaleFamily, scaleMode, primaryRootNote);
    }
}

// Convert progression noteArray format to outputNoteArray format
function convertProgressionToOutputFormat() {
    if (noteArray.length === 0) {
        console.log('No progression notes to convert');
        return [[], []]; // Return empty treble and bass arrays
    }
    
    const trebleBars = [];
    const bassBars = [];
    
    // Process each chord in the progression
    for (let i = 0; i < noteArray.length; i++) {
        const chordData = noteArray[i]; // Now an object with separated note types
        
        // Handle both old and new format for backward compatibility
        let trebleChordNotes, trebleBassNotes, bassChordNotes, bassBassNotes;
        
        if (typeof chordData === 'object' && chordData.trebleChordNotes) {
            // New format with separated note types
            trebleChordNotes = chordData.trebleChordNotes || [];
            trebleBassNotes = chordData.trebleBassNotes || [];
            bassChordNotes = chordData.bassChordNotes || [];
            bassBassNotes = chordData.bassBassNotes || [];
        } else {
            // Old format - fall back to simple octave separation
            const allNotes = Array.isArray(chordData) ? chordData : chordData.allNotes || [];
            trebleChordNotes = [];
            trebleBassNotes = [];
            bassChordNotes = [];
            bassBassNotes = [];
            
            for (let noteStr of allNotes) {
                if (noteStr.includes('/')) {
                    const [noteName, octave] = noteStr.split('/');
                    if (parseInt(octave) >= 4) {
                        trebleChordNotes.push(noteStr); // Assume all treble notes are chord notes
                    } else {
                        bassBassNotes.push(noteStr); // Assume all bass notes are bass line notes
                    }
                }
            }
        }
        
        // Combine notes for each staff
        const trebleNotes = [...trebleChordNotes, ...trebleBassNotes];
        const bassNotes = [...bassChordNotes, ...bassBassNotes];
        
        // Get the duration for display
        const displayDuration = progressionOptions.noteDuration === 'whole' ? 'w' :
                               progressionOptions.noteDuration === 'half' ? 'h' :
                               progressionOptions.noteDuration === 'quarter' ? 'q' :
                               progressionOptions.noteDuration === 'eighth' ? '8' :
                               progressionOptions.noteDuration === 'sixteenth' ? '16' : 'w';
        
        // Create a single bar with the chord at the selected duration
        let trebleBar = [];
        let bassBar = [];
        
        // Determine if we should arpeggiate (only chord notes, not bass line notes)
        const shouldArpeggiate = progressionOptions.arpeggioMode && trebleChordNotes.length > 1;
        
        if (shouldArpeggiate) {
            // Apply arpeggio only to chord notes
            const arpeggioTreble = applyArpeggioOrdering(trebleChordNotes, progressionOptions.arpeggioDirection);
            
            let arpeggioDuration = displayDuration; // Default to full duration for arpeggio
            // Adjust duration for individual arpeggio notes
            const noteCount = trebleChordNotes.length;
            if (displayDuration === 'w' && noteCount <= 4) {
                arpeggioDuration = noteCount === 2 ? 'h' : noteCount === 3 ? 'q' : noteCount === 4 ? 'q' : 'q';
                // Bass note duration remains 'w' to match the total duration
            } else if (displayDuration === 'h' && noteCount <= 4) {
                arpeggioDuration = noteCount === 2 ? 'q' : noteCount === 3 ? '8' : noteCount === 4 ? '8' : '8';
                // Bass note duration remains 'h' to match the total duration
            } else {
                arpeggioDuration = '8'; // Default for complex arpeggios
                // Keep bass note duration as original for complex cases
            }
            let bassNoteDuration = getFractionalLength(displayDuration, noteCount);
            console.log(`Arpeggio duration for ${trebleChordNotes.length} notes:`, arpeggioDuration);
            console.log(`Bass note duration for arpeggio: ${bassNoteDuration} for ${noteCount} notes`);

            for (let note of arpeggioTreble) {
                trebleBar.push({
                    "note": note,
                    "duration": arpeggioDuration
                });
            }
            
            // Add bass line notes that ended up on treble staff as sustained notes
            if (trebleBassNotes.length > 0) {
                trebleBar.push({
                    "note": trebleBassNotes.length === 1 ? trebleBassNotes[0] : trebleBassNotes,
                    "duration": bassNoteDuration, // Full duration to sustain through arpeggio
                    "isBassLine": true // Mark as bass line for potential different handling
                });
            }
            
            // let bassNoteDuration = getFractionalLength(displayDuration, bassNotes.length);
            console.log(`Bass note duration for arpeggio: ${bassNoteDuration} for ${arpeggioTreble.length} notes`);

            // Bass notes always remain as block chords with full duration
            if (bassNotes.length > 0) {
                bassBar.push({
                    "note": bassNotes.length === 1 ? bassNotes[0] : bassNotes,
                    "duration": bassNoteDuration // Full duration to match total arpeggio time
                });
            }
        } else {
            // Block chord mode - single chord with selected duration
            if (trebleNotes.length > 0) {
                trebleBar.push({
                    "note": trebleNotes.length === 1 ? trebleNotes[0] : trebleNotes,
                    "duration": displayDuration
                });
            }
            
            if (bassNotes.length > 0) {
                bassBar.push({
                    "note": bassNotes.length === 1 ? bassNotes[0] : bassNotes,
                    "duration": displayDuration
                });
            }
        }
        
        // Handle chord repeat - duplicate the entire bar the specified number of times
        for (let barRepeat = 0; barRepeat < progressionOptions.chordRepeat; barRepeat++) {
            trebleBars.push([...trebleBar]); // Create a copy of the bar
            bassBars.push([...bassBar]);     // Create a copy of the bar
        }
    }
    
    console.log(`Converted progression to output format with ${progressionOptions.chordRepeat} repeat(s):`, [trebleBars, bassBars]);
    return [trebleBars, bassBars];
}

// Add current progression to output grid
function addProgressionToOutput() {
    console.log('Adding progression to output grid');
    
    if (!window.outputDiv) {
        console.error('Output div not available');
        return;
    }
    
    if (!window.addDrawNotes) {
        console.error('addDrawNotes function not available. Make sure staves.js is loaded.');
        return;
    }
    
    const convertedProgression = convertProgressionToOutputFormat();
    if (convertedProgression[0].length === 0 && convertedProgression[1].length === 0) {
        console.log('No notes to add to output');
        return;
    }
    
    // Debug the format before sending to addDrawNotes
    console.log('Converted progression format check:', {
        trebleBars: convertedProgression[0],
        bassBars: convertedProgression[1],
        totalBars: convertedProgression[0].length
    });
    
    // Initialize outputNoteArray if it doesn't exist
    if (typeof window.outputNoteArray === 'undefined') {
        console.log('Initializing empty outputNoteArray');
        window.outputNoteArray = [[], []]; // [trebleBars, bassBars]
    }
    
    // Use the addDrawNotes function from staves.js
    window.addDrawNotes(window.outputDiv, convertedProgression, true);
    
    console.log('Successfully added progression to output grid');
}

// Replace output grid with current progression
function replaceOutputWithProgression() {
    console.log('Replacing output grid with progression');
    
    if (!window.outputDiv) {
        console.error('Output div not available');
        return;
    }
    
    if (!window.clearAllNotation || !window.addDrawNotes) {
        console.error('Notation functions not available. Make sure staves.js is loaded.');
        return;
    }
    
    // Clear existing notation first
    window.clearAllNotation(window.outputDiv);
    
    // Initialize outputNoteArray to empty state
    window.outputNoteArray = [[], []]; // [trebleBars, bassBars]
    
    // Get the progression to add
    const convertedProgression = convertProgressionToOutputFormat();
    if (convertedProgression[0].length === 0 && convertedProgression[1].length === 0) {
        console.log('No notes to replace output with');
        // Still need to redraw empty staves after clearing
        if (typeof window.drawNotes2 === 'function') {
            window.gridData = window.drawNotes2(window.outputDiv, window.outputNoteArray, false);
        }
        return;
    }
    
    // Debug the format before sending to addDrawNotes
    console.log('Converted progression format check for replace:', {
        trebleBars: convertedProgression[0],
        bassBars: convertedProgression[1],
        totalBars: convertedProgression[0].length
    });
    
    // Set the outputNoteArray to the new progression data
    // window.outputNoteArray[0] = convertedProgression[0];
    // window.outputNoteArray[1] = convertedProgression[1];
    
    // Redraw with the new data
    window.addDrawNotes(window.outputDiv, convertedProgression, true);
    // window.addDrawNotes(window.outputDiv, convertedProgression, true);

    // if (typeof window.drawNotes2 === 'function') {
    //     window.gridData = window.drawNotes2(window.outputDiv, convertedProgression, true);
    // } else {
    //     console.error('drawNotes2 function not available on window');
    //     return;
    // }
    
    console.log('Successfully replaced output grid with progression');
    
    // Call additional functions if they exist
    if (typeof window.highlightBothPositions === 'function') {
        window.highlightBothPositions();
    }
    if (typeof window.updateOutputText === 'function') {
        window.updateOutputText();
    }
}

// Function to refresh progression display when primary scale/root changes
function refreshProgressionDisplay() {
    // Only refresh if there is a selected progression and the staff display exists
    if (selectedProgression && document.getElementById('progressionStaffDiv')) {
        drawProgressionStaff();
    }
}

export {chord_progressions, selectedProgression, progressionOptions, createProgressionTable, createProgressionOptionsPanel, createProgressionStaffDisplay, drawProgressionStaff, addProgressionToOutput, replaceOutputWithProgression, refreshProgressionDisplay}