/**
 * CAGED chord-pattern matching and generic fingering-shape scoring for the
 * main Fretboard. Pure with respect to the DOM - takes a tuning array and
 * fret count instead of reading `this.tuning`/`this.fretCount`, and calls
 * src/fretboard/geometry.js's functions instead of `this.calculateNote`
 * etc. - but still depends on chordPatterns.js's canned 6-string shape
 * library and tuning.js's isStandardGuitarTuning check.
 *
 * Lifted from the Fretboard class in src/frets.js as part of
 * REFACTOR_PLAN.md Phase 3. The class keeps thin methods of the same name
 * that forward to these, so its public API (and the Phase 0 characterization
 * tests that call them as instance methods) is unchanged.
 */

import { getChordPatterns } from '../chordPatterns';
import { isStandardGuitarTuning } from '../tuning';
import { normalizeNote, noteArrayContains } from '../theory/notation';
import { extractNoteName, getNoteAt, findNotePositions } from './geometry';

/**
 * Calculate concrete {string, fret, interval, label} positions for a
 * chordPatterns.js shape anchored at a given root fret.
 */
export function calculateChordPatternPositions(pattern, rootFret, fretCount) {
    const positions = [];

    // Check if this pattern is restricted to open voicing
    if (pattern.openVoicingOnly && pattern.fixedPosition !== undefined) {
        if (rootFret !== pattern.fixedPosition) {
            return null; // Pattern only works at fixed position
        }
    }

    // Check fret range constraints
    if (rootFret < pattern.minFret || rootFret > pattern.maxFret) {
        return null;
    }

    // Calculate positions for each note in the pattern
    for (const note of pattern.notes) {
        const actualFret = rootFret + note.fretOffset;

        // Check if fret is valid (0-15 range)
        if (actualFret < 0 || actualFret > fretCount) {
            continue; // Skip invalid fret positions
        }

        positions.push({
            string: note.string,
            fret: actualFret,
            interval: note.interval,
            label: note.label
        });
    }

    return positions.length > 0 ? positions : null;
}

/**
 * Find all possible chord pattern matches for given chord notes
 * @param {Array} tuning - The fretboard's active tuning
 * @param {number} fretCount - The fretboard's fret count
 * @param {Array} chordNotes - Array of note names that make up the chord
 * @param {string} rootNote - The root note of the chord
 * @param {Array} patternNames - Optional array of specific pattern names to check
 * @returns {Array} Array of matching pattern results
 */
export function findChordPatternMatches(tuning, fretCount, chordNotes, rootNote, patternNames = null) {
    // The canned chordPatterns.js shape library only encodes standard
    // 6-string guitar tuning - for any other tuning/string count, skip
    // straight to the dynamic best-effort grip fallback in the callers
    // below rather than matching (and mis-fretting) the wrong shapes.
    if (!isStandardGuitarTuning(tuning)) {
        return [];
    }

    const patterns = getChordPatterns();
    const matches = [];

    // Convert chord notes to a set for easy lookup, normalizing the notation
    const chordNoteSet = new Set(chordNotes.map(note => normalizeNote(extractNoteName(note))));

    // Extract just the note name from the root note (remove octave)
    const rootNoteName = extractNoteName(rootNote);

    // Check each pattern (or only specified patterns)
    const patternsToCheck = patternNames ?
        patternNames.filter(name => patterns[name]).map(name => ({name, pattern: patterns[name]})) :
        Object.entries(patterns).map(([name, pattern]) => ({name, pattern}));

    for (const {name, pattern} of patternsToCheck) {
        // console.log(`Checking pattern: ${name} for root note: ${rootNoteName} (all octaves)`);
        // Find ALL positions of the root note (all octaves) for this pattern
        const rootPositions = findNotePositions(tuning, fretCount, rootNoteName);

        for (const rootPos of rootPositions) {
            // Only check positions on the pattern's root string
            if (rootPos.string !== pattern.rootString) {
                // console.log(`Skipping pattern ${name} for root ${rootNoteName} at ${rootPos.string}:${rootPos.fret} - root string mismatch (expected string ${pattern.rootString})`);
                continue;
            }

            // console.log(`Testing pattern ${name} with root ${rootNoteName} at string ${rootPos.string}, fret ${rootPos.fret}`);

            const positions = calculateChordPatternPositions(pattern, rootPos.fret, fretCount);
            if (!positions) {
                // console.log(`Skipping pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - invalid positions`);
                continue;
            }

            // Check if all pattern notes match the chord
            let isValidMatch = true;
            const patternNotes = [];

            for (const pos of positions) {
                const noteAtPosition = getNoteAt(tuning, fretCount, pos.string, pos.fret);
                if (noteAtPosition) {
                    // console.log(`Found note ${noteAtPosition} at position ${pos.string}:${pos.fret}`);
                    const noteName = normalizeNote(extractNoteName(noteAtPosition));
                    patternNotes.push(noteName);

                    // Check if this note is in the chord using enharmonic matching
                    if (!noteArrayContains(Array.from(chordNoteSet), noteName)) {
                        isValidMatch = false;
                        // console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - note ${noteName} not in chord [${Array.from(chordNoteSet).join(', ')}]`);
                        break;
                    }
                } else {
                    // console.log(`Pattern ${name} - no note found at string ${pos.string}, fret ${pos.fret}`);
                    isValidMatch = false;
                    break;
                }
            }

            if (isValidMatch && patternNotes.length > 0) {
                // Additional check: ensure all chord notes are represented in the pattern using enharmonic matching
                const chordNotesArray = Array.from(chordNoteSet);
                const allChordNotesPresent = chordNotesArray.every(chordNote =>
                    noteArrayContains(patternNotes, chordNote)
                );


                if (allChordNotesPresent) {
                console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - ${allChordNotesPresent ? 'VALID MATCH' : 'REJECTED'}`);
                console.log(`  Pattern details: ${JSON.stringify(pattern)}`);
                console.log(`  Pattern notes: ${patternNotes.join(', ')}`);
                console.log(`  Chord notes: ${Array.from(chordNoteSet).join(', ')}`);
                matches.push({
                    patternName: name,
                    pattern: pattern,
                    rootPosition: rootPos,
                    positions: positions,
                        patternNotes: patternNotes
                    });
                    // console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - VALID MATCH (all chord notes present)`);
                } else {
                    // console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - REJECTED (missing chord notes: ${Array.from(chordNoteSet).filter(note => !patternNoteSet.has(note)).join(', ')})`);
                }
            }
        }
    }

    return matches;
}

/**
 * Given raw fretboard positions for a set of chord notes (as produced by
 * findNotePositions per note), pick a compact, playable fingering shape -
 * one position per note, preferring positions clustered within a few frets
 * of each other over the widest possible stretch.
 */
export function findOptimalChordShape(positions, chordNotes) {
    // Group positions by note
    const positionsByNote = {};
    positions.forEach(pos => {
        if (!positionsByNote[pos.note]) {
            positionsByNote[pos.note] = [];
        }
        positionsByNote[pos.note].push(pos);
    });

    // Try to find a compact chord shape
    const chordShape = [];
    const usedStrings = new Set();

    // Prioritize positions in a reasonable fret range (3-7 frets)
    for (let centerFret = 3; centerFret <= 12; centerFret++) {
        const candidateShape = [];
        const tempUsedStrings = new Set();

        chordNotes.forEach(note => {
            const noteName = extractNoteName(note);
            const notePositions = positionsByNote[noteName] || [];

            // Find closest position to centerFret on an unused string
            const bestPos = notePositions
                .filter(pos => !tempUsedStrings.has(pos.string))
                .filter(pos => Math.abs(pos.fret - centerFret) <= 4)
                .sort((a, b) => Math.abs(a.fret - centerFret) - Math.abs(b.fret - centerFret))[0];

            if (bestPos) {
                candidateShape.push(bestPos);
                tempUsedStrings.add(bestPos.string);
            }
        });

        // If we found a good shape (at least 3 notes), use it
        if (candidateShape.length >= Math.min(3, chordNotes.length)) {
            return candidateShape.sort((a, b) => a.string - b.string);
        }
    }

    // Fallback: just take the first position of each note
    chordNotes.forEach(note => {
        const noteName = extractNoteName(note);
        const notePositions = positionsByNote[noteName] || [];
        if (notePositions.length > 0 && !usedStrings.has(notePositions[0].string)) {
            chordShape.push(notePositions[0]);
            usedStrings.add(notePositions[0].string);
        }
    });

    return chordShape.sort((a, b) => a.string - b.string);
}
