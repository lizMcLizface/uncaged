/**
 * Musical Notation System with Proper Enharmonic Handling
 * 
 * This module provides functions for converting between MIDI numbers and
 * musically correct note names, with proper enharmonic handling and
 * scale-context-aware notation.
 */

// Musical symbols for proper notation
const SYMBOLS = {
    SHARP: '♯',
    FLAT: '♭',
    DOUBLE_SHARP: '𝄪',
    DOUBLE_FLAT: '𝄫',
    NATURAL: '♮'
};

// Basic chromatic scale using sharps (for reference)
const CHROMATIC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const CHROMATIC_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// Note name order for proper enharmonic spelling
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Scale degree patterns for common scale types
const SCALE_PATTERNS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10]
};

/**
 * Basic MIDI to note conversion (without octave format dependencies)
 */
function basicMidiToNote(midiNote) {
    if (typeof midiNote !== 'number' || midiNote < 0 || midiNote > 127) {
        throw new Error("MIDI note must be between 0 and 127");
    }
    
    const octave = Math.floor(midiNote / 12) - 1;
    const semitone = midiNote % 12;
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = noteNames[semitone];
    return `${noteName}/${octave}`;
}

/**
 * Basic note to MIDI conversion (without external dependencies)
 */
function basicNoteToMidi(note) {
    if (typeof note !== 'string') {
        throw new Error("Note must be a string");
    }
    
    note = note.trim();
    
    // Replace unicode symbols with ASCII equivalents for processing
    note = note
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/𝄪/g, '##')
        .replace(/𝄫/g, 'bb')
        .replace(/♮/g, ''); // Natural symbol cancels accidentals
    
    let octave = 4; // Default octave
    
    // Extract octave if present
    if (note.includes('/')) {
        const parts = note.split('/');
        note = parts[0];
        octave = parseInt(parts[1], 10);
    }
    
    // Extract base note and accidentals
    const baseNote = note.charAt(0).toUpperCase();
    const accidentals = note.slice(1);
    
    // Get base MIDI value
    const noteToSemitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    
    if (!(baseNote in noteToSemitone)) {
        throw new Error(`Invalid base note: ${baseNote}`);
    }
    
    const baseSemitone = noteToSemitone[baseNote];
    const accidentalOffset = getAccidentalOffset(accidentals);
    
    const midiNote = (octave + 1) * 12 + baseSemitone + accidentalOffset;
    
    if (midiNote < 0 || midiNote > 127) {
        throw new Error(`MIDI note out of range: ${midiNote}`);
    }
    
    return midiNote;
}

/**
 * Convert a note name to its base note (without accidentals)
 */
function getBaseNote(noteName) {
    return noteName.charAt(0).toUpperCase();
}

/**
 * Get the number of semitones represented by accidentals
 */
function getAccidentalOffset(accidentals) {
    if (!accidentals) return 0;
    
    // Handle various accidental notations
    const normalized = accidentals
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/𝄪/g, '##')
        .replace(/𝄫/g, 'bb');
    
    let offset = 0;
    for (const char of normalized) {
        if (char === '#') offset += 1;
        else if (char === 'b') offset -= 1;
    }
    return offset;
}

/**
 * Get the chromatic distance between two note names
 */
function getNoteDistance(from, to) {
    const noteToSemitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    return (noteToSemitone[to] - noteToSemitone[from] + 12) % 12;
}

/**
 * Create an accidental string from a semitone offset
 */
function createAccidental(offset) {
    if (offset === 0) return '';
    if (offset === 1) return SYMBOLS.SHARP;
    if (offset === -1) return SYMBOLS.FLAT;
    if (offset === 2) return SYMBOLS.DOUBLE_SHARP;
    if (offset === -2) return SYMBOLS.DOUBLE_FLAT;
    
    // For larger offsets, use multiple accidentals
    if (offset > 0) {
        const doubleSharp = Math.floor(offset / 2);
        const singleSharp = offset % 2;
        return SYMBOLS.DOUBLE_SHARP.repeat(doubleSharp) + SYMBOLS.SHARP.repeat(singleSharp);
    } else {
        const offset_abs = Math.abs(offset);
        const doubleFlat = Math.floor(offset_abs / 2);
        const singleFlat = offset_abs % 2;
        return SYMBOLS.DOUBLE_FLAT.repeat(doubleFlat) + SYMBOLS.FLAT.repeat(singleFlat);
    }
}

/**
 * Generate a scale with proper enharmonic spelling
 */
function generateProperScale(rootNote, intervals) {
    const rootBase = getBaseNote(rootNote);
    const rootAccidentals = rootNote.slice(1);
    const rootOffset = getAccidentalOffset(rootAccidentals);
    
    // Get the root's position in the chromatic scale
    const noteToSemitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let currentSemitone = (noteToSemitone[rootBase] + rootOffset + 12) % 12;
    
    // Start with the root note
    const scale = [rootNote];
    
    // Track which note names we've used (one letter per scale degree)
    const noteNameOrder = [...NOTE_NAMES];
    let rootIndex = noteNameOrder.indexOf(rootBase);
    let currentNoteIndex = rootIndex;
    
    // Generate each scale degree using intervals
    for (let i = 0; i < intervals.length; i++) {
        const interval = intervals[i];
        let semitoneStep = 0;
        
        // Convert interval notation to semitones
        switch (interval) {
            case 'H': semitoneStep = 1; break;  // Half step
            case 'W': semitoneStep = 2; break;  // Whole step
            case 'A': semitoneStep = 3; break;  // Augmented step
            case 'P': semitoneStep = 4; break;  // Perfect step (used in some scales)
            default: semitoneStep = 1; break;
        }
        
        currentSemitone = (currentSemitone + semitoneStep) % 12;
        currentNoteIndex = (currentNoteIndex + 1) % 7;
        
        // Get the target note name (next in alphabetical order)
        const targetNoteName = noteNameOrder[currentNoteIndex];
        
        // Calculate what accidental is needed
        const naturalSemitone = noteToSemitone[targetNoteName];
        const neededOffset = (currentSemitone - naturalSemitone + 12) % 12;
        
        // Handle the case where we need to go backwards (e.g., Cb instead of B)
        const actualOffset = neededOffset > 6 ? neededOffset - 12 : neededOffset;
        
        const accidental = createAccidental(actualOffset);
        const noteName = targetNoteName + accidental;
        
        scale.push(noteName);
    }
    
    return scale;
}

/**
 * Create a note translation table based on a scale
 */
function createScaleTranslationTable(rootNote, intervals) {
    const properScale = generateProperScale(rootNote, intervals);
    const translationTable = new Map();
    
    // Create mapping from MIDI numbers to proper note names
    for (let i = 0; i < properScale.length - 1; i++) { // -1 to exclude octave
        const noteName = properScale[i];
        const midiBase = basicNoteToMidi(noteName + '/4');
        
        // Map all octaves of this note
        for (let octave = 0; octave <= 8; octave++) {
            const midi = midiBase + (octave - 4) * 12;
            if (midi >= 0 && midi <= 127) {
                translationTable.set(midi, noteName + '/' + octave);
            }
        }
    }
    
    return translationTable;
}

/**
 * Enhanced MIDI to note conversion with scale context
 */
function midiToNoteWithScale(midiNote, scaleContext = null) {
    if (typeof midiNote !== 'number' || midiNote < 0 || midiNote > 127) {
        throw new Error("MIDI note must be between 0 and 127");
    }
    
    if (scaleContext && scaleContext.translationTable) {
        const scaleName = scaleContext.translationTable.get(midiNote);
        if (scaleName) return scaleName;
    }
    
    // Fallback to chromatic spelling
    const octave = Math.floor(midiNote / 12) - 1;
    const semitone = midiNote % 12;
    
    // Default to sharp spelling for chromatic notes
    const noteName = CHROMATIC_SHARP[semitone];
    return `${noteName}/${octave}`;
}

/**
 * Enhanced note to MIDI conversion with support for all accidentals
 */
function noteToMidiEnhanced(note) {
    return basicNoteToMidi(note);
}

/**
 * Create a scale context object for proper notation
 */
function createScaleContext(rootNote, intervals) {
    const translationTable = createScaleTranslationTable(rootNote, intervals);
    const properScale = generateProperScale(rootNote, intervals);
    
    return {
        rootNote,
        intervals,
        properScale,
        translationTable,
        
        // Method to get proper note name for a MIDI number
        getNoteName: function(midiNote) {
            return midiToNoteWithScale(midiNote, this);
        },
        
        // Method to translate an array of notes
        translateNotes: function(notes) {
            return notes.map(note => {
                if (typeof note === 'string') {
                    // If it's already a note name, try to improve its spelling
                    try {
                        const midi = basicNoteToMidi(note);
                        return this.getNoteName(midi);
                    } catch (e) {
                        return note; // Return original if conversion fails
                    }
                } else if (typeof note === 'number') {
                    // If it's a MIDI number, convert to proper notation
                    return this.getNoteName(note);
                }
                return note;
            });
        }
    };
}

/**
 * Global scale context for the current scale
 */
let currentScaleContext = null;

/**
 * Set the current scale context
 */
function setScaleContext(rootNote, intervals) {
    currentScaleContext = createScaleContext(rootNote, intervals);
    return currentScaleContext;
}

/**
 * Get the current scale context
 */
function getScaleContext() {
    return currentScaleContext;
}

/**
 * Clear the current scale context
 */
function clearScaleContext() {
    currentScaleContext = null;
}

/**
 * Main function to convert MIDI to proper note name using current scale context
 */
function midiToNote(midiNote) {
    if (currentScaleContext) {
        return currentScaleContext.getNoteName(midiNote);
    }
    return midiToNoteWithScale(midiNote);
}

/**
 * Main function to convert note name to MIDI (enhanced version)
 */
function noteToMidi(note) {
    return noteToMidiEnhanced(note);
}

/**
 * Convenience function to get note name without octave
 */
function noteToName(midiNote) {
    const fullName = midiToNote(midiNote);
    return fullName.split('/')[0];
}

/**
 * Translate an array of notes using current scale context
 */
function translateNotes(notes) {
    if (currentScaleContext) {
        return currentScaleContext.translateNotes(notes);
    }
    // Fallback: return notes as-is if no scale context
    return notes.map(note => {
        if (typeof note === 'number') {
            return basicMidiToNote(note);
        }
        return note;
    });
}

/**
 * Remove octave information from note names
 */
function stripOctave(noteName) {
    if (typeof noteName === 'string' && noteName.includes('/')) {
        return noteName.split('/')[0];
    }
    return noteName;
}

/**
 * Add octave information to note names
 */
function addOctave(noteName, octave = 4) {
    if (typeof noteName === 'string' && !noteName.includes('/')) {
        return `${noteName}/${octave}`;
    }
    return noteName;
}

/**
 * Normalize note representation by converting all accidental symbols to a standard form
 */
function normalizeNote(note) {
    if (typeof note !== 'string') return note;
    
    return note.trim()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/𝄪/g, '##')
        .replace(/𝄫/g, 'bb')
        .replace(/♮/g, ''); // Natural symbol cancels accidentals
}

/**
 * Check if two notes are enharmonically equivalent (same pitch, different spelling)
 */
function areEnharmonicEquivalent(note1, note2) {
    if (!note1 || !note2) return false;
    
    try {
        // Normalize and strip octaves for comparison
        const n1 = stripOctave(normalizeNote(note1));
        const n2 = stripOctave(normalizeNote(note2));
        
        // Convert both to MIDI (same octave) and compare
        const midi1 = basicNoteToMidi(n1 + '/4');
        const midi2 = basicNoteToMidi(n2 + '/4');
        
        return midi1 === midi2;
    } catch (e) {
        return false;
    }
}

/**
 * Check if two note arrays contain enharmonically equivalent notes
 */
function areArraysEnharmonicEquivalent(array1, array2) {
    if (!Array.isArray(array1) || !Array.isArray(array2)) return false;
    if (array1.length !== array2.length) return false;
    
    // Check if every note in array1 has an enharmonic equivalent in array2
    return array1.every(note1 => 
        array2.some(note2 => areEnharmonicEquivalent(note1, note2))
    );
}

/**
 * Find enharmonic match for a note in an array
 */
function findEnharmonicMatch(targetNote, noteArray) {
    if (!targetNote || !Array.isArray(noteArray)) return null;
    
    // Normalize the target note
    const normalizedTarget = normalizeNote(targetNote);
    
    return noteArray.find(note => areEnharmonicEquivalent(normalizedTarget, note)) || null;
}

/**
 * Convert a note array to match enharmonic spelling of a reference array
 */
function matchEnharmonicSpelling(notesToConvert, referenceNotes) {
    if (!Array.isArray(notesToConvert) || !Array.isArray(referenceNotes)) {
        return notesToConvert;
    }
    
    return notesToConvert.map(note => {
        const match = findEnharmonicMatch(note, referenceNotes);
        return match || note;
    });
}

/**
 * Check if a note is contained in an array (considering enharmonic equivalents)
 */
function noteArrayContains(noteArray, targetNote) {
    if (!Array.isArray(noteArray) || !targetNote) return false;
    
    // Normalize the target note
    const normalizedTarget = normalizeNote(targetNote);
    
    return noteArray.some(note => areEnharmonicEquivalent(note, normalizedTarget));
}

/**
 * Filter a note array to include only notes that are enharmonically contained in a reference array
 */
function filterEnharmonicMatches(notesToFilter, referenceNotes) {
    if (!Array.isArray(notesToFilter) || !Array.isArray(referenceNotes)) {
        return notesToFilter;
    }
    
    return notesToFilter.filter(note => noteArrayContains(referenceNotes, note));
}

export {
    // Main functions
    midiToNote,
    noteToMidi,
    noteToName,
    translateNotes,
    
    // Scale context functions
    createScaleContext,
    setScaleContext,
    getScaleContext,
    clearScaleContext,
    
    // Utility functions
    generateProperScale,
    stripOctave,
    addOctave,
    normalizeNote,
    
    // Enharmonic matching functions
    areEnharmonicEquivalent,
    areArraysEnharmonicEquivalent,
    findEnharmonicMatch,
    matchEnharmonicSpelling,
    noteArrayContains,
    filterEnharmonicMatches,
    
    // Enhanced functions
    midiToNoteWithScale,
    noteToMidiEnhanced,
    
    // Constants
    SYMBOLS,
    CHROMATIC_SHARP,
    CHROMATIC_FLAT,
    NOTE_NAMES,
    SCALE_PATTERNS
};
