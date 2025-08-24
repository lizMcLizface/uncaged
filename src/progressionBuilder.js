import { processChord, identifySyntheticChords, intervalToSemitones } from './intervals';
import { HeptatonicScales, getScaleNotes } from './scales';
import { getPrimaryScale, getPrimaryRootNote, setPrimaryRootNote, setPrimaryScale, initializeNavigationButtonsDirect } from './scaleGenerator';
import { noteToMidi, noteToName } from './midi';
import {
    stripOctave as notationStripOctave
} from './notation';
import { createChordPiano, createMixedPiano } from './components/MiniPiano/MiniPiano';
import { createChordStave, createMixedStave } from './components/MiniStave/MiniStave';

/**
 * Process a chord to get the actual notes based on selected pattern
 * @param {Object} chord - Chord data containing chordInfo with notes
 * @param {number} index - Index of chord in progression
 * @returns {Array} Array of processed note strings with octaves
 */
function getProcessedChordNotes(chord, index) {
    if (!chord.chordInfo || !chord.chordInfo.notes) {
        return [];
    }

    let chordNotes = [];
    
    // Get the available patterns for this chord
    const patterns = getChordPatternMatches(chord);
    
    // Try to get fret-specific notes from selected pattern first
    // Default to pattern index 0 if no pattern is explicitly selected
    const selectedPatternIndex = selectedPatternIndexes.get(index) ?? 0;
    
    if (patterns && patterns[selectedPatternIndex]) {
        const selectedPattern = patterns[selectedPatternIndex];
        
        if (selectedPattern.positions && selectedPattern.positions.length > 0) {
            // Use guitar string tuning (standard tuning from low to high)
            const stringTuning = ['E', 'A', 'D', 'G', 'B', 'E']; // Low to High
            
            // Calculate specific notes from fret positions
            chordNotes = selectedPattern.positions.map(pos => {
                // Use direct indexing since pattern data is 0-based (0=low E, 5=high E)
                const tuningIndex = 5 - pos.string;

                if (tuningIndex < 0 || tuningIndex >= stringTuning.length) {
                    console.warn(`⚠️ Invalid string number ${pos.string} - expected 0-${stringTuning.length - 1}`);
                    return null;
                }
                
                const stringNote = stringTuning[tuningIndex];
                
                if (!stringNote) {
                    console.warn(`⚠️ Could not find tuning for string ${pos.string} at index ${tuningIndex}`);
                    return null;
                }
                
                const noteAtFret = getNote(stringNote, pos.fret);
                
                // Check if getNote returned a valid result
                if (!noteAtFret) {
                    console.warn(`⚠️ getNote returned undefined for string ${pos.string} (${stringNote}) fret ${pos.fret}`);
                    return null;
                }
                
                // Add octave information based on string and fret  
                const octave = getOctaveForStringAndFret(5 - pos.string, pos.fret);
                const convertedNote = convertNoteForPolySynth(noteAtFret, octave);
                return convertedNote;
            }).filter(note => note !== null); // Remove any failed conversions
        }
    }
    
    // Fallback to chord theory notes if no pattern-specific notes
    if (chordNotes.length === 0 && chord.chordInfo && chord.chordInfo.notes) {
        chordNotes = chord.chordInfo.notes.map(note => {
            const cleanNote = notationStripOctave(note);
            return convertNoteForPolySynth(cleanNote, 4); // Use octave 4 as default
        });
    }
    
    return chordNotes;
}

/**
 * Get processed progression data with actual chord notes for sequencer
 * @returns {Array} Array of processed chord data with actual notes
 */
function getProcessedProgression() {
    return currentProgression.map((chord, index) => {
        const processedNotes = getProcessedChordNotes(chord, index);
        return {
            ...chord,
            processedNotes: processedNotes,
            displayName: getChordDisplayName(chord, index)
        };
    });
}

/**
 * Convert note name to format expected by PolySynth
 * @param {string} noteName - Note name like "C", "F#", "Bb"
 * @param {number} octave - Octave number (default 4)
 * @returns {string} Formatted note like "C4", "F#4", "Bb4"
 */
function convertNoteForPolySynth(noteName, octave = 4) {
    if (!noteName || typeof noteName !== 'string') {
        console.warn('⚠️ convertNoteForPolySynth received invalid noteName:', noteName);
        return 'C4'; // Fallback to C4
    }
    return noteName.replace('/', '') + octave;
}

/**
 * Trigger a chord on the PolySynth
 * @param {Object} chord - Chord data containing chordInfo with notes
 * @param {number} index - Index of chord in progression
 */
function triggerChordProgression(chord, index) {
    if (!window.polySynthRef) {
        console.warn('PolySynth not available');
        return;
    }

    try {
        // Use the centralized function to get processed chord notes
        const chordNotes = getProcessedChordNotes(chord, index);
        
        if (chordNotes.length === 0) {
            console.warn('No notes available for chord');
            return;
        }

        console.log(`Triggering chord ${index}: ${getChordDisplayName(chord, index)}`, chordNotes);

        // Check if progression sequencer is running
        let sequencerState = null;
        if (window.polySynthRef.getProgressionSequencerState) {
            sequencerState = window.polySynthRef.getProgressionSequencerState();
        }

        // If sequencer is running, this is a timed/sequenced playback
        const isSequencedPlayback = sequencerState && sequencerState.playing;

        // Stop any currently playing notes
        if (window.polySynthRef.stopAllNotes) {
            window.polySynthRef.stopAllNotes();
        }

        // Trigger the chord notes with appropriate duration
        if (window.polySynthRef.playNotes) {
            if (isSequencedPlayback) {
                // Use the sequencer's duration setting (already converted to ms in the sequencer)
                const duration = getDurationInMs(sequencerState.duration);
                window.polySynthRef.playNotes(chordNotes, 70, duration);
            } else {
                // Direct click - play for one beat (quarter note duration)
                const oneBeatDuration = getOneBeatDuration();
                window.polySynthRef.playNotes(chordNotes, 70, oneBeatDuration);
            }
        } else if (window.polySynthRef.triggerChord) {
            window.polySynthRef.triggerChord(chordNotes);
        } else {
            console.warn('PolySynth playNotes/triggerChord method not available');
        }

    } catch (error) {
        console.error('Error triggering chord progression:', error);
    }
}

// Helper function to calculate one beat duration in milliseconds
function getOneBeatDuration() {
    try {
        // Get BPM from the metronome or default to 120
        const bpmSlider = document.querySelector('#bpmSlider');
        const bpm = bpmSlider ? Number(bpmSlider.value) : 120;
        return (60 / bpm) * 1000; // Quarter note duration in ms
    } catch (error) {
        console.warn('Could not get BPM, using default duration');
        return 500; // Default 500ms (120 BPM quarter note)
    }
}

// Helper function to convert duration string to milliseconds (matching PolySynth pattern)
function getDurationInMs(durationString) {
    try {
        const bpmSlider = document.querySelector('#bpmSlider');
        const bpm = bpmSlider ? Number(bpmSlider.value) : 120;
        const msPerBeat = (60 / bpm) * 1000; // Quarter note duration in ms
        
        switch (durationString) {
            case 'whole': return msPerBeat * 4;
            case 'half': return msPerBeat * 2;
            case 'quarter': return msPerBeat;
            case 'eighth': return msPerBeat / 2;
            case 'sixteenth': return msPerBeat / 4;
            default: return msPerBeat; // Default to quarter note
        }
    } catch (error) {
        return 500; // Fallback duration
    }
}

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
 * 
 * Pattern Notation:
 * Chords can specify a default pattern position using the syntax: chord-position
 * Examples:
 *   C-1      → C major chord, first pattern (pattern index 0)
 *   iv-3     → Fourth degree minor chord, third pattern (pattern index 2)
 *   Dm7-2    → D minor 7 chord, second pattern (pattern index 1)
 * 
 * Sharing System:
 * The sharing functionality encodes the current state (chord progression with patterns,
 * UI settings, scale/root note) into a Base64-encoded URL parameter. When the page loads
 * with a share parameter, it automatically restores all settings and progressions.
 * 
 * Example shared URL: https://site.com/?share=eyJwcm9ncmVzc2lvbiI6I...
 * 
 * State includes:
 * - Chord progression with selected patterns (e.g., "C-1 Am-2 F-1 G-3")
 * - Show scale context toggle
 * - Mini fretboards toggle  
 * - Mini pianos toggle
 * - Mini staves toggle
 * - Use seventh chords toggle
 * - Current root note (human readable, e.g., "C", "F♯")
 * - Current scale (human readable, e.g., "Major-1", "Minor-1")
 */

// Global state for chord progression
let currentProgression = [];

// Expose current progression globally for PolySynth access
window.currentProgression = currentProgression;
let hoveredChordIndex = null;
let selectedPatternIndexes = new Map(); // Map of chord index to selected pattern index
let showMiniFretboards = false; // Global toggle for mini fretboard visualization
let showMiniPianos = false; // Global toggle for mini piano visualization
let showMiniStaves = false; // Global toggle for mini stave visualization
let staveKey = 'C'; // Global key signature for mini staves
let staveTheoryMode = false; // Global toggle for theory mode (4th octave notes)
let useSeventhChords = false; // Global toggle for triads vs seventh chords
let showFretboardIntervals = false; // Global toggle for showing intervals instead of note names on mini fretboards

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
    
    // Process default pattern selections for the updated progression
    processDefaultPatternSelections(updatedProgression);
    
    return updatedProgression;
}

/**
 * Parse a single chord token (either Roman numeral or chord name)
 * @param {string} token - Single chord token
 * @returns {Object|null} Parsed chord data or null if invalid
 */
function parseChordToken(token) {
    // Check for pattern notation (e.g., "C-1", "iv-3")
    const patternMatch = token.match(/^(.+)-(\d+)$/);
    let chordPart = token;
    let defaultPatternIndex = null;
    
    if (patternMatch) {
        chordPart = patternMatch[1];
        defaultPatternIndex = parseInt(patternMatch[2], 10) - 1; // Convert to 0-based index
        
        // Validate pattern index is reasonable (0-10 for most chord patterns)
        if (defaultPatternIndex < 0 || defaultPatternIndex > 10) {
            console.warn(`Invalid pattern index in token: ${token}. Pattern index should be between 1-11.`);
            defaultPatternIndex = null;
        }
    }
    
    // Check if it's a Roman numeral - enhanced pattern to properly handle flat/sharp prefixes
    const romanMatch = chordPart.match(/^([b#]*)(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)(.*)$/);
    
    let chordData;
    if (romanMatch) {
        chordData = parseRomanNumeral(chordPart);
    } else {
        chordData = parseChordName(chordPart);
    }
    
    // Add default pattern information if present
    if (chordData && defaultPatternIndex !== null) {
        chordData.defaultPatternIndex = defaultPatternIndex;
        chordData.originalToken = token; // Keep the full original token including pattern notation
    }
    
    return chordData;
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
                const resolvedChord = resolveRomanChord(chord);
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
                    selectedPatternIndexes.set(index, chord.defaultPatternIndex);
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
        
        // if (!scaleNotes || scaleNotes.length < 7) {
        //     console.warn(`Incomplete scale notes for ${primaryScale}. Using fallback resolution.`);
        //     return resolveFallbackRomanChord(romanChord, scaleRootNote);
        // }
        
        // Use identifySyntheticChords to get scale-aware chord types
        let diatonicChords;
        try {
            // Use length 4 for seventh chords when the toggle is enabled, otherwise use 3 for triads
            const chordLength = useSeventhChords ? 4 : 3;
            diatonicChords = identifySyntheticChords(scaleDefinition, chordLength, scaleRootNote);
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
            
            // Debug output for chord type generation
            console.log(`🎵 Chord ${romanChord.degree}: ${chordRoot}${chordType} (diatonic, useSeventhChords: ${useSeventhChords})`);
            
            // Handle suffix modifications if present
            if (romanChord.suffix) {
                chordType = modifyChordTypeWithSuffix(chordType, romanChord.suffix);
            }
            // No need to apply addSeventhToChordType here since we already generated 
            // the correct diatonic chord types based on useSeventhChords toggle
        } else {
            // Fallback to traditional Roman numeral interpretation
            console.warn(`No diatonic chord found for degree ${romanChord.degree}, using traditional interpretation`);
            if (romanChord.suffix) {
                chordType = romanSuffixToChordType(romanChord.suffix, romanChord.isNaturallyMinor);
            } else if (useSeventhChords) {
                // Apply seventh chords based on natural quality with scale degree context
                if (romanChord.isNaturallyMinor) {
                    chordType = 'm7';
                } else {
                    chordType = addSeventhToChordType('', romanChord.degree, primaryScale);
                }
                console.log(`🎵 Chord ${romanChord.degree}: ${chordRoot}${chordType} (fallback, useSeventhChords: ${useSeventhChords})`);
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
 * @param {number} [scaleDegree] - Optional scale degree (1-7) to determine proper seventh type
 * @param {string} [scaleName] - Optional scale name for context
 * @returns {string} Chord type with seventh added
 */
function addSeventhToChordType(baseChordType, scaleDegree = null, scaleName = null) {
    // Handle various chord type formats
    const lowerType = baseChordType.toLowerCase();
    
    if (baseChordType === '' || baseChordType === 'maj' || baseChordType === 'Major') {
        // For major chords, determine if it should be major 7th or dominant 7th based on scale degree
        if (scaleDegree !== null && scaleName) {
            // In major scales, I and IV chords typically get major 7th, V gets dominant 7th
            // In minor scales, it varies but let's use the same logic for now
            if (scaleDegree === 1 || scaleDegree === 4) {
                return 'maj7'; // Major 7th for I and IV chords
            } else if (scaleDegree === 5) {
                return '7'; // Dominant 7th for V chord
            }
        }
        return '7'; // Default to dominant 7th if no context
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
            // Apply seventh chords based on natural quality with scale degree context
            if (romanChord.isNaturallyMinor) {
                chordType = 'm7';
            } else {
                chordType = addSeventhToChordType('', romanChord.degree, 'Major'); // Assume major scale for fallback
            }
        } else if (romanChord.isNaturallyMinor) {
            chordType = 'min';
        } else {
            chordType = '';
        }
        console.log(`Resolved chord type for ${romanChord.originalToken}:`, chordType);

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
    
    console.log('Chord: ', chord);
    console.log('Chord notes: ', chord.chordInfo.notes);
    const chordNotes = chord.chordInfo.notes.map(note => notationStripOctave(note));
    const rootNote = chordNotes[0];
    
    const patterns = fretboard.findChordPatternMatches(chordNotes, rootNote);
    
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
                        if(intervalName == "P1")
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
    title.textContent = 'unCAGED';
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
    
    // Reinitialize navigation buttons since we've created new root and scale buttons
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        initializeNavigationButtonsDirect();
        // Initialize the scale notes display with current scale (with retries)
        initializeScaleNotesDisplay();
    }, 100);
    
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
            
            // Update progression display to refresh mini pianos and mini staves with new scale context
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
            
            // Update progression display to refresh mini pianos and mini staves with new scale context
            updateProgressionDisplayForScaleChange();
        }
    };
    
    // Check every 2000ms for scale changes (reduced frequency since event system is primary)
    setInterval(checkForScaleChanges, 2000);
    
    // Also add a more frequent check specifically for scale notes display updates
    let lastDisplayedNotes = '';
    setInterval(() => {
        const scaleNotesDisplay = document.getElementById('scaleNotesDisplay');
        if (scaleNotesDisplay) {
            const currentDisplayedNotes = scaleNotesDisplay.textContent;
            if (currentDisplayedNotes === 'Loading...' || currentDisplayedNotes === 'No scale selected') {
                // Try to update if we're showing a fallback message
                updateScaleNotesDisplay();
            }
        }
    }, 1000);
}

/**
 * Initialize the scale notes display with retries to ensure data is loaded
 */
function initializeScaleNotesDisplay() {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 400;
    
    const tryUpdate = () => {
        const rootNote = getPrimaryRootNote();
        const primaryScale = getPrimaryScale();
        
        if (rootNote && primaryScale && primaryScale.intervals) {
            updateScaleNotesDisplay();
            return;
        }
        
        retryCount++;
        if (retryCount < maxRetries) {
            setTimeout(tryUpdate, retryDelay);
        } else {
            // Try to set a default
            const scaleNotesDisplay = document.getElementById('scaleNotesDisplay');
            if (scaleNotesDisplay) {
                scaleNotesDisplay.textContent = 'C D E F G A B';
            }
        }
    };
    
    tryUpdate();
}

/**
 * Update the scale notes display with current scale notes
 */
function updateScaleNotesDisplay() {
    const scaleNotesDisplay = document.getElementById('scaleNotesDisplay');
    if (!scaleNotesDisplay) return;
    
    try {
        const rootNote = getPrimaryRootNote();
        const primaryScale = getPrimaryScale();
        
        // Try to get scale notes, but provide fallbacks
        if (rootNote && primaryScale && primaryScale.intervals) {
            // Get the scale notes using the existing function
            const scaleNotes = getScaleNotes(rootNote, primaryScale.intervals);
            
            if (scaleNotes && scaleNotes.length > 0) {
                // Display the notes joined with spaces
                scaleNotesDisplay.textContent = scaleNotes.join(' ');
                return;
            }
        }
        
        // Fallback: Try to read from the current scale/root display elements
        const currentRootNode = document.getElementById('currentRootNode');
        const currentScaleNode = document.getElementById('currentScaleNode');
        
        if (currentRootNode && currentScaleNode) {
            const displayedRoot = currentRootNode.textContent?.trim();
            const displayedScale = currentScaleNode.textContent?.trim();
            
            // Simple fallback for common scales
            if (displayedRoot && displayedScale) {
                const fallbackNotes = generateFallbackScaleNotes(displayedRoot, displayedScale);
                if (fallbackNotes) {
                    scaleNotesDisplay.textContent = fallbackNotes;
                    return;
                }
            }
        }
        
        // If all else fails, try once more after a short delay
        setTimeout(() => {
            const retryRootNote = getPrimaryRootNote();
            const retryPrimaryScale = getPrimaryScale();
            
            if (retryRootNote && retryPrimaryScale && retryPrimaryScale.intervals) {
                const retryScaleNotes = getScaleNotes(retryRootNote, retryPrimaryScale.intervals);
                if (retryScaleNotes && retryScaleNotes.length > 0) {
                    scaleNotesDisplay.textContent = retryScaleNotes.join(' ');
                    return;
                }
            }
            
            scaleNotesDisplay.textContent = 'Loading...';
        }, 300);
        
    } catch (error) {
        console.error('Error updating scale notes display:', error);
        scaleNotesDisplay.textContent = 'Error loading notes';
    }
}

/**
 * Generate fallback scale notes for common scales
 * @param {string} root - Root note
 * @param {string} scaleName - Scale name
 * @returns {string|null} Scale notes string or null
 */
function generateFallbackScaleNotes(root, scaleName) {
    // Simple major scale pattern (whole and half steps)
    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Find root note index
    let rootIndex = chromaticNotes.indexOf(root);
    if (rootIndex === -1) {
        // Try with flat notation
        const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        rootIndex = flatNotes.indexOf(root);
        if (rootIndex === -1) return null;
    }
    
    // For now, just handle major scales
    if (scaleName.toLowerCase().includes('major')) {
        const scaleNotes = majorIntervals.map(interval => {
            const noteIndex = (rootIndex + interval) % 12;
            return chromaticNotes[noteIndex];
        });
        return scaleNotes.join(' ');
    }
    
    return null;
}

/**
 * Update progression display when scale changes to refresh mini pianos, mini staves and Roman numerals
 */
function updateProgressionDisplayForScaleChange() {
    // First update any Roman numeral chords
    updateRomanNumeralChords();
    
    // Update the scale notes display
    updateScaleNotesDisplay();
    
    // Then refresh the entire progression display to update mini pianos and mini staves with new scale context
    // This ensures all mini pianos and mini staves (not just Roman numeral chords) show the updated scale
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
    
    // Create input label container with flex layout
    const labelContainer = document.createElement('div');
    labelContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        flex-wrap: wrap;
        gap: 12px;
    `;
    
    // Create input label
    const label = document.createElement('label');
    label.textContent = 'Enter Chord Progression:';
    label.style.cssText = `
        color: #fff;
        font-weight: bold;
        font-size: 14px;
        margin: 0;
    `;
    labelContainer.appendChild(label);
    
    // Create controls container for both root and scale
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
    `;
    
    // Create root controls container
    const rootControlsContainer = document.createElement('div');
    rootControlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    // Create root label
    const rootLabel = document.createElement('span');
    rootLabel.textContent = 'Root:';
    rootLabel.style.cssText = `
        color: #fff;
        font-weight: bold;
        font-size: 14px;
    `;
    rootControlsContainer.appendChild(rootLabel);
    
    // Create previous root button
    const prevRootBtn = document.createElement('button');
    prevRootBtn.id = 'prevRootBtn';
    prevRootBtn.textContent = '‹';
    prevRootBtn.title = 'Previous Root (, key)';
    prevRootBtn.style.cssText = `
        background: linear-gradient(145deg, #555, #333);
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
    `;
    rootControlsContainer.appendChild(prevRootBtn);
    
    // Create current root display
    const currentRootNode = document.createElement('div');
    currentRootNode.id = 'currentRootNode';
    currentRootNode.textContent = 'C';
    currentRootNode.style.cssText = `
        display: inline-block;
        font-weight: bold;
        min-width: 40px;
        text-align: center;
        color: #fff;
        background: rgba(0,0,0,0.3);
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #666;
    `;
    rootControlsContainer.appendChild(currentRootNode);
    
    // Create next root button
    const nextRootBtn = document.createElement('button');
    nextRootBtn.id = 'nextRootBtn';
    nextRootBtn.textContent = '›';
    nextRootBtn.title = 'Next Root (. key)';
    nextRootBtn.style.cssText = `
        background: linear-gradient(145deg, #555, #333);
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
    `;
    rootControlsContainer.appendChild(nextRootBtn);
    
    controlsContainer.appendChild(rootControlsContainer);
    
    // Create scale controls container
    const scaleControlsContainer = document.createElement('div');
    scaleControlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
    `;
    
    // Create scale label
    const scaleLabel = document.createElement('span');
    scaleLabel.textContent = 'Scale:';
    scaleLabel.style.cssText = `
        color: #fff;
        font-weight: bold;
        font-size: 14px;
    `;
    scaleControlsContainer.appendChild(scaleLabel);
    
    // Create previous scale button
    const prevScaleBtn = document.createElement('button');
    prevScaleBtn.id = 'prevScaleBtn';
    prevScaleBtn.textContent = '‹';
    prevScaleBtn.title = 'Previous Scale (N key)';
    prevScaleBtn.style.cssText = `
        background: linear-gradient(145deg, #555, #333);
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
    `;
    scaleControlsContainer.appendChild(prevScaleBtn);
    
    // Create current scale display
    const currentScaleNode = document.createElement('div');
    currentScaleNode.id = 'currentScaleNode';
    currentScaleNode.textContent = 'C Major';
    currentScaleNode.style.cssText = `
        display: inline-block;
        font-weight: bold;
        min-width: 100px;
        text-align: center;
        color: #fff;
        background: rgba(0,0,0,0.3);
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #666;
    `;
    scaleControlsContainer.appendChild(currentScaleNode);
    
    // Create next scale button
    const nextScaleBtn = document.createElement('button');
    nextScaleBtn.id = 'nextScaleBtn';
    nextScaleBtn.textContent = '›';
    nextScaleBtn.title = 'Next Scale (M key)';
    nextScaleBtn.style.cssText = `
        background: linear-gradient(145deg, #555, #333);
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
    `;
    scaleControlsContainer.appendChild(nextScaleBtn);
    
    controlsContainer.appendChild(scaleControlsContainer);
    
    // Create scale notes display container
    const scaleNotesContainer = document.createElement('div');
    scaleNotesContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: rgba(68, 255, 68, 0.1);
        border: 1px solid rgba(68, 255, 68, 0.3);
        border-radius: 6px;
        margin-left: 8px;
    `;
    
    // Create scale notes label
    const scaleNotesLabel = document.createElement('span');
    scaleNotesLabel.textContent = 'Notes:';
    scaleNotesLabel.style.cssText = `
        color: #c9c9c9ff;
        font-weight: bold;
        font-size: 12px;
        margin: 0;
    `;
    scaleNotesContainer.appendChild(scaleNotesLabel);
    
    // Create scale notes display
    const scaleNotesDisplay = document.createElement('div');
    scaleNotesDisplay.id = 'scaleNotesDisplay';
    scaleNotesDisplay.textContent = 'C D E F G A B';
    scaleNotesDisplay.style.cssText = `
        color: #c9c9c9ff;
        font-weight: normal;
        font-size: 12px;
        font-family: monospace;
        letter-spacing: 1px;
    `;
    scaleNotesContainer.appendChild(scaleNotesDisplay);
    
    controlsContainer.appendChild(scaleNotesContainer);
    labelContainer.appendChild(controlsContainer);
    section.appendChild(labelContainer);
    
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
    
    // Add input event listener with debouncing and playback blocking
    input.addEventListener('input', (e) => {
        // Check if progression is currently playing
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state && state.playing) {
                // Block text changes during playback to prevent confusion
                console.log('🚫 Blocking text changes during progression playback');
                e.preventDefault();
                e.stopPropagation();
                e.target.value = lastProgressionText || '';
                
                // Add visual feedback
                e.target.style.borderColor = '#ff6b6b';
                e.target.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
                setTimeout(() => {
                    e.target.style.borderColor = '';
                    e.target.style.boxShadow = '';
                }, 1000);
                
                return false;
            }
        }
        
        const progressionText = e.target.value;
        lastProgressionText = progressionText; // Update the stored value
        
        // Clear any existing timer
        if (inputDebounceTimer) {
            clearTimeout(inputDebounceTimer);
        }
        
        // Set a new timer to delay processing
        inputDebounceTimer = setTimeout(() => {
            updateProgression(progressionText);
        }, INPUT_DEBOUNCE_DELAY);
    });
    
    // Store the initial value for blocking changes during playback
    let lastProgressionText = input.value;
    
    // Add keyboard shortcuts for better UX
    input.addEventListener('keydown', (e) => {
        // Check if progression is currently playing first
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state && state.playing) {
                // Allow Ctrl+A (select all) and navigation keys during playback
                const allowedKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'];
                const isCtrlA = e.ctrlKey && e.key === 'a';
                
                if (!allowedKeys.includes(e.key) && !isCtrlA) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Visual feedback for blocked keypress
                    input.style.borderColor = '#ff6b6b';
                    input.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
                    setTimeout(() => {
                        input.style.borderColor = '';
                        input.style.boxShadow = '';
                    }, 300);
                    
                    return false;
                }
            }
        }
    });
    
    // Also block paste during playback
    input.addEventListener('paste', (e) => {
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state && state.playing) {
                e.preventDefault();
                e.stopPropagation();
                
                // Visual feedback
                input.style.borderColor = '#ff6b6b';
                input.style.boxShadow = '0 0 5px rgba(255, 107, 107, 0.5)';
                setTimeout(() => {
                    input.style.borderColor = '';
                    input.style.boxShadow = '';
                }, 300);
                
                return false;
            }
        }
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
    
    // Initialize window variable to match checkbox state
    window.showScaleContext = scaleToggleCheckbox.checked;
    
    // Add change event listener to refresh display
    scaleToggleCheckbox.addEventListener('change', () => {
        // Update the window variable to stay in sync
        window.showScaleContext = scaleToggleCheckbox.checked;
        
        // Refresh the current display
        if (hoveredChordIndex !== null && currentProgression[hoveredChordIndex]) {
            displaySingleChordPattern(currentProgression[hoveredChordIndex], hoveredChordIndex, true);
        } else {
            displayAllChordPatterns();
        }
        
        // Also refresh mini pianos and mini staves if they are enabled
        if (showMiniPianos || showMiniStaves) {
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
        fretboardIntervalsToggleContainer.style.display = e.target.checked ? 'flex' : 'none';
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
    
    // Mini fretboard intervals toggle (only show when mini fretboards are enabled)
    const fretboardIntervalsToggleContainer = document.createElement('div');
    fretboardIntervalsToggleContainer.style.cssText = `
        display: ${showMiniFretboards ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
        margin-left: 16px;
    `;
    
    const fretboardIntervalsToggleCheckbox = document.createElement('input');
    fretboardIntervalsToggleCheckbox.type = 'checkbox';
    fretboardIntervalsToggleCheckbox.id = 'chord-progression-fretboard-intervals-toggle';
    fretboardIntervalsToggleCheckbox.checked = showFretboardIntervals;
    fretboardIntervalsToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    // Add change event listener to refresh display
    fretboardIntervalsToggleCheckbox.addEventListener('change', (e) => {
        showFretboardIntervals = e.target.checked;
        updateProgressionDisplay(); // Refresh to show intervals or note names
    });
    
    const fretboardIntervalsToggleLabel = document.createElement('label');
    fretboardIntervalsToggleLabel.htmlFor = 'chord-progression-fretboard-intervals-toggle';
    fretboardIntervalsToggleLabel.textContent = 'Show Intervals';
    fretboardIntervalsToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;
    
    fretboardIntervalsToggleContainer.appendChild(fretboardIntervalsToggleCheckbox);
    fretboardIntervalsToggleContainer.appendChild(fretboardIntervalsToggleLabel);
    
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
    
    // Mini staves toggle
    const miniStavesToggleContainer = document.createElement('div');
    miniStavesToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const miniStavesToggleCheckbox = document.createElement('input');
    miniStavesToggleCheckbox.type = 'checkbox';
    miniStavesToggleCheckbox.id = 'chord-progression-mini-staves-toggle';
    miniStavesToggleCheckbox.checked = showMiniStaves;
    miniStavesToggleCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    // Add change event listener to refresh display
    miniStavesToggleCheckbox.addEventListener('change', (e) => {
        showMiniStaves = e.target.checked;
        updateProgressionDisplay(); // Refresh the entire display to show/hide mini staves
    });
    
    const miniStavesToggleLabel = document.createElement('label');
    miniStavesToggleLabel.htmlFor = 'chord-progression-mini-staves-toggle';
    miniStavesToggleLabel.textContent = 'Show Mini Staves';
    miniStavesToggleLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    `;
    
    miniStavesToggleContainer.appendChild(miniStavesToggleCheckbox);
    miniStavesToggleContainer.appendChild(miniStavesToggleLabel);
    
    // Stave key selector (only show when mini staves are enabled)
    const staveKeyContainer = document.createElement('div');
    staveKeyContainer.style.cssText = `
        display: ${showMiniStaves ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
    `;
    
    const staveKeyLabel = document.createElement('span');
    staveKeyLabel.textContent = 'Stave Key:';
    staveKeyLabel.style.cssText = `
        color: #fff;
        font-size: 14px;
    `;
    
    const staveKeyDropdown = document.createElement('select');
    staveKeyDropdown.id = 'chord-progression-stave-key';
    staveKeyDropdown.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #666;
        border-radius: 4px;
        background: #333;
        color: #fff;
        font-size: 12px;
        cursor: pointer;
    `;
    
    // Add key signature options
    const keyOptions = [
        { value: 'C', label: 'C Major / A Minor' },
        { value: 'G', label: 'G Major / E Minor' },
        { value: 'D', label: 'D Major / B Minor' },
        { value: 'A', label: 'A Major / F# Minor' },
        { value: 'E', label: 'E Major / C# Minor' },
        { value: 'B', label: 'B Major / G# Minor' },
        { value: 'F#', label: 'F# Major / D# Minor' },
        { value: 'C#', label: 'C# Major / A# Minor' },
        { value: 'F', label: 'F Major / D Minor' },
        { value: 'Bb', label: 'Bb Major / G Minor' },
        { value: 'Eb', label: 'Eb Major / C Minor' },
        { value: 'Ab', label: 'Ab Major / F Minor' },
        { value: 'Db', label: 'Db Major / Bb Minor' },
        { value: 'Gb', label: 'Gb Major / Eb Minor' },
        { value: 'Cb', label: 'Cb Major / Ab Minor' }
    ];
    
    keyOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        optionElement.selected = option.value === staveKey;
        staveKeyDropdown.appendChild(optionElement);
    });
    
    staveKeyDropdown.addEventListener('change', (e) => {
        staveKey = e.target.value;
        if (showMiniStaves) {
            updateProgressionDisplay(); // Refresh display with new key signature
        }
    });
    
    // Update stave key container visibility when mini staves toggle changes
    miniStavesToggleCheckbox.addEventListener('change', (e) => {
        staveKeyContainer.style.display = e.target.checked ? 'flex' : 'none';
    });
    
    staveKeyContainer.appendChild(staveKeyLabel);
    staveKeyContainer.appendChild(staveKeyDropdown);
    
    // Theory mode toggle for mini staves
    const staveTheoryModeContainer = document.createElement('div');
    staveTheoryModeContainer.style.cssText = `
        display: ${showMiniStaves ? 'flex' : 'none'};
        align-items: center;
        gap: 8px;
    `;
    
    const staveTheoryModeCheckbox = document.createElement('input');
    staveTheoryModeCheckbox.type = 'checkbox';
    staveTheoryModeCheckbox.id = 'chord-progression-stave-theory-mode';
    staveTheoryModeCheckbox.checked = staveTheoryMode;
    staveTheoryModeCheckbox.style.cssText = `
        transform: scale(1.2);
    `;
    
    staveTheoryModeCheckbox.addEventListener('change', (e) => {
        staveTheoryMode = e.target.checked;
        if (showMiniStaves) {
            updateProgressionDisplay(); // Refresh display with new mode
        }
    });
    
    const staveTheoryModeLabel = document.createElement('label');
    staveTheoryModeLabel.htmlFor = 'chord-progression-stave-theory-mode';
    staveTheoryModeLabel.textContent = 'Theory Mode (4th octave)';
    staveTheoryModeLabel.style.cssText = `
        color: white;
        font-size: 14px;
        font-weight: normal;
        cursor: pointer;
    `;
    
    // Update theory mode container visibility when mini staves toggle changes
    miniStavesToggleCheckbox.addEventListener('change', (e) => {
        staveKeyContainer.style.display = e.target.checked ? 'flex' : 'none';
        staveTheoryModeContainer.style.display = e.target.checked ? 'flex' : 'none';
    });
    
    staveTheoryModeContainer.appendChild(staveTheoryModeCheckbox);
    staveTheoryModeContainer.appendChild(staveTheoryModeLabel);
    
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
        { name: 'I-vi-IV-V (Pop progression)', value: 'I vi IV V' },
        { name: 'IV-V-I-VI (Pop progression)', value: 'IV V I VI' },
        { name: 'ii-V-I (Jazz standard)', value: 'ii V I' },
        { name: 'ii-V-I-VI (Jazz standard 2)', value: 'ii V I VI' },
        { name: 'i-VII-VI-V (Minor progression)', value: 'i VII VI V' },
        { name: 'I-vi-ii-V (Jazz circle)', value: 'I vi ii V' },
        { name: 'I-IV-V (Classic cadence)', value: 'I IV V' },
        { name: 'I-IV-V-I (Classic cadence)', value: 'I IV V I' },
        { name: 'i-VII-VI-VII (Minor progression)', value: 'i VII VI VII' },
        { name: 'I-IV-V-IV (Classic cadence)', value: 'I IV V IV' },
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
    
    // Share button
    const shareButton = document.createElement('button');
    shareButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>
        Share
    `;
    shareButton.title = 'Copy shareable URL to clipboard';
    shareButton.style.cssText = `
        padding: 8px 16px;
        background: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
    `;
    
    shareButton.addEventListener('mouseenter', () => {
        shareButton.style.background = '#218838';
        shareButton.style.transform = 'translateY(-1px)';
    });
    
    shareButton.addEventListener('mouseleave', () => {
        shareButton.style.background = '#28a745';
        shareButton.style.transform = 'translateY(0)';
    });
    
    shareButton.addEventListener('click', async () => {
        const success = await copyShareableURL();
        
        // Provide visual feedback using textContent to avoid SVG issues
        const originalHTML = shareButton.innerHTML;
        const originalBg = shareButton.style.background;
        
        if (success) {
            shareButton.textContent = '✅ Copied!';
            shareButton.style.background = '#20c997';
        } else {
            shareButton.textContent = '❌ Failed';
            shareButton.style.background = '#dc3545';
        }
        
        // Reset after 2 seconds
        setTimeout(() => {
            shareButton.innerHTML = originalHTML;
            shareButton.style.background = originalBg;
        }, 2000);
    });
    
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
    
    // Progression Sequencer Toggle Button
    const progressionToggleButton = document.createElement('button');
    progressionToggleButton.textContent = 'Loop Progression';
    progressionToggleButton.id = 'progression-sequencer-toggle';
    progressionToggleButton.style.cssText = `
        padding: 8px 16px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: background 0.2s;
        margin-left: 8px;
    `;
    
    let isProgressionLooping = false;
    
    const updateProgressionToggleButton = () => {
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            isProgressionLooping = state.playing;
            progressionToggleButton.textContent = isProgressionLooping ? 'Stop Loop' : 'Loop Progression';
            progressionToggleButton.style.background = isProgressionLooping ? '#dc3545' : '#6c757d';
        }
    };
    
    progressionToggleButton.addEventListener('mouseenter', () => {
        if (!isProgressionLooping) {
            progressionToggleButton.style.background = '#5a6268';
        } else {
            progressionToggleButton.style.background = '#c82333';
        }
    });
    
    progressionToggleButton.addEventListener('mouseleave', () => {
        progressionToggleButton.style.background = isProgressionLooping ? '#dc3545' : '#6c757d';
    });
    
    progressionToggleButton.addEventListener('click', () => {
        if (!window.polySynthRef) {
            console.warn('PolySynth not available');
            return;
        }
        
        if (!window.polySynthRef.toggleProgressionSequencer) {
            console.warn('Progression sequencer not available');
            return;
        }
        
        if (currentProgression.length === 0) {
            alert('Please create a progression first');
            return;
        }
        
        // Update the processed progression before toggling
        window.processedProgression = getProcessedProgression();
        console.log('Processed progression data:', window.processedProgression);
        
        // If the sequencer has a method to set the progression before starting, use it
        if (window.polySynthRef.setProgressionData) {
            window.polySynthRef.setProgressionData(window.processedProgression);
        }
        
        window.polySynthRef.toggleProgressionSequencer();
        
        // Update button state after a brief delay
        setTimeout(updateProgressionToggleButton, 100);
    });
    
    // Update button state periodically
    setInterval(updateProgressionToggleButton, 500);
    
    // Create synth controls container
    const synthControlsContainer = document.createElement('div');
    synthControlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
        flex-wrap: wrap;
    `;

    // Show Synth Button
    const showSynthButton = document.createElement('button');
    showSynthButton.textContent = 'Show Synth';
    showSynthButton.style.cssText = `
        padding: 8px 15px;
        background: #333;
        color: white;
        border: 1px solid #666;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.3s;
    `;

    let showSynthState = false;
    const updateSynthButtonState = () => {
        if (window.App && window.App.getShowPolySynth) {
            showSynthState = window.App.getShowPolySynth();
            showSynthButton.textContent = showSynthState ? 'Hide Synth' : 'Show Synth';
            showSynthButton.style.background = showSynthState ? '#4CAF50' : '#333';
        }
    };

    showSynthButton.addEventListener('click', () => {
        if (window.App && window.App.toggleShowPolySynth) {
            window.App.toggleShowPolySynth();
            setTimeout(updateSynthButtonState, 50);
        }
    });

    // Rate Control
    const rateLabel = document.createElement('label');
    rateLabel.textContent = 'Rate: ';
    rateLabel.style.cssText = `
        color: var(--text-color);
        font-size: 14px;
        font-weight: bold;
    `;

    const rateSelect = document.createElement('select');
    rateSelect.style.cssText = `
        padding: 4px 8px;
        background: var(--bg-color);
        color: var(--text-color);
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 14px;
    `;

    const rateOptions = [
        { value: -2, label: 'Sixteenth' },
        { value: -1, label: 'Eighth' },
        { value: 0, label: 'Quarter' },
        { value: 1, label: 'Half' },
        { value: 2, label: 'Whole' }
    ];

    rateOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (option.value === 0) optionElement.selected = true; // Default to quarter note
        rateSelect.appendChild(optionElement);
    });

    rateSelect.addEventListener('change', () => {
        userChangingRate = true;
        const rate = parseInt(rateSelect.value);
        
        // Add visual feedback for the change
        rateSelect.style.borderColor = '#4CAF50';
        rateSelect.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.5)';
        
        console.log('Rate changed to:', rate);
        console.log('PolySynth ref available:', !!window.polySynthRef);
        console.log('setProgressionRate method available:', !!(window.polySynthRef && window.polySynthRef.setProgressionRate));
        
        if (window.polySynthRef && window.polySynthRef.setProgressionRate) {
            window.polySynthRef.setProgressionRate(rate);
            console.log('Setting progression rate to:', rate);
            
            // Verify the change took effect
            setTimeout(() => {
                if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
                    const state = window.polySynthRef.getProgressionSequencerState();
                    console.log('Current progression state after rate change:', state);
                }
                userChangingRate = false; // Reset flag after change is complete
                
                // Reset visual feedback
                rateSelect.style.borderColor = '';
                rateSelect.style.boxShadow = '';
            }, 100);
        } else {
            console.warn('PolySynth ref or setProgressionRate method not available');
            userChangingRate = false;
            
            // Reset visual feedback
            rateSelect.style.borderColor = '';
            rateSelect.style.boxShadow = '';
        }
    });

    // Function to update rate control from PolySynth state
    let lastKnownRate = 0;
    let userChangingRate = false;
    const updateRateControl = () => {
        // Don't override if user is currently interacting with the control
        if (userChangingRate || document.activeElement === rateSelect) {
            return;
        }
        
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            // Convert duration string back to integer
            const rateValue = state.rate === 'sixteenth' ? -2 :
                             state.rate === 'eighth' ? -1 :
                             state.rate === 'quarter' ? 0 :
                             state.rate === 'half' ? 1 :
                             state.rate === 'whole' ? 2 : 0;
            
            // Only update if the value actually changed and user isn't currently selecting
            if (rateValue !== lastKnownRate && parseInt(rateSelect.value) !== rateValue) {
                lastKnownRate = rateValue;
                rateSelect.value = rateValue;
            }
        }
    };

    // Duration Control
    const durationLabel = document.createElement('label');
    durationLabel.textContent = 'Duration: ';
    durationLabel.style.cssText = `
        color: var(--text-color);
        font-size: 14px;
        font-weight: bold;
        margin-left: 8px;
    `;

    const durationSelect = document.createElement('select');
    durationSelect.style.cssText = `
        padding: 4px 8px;
        background: var(--bg-color);
        color: var(--text-color);
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 14px;
    `;

    const durationOptions = [
        { value: -2, label: 'Sixteenth' },
        { value: -1, label: 'Eighth' },
        { value: 0, label: 'Quarter' },
        { value: 1, label: 'Half' },
        { value: 2, label: 'Whole' }
    ];

    durationOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        if (option.value === 0) optionElement.selected = true; // Default to quarter note
        durationSelect.appendChild(optionElement);
    });

    // Function to update duration control from PolySynth state
    let lastKnownDuration = 0;
    let userChangingDuration = false;
    
    durationSelect.addEventListener('change', () => {
        userChangingDuration = true;
        const duration = parseInt(durationSelect.value);
        
        // Add visual feedback for the change
        durationSelect.style.borderColor = '#4CAF50';
        durationSelect.style.boxShadow = '0 0 5px rgba(76, 175, 80, 0.5)';
        
        console.log('Duration changed to:', duration);
        console.log('PolySynth ref available:', !!window.polySynthRef);
        console.log('setProgressionDuration method available:', !!(window.polySynthRef && window.polySynthRef.setProgressionDuration));
        
        if (window.polySynthRef && window.polySynthRef.setProgressionDuration) {
            window.polySynthRef.setProgressionDuration(duration);
            console.log('Setting progression duration to:', duration);
            
            // Verify the change took effect
            setTimeout(() => {
                if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
                    const state = window.polySynthRef.getProgressionSequencerState();
                    console.log('Current progression state after duration change:', state);
                }
                userChangingDuration = false; // Reset flag after change is complete
                
                // Reset visual feedback
                durationSelect.style.borderColor = '';
                durationSelect.style.boxShadow = '';
            }, 100);
        } else {
            console.warn('PolySynth ref or setProgressionDuration method not available');
            userChangingDuration = false;
            
            // Reset visual feedback
            durationSelect.style.borderColor = '';
            durationSelect.style.boxShadow = '';
        }
    });
    
    const updateDurationControl = () => {
        // Don't override if user is currently interacting with the control
        if (userChangingDuration || document.activeElement === durationSelect) {
            return;
        }
        
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            // Convert duration string back to integer
            const durationValue = state.duration === 'sixteenth' ? -2 :
                                 state.duration === 'eighth' ? -1 :
                                 state.duration === 'quarter' ? 0 :
                                 state.duration === 'half' ? 1 :
                                 state.duration === 'whole' ? 2 : 0;
            
            // Only update if the value actually changed and user isn't currently selecting
            if (durationValue !== lastKnownDuration && parseInt(durationSelect.value) !== durationValue) {
                lastKnownDuration = durationValue;
                durationSelect.value = durationValue;
            }
        }
    };

    // Enable Chord Triggering Checkbox
    const chordTriggeringLabel = document.createElement('label');
    chordTriggeringLabel.style.cssText = `
        display: flex;
        align-items: center;
        color: var(--text-color);
        font-size: 14px;
        font-weight: bold;
        margin-left: 12px;
        cursor: pointer;
    `;

    const chordTriggeringCheckbox = document.createElement('input');
    chordTriggeringCheckbox.type = 'checkbox';
    chordTriggeringCheckbox.checked = true; // Default to enabled
    chordTriggeringCheckbox.style.cssText = `
        margin-right: 6px;
        cursor: pointer;
    `;

    const chordTriggeringText = document.createElement('span');
    chordTriggeringText.textContent = 'Enable Chord Triggering';

    const updateChordTriggeringState = () => {
        if (window.App && window.App.getPolySynthEnabled) {
            chordTriggeringCheckbox.checked = window.App.getPolySynthEnabled();
        }
    };

    chordTriggeringCheckbox.addEventListener('change', () => {
        if (window.App && window.App.setPolySynthEnabled) {
            window.App.setPolySynthEnabled(chordTriggeringCheckbox.checked);
        }
    });

    chordTriggeringLabel.appendChild(chordTriggeringCheckbox);
    chordTriggeringLabel.appendChild(chordTriggeringText);

    // Add elements to synth controls container
    synthControlsContainer.appendChild(showSynthButton);
    synthControlsContainer.appendChild(rateLabel);
    synthControlsContainer.appendChild(rateSelect);
    synthControlsContainer.appendChild(durationLabel);
    synthControlsContainer.appendChild(durationSelect);
    synthControlsContainer.appendChild(chordTriggeringLabel);

    // Update states periodically (less frequent for rate/duration to avoid overriding user input)
    setInterval(updateSynthButtonState, 500);
    setInterval(updateChordTriggeringState, 500);
    
    // Initial sync for rate/duration controls, then only when progression state changes
    setTimeout(() => {
        updateRateControl();
        updateDurationControl();
    }, 1000);

    section.appendChild(scaleToggleContainer);
    section.appendChild(miniFretboardToggleContainer);
    section.appendChild(fretboardIntervalsToggleContainer);
    section.appendChild(miniPianoToggleContainer);
    section.appendChild(miniStavesToggleContainer);
    section.appendChild(staveKeyContainer);
    section.appendChild(staveTheoryModeContainer);
    section.appendChild(chordsToggleContainer);
    section.appendChild(presetsContainer);
    section.appendChild(shareButton);
    section.appendChild(clearButton);
    section.appendChild(progressionToggleButton);
    section.appendChild(synthControlsContainer);
    
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
    window.currentProgression = currentProgression; // Update global reference
    
    // Also provide processed progression for sequencer
    window.processedProgression = getProcessedProgression();
    
    // If progression sequencer is currently playing, update it with new progression
    if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
        const state = window.polySynthRef.getProgressionSequencerState();
        if (state.playing && window.polySynthRef.updateProgressionSettings) {
            const processedProgression = getProcessedProgression();
            window.polySynthRef.updateProgressionSettings(processedProgression);
            console.log('🔄 Updated playing progression with', processedProgression.length, 'chords (with processed notes)');
        }
    }
    
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
 * @param {number} currentChordIndex - Index of currently playing chord (optional)
 */
function updateProgressionDisplay(currentChordIndex = -1) {
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
        
        // Highlight current chord if specified (without scaling to avoid UI shifts)
        if (index === currentChordIndex) {
            chordElement.style.boxShadow = '0 0 15px #4CAF50';
            chordElement.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(76, 175, 80, 0.1))';
            chordElement.style.border = '2px solid #4CAF50';
            chordElement.style.transition = 'all 0.3s ease';
        }
        // Note: Default border is already set in createChordElement, no need to override it here
        
        chordList.appendChild(chordElement);
    });
    
    displaySection.appendChild(chordList);
}

/**
 * Highlight the currently playing chord in the progression display
 * @param {number} chordIndex - Index of the chord to highlight
 */
function highlightCurrentChord(chordIndex) {
    // Remove previous highlighting but preserve original borders
    const chordElements = document.querySelectorAll('.chord-element');
    chordElements.forEach((element, idx) => {
        element.style.boxShadow = '';
        element.style.background = '';
        element.style.transform = '';
        
        // Restore original border based on chord status
        const chord = currentProgression[idx];
        if (chord) {
            let borderColor = '#666'; // Default
            if (chord.isInvalid) {
                borderColor = '#ff4444'; // Red for invalid chords
            } else if (chord.isFallback) {
                borderColor = '#ffaa00'; // Orange for fallback resolution
            }
            element.style.border = `2px solid ${borderColor}`;
        } else {
            // Fallback to default border
            element.style.border = '2px solid #666';
        }
    });
    
    // Add highlighting to current chord (without scaling to avoid UI shifts)
    if (chordIndex >= 0 && chordIndex < chordElements.length) {
        const currentElement = chordElements[chordIndex];
        currentElement.style.boxShadow = '0 0 15px #4CAF50';
        currentElement.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(76, 175, 80, 0.1))';
        currentElement.style.border = '2px solid #4CAF50';
        currentElement.style.transition = 'all 0.3s ease';
    }
}

// Make highlightCurrentChord globally accessible
window.highlightCurrentChord = highlightCurrentChord;

/**
 * Convert SVG element to PNG and copy to clipboard
 * @param {SVGElement} svgElement - The SVG element to convert
 * @param {string} chordName - Name of the chord for notification
 */
async function copySvgAsPng(svgElement, chordName = 'chord') {
    try {
        // Clone the SVG to avoid modifying the original
        const svgClone = svgElement.cloneNode(true);
        
        // Get SVG dimensions
        const svgRect = svgElement.getBoundingClientRect();
        const width = parseInt(svgElement.getAttribute('width')) || svgRect.width;
        const height = parseInt(svgElement.getAttribute('height')) || svgRect.height;
        
        // Create a canvas with higher resolution for better quality
        const scale = 2; // 2x resolution for crisp images
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        
        // Scale the context for higher resolution
        ctx.scale(scale, scale);
        
        // Set white background (SVGs are transparent by default)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        // Create image and draw to canvas
        const img = new Image();
        img.onload = async function() {
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(svgUrl);
            
            // Convert canvas to blob
            canvas.toBlob(async function(blob) {
                try {
                    // Copy to clipboard using the Clipboard API
                    if (navigator.clipboard && navigator.clipboard.write) {
                        const clipboardItem = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([clipboardItem]);
                        
                        // Show success notification
                        showNotification(`${chordName} fretboard copied to clipboard as PNG!`, 'success');
                    } else {
                        // Fallback: create download link
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${chordName.replace(/[^a-z0-9]/gi, '_')}_fretboard.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                        
                        showNotification(`${chordName} fretboard downloaded as PNG (clipboard not supported)`, 'info');
                    }
                } catch (clipboardError) {
                    console.warn('Clipboard copy failed, falling back to download:', clipboardError);
                    // Fallback: create download link
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${chordName.replace(/[^a-z0-9]/gi, '_')}_fretboard.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                    
                    showNotification(`${chordName} fretboard downloaded as PNG`, 'info');
                }
            }, 'image/png');
        };
        
        img.onerror = function() {
            URL.revokeObjectURL(svgUrl);
            showNotification('Failed to convert fretboard to PNG', 'error');
        };
        
        img.src = svgUrl;
        
    } catch (error) {
        console.error('Error copying SVG as PNG:', error);
        showNotification('Failed to copy fretboard to clipboard', 'error');
    }
}

/**
 * Show a temporary notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('success', 'error', 'info')
 */
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.copy-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = message;
    
    const backgroundColor = {
        'success': '#4CAF50',
        'error': '#f44336',
        'info': '#2196F3'
    }[type] || '#2196F3';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${backgroundColor};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease, slideOutRight 0.3s ease 2.7s;
        opacity: 1;
        pointer-events: none;
    `;
    
    // Add CSS animation keyframes if they don't exist
    if (!document.querySelector('#copy-notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'copy-notification-styles';
        styles.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after animation
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

/**
 * Create a mini fretboard visualization for a chord pattern
 * This shows a 5-fret vertical section with chord notes highlighted,
 * fret numbers above, and note names or intervals below.
 * @param {Object} pattern - Chord pattern with positions (may include interval data)
 * @param {Array} chordNotes - Array of chord note names
 * @param {string} chordName - Name of the chord for display and copying
 * @returns {HTMLElement} Mini fretboard wrapper element containing SVG
 */
function createMiniFretboardVisualization(pattern, chordNotes, chordName = 'Chord') {
    if (!pattern || !pattern.positions || pattern.positions.length === 0) {
        return null;
    }
    
    // Tab20 color palette
    const tab20Colors = [
        '#fb8072', '#80b1d3', '#fdb462', '#8dd3c7', '#bc80bd', '#b3de69', '#ffed6f', '#bebada', '#d9d9d9', '#ffffb3', '#fccde5', '#ccebc5' 
    ];
    
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
    
    // Create maps to store notes and intervals for each string at the displayed frets
    const stringNotes = new Map();
    const stringIntervals = new Map();
    
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
            
            // Store interval for this string (if available from the pattern)
            if (position.interval) {
                stringIntervals.set(stringIndex, position.interval);
            }
            
            // Determine if this is a root note
            const isRootNote = chordNotes.length > 0 && strippedNote === chordNotes[0];
            
            // Calculate color based on semitone distance from root
            let circleColor = '#4CAF50'; // Default color
            
            if (isRootNote) {
                // Root note maps to index 7 with the offset system
                // (0 semitones + 7 offset) % 20 = 7
                circleColor = tab20Colors[0];
            } else if (position.interval) {
                // Use interval to calculate semitone distance
                try {
                    const semitones = intervalToSemitones(position.interval);
                    // Apply offset of 7 and modulo to map to tab20 colors
                    const colorIndex = (semitones) % tab20Colors.length;
                    circleColor = tab20Colors[colorIndex];
                } catch (error) {
                    console.warn('Could not calculate semitones for interval:', position.interval, error);
                    // Fallback: if we can't calculate interval, try to calculate from note names
                    if (chordNotes.length > 0) {
                        const rootNote = chordNotes[0];
                        // Simple semitone calculation (basic chromatic distance)
                        const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                        const rootIndex = chromaticNotes.indexOf(rootNote);
                        const noteIndex = chromaticNotes.indexOf(strippedNote);
                        if (rootIndex !== -1 && noteIndex !== -1) {
                            const semitones = (noteIndex - rootIndex + 12) % 12;
                            const colorIndex = (semitones) % tab20Colors.length;
                            circleColor = tab20Colors[colorIndex];
                        }
                    }
                }
            } else if (chordNotes.length > 0) {
                // Fallback: calculate from note names if no interval data
                const rootNote = chordNotes[0];
                const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const rootIndex = chromaticNotes.indexOf(rootNote);
                const noteIndex = chromaticNotes.indexOf(strippedNote);
                if (rootIndex !== -1 && noteIndex !== -1) {
                    const semitones = (noteIndex - rootIndex + 12) % 12;
                    const colorIndex = (semitones + 7) % 20;
                    circleColor = tab20Colors[colorIndex];
                }
            }
            
            // Draw note circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', config.noteRadius);
            circle.setAttribute('fill', circleColor);
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '1');
            svg.appendChild(circle);
        }
    });
    
    // Draw note names or intervals below the fretboard
    for (let stringIndex = 0; stringIndex < config.stringCount; stringIndex++) {
        const x = startX + stringIndex * stringSpacing;
        const y = startY + config.fretCount * fretHeight + 15;
        
        let displayText = '';
        if (showFretboardIntervals && stringIntervals.has(stringIndex)) {
            // Show interval if intervals toggle is enabled and we have interval data
            displayText = stringIntervals.get(stringIndex);
        } else if (stringNotes.has(stringIndex)) {
            // Show note name as fallback or when intervals are disabled
            displayText = stringNotes.get(stringIndex);
        }
        
        if (displayText) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', config.noteNameSize);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', 'bold');
            text.textContent = displayText;
            svg.appendChild(text);
        }
    }
    
    // Create a wrapper container for the SVG with copy functionality
    const wrapper = document.createElement('div');
    wrapper.className = 'mini-fretboard-wrapper';
    wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s ease;
    `;
    
    // Add hover effect
    wrapper.addEventListener('mouseenter', () => {
        wrapper.style.transform = 'scale(1.02)';
        wrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    });
    
    wrapper.addEventListener('mouseleave', () => {
        wrapper.style.transform = 'scale(1)';
        wrapper.style.boxShadow = 'none';
    });
    
    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'mini-fretboard-copy-btn';
    copyButton.innerHTML = '📋';
    copyButton.title = 'Copy fretboard as PNG';
    copyButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 4px;
        width: 24px;
        height: 24px;
        font-size: 12px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Show/hide copy button on hover
    wrapper.addEventListener('mouseenter', () => {
        copyButton.style.opacity = '1';
    });
    
    wrapper.addEventListener('mouseleave', () => {
        copyButton.style.opacity = '0';
    });
    
    // Handle copy button click
    copyButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        copySvgAsPng(svg, chordName);
    });
    
    // Handle right-click on the wrapper
    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Prevent default context menu
        copySvgAsPng(svg, chordName);
    });
    
    // Add click handler for the entire wrapper as well
    wrapper.addEventListener('click', (e) => {
        // Only handle click if it's not on the copy button
        if (e.target !== copyButton) {
            copySvgAsPng(svg, chordName);
        }
    });
    
    wrapper.appendChild(svg);
    wrapper.appendChild(copyButton);
    
    return wrapper;
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
 * Helper function to calculate octave based on guitar string and fret position
 * @param {number} stringNumber - Guitar string (0=low E, 5=high E)
 * @param {number} fret - Fret number
 * @returns {number} Octave number for synthesis
 */
function getOctaveForStringAndFret(stringNumber, fret) {
    // Standard guitar tuning with base octaves and chromatic positions:
    // String 0 (low E): E2,  String 1 (A): A2,  String 2 (D): D3
    // String 3 (G): G3,      String 4 (B): B3,  String 5 (high E): E4
    let baseOctave;
    let openStringChromaticPosition;
    
    if (stringNumber >= 0 && stringNumber <= 5) {
        // 0-based: 0=low E, 5=high E
        const baseOctaves = [2, 2, 3, 3, 3, 4]; // Index matches string number directly
        // Chromatic positions (0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B)
        const openStringPositions = [4, 9, 2, 7, 11, 4]; // E, A, D, G, B, E
        
        baseOctave = baseOctaves[stringNumber];
        openStringChromaticPosition = openStringPositions[stringNumber];
    } else {
        console.warn(`⚠️ Invalid string number ${stringNumber} in getOctaveForStringAndFret - expected 0-5`);
        baseOctave = 3; // Default fallback
        openStringChromaticPosition = 0; // Default to C
    }
    
    // Calculate the total semitones from the open string
    const totalSemitones = fret;
    
    // Calculate the final chromatic position
    const finalChromaticPosition = (openStringChromaticPosition + totalSemitones) % 12;
    
    // Calculate how many complete octaves we've moved up
    // We need to account for wrapping around the chromatic scale
    const additionalOctaves = Math.floor((openStringChromaticPosition + totalSemitones) / 12);
    
    return baseOctave + additionalOctaves;
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
    const displayName = getChordDisplayName(chord, index);
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
        
        // Add mini stave visualization if enabled
        if (showMiniStaves) {
            // Choose notes based on theory mode
            let notesToUse;
            let theoreticalNotes = null; // For enharmonic correction reference
            
            if (staveTheoryMode) {
                // Theory mode: use chord theory notes in 4th octave
                if (chord.chordInfo && chord.chordInfo.notes) {
                    theoreticalNotes = chord.chordInfo.notes; // Keep original theory notes for reference
                    notesToUse = chord.chordInfo.notes.map(note => {
                        const cleanNote = notationStripOctave(note);
                        return cleanNote + '4'; // Force 4th octave for theory
                    });
                } else {
                    notesToUse = [];
                }
            } else {
                // Fretboard mode: use actual fretboard notes with their octaves
                notesToUse = getProcessedChordNotes(chord, index);
                // Also get theoretical notes for enharmonic correction if available
                if (chord.chordInfo && chord.chordInfo.notes) {
                    theoreticalNotes = chord.chordInfo.notes;
                }
            }
            
            // Create version without octaves for scale mixing
            const notesNoOctave = notesToUse.map(note => notationStripOctave(note));
            
            // Get current scale notes for enharmonic correction
            let currentScaleNotes = null;
            const primaryScaleId = getPrimaryScale();
            const primaryRoot = getPrimaryRootNote();
            if (primaryScaleId && primaryRoot) {
                try {
                    const [family, mode] = primaryScaleId.split('-');
                    const scales = HeptatonicScales;
                    if (scales[family] && scales[family][parseInt(mode, 10) - 1]) {
                        const intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        currentScaleNotes = getScaleNotes(primaryRoot, intervals);
                    }
                } catch (error) {
                    console.warn('Error getting scale notes for enharmonic correction:', error);
                }
            }
            
            const scaleToggleCheckbox = document.getElementById('chord-progression-scale-toggle');
            const showScaleContext = scaleToggleCheckbox && scaleToggleCheckbox.checked;
            
            let miniStave;
            if (showScaleContext) {
                // Get current scale notes for context
                if (primaryScaleId && primaryRoot && currentScaleNotes) {
                    try {
                        const scaleNotesNoOctave = currentScaleNotes.map(note => notationStripOctave(note));
                        
                        // Create mixed stave showing both chord and scale
                        miniStave = createMixedStave(notesNoOctave, scaleNotesNoOctave, notesNoOctave[0] || notes[0], staveKey, theoreticalNotes);
                    } catch (error) {
                        console.warn('Error creating mixed stave:', error);
                        // Fallback to chord-only display
                        miniStave = createChordStave(notesToUse, notesToUse[0] || notes[0], staveKey, theoreticalNotes, currentScaleNotes);
                    }
                } else {
                    // Fallback to chord-only display
                    miniStave = createChordStave(notesToUse, notesToUse[0] || notes[0], staveKey, theoreticalNotes, currentScaleNotes);
                }
            } else {
                // Show chord only
                miniStave = createChordStave(notesToUse, notesToUse[0] || notes[0], staveKey, theoreticalNotes, currentScaleNotes);
            }
            
            if (miniStave) {
                // Create a wrapper container for better positioning
                const miniStaveWrapper = document.createElement('div');
                miniStaveWrapper.style.cssText = `
                    margin: 8px auto;
                    position: relative;
                    z-index: 10;
                    background: white;
                    border-radius: 6px;
                    padding: 4px;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
                    border: 1px solid #ccc;
                `;
                miniStaveWrapper.appendChild(miniStave);
                element.appendChild(miniStaveWrapper);
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

    // Add click handler for chord triggering
    element.addEventListener('click', () => {
        if (!chord.isInvalid && window.polySynthEnabled && window.polySynthRef) {
            triggerChordProgression(chord, index);
            
            // Visual feedback for click
            element.style.background = '#4CAF50';
            setTimeout(() => {
                element.style.background = hoveredChordIndex === index ? '#555' : '#444';
            }, 200);
        }
    });
    
    return element;
}

/**
 * Get display name for a chord
 * @param {Object} chord - Chord data
 * @returns {string} Display name
 */
function getChordDisplayName(chord, chordIndex = null) {
    let baseName;
    if (chord.type === 'roman') {
        if (chord.resolvedRoot && chord.resolvedChordType) {
            baseName = `${chord.originalToken} (${chord.resolvedRoot}${chord.resolvedChordType})`;
        } else {
            baseName = chord.originalToken;
        }
    } else {
        baseName = chord.originalToken;
    }
    
    // If a default pattern was specified and it's still the currently selected pattern, 
    // include it in the display name
    if (chord.defaultPatternIndex !== undefined && chordIndex !== null) {
        const currentSelectedPattern = selectedPatternIndexes.get(chordIndex);
        const isStillDefaultPattern = currentSelectedPattern === chord.defaultPatternIndex;
        
        if (isStillDefaultPattern) {
            return `${baseName.replace(/-\d+$/, '')} [Pattern ${chord.defaultPatternIndex + 1}]`;
        }
    }
    
    return baseName.replace(/-\d+$/, ''); // Remove pattern notation from display
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
    // console.log(`Patterns: ${JSON.stringify(patterns)}`);

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
        const chordName = getChordDisplayName(chord, index);
        console.log(`Updating mini fretboard for pattern ${patternIndex}:`, pattern, chordNotes);

        // Clear existing mini fretboard
        miniFretboardContainer.innerHTML = '';
        
        // Create new mini fretboard
        const miniFretboard = createMiniFretboardVisualization(pattern, chordNotes, chordName);
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
    const initialSelection = selectedPatternIndexes.get(index) ?? 0;
    select.value = initialSelection;
    
    // Ensure the initial selection is stored in the map if not already present
    if (!selectedPatternIndexes.has(index)) {
        selectedPatternIndexes.set(index, initialSelection);
    }

    // Add change event listener with improved highlighting
    select.addEventListener('change', (e) => {
        const patternIndex = parseInt(e.target.value);
        selectedPatternIndexes.set(index, patternIndex);
        
        console.log(`🎯 Pattern selected for chord ${index}: pattern ${patternIndex} (${patterns[patternIndex]?.name || 'Unknown'})`);
        console.log('Updated selectedPatternIndexes Map:', selectedPatternIndexes);
        
        // Invalidate cached pattern data to force display name update
        precomputedPatternData.delete(index);
        
        // Update button states
        updateButtonStates();
        
        // Update mini fretboard visualization
        updateMiniFretboard();
        
        // Update the chord name display to reflect pattern change
        updateProgressionDisplay();
        
        // Update processed progression for sequencer
        window.processedProgression = getProcessedProgression();
        
        // If sequencer is running, update it with the new processed progression
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state.playing && window.polySynthRef.updateProgressionSettings) {
                window.polySynthRef.updateProgressionSettings(window.processedProgression);
                console.log('🔄 Updated running sequencer with new pattern selection');
            }
        }
        
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
    window.currentProgression = currentProgression; // Update global reference
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

/**
 * Build a shareable state object containing all relevant progression and UI state
 * @returns {Object} State object for sharing
 */
function buildShareableState() {
    const state = {
        // Chord progression with selected patterns
        progression: currentProgression.map((chord, index) => {
            const baseToken = chord.originalToken ? chord.originalToken.replace(/-\d+$/, '') : '';
            const selectedPattern = selectedPatternIndexes.get(index);
            
            if (selectedPattern !== undefined && selectedPattern !== null) {
                return `${baseToken}-${selectedPattern + 1}`;
            }
            return baseToken;
        }).join(' '),
        
        // UI state flags - read from actual UI elements
        showScaleContext: (() => {
            const scaleToggle = document.getElementById('chord-progression-scale-toggle');
            return scaleToggle ? scaleToggle.checked : (window.showScaleContext || true); // Default to true if no checkbox found
        })(),
        showMiniFretboards: showMiniFretboards,
        showFretboardIntervals: showFretboardIntervals,
        showMiniPianos: showMiniPianos,
        useSeventhChords: useSeventhChords,
        
        // Scale settings (human readable)
        rootNote: getPrimaryRootNote() || 'C',
        scale: getPrimaryScale() || 'Major-1'
    };
    
    return state;
}

/**
 * Encode state object to human-readable URL parameters
 * @param {Object} state - State object to encode
 * @returns {URLSearchParams} URL parameters object
 */
function encodeStateToURLParams(state) {
    const params = new URLSearchParams();
    
    // Core progression - this is the most important part
    if (state.progression) {
        params.set('p', state.progression);
    }
    
    // Scale settings (compact format)
    if (state.rootNote && state.rootNote !== 'C') {
        params.set('r', state.rootNote);
    }
    if (state.scale && state.scale !== 'Major-1') {
        params.set('s', state.scale);
    }
    
    // UI flags - only include if different from defaults
    const flags = [];
    if (!state.showScaleContext) flags.push('h'); // hide scale context
    if (state.showMiniFretboards) flags.push('f'); // show fretboards
    if (state.showMiniPianos) flags.push('k'); // show keyboards (pianos)
    if (!state.useSeventhChords) flags.push('n'); // no sevenths
    
    if (flags.length > 0) {
        params.set('ui', flags.join(''));
    }
    
    return params;
}

/**
 * Decode URL parameters back to state object
 * @param {URLSearchParams} params - URL parameters to decode
 * @returns {Object} Decoded state object
 */
function decodeStateFromURLParams(params) {
    const state = {
        // Defaults
        showScaleContext: true,
        showMiniFretboards: false,
        showMiniPianos: false,
        useSeventhChords: true,
        rootNote: 'C',
        scale: 'Major-1'
    };
    
    // Decode progression
    if (params.has('p')) {
        state.progression = params.get('p');
    }
    
    // Decode scale settings
    if (params.has('r')) {
        state.rootNote = params.get('r');
    }
    if (params.has('s')) {
        state.scale = params.get('s');
    }
    
    // Decode UI flags
    if (params.has('ui')) {
        const flags = params.get('ui');
        state.showScaleContext = !flags.includes('h');
        state.showMiniFretboards = flags.includes('f');
        state.showMiniPianos = flags.includes('k');
        state.useSeventhChords = !flags.includes('n');
    }
    
    return state;
}

/**
 * Legacy function - Encode state object to URL-safe string (Base64)
 * @param {Object} state - State object to encode
 * @returns {string} Base64 encoded state string
 */
function encodeStateToURL(state) {
    const stateString = JSON.stringify(state);
    return btoa(encodeURIComponent(stateString));
}

/**
 * Legacy function - Decode URL-safe string back to state object
 * @param {string} encodedState - Base64 encoded state string
 * @returns {Object|null} Decoded state object or null if invalid
 */
function decodeStateFromURL(encodedState) {
    try {
        const stateString = decodeURIComponent(atob(encodedState));
        return JSON.parse(stateString);
    } catch (error) {
        console.warn('Failed to decode state from URL:', error);
        return null;
    }
}

/**
 * Generate a shareable URL for the current state
 * @returns {string} Shareable URL
 */
function generateShareableURL() {
    const state = buildShareableState();
    console.log('Sharing state:', state);
    
    const currentURL = new URL(window.location);
    
    // Clear existing parameters
    currentURL.search = '';
    
    // Use the new human-readable parameter encoding
    const urlParams = encodeStateToURLParams(state);
    
    // Add parameters to URL
    for (const [key, value] of urlParams) {
        currentURL.searchParams.set(key, value);
    }
    
    return currentURL.toString();
}

/**
 * Copy the shareable URL to clipboard
 * @returns {Promise<boolean>} Success status
 */
async function copyShareableURL() {
    try {
        const shareableURL = generateShareableURL();
        await navigator.clipboard.writeText(shareableURL);
        
        // Update the current page URL with new format
        const state = buildShareableState();
        const newURL = new URL(window.location);
        newURL.search = '';
        
        const urlParams = encodeStateToURLParams(state);
        for (const [key, value] of urlParams) {
            newURL.searchParams.set(key, value);
        }
        
        window.history.replaceState({}, '', newURL);
        
        return true;
    } catch (error) {
        console.error('Failed to copy URL to clipboard:', error);
        return false;
    }
}

/**
 * Apply state from a decoded state object
 * @param {Object} state - State object to apply
 */
function applySharedState(state) {
    if (!state) return;
    
    // Apply scale settings first (these affect chord resolution)
    if (state.rootNote && state.scale) {
        // Set root note and scale using the proper functions
        try {
            setPrimaryRootNote(state.rootNote);
            setPrimaryScale(state.scale);
        } catch (error) {
            console.warn('Failed to set scale settings:', error);
            // Fallback to window functions if they exist
            if (window.setRootNote) {
                window.setRootNote(state.rootNote);
            }
            if (window.setScale) {
                window.setScale(state.scale);
            }
        }
    }
    
    // Apply UI state flags and sync checkboxes
    if (state.showScaleContext !== undefined) {
        window.showScaleContext = state.showScaleContext;
        const scaleToggle = document.getElementById('chord-progression-scale-toggle');
        if (scaleToggle) {
            scaleToggle.checked = state.showScaleContext;
        }
        if (window.updateScaleContextDisplay) {
            window.updateScaleContextDisplay();
        }
    }
    
    if (state.showMiniFretboards !== undefined) {
        showMiniFretboards = state.showMiniFretboards;
        const miniFretboardToggle = document.getElementById('chord-progression-mini-fretboard-toggle');
        if (miniFretboardToggle) {
            miniFretboardToggle.checked = state.showMiniFretboards;
        }
        // Update the visibility of the intervals toggle based on mini fretboards setting
        const fretboardIntervalsContainer = document.querySelector('#chord-progression-fretboard-intervals-toggle').parentElement;
        if (fretboardIntervalsContainer) {
            fretboardIntervalsContainer.style.display = state.showMiniFretboards ? 'flex' : 'none';
        }
    }
    
    if (state.showFretboardIntervals !== undefined) {
        showFretboardIntervals = state.showFretboardIntervals;
        const fretboardIntervalsToggle = document.getElementById('chord-progression-fretboard-intervals-toggle');
        if (fretboardIntervalsToggle) {
            fretboardIntervalsToggle.checked = state.showFretboardIntervals;
        }
    }
    
    if (state.showMiniPianos !== undefined) {
        showMiniPianos = state.showMiniPianos;
        const miniPianoToggle = document.getElementById('chord-progression-mini-piano-toggle');
        if (miniPianoToggle) {
            miniPianoToggle.checked = state.showMiniPianos;
        }
    }
    
    if (state.useSeventhChords !== undefined) {
        useSeventhChords = state.useSeventhChords;
        const seventhsToggle = document.getElementById('chord-progression-sevenths-toggle');
        if (seventhsToggle) {
            seventhsToggle.checked = state.useSeventhChords;
        }
    }
    
    // Apply chord progression last (after scale settings are configured)
    if (state.progression) {
        // Update the progression input if it exists
        const progressionInput = document.querySelector('#chord-progression-input');
        if (progressionInput) {
            progressionInput.value = state.progression;
            // Trigger input event to parse the progression
            progressionInput.dispatchEvent(new Event('input'));
        } else {
            // If no input field, directly update the progression
            updateProgression(state.progression);
        }
    }
}

/**
 * Load shared state from URL parameters on page load
 */
function loadSharedStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    let state = null;
    
    // Try new parameter format first
    if (urlParams.has('p')) {
        // New human-readable format
        state = decodeStateFromURLParams(urlParams);
        console.log('Loaded state from URL parameters:', state);
    } else {
        // Try legacy Base64 format for backward compatibility
        const encodedState = urlParams.get('share');
        if (encodedState) {
            state = decodeStateFromURL(encodedState);
            console.log('Loaded state from legacy Base64 format:', state);
        }
    }
    
    if (state) {
        // Apply state after a short delay to ensure all components are initialized
        setTimeout(() => {
            applySharedState(state);
        }, 100);
    }
}

// Export functions for use in other modules
export {
    createChordProgressionUI,
    parseProgressionInput,
    updateProgression,
    clearProgression,
    currentProgression,
    selectedPatternIndexes,
    generateShareableURL,
    copyShareableURL,
    loadSharedStateFromURL,
    applySharedState
};
