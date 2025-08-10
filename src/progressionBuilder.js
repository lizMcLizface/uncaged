import { processChord, generateSyntheticChords, identifySyntheticChords } from './intervals';
import { HeptatonicScales, getScaleNotes } from './scales';
import { getPrimaryScale, getPrimaryRootNote } from './scaleGenerator';
import { noteToMidi, noteToName } from './midi';
import {
    translateNotes as notationTranslateNotes,
    stripOctave as notationStripOctave,
    areEnharmonicEquivalent,
    noteArrayContains
} from './notation';

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

// Configuration constants
const CHORD_LINE_CONFIG = {
    normalWidth: 60,
    highlightedWidth: 80,
    normalOpacity: 0.7,
    highlightedOpacity: 0.9,
    hoverOpacity: 1.0
};

/**
 * Parse a chord progression input string
 * @param {string} progressionText - Input text with chord names and/or roman numerals
 * @returns {Array} Array of parsed chord objects
 */
function parseProgressionInput(progressionText) {
    if (!progressionText || !progressionText.trim()) {
        return [];
    }

    const tokens = progressionText.trim().split(/\s+/);
    const progression = [];
    
    for (let token of tokens) {
        token = token.trim();
        if (!token) continue;
        
        const chordData = parseChordToken(token);
        if (chordData) {
            progression.push(chordData);
        }
    }
    
    return progression;
}

/**
 * Parse a single chord token (either Roman numeral or chord name)
 * @param {string} token - Single chord token
 * @returns {Object|null} Parsed chord data or null if invalid
 */
function parseChordToken(token) {
    // Check if it's a Roman numeral - fixed pattern to properly handle VI and VII
    const romanMatch = token.match(/^(b?#?)(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)(.*)$/);
    
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
        
        // Get the root note for this degree
        let degreeIndex = romanChord.degree - 1;
        
        // Apply prefix modifiers (b = flat, # = sharp)
        if (romanChord.prefix) {
            for (let char of romanChord.prefix) {
                if (char === 'b') {
                    degreeIndex = (degreeIndex - 1 + 7) % 7;
                } else if (char === '#') {
                    degreeIndex = (degreeIndex + 1) % 7;
                }
            }
        }
        
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
            }
        } else {
            // Fallback to traditional Roman numeral interpretation
            console.warn(`No diatonic chord found for degree ${romanChord.degree}, using traditional interpretation`);
            if (romanChord.suffix) {
                chordType = romanSuffixToChordType(romanChord.suffix, romanChord.isNaturallyMinor);
            } else if (romanChord.isNaturallyMinor) {
                chordType = 'min';
            } else {
                chordType = '';
            }
        }
        
        // Construct full chord name
        const fullChordName = chordRoot + chordType;
        
        try {
            const chordInfo = processChord(fullChordName);
            if (!chordInfo || !chordInfo.notes) {
                console.warn(`Failed to process chord: ${fullChordName}`);
                return null;
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
 * Fallback resolution for Roman chords when scale is not fully defined
 * @param {Object} romanChord - Roman chord object
 * @param {string} scaleRootNote - Root note of the scale
 * @returns {Object|null} Resolved chord or null
 */
function resolveFallbackRomanChord(romanChord, scaleRootNote) {
    // Basic major scale intervals as fallback
    const basicMajorIntervals = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    
    try {
        // Map Roman numeral to chromatic degree
        let degreeIndex = romanChord.degree - 1;
        
        // Apply prefix modifiers
        if (romanChord.prefix) {
            for (let char of romanChord.prefix) {
                if (char === 'b') {
                    degreeIndex = (degreeIndex - 1 + 7) % 7;
                } else if (char === '#') {
                    degreeIndex = (degreeIndex + 1) % 7;
                }
            }
        }
        
        if (degreeIndex < 0 || degreeIndex >= basicMajorIntervals.length) {
            console.warn(`Invalid fallback degree index: ${degreeIndex}`);
            return null;
        }
        
        // Calculate the chord root based on major scale intervals
        const rootMidi = noteToMidi(scaleRootNote + '4'); // Add octave for calculation
        const chordRootMidi = rootMidi + basicMajorIntervals[degreeIndex];
        const chordRootNote = noteToName(chordRootMidi).replace('/4', ''); // Remove octave
        
        // Determine chord type
        let chordType = 'Major';
        if (romanChord.suffix) {
            chordType = romanSuffixToChordType(romanChord.suffix, romanChord.isNaturallyMinor);
        } else if (romanChord.isNaturallyMinor) {
            chordType = 'Minor';
        }
        
        const fullChordName = chordRootNote + chordType;
        const chordInfo = processChord(fullChordName);
        
        if (!chordInfo || !chordInfo.notes) {
            return null;
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
    
    // Check for scale changes periodically
    const checkForScaleChanges = () => {
        const newScale = getPrimaryScale();
        const newRoot = getPrimaryRootNote();
        
        if (newScale !== currentScale || newRoot !== currentRoot) {
            console.log('Scale change detected:', { oldScale: currentScale, newScale, oldRoot: currentRoot, newRoot });
            
            // Update stored values
            currentScale = newScale;
            currentRoot = newRoot;
            
            // Update any Roman numeral chords in the current progression
            updateRomanNumeralChords();
        }
    };
    
    // Check every 500ms for scale changes
    setInterval(checkForScaleChanges, 500);
}

/**
 * Update Roman numeral chords when scale changes
 */
function updateRomanNumeralChords() {
    if (currentProgression.length === 0) return;
    
    let progressionChanged = false;
    
    // Update each Roman numeral chord in the progression
    currentProgression.forEach((chord, index) => {
        if (chord.type === 'roman') {
            const updatedChord = resolveRomanChord(chord);
            if (updatedChord && updatedChord.chordInfo) {
                // Update the chord with new scale context
                currentProgression[index] = updatedChord;
                progressionChanged = true;
                
                console.log(`Updated Roman numeral ${chord.originalToken} to:`, updatedChord.chordInfo.name);
            } else {
                console.warn(`Could not resolve Roman numeral ${chord.originalToken} in new scale context`);
                // Keep the original chord but mark it as potentially invalid
                currentProgression[index].isInvalid = true;
            }
        }
    });
    
    if (progressionChanged) {
        // Reset pattern selections for updated chords
        selectedPatternIndexes.clear();
        
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
            Examples: "C7 D#m7b5 Gmajor" or "I IV ii V" or "Cmaj7 Am7 Dm7 G7"
        </span>
    `;
    helpText.style.marginBottom = '8px';
    section.appendChild(helpText);
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'chord-progression-input';
    input.placeholder = 'e.g., I vi IV V or C Am F G or Cmaj7 Am7 Dm7 G7';
    input.style.cssText = `
        width: 100%;
        padding: 12px;
        font-size: 14px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: #fff;
        color: #333;
        box-sizing: border-box;
    `;
    
    // Add input event listener
    input.addEventListener('input', (e) => {
        const progressionText = e.target.value;
        updateProgression(progressionText);
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
    
    currentProgression = resolvedProgression;
    
    // Update display
    updateProgressionDisplay();
    
    // Update fretboard if no chord is being hovered
    if (hoveredChordIndex === null) {
        displayAllChordPatterns();
    }
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
    
    // Get available patterns (already sorted by getChordPatternMatches)
    const patterns = getChordPatternMatches(chord);
    
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
    if (!fretboard || !chord.chordInfo || !chord.chordInfo.notes) return;
    
    const patterns = getChordPatternMatches(chord);
    
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
    const chordNotes = chord.chordInfo.notes.map(note => notationStripOctave(note));
    
    // If no patterns are available, show chord notes with enhanced visibility when hovered
    if (patterns.length === 0) {
        // Display the chord normally
        fretboard.displayChord(chordNotes, getChordDisplayName(chord), {
            clearFirst: false,
            showLines: false,
            showScaleContext: showScaleContext
        });
        
        // If highlighted (hovered), add a visual indicator by displaying again with different name
        if (isHighlighted) {
            // Add a special indicator to the chord name to show it's being highlighted
            const highlightedName = `🎯 ${getChordDisplayName(chord)} (Notes Only)`;
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
    fretboard.displayChord(chordNotes, getChordDisplayName(chord), {
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
        if (!chord.chordInfo || !chord.chordInfo.notes) return;
        
        const patterns = getChordPatternMatches(chord);
        if (patterns.length === 0) return;
        
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
