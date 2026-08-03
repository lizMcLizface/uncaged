/**
 * Roman numeral chord parsing and resolution against the active scale, plus
 * plain chord-token parsing. Framework-free except for one deliberate
 * exception: resolveRomanChord/resolveFallbackRomanChord read the live
 * scale-selection state (getPrimaryScale/getPrimaryRootNote) from
 * ../scales, because "which chord does 'I' mean" is meaningless
 * without knowing the currently selected scale. That is app state, not a
 * DOM dependency, and it's exactly what these functions already did before
 * this module existed - moving them here didn't add the coupling.
 *
 * useSeventhChords (progressionBuilder.js's "triads vs sevenths" toggle) is
 * NOT read the same way: it's passed in as an explicit parameter rather than
 * imported, so this module doesn't reach back into progressionBuilder.js.
 * Callers in progressionBuilder.js pass their local `useSeventhChords`
 * variable explicitly; the default (false) matches its initial value there.
 *
 * Moved from progressionBuilder.js:549-1073 (REFACTOR_PLAN.md Phase 2).
 */
import { processChord, identifySyntheticChords } from './chords';
import { HeptatonicScales, getScaleNotes, getPrimaryScale, getPrimaryRootNote } from '../scales';
import { noteToMidi, noteToName } from './notes';
import { stripOctave as notationStripOctave } from './notation';

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
 * @param {boolean} [useSeventhChords=false] - Triads vs seventh chords
 * @returns {Object|null} Resolved chord with notes
 */
function resolveRomanChord(romanChord, useSeventhChords = false) {
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
            return resolveFallbackRomanChord(romanChord, scaleRootNote, useSeventhChords);
        }

        const scaleDefinition = HeptatonicScales[family][parseInt(mode, 10) - 1];
        const intervals = scaleDefinition.intervals;
        const scaleNotes = getScaleNotes(scaleRootNote, intervals);

        // if (!scaleNotes || scaleNotes.length < 7) {
        //     console.warn(`Incomplete scale notes for ${primaryScale}. Using fallback resolution.`);
        //     return resolveFallbackRomanChord(romanChord, scaleRootNote, useSeventhChords);
        // }

        // Use identifySyntheticChords to get scale-aware chord types
        let diatonicChords;
        try {
            // Use length 4 for seventh chords when the toggle is enabled, otherwise use 3 for triads
            const chordLength = useSeventhChords ? 4 : 3;
            diatonicChords = identifySyntheticChords(scaleDefinition, chordLength, scaleRootNote);
        } catch (error) {
            console.warn(`Failed to identify diatonic chords for ${primaryScale}. Using fallback resolution.`);
            return resolveFallbackRomanChord(romanChord, scaleRootNote, useSeventhChords);
        }

        // Get the root note for this degree (without prefix modifiers first)
        let degreeIndex = romanChord.degree - 1;

        if (degreeIndex < 0 || degreeIndex >= scaleNotes.length || degreeIndex >= diatonicChords.length) {
            console.warn(`Invalid degree index ${degreeIndex} for Roman numeral resolution`);
            return resolveFallbackRomanChord(romanChord, scaleRootNote, useSeventhChords);
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
        return resolveFallbackRomanChord(romanChord, scaleRootNote, useSeventhChords);
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
 * @param {boolean} [useSeventhChords=false] - Triads vs seventh chords
 * @returns {Object|null} Resolved chord or null
 */
function resolveFallbackRomanChord(romanChord, scaleRootNote, useSeventhChords = false) {
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

// parseChordName, resolveFallbackRomanChord, modifyChordTypeWithSuffix,
// addSeventhToChordType, transposeChordByPrefix and romanSuffixToChordType
// are internal helpers used only within this module and by the tests that
// exercise it indirectly through the four functions below - matching their
// visibility before the move, when they were unexported same-file helpers.
export {
    parseChordToken,
    parseRomanNumeral,
    romanToDegree,
    resolveRomanChord
};
