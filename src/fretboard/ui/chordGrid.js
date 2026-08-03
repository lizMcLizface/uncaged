// The "Chord Pattern Grid" (the 12-note x 12-chord-type button table, color
// coded for scale compatibility) and the chord-fingering-shape pipeline it
// shares with the Roman-numeral chord display: matching chordPatterns.js
// shapes to a chord, falling back to a generated "best-effort" grip, and the
// position-picker tab bar for choosing between them. Also home to the
// scale/chord-interval math (getSemitoneFromReference,
// getScaleIntervalEntries, deriveChordSuffix, getScaleDescriptor) used by
// both this grid and src/fretboard/ui/scalePositionGrid.js.
//
// getFretboard, showChordPatternOnFretboard, restoreFretboardState,
// playChordVoicing and getChordVoicingNotes are glue that stays in
// ../index.js (the src/fretboard/ barrel - called from src/index.js and
// src/progression/ too, not just from this grid) - imported back from
// there. This is the same safe two-way import shape as
// src/fretboard/ui/controls.js <-> ../index.js (see ARCHITECTURE.md §6.8):
// every cross-import here is only touched inside a function body invoked
// later, never at module top-level.
//
// Lifted from src/frets.js as part of REFACTOR_PLAN.md Phase 3, step 7/8
// (frets.js itself folded into ../index.js as the barrel in step 8/8).

import { processChord } from '../../theory/chords';
import { HeptatonicScales, getScaleNotes, getPrimaryScale, getPrimaryRootNote } from '../../scales';
import {
    noteToMidi as notationNoteToMidi,
    translateNotes as notationTranslateNotes,
    stripOctave as notationStripOctave,
    areEnharmonicEquivalent,
    noteArrayContains,
    normalizeNote
} from '../../theory/notation';
import { CHROMATIC } from '../../theory/notes';
import { fretboardState } from '../state';
import { addInteractiveEvent } from '../Fretboard';
import { assignFingers, selectGripFromPositions, classifyFingeringSource } from '../../chordFingering';
import {
    getFretboard,
    showChordPatternOnFretboard,
    restoreFretboardState,
    playChordVoicing,
    getChordVoicingNotes
} from '..';

export const SEMITONE_TO_SCALE_INTERVAL_LABEL = ['R', 'm2', 'M2', 'm3', 'M3', 'A3', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7'];
const MODE_DISPLAY_NAMES = ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'];

function normalizeIntervalLabel(label) {
    if (!label || label === '?') {
        return '';
    }
    return label === 'P1' ? 'R' : label;
}

/**
 * Analyze how well a chord fits within the current scale
 * @param {string} rootNote - The root note of the chord
 * @param {string} chordType - The type of chord
 * @returns {Object} Object with matchCount, totalNotes, matchPercentage, and color
 */
export function analyzeChordScaleCompatibility(rootNote, chordType) {
    try {
        // Get current scale information
        const primaryScale = getPrimaryScale();
        const scaleRootNote = getPrimaryRootNote();

        if (!primaryScale || !scaleRootNote) {
            return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' }; // Grey for no scale
        }

        // Get scale notes - check if HeptatonicScales is available
        const [family, mode] = primaryScale.split('-');
        if (!HeptatonicScales || !HeptatonicScales[family] || !HeptatonicScales[family][parseInt(mode, 10) - 1]) {
            // HeptatonicScales not available yet, return neutral grey
            return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' };
        }

        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
        const scaleNotes = getScaleNotes(scaleRootNote, intervals);

        // Translate scale notes to proper notation and remove octave information
        const translatedScaleNotes = notationTranslateNotes(scaleNotes);
        const scaleNoteNames = translatedScaleNotes.map(note => notationStripOctave(note));

        // Process the chord to get its notes
        const chordName = rootNote + chordType;
        const chordInfo = processChord(chordName);

        if (!chordInfo || !chordInfo.notes || !Array.isArray(chordInfo.notes)) {
            return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' };
        }

        // Translate chord notes to proper notation and remove octave information
        const translatedChordNotes = notationTranslateNotes(chordInfo.notes);
        const chordNotes = translatedChordNotes.map(note => notationStripOctave(note));

        // Check how many chord notes are in the scale using enharmonic matching
        const notesInScale = chordNotes.filter(note => noteArrayContains(scaleNoteNames, note));
        const matchCount = notesInScale.length;
        const totalNotes = chordNotes.length;
        const matchPercentage = Math.round((matchCount / totalNotes) * 100);

        // Determine color based on match
        let color;
        if (matchCount === 0) {
            color = '#9E9E9E'; // Grey for no notes in scale
        } else if (matchCount === totalNotes) {
            color = '#4A90E2'; // Blue for all notes in scale
        } else if (matchCount === totalNotes - 1) {
            color = '#9B59B6'; // Purple for all but one note in scale
        } else {
            color = '#F39C12'; // Orange for partial match
        }

        return { matchCount, totalNotes, matchPercentage, color };

    } catch (error) {
        // Silently return grey color for compatibility errors during initialization
        return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' };
    }
}

/**
 * Create chord button grid directly (avoiding circular dependency)
 */
export function createChordButtonGrid() {
    const chromaticNotes = CHROMATIC;
    const commonChordTypes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', 'm7b5'];

    let gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        margin: 20px auto;
        max-width: 600px;
        background: hsla(0, 0%, 24%, 1.00);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    gridContainer.id = 'chordButtonGridContainer';

    let gridLabel = document.createElement('h3');
    gridLabel.textContent = 'Chord Pattern Grid';
    gridLabel.style.cssText = `
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        color: #fff;
    `;

    let grid = document.createElement('table');
    grid.style.cssText = `
        border-collapse: collapse;
        margin: 0 auto;
        border: 2px solid #333;
        background: white;
    `;

    // Create header row with chord types
    let headerRow = document.createElement('tr');

    // Empty corner cell
    let cornerCell = document.createElement('th');
    cornerCell.style.cssText = `
        width: 30px;
        height: 30px;
        border: 1px solid #333;
        background: #2a2a2a;
        color: white;
        font-weight: bold;
        font-size: 10px;
        text-align: center;
        vertical-align: middle;
        padding: 0;
    `;
    headerRow.appendChild(cornerCell);

    // Add chord type header cells
    for (let chordType of commonChordTypes) {
        let cell = document.createElement('th');
        cell.style.cssText = `
            width: 30px;
            height: 30px;
            border: 1px solid #333;
            background: #2a2a2a;
            color: white;
            font-weight: bold;
            font-size: 8px;
            text-align: center;
            vertical-align: middle;
            padding: 0;
            writing-mode: vertical-rl;
            text-orientation: mixed;
        `;
        cell.textContent = chordType;
        headerRow.appendChild(cell);
    }

    grid.appendChild(headerRow);

    // Create rows for each chromatic note
    for (let note of chromaticNotes) {
        let row = document.createElement('tr');

        // Create note label cell
        let noteCell = document.createElement('td');
        noteCell.textContent = note;
        noteCell.style.cssText = `
            width: 30px;
            height: 30px;
            border: 1px solid #333;
            font-weight: bold;
            background: #383838;
            color: white;
            text-align: center;
            vertical-align: middle;
            font-size: 10px;
            padding: 0;
        `;
        row.appendChild(noteCell);

        // Create chord button cells - make the cells themselves clickable
        for (let chordType of commonChordTypes) {
            let cell = document.createElement('td');

            // Analyze chord-scale compatibility for color coding
            const compatibility = analyzeChordScaleCompatibility(note, chordType);

            cell.style.cssText = `
                width: 30px;
                height: 30px;
                border: 1px solid #333;
                text-align: center;
                vertical-align: middle;
                background: ${compatibility.color};
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                padding: 0;
                position: relative;
            `;

            // Add tooltip showing compatibility info
            if (compatibility.totalNotes > 0) {
                cell.title = `${note}${chordType}: ${compatibility.matchCount}/${compatibility.totalNotes} notes in scale (${compatibility.matchPercentage}%)`;
            } else {
                cell.title = `${note}${chordType}: No scale selected or chord analysis failed`;
            }

            // Store original color for hover effects
            cell.dataset.originalColor = compatibility.color;

            // Add hover and click functionality directly to the cell
            addInteractiveEvent(cell, 'enter', () => {
                // Lighten the background color for hover effect
                const originalColor = cell.dataset.originalColor;
                let hoverColor = originalColor;

                // Create a lighter version of the original color for hover
                if (originalColor === '#4A90E2') hoverColor = '#6BA6F0'; // Lighter blue
                else if (originalColor === '#9B59B6') hoverColor = '#B57BC6'; // Lighter purple
                else if (originalColor === '#F39C12') hoverColor = '#F5B041'; // Lighter orange
                else if (originalColor === '#9E9E9E') hoverColor = '#BDBDBD'; // Lighter grey

                cell.style.background = hoverColor;
                cell.style.transform = 'scale(1.1)';
                cell.style.zIndex = '10';

                // Show chord pattern on fretboard temporarily
                showChordPatternOnFretboard(note, chordType, true);
            });

            addInteractiveEvent(cell, 'leave', () => {
                cell.style.background = cell.dataset.originalColor;
                cell.style.transform = 'scale(1)';
                cell.style.zIndex = '1';

                // Restore previous fretboard state
                restoreFretboardState();
            });

            addInteractiveEvent(cell, 'click', () => {
                // Play the chord through the synth using the same fretboard
                // voicing shown on hover, rather than just toggling the
                // persistent display.
                const fretboard = getFretboard('fretNotPlaceholder');
                if (fretboard) {
                    playChordVoicing(getChordVoicingNotes(fretboard, note, chordType));
                }
            });

            row.appendChild(cell);
        }

        grid.appendChild(row);
    }

    gridContainer.appendChild(gridLabel);
    gridContainer.appendChild(grid);

    // Add color coding legend
    const legend = document.createElement('div');
    legend.style.cssText = `
        margin-top: 10px;
        padding: 8px;
        font-size: 11px;
        color: #fff;
        text-align: center;
        line-height: 1.4;
    `;
    legend.innerHTML = `
        <strong>Scale Compatibility Legend:</strong>
        <span style="background:#4A90E2; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">All notes</span>
        <span style="background:#9B59B6; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">All but one</span>
        <span style="background:#F39C12; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">Partial</span>
        <span style="background:#9E9E9E; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">No match</span>
    `;
    gridContainer.appendChild(legend);

    return gridContainer;
}

/**
 * Get the active scale notes with octave removed and duplicates removed.
 * @returns {Array<string>} Normalized scale notes
 */
export function getCurrentScaleNoteNames() {
    const primaryScale = getPrimaryScale();
    const scaleRootNote = getPrimaryRootNote();

    if (!primaryScale || !scaleRootNote) {
        return [];
    }

    const [family, mode] = primaryScale.split('-');
    const modeIndex = parseInt(mode, 10) - 1;

    if (!HeptatonicScales || !HeptatonicScales[family] || !HeptatonicScales[family][modeIndex]) {
        return [];
    }

    const intervals = HeptatonicScales[family][modeIndex].intervals;
    const scaleNotes = getScaleNotes(scaleRootNote, intervals);
    const translatedScaleNotes = notationTranslateNotes(scaleNotes);
    const noteNames = translatedScaleNotes.map(note => notationStripOctave(note));

    return [...new Set(noteNames)];
}

/**
 * Build ordered semitone/note data for the active scale from its root.
 * @param {Array<string>} scaleNotes
 * @param {string} rootNote
 * @returns {Array<{ note: string, semitone: number, intervalLabel: string }>}
 */
export function getScaleIntervalEntries(scaleNotes, rootNote) {
    const entries = [];
    const seen = new Set();

    for (const note of scaleNotes) {
        const semitone = getSemitoneFromReference(rootNote, note);
        if (seen.has(semitone)) {
            continue;
        }
        seen.add(semitone);
        entries.push({
            note,
            semitone,
            intervalLabel: SEMITONE_TO_SCALE_INTERVAL_LABEL[semitone]
        });
    }

    return entries;
}

/**
 * Derive a compact chord suffix from chord notes if it matches common qualities.
 * @param {string} chordRoot
 * @param {Array<string>} chordNotes
 * @returns {string} Suffix such as '', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', or '?'
 */
export function deriveChordSuffix(chordRoot, chordNotes) {
    if (!chordRoot || !Array.isArray(chordNotes) || chordNotes.length === 0) {
        return '?';
    }

    const uniqueSemitones = [...new Set(chordNotes.map(note => getSemitoneFromReference(chordRoot, note)))].sort((a, b) => a - b);
    const pattern = uniqueSemitones.join(',');

    const qualityMap = {
        '0,4,7': '',
        '0,3,7': 'm',
        '0,3,6': 'dim',
        '0,4,8': 'aug',
        '0,4,7,10': '7',
        '0,4,7,11': 'maj7',
        '0,3,7,10': 'm7',
        '0,3,6,10': 'm7b5',
        '0,3,6,9': 'dim7'
    };

    return qualityMap[pattern] !== undefined ? qualityMap[pattern] : '?';
}

/**
 * Build degree header label with optional chord name.
 * @param {string} roman
 * @param {string} chordRoot
 * @param {Array<string>} chordNotes
 * @returns {string}
 */
export function buildDegreeHeaderLabel(roman, chordRoot, chordNotes) {
    if (!fretboardState.scalePositionShowChordNames) {
        return roman;
    }

    const suffix = deriveChordSuffix(chordRoot, chordNotes);
    const fullChord = `${chordRoot}${suffix}`;
    // Keep the derived quality available from the selected root chord name.
    const derivedQuality = fullChord.replace(chordRoot, '');
    const displayChord = derivedQuality ? `${chordRoot}${derivedQuality}` : chordRoot;
    return `${roman}\n${displayChord}`;
}

/**
 * Build a readable scale descriptor from primary scale key.
 * @param {string|null} primaryScaleKey
 * @returns {string}
 */
export function getScaleDescriptor(primaryScaleKey) {
    if (!primaryScaleKey || typeof primaryScaleKey !== 'string') {
        return 'Unknown Scale';
    }

    const [familyRaw, modeRaw] = primaryScaleKey.split('-');
    const family = familyRaw || 'Unknown';
    const modeNumber = parseInt(modeRaw, 10);

    if (!Number.isFinite(modeNumber) || modeNumber < 1 || modeNumber > MODE_DISPLAY_NAMES.length) {
        return family;
    }

    return `${family} ${MODE_DISPLAY_NAMES[modeNumber - 1]}`;
}

/**
 * Get chromatic interval distance from a reference root.
 * @param {string} referenceRootNote - Root note name without octave
 * @param {string} targetNote - Target note name without octave
 * @returns {number} Semitone interval in [0, 11]
 */
export function getSemitoneFromReference(referenceRootNote, targetNote) {
    const referenceMidi = notationNoteToMidi(`${normalizeNote(referenceRootNote)}/4`);
    const targetMidi = notationNoteToMidi(`${normalizeNote(targetNote)}/4`);
    return ((targetMidi - referenceMidi) % 12 + 12) % 12;
}

/**
 * Update chord grid colors based on current scale
 */
export function updateChordGridColors() {
    const gridContainer = document.getElementById('chordButtonGridContainer');
    if (!gridContainer) {
        // Grid not ready yet, try again in a bit
        setTimeout(updateChordGridColors, 100);
        return;
    }

    const chromaticNotes = CHROMATIC;
    const commonChordTypes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', 'm7b5'];

    // Find all chord cells and update their colors
    const table = gridContainer.querySelector('table');
    if (!table) return;

    const rows = table.querySelectorAll('tr');

    // Skip header row (index 0), start from note rows (index 1)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const noteIndex = i - 1; // Adjust for header row
        const note = chromaticNotes[noteIndex];
        const cells = row.querySelectorAll('td');

        // Skip note label cell (index 0), start from chord cells (index 1)
        for (let j = 1; j < cells.length; j++) {
            const cell = cells[j];
            const chordTypeIndex = j - 1; // Adjust for note label cell
            const chordType = commonChordTypes[chordTypeIndex];

            // Analyze chord-scale compatibility for new color
            const compatibility = analyzeChordScaleCompatibility(note, chordType);

            // Update cell color and tooltip
            cell.style.background = compatibility.color;
            cell.dataset.originalColor = compatibility.color;

            if (compatibility.totalNotes > 0) {
                cell.title = `${note}${chordType}: ${compatibility.matchCount}/${compatibility.totalNotes} notes in scale (${compatibility.matchPercentage}%)`;
            } else {
                cell.title = `${note}${chordType}: No scale selected or chord analysis failed`;
            }
        }
    }
}

/**
 * Build the note-name -> interval-label map used to label best-effort grip positions.
 * @param {Fretboard} fretboard
 * @param {Array<string>} chordNotes
 * @param {Array<string>} intervalLabels
 * @returns {Object}
 */
export function buildIntervalLabelMap(fretboard, chordNotes, intervalLabels) {
    const map = {};
    chordNotes.forEach((note, index) => {
        const noteName = fretboard.extractNoteName(note);
        map[noteName] = normalizeIntervalLabel(intervalLabels[index]);
    });
    return map;
}

/**
 * Find playable shapes for a chord: known chordPatterns.js shapes first
 * (sorted by lowest fret, "predefined"), falling back to one generated
 * shape ("best-effort") when no known pattern matches.
 * @param {Fretboard} fretboard
 * @param {Array<string>} chordNotes
 * @param {string} rootNote
 * @param {Object} intervalLabelMap - noteName -> interval label
 * @param {Array<string>|null} specificPatterns
 * @returns {Array} shapes: {source, label, patternName, positions}
 */
export function buildFingeringShapes(fretboard, chordNotes, rootNote, intervalLabelMap, specificPatterns) {
    const rootNoteName = fretboard.extractNoteName(rootNote);
    const matches = fretboard.findChordPatternMatches(chordNotes, rootNote, specificPatterns || null);
    const sortedMatches = matches.slice().sort((a, b) => {
        const minFretA = Math.min(...a.positions.map(pos => pos.fret));
        const minFretB = Math.min(...b.positions.map(pos => pos.fret));
        return minFretA - minFretB;
    });

    const shapes = sortedMatches.map(match => {
        const minFret = Math.min(...match.positions.map(pos => pos.fret));
        const positions = match.positions.map((pos, index) => ({
            string: pos.string,
            fret: pos.fret,
            note: match.patternNotes[index],
            intervalLabel: pos.label,
            isRoot: pos.label === 'R' || areEnharmonicEquivalent(match.patternNotes[index], rootNoteName)
        }));
        assignFingers(positions);
        return {
            source: classifyFingeringSource(match),
            label: minFret === 0 ? 'Open' : `Pos ${minFret}`,
            patternName: match.patternName,
            positions
        };
    });

    if (shapes.length === 0) {
        const allPositions = [];
        chordNotes.forEach(note => {
            const noteName = fretboard.extractNoteName(note);
            fretboard.findNotePositions(noteName).forEach(pos => {
                allPositions.push({
                    string: pos.string,
                    fret: pos.fret,
                    note: noteName,
                    intervalLabel: (intervalLabelMap && intervalLabelMap[noteName]) || '',
                    isRoot: areEnharmonicEquivalent(noteName, rootNoteName)
                });
            });
        });

        const grip = selectGripFromPositions(allPositions, 0);
        if (grip.length > 0) {
            assignFingers(grip);
            shapes.push({
                source: classifyFingeringSource(null),
                label: 'Best Effort',
                patternName: null,
                positions: grip
            });
        }
    }

    return shapes;
}

/**
 * Compute the text label to show on a fingering marker for the given label mode.
 * @param {Object} position
 * @param {'note'|'interval'|'finger'} labelMode
 * @returns {string}
 */
export function getFingeringMarkerLabel(position, labelMode) {
    if (labelMode === 'finger') {
        if (position.finger === null || position.finger === undefined) {
            return '?';
        }
        return position.finger === 0 ? 'O' : String(position.finger);
    }
    if (labelMode === 'interval' && position.intervalLabel) {
        return position.intervalLabel;
    }
    return position.note || position.intervalLabel || '';
}

/**
 * Render a single chord shape's positions on the fretboard, styled to
 * distinguish predefined (known chordPatterns.js) shapes from best-effort
 * generated ones (solid vs. dashed marker border).
 * @param {Fretboard} fretboard
 * @param {Object} shape
 * @param {'note'|'interval'|'finger'} labelMode
 */
export function renderFingeringShape(fretboard, shape, labelMode) {
    fretboard.clearMarkers();
    fretboard.clearChordLines();

    if (!shape || !Array.isArray(shape.positions)) {
        return;
    }

    const isPredefined = shape.source === 'predefined';
    const colorMap = ['#ff4444', '#ffcc44', '#44ff44', '#4444ff'];

    shape.positions.forEach((position, index) => {
        fretboard.markFret(position.string, position.fret, {
            backgroundColor: '#ffffff',
            borderColor: colorMap[index % colorMap.length],
            borderWidth: position.isRoot ? 4 : 3,
            borderStyle: isPredefined ? 'solid' : 'dashed',
            textColor: '#333333',
            size: position.isRoot ? 30 : 26,
            label: getFingeringMarkerLabel(position, labelMode),
            isRoot: position.isRoot,
            useCustomStyle: true,
            disableAnimation: true
        });
    });
}

/**
 * Clear the fingering shape state and hide the position-picker tab bar,
 * used whenever the fretboard stops showing a specific chord (scale view, clear).
 */
export function clearFingeringTabs() {
    fretboardState.chordFingeringShapes = [];
    fretboardState.selectedFingeringTabIndex = 0;
    const container = document.getElementById('chord-fingering-tabs');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

/**
 * Build/update the position-picker tab bar for the currently displayed chord.
 * @param {Fretboard} fretboard
 * @param {'note'|'interval'|'finger'} labelMode
 */
export function renderFingeringTabs(fretboard, labelMode) {
    const container = document.getElementById('chord-fingering-tabs');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!fretboardState.chordFingeringShapes.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    const legendLabel = document.createElement('span');
    legendLabel.style.cssText = `
        font-size: 10px;
        color: #ccc;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-right: 4px;
    `;
    legendLabel.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:3px;">
            <span style="width:8px;height:8px;border-radius:50%;border:1px solid #ccc;display:inline-block;"></span>
            Known shape
        </span>
        <span style="display:inline-flex;align-items:center;gap:3px;">
            <span style="width:8px;height:8px;border-radius:50%;border:1px dashed #ccc;display:inline-block;"></span>
            Best effort
        </span>
    `;
    container.appendChild(legendLabel);

    fretboardState.chordFingeringShapes.forEach((shape, index) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = shape.label;
        tab.title = shape.source === 'predefined' ? `Known shape (${shape.patternName})` : 'Best-effort generated shape';
        const isActive = index === fretboardState.selectedFingeringTabIndex;
        tab.style.cssText = `
            padding: 4px 10px;
            font-size: 11px;
            border-radius: 4px;
            cursor: pointer;
            border: 1px ${shape.source === 'predefined' ? 'solid' : 'dashed'} ${isActive ? '#ffffff' : '#777'};
            background: ${isActive ? '#0056b3' : 'rgba(255,255,255,0.08)'};
            color: #fff;
        `;
        tab.addEventListener('click', () => {
            fretboardState.selectedFingeringTabIndex = index;
            renderFingeringShape(fretboard, fretboardState.chordFingeringShapes[index], labelMode);
            renderFingeringTabs(fretboard, labelMode);
        });
        container.appendChild(tab);
    });
}
