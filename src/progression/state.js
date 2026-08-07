// Shared mutable state for the chord progression builder
// (progressionBuilder.js and its future split-out modules). Exported as a
// single object rather than individual `let` bindings, same reason as
// src/fretboard/state.js: ES module named exports are read-only live
// bindings - importers cannot reassign them, only property-mutate an
// exported object. Every place that used to read/write one of these as a
// bare identifier now reads/writes `progressionState.<name>` instead;
// nothing about when or why each field changes was touched.
//
// window.currentProgression stays a plain global (PolySynth.jsx reads and,
// in one place, mutates it in place via `.length = 0; .push(...)`) - it is
// re-synced to progressionState.currentProgression by hand at every full
// reassignment, exactly as it was synced to the old bare `currentProgression`
// before this move. See ARCHITECTURE.md's Phase 4 section for why this
// wasn't turned into a live binding here - that's Phase 5's job.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { getActiveConfig as getActiveInstrumentConfig } from '../tuning';

export const progressionState = {
    currentProgression: [],
    hoveredChordIndex: null,
    selectedPatternIndexes: new Map(), // Map of chord index to selected pattern index
    showMiniFretboards: true,
    showMiniPianos: false,
    showMiniStaves: false,
    staveKey: 'C',
    staveTheoryMode: false, // 4th-octave notes on/off for mini staves
    useSeventhChords: false, // triads vs seventh chords
    showFretboardIntervals: false, // interval labels instead of note names on mini fretboards
    showArpeggiationNotes: false, // arpeggiation notes on mini fretboards

    // "Snap Shapes" - keep every chord's shape inside one scale position
    // rather than each independently taking its lowest-fret match. The anchor
    // is a Scale Position Grid row index, or SNAP_ANCHOR_AUTO to let
    // src/progression/snap.js pick the position the progression fits best;
    // snapResolvedRow is whichever row that came out as, written back so the
    // grid knows which row to accent. See src/progression/snap.js.
    snapShapes: false,
    snapAnchorRow: 'auto',
    snapResolvedRow: null,

    // Caching for performance.
    parsedTokensCache: [], // Cache of parsed tokens from input
    lastInputString: '', // Last processed input string
    precomputedPatternData: new Map(), // Map of chord index to precomputed pattern data

    // Debouncing for input changes.
    inputDebounceTimer: null
};

// Expose current progression globally for PolySynth access.
window.currentProgression = progressionState.currentProgression;

export const INPUT_DEBOUNCE_DELAY = 150; // milliseconds

export const CHORD_LINE_CONFIG = {
    normalWidth: 60,
    highlightedWidth: 80,
    normalOpacity: 0.7,
    highlightedOpacity: 0.9,
    hoverOpacity: 1.0
};

// Mini fretboard visualization configuration
export const MINI_FRETBOARD_CONFIG = {
    width: 100,
    height: 120,
    fretCount: 5,
    stringCount: getActiveInstrumentConfig().stringCount,
    fretHeight: 20,
    stringSpacing: 14,
    noteRadius: 4,
    fretNumberSize: 10,
    noteNameSize: 9
};
