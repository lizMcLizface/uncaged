// The "Scale Position Grid" tab: one movable mini-fretboard pattern per
// (root string x scale degree) cell, the Focus Selector matrix that toggles
// which cells are shown, and the per-cell rendering options (pattern/dot
// size, fret-label mode, note shapes, chord-name headers, etc.) that live on
// fretboardState. Depends on src/fretboard/ui/chordGrid.js for the
// scale/chord-interval math (getSemitoneFromReference, getScaleIntervalEntries,
// deriveChordSuffix via buildDegreeHeaderLabel, getScaleDescriptor,
// getFingeringMarkerLabel) and the SEMITONE_TO_SCALE_INTERVAL_LABEL table -
// this module never calls back into chordGrid.js's own UI (the Chord
// Pattern Grid button table), so the dependency runs one way, not a cycle.
//
// Lifted from src/frets.js as part of REFACTOR_PLAN.md Phase 3, step 8/8.

import {
    noteToMidi as notationNoteToMidi,
    midiToNote as notationMidiToNote,
    stripOctave as notationStripOctave,
    areEnharmonicEquivalent,
    noteArrayContains,
    normalizeNote
} from '../../theory/notation';
import { getIntervalColor } from '../../theory/intervals';
import { getPrimaryScale, getPrimaryRootNote } from '../../scales';
import { assignFingers, selectGripFromPositions } from '../../chordFingering';
import { fretboardState, persistScalePositionGridSettings } from '../state';
import { FRET_COUNT } from '../Fretboard';
import { createNoteShapeMarker } from '../markers';
import {
    getSemitoneFromReference,
    getFingeringMarkerLabel,
    getCurrentScaleNoteNames,
    getScaleIntervalEntries,
    getScaleDescriptor,
    buildDegreeHeaderLabel,
    SEMITONE_TO_SCALE_INTERVAL_LABEL
} from './chordGrid';

const SCALE_POSITION_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const MINI_SCALE_FRET_COUNT = 6;
const GENERIC_ROOT_DISPLAY_COLUMN = 1;
const SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET = 0;

const SCALE_POSITION_STACK_SIZES = { dyad: 2, triad: 3, tetrad: 4 };

const NOTE_SHAPE_TYPES = ['circle', 'square', 'diamond', 'triangle-up', 'triangle-down', 'pentagon', 'hexagon', 'star', 'cross', 'plus', 'triangle-right', 'triangle-left'];

/**
 * Find the first matching fret at or above a minimum fret for a row root note.
 * @param {number} rowStringIndex - String index (into fretboardState.MINI_SCALE_STRING_TUNING) used as the row anchor
 * @param {string} rowScaleRootNote - Scale root note used to anchor the row
 * @param {number} minFret - Minimum target fret
 * @returns {number|null} Absolute fret number or null if not found in range
 */
export function findRowRootAbsoluteFret(rowStringIndex, rowScaleRootNote, minFret = SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET) {
    const anchorIndex = rowStringIndex;
    const anchorOpenMidi = notationNoteToMidi(fretboardState.MINI_SCALE_STRING_TUNING[anchorIndex]);
    const rootPitchClass = ((notationNoteToMidi(`${normalizeNote(rowScaleRootNote)}/4`) % 12) + 12) % 12;

    for (let fret = Math.max(0, minFret); fret <= FRET_COUNT; fret++) {
        const pitchClass = ((anchorOpenMidi + fret) % 12 + 12) % 12;
        if (pitchClass === rootPitchClass) {
            return fret;
        }
    }

    for (let fret = 0; fret <= FRET_COUNT; fret++) {
        const pitchClass = ((anchorOpenMidi + fret) % 12 + 12) % 12;
        if (pitchClass === rootPitchClass) {
            return fret;
        }
    }

    return null;
}

/**
 * Convert display column index to absolute fret for the row-generic board.
 * @param {number} rowRootAbsoluteFret - Absolute fret where row root is anchored
 * @param {number} displayColumn - Display column index from 0..MINI_SCALE_FRET_COUNT
 * @returns {number}
 */
export function getAbsoluteFretForDisplayColumn(rowRootAbsoluteFret, displayColumn) {
    return rowRootAbsoluteFret + (displayColumn - GENERIC_ROOT_DISPLAY_COLUMN);
}

/**
 * Create one mini fretboard used inside each scale position grid cell.
 * @param {Array<string>} scaleNoteNames - Full active scale notes
 * @param {Array<string>} displayedNotes - Notes shown in this specific cell
 * @param {string} referenceRootNote - Reference root used for interval coloring
 * @param {number} rowStringIndex - Target row's string index (into fretboardState.MINI_SCALE_STRING_TUNING)
 * @param {string} rowScaleRootNote - Scale root used to anchor row-generic fret layout
 * @param {boolean} showOnlyDisplayedNotes - If true, only notes from displayedNotes are rendered
 * @param {boolean} showRelativeFretLabels - If true, show R/-1/+1 labels under fret columns
 * @returns {HTMLElement} Mini fretboard element
 */
export function shadeColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = Math.min(255, Math.max(0, R + (R * percent / 100)));
    G = Math.min(255, Math.max(0, G + (G * percent / 100)));
    B = Math.min(255, Math.max(0, B + (B * percent / 100)));
    R = Math.round(R);
    G = Math.round(G);
    B = Math.round(B);

    // console.log(`Shading color ${color} by ${percent}% results in R:${R}, G:${G}, B:${B}`);

    const newColor = `#${R.toString(16).padStart(2, '0')}${G.toString(16).padStart(2, '0')}${B.toString(16).padStart(2, '0')}`;
    return newColor;
}

/**
 * Pick black or white text so it stays legible against a given background
 * color (e.g. white text on a bright green/yellow interval dot is unreadable).
 * @param {string} hexColor - '#rrggbb'
 * @returns {'#000000'|'#ffffff'}
 */
export function getContrastTextColor(hexColor) {
    if (typeof hexColor !== 'string' || hexColor.length < 7) {
        return '#ffffff';
    }
    const r = parseInt(hexColor.substring(1, 3), 16);
    const g = parseInt(hexColor.substring(3, 5), 16);
    const b = parseInt(hexColor.substring(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
}

export function createScalePositionMiniFretboard(
    scaleNoteNames,
    displayedNotes,
    referenceRootNote,
    rowStringIndex,
    rowScaleRootNote,
    showOnlyDisplayedNotes = false,
    patternScale = fretboardState.scalePositionPatternScale,
    showRelativeFretLabels = true,
    showAbsoluteFretLabels = fretboardState.scalePositionUseAbsoluteFretLabels
) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const width = Math.round(128 * patternScale);
    const startX = Math.round(10 * patternScale);
    const startY = Math.round(10 * patternScale);
    const fretGap = 18 * patternScale;
    const stringGap = 12 * patternScale;
    // Height scales with the number of strings on the active instrument (e.g.
    // 4-string bass vs 8-string guitar) instead of a fixed value tuned for
    // 6-string guitar, which made bass boards look squashed-tall and extended
    // range boards look cramped.
    const stringsSpan = (fretboardState.MINI_SCALE_STRING_TUNING.length - 1) * stringGap;
    const bottomMargin = showRelativeFretLabels ? (22 * patternScale) : (10 * patternScale);
    const height = Math.round(startY + stringsSpan + bottomMargin);

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.cssText = `
        background: rgba(0,0,0,0.22);
        border: 1px solid #505050;
        border-radius: 4px;
    `;

    for (let fret = 0; fret <= MINI_SCALE_FRET_COUNT; fret++) {
        const x = startX + fret * fretGap;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x));
        line.setAttribute('y1', String(startY));
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(startY + (fretboardState.MINI_SCALE_STRING_TUNING.length - 1) * stringGap));
        line.setAttribute('stroke', '#6c6c6c');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }

    for (let stringIndex = 0; stringIndex < fretboardState.MINI_SCALE_STRING_TUNING.length; stringIndex++) {
        const y = startY + stringIndex * stringGap;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(startX));
        line.setAttribute('y1', String(y));
        line.setAttribute('x2', String(startX + MINI_SCALE_FRET_COUNT * fretGap));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', '#8a8a8a');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }

    const scaleArray = Array.isArray(scaleNoteNames) ? scaleNoteNames : [];
    const displayedArray = Array.isArray(displayedNotes) ? displayedNotes : [];
    const rowRootAbsoluteFret = findRowRootAbsoluteFret(rowStringIndex, rowScaleRootNote, SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET);
    const colorReferenceRoot = fretboardState.scalePositionKeepColorConstant ? rowScaleRootNote : referenceRootNote;
    const shapeReferenceRoot = fretboardState.scalePositionKeepShapeConstant ? rowScaleRootNote : referenceRootNote;

    if (rowRootAbsoluteFret === null) {
        wrapper.appendChild(svg);
        return wrapper;
    }

    const candidates = [];

    for (let stringIndex = 0; stringIndex < fretboardState.MINI_SCALE_STRING_TUNING.length; stringIndex++) {
        const openMidi = notationNoteToMidi(fretboardState.MINI_SCALE_STRING_TUNING[stringIndex]);

        for (let displayColumn = 0; displayColumn <= MINI_SCALE_FRET_COUNT; displayColumn++) {
            const absoluteFret = getAbsoluteFretForDisplayColumn(rowRootAbsoluteFret, displayColumn);
            if (absoluteFret < -1) {
                continue;
            }
            const midi = openMidi + absoluteFret;
            const noteName = notationStripOctave(notationMidiToNote(midi));

            const isInScale = noteArrayContains(scaleArray, noteName);
            const isDisplayed = noteArrayContains(displayedArray, noteName);

            if (!isInScale) {
                continue;
            }

            if (showOnlyDisplayedNotes && !isDisplayed) {
                continue;
            }

            const x = startX + displayColumn * fretGap;
            const y = startY + stringIndex * stringGap;
            const isRoot = areEnharmonicEquivalent(noteName, referenceRootNote);
            const isTargetRootString = stringIndex === rowStringIndex;
            const colorSemitone = getSemitoneFromReference(colorReferenceRoot, noteName);
            const shapeSemitone = getSemitoneFromReference(shapeReferenceRoot, noteName);
            let intervalColor = getIntervalColor(colorSemitone);
            if(fretboardState.scalePositionDarkDuplicate){
                // If the note is on an x-position of 4 or higher, darken the color to indicate it's a duplicate note in the scale position grid.
                if(displayColumn >= 6 && stringIndex !== 2){
                    intervalColor = shadeColor(intervalColor, -70);
                }
                else if(displayColumn >= 5 && stringIndex === 2){
                    intervalColor = shadeColor(intervalColor, -70);
                }
                if(displayColumn === 0){
                    intervalColor = shadeColor(intervalColor, -70);
                }
            }

            const baseRadius = isRoot ? 3.4 : 2.9;
            const radius = baseRadius * fretboardState.scalePositionDotScale;
            const shapeType = fretboardState.scalePositionUseNoteShapes
                ? NOTE_SHAPE_TYPES[shapeSemitone % NOTE_SHAPE_TYPES.length]
                : 'circle';

            candidates.push({
                string: stringIndex,
                fret: absoluteFret,
                x,
                y,
                radius,
                shapeType,
                noteName,
                note: noteName,
                isRoot,
                isTargetRootString,
                intervalColor,
                intervalLabel: SEMITONE_TO_SCALE_INTERVAL_LABEL[getSemitoneFromReference(referenceRootNote, noteName)]
            });
        }
    }

    // For chord cells (not the full-scale reference), pick one playable grip
    // (one dot per string, nearest to the row's root column) and give it a
    // finger number / label, distinguishing it from other same-chord dots
    // that fall in this window but aren't part of that specific grip.
    let gripMembers = null;
    if (showOnlyDisplayedNotes && candidates.length > 0) {
        const grip = selectGripFromPositions(candidates, rowRootAbsoluteFret);
        assignFingers(grip);
        gripMembers = new Set(grip);

        if (fretboardState.scalePositionShowGripLines && grip.length > 1) {
            const orderedGrip = grip.slice().sort((a, b) => a.string - b.string);
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('points', orderedGrip.map(c => `${c.x},${c.y}`).join(' '));
            polyline.setAttribute('fill', 'none');
            polyline.setAttribute('stroke', 'rgba(255,255,255,0.65)');
            polyline.setAttribute('stroke-width', String(Math.max(1, 1.4 * fretboardState.scalePositionDotScale)));
            polyline.setAttribute('stroke-linecap', 'round');
            polyline.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(polyline);
        }
    }

    candidates.forEach(candidate => {
        const isGripMember = gripMembers ? gripMembers.has(candidate) : false;
        const marker = createNoteShapeMarker(
            candidate.x,
            candidate.y,
            candidate.radius,
            candidate.shapeType,
            candidate.intervalColor,
            candidate.isRoot && candidate.isTargetRootString ? '#ffffff' : 'rgba(0,0,0,0.5)',
            candidate.isRoot && candidate.isTargetRootString ? 1 : 0.5,
            isGripMember
        );
        svg.appendChild(marker);

        if (fretboardState.scalePositionAllLabelsMode !== 'none') {
            // Show a single label (note name or interval) on every rendered
            // dot - chord cells and the full scale reference column alike -
            // independent of the picked grip.
            const allLabelText = fretboardState.scalePositionAllLabelsMode === 'interval' ? candidate.intervalLabel : candidate.noteName;
            if (allLabelText) {
                const allLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                allLabel.setAttribute('x', String(candidate.x));
                allLabel.setAttribute('y', String(candidate.y));
                allLabel.setAttribute('text-anchor', 'middle');
                allLabel.setAttribute('dominant-baseline', 'central');
                allLabel.setAttribute('fill', getContrastTextColor(candidate.intervalColor));
                allLabel.setAttribute('font-size', String(Math.max(6, Math.round(candidate.radius * 1.1))));
                allLabel.setAttribute('font-family', 'monospace');
                allLabel.setAttribute('font-weight', 'bold');
                allLabel.textContent = allLabelText;
                svg.appendChild(allLabel);
            }
        } else if (isGripMember && fretboardState.scalePositionLabelMode !== 'none') {
            const labelText = getFingeringMarkerLabel(candidate, fretboardState.scalePositionLabelMode);
            if (labelText) {
                const gripLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                gripLabel.setAttribute('x', String(candidate.x));
                gripLabel.setAttribute('y', String(candidate.y));
                gripLabel.setAttribute('text-anchor', 'middle');
                gripLabel.setAttribute('dominant-baseline', 'central');
                gripLabel.setAttribute('fill', getContrastTextColor(candidate.intervalColor));
                gripLabel.setAttribute('font-size', String(Math.max(6, Math.round(candidate.radius * 1.1))));
                gripLabel.setAttribute('font-family', 'monospace');
                gripLabel.setAttribute('font-weight', 'bold');
                gripLabel.textContent = labelText;
                svg.appendChild(gripLabel);
            }
        }
    });

    if (showRelativeFretLabels) {
        const labelY = startY + (fretboardState.MINI_SCALE_STRING_TUNING.length - 1) * stringGap + (12 * patternScale);
        for (let displayColumn = 0; displayColumn <= MINI_SCALE_FRET_COUNT; displayColumn++) {
            const x = startX + displayColumn * fretGap;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', String(x));
            text.setAttribute('y', String(labelY));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#d6d6d6');
            text.setAttribute('font-size', String(Math.max(8, Math.round(8 * patternScale))));
            text.setAttribute('font-family', 'monospace');

            if (showAbsoluteFretLabels) {
                const absoluteFret = getAbsoluteFretForDisplayColumn(rowRootAbsoluteFret, displayColumn);
                text.textContent = String(absoluteFret);
            } else {
                const delta = displayColumn - GENERIC_ROOT_DISPLAY_COLUMN;
                text.textContent = delta === 0 ? 'R' : (delta > 0 ? `+${delta}` : String(delta));
            }

            svg.appendChild(text);
        }
    }

    wrapper.appendChild(svg);
    return wrapper;
}

/**
 * Build the key used to track visibility of a scale position grid cell.
 * colIndex is -1 for the full-scale reference column, 0..N-1 for chord/degree columns.
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {string}
 */
export function scalePositionCellKey(rowIndex, colIndex) {
    return `${rowIndex}:${colIndex}`;
}

export function isScalePositionCellVisible(rowIndex, colIndex) {
    return !fretboardState.scalePositionHiddenCells.has(scalePositionCellKey(rowIndex, colIndex));
}

export function setScalePositionCellVisible(rowIndex, colIndex, visible) {
    const key = scalePositionCellKey(rowIndex, colIndex);
    if (visible) {
        fretboardState.scalePositionHiddenCells.delete(key);
    } else {
        fretboardState.scalePositionHiddenCells.add(key);
    }
}

export function toggleScalePositionCell(rowIndex, colIndex) {
    setScalePositionCellVisible(rowIndex, colIndex, !isScalePositionCellVisible(rowIndex, colIndex));
}

export function isScalePositionRowFullyVisible(rowIndex, columnCount) {
    for (let col = -1; col < columnCount; col++) {
        if (!isScalePositionCellVisible(rowIndex, col)) {
            return false;
        }
    }
    return true;
}

export function isScalePositionRowFullyHidden(rowIndex, columnCount) {
    for (let col = -1; col < columnCount; col++) {
        if (isScalePositionCellVisible(rowIndex, col)) {
            return false;
        }
    }
    return true;
}

export function isScalePositionColumnFullyVisible(colIndex, rowCount) {
    for (let row = 0; row < rowCount; row++) {
        if (!isScalePositionCellVisible(row, colIndex)) {
            return false;
        }
    }
    return true;
}

export function isScalePositionColumnFullyHidden(colIndex, rowCount) {
    for (let row = 0; row < rowCount; row++) {
        if (isScalePositionCellVisible(row, colIndex)) {
            return false;
        }
    }
    return true;
}

export function toggleScalePositionRow(rowIndex, columnCount) {
    const makeVisible = !isScalePositionRowFullyVisible(rowIndex, columnCount);
    for (let col = -1; col < columnCount; col++) {
        setScalePositionCellVisible(rowIndex, col, makeVisible);
    }
}

export function toggleScalePositionColumn(colIndex, rowCount) {
    const makeVisible = !isScalePositionColumnFullyVisible(colIndex, rowCount);
    for (let row = 0; row < rowCount; row++) {
        setScalePositionCellVisible(row, colIndex, makeVisible);
    }
}

export function toggleScalePositionAllCells(rowCount, columnCount) {
    let allVisible = true;
    outer:
    for (let row = 0; row < rowCount; row++) {
        for (let col = -1; col < columnCount; col++) {
            if (!isScalePositionCellVisible(row, col)) {
                allVisible = false;
                break outer;
            }
        }
    }
    const makeVisible = !allVisible;
    for (let row = 0; row < rowCount; row++) {
        for (let col = -1; col < columnCount; col++) {
            setScalePositionCellVisible(row, col, makeVisible);
        }
    }
}

/**
 * Style a single cell of the compact focus-selector matrix.
 * @param {HTMLElement} el
 * @param {boolean} visible
 * @param {boolean} isHeader
 */
export function styleScalePositionFocusCell(el, visible, isHeader) {
    el.style.cssText = `
        border: 1px solid #444;
        width: 22px;
        height: 22px;
        min-width: 22px;
        font-size: 9px;
        text-align: center;
        cursor: pointer;
        user-select: none;
        padding: 0;
        color: ${visible ? '#fff' : '#888'};
        background: ${isHeader ? (visible ? '#454545' : '#242424') : (visible ? '#3f8f5f' : '#2a2a2a')};
        font-weight: ${isHeader ? 'bold' : 'normal'};
    `;
}

/**
 * Build the compact matrix that lets the user pick which (root, chord) cells
 * of the scale position grid should be shown, to reduce visual clutter.
 * @param {number} columnCount
 * @returns {HTMLElement}
 */
export function buildScalePositionFocusMatrix(columnCount) {
    const rowCount = fretboardState.SCALE_POSITION_ROW_STRINGS.length;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        margin: 0 auto 12px auto;
        width: fit-content;
        text-align: center;
    `;

    const title = document.createElement('div');
    title.textContent = 'Focus Selector';
    title.style.cssText = `
        color: #f0f0f0;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 2px;
    `;
    wrapper.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = 'Click a header to toggle its whole row/column, the corner to toggle everything, or a cell to toggle it alone.';
    hint.style.cssText = `
        color: #a8a8a8;
        font-size: 9px;
        margin-bottom: 4px;
        max-width: 720px;
    `;
    wrapper.appendChild(hint);

    const focusTable = document.createElement('table');
    focusTable.style.cssText = `
        border-collapse: collapse;
        margin: 0 auto;
    `;

    const headerRow = document.createElement('tr');

    const corner = document.createElement('th');
    corner.textContent = 'All';
    corner.title = 'Toggle all rows and columns';
    styleScalePositionFocusCell(corner, true, true);
    corner.addEventListener('click', () => {
        toggleScalePositionAllCells(rowCount, columnCount);
        renderScalePositionGrid();
    });
    headerRow.appendChild(corner);

    const scaleColHeader = document.createElement('th');
    scaleColHeader.textContent = 'Sc';
    scaleColHeader.title = 'Toggle the full-scale reference column';
    styleScalePositionFocusCell(scaleColHeader, isScalePositionColumnFullyVisible(-1, rowCount), true);
    scaleColHeader.addEventListener('click', () => {
        toggleScalePositionColumn(-1, rowCount);
        renderScalePositionGrid();
    });
    headerRow.appendChild(scaleColHeader);

    for (let col = 0; col < columnCount; col++) {
        const colLabel = SCALE_POSITION_DEGREES[col] || String(col + 1);
        const th = document.createElement('th');
        th.textContent = colLabel;
        th.title = `Toggle column ${colLabel} for all roots`;
        styleScalePositionFocusCell(th, isScalePositionColumnFullyVisible(col, rowCount), true);
        th.addEventListener('click', () => {
            toggleScalePositionColumn(col, rowCount);
            renderScalePositionGrid();
        });
        headerRow.appendChild(th);
    }
    focusTable.appendChild(headerRow);

    for (let row = 0; row < rowCount; row++) {
        const tr = document.createElement('tr');
        const rowLabel = fretboardState.SCALE_POSITION_ROW_LABELS[row];

        const rowHeader = document.createElement('th');
        rowHeader.textContent = rowLabel;
        rowHeader.title = `Toggle all chords for Root ${rowLabel}`;
        styleScalePositionFocusCell(rowHeader, isScalePositionRowFullyVisible(row, columnCount), true);
        rowHeader.addEventListener('click', () => {
            toggleScalePositionRow(row, columnCount);
            renderScalePositionGrid();
        });
        tr.appendChild(rowHeader);

        const scaleCell = document.createElement('td');
        scaleCell.title = `Toggle full-scale reference for Root ${rowLabel}`;
        styleScalePositionFocusCell(scaleCell, isScalePositionCellVisible(row, -1), false);
        scaleCell.addEventListener('click', () => {
            toggleScalePositionCell(row, -1);
            renderScalePositionGrid();
        });
        tr.appendChild(scaleCell);

        for (let col = 0; col < columnCount; col++) {
            const colLabel = SCALE_POSITION_DEGREES[col] || String(col + 1);
            const td = document.createElement('td');
            td.title = `Toggle ${colLabel} for Root ${rowLabel}`;
            styleScalePositionFocusCell(td, isScalePositionCellVisible(row, col), false);
            td.addEventListener('click', () => {
                toggleScalePositionCell(row, col);
                renderScalePositionGrid();
            });
            tr.appendChild(td);
        }

        focusTable.appendChild(tr);
    }

    wrapper.appendChild(focusTable);
    return wrapper;
}

/**
 * Create a dimmed placeholder shown in place of a hidden scale position cell.
 * @param {() => void} onRestore
 * @returns {HTMLElement}
 */
export function createScalePositionPlaceholderCell(onRestore) {
    const placeholder = document.createElement('div');
    placeholder.textContent = '···';
    placeholder.title = 'Hidden — click to show';
    placeholder.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        color: #666;
        font-size: 11px;
        cursor: pointer;
        border: 1px dashed #444;
        border-radius: 4px;
        background: rgba(0,0,0,0.15);
    `;
    placeholder.addEventListener('click', onRestore);
    return placeholder;
}

/**
 * Create or rebuild the scale position grid that sits between the main fretboard and chord grid.
 */
export function renderScalePositionGrid() {
    const container = document.getElementById('scalePositionGridContainer');
    if (!container) {
        return;
    }

    persistScalePositionGridSettings();

    const scaleNoteNames = getCurrentScaleNoteNames();
    const primaryScale = getPrimaryScale();
    const primaryRoot = getPrimaryRootNote() || 'C';
    const normalizedRoot = notationStripOctave(normalizeNote(primaryRoot));
    const noteCount = scaleNoteNames.length;
    const columnCount = Math.min(8, Math.max(6, noteCount || 7));

    container.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = 'Scale Position Grid';
    title.style.cssText = `
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        color: #fff;
    `;
    container.appendChild(title);

    // Grid information (description, selected-scale summary, legend) on the
    // left, the Focus Selector matrix on the right, side by side.
    const infoRow = document.createElement('div');
    infoRow.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: flex-start;
        justify-content: center;
        margin-bottom: 10px;
    `;
    const infoColumn = document.createElement('div');
    infoColumn.style.cssText = `
        flex: 0 1 1080px;
        min-width: 280px;
        text-align: center;
    `;
    const focusColumn = document.createElement('div');
    focusColumn.style.cssText = `
        flex: 0 0 auto;
    `;
    infoRow.appendChild(infoColumn);
    infoRow.appendChild(focusColumn);
    container.appendChild(infoRow);

    const infoHeading = document.createElement('div');
    infoHeading.textContent = 'Grid Information';
    infoHeading.style.cssText = `
        color: #f0f0f0;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 2px;
    `;
    infoColumn.appendChild(infoHeading);

    const description = document.createElement('div');
    description.style.cssText = `
        color: #cbcbcb;
        font-size: 11px;
        text-align: center;
        margin-bottom: 10px;
    `;
    description.textContent = 'Generic row boards: root is fixed at displayed fret 2 (with one fret left), labels are row-consistent, and each row shifts by root string context.';
    infoColumn.appendChild(description);

    const controls = document.createElement('div');
    controls.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 12px;
        align-items: center;
        margin-top: 10px;
        color: #e3e3e3;
        font-size: 11px;
    `;

    const scaleControl = document.createElement('label');
    scaleControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const scaleLabel = document.createElement('span');
    scaleLabel.textContent = 'Pattern Size';
    const scaleInput = document.createElement('input');
    scaleInput.type = 'range';
    scaleInput.min = '0.8';
    scaleInput.max = '2.2';
    scaleInput.step = '0.05';
    scaleInput.value = String(fretboardState.scalePositionPatternScale);
    const scaleValue = document.createElement('span');
    scaleValue.style.cssText = 'min-width: 34px; text-align: right; font-family: monospace;';
    scaleValue.textContent = `${fretboardState.scalePositionPatternScale.toFixed(2)}x`;
    scaleInput.addEventListener('input', (event) => {
        const newValue = parseFloat(event.target.value);
        if (!Number.isNaN(newValue)) {
            fretboardState.scalePositionPatternScale = newValue;
            scaleValue.textContent = `${newValue.toFixed(2)}x`;
            renderScalePositionGrid();
        }
    });
    scaleControl.appendChild(scaleLabel);
    scaleControl.appendChild(scaleInput);
    scaleControl.appendChild(scaleValue);

    const dotControl = document.createElement('label');
    dotControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const dotLabel = document.createElement('span');
    dotLabel.textContent = 'Dot Size';
    const dotInput = document.createElement('input');
    dotInput.type = 'range';
    dotInput.min = '0.5';
    dotInput.max = '3';
    dotInput.step = '0.05';
    dotInput.value = String(fretboardState.scalePositionDotScale);
    const dotValue = document.createElement('span');
    dotValue.style.cssText = 'min-width: 34px; text-align: right; font-family: monospace;';
    dotValue.textContent = `${fretboardState.scalePositionDotScale.toFixed(2)}x`;
    dotInput.addEventListener('input', (event) => {
        const newValue = parseFloat(event.target.value);
        if (!Number.isNaN(newValue)) {
            fretboardState.scalePositionDotScale = newValue;
            dotValue.textContent = `${newValue.toFixed(2)}x`;
            renderScalePositionGrid();
        }
    });
    dotControl.appendChild(dotLabel);
    dotControl.appendChild(dotInput);
    dotControl.appendChild(dotValue);

    const modeControl = document.createElement('label');
    modeControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const modeToggle = document.createElement('input');
    modeToggle.type = 'checkbox';
    modeToggle.checked = fretboardState.scalePositionUseAbsoluteFretLabels;
    const modeLabel = document.createElement('span');
    modeLabel.textContent = fretboardState.scalePositionUseAbsoluteFretLabels ? 'Fret Labels: Absolute' : 'Fret Labels: Relative';
    modeToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionUseAbsoluteFretLabels = event.target.checked;
        modeLabel.textContent = fretboardState.scalePositionUseAbsoluteFretLabels ? 'Fret Labels: Absolute' : 'Fret Labels: Relative';
        renderScalePositionGrid();
    });
    modeControl.appendChild(modeToggle);
    modeControl.appendChild(modeLabel);

    const stackControl = document.createElement('label');
    stackControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const stackLabel = document.createElement('span');
    stackLabel.textContent = 'Stacking';
    const stackSelect = document.createElement('select');
    stackSelect.innerHTML = `
        <option value="dyad">Dyad</option>
        <option value="triad">Triad</option>
        <option value="tetrad">Tetrad</option>
    `;
    stackSelect.value = fretboardState.scalePositionStackType;
    stackSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 11px;
        background: #222;
        color: #e3e3e3;
    `;
    stackSelect.addEventListener('change', (event) => {
        fretboardState.scalePositionStackType = event.target.value;
        renderScalePositionGrid();
    });
    stackControl.appendChild(stackLabel);
    stackControl.appendChild(stackSelect);

    const gripLabelControl = document.createElement('label');
    gripLabelControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const gripLabelLabel = document.createElement('span');
    gripLabelLabel.textContent = 'Grip Labels';
    const gripLabelSelect = document.createElement('select');
    gripLabelSelect.innerHTML = `
        <option value="none">Off</option>
        <option value="note">Note Name</option>
        <option value="interval">Interval</option>
        <option value="finger">Finger Number</option>
    `;
    gripLabelSelect.value = fretboardState.scalePositionLabelMode;
    gripLabelSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 11px;
        background: #222;
        color: #e3e3e3;
    `;
    gripLabelSelect.addEventListener('change', (event) => {
        fretboardState.scalePositionLabelMode = event.target.value;
        renderScalePositionGrid();
    });
    gripLabelControl.appendChild(gripLabelLabel);
    gripLabelControl.appendChild(gripLabelSelect);

    const allLabelsControl = document.createElement('label');
    allLabelsControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const allLabelsLabel = document.createElement('span');
    allLabelsLabel.textContent = 'All Note Labels';
    const allLabelsSelect = document.createElement('select');
    allLabelsSelect.innerHTML = `
        <option value="none">Off</option>
        <option value="note">Note Name</option>
        <option value="interval">Interval</option>
    `;
    allLabelsSelect.value = fretboardState.scalePositionAllLabelsMode;
    allLabelsSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 11px;
        background: #222;
        color: #e3e3e3;
    `;
    allLabelsSelect.addEventListener('change', (event) => {
        fretboardState.scalePositionAllLabelsMode = event.target.value;
        renderScalePositionGrid();
    });
    allLabelsControl.appendChild(allLabelsLabel);
    allLabelsControl.appendChild(allLabelsSelect);

    const gripLinesControl = document.createElement('label');
    gripLinesControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const gripLinesToggle = document.createElement('input');
    gripLinesToggle.type = 'checkbox';
    gripLinesToggle.checked = fretboardState.scalePositionShowGripLines;
    const gripLinesLabel = document.createElement('span');
    gripLinesLabel.textContent = 'Connect Fingered Notes';
    gripLinesToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionShowGripLines = event.target.checked;
        renderScalePositionGrid();
    });
    gripLinesControl.appendChild(gripLinesToggle);
    gripLinesControl.appendChild(gripLinesLabel);

    const chordHeaderControl = document.createElement('label');
    chordHeaderControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const chordHeaderToggle = document.createElement('input');
    chordHeaderToggle.type = 'checkbox';
    chordHeaderToggle.checked = fretboardState.scalePositionShowChordNames;
    const chordHeaderLabel = document.createElement('span');
    chordHeaderLabel.textContent = 'Show Chord Names In Headers';
    chordHeaderToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionShowChordNames = event.target.checked;
        renderScalePositionGrid();
    });
    chordHeaderControl.appendChild(chordHeaderToggle);
    chordHeaderControl.appendChild(chordHeaderLabel);

    const instancedScaleControl = document.createElement('label');
    instancedScaleControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const instancedScaleToggle = document.createElement('input');
    instancedScaleToggle.type = 'checkbox';
    instancedScaleToggle.checked = fretboardState.scalePositionUseInstancedScale;
    const instancedScaleLabel = document.createElement('span');
    instancedScaleLabel.textContent = 'Instanced Scale Labels (Notes)';
    instancedScaleToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionUseInstancedScale = event.target.checked;
        renderScalePositionGrid();
    });
    instancedScaleControl.appendChild(instancedScaleToggle);
    instancedScaleControl.appendChild(instancedScaleLabel);

    const shapeControl = document.createElement('label');
    shapeControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const shapeToggle = document.createElement('input');
    shapeToggle.type = 'checkbox';
    shapeToggle.checked = fretboardState.scalePositionUseNoteShapes;
    const shapeLabel = document.createElement('span');
    shapeLabel.textContent = 'Use Note Shapes';
    shapeToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionUseNoteShapes = event.target.checked;
        renderScalePositionGrid();
    });
    shapeControl.appendChild(shapeToggle);
    shapeControl.appendChild(shapeLabel);

    const keepColorControl = document.createElement('label');
    keepColorControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const keepColorToggle = document.createElement('input');
    keepColorToggle.type = 'checkbox';
    keepColorToggle.checked = fretboardState.scalePositionKeepColorConstant;
    const keepColorLabel = document.createElement('span');
    keepColorLabel.textContent = 'Keep Color Constant';
    keepColorToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionKeepColorConstant = event.target.checked;
        renderScalePositionGrid();
    });
    keepColorControl.appendChild(keepColorToggle);
    keepColorControl.appendChild(keepColorLabel);

    const keepShapeControl = document.createElement('label');
    keepShapeControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const keepShapeToggle = document.createElement('input');
    keepShapeToggle.type = 'checkbox';
    keepShapeToggle.checked = fretboardState.scalePositionKeepShapeConstant;
    const keepShapeLabel = document.createElement('span');
    keepShapeLabel.textContent = 'Keep Shape Constant';
    keepShapeToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionKeepShapeConstant = event.target.checked;
        renderScalePositionGrid();
    });
    keepShapeControl.appendChild(keepShapeToggle);
    keepShapeControl.appendChild(keepShapeLabel);

    const darkDuplicateControl = document.createElement('label');
    darkDuplicateControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;

    const darkDuplicate = document.createElement('input');
    darkDuplicate.type = 'checkbox';
    darkDuplicate.checked = fretboardState.scalePositionDarkDuplicate;
    const darkDuplicateLabel = document.createElement('span');
    darkDuplicateLabel.textContent = 'Dark Duplicate';
    darkDuplicate.addEventListener('change', (event) => {
        fretboardState.scalePositionDarkDuplicate = event.target.checked;
        renderScalePositionGrid();
    });
    darkDuplicateControl.appendChild(darkDuplicate);
    darkDuplicateControl.appendChild(darkDuplicateLabel);


    controls.appendChild(scaleControl);
    controls.appendChild(dotControl);
    controls.appendChild(modeControl);
    controls.appendChild(stackControl);
    controls.appendChild(gripLabelControl);
    controls.appendChild(allLabelsControl);
    controls.appendChild(gripLinesControl);
    controls.appendChild(chordHeaderControl);
    controls.appendChild(instancedScaleControl);
    controls.appendChild(shapeControl);
    controls.appendChild(keepColorControl);
    controls.appendChild(keepShapeControl);
    controls.appendChild(darkDuplicateControl);

    const fallbackScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const workingScale = scaleNoteNames.length > 0 ? scaleNoteNames : fallbackScale;
    const scaleIntervalEntries = getScaleIntervalEntries(workingScale, normalizedRoot);
    const intervalSummary = `${scaleIntervalEntries.map(entry => entry.intervalLabel).join(' - ')} - O`;
    const noteSummary = fretboardState.scalePositionUseInstancedScale ? ` | Notes: ${workingScale.join(' - ')}` : '';
    const scaleDescriptor = getScaleDescriptor(primaryScale);

    const selectedScaleTitle = document.createElement('div');
    selectedScaleTitle.style.cssText = `
        margin: 4px 0 10px 0;
        color: #f0f0f0;
        font-size: 12px;
        font-weight: bold;
        text-align: center;
    `;
    const titlePrefix = fretboardState.scalePositionUseInstancedScale ? `${normalizedRoot} ` : '';
    selectedScaleTitle.textContent = `${titlePrefix}${scaleDescriptor} | Intervals: ${intervalSummary} ${noteSummary}`;
    infoColumn.appendChild(selectedScaleTitle);

    const legend = document.createElement('div');
    legend.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        align-items: center;
        margin: 0 auto 10px auto;
        max-width: 1100px;
        color: #e0e0e0;
        font-size: 10px;
    `;
    scaleIntervalEntries.forEach((entry) => {
        const item = document.createElement('span');
        item.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            border: 1px solid #4f4f4f;
            border-radius: 10px;
            background: rgba(0,0,0,0.2);
        `;

        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '12');
        iconSvg.setAttribute('height', '12');
        iconSvg.style.cssText = 'display:inline-block;';

        const legendShapeType = fretboardState.scalePositionUseNoteShapes
            ? NOTE_SHAPE_TYPES[entry.semitone % NOTE_SHAPE_TYPES.length]
            : 'circle';
        const legendShape = createNoteShapeMarker(
            6,
            6,
            4,
            legendShapeType,
            getIntervalColor(entry.semitone),
            'rgba(0,0,0,0.5)',
            0.7
        );
        iconSvg.appendChild(legendShape);

        const text = document.createElement('span');
        text.textContent = fretboardState.scalePositionUseInstancedScale ? entry.note : entry.intervalLabel;

        item.appendChild(iconSvg);
        item.appendChild(text);
        legend.appendChild(item);
    });

    {
        const gripItem = document.createElement('span');
        gripItem.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            border: 1px dashed #999;
            border-radius: 10px;
            background: rgba(0,0,0,0.2);
        `;
        gripItem.textContent = 'Dashed = suggested fingering grip';
        legend.appendChild(gripItem);
    }
    infoColumn.appendChild(legend);

    focusColumn.appendChild(buildScalePositionFocusMatrix(columnCount));

    const rowCount = fretboardState.SCALE_POSITION_ROW_STRINGS.length;
    const showScaleColumn = !isScalePositionColumnFullyHidden(-1, rowCount);
    const visibleDegreeCols = [];
    for (let col = 0; col < columnCount; col++) {
        if (!isScalePositionColumnFullyHidden(col, rowCount)) {
            visibleDegreeCols.push(col);
        }
    }

    const table = document.createElement('table');
    table.style.cssText = `
        border-collapse: collapse;
        margin: 0 auto;
        background: rgba(17, 17, 17, 0.45);
        border: 1px solid #444;
    `;

    const headerRow = document.createElement('tr');
    const cornerCell = document.createElement('th');
    cornerCell.textContent = 'Pos';
    cornerCell.style.cssText = `
        border: 1px solid #444;
        background: #2b2b2b;
        color: #fff;
        padding: 4px 6px;
        font-size: 11px;
        min-width: 48px;
    `;
    headerRow.appendChild(cornerCell);

    if (showScaleColumn) {
        const scaleHeader = document.createElement('th');
        scaleHeader.textContent = 'Scale';
        scaleHeader.style.cssText = `
            border: 1px solid #444;
            background: #2b2b2b;
            color: #fff;
            padding: 4px;
            font-size: 11px;
            min-width: ${Math.round(130 * fretboardState.scalePositionPatternScale)}px;
            text-align: center;
        `;
        headerRow.appendChild(scaleHeader);
    }

    const chordSpan = SCALE_POSITION_STACK_SIZES[fretboardState.scalePositionStackType] || 3;

    for (const col of visibleDegreeCols) {
        const colHeader = document.createElement('th');
        const degreeIndexes = [];
        for (let i = 0; i < chordSpan; i++) {
            degreeIndexes.push((col + i * 2) % workingScale.length);
        }
        const degreeChordNotes = degreeIndexes.map(index => workingScale[index]);
        const degreeChordRoot = workingScale[col % workingScale.length];
        colHeader.textContent = buildDegreeHeaderLabel(
            SCALE_POSITION_DEGREES[col] || String(col + 1),
            degreeChordRoot,
            degreeChordNotes
        );
        colHeader.style.cssText = `
            border: 1px solid #444;
            background: #2b2b2b;
            color: #fff;
            padding: 4px;
            font-size: 11px;
            min-width: ${Math.round(130 * fretboardState.scalePositionPatternScale)}px;
            text-align: center;
            white-space: pre-line;
            line-height: 1.2;
        `;
        headerRow.appendChild(colHeader);
    }
    table.appendChild(headerRow);

    for (let row = 0; row < rowCount; row++) {
        if (isScalePositionRowFullyHidden(row, columnCount)) {
            continue;
        }

        const rowStringIndex = fretboardState.SCALE_POSITION_ROW_STRINGS[row];
        const rowLabel = fretboardState.SCALE_POSITION_ROW_LABELS[row];
        const tr = document.createElement('tr');

        const rowHeader = document.createElement('td');
        rowHeader.textContent = `Root ${rowLabel}`;
        rowHeader.style.cssText = `
            border: 1px solid #444;
            background: #383838;
            color: #fff;
            font-weight: bold;
            font-size: 11px;
            text-align: center;
            padding: 4px 6px;
            white-space: nowrap;
        `;
        tr.appendChild(rowHeader);

        if (showScaleColumn) {
            const fullScaleCell = document.createElement('td');
            fullScaleCell.style.cssText = `
                border: 1px solid #444;
                padding: 4px;
                vertical-align: middle;
                background: rgba(30,30,30,0.35);
            `;
            if (isScalePositionCellVisible(row, -1)) {
                const fullScaleMini = createScalePositionMiniFretboard(
                    workingScale,
                    workingScale,
                    normalizedRoot,
                    rowStringIndex,
                    normalizedRoot,
                    false,
                    fretboardState.scalePositionPatternScale,
                    true,
                    fretboardState.scalePositionUseAbsoluteFretLabels
                );
                fullScaleCell.appendChild(fullScaleMini);
            } else {
                fullScaleCell.appendChild(createScalePositionPlaceholderCell(() => {
                    setScalePositionCellVisible(row, -1, true);
                    renderScalePositionGrid();
                }));
            }
            tr.appendChild(fullScaleCell);
        }

        for (const col of visibleDegreeCols) {
            const td = document.createElement('td');
            td.style.cssText = `
                border: 1px solid #444;
                padding: 4px;
                vertical-align: middle;
                background: rgba(30,30,30,0.35);
            `;

            if (isScalePositionCellVisible(row, col)) {
                const chordIndexes = [];
                for (let i = 0; i < chordSpan; i++) {
                    chordIndexes.push((col + i * 2) % workingScale.length);
                }
                const chordPatternNotes = chordIndexes.map(index => workingScale[index]);
                const chordRoot = workingScale[col % workingScale.length];

                const mini = createScalePositionMiniFretboard(
                    workingScale,
                    chordPatternNotes,
                    chordRoot,
                    rowStringIndex,
                    normalizedRoot,
                    true,
                    fretboardState.scalePositionPatternScale,
                    true,
                    fretboardState.scalePositionUseAbsoluteFretLabels
                );
                td.appendChild(mini);
            } else {
                td.appendChild(createScalePositionPlaceholderCell(() => {
                    setScalePositionCellVisible(row, col, true);
                    renderScalePositionGrid();
                }));
            }
            tr.appendChild(td);
        }

        table.appendChild(tr);
    }

    container.appendChild(table);
    container.appendChild(controls);
}

/**
 * Create the wrapper container for the scale position grid.
 * @returns {HTMLElement}
 */
export function createScalePositionGrid() {
    const gridContainer = document.createElement('div');
    gridContainer.id = 'scalePositionGridContainer';
    gridContainer.style.cssText = `
        margin: 16px auto 0 auto;
        width: fit-content;
        max-width: none;
        background: hsla(0, 0%, 24%, 1);
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        overflow-x: visible;
    `;

    renderScalePositionGrid();
    return gridContainer;
}
