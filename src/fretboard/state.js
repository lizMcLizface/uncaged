// Shared mutable state for the fretboard UI (src/fretboard/index.js and
// src/fretboard/ui/*). Exported as a single object rather than
// individual `let` bindings because ES module named exports are read-only
// live bindings - importers cannot reassign them, only property-mutate an
// exported object. Every module that used to read/write one of these as a
// bare identifier now reads/writes `fretboardState.<name>` instead; nothing
// about when or why each field changes was touched.
//
// Lifted from src/frets.js as part of REFACTOR_PLAN.md Phase 3.

import { stripOctave as notationStripOctave } from '../theory/notation';
import { getActiveConfig as getActiveInstrumentConfig, toSlashFormat as tuningToSlashFormat } from '../tuning';

export const fretboardState = {
    // Scale Position Grid row anchors/tuning - string indices (into the
    // active tuning) used as row anchors, plus their display letters, and
    // the tuning they were derived from. Recomputed by
    // refreshScalePositionTuning() below on load and whenever the active
    // instrument/tuning changes.
    SCALE_POSITION_ROW_STRINGS: [1, 2, 3, 4, 5],
    SCALE_POSITION_ROW_LABELS: ['B', 'A', 'G', 'E', 'D'],
    MINI_SCALE_STRING_TUNING: ['E/4', 'B/3', 'G/3', 'D/3', 'A/2', 'E/2'],

    // Persisted Scale Position Grid display settings - defaults filled in
    // below from localStorage, see loadSavedScalePositionGridSettings().
    scalePositionPatternScale: 1.5,
    scalePositionUseAbsoluteFretLabels: false,
    scalePositionDotScale: 2.5,
    scalePositionShowChordNames: false,
    scalePositionUseInstancedScale: false,
    scalePositionUseNoteShapes: false,
    scalePositionKeepColorConstant: false,
    scalePositionKeepShapeConstant: false,
    scalePositionDarkDuplicate: true,
    scalePositionStackType: 'triad',
    scalePositionHiddenCells: new Set(),
    scalePositionLabelMode: 'none', // 'none' | 'note' | 'interval' | 'finger' - text label on chord grip dots
    scalePositionAllLabelsMode: 'interval', // 'none' | 'note' | 'interval' - text label on every dot (chord cells and the full scale column)
    scalePositionShowGripLines: false, // Draw a connecting line between the picked grip's dots

    // Fretboard instance registry and display-mode tracking.
    fretboardInstances: new Map(),
    fretboardsShowingScale: new Set(),
    fretboardsShowingChords: new Set(),

    // Chord grid / chord display state.
    currentChordType: 'triads', // 'triads' or 'sevenths'
    currentDisplayedChord: null, // Currently displayed chord index (0-6)
    isInHoverState: false, // Track if we're currently in a temporary hover state
    mainFretboardLabelMode: 'note', // 'note' | 'interval' | 'finger' - marker label mode for chord/scale displays
    currentChordGridSelection: null, // Track permanent chord grid selections {note, chordType}

    // Chord-fingering tab state.
    chordFingeringShapes: [], // Playable shapes found for the currently displayed chord
    selectedFingeringTabIndex: 0, // Which shape/tab is currently rendered

    // Scale-change event handling.
    isUpdatingFretboards: false,
    lastScaleUpdateTime: 0,
    lastScaleData: null,

    // The main fretboard instance, set once DOM is ready (see
    // initializeFretboardWithScale() in src/fretboard/index.js).
    mainFretboard: null
};

/**
 * Recompute the Scale Position Grid's row anchors/labels and mini-fretboard
 * tuning from a given tuning (defaults to the active instrument config).
 * Called on load and whenever the active instrument/tuning changes.
 */
export function refreshScalePositionTuning(tuning) {
    const activeTuning = tuning || getActiveInstrumentConfig().tuning;
    fretboardState.MINI_SCALE_STRING_TUNING = tuningToSlashFormat(activeTuning);

    // One row per *unique* string pitch class, scanning from the lowest
    // string upward and keeping the lowest occurrence of each letter - e.g.
    // standard EADGBE collapses to E-A-D-G-B (high E dropped as a duplicate
    // of low E), DADGAD collapses to D-A-G, standard 4-string bass EADG has
    // no duplicates so all four remain.
    const seenLetters = new Set();
    const rowIndices = [];
    for (let index = fretboardState.MINI_SCALE_STRING_TUNING.length - 1; index >= 0; index--) {
        const letter = notationStripOctave(fretboardState.MINI_SCALE_STRING_TUNING[index]);
        if (!seenLetters.has(letter)) {
            seenLetters.add(letter);
            rowIndices.push(index);
        }
    }

    fretboardState.SCALE_POSITION_ROW_STRINGS = rowIndices;
    fretboardState.SCALE_POSITION_ROW_LABELS = rowIndices.map(
        index => notationStripOctave(fretboardState.MINI_SCALE_STRING_TUNING[index])
    );
}

// Persisted Scale Position Grid display settings so users return to where they left off
const SCALE_POSITION_GRID_SETTINGS_KEY = 'PolySynth-ScalePositionGridSettings';

function loadSavedScalePositionGridSettings() {
    try {
        const raw = localStorage.getItem(SCALE_POSITION_GRID_SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('Could not load saved Scale Position Grid settings, using defaults', error);
        return null;
    }
}

const savedScalePositionGridSettings = loadSavedScalePositionGridSettings();
if (savedScalePositionGridSettings) {
    fretboardState.scalePositionPatternScale = savedScalePositionGridSettings.patternScale ?? fretboardState.scalePositionPatternScale;
    fretboardState.scalePositionUseAbsoluteFretLabels = savedScalePositionGridSettings.useAbsoluteFretLabels ?? fretboardState.scalePositionUseAbsoluteFretLabels;
    fretboardState.scalePositionDotScale = savedScalePositionGridSettings.dotScale ?? fretboardState.scalePositionDotScale;
    fretboardState.scalePositionShowChordNames = savedScalePositionGridSettings.showChordNames ?? fretboardState.scalePositionShowChordNames;
    fretboardState.scalePositionUseInstancedScale = savedScalePositionGridSettings.useInstancedScale ?? fretboardState.scalePositionUseInstancedScale;
    fretboardState.scalePositionUseNoteShapes = savedScalePositionGridSettings.useNoteShapes ?? fretboardState.scalePositionUseNoteShapes;
    fretboardState.scalePositionKeepColorConstant = savedScalePositionGridSettings.keepColorConstant ?? fretboardState.scalePositionKeepColorConstant;
    fretboardState.scalePositionKeepShapeConstant = savedScalePositionGridSettings.keepShapeConstant ?? fretboardState.scalePositionKeepShapeConstant;
    fretboardState.scalePositionDarkDuplicate = savedScalePositionGridSettings.darkDuplicate ?? fretboardState.scalePositionDarkDuplicate;
    fretboardState.scalePositionStackType = savedScalePositionGridSettings.stackType ?? fretboardState.scalePositionStackType;
    fretboardState.scalePositionLabelMode = savedScalePositionGridSettings.labelMode ?? fretboardState.scalePositionLabelMode;
    fretboardState.scalePositionAllLabelsMode = savedScalePositionGridSettings.allLabelsMode ?? fretboardState.scalePositionAllLabelsMode;
    fretboardState.scalePositionShowGripLines = savedScalePositionGridSettings.showGripLines ?? fretboardState.scalePositionShowGripLines;
}

export function persistScalePositionGridSettings() {
    try {
        localStorage.setItem(SCALE_POSITION_GRID_SETTINGS_KEY, JSON.stringify({
            patternScale: fretboardState.scalePositionPatternScale,
            useAbsoluteFretLabels: fretboardState.scalePositionUseAbsoluteFretLabels,
            dotScale: fretboardState.scalePositionDotScale,
            showChordNames: fretboardState.scalePositionShowChordNames,
            useInstancedScale: fretboardState.scalePositionUseInstancedScale,
            useNoteShapes: fretboardState.scalePositionUseNoteShapes,
            keepColorConstant: fretboardState.scalePositionKeepColorConstant,
            keepShapeConstant: fretboardState.scalePositionKeepShapeConstant,
            darkDuplicate: fretboardState.scalePositionDarkDuplicate,
            stackType: fretboardState.scalePositionStackType,
            labelMode: fretboardState.scalePositionLabelMode,
            allLabelsMode: fretboardState.scalePositionAllLabelsMode,
            showGripLines: fretboardState.scalePositionShowGripLines
        }));
    } catch (error) {
        console.warn('Could not persist Scale Position Grid settings', error);
    }
}

refreshScalePositionTuning();
