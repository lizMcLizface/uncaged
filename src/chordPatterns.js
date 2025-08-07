/**
 * Chord Patterns for Guitar Fretboard
 * 
 * This module contains all chord pattern definitions used for pattern matching
 * and chord shape visualization on the guitar fretboard.
 * 
 * Each pattern defines:
 * - Root string position
 * - Note positions relative to root
 * - Intervals and labels
 * - Fret range constraints
 * - Open voicing restrictions
 */

/**
 * Get all available chord patterns
 * Each pattern defines fingering relative to the root position
 * @returns {Object} Object containing all chord pattern definitions
 */
export function getChordPatterns() {
    return {
        
        'major_E_string': {
            name: 'Major (E String Root)',
            description: 'Major chord with root on low E string',
            chordType: 'major',
            rootString: 5, // Low E string
            notes: [
                { string: 5, fretOffset: 0, interval: 1, label: 'R' }, // Root on low E string
                { string: 4, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th on A string
                { string: 3, fretOffset: 2, interval: 1, label: 'R' }, // Root on D string
                { string: 2, fretOffset: 1, interval: 3, label: '3' }, // Major 3rd on G string
                { string: 1, fretOffset: 0, interval: 5, label: '5' }, // Perfect 5th on B string
                { string: 0, fretOffset: 0, interval: 1, label: 'R' }  // Root on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },

        // Major chord patterns
        'major_A_string': {
            name: 'Major (A String Root)',
            description: 'Major chord with root on A string',
            chordType: 'major',
            rootString: 4, // A string (0-indexed from high E)
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root on A string
                { string: 3, fretOffset: 2, interval: 3, label: '3' }, // Major 3rd on D string
                { string: 2, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th on G string
                { string: 1, fretOffset: 2, interval: 1, label: 'R' }, // Root on B string
                { string: 0, fretOffset: 0, interval: 3, label: '3' }  // Major 3rd on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },
        'major_G_string': {
            name: 'Major (G String Root)',
            description: 'Major chord with root on G string',
            chordType: 'major',
            rootString: 2, // G string
            notes: [
                { string: 3, fretOffset: 0, interval: 1, label: 'R' }, // Root on G string
                { string: 2, fretOffset: 0, interval: 3, label: '3' }, // Major 3rd on B string
                { string: 1, fretOffset: 0, interval: 3, label: '5' }, // Major 3rd on B string
                { string: 0, fretOffset: 3, interval: 5, label: 'R' }, // Perfect 5th on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },
        'major_D_string': {
            name: 'Major (D String Root)',
            description: 'Major chord with root on D string',
            chordType: 'major',
            rootString: 3, // D string
            notes: [
                { string: 3, fretOffset: 0, interval: 3, label: 'R' }, // Major 3rd on G string
                { string: 2, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th on B string
                { string: 1, fretOffset: 3, interval: 1, label: 'R' }, // Root on high E string
                { string: 0, fretOffset: 2, interval: 1, label: 'R' }, // Root on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },

        'major_open_C': {
            name: 'C Major Open',
            description: 'Open C major chord',
            chordType: 'major',
            rootString: 4, // A string where C is on 3rd fret
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'C' }, // C on A string 3rd fret
                { string: 3, fretOffset: -1, interval: 5, label: 'G' }, // G on D string 2nd fret  
                { string: 2, fretOffset: -3, interval: 1, label: 'C' }, // C on G string open
                { string: 1, fretOffset: -2, interval: 3, label: 'E' }, // E on B string 1st fret
                { string: 0, fretOffset: -3, interval: 1, label: 'C' }  // C on high E string open
            ],
            openVoicingOnly: false,
            minFret: 3,
            maxFret: 18
        },
        'minor_open_C': {
            name: 'C Minor Open',
            description: 'Open C minor chord',
            chordType: 'minor',
            rootString: 4, // A string where C is on 3rd fret
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'C' }, // C on A string 3rd fret
                { string: 3, fretOffset: -2, interval: 5, label: 'G' }, // G on D string 2nd fret
                { string: 2, fretOffset: -3, interval: 1, label: 'C' }, // C on G string open
                { string: 1, fretOffset: -2, interval: 'b3', label: 'b3' }, // Eb on B string 1st fret
                { string: 0, fretOffset: 0, interval: 1, label: 'C' }  // C on high E string open
            ],
            openVoicingOnly: true,
            minFret: 3,
            maxFret: 3
        },
        'major_open_G': {
            name: 'G Major Open',
            description: 'Open G major chord',
            chordType: 'major',
            rootString: 5, // Low E string where G is on 3rd fret
            notes: [
                { string: 5, fretOffset: 0, interval: 1, label: 'G' }, // G on low E string 3rd fret
                { string: 4, fretOffset: -1, interval: 5, label: 'D' }, // D on A string 2nd fret
                { string: 3, fretOffset: -3, interval: 1, label: 'G' }, // G on D string open
                { string: 2, fretOffset: -3, interval: 3, label: 'B' }, // B on G string open
                { string: 1, fretOffset: -3, interval: 5, label: 'D' }, // D on B string 3rd fret
                { string: 0, fretOffset: 0, interval: 1, label: 'G' }  // G on high E string 3rd fret
            ],
            openVoicingOnly: true,
            fixedPosition: 3,
            minFret: 3,
            maxFret: 3
        },

        // Minor chord patterns
        'minor_A_string': {
            name: 'Minor (A String Root)',
            description: 'Minor chord with root on A string',
            chordType: 'minor',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root on A string
                { string: 3, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th on D string
                { string: 2, fretOffset: 2, interval: 'b3', label: 'b3' }, // Minor 3rd on G string
                { string: 1, fretOffset: 1, interval: 1, label: 'R' }, // Root on B string
                { string: 0, fretOffset: 0, interval: 5, label: '5' }  // Perfect 5th on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },
        'minor_D_string': {
            name: 'Minor (D String Root)',
            description: 'Minor chord with root on D string',
            chordType: 'minor',
            rootString: 3,
            notes: [
                { string: 3, fretOffset: 0, interval: 1, label: 'R' }, // Root on D string
                { string: 2, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th on G string
                { string: 1, fretOffset: 3, interval: 'b3', label: 'b3' }, // Minor 3rd on B string
                { string: 0, fretOffset: 1, interval: 5, label: '5' }  // Perfect 5th on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },

        'minor_E_string': {
            name: 'Minor (E String Root)',
            description: 'Minor chord with root on low E string',
            chordType: 'minor',
            rootString: 5,
            notes: [
                { string: 5, fretOffset: 0, interval: 1, label: 'R' }, // Root on low E string
                { string: 4, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th on A string
                { string: 3, fretOffset: 2, interval: 1, label: 'R' }, // Root on D string
                { string: 2, fretOffset: 0, interval: 'b3', label: 'b3' }, // Minor 3rd on G string
                { string: 1, fretOffset: 0, interval: 5, label: '5' }, // Perfect 5th on B string
                { string: 0, fretOffset: 0, interval: 1, label: 'R' }  // Root on high E string
            ],
            openVoicingOnly: false,
            minFret: 0,
            maxFret: 18
        },

        // Dominant 7th patterns
        'dominant7_A_string': {
            name: 'Dominant 7th (A String Root)',
            description: 'Dominant 7th chord with root on A string',
            chordType: 'dominant7',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 3, fretOffset: 0, interval: 'b7', label: 'b7' }, // Flat 7th
                { string: 2, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th
                { string: 1, fretOffset: 1, interval: 1, label: 'R' }, // Root
                { string: 0, fretOffset: 0, interval: 3, label: '3' }  // Major 3rd
            ],
            openVoicingOnly: false,
            minFret: 1,
            maxFret: 12
        },

        'dominant7_E_string': {
            name: 'Dominant 7th (E String Root)',
            description: 'Dominant 7th chord with root on low E string',
            chordType: 'dominant7',
            rootString: 5,
            notes: [
                { string: 5, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 4, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th
                { string: 3, fretOffset: 0, interval: 'b7', label: 'b7' }, // Flat 7th
                { string: 2, fretOffset: 1, interval: 3, label: '3' }, // Major 3rd
                { string: 1, fretOffset: 0, interval: 5, label: '5' }, // Perfect 5th
                { string: 0, fretOffset: 0, interval: 1, label: 'R' }  // Root
            ],
            openVoicingOnly: false,
            minFret: 1,
            maxFret: 18
        },

        // Diminished patterns (for vii° chord)
        'diminished_A_string': {
            name: 'Diminished (A String Root)',
            chordType: 'dim',
            description: 'Diminished chord with root on A string',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 3, fretOffset: 1, interval: 'b3', label: 'b3' }, // Minor 3rd
                { string: 2, fretOffset: 2, interval: 'b5', label: 'b5' }, // Diminished 5th
                { string: 1, fretOffset: 1, interval: 1, label: 'R' }  // Root
            ],
            openVoicingOnly: false,
            minFret: 1,
            maxFret: 18
        },

        'diminished_E_string': {
            name: 'Diminished (E String Root)',
            description: 'Diminished chord with root on low E string',
            chordType: 'dim',
            rootString: 5,
            notes: [
                { string: 5, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 4, fretOffset: 1, interval: 'b5', label: 'b5' }, // Diminished 5th
                { string: 3, fretOffset: 2, interval: 1, label: 'R' }, // Root
                { string: 2, fretOffset: 0, interval: 'b3', label: 'b3' } // Minor 3rd
            ],
            openVoicingOnly: false,
            minFret: 1,
            maxFret: 18
        },

        // Major 7th patterns
        'major7_A_string': {
            name: 'Major 7th (A String Root)',
            description: 'Major 7th chord with root on A string',
            chordType: 'major7',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 3, fretOffset: -1, interval: 7, label: '7' }, // Major 7th
                { string: 2, fretOffset: 0, interval: 5, label: '5' }, // Perfect 5th
                { string: 1, fretOffset: -2, interval: 1, label: 'R' }, // Root
                { string: 0, fretOffset: -3, interval: 3, label: '3' }  // Major 3rd
            ],
            openVoicingOnly: false,
            minFret: 3,
            maxFret: 18
        },

        'minor7_A_string': {
            name: 'Minor 7th (A String Root)',
            description: 'Minor 7th chord with root on A string',
            chordType: 'minor7',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 3, fretOffset: 0, interval: 'b7', label: 'b7' }, // Minor 7th
                { string: 2, fretOffset: 1, interval: 'b3', label: 'b3' }, // Minor 3rd
                { string: 1, fretOffset: 1, interval: 1, label: 'R' }, // Root
                { string: 0, fretOffset: 0, interval: 5, label: '5' }  // Perfect 5th
            ],
            openVoicingOnly: false,
            minFret: 1,
            maxFret: 12
        },

        // Sus chords
        'sus2_A_string': {
            name: 'Sus2 (A String Root)',
            description: 'Sus2 chord with root on A string',
            chordType: 'sus2',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 3, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th
                { string: 2, fretOffset: -1, interval: 2, label: '2' }, // Major 2nd
                { string: 1, fretOffset: 1, interval: 1, label: 'R' }, // Root
                { string: 0, fretOffset: 0, interval: 5, label: '5' }  // Perfect 5th
            ],
            openVoicingOnly: false,
            minFret: 2, // Need at least fret 2 to accommodate negative offset
            maxFret: 12
        },

        'sus4_A_string': {
            name: 'Sus4 (A String Root)',
            description: 'Sus4 chord with root on A string',
            chordType: 'sus4',
            rootString: 4,
            notes: [
                { string: 4, fretOffset: 0, interval: 1, label: 'R' }, // Root
                { string: 3, fretOffset: 2, interval: 5, label: '5' }, // Perfect 5th
                { string: 2, fretOffset: 3, interval: 4, label: '4' }, // Perfect 4th
                { string: 1, fretOffset: 1, interval: 1, label: 'R' }, // Root
                { string: 0, fretOffset: 0, interval: 5, label: '5' }  // Perfect 5th
            ],
            openVoicingOnly: false,
            minFret: 1,
            maxFret: 12
        }
    };
}

/**
 * Get pattern names for a specific chord type
 * @param {string} chordType - Type of chord (e.g., 'major', 'minor', 'dominant7')
 * @returns {Array} Array of pattern names matching the chord type
 */
export function getPatternsByChordType(chordType) {
    const patterns = getChordPatterns();
    return Object.keys(patterns).filter(name => patterns[name].chordType === chordType);
}

/**
 * Get a specific chord pattern by name
 * @param {string} patternName - Name of the pattern to retrieve
 * @returns {Object|null} The pattern object or null if not found
 */
export function getChordPattern(patternName) {
    const patterns = getChordPatterns();
    return patterns[patternName] || null;
}

/**
 * Get all patterns for a specific root string
 * @param {number} rootString - String index (0-5, where 0 is high E)
 * @returns {Array} Array of pattern objects that use the specified root string
 */
export function getPatternsByRootString(rootString) {
    const patterns = getChordPatterns();
    return Object.entries(patterns)
        .filter(([name, pattern]) => pattern.rootString === rootString)
        .map(([name, pattern]) => ({ name, ...pattern }));
}

/**
 * Get patterns by voicing type
 * @param {boolean} openVoicingOnly - Whether to get only open voicing patterns
 * @returns {Array} Array of pattern names matching the voicing type
 */
export function getPatternsByVoicing(openVoicingOnly = false) {
    const patterns = getChordPatterns();
    return Object.keys(patterns).filter(name => 
        patterns[name].openVoicingOnly === openVoicingOnly
    );
}

/**
 * Add a new chord pattern
 * This function would be used to dynamically add patterns (for future extensibility)
 * @param {string} name - Name of the new pattern
 * @param {Object} pattern - Pattern definition object
 */
export function addChordPattern(name, pattern) {
    // For now, this would require modifying the getChordPatterns function
    // In a more advanced implementation, this could work with a dynamic patterns store
    console.warn('Adding dynamic patterns not yet implemented. Please modify chordPatterns.js directly.');
}

// Export default for easy importing
export default {
    getChordPatterns,
    getPatternsByChordType,
    getChordPattern,
    getPatternsByRootString,
    getPatternsByVoicing,
    addChordPattern
};
