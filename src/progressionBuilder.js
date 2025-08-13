import { processChord, identifySyntheticChords } from './intervals';
import { HeptatonicScales, getScaleNotes } from './scales';
import { getPrimaryScale, getPrimaryRootNote } from './scaleGenerator';
import { noteToMidi, noteToName } from './midi';
import {
    stripOctave as notationStripOctave
} from './notation';
import { createChordPiano, createMixedPiano } from './components/MiniPiano/MiniPiano';

/**
 * Get the fretboard instance for chord progression operations
 * @returns {Object|null} Fretboard instance or null if not available
 */
function getFretboardForProgression() {
    return window.chordProgressionFretboard || null;
}

/**
 * Chord Progression Builder
 * 
 * This module handles the parsing, validation, and display of chord progressions
 * using both explicit chord names and Roman numeral notation.
 */

// Global state for chord progression
let currentProgression = [];
let hoveredChordIndex = null;
let selectedPatternIndexes = new Map(); // Map of chord index to selected pattern index
let showMiniFretboards = false; // Global toggle for mini fretboard visualization
let showMiniPianos = false; // Global toggle for mini piano visualization
let useSeventhChords = false; // Global toggle for triads vs seventh chords

// Caching system for performance optimization
let parsedTokensCache = []; // Cache of parsed tokens from input
let lastInputString = ''; // Last processed input string
let precomputedPatternData = new Map(); // Map of chord index to precomputed pattern data

// Debouncing for input changes
let inputDebounceTimer = null;
const INPUT_DEBOUNCE_DELAY = 150; // milliseconds

// Configuration constants
const CHORD_LINE_CONFIG = {
    normalWidth: 60,
    highlightedWidth: 80,
    normalOpacity: 0.7,
    highlightedOpacity: 0.9,
    hoverOpacity: 1.0
};

// Mini fretboard visualization configuration
const MINI_FRETBOARD_CONFIG = {
    width: 100,
    height: 120,
    fretCount: 5,
    stringCount: 6,
    fretHeight: 20,
    stringSpacing: 14,
    noteRadius: 4,
    fretNumberSize: 10,
    noteNameSize: 9
};

/**
 * Clear all caches and reset state
 */
function clearCache() {
    parsedTokensCache = [];
    lastInputString = '';
    precomputedPatternData.clear();
    selectedPatternIndexes.clear(); // Clear pattern selections
    
    // Clear debounce timer if it exists
    if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
        inputDebounceTimer = null;
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
            displayName: getChordDisplayName(chord),
            hasPatterns: false,
            chord // Store reference to chord object for staleness detection
        };
    }
    
    const patterns = getChordPatternMatches(chord);
    const chordNotes = chord.chordInfo.notes.map(note => notationStripOctave(note));
    const displayName = getChordDisplayName(chord);
    
    // Debug logging to track when pattern data is computed
    console.log(`Computing pattern data for chord ${index}: ${displayName} (${patterns.length} patterns found)`);
    
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
    if (trimmedText === lastInputString) {
        return currentProgression;
    }
    
    const newTokens = trimmedText.split(/\s+/).filter(token => token.trim());
    const oldTokens = lastInputString ? lastInputString.split(/\s+/).filter(token => token.trim()) : [];
    
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
    selectedPatternIndexes.clear(); // Clear pattern selections on full reparse
    
    const progression = [];
    parsedTokensCache = [];
    
    for (let token of newTokens) {
        token = token.trim();
        if (!token) continue;
        
        const chordData = parseChordToken(token);
        if (chordData) {
            progression.push(chordData);
            parsedTokensCache.push(token);
        }
    }
    
    lastInputString = trimmedText;
    return progression;
}

/**
 * Update progression incrementally based on token changes
 * @param {Array} newTokens - New token array
 * @param {Object} changes - Changes detected between old and new tokens
 * @returns {Array} Updated progression
 */
function updateProgressionIncremental(newTokens, changes) {
    let updatedProgression = [...currentProgression];
    
    // Handle removed tokens (work backwards to maintain indices)
    for (let i = changes.removed.length - 1; i >= 0; i--) {
        const removeIndex = changes.removed[i];
        if (removeIndex < updatedProgression.length) {
            updatedProgression.splice(removeIndex, 1);
            // Remove cached pattern data
            precomputedPatternData.delete(removeIndex);
            // Remove pattern selection for this index
            selectedPatternIndexes.delete(removeIndex);
            
            // Shift pattern data indices down for higher indices
            const newPatternData = new Map();
            const newPatternSelections = new Map();
            
            for (let [index, data] of precomputedPatternData.entries()) {
                if (index > removeIndex) {
                    newPatternData.set(index - 1, data);
                } else {
                    newPatternData.set(index, data);
                }
            }
            
            for (let [index, selection] of selectedPatternIndexes.entries()) {
                if (index > removeIndex) {
                    newPatternSelections.set(index - 1, selection);
                } else {
                    newPatternSelections.set(index, selection);
                }
            }
            
            precomputedPatternData = newPatternData;
            selectedPatternIndexes = newPatternSelections;
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
                precomputedPatternData.delete(changeIndex);
                // Clear pattern selection for this index since chord changed
                selectedPatternIndexes.delete(changeIndex);
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
                
                for (let [index, data] of precomputedPatternData.entries()) {
                    if (index >= addIndex) {
                        newPatternData.set(index + 1, data);
                    } else {
                        newPatternData.set(index, data);
                    }
                }
                
                for (let [index, selection] of selectedPatternIndexes.entries()) {
                    if (index >= addIndex) {
                        newPatternSelections.set(index + 1, selection);
                    } else {
                        newPatternSelections.set(index, selection);
                    }
                }
                
                precomputedPatternData = newPatternData;
                selectedPatternIndexes = newPatternSelections;
            }
        }
    }
    
    // Update cache
    parsedTokensCache = [...newTokens];
    lastInputString = newTokens.join(' ');
    
    return updatedProgression;
}

/**
 * Parse a single chord token (either Roman numeral or chord name)
 * @param {string} token - Single chord token
 * @returns {Object|null} Parsed chord data or null if invalid
 */
function parseChordToken(token) {
    // Check if it's a Roman numeral - enhanced pattern to properly handle flat/sharp prefixes
    const romanMatch = token.match(/^([b#]*)(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)(.*)$/);
    
    if (romanMatch) {
        return parseRomanNumeral(token);
    } else {
        return parseChordName(token);
    }
}

/**
 * Parse Roman numeral chord notation
 * @param {string} token - Roman numeral token (e.g., "I", "ii", "V7", "bVII")
 * @returns {Object|null} Parsed chord data
 */
function parseRomanNumeral(token) {
    // Extract prefix modifiers (b, #)
    const prefixMatch = token.match(/^([b#]*)/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    
    // Extract base roman numeral - fixed pattern to properly handle VI and VII
    const baseMatch = token.slice(prefix.length).match(/^(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)/);
    if (!baseMatch) return null;
    
    const baseRoman = baseMatch[1];
    const suffix = token.slice(prefix.length + baseRoman.length);
    
    // Determine degree (1-7)
    const degree = romanToDegree(baseRoman);
    if (degree === null) return null;
    
    // Determine if it's naturally major or minor based on case and degree
    const isNaturallyMinor = isLowerCase(baseRoman) || [2, 3, 6, 7].includes(degree);
    
    return {
        type: 'roman',
        degree: degree,
        prefix: prefix,
        baseRoman: baseRoman,
        suffix: suffix,
        isNaturallyMinor: isNaturallyMinor,
        originalToken: token
    };
}

/**
 * Parse explicit chord name notation
 * @param {string} token - Chord name token (e.g., "C7", "D#m7b5", "Gmajor")
 * @returns {Object|null} Parsed chord data
 */
function parseChordName(token) {
    // Extract root note (handles sharps and flats)
    const rootMatch = token.match(/^([A-G][b#]*)/);
    if (!rootMatch) return null;
    
    const rootNote = rootMatch[1];
    const chordType = token.slice(rootNote.length);
    
    // Validate that the chord can be processed
    try {
        const chordInfo = processChord(token);
        if (!chordInfo || !chordInfo.notes) return null;
        
        return {
            type: 'explicit',
            rootNote: rootNote,
            chordType: chordType || 'Major', // Default to Major if no type specified
            originalToken: token,
            chordInfo: chordInfo
        };
    } catch (error) {
        console.warn(`Invalid chord: ${token}`, error);
        return null;
    }
}

/**
 * Convert Roman numeral to scale degree (1-7)
 * @param {string} roman - Roman numeral string
 * @returns {number|null} Scale degree or null if invalid
 */
function romanToDegree(roman) {
    const upperRoman = roman.toUpperCase();
    const mapping = {
        'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7
    };
    return mapping[upperRoman] || null;
}

/**
 * Check if a string is lowercase (indicating minor chord in traditional notation)
 * @param {string} str - String to check
 * @returns {boolean} True if lowercase
 */
function isLowerCase(str) {
    return str === str.toLowerCase() && str !== str.toUpperCase();
}

/**
 * Resolve Roman numeral chord to actual notes based on current scale
 * @param {Object} romanChord - Parsed Roman numeral chord data
 * @returns {Object|null} Resolved chord with notes
 */
function resolveRomanChord(romanChord) {
    const primaryScale = getPrimaryScale();
    const scaleRootNote = getPrimaryRootNote();
    
    if (!primaryScale || !scaleRootNote) {
        console.warn('No primary scale selected for Roman numeral resolution');
        return null;
    }
    
    try {
        const [family, mode] = primaryScale.split('-');
        if (!HeptatonicScales || !HeptatonicScales[family] || !HeptatonicScales[family][parseInt(mode, 10) - 1]) {
            console.warn(`Scale not fully defined: ${primaryScale}. Using fallback resolution.`);
            return resolveFallbackRomanChord(romanChord, scaleRootNote);
        }
        
        const scaleDefinition = HeptatonicScales[family][parseInt(mode, 10) - 1];
        const intervals = scaleDefinition.intervals;
        const scaleNotes = getScaleNotes(scaleRootNote, intervals);
        
        if (!scaleNotes || scaleNotes.length < 7) {
            console.warn(`Incomplete scale notes for ${primaryScale}. Using fallback resolution.`);
            return resolveFallbackRomanChord(romanChord, scaleRootNote);
        }
        
        // Use identifySyntheticChords to get scale-aware chord types
        let diatonicChords;
        try {
            diatonicChords = identifySyntheticChords(scaleDefinition, 3, scaleRootNote);
        } catch (error) {
            console.warn(`Failed to identify diatonic chords for ${primaryScale}. Using fallback resolution.`);
            return resolveFallbackRomanChord(romanChord, scaleRootNote);
        }
        
        // Get the root note for this degree (without prefix modifiers first)
        let degreeIndex = romanChord.degree - 1;
        
        if (degreeIndex < 0 || degreeIndex >= scaleNotes.length || degreeIndex >= diatonicChords.length) {
            console.warn(`Invalid degree index ${degreeIndex} for Roman numeral resolution`);
            return resolveFallbackRomanChord(romanChord, scaleRootNote);
        }
        
        const chordRoot = notationStripOctave(scaleNotes[degreeIndex]);
        
        // Get the scale-appropriate chord type from diatonic analysis
        const diatonicChord = diatonicChords[degreeIndex];
        let chordType = '';
        
        if (diatonicChord && diatonicChord.matches && diatonicChord.matches.length > 0) {
            // Use the first match as the primary chord type
            chordType = diatonicChord.matches[0];
            
            // Handle suffix modifications if present
            if (romanChord.suffix) {
                chordType = modifyChordTypeWithSuffix(chordType, romanChord.suffix);
            } else if (useSeventhChords) {
                // Apply seventh chord toggle if no explicit suffix
                chordType = addSeventhToChordType(chordType);
            }
        } else {
            // Fallback to traditional Roman numeral interpretation
            console.warn(`No diatonic chord found for degree ${romanChord.degree}, using traditional interpretation`);
            if (romanChord.suffix) {
                chordType = romanSuffixToChordType(romanChord.suffix, romanChord.isNaturallyMinor);
            } else if (useSeventhChords) {
                // Apply seventh chords based on natural quality
                chordType = romanChord.isNaturallyMinor ? 'm7' : '7';
            } else if (romanChord.isNaturallyMinor) {
                chordType = 'min';
            } else {
                chordType = '';
            }
        }
        
        // Construct full chord name
        const fullChordName = chordRoot + chordType;
        
        try {
            let chordInfo = processChord(fullChordName);
            if (!chordInfo || !chordInfo.notes) {
                console.warn(`Failed to process chord: ${fullChordName}`);
                return null;
            }
            
            // Apply prefix modifiers (b = flat, # = sharp) as transposition to the entire chord
            if (romanChord.prefix) {
                chordInfo = transposeChordByPrefix(chordInfo, romanChord.prefix);
            }
            
            return {
                ...romanChord,
                resolvedRoot: chordRoot,
                resolvedChordType: chordType,
                fullChordName: fullChordName,
                chordInfo: chordInfo,
                isInvalid: false,
                diatonicInfo: diatonicChord // Store diatonic chord info for reference
            };
        } catch (error) {
            console.warn(`Failed to process chord ${fullChordName}:`, error);
            return null;
        }
        
    } catch (error) {
        console.warn(`Error resolving Roman numeral chord:`, error);
        return resolveFallbackRomanChord(romanChord, scaleRootNote);
    }
}

/**
 * Modify a chord type with Roman numeral suffix
 * @param {string} baseChordType - Base chord type from diatonic analysis
 * @param {string} suffix - Roman numeral suffix
 * @returns {string} Modified chord type
 */
function modifyChordTypeWithSuffix(baseChordType, suffix) {
    // Handle common Roman numeral extensions
    if (suffix.includes('7')) {
        if (baseChordType === '' || baseChordType === 'maj') {
            return '7'; // Dominant 7th
        } else if (baseChordType === 'min' || baseChordType === 'm') {
            return 'm7'; // Minor 7th
        } else if (baseChordType === 'dim' || baseChordType === 'o') {
            return 'dim7'; // Diminished 7th
        }
    }
    
    if (suffix.includes('9')) {
        if (baseChordType === '' || baseChordType === 'maj') {
            return '9'; // Dominant 9th
        } else if (baseChordType === 'min' || baseChordType === 'm') {
            return 'm9'; // Minor 9th
        }
    }
    
    // For now, return the base chord type if we can't handle the suffix
    return baseChordType;
}

/**
 * Add seventh to a chord type when seventh toggle is enabled
 * @param {string} baseChordType - Base chord type
 * @returns {string} Chord type with seventh added
 */
function addSeventhToChordType(baseChordType) {
    // Handle various chord type formats
    const lowerType = baseChordType.toLowerCase();
    
    if (baseChordType === '' || baseChordType === 'maj' || baseChordType === 'Major') {
        return '7'; // Dominant 7th for major chords
    } else if (lowerType === 'min' || lowerType === 'm' || lowerType === 'minor') {
        return 'm7'; // Minor 7th
    } else if (lowerType === 'dim' || lowerType === 'o' || lowerType === 'diminished') {
        return 'dim7'; // Diminished 7th
    } else if (lowerType === 'aug' || lowerType === '+' || lowerType === 'augmented') {
        return 'aug7'; // Augmented 7th
    } else if (lowerType.includes('sus')) {
        return baseChordType + '7'; // Add 7 to suspended chords (sus27, sus47)
    }
    
    // If we don't know how to add a seventh, return the base type
    return baseChordType;
}

/**
 * Transpose a chord by applying flat/sharp prefix modifiers
 * @param {Object} chordInfo - Chord info object with notes
 * @param {string} prefix - Prefix string containing 'b' and/or '#' characters
 * @returns {Object} Transposed chord info
 */
function transposeChordByPrefix(chordInfo, prefix) {
    if (!prefix || !chordInfo || !chordInfo.notes) {
        return chordInfo;
    }
    
    // Calculate total semitone shift
    let semitoneShift = 0;
    for (let char of prefix) {
        if (char === 'b') {
            semitoneShift -= 1; // Flat = down a semitone
        } else if (char === '#') {
            semitoneShift += 1; // Sharp = up a semitone
        }
    }
    
    if (semitoneShift === 0) {
        return chordInfo;
    }
    
    // Transpose all notes in the chord
    const transposedNotes = chordInfo.notes.map(note => {
        const noteMidi = noteToMidi(note);
        const transposedMidi = noteMidi + semitoneShift;
        return noteToName(transposedMidi);
    });
    
    // Update chord info with transposed notes
    const transposedChordInfo = {
        ...chordInfo,
        notes: transposedNotes
    };
    
    // Update the chord name if possible
    if (chordInfo.name) {
        try {
            // Try to determine the new root note
            const originalRootMidi = noteToMidi(chordInfo.notes[0]);
            const transposedRootMidi = originalRootMidi + semitoneShift;
            const transposedRoot = noteToName(transposedRootMidi).replace(/\/\d+$/, ''); // Remove octave
            
            // Replace the root in the chord name
            const rootMatch = chordInfo.name.match(/^([A-G][b#]*)/);
            if (rootMatch) {
                const oldRoot = rootMatch[1];
                transposedChordInfo.name = chordInfo.name.replace(oldRoot, transposedRoot);
            }
        } catch (error) {
            console.warn('Could not update chord name after transposition:', error);
        }
    }
    
    return transposedChordInfo;
}

/**
 * Fallback resolution for Roman chords when scale is not fully defined
 * @param {Object} romanChord - Roman chord object
 * @param {string} scaleRootNote - Root note of the scale
 * @returns {Object|null} Resolved chord or null
 */
function resolveFallbackRomanChord(romanChord, scaleRootNote) {
    // Basic major scale intervals as fallback
    const basicMajorIntervals = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    
    try {
        // Map Roman numeral to chromatic degree (without prefix modifiers)
        let degreeIndex = romanChord.degree - 1;
        
        if (degreeIndex < 0 || degreeIndex >= basicMajorIntervals.length) {
            console.warn(`Invalid fallback degree index: ${degreeIndex}`);
            return null;
        }
        
        // Calculate the chord root based on major scale intervals
        const rootMidi = noteToMidi(scaleRootNote + '4'); // Add octave for calculation
        const chordRootMidi = rootMidi + basicMajorIntervals[degreeIndex];
        const chordRootNote = noteToName(chordRootMidi).replace('/4', ''); // Remove octave
        
        // Determine chord type
        let chordType = '';
        if (romanChord.suffix) {
            chordType = romanSuffixToChordType(romanChord.suffix, romanChord.isNaturallyMinor);
        } else if (useSeventhChords) {
            // Apply seventh chords based on natural quality
            chordType = romanChord.isNaturallyMinor ? 'm7' : '7';
        } else if (romanChord.isNaturallyMinor) {
            chordType = 'min';
        } else {
            chordType = '';
        }
        
        const fullChordName = chordRootNote + chordType;
        let chordInfo = processChord(fullChordName);
        
        if (!chordInfo || !chordInfo.notes) {
            return null;
        }
        
        // Apply prefix modifiers as transposition to the entire chord
        if (romanChord.prefix) {
            chordInfo = transposeChordByPrefix(chordInfo, romanChord.prefix);
        }
        
        return {
            ...romanChord,
            resolvedRoot: chordRootNote,
            resolvedChordType: chordType,
            fullChordName: fullChordName,
            chordInfo: chordInfo,
            isInvalid: false,
            isFallback: true // Mark as fallback resolution
        };
        
    } catch (error) {
        console.warn(`Fallback resolution failed for ${romanChord.originalToken}:`, error);
        return null;
    }
}

/**
 * Convert Roman numeral suffix to chord type
 * @param {string} suffix - Suffix from Roman numeral (e.g., "7", "maj7", "dim")
 * @param {boolean} isNaturallyMinor - Whether the base chord is naturally minor
 * @returns {string} Chord type string
 */
function romanSuffixToChordType(suffix, isNaturallyMinor) {
    const lowerSuffix = suffix.toLowerCase();
    
    // Handle common suffixes
    const mappings = {
        '7': isNaturallyMinor ? 'm7' : '7',
        'maj7': 'maj7',
        'maj': 'Major',
        'm': 'Minor',
        'dim': 'dim',
        'dim7': 'dim7',
        'aug': 'aug',
        'sus2': 'sus2',
        'sus4': 'sus4',
        'm7b5': 'm7b5',
        'ø': 'm7b5',
        '°': 'dim',
        '+': 'aug'
    };
    
    if (mappings[lowerSuffix]) {
        return mappings[lowerSuffix];
    }
    
    // If no specific mapping, try to use suffix directly
    if (suffix) {
        return suffix;
    }
    
    // Default based on natural quality
    return isNaturallyMinor ? 'Minor' : 'Major';
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
    
    const chordNotes = chord.chordInfo.notes.map(note => notationStripOctave(note));
    const rootNote = chordNotes[0];
    
    const patterns = fretboard.findChordPatternMatches(chordNotes, rootNote);
    
    // Sort patterns by their lowest fret number for consistency
    patterns.sort((a, b) => {
        const aMinFret = Math.min(...a.positions.map(p => p.fret));
        const bMinFret = Math.min(...b.positions.map(p => p.fret));
        return aMinFret - bMinFret;
    });
    
    return patterns;
}

/**
 * Create the chord progression UI
 * @param {string} containerId - ID of the container element
 */
/**
 * Create the chord progression UI and return the container element
 * @param {Object} fretboard - Fretboard instance to interact with
 * @returns {HTMLElement} The chord progression container element
 */
function createChordProgressionUI(fretboard) {
    // Store fretboard reference for later use
    if (fretboard) {
        window.chordProgressionFretboard = fretboard;
        
        // Set up scale change listener
        setupScaleChangeListener();
    }
    
    // Create main container
    const progressionContainer = document.createElement('div');
    progressionContainer.className = 'chord-progression-container';
    progressionContainer.style.cssText = `
        margin: 20px 0;
        padding: 20px;
        background: #353535;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    
    // Create title
    const title = document.createElement('h3');
    title.textContent = 'Chord Progression Builder';
    title.style.cssText = `
        margin: 0 0 15px 0;
        color: #fff;
        font-size: 18px;
        font-weight: bold;
    `;
    progressionContainer.appendChild(title);
    
    // Create input section
    const inputSection = createInputSection();
    progressionContainer.appendChild(inputSection);
    
    // Create controls section
    const controlsSection = createProgressionControlsSection();
    progressionContainer.appendChild(controlsSection);
    
    // Create progression display section
    const displaySection = createProgressionDisplaySection();
    progressionContainer.appendChild(displaySection);
    
    return progressionContainer;
}

/**
 * Set up listener for scale changes to update Roman numeral chords
 */
function setupScaleChangeListener() {
    // Store the current scale context for comparison
    let currentScale = getPrimaryScale();
    let currentRoot = getPrimaryRootNote();
    
    // Listen for scale change events from the scale generator
    window.addEventListener('scaleChanged', (event) => {
        const { primaryScale: newScale, rootNote: newRoot } = event.detail;
        
        if (newScale !== currentScale || newRoot !== currentRoot) {
            console.log('Scale change detected via event:', { oldScale: currentScale, newScale, oldRoot: currentRoot, newRoot });
            
            // Update stored values
            currentScale = newScale;
            currentRoot = newRoot;
            
            // Update progression display to refresh mini pianos with new scale context
            updateProgressionDisplayForScaleChange();
        }
    });
    
    // Fallback: Check for scale changes periodically (in case event system fails)
    const checkForScaleChanges = () => {
        const newScale = getPrimaryScale();
        const newRoot = getPrimaryRootNote();
        
        if (newScale !== currentScale || newRoot !== currentRoot) {
            console.log('Scale change detected via polling fallback:', { oldScale: currentScale, newScale, oldRoot: currentRoot, newRoot });
            
            // Update stored values
            currentScale = newScale;
            currentRoot = newRoot;
            
            // Update progression display to refresh mini pianos with new scale context
            updateProgressionDisplayForScaleChange();
        }
    };
    
    // Check every 2000ms for scale changes (reduced frequency since event system is primary)
    setInterval(checkForScaleChanges, 2000);
}

/**
 * Update progression display when scale changes to refresh mini pianos and Roman numerals
 */
function updateProgressionDisplayForScaleChange() {
    // First update any Roman numeral chords
    updateRomanNumeralChords();
    
    // Then refresh the entire progression display to update mini pianos with new scale context
    // This ensures all mini pianos (not just Roman numeral chords) show the updated scale
    updateProgressionDisplay();
    
    console.log('Progression display updated for scale change');
}

/**
 * Update Roman numeral chords when scale changes
 */
function updateRomanNumeralChords() {
    if (currentProgression.length === 0) return;
    
    let progressionChanged = false;
    const indicesToInvalidate = [];
    
    // Update each Roman numeral chord in the progression
    currentProgression.forEach((chord, index) => {
        if (chord.type === 'roman') {
            const updatedChord = resolveRomanChord(chord);
            if (updatedChord && updatedChord.chordInfo) {
                // Update the chord with new scale context
                currentProgression[index] = updatedChord;
                progressionChanged = true;
                indicesToInvalidate.push(index);
                
                console.log(`Updated Roman numeral ${chord.originalToken} to:`, updatedChord.chordInfo.name);
            } else {
                console.warn(`Could not resolve Roman numeral ${chord.originalToken} in new scale context`);
                // Keep the original chord but mark it as potentially invalid
                currentProgression[index].isInvalid = true;
                indicesToInvalidate.push(index);
            }
        }
    });
    
    if (progressionChanged) {
        // Invalidate cached pattern data for changed chords
        indicesToInvalidate.forEach(index => {
            precomputedPatternData.delete(index);
        });
        
        // Reset pattern selections for updated chords
        selectedPatternIndexes.clear();
        
        // Precompute pattern data for updated chords
        precomputeAllPatternData();
        
        // Update the display
        updateProgressionDisplay();
        
        // Refresh fretboard display
        if (hoveredChordIndex !== null && currentProgression[hoveredChordIndex]) {
            displaySingleChordPattern(currentProgression[hoveredChordIndex], hoveredChordIndex, true);
        } else {
            displayAllChordPatterns();
        }
    }
}

/**
 * Create the input section of the UI
 * @returns {HTMLElement} Input section element
 */
function createInputSection() {
    const section = document.createElement('div');
    section.className = 'progression-input-section';
    section.style.cssText = `
        margin-bottom: 20px;
    `;
    
    // Create input label
    const label = document.createElement('label');
    label.textContent = 'Enter Chord Progression:';
    label.style.cssText = `
        display: block;
        margin-bottom: 8px;
        color: #fff;
        font-weight: bold;
        font-size: 14px;
    `;
    section.appendChild(label);
    
    // Create help text
    const helpText = document.createElement('div');
    helpText.innerHTML = `
        <span style="color: #ccc; font-size: 12px;">
            Examples: "C7 D#m7b5 Gmajor" or "I IV ii V" or "bIII #V" or "Cmaj7 Am7 Dm7 G7"
        </span>
    `;
    helpText.style.marginBottom = '8px';
    section.appendChild(helpText);
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'chord-progression-input';
    input.placeholder = 'e.g., I vi IV V or bIII #V or C Am F G or Cmaj7 Am7 Dm7 G7';
    input.style.cssText = `
        width: 100%;
        padding: 12px;
        font-size: 14px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: #fff;
        color: #333;
        box-sizing: border-box;
        margin-bottom: 10px;
    `;
    
    // Add input event listener with debouncing
    input.addEventListener('input', (e) => {
        const progressionText = e.target.value;
        
        // Clear any existing timer
        if (inputDebounceTimer) {
            clearTimeout(inputDebounceTimer);
        }
        
        // Set a new timer to delay processing
        inputDebounceTimer = setTimeout(() => {
            updateProgression(progressionText);
        }, INPUT_DEBOUNCE_DELAY);
    });
    
    section.appendChild(input);
    
    return section;
}

/**
 * Create the progression controls section
 * @returns {HTMLElement} Controls section element
 */
function createProgressionControlsSection() {
    const section = document.createElement('div');
    section.className = 'progression-controls-section';
    section.style.cssText = `
        margin: 15px 0;
        display: flex;
        gap: 15px;
        align-items: center;
        flex-wrap: wrap;
    `;
    
    // Scale context toggle
    const scaleToggleContainer = document.createElement('div');
    scaleToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const scaleToggleCheckbox = document.createElement('input');
    scaleToggleCheckbox.type = 'checkbox';
    scaleToggleCheckbox.id = 'chord-progression-scale-toggle';
    scaleToggleCheckbox.checked = true; // Default to showing scale context
    scaleToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    // Add change event listener to refresh display
    scaleToggleCheckbox.addEventListener('change', () => {
        // Refresh the current display
        if (hoveredChordIndex !== null && currentProgression[hoveredChordIndex]) {
            displaySingleChordPattern(currentProgression[hoveredChordIndex], hoveredChordIndex, true);
        } else {
            displayAllChordPatterns();
        }
        
        // Also refresh mini pianos if they are enabled
        if (showMiniPianos) {
            updateProgressionDisplay();
        }
    });
    
    const scaleToggleLabel = document.createElement('label');
    scaleToggleLabel.htmlFor = 'chord-progression-scale-toggle';
    scaleToggleLabel.textContent = 'Show Scale Context';
    scaleToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;
    
    scaleToggleContainer.appendChild(scaleToggleCheckbox);
    scaleToggleContainer.appendChild(scaleToggleLabel);
    
    // Mini fretboard toggle
    const miniFretboardToggleContainer = document.createElement('div');
    miniFretboardToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const miniFretboardToggleCheckbox = document.createElement('input');
    miniFretboardToggleCheckbox.type = 'checkbox';
    miniFretboardToggleCheckbox.id = 'chord-progression-mini-fretboard-toggle';
    miniFretboardToggleCheckbox.checked = showMiniFretboards;
    miniFretboardToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    // Add change event listener to refresh display
    miniFretboardToggleCheckbox.addEventListener('change', (e) => {
        showMiniFretboards = e.target.checked;
        updateProgressionDisplay(); // Refresh the entire display to show/hide mini fretboards
    });
    
    const miniFretboardToggleLabel = document.createElement('label');
    miniFretboardToggleLabel.htmlFor = 'chord-progression-mini-fretboard-toggle';
    miniFretboardToggleLabel.textContent = 'Show Mini Fretboards';
    miniFretboardToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;
    
    miniFretboardToggleContainer.appendChild(miniFretboardToggleCheckbox);
    miniFretboardToggleContainer.appendChild(miniFretboardToggleLabel);
    
    // Mini piano toggle
    const miniPianoToggleContainer = document.createElement('div');
    miniPianoToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const miniPianoToggleCheckbox = document.createElement('input');
    miniPianoToggleCheckbox.type = 'checkbox';
    miniPianoToggleCheckbox.id = 'chord-progression-mini-piano-toggle';
    miniPianoToggleCheckbox.checked = showMiniPianos;
    miniPianoToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    // Add change event listener to refresh display
    miniPianoToggleCheckbox.addEventListener('change', (e) => {
        showMiniPianos = e.target.checked;
        updateProgressionDisplay(); // Refresh the entire display to show/hide mini pianos
    });
    
    const miniPianoToggleLabel = document.createElement('label');
    miniPianoToggleLabel.htmlFor = 'chord-progression-mini-piano-toggle';
    miniPianoToggleLabel.textContent = 'Show Mini Pianos';
    miniPianoToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;
    
    miniPianoToggleContainer.appendChild(miniPianoToggleCheckbox);
    miniPianoToggleContainer.appendChild(miniPianoToggleLabel);
    
    // Triads vs Sevenths toggle
    const chordsToggleContainer = document.createElement('div');
    chordsToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const chordsToggleCheckbox = document.createElement('input');
    chordsToggleCheckbox.type = 'checkbox';
    chordsToggleCheckbox.id = 'chord-progression-sevenths-toggle';
    chordsToggleCheckbox.checked = useSeventhChords;
    chordsToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    // Add change event listener to reprocess progression
    chordsToggleCheckbox.addEventListener('change', (e) => {
        useSeventhChords = e.target.checked;
        
        // Reprocess the current progression to apply the toggle
        const inputElement = document.getElementById('chord-progression-input');
        if (inputElement && inputElement.value.trim()) {
            updateProgression(inputElement.value);
        }
    });
    
    const chordsToggleLabel = document.createElement('label');
    chordsToggleLabel.htmlFor = 'chord-progression-sevenths-toggle';
    chordsToggleLabel.textContent = 'Use Seventh Chords';
    chordsToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;
    
    chordsToggleContainer.appendChild(chordsToggleCheckbox);
    chordsToggleContainer.appendChild(chordsToggleLabel);
    
    // Predefined progressions dropdown
    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const presetsLabel = document.createElement('span');
    presetsLabel.textContent = 'Presets:';
    presetsLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        font-weight: bold;
    `;
    
    const presetsDropdown = document.createElement('select');
    presetsDropdown.id = 'chord-progression-presets';
    presetsDropdown.style.cssText = `
        padding: 8px;
        font-size: 14px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: #fff;
        color: #333;
        cursor: pointer;
        min-width: 200px;
    `;
    
    // Add predefined chord progressions
    const presets = [
        { name: 'Select a preset...', value: '' },
        { name: 'I-V-vi-IV (Pop progression)', value: 'I V vi IV' },
        { name: 'vi-IV-I-V (Pop progression)', value: 'vi IV I V' },
        { name: 'ii-V-I (Jazz standard)', value: 'ii V I' },
        { name: 'I-vi-ii-V (Jazz circle)', value: 'I vi ii V' },
        { name: 'I-IV-V-I (Classic cadence)', value: 'I IV V I' },
        { name: 'vi-V-IV-V (Minor progression)', value: 'vi V IV V' },
        { name: 'I-bVII-IV-I (Mixolydian)', value: 'I bVII IV I' },
        { name: 'i-bVI-bVII-i (Minor natural)', value: 'i bVI bVII i' },
        { name: 'I-iii-vi-IV (Alt pop)', value: 'I iii vi IV' },
        { name: 'vi-ii-V-I (Jazz turnaround)', value: 'vi ii V I' },
        { name: 'C-Am-F-G (Key of C)', value: 'C Am F G' },
        { name: 'Dm7-G7-Cmaj7 (Jazz ii-V-I)', value: 'Dm7 G7 Cmaj7' },
        { name: 'Am-F-C-G (Key of C minor)', value: 'Am F C G' },
        { name: 'Cmaj7-Am7-Dm7-G7', value: 'Cmaj7 Am7 Dm7 G7' }
    ];
    
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.name;
        presetsDropdown.appendChild(option);
    });
    
    // Add change event listener to populate input
    presetsDropdown.addEventListener('change', (e) => {
        if (e.target.value) {
            const inputElement = document.getElementById('chord-progression-input');
            if (inputElement) {
                inputElement.value = e.target.value;
                updateProgression(e.target.value);
            }
            // Reset dropdown to "Select a preset..."
            presetsDropdown.selectedIndex = 0;
        }
    });
    
    presetsContainer.appendChild(presetsLabel);
    presetsContainer.appendChild(presetsDropdown);
    
    // Clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Progression';
    clearButton.style.cssText = `
        padding: 8px 16px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: background 0.2s;
    `;
    
    clearButton.addEventListener('mouseenter', () => {
        clearButton.style.background = '#c82333';
    });
    
    clearButton.addEventListener('mouseleave', () => {
        clearButton.style.background = '#dc3545';
    });
    
    clearButton.addEventListener('click', () => {
        clearProgression();
    });
    
    section.appendChild(scaleToggleContainer);
    section.appendChild(miniFretboardToggleContainer);
    section.appendChild(miniPianoToggleContainer);
    section.appendChild(chordsToggleContainer);
    section.appendChild(presetsContainer);
    section.appendChild(clearButton);
    
    return section;
}

/**
 * Create the progression display section
 * @returns {HTMLElement} Display section element
 */
function createProgressionDisplaySection() {
    const section = document.createElement('div');
    section.className = 'progression-display-section';
    section.id = 'progression-display-section';
    section.style.cssText = `
        min-height: 60px;
    `;
    
    // Initially empty - will be populated by updateProgression
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Enter a chord progression above to see it displayed here';
    placeholder.style.cssText = `
        color: #999;
        font-style: italic;
        text-align: center;
        padding: 20px;
    `;
    section.appendChild(placeholder);
    
    return section;
}

/**
 * Update the progression based on input text
 * @param {string} progressionText - Input text
 */
function updateProgression(progressionText) {
    const parsedProgression = parseProgressionInput(progressionText);
    
    // Resolve Roman numerals to actual chords
    const resolvedProgression = parsedProgression.map(chord => {
        if (chord.type === 'roman') {
            return resolveRomanChord(chord) || chord;
        }
        return chord;
    });
    
    // Reset hover state when progression changes
    hoveredChordIndex = null;
    
    currentProgression = resolvedProgression;
    
    // Precompute pattern data for all chords to optimize hover performance
    precomputeAllPatternData();
    
    // Update display
    updateProgressionDisplay();
    
    // Update fretboard display
    displayAllChordPatterns();
}

/**
 * Precompute pattern data for all chords in the current progression
 */
function precomputeAllPatternData() {
    // Clear any pattern data for indices that exceed the current progression length
    const indicesToRemove = [];
    for (let index of precomputedPatternData.keys()) {
        if (index >= currentProgression.length) {
            indicesToRemove.push(index);
        }
    }
    indicesToRemove.forEach(index => {
        precomputedPatternData.delete(index);
        selectedPatternIndexes.delete(index);
    });
    
    // Compute pattern data for all current chords
    currentProgression.forEach((chord, index) => {
        // Always recompute to ensure fresh data
        const patternData = precomputePatternData(chord, index);
        precomputedPatternData.set(index, patternData);
    });
}

/**
 * Update the visual display of the progression
 */
function updateProgressionDisplay() {
    const displaySection = document.getElementById('progression-display-section');
    if (!displaySection) return;
    
    displaySection.innerHTML = '';
    
    if (currentProgression.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.textContent = 'Enter a chord progression above to see it displayed here';
        placeholder.style.cssText = `
            color: #999;
            font-style: italic;
            text-align: center;
            padding: 20px;
        `;
        displaySection.appendChild(placeholder);
        return;
    }
    
    // Create chord list
    const chordList = document.createElement('div');
    chordList.className = 'chord-list';
    chordList.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
    `;
    
    currentProgression.forEach((chord, index) => {
        const chordElement = createChordElement(chord, index);
        chordList.appendChild(chordElement);
    });
    
    displaySection.appendChild(chordList);
}

/**
 * Create a mini fretboard visualization for a chord pattern
 * This shows a 5-fret vertical section with chord notes highlighted,
 * fret numbers above, and note names below.
 * @param {Object} pattern - Chord pattern with positions
 * @param {Array} chordNotes - Array of chord note names
 * @returns {HTMLElement} Mini fretboard SVG element
 */
function createMiniFretboardVisualization(pattern, chordNotes) {
    if (!pattern || !pattern.positions || pattern.positions.length === 0) {
        return null;
    }
    
    const config = MINI_FRETBOARD_CONFIG;
    const positions = pattern.positions;
    
    // Find the fret range for this pattern
    const minFret = Math.min(...positions.map(p => p.fret));
    const maxFret = Math.max(...positions.map(p => p.fret));
    const startFret = minFret; // Start from the actual minimum fret (could be 0)
    const endFret = Math.max(startFret + config.fretCount - 1, maxFret); // Ensure we show all pattern notes
    
    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', config.width + 10); // Add extra width padding
    svg.setAttribute('height', config.height + 30); // Extra space for labels
    svg.style.cssText = `
        display: block;
        margin: 0 auto 8px auto;
        background: rgba(0,0,0,0.1);
        border-radius: 4px;
        padding: 5px;
    `;
    
    // Calculate positions
    const stringSpacing = config.stringSpacing;
    const fretHeight = config.fretHeight;
    const startX = 20; // Increased left margin
    const startY = 20;
    
    // Draw fret lines (horizontal)
    for (let fret = 0; fret <= config.fretCount; fret++) {
        const y = startY + fret * fretHeight;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', startX);
        line.setAttribute('y1', y);
        line.setAttribute('x2', startX + (config.stringCount - 1) * stringSpacing);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', fret === 0 ? '#fff' : '#666'); // Nut is white, frets are gray
        line.setAttribute('stroke-width', fret === 0 ? '3' : '1');
        svg.appendChild(line);
    }
    
    // Draw string lines (vertical)
    for (let string = 0; string < config.stringCount; string++) {
        const x = startX + string * stringSpacing;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', x);
        line.setAttribute('y2', startY + config.fretCount * fretHeight);
        line.setAttribute('stroke', '#888');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }
    
    // Standard guitar tuning (from left to right: low E to high E, matching tab convention)
    const stringTuning = ['E', 'A', 'D', 'G', 'B', 'E'];
    
    // Draw fret numbers to the left of the fretboard
    for (let fret = 1; fret <= config.fretCount; fret++) {
        // Calculate the actual fret number this position represents
        let actualFret;
        if (startFret === 0) {
            // For open chords, fret positions 1,2,3,4,5 represent actual frets 1,2,3,4,5
            actualFret = fret;
        } else {
            // For higher frets, adjust calculation
            actualFret = startFret + fret - 1;
        }
        
        if (actualFret >= 1) { // Only show fret numbers for actual frets (not open strings)
            const y = startY + (fret - 0.5) * fretHeight;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', startX - 10); // Position to the left of the fretboard
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#ccc');
            text.setAttribute('font-size', config.fretNumberSize);
            text.setAttribute('font-family', 'monospace');
            text.textContent = actualFret;
            svg.appendChild(text);
        }
    }
    
    // Create a map to store notes for each string at the displayed frets
    const stringNotes = new Map();
    
    // Draw chord notes on the fretboard
    positions.forEach(position => {
        const { string: stringNum, fret } = position;
        
        // Convert to display index: 1st string (high E) on the right, 6th string (low E) on the left
        // stringNum is 1-based (1=high E, 6=low E), so reverse the display order and make 0-based
        const stringIndex = config.stringCount - stringNum - 1;
        
        // Check if this fret is within our display range
        if (fret >= startFret && fret <= endFret) {
            const x = startX + stringIndex * stringSpacing;
            let y;
            
            if (fret === 0) {
                // Open string - place marker on the nut (fret 0 line)
                y = startY;
                
                // Add "0" label to the left for open strings
                const openLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                openLabel.setAttribute('x', startX - 10);
                openLabel.setAttribute('y', y);
                openLabel.setAttribute('text-anchor', 'middle');
                openLabel.setAttribute('dominant-baseline', 'middle');
                openLabel.setAttribute('fill', '#ccc');
                openLabel.setAttribute('font-size', config.fretNumberSize);
                openLabel.setAttribute('font-family', 'monospace');
                openLabel.textContent = '0';
                svg.appendChild(openLabel);
            } else {
                // Fretted note - place marker between frets
                // Calculate the display position based on the startFret context
                let displayFret;
                if (startFret === 0) {
                    // For open chords, fret N goes to display position N
                    displayFret = fret;
                } else {
                    // For higher frets, adjust calculation
                    displayFret = fret - startFret + 1;
                }
                y = startY + (displayFret - 0.5) * fretHeight;
            }
            
            // Calculate the note name for this position
            const openStringNote = stringTuning[stringIndex];
            const noteAtFret = getNote(openStringNote, fret);
            const strippedNote = notationStripOctave(noteAtFret);
            
            // Store note for this string
            stringNotes.set(stringIndex, strippedNote);
            
            // Determine if this is a root note
            const isRootNote = chordNotes.length > 0 && strippedNote === chordNotes[0];
            
            // Draw note circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', config.noteRadius);
            circle.setAttribute('fill', isRootNote ? '#ff6b35' : '#4CAF50'); // Orange for root, green for others
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '1');
            svg.appendChild(circle);
        }
    });
    
    // Draw note names below the fretboard
    for (let stringIndex = 0; stringIndex < config.stringCount; stringIndex++) {
        const x = startX + stringIndex * stringSpacing;
        const y = startY + config.fretCount * fretHeight + 15;
        
        const note = stringNotes.get(stringIndex);
        if (note) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', config.noteNameSize);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', 'bold');
            text.textContent = note;
            svg.appendChild(text);
        }
    }
    
    return svg;
}

/**
 * Helper function to get note name at a specific fret
 * @param {string} openString - Open string note (e.g., 'E', 'A', 'D', 'G', 'B', 'E')
 * @param {number} fret - Fret number
 * @returns {string} Note name at that fret
 */
function getNote(openString, fret) {
    const chromaticScale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Find the starting note index
    let startIndex = chromaticScale.indexOf(openString);
    if (startIndex === -1) {
        // Handle flat notes
        const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
        startIndex = chromaticScale.indexOf(flatToSharp[openString] || openString);
    }
    
    if (startIndex === -1) {
        return openString; // Fallback if note not found
    }
    
    // Calculate the note at the given fret
    const noteIndex = (startIndex + fret) % 12;
    return chromaticScale[noteIndex];
}

/**
 * Create a visual element for a single chord
 * @param {Object} chord - Chord data
 * @param {number} index - Index in progression
 * @returns {HTMLElement} Chord element
 */
function createChordElement(chord, index) {
    const element = document.createElement('div');
    element.className = 'chord-element';
    
    // Determine border color based on chord status
    let borderColor = '#666'; // Default
    if (chord.isInvalid) {
        borderColor = '#ff4444'; // Red for invalid chords
    } else if (chord.isFallback) {
        borderColor = '#ffaa00'; // Orange for fallback resolution
    }
    
    element.style.cssText = `
        background: #444;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 15px;
        min-width: 120px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
    `;
    
    // Add status indicator if needed
    if (chord.isInvalid || chord.isFallback) {
        const statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${chord.isInvalid ? '#ff4444' : '#ffaa00'};
        `;
        statusIndicator.title = chord.isInvalid ? 
            'Chord could not be resolved in current scale' : 
            'Chord resolved using fallback (scale may not be fully defined)';
        element.appendChild(statusIndicator);
    }
    
    // Create chord name display
    const chordName = document.createElement('div');
    chordName.className = 'chord-name';
    const displayName = getChordDisplayName(chord);
    chordName.textContent = displayName;
    chordName.style.cssText = `
        font-size: 18px;
        font-weight: bold;
        color: ${chord.isInvalid ? '#ff9999' : '#fff'};
        text-align: center;
        margin-bottom: 8px;
    `;
    element.appendChild(chordName);
    
    // Create chord info display
    if (chord.chordInfo && chord.chordInfo.notes) {
        const notesDisplay = document.createElement('div');
        notesDisplay.className = 'chord-notes';
        const notes = chord.chordInfo.notes.map(note => notationStripOctave(note));
        notesDisplay.textContent = notes.join(' - ');
        notesDisplay.style.cssText = `
            font-size: 12px;
            color: ${chord.isInvalid ? '#ff9999' : '#ccc'};
            text-align: center;
            margin-bottom: 10px;
        `;
        element.appendChild(notesDisplay);
        
        // Add mini piano visualization if enabled
        if (showMiniPianos) {
            const scaleToggleCheckbox = document.getElementById('chord-progression-scale-toggle');
            const showScaleContext = scaleToggleCheckbox && scaleToggleCheckbox.checked;
            
            let miniPiano;
            if (showScaleContext) {
                // Get current scale notes for context
                const primaryScaleId = getPrimaryScale();
                const primaryRoot = getPrimaryRootNote();
                if (primaryScaleId && primaryRoot) {
                    try {
                        // Parse the scale ID to get family and mode
                        const [family, mode] = primaryScaleId.split('-');
                        const scales = HeptatonicScales;
                        if (scales[family] && scales[family][parseInt(mode, 10) - 1]) {
                            const intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                            const scaleNotes = getScaleNotes(primaryRoot, intervals);
                            const scaleNotesNoOctave = scaleNotes.map(note => notationStripOctave(note));
                            
                            // Create mixed piano showing both chord and scale
                            miniPiano = createMixedPiano(notes, scaleNotesNoOctave, notes[0]);
                        } else {
                            // Fallback to chord-only display if scale data is invalid
                            miniPiano = createChordPiano(notes, notes[0]);
                        }
                    } catch (error) {
                        console.warn('Error getting scale notes for mini piano:', error);
                        // Fallback to chord-only display
                        miniPiano = createChordPiano(notes, notes[0]);
                    }
                } else {
                    // Fallback to chord-only display
                    miniPiano = createChordPiano(notes, notes[0]);
                }
            } else {
                // Show chord only
                miniPiano = createChordPiano(notes, notes[0]);
            }
            
            if (miniPiano) {
                miniPiano.style.cssText = `
                    margin: 8px auto;
                `;
                element.appendChild(miniPiano);
            }
        }
    } else {
        // Show error message for invalid chords
        const errorDisplay = document.createElement('div');
        errorDisplay.textContent = 'Could not resolve chord';
        errorDisplay.style.cssText = `
            font-size: 12px;
            color: #ff9999;
            text-align: center;
            margin-bottom: 10px;
            font-style: italic;
        `;
        element.appendChild(errorDisplay);
    }
    
    // Create pattern selector (only if chord is valid)
    if (!chord.isInvalid && chord.chordInfo) {
        const patternSelector = createPatternSelector(chord, index);
        element.appendChild(patternSelector);
    }
    
    // Add hover effects with dynamic highlighting
    element.addEventListener('mouseenter', () => {
        if (!chord.isInvalid) {
            element.style.borderColor = '#4CAF50';
            element.style.background = '#555';
            hoveredChordIndex = index;
            displaySingleChordPattern(chord, index, true); // Highlight when hovered
        }
    });
    
    element.addEventListener('mouseleave', () => {
        element.style.borderColor = borderColor; // Restore original border color
        element.style.background = '#444';
        hoveredChordIndex = null;
        displayAllChordPatterns();
    });
    
    return element;
}

/**
 * Get display name for a chord
 * @param {Object} chord - Chord data
 * @returns {string} Display name
 */
function getChordDisplayName(chord) {
    if (chord.type === 'roman') {
        if (chord.resolvedRoot && chord.resolvedChordType) {
            return `${chord.originalToken} (${chord.resolvedRoot}${chord.resolvedChordType})`;
        }
        return chord.originalToken;
    }
    return chord.originalToken;
}

/**
 * Create pattern selector dropdown for a chord
 * @param {Object} chord - Chord data
 * @param {number} index - Chord index
 * @returns {HTMLElement} Pattern selector element
 */
function createPatternSelector(chord, index) {
    const container = document.createElement('div');
    container.className = 'pattern-selector-container';
    
    // Use precomputed pattern data if available
    let patternData = precomputedPatternData.get(index);
    if (!patternData || !patternData.chord || patternData.chord !== chord) {
        // Fallback to computing on demand, or recompute if chord has changed
        patternData = precomputePatternData(chord, index);
        precomputedPatternData.set(index, patternData);
    }
    
    const { patterns } = patternData;
    
    if (patterns.length === 0) {
        const noPatterns = document.createElement('div');
        noPatterns.textContent = 'No patterns found';
        noPatterns.style.cssText = `
            font-size: 11px;
            color: #999;
            text-align: center;
        `;
        container.appendChild(noPatterns);
        return container;
    }
    
    // Create mini fretboard visualization container (will be populated later)
    let miniFretboardContainer = null;
    if (showMiniFretboards) {
        miniFretboardContainer = document.createElement('div');
        miniFretboardContainer.className = 'mini-fretboard-container';
        miniFretboardContainer.style.cssText = `
            margin-bottom: 8px;
            text-align: center;
        `;
        container.appendChild(miniFretboardContainer);
    }
    
    // Create main container for the pattern selector
    const selectorContainer = document.createElement('div');
    selectorContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 2px;
        width: 100%;
    `;

    // Create previous pattern button
    const prevButton = document.createElement('button');
    prevButton.textContent = '−';
    prevButton.style.cssText = `
        width: 18px;
        height: 24px;
        padding: 0;
        border: 1px solid #666;
        border-radius: 3px;
        background: #444;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    `;
    prevButton.title = 'Previous pattern';

    // Create dropdown
    const select = document.createElement('select');
    select.className = 'pattern-selector';
    select.style.cssText = `
        flex: 1;
        padding: 4px;
        font-size: 11px;
        border: 1px solid #666;
        border-radius: 3px;
        background: #333;
        color: #fff;
        min-width: 0;
    `;

    // Create next pattern button
    const nextButton = document.createElement('button');
    nextButton.textContent = '+';
    nextButton.style.cssText = `
        width: 18px;
        height: 24px;
        padding: 0;
        border: 1px solid #666;
        border-radius: 3px;
        background: #444;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    `;
    nextButton.title = 'Next pattern';

    // Function to update button states
    const updateButtonStates = () => {
        const currentIndex = parseInt(select.value) || 0;
        const isFirst = currentIndex <= 0;
        const isLast = currentIndex >= patterns.length - 1;
        
        prevButton.disabled = isFirst;
        nextButton.disabled = isLast;
        
        // Style disabled buttons
        [prevButton, nextButton].forEach(btn => {
            if (btn.disabled) {
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
    };

    // Function to change pattern selection
    const changePattern = (direction) => {
        const currentIndex = parseInt(select.value) || 0;
        let newIndex = currentIndex + direction;
        
        // Clamp to valid range
        newIndex = Math.max(0, Math.min(patterns.length - 1, newIndex));
        
        if (newIndex !== currentIndex) {
            select.value = newIndex;
            // Trigger change event
            select.dispatchEvent(new Event('change'));
        }
    };
    
    // Function to update mini fretboard visualization
    const updateMiniFretboard = () => {
        if (!showMiniFretboards || !miniFretboardContainer) return;
        
        const patternIndex = parseInt(select.value) || 0;
        if (patternIndex >= patterns.length) return;
        
        const pattern = patterns[patternIndex];
        const { chordNotes } = patternData;
        
        // Clear existing mini fretboard
        miniFretboardContainer.innerHTML = '';
        
        // Create new mini fretboard
        const miniFretboard = createMiniFretboardVisualization(pattern, chordNotes);
        if (miniFretboard) {
            miniFretboardContainer.appendChild(miniFretboard);
        }
    };
    
    // Add pattern options with improved naming
    patterns.forEach((pattern, patternIndex) => {
        const option = document.createElement('option');
        option.value = patternIndex;
        
        const minFret = Math.min(...pattern.positions.map(p => p.fret));
        const maxFret = Math.max(...pattern.positions.map(p => p.fret));
        const fretSpan = maxFret - minFret;
        
        // Create descriptive pattern name
        let patternName = `Fret ${minFret}`;
        if (fretSpan > 0) {
            patternName += `-${maxFret}`;
        }
        
        // Add pattern type if available
        if (pattern.name) {
            patternName += ` (${pattern.name})`;
        } else {
            patternName += ` (${pattern.positions.length} notes)`;
        }
        
        option.textContent = patternName;
        select.appendChild(option);
    });
    
    // Set initial selection
    const initialSelection = selectedPatternIndexes.get(index) || 0;
    select.value = initialSelection;

    // Add change event listener with improved highlighting
    select.addEventListener('change', (e) => {
        const patternIndex = parseInt(e.target.value);
        selectedPatternIndexes.set(index, patternIndex);
        
        // Update button states
        updateButtonStates();
        
        // Update mini fretboard visualization
        updateMiniFretboard();
        
        // Add subtle visual feedback to the dropdown itself
        select.style.background = '#4CAF50';
        select.style.transition = 'background 0.3s ease';
        setTimeout(() => {
            select.style.background = '#333';
        }, 300);
        
        // Immediately update the display without temporary highlighting to avoid conflicts
        if (hoveredChordIndex === index) {
            // If this chord is currently hovered, show it highlighted
            displaySingleChordPattern(chord, index, true);
        } else if (hoveredChordIndex === null) {
            // If no chord is hovered, show all patterns
            displayAllChordPatterns();
        } else {
            // If another chord is hovered, show that one
            displaySingleChordPattern(currentProgression[hoveredChordIndex], hoveredChordIndex, true);
        }
    });

    // Add button event listeners
    prevButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changePattern(-1);
    });

    nextButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changePattern(1);
    });

    // Initial button state update
    updateButtonStates();

    // Assemble the selector container
    selectorContainer.appendChild(prevButton);
    selectorContainer.appendChild(select);
    selectorContainer.appendChild(nextButton);
    
    container.appendChild(selectorContainer);
    
    // Initialize mini fretboard visualization
    updateMiniFretboard();
    
    return container;
}

/**
 * Display a single chord pattern on the fretboard
 * @param {Object} chord - Chord data
 * @param {number} index - Chord index
 * @param {boolean} isHighlighted - Whether this chord should be highlighted
 */
function displaySingleChordPattern(chord, index, isHighlighted = false) {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;
    
    // Use precomputed pattern data if available
    let patternData = precomputedPatternData.get(index);
    if (!patternData || !patternData.chord || patternData.chord !== chord) {
        // Fallback to computing on demand, or recompute if chord has changed
        patternData = precomputePatternData(chord, index);
        precomputedPatternData.set(index, patternData);
    }
    
    // Clear only chord lines, keep scale context if enabled
    fretboard.clearChordLines();
    
    // Show scale context if toggle is checked
    const scaleToggle = document.getElementById('chord-progression-scale-toggle');
    const showScaleContext = scaleToggle && scaleToggle.checked;
    
    if (showScaleContext) {
        // Re-display scale context
        displayScaleContext();
    } else {
        // Clear all markers if scale context is disabled
        fretboard.clearMarkers();
    }
    
    // Display chord notes regardless of whether patterns exist
    const { chordNotes, patterns, displayName, hasPatterns } = patternData;
    
    // If no patterns are available, show chord notes with enhanced visibility when hovered
    if (!hasPatterns) {
        // Display the chord normally
        fretboard.displayChord(chordNotes, displayName, {
            clearFirst: false,
            showLines: false,
            showScaleContext: showScaleContext
        });
        
        // If highlighted (hovered), add a visual indicator by displaying again with different name
        if (isHighlighted) {
            // Add a special indicator to the chord name to show it's being highlighted
            const highlightedName = `🎯 ${displayName} (Notes Only)`;
            fretboard.displayChord(chordNotes, highlightedName, {
                clearFirst: false,
                showLines: false,
                showScaleContext: showScaleContext,
                forceHighlight: true // If this option exists
            });
        }
        return;
    }
    
    // Regular chord display for chords with patterns
    fretboard.displayChord(chordNotes, displayName, {
        clearFirst: false,
        showLines: false,
        showScaleContext: showScaleContext
    });
    
    const selectedPatternIndex = selectedPatternIndexes.get(index) || 0;
    if (selectedPatternIndex >= patterns.length) return;
    
    const pattern = patterns[selectedPatternIndex];
    
    // Add pattern lines with dynamic styling
    if (pattern.positions.length > 1) {
        const linePoints = pattern.positions.map(pos => ({
            string: pos.string,
            fret: pos.fret
        }));
        
        const lineConfig = isHighlighted ? {
            color: '#ff3d00', // Brighter orange for highlighted
            lineWidth: CHORD_LINE_CONFIG.highlightedWidth,
            style: 'solid',
            opacity: CHORD_LINE_CONFIG.hoverOpacity,
            label: '',
            labelPosition: 'middle'
        } : {
            color: '#ff6b35',
            lineWidth: CHORD_LINE_CONFIG.normalWidth,
            style: 'solid',
            opacity: CHORD_LINE_CONFIG.normalOpacity,
            label: '',
            labelPosition: 'middle'
        };
        
        fretboard.drawChordLine(`progression-pattern-${index}`, linePoints, lineConfig);
    }
}

/**
 * Display scale context on the fretboard
 */
function displayScaleContext() {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;
    
    // Try to access the global scale display function
    if (typeof window.showScaleOnFretboard === 'function') {
        window.showScaleOnFretboard(false); // false to not clear existing content
    } else {
        // Fallback: try to trigger scale display through button click
        const scaleButton = document.querySelector('[data-chord-index="0"]');
        if (scaleButton) {
            // Simulate scale button activation without clearing other content
            const event = new Event('mouseenter');
            scaleButton.dispatchEvent(event);
        }
    }
}

/**
 * Display all chord patterns from the progression on the fretboard
 */
function displayAllChordPatterns() {
    const fretboard = getFretboardForProgression();
    if (!fretboard) return;
    
    // Clear only chord lines, preserve scale context if enabled
    fretboard.clearChordLines();
    
    // Show scale context if toggle is checked
    const scaleToggle = document.getElementById('chord-progression-scale-toggle');
    const showScaleContext = scaleToggle && scaleToggle.checked;
    
    if (showScaleContext) {
        displayScaleContext();
    } else {
        fretboard.clearMarkers();
    }
    
    if (currentProgression.length === 0) return;
    
    // Color cycle for different chords
    const colors = [
        '#1f77b4', // blue
        '#ff7f0e', // orange  
        '#2ca02c', // green
        '#d62728', // red
        '#9467bd', // purple
        '#8c564b', // brown
        '#e377c2', // pink
        '#7f7f7f', // gray
        '#bcbd22', // olive
        '#17becf'  // cyan
    ];
    
    currentProgression.forEach((chord, index) => {
        // Use precomputed pattern data if available
        let patternData = precomputedPatternData.get(index);
        if (!patternData || !patternData.chord || patternData.chord !== chord) {
            // Fallback to computing on demand, or recompute if chord has changed
            patternData = precomputePatternData(chord, index);
            precomputedPatternData.set(index, patternData);
        }
        
        const { patterns } = patternData;
        if (!patterns.length) return;
        
        const selectedPatternIndex = selectedPatternIndexes.get(index) || 0;
        if (selectedPatternIndex >= patterns.length) return;
        
        const pattern = patterns[selectedPatternIndex];
        const color = colors[index % colors.length];
        
        // Draw pattern lines with thicker lines
        if (pattern.positions.length > 1) {
            const linePoints = pattern.positions.map(pos => ({
                string: pos.string,
                fret: pos.fret
            }));
            
            fretboard.drawChordLine(`progression-all-${index}`, linePoints, {
                color: color,
                lineWidth: CHORD_LINE_CONFIG.normalWidth,
                style: 'solid',
                opacity: CHORD_LINE_CONFIG.normalOpacity,
                label: '',
                labelPosition: 'middle'
            });
        }
    });
}

/**
 * Clear the current progression and default to scale display
 */
function clearProgression() {
    currentProgression = [];
    hoveredChordIndex = null;
    selectedPatternIndexes.clear();
    
    // Clear caches
    clearCache();
    
    const input = document.getElementById('chord-progression-input');
    if (input) {
        input.value = '';
    }
    
    updateProgressionDisplay();
    
    const fretboard = getFretboardForProgression();
    if (fretboard) {
        fretboard.clearMarkers();
        fretboard.clearChordLines();
        
        // Default back to scale display and activate scale button
        displayScaleContext();
        
        // Activate the scale button (first button in Roman numeral controls)
        const scaleButton = document.querySelector('[data-chord-index="0"]');
        if (scaleButton) {
            // Set visual state to active
            scaleButton.style.background = 'linear-gradient(to bottom, #d4edda, #c3e6cb)';
            scaleButton.style.color = '#155724';
            
            // Update the current displayed chord state in the parent context
            if (typeof window.currentDisplayedChord !== 'undefined') {
                window.currentDisplayedChord = 0; // Scale button
            }
            
            // Update button styles if the function exists
            if (typeof window.updateChordButtonStyles === 'function') {
                window.updateChordButtonStyles();
            }
        }
    }
}

// Export functions for use in other modules
export {
    createChordProgressionUI,
    parseProgressionInput,
    updateProgression,
    clearProgression,
    currentProgression,
    selectedPatternIndexes
};
