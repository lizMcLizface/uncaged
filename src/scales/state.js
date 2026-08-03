// Scale/root-note selection state (scaleGenerator.js and its split-out
// modules). Exported as a single object rather than individual `let`
// bindings, same reason as src/fretboard/state.js and
// src/progression/state.js: ES module named exports are read-only live
// bindings - importers cannot reassign them, only property-mutate an
// exported object. Every place that used to read/write one of these as a
// bare identifier now reads/writes `scaleState.<name>` instead; nothing
// about when or why each field changes was touched.
//
// `getSelectedScales`/`clearSelectedScales`/`addSelectedScale`/
// `removeSelectedScale`/`getPrimaryScaleChords`/`getAllSelectedScaleChords`
// moved here verbatim but are dead code - not exported, and grepping all of
// src/ found zero callers of any of the six, internal or external, before
// this move. Left in place rather than deleted, consistent with how Phase 1
// left other inert dead code alone in a restructuring-only phase.
// `scalePositionDarkDuplicate` is a second, unrelated orphan: a same-named
// leftover from before Phase 3 moved the *real* one to
// `fretboardState.scalePositionDarkDuplicate` - zero readers anywhere.
//
// Lifted from scaleGenerator.js as part of REFACTOR_PLAN.md Phase 4.

import { HeptatonicScales, precomputeScaleChords, getChordsForScale } from './scaleData';
import { updateCurrentScaleDisplay } from '.';
import { createHeptatonicScaleTable } from './ui/scaleTable';

const SCALE_SELECTION_STORAGE_KEY = 'PolySynth-ScaleSelection';

function loadSavedScaleSelection() {
    try {
        const raw = localStorage.getItem(SCALE_SELECTION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('Could not load saved scale/root selection, using defaults', error);
        return null;
    }
}

const savedScaleSelection = loadSavedScaleSelection();

function persistScaleSelection() {
    try {
        localStorage.setItem(SCALE_SELECTION_STORAGE_KEY, JSON.stringify({
            selectedScales: scaleState.selectedScales,
            selectedRootNote: scaleState.selectedRootNote,
            primaryScaleIndex: scaleState.primaryScaleIndex,
            primaryRootNoteIndex: scaleState.primaryRootNoteIndex,
            exclusiveMode: scaleState.exclusiveMode
        }));
    } catch (error) {
        console.warn('Could not persist scale/root selection', error);
    }
}

const scaleState = {
    // Global array to store selected scales
    selectedScales: savedScaleSelection?.selectedScales ?? ['Major-6'], // Default to Aeolian (mode 6 of Major)
    exclusiveMode: savedScaleSelection?.exclusiveMode ?? true, // Toggle between exclusive and multiple selection modes
    // Primary scale index for navigation through multiple selected scales
    primaryScaleIndex: savedScaleSelection?.primaryScaleIndex ?? 0,
    // Global variable to store selected root notes (can be array or single string)
    selectedRootNote: savedScaleSelection?.selectedRootNote ?? ['E'], // Default to E (all other roots deselected)
    // Primary root note index for navigation through multiple selected root notes
    primaryRootNoteIndex: savedScaleSelection?.primaryRootNoteIndex ?? 0,
    // Global object to store user's enharmonic display preferences
    // Maps chromatic positions to preferred display (sharp or flat)
    enharmonicDisplayPreferences: {
        1: 'C♯',  // Default to sharp for C♯/D♭
        3: 'D♯',  // Default to sharp for D♯/E♭
        6: 'F♯',  // Default to sharp for F♯/G♭
        8: 'G♯',  // Default to sharp for G♯/A♭
        10: 'A♯'  // Default to sharp for A♯/B♭
    }
};

let scalePositionDarkDuplicate = true; // Toggle for dark duplicate functionality

// Helper function to get chromatic position of a note
function getChromaticPosition(note) {
    const chromaticNotes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const flatToSharp = { 'D♭': 'C♯', 'E♭': 'D♯', 'G♭': 'F♯', 'A♭': 'G♯', 'B♭': 'A♯' };

    // Convert flat to sharp for lookup
    const normalizedNote = flatToSharp[note] || note;
    return chromaticNotes.indexOf(normalizedNote);
}

// Helper function to get the preferred display for a note
function getPreferredDisplay(note) {
    const position = getChromaticPosition(note);
    if (position !== -1 && scaleState.enharmonicDisplayPreferences[position]) {
        return scaleState.enharmonicDisplayPreferences[position];
    }
    return note; // Return original if no preference or not an enharmonic note
}

// Helper function to set enharmonic display preference
function setEnharmonicPreference(note) {
    const position = getChromaticPosition(note);
    if (position !== -1) {
        scaleState.enharmonicDisplayPreferences[position] = note;
    }
}

// Helper function to sort root notes in chromatic order
function sortRootNotesChronomatically(noteArray) {
    if (!Array.isArray(noteArray)) return noteArray;

    // Define chromatic order including both sharp and flat versions
    const chromaticOrder = [
        'C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'
    ];

    // Create a map for quick lookup of chromatic positions
    const chromaticPositions = {};
    chromaticOrder.forEach((note, index) => {
        chromaticPositions[note] = index;
    });

    // Sort the array based on chromatic positions
    return noteArray.slice().sort((a, b) => {
        const posA = chromaticPositions[a] !== undefined ? chromaticPositions[a] : 999;
        const posB = chromaticPositions[b] !== undefined ? chromaticPositions[b] : 999;
        return posA - posB;
    });
}

// Helper function to sort root notes and update the primary index accordingly
function sortRootNotesAndUpdateIndex(noteArray, currentPrimaryNote) {
    if (!Array.isArray(noteArray)) return noteArray;

    // Define enharmonic equivalents for finding the correct index
    const enharmonicPairs = {
        'C♯': 'D♭', 'D♭': 'C♯',
        'D♯': 'E♭', 'E♭': 'D♯',
        'F♯': 'G♭', 'G♭': 'F♯',
        'G♯': 'A♭', 'A♭': 'G♯',
        'A♯': 'B♭', 'B♭': 'A♯'
    };

    const sortedArray = sortRootNotesChronomatically(noteArray);

    // Update primary index to match the new position of the current primary note or its enharmonic equivalent
    if (currentPrimaryNote) {
        let newIndex = sortedArray.indexOf(currentPrimaryNote);

        // If exact match not found, try to find enharmonic equivalent
        if (newIndex === -1 && enharmonicPairs[currentPrimaryNote]) {
            const enharmonicEquivalent = enharmonicPairs[currentPrimaryNote];
            newIndex = sortedArray.indexOf(enharmonicEquivalent);
        }

        // Only update the index if we found a match (either exact or enharmonic)
        if (newIndex !== -1) {
            scaleState.primaryRootNoteIndex = newIndex;
        }
    }

    return sortedArray;
}

// Function to get the current primary scale
function getPrimaryScale() {
    if (scaleState.selectedScales.length === 0) return null;
    if (scaleState.primaryScaleIndex >= scaleState.selectedScales.length) {
        scaleState.primaryScaleIndex = 0; // Reset if index is out of bounds
    }
    return scaleState.selectedScales[scaleState.primaryScaleIndex];
}

// Function to navigate to next scale
function navigateToNextScale() {
    if (scaleState.selectedScales.length <= 1) return false; // No navigation needed
    scaleState.primaryScaleIndex = (scaleState.primaryScaleIndex + 1) % scaleState.selectedScales.length;
    updateCurrentScaleDisplay();
    return true;
}

// Function to navigate to previous scale
function navigateToPreviousScale() {
    if (scaleState.selectedScales.length <= 1) return false; // No navigation needed
    scaleState.primaryScaleIndex = (scaleState.primaryScaleIndex - 1 + scaleState.selectedScales.length) % scaleState.selectedScales.length;
    updateCurrentScaleDisplay();
    return true;
}

// Function to get the current primary root note
function getPrimaryRootNote() {
    let rootNote;
    if (Array.isArray(scaleState.selectedRootNote)) {
        if (scaleState.selectedRootNote.length === 0) return 'C';
        if (scaleState.primaryRootNoteIndex >= scaleState.selectedRootNote.length) {
            scaleState.primaryRootNoteIndex = 0; // Reset if index is out of bounds
        }
        rootNote = scaleState.selectedRootNote[scaleState.primaryRootNoteIndex];
    } else {
        rootNote = scaleState.selectedRootNote;
    }

    // Return the preferred display version of this root note
    return getPreferredDisplay(rootNote);
}

// Function to navigate to next root note
function navigateToNextRootNote() {
    if (!Array.isArray(scaleState.selectedRootNote) || scaleState.selectedRootNote.length <= 1) return false; // No navigation needed
    scaleState.primaryRootNoteIndex = (scaleState.primaryRootNoteIndex + 1) % scaleState.selectedRootNote.length;
    updateCurrentScaleDisplay();
    return true;
}

// Function to navigate to previous root note
function navigateToPreviousRootNote() {
    if (!Array.isArray(scaleState.selectedRootNote) || scaleState.selectedRootNote.length <= 1) return false; // No navigation needed
    scaleState.primaryRootNoteIndex = (scaleState.primaryRootNoteIndex - 1 + scaleState.selectedRootNote.length) % scaleState.selectedRootNote.length;
    updateCurrentScaleDisplay();
    return true;
}

// "Exclusive" navigation: unlike navigateToNext/PreviousScale/RootNote above
// (which step through whatever is currently in the multi-select selection
// array) are no-ops. These instead step through the FULL domain
// (all 12 roots / all modes of the current family / all families / the full
// family x mode sequence) and always replace the selection wholesale.

const EXCLUSIVE_NAV_CHROMATIC_NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/**
 * Apply a new primary root and/or scale, refresh the display, and keep the
 * detailed browser tables' highlighting in sync.
 * @param {{rootNote?: string, family?: string, modeNum?: number}} selection
 */
function applyExclusiveSelection(selection) {
    if (selection.rootNote !== undefined) {
        scaleState.selectedRootNote = [selection.rootNote];
        scaleState.primaryRootNoteIndex = 0;
    }
    if (selection.family !== undefined && selection.modeNum !== undefined) {
        scaleState.selectedScales = [`${selection.family}-${selection.modeNum}`];
        scaleState.primaryScaleIndex = 0;
    }
    updateCurrentScaleDisplay();
    createHeptatonicScaleTable();
}

function navigateRootUpExclusive() {
    const currentIndex = getChromaticPosition(getPrimaryRootNote());
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextNote = EXCLUSIVE_NAV_CHROMATIC_NOTES[(startIndex + 1) % EXCLUSIVE_NAV_CHROMATIC_NOTES.length];
    applyExclusiveSelection({ rootNote: nextNote });
    return true;
}

function navigateRootDownExclusive() {
    const currentIndex = getChromaticPosition(getPrimaryRootNote());
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const prevNote = EXCLUSIVE_NAV_CHROMATIC_NOTES[(startIndex - 1 + EXCLUSIVE_NAV_CHROMATIC_NOTES.length) % EXCLUSIVE_NAV_CHROMATIC_NOTES.length];
    applyExclusiveSelection({ rootNote: prevNote });
    return true;
}

function navigateModeUpExclusive() {
    const primaryScale = getPrimaryScale();
    if (!primaryScale) return false;
    const [family, modeStr] = primaryScale.split('-');
    const modeCount = HeptatonicScales[family].length;
    const nextMode = (parseInt(modeStr, 10) % modeCount) + 1;
    applyExclusiveSelection({ family, modeNum: nextMode });
    return true;
}

function navigateModeDownExclusive() {
    const primaryScale = getPrimaryScale();
    if (!primaryScale) return false;
    const [family, modeStr] = primaryScale.split('-');
    const modeCount = HeptatonicScales[family].length;
    const prevMode = ((parseInt(modeStr, 10) - 2 + modeCount) % modeCount) + 1;
    applyExclusiveSelection({ family, modeNum: prevMode });
    return true;
}

function navigateScaleFamilyUpExclusive() {
    const primaryScale = getPrimaryScale();
    if (!primaryScale) return false;
    const [family, modeStr] = primaryScale.split('-');
    const families = Object.keys(HeptatonicScales);
    const familyIndex = families.indexOf(family);
    const nextFamily = families[(familyIndex + 1) % families.length];
    const modeNum = Math.min(parseInt(modeStr, 10), HeptatonicScales[nextFamily].length);
    applyExclusiveSelection({ family: nextFamily, modeNum });
    return true;
}

function navigateScaleFamilyDownExclusive() {
    const primaryScale = getPrimaryScale();
    if (!primaryScale) return false;
    const [family, modeStr] = primaryScale.split('-');
    const families = Object.keys(HeptatonicScales);
    const familyIndex = families.indexOf(family);
    const prevFamily = families[(familyIndex - 1 + families.length) % families.length];
    const modeNum = Math.min(parseInt(modeStr, 10), HeptatonicScales[prevFamily].length);
    applyExclusiveSelection({ family: prevFamily, modeNum });
    return true;
}

// Steps sequentially through every family x mode combination as one flat
// list (all 7 modes of the first family, then all 7 of the next, etc.)
function navigateSequentialUpExclusive() {
    const primaryScale = getPrimaryScale();
    if (!primaryScale) return false;
    const [family, modeStr] = primaryScale.split('-');
    const families = Object.keys(HeptatonicScales);
    const familyIndex = families.indexOf(family);
    const modeCount = HeptatonicScales[family].length;
    let nextFamilyIndex = familyIndex;
    let nextMode = parseInt(modeStr, 10) + 1;
    if (nextMode > modeCount) {
        nextMode = 1;
        nextFamilyIndex = (familyIndex + 1) % families.length;
    }
    applyExclusiveSelection({ family: families[nextFamilyIndex], modeNum: nextMode });
    return true;
}

function navigateSequentialDownExclusive() {
    const primaryScale = getPrimaryScale();
    if (!primaryScale) return false;
    const [family, modeStr] = primaryScale.split('-');
    const families = Object.keys(HeptatonicScales);
    const familyIndex = families.indexOf(family);
    let prevMode = parseInt(modeStr, 10) - 1;
    let prevFamilyIndex = familyIndex;
    if (prevMode < 1) {
        prevFamilyIndex = (familyIndex - 1 + families.length) % families.length;
        prevMode = HeptatonicScales[families[prevFamilyIndex]].length;
    }
    applyExclusiveSelection({ family: families[prevFamilyIndex], modeNum: prevMode });
    return true;
}

// Utility functions to manage selected scales
function getSelectedScales() {
    return scaleState.selectedScales.slice(); // Return a copy of the array
}

function clearSelectedScales() {
    scaleState.selectedScales = [];
    scaleState.primaryScaleIndex = 0;
    // Refresh the table to update visual state
    createHeptatonicScaleTable();
    updateCurrentScaleDisplay();
}

function addSelectedScale(scaleId) {
    if (!scaleState.selectedScales.includes(scaleId)) {
        scaleState.selectedScales.push(scaleId);

        // Precompute chords for this scale with current root note(s)
        const rootNotes = Array.isArray(scaleState.selectedRootNote) ? scaleState.selectedRootNote : [scaleState.selectedRootNote];
        for (const rootNote of rootNotes) {
            precomputeScaleChords(scaleId, rootNote);
        }

        // If this is the first scale being added, make it primary
        if (scaleState.selectedScales.length === 1) {
            scaleState.primaryScaleIndex = 0;
        }
        // Refresh the table to update visual state
        createHeptatonicScaleTable();
        updateCurrentScaleDisplay();
    }
}

function removeSelectedScale(scaleId) {
    const index = scaleState.selectedScales.indexOf(scaleId);
    if (index > -1) {
        scaleState.selectedScales.splice(index, 1);
        // Adjust primary scale index if needed
        if (scaleState.primaryScaleIndex >= scaleState.selectedScales.length) {
            scaleState.primaryScaleIndex = Math.max(0, scaleState.selectedScales.length - 1);
        } else if (scaleState.primaryScaleIndex > index) {
            scaleState.primaryScaleIndex--;
        }
        // Refresh the table to update visual state
        createHeptatonicScaleTable();
        updateCurrentScaleDisplay();
    }
}

function toggleSelectionMode() {
    scaleState.exclusiveMode = !scaleState.exclusiveMode;

    // If switching to exclusive mode and multiple items are selected, keep only the first one
    if (scaleState.exclusiveMode && scaleState.selectedScales.length > 1) {
        scaleState.selectedScales = [scaleState.selectedScales[0]];
        scaleState.primaryScaleIndex = 0;
    }

    // Handle root note selection mode change
    if (scaleState.exclusiveMode && Array.isArray(scaleState.selectedRootNote)) {
        // Switch to exclusive mode - keep only the first selected root note
        scaleState.selectedRootNote = scaleState.selectedRootNote[0];
        scaleState.primaryRootNoteIndex = 0;
    }

    // console.log(`Selection mode: ${exclusiveMode ? 'Exclusive' : 'Multiple'}`);
    // Don't call createHeptatonicScaleTable here - let the event listener handle it
    persistScaleSelection();
}

/**
 * Get precomputed chords for the primary selected scale with the primary root note
 * @returns {object|null} Chord data or null if no primary scale/root
 */
function getPrimaryScaleChords() {
    const primaryScale = getPrimaryScale();
    const primaryRootNote = getPrimaryRootNote();

    if (!primaryScale || !primaryRootNote) {
        return null;
    }

    return getChordsForScale(primaryScale, primaryRootNote);
}

/**
 * Get precomputed chords for all selected scales with current root note
 * @returns {Array<object>} Array of chord data for all selected scales
 */
function getAllSelectedScaleChords() {
    const primaryRootNote = getPrimaryRootNote();
    if (!primaryRootNote) {
        return [];
    }

    return scaleState.selectedScales.map(scaleId => {
        return getChordsForScale(scaleId, primaryRootNote);
    }).filter(chordData => chordData !== null);
}

/**
 * Refresh chord cache for all selected scales when root note changes
 */
function refreshChordsForRootNote() {
    const primaryRootNote = getPrimaryRootNote();
    if (!primaryRootNote) {
        return;
    }

    scaleState.selectedScales.forEach(scaleId => {
        precomputeScaleChords(scaleId, primaryRootNote);
    });
}

/**
 * Set the primary root note by note name
 * @param {string} rootNote - Root note name (e.g., 'C', 'D♯', 'F#')
 */
function setPrimaryRootNote(rootNote) {
    // Normalize the note name to handle both sharp and flat representations
    const normalizedNote = rootNote.replace('#', '♯').replace('b', '♭');

    if (Array.isArray(scaleState.selectedRootNote)) {
        const index = scaleState.selectedRootNote.findIndex(note => note === normalizedNote || note === rootNote);
        if (index !== -1) {
            scaleState.primaryRootNoteIndex = index;
            updateCurrentScaleDisplay();
            return true;
        }
    } else {
        scaleState.selectedRootNote = normalizedNote;
        updateCurrentScaleDisplay();
        return true;
    }
    return false;
}

/**
 * Set the primary scale by scale name
 * @param {string} scaleName - Scale name (e.g., 'Major-1', 'Minor-1')
 */
function setPrimaryScale(scaleName) {
    const index = scaleState.selectedScales.findIndex(scale => scale === scaleName);
    if (index !== -1) {
        scaleState.primaryScaleIndex = index;
        updateCurrentScaleDisplay();
        return true;
    } else {
        // If scale isn't in selected scales, add it and make it primary
        scaleState.selectedScales.push(scaleName);
        scaleState.primaryScaleIndex = scaleState.selectedScales.length - 1;
        updateCurrentScaleDisplay();
        return true;
    }
}

export {
    scaleState,
    persistScaleSelection,
    getChromaticPosition,
    getPreferredDisplay,
    setEnharmonicPreference,
    sortRootNotesAndUpdateIndex,
    getPrimaryScale,
    navigateToNextScale,
    navigateToPreviousScale,
    getPrimaryRootNote,
    navigateToNextRootNote,
    navigateToPreviousRootNote,
    navigateRootUpExclusive,
    navigateRootDownExclusive,
    navigateModeUpExclusive,
    navigateModeDownExclusive,
    navigateScaleFamilyUpExclusive,
    navigateScaleFamilyDownExclusive,
    navigateSequentialUpExclusive,
    navigateSequentialDownExclusive,
    toggleSelectionMode,
    setPrimaryRootNote,
    setPrimaryScale,
    refreshChordsForRootNote
};
