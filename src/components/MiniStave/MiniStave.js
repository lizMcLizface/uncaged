/**
 * Mini Stave Component
 * 
 * A modular mini stave visualization using VexFlow that displays chord notes
 * on both treble and bass clefs with proper enharmonic handling.
 */

import { stripOctave as notationStripOctave } from '../../notation';

// VexFlow components are available globally from index.js
// Access them from the global scope
const getVexFlow = () => {
    if (typeof window !== 'undefined' && window.VexFlowComponents) {
        return window.VexFlowComponents;
    }
    // Fallback: try to get from require if available
    try {
        const { Vex, Formatter, Renderer, Stave, Accidental, StaveNote, Voice } = require("vexflow");
        return { Vex, Formatter, Renderer, Stave, Accidental, StaveNote, Voice };
    } catch (e) {
        console.warn('VexFlow not available:', e);
        return null;
    }
};

// Configuration for mini stave appearance
const MINI_STAVE_CONFIG = {
    width: 240,
    height: 240,
    trebleStaveY: 10,
    bassStaveY: 20,
    staveWidth: 240,
    staveHeight: 105,
    margin: 10,
    noteColors: {
        root: '#ff4444',
        chord: '#4488ff',
        scale: '#44ff44',
        default: '#000000'
    }
};

/**
 * Normalize note name to handle enharmonic equivalents while preserving spelling
 * @param {string} note - Note name (e.g., 'C#', 'Db', 'C♯', 'D♭')
 * @returns {string} Normalized note name
 */
function normalizeNoteName(note) {
    const stripped = notationStripOctave(note);
    
    // Handle various sharp/flat notations but preserve the base note
    // Support both 'x' and '##' for double sharp, 'bb' for double flat
    const normalizedNote = stripped
        .replace(/♯♯|##/g, 'x')  // Double sharp
        .replace(/♭♭/g, 'bb')    // Double flat
        .replace(/♯/g, '#')      // Single sharp
        .replace(/♭/g, 'b')      // Single flat
        .trim();
    
    return normalizedNote;
}

/**
 * Get the accidentals that are in a key signature
 * @param {string} key - Key signature (e.g., 'C', 'D', 'F#', 'Bb')
 * @returns {Object} Object with sharps and flats arrays
 */
function getKeySignatureAccidentals(key) {
    const keySignatures = {
        // Major keys
        'C': { sharps: [], flats: [] },
        'G': { sharps: ['F'], flats: [] },
        'D': { sharps: ['F', 'C'], flats: [] },
        'A': { sharps: ['F', 'C', 'G'], flats: [] },
        'E': { sharps: ['F', 'C', 'G', 'D'], flats: [] },
        'B': { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
        'F#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
        'C#': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'], flats: [] },
        
        'F': { sharps: [], flats: ['B'] },
        'Bb': { sharps: [], flats: ['B', 'E'] },
        'Eb': { sharps: [], flats: ['B', 'E', 'A'] },
        'Ab': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
        'Db': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
        'Gb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
        'Cb': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] },
        
        // Minor keys (relative to major keys)
        'Am': { sharps: [], flats: [] },
        'Em': { sharps: ['F'], flats: [] },
        'Bm': { sharps: ['F', 'C'], flats: [] },
        'F#m': { sharps: ['F', 'C', 'G'], flats: [] },
        'C#m': { sharps: ['F', 'C', 'G', 'D'], flats: [] },
        'G#m': { sharps: ['F', 'C', 'G', 'D', 'A'], flats: [] },
        'D#m': { sharps: ['F', 'C', 'G', 'D', 'A', 'E'], flats: [] },
        'A#m': { sharps: ['F', 'C', 'G', 'D', 'A', 'E', 'B'], flats: [] },
        
        'Dm': { sharps: [], flats: ['B'] },
        'Gm': { sharps: [], flats: ['B', 'E'] },
        'Cm': { sharps: [], flats: ['B', 'E', 'A'] },
        'Fm': { sharps: [], flats: ['B', 'E', 'A', 'D'] },
        'Bbm': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G'] },
        'Ebm': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C'] },
        'Abm': { sharps: [], flats: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] }
    };
    
    return keySignatures[key] || { sharps: [], flats: [] };
}

/**
 * Check if a note needs an accidental based on key signature
 * @param {string} note - Note with accidental (e.g., 'F#', 'Bb', 'C')
 * @param {string} key - Key signature
 * @returns {boolean} True if accidental should be displayed
 */
function needsAccidental(note, key) {
    const baseNote = note.charAt(0).toUpperCase();
    const accidental = note.slice(1);
    const keyAccidentals = getKeySignatureAccidentals(key);
    
    // Double accidentals always need to be displayed
    if (accidental.includes('x') || accidental.includes('##') || accidental.includes('𝄪') ||
        accidental.includes('bb') || accidental.includes('𝄫')) {
        return true;
    }
    
    // If note has a sharp
    if (accidental.includes('#') || accidental.includes('♯')) {
        // Check if this note is already sharp in the key signature
        return !keyAccidentals.sharps.includes(baseNote);
    }
    
    // If note has a flat
    if (accidental.includes('b') || accidental.includes('♭')) {
        // Check if this note is already flat in the key signature
        return !keyAccidentals.flats.includes(baseNote);
    }
    
    // Natural note - check if key signature has it as sharp or flat
    const hasSharpInKey = keyAccidentals.sharps.includes(baseNote);
    const hasFlatInKey = keyAccidentals.flats.includes(baseNote);
    
    // If the key signature has this note as sharp/flat, but we want natural, show natural sign
    return hasSharpInKey || hasFlatInKey;
}

/**
 * Extract note name and octave from a note string
 * @param {string} note - Note string (e.g., 'C4', 'F#4', 'Bb4', or 'C', 'F#', 'Bb')
 * @returns {Object} Object with noteName and octave properties
 */
function parseNoteWithOctave(note) {
    if (!note) return { noteName: 'C', octave: 4 };
    
    // Check if note already has octave information (ends with a number)
    const match = note.match(/^([A-Ga-g][#b♯♭]*?)(\d+)?$/);
    if (match) {
        const noteName = match[1];
        const octave = match[2] ? parseInt(match[2], 10) : null;
        return { noteName, octave };
    }
    
    // Fallback for unrecognized format
    return { noteName: note, octave: null };
}

/**
 * Correct enharmonic spelling based on scale context
 * @param {Array} computedNotes - Notes as computed from fretboard (e.g., ['C4', 'E4', 'G4'])
 * @param {Array} scaleNotes - Notes that are in the current scale (e.g., ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'])
 * @param {Array} theoreticalNotes - Theoretical chord notes for additional reference (optional)
 * @returns {Array} Corrected notes with proper enharmonic spelling
 */
function correctEnharmonicSpelling(computedNotes, scaleNotes = null, theoreticalNotes = null) {
    // console.log('Correcting enharmonic spelling for notes:', computedNotes);
    if (!scaleNotes || scaleNotes.length === 0) {
        // Fallback to theoretical notes if no scale context
        if (!theoreticalNotes || theoreticalNotes.length === 0) {
            return computedNotes; // No reference, return as-is
        }
        return correctEnharmonicWithTheory(computedNotes, theoreticalNotes);
    }
    
    // Create enharmonic mapping for common equivalents including double accidentals
    const enharmonicMap = {
        'C': ['B#', 'Dbb'],
        'C#': ['Db', 'Bx'],
        'Db': ['C#', 'Bx'],
        'D': ['Cx', 'Ebb'],
        'D#': ['Eb', 'Cx'],
        'Eb': ['D#', 'Fbb'],
        'E': ['Fb', 'Dx'],
        'F': ['E#', 'Gbb'],
        'F#': ['Gb', 'Ex'],
        'Gb': ['F#', 'Ex'],
        'G': ['Fx', 'Abb'],
        'G#': ['Ab', 'Fx'],
        'Ab': ['G#'],
        'A': ['Gx', 'Bbb'],
        'A#': ['Bb', 'Gx'],
        'Bb': ['A#', 'Cbb'],
        'B': ['Cb', 'Ax'],
        'B#': ['C', 'Ax'],
        'Cb': ['B', 'Ax'],
        'E#': ['F', 'Dx'],
        'Fb': ['E', 'Dx'],
        // Double sharps
        'Cx': ['D', 'D#', 'Eb'],
        'Dx': ['E', 'F', 'Fb'],
        'Ex': ['F#', 'Gb'],
        'Fx': ['G', 'G#', 'Ab'],
        'Gx': ['A', 'A#', 'Bb'],
        'Ax': ['B', 'C', 'B#', 'Cb'],
        'Bx': ['C#', 'Db'],
        // Double flats
        'Dbb': ['C', 'B#'],
        'Ebb': ['D', 'Cx'],
        'Fbb': ['Eb', 'D#'],
        'Gbb': ['F', 'E#'],
        'Abb': ['G', 'Fx'],
        'Bbb': ['A', 'Gx'],
        'Cbb': ['Bb', 'A#']
    };
    
    // Strip octaves from scale notes for comparison
    const scaleNotesClean = scaleNotes.map(note => notationStripOctave(note));
    
    return computedNotes.map(computedNote => {
        const { noteName: computedNoteName, octave } = parseNoteWithOctave(computedNote);
        const computedClean = notationStripOctave(computedNoteName);
        // console.log(`Checking computed note: ${computedClean}`);

        // First check if the computed note is already in the scale
        if (scaleNotesClean.includes(computedClean)) {
            // console.log(`Computed note ${computedClean} is already in the scale.`);
            return computedNote; // Already correct
        }
        
        // If not in scale, check if an enharmonic equivalent is in the scale
        const enharmonics = enharmonicMap[computedClean] || [];
        for (const enharmonic of enharmonics) {
            // console.log(`Checking enharmonic ${enharmonic} against scale notes`);
            if (scaleNotesClean.includes(enharmonic)) {
                // console.log(`Found enharmonic ${enharmonic} for computed note ${computedClean}`);
                // Use the enharmonic spelling that's in the scale
                return octave !== null ? `${enharmonic}${octave}` : enharmonic;
            }
        }
        
        // No scale-based correction found, try theoretical notes as backup
        if (theoreticalNotes && theoreticalNotes.length > 0) {
            const theoreticalNotesClean = theoreticalNotes.map(note => notationStripOctave(note));
            // console.log(`Checking theoretical notes against computed note ${theoreticalNotesClean}`);
            for (const enharmonic of enharmonics) {
                // console.log(`Checking enharmonic ${enharmonic} against theoretical notes`);
                if (theoreticalNotesClean.includes(enharmonic)) {
                    return octave !== null ? `${enharmonic}${octave}` : enharmonic;
                }
            }
        }
        
        // No correction found, return original
        // console.log(`No correction found for computed note ${computedClean}, returning original.`);
        return computedNote;
    });
}

/**
 * Legacy function for theoretical-only enharmonic correction
 * @param {Array} computedNotes - Notes as computed from fretboard
 * @param {Array} theoreticalNotes - Theoretical chord notes for reference
 * @returns {Array} Corrected notes with proper enharmonic spelling
 */
function correctEnharmonicWithTheory(computedNotes, theoreticalNotes) {
    const enharmonicMap = {
        'C': ['B#', 'Dbb'],
        'C#': ['Db', 'Bx'],
        'Db': ['C#', 'Bx'],
        'D': ['Cx', 'Ebb'],
        'D#': ['Eb', 'Cx'],
        'Eb': ['D#', 'Fbb'],
        'E': ['Fb', 'Dx'],
        'F': ['E#', 'Gbb'],
        'F#': ['Gb', 'Ex'],
        'Gb': ['F#', 'Ex'],
        'G': ['Fx', 'Abb'],
        'G#': ['Ab', 'Fx'],
        'Ab': ['G#'],
        'A': ['Gx', 'Bbb'],
        'A#': ['Bb', 'Gx'],
        'Bb': ['A#', 'Cbb'],
        'B': ['Cb', 'Ax'],
        'B#': ['C', 'Ax'],
        'Cb': ['B', 'Ax'],
        'E#': ['F', 'Dx'],
        'Fb': ['E', 'Dx'],
        // Double sharps
        'Cx': ['D', 'D#', 'Eb'],
        'Dx': ['E', 'F', 'Fb'],
        'Ex': ['F#', 'Gb'],
        'Fx': ['G', 'G#', 'Ab'],
        'Gx': ['A', 'A#', 'Bb'],
        'Ax': ['B', 'C', 'B#', 'Cb'],
        'Bx': ['C#', 'Db'],
        // Double flats
        'Dbb': ['C', 'B#'],
        'Ebb': ['D', 'Cx'],
        'Fbb': ['Eb', 'D#'],
        'Gbb': ['F', 'E#'],
        'Abb': ['G', 'Fx'],
        'Bbb': ['A', 'Gx'],
        'Cbb': ['Bb', 'A#']
    };
    
    const theoreticalNotesClean = theoreticalNotes.map(note => notationStripOctave(note));
    
    return computedNotes.map(computedNote => {
        const { noteName: computedNoteName, octave } = parseNoteWithOctave(computedNote);
        const computedClean = notationStripOctave(computedNoteName);
        
        const enharmonics = enharmonicMap[computedClean] || [];
        for (const enharmonic of enharmonics) {
            if (theoreticalNotesClean.includes(enharmonic)) {
                return octave !== null ? `${enharmonic}${octave}` : enharmonic;
            }
        }
        
        return computedNote;
    });
}

/**
 * Resolve proper note names for a chord while preserving enharmonic spelling
 * @param {Array} chordNotes - Array of chord note names (with or without octaves)
 * @param {string} rootNote - Root note of the chord
 * @param {string} staveKey - Key signature for context
 * @returns {Array} Array of note names with preserved enharmonic spelling and octave information
 */
function resolveProperNoteNames(chordNotes, rootNote, staveKey = 'C') {
    if (!chordNotes || chordNotes.length === 0) {
        return [];
    }
    
    // Preserve enharmonic spelling and octave information
    return chordNotes.map(note => {
        const { noteName, octave } = parseNoteWithOctave(note);
        
        // Only normalize accidental symbols (♯ → #, ♭ → b) but preserve base note
        const preservedNoteName = noteName
            .replace(/♯/g, '#')
            .replace(/♭/g, 'b')
            .trim();
        
        // Return with octave if it was present, otherwise just the preserved note name
        return octave !== null ? `${preservedNoteName}${octave}` : preservedNoteName;
    });
}

/**
 * Convert a note to VexFlow format with proper octave
 * @param {string} note - Note name (e.g., 'C', 'F#', 'Bb')
 * @param {number} octave - Octave number
 * @returns {string} VexFlow formatted note (e.g., 'c/4', 'f#/4', 'bb/4')
 */
function noteToVexFlow(note, octave) {
    const normalized = normalizeNoteName(note);
    
    // Convert to VexFlow format (lowercase base note)
    const baseNote = normalized.charAt(0).toLowerCase();
    const accidental = normalized.slice(1);
    
    return `${baseNote}${accidental}/${octave}`;
}

/**
 * Get appropriate octave for note based on pitch for staff placement
 * @param {string} note - Note name
 * @param {boolean} preferTreble - Whether to prefer treble clef placement
 * @returns {number} Octave number
 */
function getAppropriateOctave(note, preferTreble = true) {
    const normalized = normalizeNoteName(note);
    const baseNote = normalized.charAt(0);
    
    // Map notes to their relative pitch within an octave (C=0, B=11)
    const notePitchMap = {
        'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    };
    
    const basePitch = notePitchMap[baseNote];
    
    if (preferTreble) {
        // For treble clef, use octave 4-5 range
        // Higher notes (G, A, B) go to octave 5, lower notes (C, D, E, F) to octave 4
        return basePitch >= 7 ? 5 : 4;
    } else {
        // For bass clef, use octave 2-3 range
        // Higher notes (G, A, B) go to octave 3, lower notes (C, D, E, F) to octave 2
        return basePitch >= 7 ? 3 : 2;
    }
}

/**
 * Split notes between treble and bass clef based on pitch
 * @param {Array} notes - Array of note names (with or without octaves)
 * @returns {Object} Object with trebleNotes and bassNotes arrays
 */
function splitNotesForClefs(notes) {
    const trebleNotes = [];
    const bassNotes = [];
    
    notes.forEach(note => {
        const { noteName, octave } = parseNoteWithOctave(note);
        
        let finalOctave;
        if (octave !== null) {
            finalOctave = octave;
        } else {
            // Fallback to appropriate octave selection for notes without octave info
            finalOctave = getAppropriateOctave(noteName, true); // Default to treble range
        }
        
        // Split based on pitch: C4 (middle C) and above go to treble, below go to bass
        // C4 = 60 in MIDI note numbers
        const midiNote = getMidiNoteNumber(noteName, finalOctave);
        
        if (midiNote >= 60) { // C4 and above
            trebleNotes.push(noteToVexFlow(noteName, finalOctave));
        } else { // Below C4
            bassNotes.push(noteToVexFlow(noteName, finalOctave));
        }
    });
    
    return { trebleNotes, bassNotes };
}

/**
 * Convert note name and octave to MIDI note number
 * @param {string} noteName - Note name (e.g., 'C', 'F#', 'Bb')
 * @param {number} octave - Octave number
 * @returns {number} MIDI note number
 */
function getMidiNoteNumber(noteName, octave) {
    const normalized = normalizeNoteName(noteName);
    const baseNote = normalized.charAt(0).toUpperCase();
    const accidental = normalized.slice(1);
    
    // Base MIDI numbers for each note in octave 0
    const baseMidiNumbers = {
        'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    };
    
    let midiNumber = baseMidiNumbers[baseNote] + (octave + 1) * 12;
    
    // Adjust for accidentals
    if (accidental.includes('#') || accidental.includes('♯')) {
        midiNumber += 1;
    } else if (accidental.includes('b') || accidental.includes('♭')) {
        midiNumber -= 1;
    }
    
    return midiNumber;
}

/**
 * Create a VexFlow stave with notes
 * @param {HTMLElement} container - Container element
 * @param {Array} notes - Array of note names
 * @param {string} clef - Clef type ('treble' or 'bass')
 * @param {number} y - Y position of the stave
 * @param {string} staveKey - Key signature for the stave
 * @returns {Object} VexFlow renderer and context
 */
function createStave(container, notes, clef, y, staveKey = 'C') {
    const vf = getVexFlow();
    if (!vf) {
        console.warn('VexFlow not available for stave creation');
        return null;
    }
    
    const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = vf;
    
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(MINI_STAVE_CONFIG.staveWidth, MINI_STAVE_CONFIG.staveHeight);
    
    const context = renderer.getContext();
    const stave = new Stave(10, 0, MINI_STAVE_CONFIG.staveWidth - 20);
    
    // Add clef and key signature
    stave.addClef(clef);
    if (staveKey && staveKey !== 'C') {
        stave.addKeySignature(staveKey);
    }
    
    stave.setContext(context).draw();
    // console.log(`Stave created for ${clef} clef with key ${staveKey}`);
    // console.log(`Notes: ${notes.join(', ')}`);

    if (notes.length > 0) {
        // console.log(`Creating ${clef} stave with notes:`, notes);
        
        // Create a single chord with all notes stacked vertically
        const chordNote = new StaveNote({
            clef: clef,
            keys: notes, // All notes in the chord
            duration: 'w' // Whole note
        });
        
        // Add accidentals to each note in the chord based on key signature
        notes.forEach((note, index) => {
            // console.log(`Processing note ${index}: ${note}`);
            const noteName = note.split('/')[0];
            const baseNote = noteName.charAt(0).toUpperCase();
            const accidental = noteName.slice(1);
            
            // console.log(`Note: ${note}, noteName: ${noteName}, baseNote: ${baseNote}, accidental: "${accidental}"`);
            
            // Check if this note needs an accidental based on key signature
            if (needsAccidental(noteName, staveKey)) {
                if (accidental.includes('x') || accidental.includes('##') || accidental.includes('𝄪')) {
                    // console.log(`Adding double sharp accidental to ${note} at index ${index}`);
                    chordNote.addModifier(new Accidental('##'), index);
                } else if (accidental.includes('bb') || accidental.includes('𝄫')) {
                    // console.log(`Adding double flat accidental to ${note} at index ${index}`);
                    chordNote.addModifier(new Accidental('bb'), index);
                } else if (accidental.includes('#') || accidental.includes('♯')) {
                    // console.log(`Adding sharp accidental to ${note} at index ${index}`);
                    chordNote.addModifier(new Accidental('#'), index);
                } else if (accidental.includes('b') || accidental.includes('♭')) {
                    // console.log(`Adding flat accidental to ${note} at index ${index}`);
                    chordNote.addModifier(new Accidental('b'), index);
                } else {
                    // Natural note that needs natural sign (conflicts with key signature)
                    // console.log(`Adding natural accidental to ${note} at index ${index}`);
                    chordNote.addModifier(new Accidental('n'), index);
                }
            } else {
                // console.log(`No accidental needed for ${note} in key ${staveKey}`);
            }
        });
        
        // Create a voice and add the chord
        const voice = new Voice({ num_beats: 4, beat_value: 4 }); // One whole note beat
        voice.addTickables([chordNote]);
        
        // Format and draw
        new Formatter().joinVoices([voice]).format([voice], MINI_STAVE_CONFIG.staveWidth - 40);
        voice.draw(context, stave);
    }
    
    return { renderer, context };
}

/**
 * Create a chord stave showing notes on both treble and bass clef
 * @param {Array} chordNotes - Array of note names in the chord
 * @param {string} rootNote - Root note of the chord
 * @param {string} staveKey - Key signature for notation context (default: 'C')
 * @param {Array} theoreticalNotes - Theoretical chord notes for enharmonic correction (optional)
 * @param {Array} scaleNotes - Current scale notes for enharmonic correction (optional)
 * @returns {HTMLElement} Container element with the mini stave
 */
function createChordStave(chordNotes, rootNote, staveKey = 'C', theoreticalNotes = null, scaleNotes = null) {
    // Apply enharmonic correction based on scale context first, then theoretical notes
    const correctedNotes = correctEnharmonicSpelling(chordNotes, scaleNotes, theoreticalNotes);
        
    const container = document.createElement('div');
    container.className = 'mini-stave-container';
    container.style.cssText = `
        width: ${MINI_STAVE_CONFIG.width}px;
        height: ${MINI_STAVE_CONFIG.height}px;
        margin: 0 auto;
        position: relative;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 5px;
        overflow: hidden;
        display: block;
        box-sizing: border-box;
        z-index: 10;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    `;
    
    // Check if VexFlow is available
    const vf = getVexFlow();
    if (!vf) {
        const errorText = document.createElement('div');
        errorText.textContent = 'VexFlow not available';
        errorText.style.cssText = `
            text-align: center;
            line-height: ${MINI_STAVE_CONFIG.height}px;
            color: #ff6666;
            font-size: 12px;
        `;
        container.appendChild(errorText);
        return container;
    }
    
    if (!chordNotes || chordNotes.length === 0) {
        const errorText = document.createElement('div');
        errorText.textContent = 'No notes to display';
        errorText.style.cssText = `
            text-align: center;
            line-height: ${MINI_STAVE_CONFIG.height}px;
            color: #999;
            font-size: 12px;
        `;
        container.appendChild(errorText);
        return container;
    }
    
    try {
        // Resolve proper note names based on scale context using corrected notes
        const properNotes = resolveProperNoteNames(correctedNotes, rootNote, staveKey);
        
        // Remove duplicates and sort notes
        const uniqueNotes = [...new Set(properNotes)];
        const { trebleNotes, bassNotes } = splitNotesForClefs(uniqueNotes);
        
        // Determine layout based on which staves have notes
        const hasTreble = trebleNotes.length > 0;
        const hasBass = bassNotes.length > 0;
        
        // Create treble clef stave (only if there are treble notes)
        if (hasTreble) {
            const trebleContainer = document.createElement('div');
            trebleContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: ${hasBass ? '50%' : '100%'};
                overflow: hidden;
            `;
            container.appendChild(trebleContainer);
            
            createStave(trebleContainer, trebleNotes, 'treble', 0, staveKey);
        }
        
        // Create bass clef stave (only if there are bass notes)
        if (hasBass) {
            const bassContainer = document.createElement('div');
            bassContainer.style.cssText = `
                position: absolute;
                ${hasTreble ? 'bottom: 0;' : 'top: 0;'}
                left: 0;
                width: 100%;
                height: ${hasTreble ? '50%' : '100%'};
                overflow: hidden;
            `;
            container.appendChild(bassContainer);
            
            createStave(bassContainer, bassNotes, 'bass', 0, staveKey);
        }
        
        // If no notes were assigned to either staff, show an error
        if (!hasTreble && !hasBass) {
            const errorText = document.createElement('div');
            errorText.textContent = 'No valid notes for display';
            errorText.style.cssText = `
                text-align: center;
                line-height: ${MINI_STAVE_CONFIG.height}px;
                color: #999;
                font-size: 12px;
            `;
            container.appendChild(errorText);
        }
        
    } catch (error) {
        console.warn('Error creating mini stave:', error);
        const errorText = document.createElement('div');
        errorText.textContent = 'Stave error';
        errorText.style.cssText = `
            text-align: center;
            line-height: ${MINI_STAVE_CONFIG.height}px;
            color: #ff6666;
            font-size: 12px;
        `;
        container.appendChild(errorText);
    }
    
    return container;
}

/**
 * Create a mixed stave showing both chord and scale notes
 * @param {Array} chordNotes - Array of chord note names
 * @param {Array} scaleNotes - Array of scale note names
 * @param {string} rootNote - Root note
 * @param {string} staveKey - Key signature for notation context
 * @param {Array} theoreticalNotes - Theoretical chord notes for enharmonic correction (optional)
 * @returns {HTMLElement} Container element with the mini stave
 */
function createMixedStave(chordNotes, scaleNotes, rootNote, staveKey = 'C', theoreticalNotes = null) {
    // For now, just show chord notes (can be enhanced later to show scale context)
    // Pass scale notes for enharmonic correction
    return createChordStave(chordNotes, rootNote, staveKey, theoreticalNotes, scaleNotes);
}

// Export the main functions
export { createChordStave, createMixedStave };
