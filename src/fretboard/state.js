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
import { FRET_COUNT } from './Fretboard';

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

    // Fretboard instance registry.
    //
    // fretboardsShowingScale / fretboardsShowingChords / isInHoverState were
    // deleted in VISUALIZATION_STACK_PLAN.md step 8d. All three existed to
    // answer "what is on screen right now?", which src/visualization/'s layer
    // stack answers directly - and answers without drawing code having to
    // remember to register itself (markScale used to add to the first Set
    // from inside the render).
    fretboardInstances: new Map(),

    // Chord grid / chord display state.
    //
    // currentDisplayedChord and currentChordGridSelection survived 8d but
    // were demoted: they record WHICH BUTTON IS ACTIVE, for button styling
    // and for rebuilding the selection when the scale moves. They no longer
    // decide what is drawn - the stack does.
    currentChordType: 'triads', // 'triads' or 'sevenths'
    currentDisplayedChord: null, // Active Roman-numeral button (0 = Scale, 1-7 = chord)
    mainFretboardLabelMode: 'note', // 'note' | 'interval' | 'finger' - marker label mode for chord/scale displays
    currentChordGridSelection: null, // Track permanent chord grid selections {note, chordType}

    // Chord-fingering tab state.
    chordFingeringShapes: [], // Playable shapes found for the currently displayed chord
    selectedFingeringTabIndex: 0, // Which shape/tab is currently rendered

    // Scale-change event handling.
    isUpdatingFretboards: false,
    lastScaleUpdateTime: 0,
    lastScaleData: null,

    // Which frets the main fretboard draws - see Fretboard#setFretRange.
    // Defaults to the whole neck; narrowed by the fret range picker in
    // ui/controls.js, mainly so a mobile screen can zoom into a legible
    // chunk instead of showing all of FRET_COUNT compressed into one width.
    visibleLowestFret: 0,
    visibleHighestFret: FRET_COUNT,

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

// Persisted fret-range setting so users return to the same zoomed-in view
// they left, same pattern as the Scale Position Grid settings above.
const FRET_RANGE_SETTINGS_KEY = 'PolySynth-FretRangeSettings';

function loadSavedFretRangeSettings() {
    try {
        const raw = localStorage.getItem(FRET_RANGE_SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('Could not load saved fret range settings, using defaults', error);
        return null;
    }
}

const savedFretRangeSettings = loadSavedFretRangeSettings();
if (savedFretRangeSettings) {
    fretboardState.visibleLowestFret = savedFretRangeSettings.lowestFret ?? fretboardState.visibleLowestFret;
    fretboardState.visibleHighestFret = savedFretRangeSettings.highestFret ?? fretboardState.visibleHighestFret;
}

export function persistFretRangeSettings() {
    try {
        localStorage.setItem(FRET_RANGE_SETTINGS_KEY, JSON.stringify({
            lowestFret: fretboardState.visibleLowestFret,
            highestFret: fretboardState.visibleHighestFret
        }));
    } catch (error) {
        console.warn('Could not persist fret range settings', error);
    }
}
