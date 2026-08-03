// Chord-progression input parsing and pattern precomputation
// (progressionBuilder.js's tokenize -> parse -> match-fretboard-patterns
// pipeline). Roman-numeral parsing/resolution itself lives in
// src/theory/roman.js (REFACTOR_PLAN.md Phase 2) - this module is what
// turns a raw input string into parsed chord objects and, for each one,
// the fretboard patterns/arpeggiation notes the UI displays.
//
// getFretboardForProgression is imported back from the barrel
// (src/progression/index.js, formerly progressionBuilder.js, renamed in
// Phase 4's final step) rather than moved here: its real callers (the
// fretboard-display cluster) live in src/progression/fretboardDisplay.js,
// which cross-imports it from the same place - same two-way-import shape
// REFACTOR_PLAN.md Phase 3 used between src/fretboard/ui/{controls,chordGrid}.js
// and src/fretboard/index.js - safe because nothing here is read at module
// top level. getChordDisplayName is imported from src/progression/chordCard.js
// instead, where it moved in Phase 4 step 7 - see that file's header for why.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { parseChordToken, resolveRomanChord } from '../theory/roman';
import { stripOctave as notationStripOctave } from '../theory/notation';
import {
    getActiveConfig as getActiveInstrumentConfig,
    getNoteAtStringFret
} from '../tuning';
import { selectGripFromPositions } from '../chordFingering';
import { progressionState } from './state';
import { getFretboardForProgression } from '.';
import { getChordDisplayName } from './chordCard';

/**
 * Clear all caches and reset state
 */
function clearCache() {
    progressionState.parsedTokensCache = [];
    progressionState.lastInputString = '';
    progressionState.precomputedPatternData.clear();
    progressionState.selectedPatternIndexes.clear(); // Clear pattern selections

    // Clear debounce timer if it exists
    if (progressionState.inputDebounceTimer) {
        clearTimeout(progressionState.inputDebounceTimer);
        progressionState.inputDebounceTimer = null;
    }
}

/**
 * Compare two token arrays to find differences
 * @param {Array} oldTokens - Previous parsed tokens
 * @param {Array} newTokens - New parsed tokens
 * @returns {Object} Object with added, removed, and changed indices
 */
function compareTokenArrays(oldTokens, newTokens) {
    const changes = {
        added: [],
        removed: [],
        changed: [],
        unchanged: []
    };

    const maxLength = Math.max(oldTokens.length, newTokens.length);

    for (let i = 0; i < maxLength; i++) {
        if (i >= oldTokens.length) {
            // New token added
            changes.added.push(i);
        } else if (i >= newTokens.length) {
            // Token removed
            changes.removed.push(i);
        } else if (oldTokens[i] !== newTokens[i]) {
            // Token changed
            changes.changed.push(i);
        } else {
            // Token unchanged
            changes.unchanged.push(i);
        }
    }

    return changes;
}

/**
 * Precompute pattern data for a chord to avoid recalculation on hover
 * @param {Object} chord - Chord object
 * @param {number} index - Chord index
 * @returns {Object} Precomputed pattern data
 */
function precomputePatternData(chord, index) {
    if (!chord.chordInfo || !chord.chordInfo.notes) {
        return {
            patterns: [],
            chordNotes: [],
            displayName: getChordDisplayName(chord, index),
            hasPatterns: false,
            chord // Store reference to chord object for staleness detection
        };
    }

    const patterns = getChordPatternMatches(chord);
    const chordNotes = chord.chordInfo.notes.map(note => notationStripOctave(note));
    const displayName = getChordDisplayName(chord, index);

    // Debug logging to track when pattern data is computed
    console.log(`Computing pattern data for chord ${index}: ${displayName} (${patterns.length} patterns found)`);
    // for (let i = 0; i < patterns.length; i++) {
    //     const pattern = patterns[i];
    //     console.log(`  Pattern ${i}: ${JSON.stringify(pattern)}`);
    // }


    return {
        patterns,
        chordNotes,
        displayName,
        hasPatterns: patterns.length > 0,
        chord // Store reference to chord object for staleness detection
    };
}

/**
 * Parse a chord progression input string
 * @param {string} progressionText - Input text with chord names and/or roman numerals
 * @returns {Array} Array of parsed chord objects
 */
function parseProgressionInput(progressionText) {
    if (!progressionText || !progressionText.trim()) {
        clearCache();
        return [];
    }

    const trimmedText = progressionText.trim();

    // Check if input hasn't changed
    if (trimmedText === progressionState.lastInputString) {
        return progressionState.currentProgression;
    }

    const newTokens = trimmedText.split(/\s+/).filter(token => token.trim());
    const oldTokens = progressionState.lastInputString ? progressionState.lastInputString.split(/\s+/).filter(token => token.trim()) : [];

    // Compare tokens to find what changed
    const changes = compareTokenArrays(oldTokens, newTokens);

    // Determine if we should do incremental updates
    const totalChanges = changes.added.length + changes.changed.length + changes.removed.length;
    const hasSignificantChanges = totalChanges > 0;
    const majorityUnchanged = changes.unchanged.length > totalChanges;
    const shouldUseIncremental = hasSignificantChanges && majorityUnchanged && changes.unchanged.length > 0;

    // Additional checks for when to force full reparse:
    // 1. If the number of tokens changed significantly
    const tokenCountChanged = Math.abs(oldTokens.length - newTokens.length) > 0;
    // 2. If more than half the tokens are different
    const majorityChanged = totalChanges >= Math.ceil(newTokens.length / 2);

    // Force full reparse if there are major structural changes
    const forceFullReparse = tokenCountChanged || majorityChanged;

    // If we can reuse most of the existing progression, do incremental updates
    if (shouldUseIncremental && !forceFullReparse) {
        return updateProgressionIncremental(newTokens, changes);
    }

    // Otherwise, do a full reparse and clear all caches
    clearCache();
    progressionState.selectedPatternIndexes.clear(); // Clear pattern selections on full reparse

    const progression = [];
    progressionState.parsedTokensCache = [];

    for (let token of newTokens) {
        token = token.trim();
        if (!token) continue;

        const chordData = parseChordToken(token);
        if (chordData) {
            progression.push(chordData);
            progressionState.parsedTokensCache.push(token);
        }
    }

    progressionState.lastInputString = trimmedText;

    // Process default pattern selections after parsing
    processDefaultPatternSelections(progression);

    return progression;
}

/**
 * Update progression incrementally based on token changes
 * @param {Array} newTokens - New token array
 * @param {Object} changes - Changes detected between old and new tokens
 * @returns {Array} Updated progression
 */
function updateProgressionIncremental(newTokens, changes) {
    let updatedProgression = [...progressionState.currentProgression];

    // Handle removed tokens (work backwards to maintain indices)
    for (let i = changes.removed.length - 1; i >= 0; i--) {
        const removeIndex = changes.removed[i];
        if (removeIndex < updatedProgression.length) {
            updatedProgression.splice(removeIndex, 1);
            // Remove cached pattern data
            progressionState.precomputedPatternData.delete(removeIndex);
            // Remove pattern selection for this index
            progressionState.selectedPatternIndexes.delete(removeIndex);

            // Shift pattern data indices down for higher indices
            const newPatternData = new Map();
            const newPatternSelections = new Map();

            for (let [index, data] of progressionState.precomputedPatternData.entries()) {
                if (index > removeIndex) {
                    newPatternData.set(index - 1, data);
                } else {
                    newPatternData.set(index, data);
                }
            }

            for (let [index, selection] of progressionState.selectedPatternIndexes.entries()) {
                if (index > removeIndex) {
                    newPatternSelections.set(index - 1, selection);
                } else {
                    newPatternSelections.set(index, selection);
                }
            }

            progressionState.precomputedPatternData = newPatternData;
            progressionState.selectedPatternIndexes = newPatternSelections;
        }
    }

    // Handle changed tokens
    for (let changeIndex of changes.changed) {
        if (changeIndex < newTokens.length && changeIndex < updatedProgression.length) {
            const newToken = newTokens[changeIndex];
            const chordData = parseChordToken(newToken);
            if (chordData) {
                updatedProgression[changeIndex] = chordData;
                // Clear cached pattern data for this index
                progressionState.precomputedPatternData.delete(changeIndex);
                // Clear pattern selection for this index since chord changed
                progressionState.selectedPatternIndexes.delete(changeIndex);
            }
        }
    }

    // Handle added tokens
    for (let addIndex of changes.added) {
        if (addIndex < newTokens.length) {
            const newToken = newTokens[addIndex];
            const chordData = parseChordToken(newToken);
            if (chordData) {
                // Insert at the correct position
                updatedProgression.splice(addIndex, 0, chordData);
                // Shift pattern data indices up for higher indices
                const newPatternData = new Map();
                const newPatternSelections = new Map();

                for (let [index, data] of progressionState.precomputedPatternData.entries()) {
                    if (index >= addIndex) {
                        newPatternData.set(index + 1, data);
                    } else {
                        newPatternData.set(index, data);
                    }
                }

                for (let [index, selection] of progressionState.selectedPatternIndexes.entries()) {
                    if (index >= addIndex) {
                        newPatternSelections.set(index + 1, selection);
                    } else {
                        newPatternSelections.set(index, selection);
                    }
                }

                progressionState.precomputedPatternData = newPatternData;
                progressionState.selectedPatternIndexes = newPatternSelections;
            }
        }
    }

    // Update cache
    progressionState.parsedTokensCache = [...newTokens];
    progressionState.lastInputString = newTokens.join(' ');

    // Process default pattern selections for the updated progression
    processDefaultPatternSelections(updatedProgression);

    return updatedProgression;
}

/**
 * Process default pattern selections for chords that have specified pattern notation
 * @param {Array} progression - Array of parsed chord objects
 */
function processDefaultPatternSelections(progression) {
    progression.forEach((chord, index) => {
        if (chord && chord.defaultPatternIndex !== undefined) {
            // Resolve the chord if it's a Roman numeral to get the chord info
            let chordToCheck = chord;
            if (chord.type === 'roman') {
                const resolvedChord = resolveRomanChord(chord, progressionState.useSeventhChords);
                if (resolvedChord && resolvedChord.chordInfo) {
                    chordToCheck = resolvedChord;
                } else {
                    console.warn(`Could not resolve Roman numeral chord for pattern selection: ${chord.originalToken}`);
                    return;
                }
            }

            // Get the available patterns for this chord
            const patterns = getChordPatternMatches(chordToCheck);

            if (patterns && patterns.length > 0) {
                // Validate that the requested pattern index exists
                if (chord.defaultPatternIndex < patterns.length) {
                    progressionState.selectedPatternIndexes.set(index, chord.defaultPatternIndex);
                    console.log(`Set default pattern ${chord.defaultPatternIndex + 1} for chord ${index}: ${chord.originalToken}`);
                } else {
                    console.warn(`Pattern index ${chord.defaultPatternIndex + 1} not available for chord ${chord.originalToken}. Only ${patterns.length} patterns found.`);
                }
            } else {
                console.warn(`No patterns found for chord ${chord.originalToken}`);
            }
        }
    });
}


/**
 * Get all chord pattern matches for a chord
 * @param {Object} chord - Chord object with notes
 * @returns {Array} Array of pattern matches
 */
function getChordPatternMatches(chord) {
    const fretboard = getFretboardForProgression();
    if (!fretboard || !chord.chordInfo || !chord.chordInfo.notes) {
        return [];
    }

    console.log('Chord: ', chord);
    console.log('Chord notes: ', chord.chordInfo.notes);
    const chordNotes = chord.chordInfo.notes.map(note => notationStripOctave(note));
    const rootNote = chordNotes[0];

    let patterns = fretboard.findChordPatternMatches(chordNotes, rootNote);

    // The canned chordPatterns.js shape library only covers standard 6-string
    // guitar tuning (see Fretboard.findChordPatternMatches), so it always
    // returns no matches for any other tuning/string count. Synthesize a
    // single best-effort grip from the actual note positions on the active
    // fretboard so the mini fretboards / pattern selector / playback still
    // have something to show, instead of going blank.
    if (patterns.length === 0) {
        const allPositions = [];
        chordNotes.forEach(note => {
            fretboard.findNotePositions(note).forEach(pos => {
                allPositions.push({ string: pos.string, fret: pos.fret, note });
            });
        });
        const grip = selectGripFromPositions(allPositions, 0);
        if (grip.length > 0) {
            patterns = [{
                patternName: null,
                pattern: { name: 'Best Effort' },
                rootPosition: { string: grip[0].string, fret: grip[0].fret },
                positions: grip.map(p => ({ string: p.string, fret: p.fret })),
                patternNotes: grip.map(p => p.note)
            }];
        }
    }

    // Add interval information to each pattern
    if (chord.chordInfo.intervals && patterns.length > 0) {
        patterns.forEach(pattern => {
            console.log(`Pattern: ${JSON.stringify(pattern)}`);
            if (pattern.patternNotes) {
                for(var p = 0; p < pattern.patternNotes.length; p++) {
                    const strippedNote = pattern.patternNotes[p];
                    var position = pattern.positions[p];
                    // Get the note at this position
                    // const stringTuning = ['E', 'B', 'D', 'G', 'B', 'E']; // Standard tuning
                    // const stringIndex = position.string - 1; // Convert to 0-based
                    // const openStringNote = stringTuning[stringIndex];
                    // const noteAtFret = getNote(openStringNote, position.fret);
                    // const strippedNote = notationStripOctave(noteAtFret);
                    console.log(`String Note: ${strippedNote}`);

                    // Find this note in the chord notes array to get the corresponding interval
                    const chordNoteIndex = chordNotes.findIndex(note =>
                        notationStripOctave(note) === strippedNote
                    );
                    console.log(`Chord note index for ${strippedNote}: ${chordNoteIndex}`);
                    // console.log(`Position data for ${strippedNote}:`, position);
                    if (chordNoteIndex !== -1 && chord.chordInfo.intervals[chordNoteIndex]) {
                        var intervalName = chord.chordInfo.intervals[chordNoteIndex];
                        if(intervalName === "P1")
                            position.interval = "R";
                        else
                            position.interval = intervalName;
                    } else {
                        // Fallback: if note not found in chord notes, mark as unknown
                        position.interval = '?';
                    }
                }
            }
        });
    }

    // Sort patterns by their lowest fret number for consistency
    patterns.sort((a, b) => {
        const aMinFret = Math.min(...a.positions.map(p => p.fret));
        const bMinFret = Math.min(...b.positions.map(p => p.fret));
        return aMinFret - bMinFret;
    });

    // Add arpeggiation notes for each pattern
    if (patterns.length > 0) {
        patterns.forEach((pattern, patternIndex) => {
            pattern.arpeggiationNotes = collectArpeggiationNotes(pattern, chordNotes, chord.chordInfo.intervals);
            console.log(`Pattern ${patternIndex} has ${pattern.arpeggiationNotes.length} arpeggiation notes:`, pattern.arpeggiationNotes);
        });
    }

    return patterns;
}

/**
 * Collect arpeggiation notes for a chord pattern
 * @param {Object} pattern - Pattern object with positions
 * @param {Array} chordNotes - Array of chord note names (without octaves)
 * @param {Array} intervals - Array of interval names corresponding to chord notes
 * @returns {Array} Array of arpeggiation note objects
 */
function collectArpeggiationNotes(pattern, chordNotes, intervals) {
    if (!pattern || !pattern.positions || pattern.positions.length === 0) {
        return [];
    }

    const stringCount = getActiveInstrumentConfig().stringCount;

    // Find the minimum fret of the pattern
    const minFret = Math.min(...pattern.positions.map(p => p.fret));
    const maxFret = minFret + 6; // Maximum 5 frets above minimum

    // Get all positions that are part of the pattern
    const patternPositions = new Set();
    pattern.positions.forEach(pos => {
        patternPositions.add(`${pos.string}-${pos.fret}`);
    });

    const arpeggiationNotes = [];

    // Check each string (0-based, 0 = highest string)
    for (let stringIndex = 0; stringIndex < stringCount; stringIndex++) {
        // Check each fret from minFret to maxFret
        for (let fret = minFret; fret <= maxFret; fret++) {
            const positionKey = `${stringIndex}-${fret}`;
            // Skip if this position is already part of the pattern
            if (patternPositions.has(positionKey)) {
                continue;
            }

            // Calculate what note is at this string and fret
            const noteAtFret = getNoteAtStringFret(stringIndex, fret);
            if (!noteAtFret) {
                continue;
            }
            const strippedNote = noteAtFret.letter;

            // Check if this note is part of the chord notes
            const chordNoteIndex = chordNotes.findIndex(note =>
                notationStripOctave(note) === strippedNote
            );

            if (chordNoteIndex !== -1) {
                // This note is part of the chord but not part of the pattern
                let intervalName = intervals && intervals[chordNoteIndex] ? intervals[chordNoteIndex] : '?';

                // Convert P1 to R for root note display consistency
                if (intervalName === "P1") {
                    intervalName = "R";
                }

                arpeggiationNotes.push({
                    string: stringIndex,
                    fret: fret,
                    note: strippedNote,
                    interval: intervalName
                });
            }
        }
    }

    // Sort arpeggiation notes by string (high to low) then by fret (low to high)
    arpeggiationNotes.sort((a, b) => {
        if (a.string !== b.string) {
            return a.string - b.string; // Lower string number first (high E string = 1)
        }
        return a.fret - b.fret; // Lower fret first
    });

    return arpeggiationNotes;
}

export {
    clearCache,
    compareTokenArrays,
    precomputePatternData,
    parseProgressionInput,
    updateProgressionIncremental,
    processDefaultPatternSelections,
    getChordPatternMatches,
    collectArpeggiationNotes
};
