/**
 * Mini Piano Component
 * 
 * A modular mini piano visualization that displays 12 keys (one octave)
 * and highlights notes in different colors based on their function.
 * Can be used for chords, scales, or any collection of notes.
 */

import { stripOctave as notationStripOctave } from '../../notation';

// Configuration for mini piano appearance
const MINI_PIANO_CONFIG = {
    width: 140,
    height: 60,
    whiteKeyWidth: 20,
    whiteKeyHeight: 60,
    blackKeyWidth: 12,
    blackKeyHeight: 36,
    whiteKeyStroke: '#333',
    whiteKeyFill: '#fff',
    blackKeyStroke: '#000',
    blackKeyFill: '#333',
    rootNoteColor: '#ff4444',
    chordNoteColor: '#4488ff',
    scaleNoteColor: '#44ff44',
    textColor: '#000',
    blackKeyTextColor: '#fff',
    fontSize: 9,
    cornerRadius: 2
};

// Piano key layout - white keys and their positions
const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_KEYS = ['C#', 'D#', 'F#', 'G#', 'A#'];

// Map black keys to their position relative to white keys
const BLACK_KEY_POSITIONS = {
    'C#': 0.5, // Between C and D
    'D#': 1.5, // Between D and E
    'F#': 3.5, // Between F and G
    'G#': 4.5, // Between G and A
    'A#': 5.5  // Between A and B
};

/**
 * Normalize note name to handle enharmonic equivalents
 * @param {string} note - Note name (e.g., 'C#', 'Db', 'C♯', 'D♭', 'E#', 'B#')
 * @returns {string} Normalized note name
 */
function normalizeNoteName(note) {
    const stripped = notationStripOctave(note);
    
    // Handle various sharp/flat notations
    const normalizedNote = stripped
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .trim();
    
    // Comprehensive enharmonic equivalents map
    const enharmonicMap = {
        // Standard flats to sharps
        'Db': 'C#',
        'Eb': 'D#',
        'Gb': 'F#',
        'Ab': 'G#',
        'Bb': 'A#',
        
        // Double sharps and unusual enharmonics
        'B#': 'C',
        'Bs': 'C',
        'E#': 'F',
        'Es': 'F',
        'C##': 'D',
        'D##': 'E',
        'F##': 'G',
        'G##': 'A',
        'A##': 'B',
        
        // Double flats and unusual enharmonics
        'Cb': 'B',
        'Fb': 'E',
        'Cbb': 'Bb',
        'Dbb': 'C',
        'Ebb': 'D',
        'Fbb': 'Eb',
        'Gbb': 'F',
        'Abb': 'G',
        'Bbb': 'A',
        
        // Handle both ## and ♯♯ notation
        'C♯♯': 'D',
        'D♯♯': 'E',
        'F♯♯': 'G',
        'G♯♯': 'A',
        'A♯♯': 'B',
        
        // Handle both bb and ♭♭ notation
        'C♭♭': 'Bb',
        'D♭♭': 'C',
        'E♭♭': 'D',
        'F♭♭': 'Eb',
        'G♭♭': 'F',
        'A♭♭': 'G',
        'B♭♭': 'A'
    };
    
    return enharmonicMap[normalizedNote] || normalizedNote;
}

/**
 * Create a mini piano SVG element
 * @param {Object} options - Configuration options
 * @param {Array} options.notes - Array of note names to highlight
 * @param {string} options.rootNote - Root note to highlight differently (optional)
 * @param {string} options.highlightType - Type of highlighting ('chord', 'scale', 'custom')
 * @param {Object} options.customColors - Custom color mapping for notes (optional)
 * @param {boolean} options.showNoteNames - Whether to show note names on keys (default: true)
 * @returns {HTMLElement} SVG element containing the mini piano
 */
export function createMiniPiano(options = {}) {
    const {
        notes = [],
        rootNote = null,
        highlightType = 'chord',
        customColors = {},
        showNoteNames = true
    } = options;
    
    if (!notes || notes.length === 0) {
        return null;
    }
    
    const config = MINI_PIANO_CONFIG;
    
    // Normalize all notes
    const normalizedNotes = notes.map(note => normalizeNoteName(note));
    const normalizedRoot = rootNote ? normalizeNoteName(rootNote) : null;
    
    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', config.width);
    svg.setAttribute('height', config.height + 20); // Extra space for labels
    svg.style.cssText = `
        display: block;
        margin: 4px auto;
        background: rgba(0,0,0,0.05);
        border-radius: 4px;
        padding: 2px;
    `;
    
    // Draw white keys first
    WHITE_KEYS.forEach((note, index) => {
        const x = index * config.whiteKeyWidth;
        const y = 0;
        
        // Check if this note should be highlighted
        const isHighlighted = normalizedNotes.includes(note);
        const isRoot = normalizedRoot === note;
        
        // Determine fill color
        let fillColor = config.whiteKeyFill;
        if (isRoot) {
            fillColor = customColors.root || config.rootNoteColor;
        } else if (isHighlighted) {
            if (highlightType === 'scale') {
                fillColor = customColors.scale || config.scaleNoteColor;
            } else {
                fillColor = customColors.chord || config.chordNoteColor;
            }
        }
        
        // Create white key rectangle
        const key = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        key.setAttribute('x', x);
        key.setAttribute('y', y);
        key.setAttribute('width', config.whiteKeyWidth);
        key.setAttribute('height', config.whiteKeyHeight);
        key.setAttribute('fill', fillColor);
        key.setAttribute('stroke', config.whiteKeyStroke);
        key.setAttribute('stroke-width', '1');
        key.setAttribute('rx', config.cornerRadius);
        key.setAttribute('ry', config.cornerRadius);
        
        svg.appendChild(key);
        
        // Add note name label if enabled and note is highlighted
        if (showNoteNames && isHighlighted) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + config.whiteKeyWidth / 2);
            text.setAttribute('y', config.whiteKeyHeight - 8);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', config.textColor);
            text.setAttribute('font-size', config.fontSize);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', isRoot ? 'bold' : 'normal');
            text.textContent = note;
            svg.appendChild(text);
        }
    });
    
    // Draw black keys on top
    BLACK_KEYS.forEach(note => {
        const position = BLACK_KEY_POSITIONS[note];
        const x = (position * config.whiteKeyWidth) - (config.blackKeyWidth / 2);
        const y = 0;
        
        // Check if this note should be highlighted
        const isHighlighted = normalizedNotes.includes(note);
        const isRoot = normalizedRoot === note;
        
        // Determine fill color
        let fillColor = config.blackKeyFill;
        if (isRoot) {
            fillColor = customColors.root || config.rootNoteColor;
        } else if (isHighlighted) {
            if (highlightType === 'scale') {
                fillColor = customColors.scale || config.scaleNoteColor;
            } else {
                fillColor = customColors.chord || config.chordNoteColor;
            }
        }
        
        // Create black key rectangle
        const key = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        key.setAttribute('x', x);
        key.setAttribute('y', y);
        key.setAttribute('width', config.blackKeyWidth);
        key.setAttribute('height', config.blackKeyHeight);
        key.setAttribute('fill', fillColor);
        key.setAttribute('stroke', config.blackKeyStroke);
        key.setAttribute('stroke-width', '1');
        key.setAttribute('rx', config.cornerRadius);
        key.setAttribute('ry', config.cornerRadius);
        
        svg.appendChild(key);
        
        // Add note name label if enabled and note is highlighted
        if (showNoteNames && isHighlighted) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + config.blackKeyWidth / 2);
            text.setAttribute('y', config.blackKeyHeight - 6);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', config.blackKeyTextColor);
            text.setAttribute('font-size', config.fontSize - 1);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', isRoot ? 'bold' : 'normal');
            text.textContent = note;
            svg.appendChild(text);
        }
    });
    
    return svg;
}

/**
 * Create a mini piano for chord display
 * @param {Array} chordNotes - Array of chord note names
 * @param {string} rootNote - Root note of the chord
 * @returns {HTMLElement} SVG element containing the mini piano
 */
export function createChordPiano(chordNotes, rootNote) {
    return createMiniPiano({
        notes: chordNotes,
        rootNote: rootNote,
        highlightType: 'chord',
        showNoteNames: true
    });
}

/**
 * Create a mini piano for scale display
 * @param {Array} scaleNotes - Array of scale note names
 * @param {string} rootNote - Root note of the scale
 * @returns {HTMLElement} SVG element containing the mini piano
 */
export function createScalePiano(scaleNotes, rootNote) {
    return createMiniPiano({
        notes: scaleNotes,
        rootNote: rootNote,
        highlightType: 'scale',
        showNoteNames: true
    });
}

/**
 * Create a mini piano for mixed display (e.g., chord within scale context)
 * @param {Array} chordNotes - Array of chord note names  
 * @param {Array} scaleNotes - Array of scale note names
 * @param {string} rootNote - Root note
 * @returns {HTMLElement} SVG element containing the mini piano
 */
export function createMixedPiano(chordNotes, scaleNotes, rootNote) {
    const config = MINI_PIANO_CONFIG;
    
    if (!chordNotes || chordNotes.length === 0) {
        return null;
    }
    
    // Normalize all notes
    const normalizedChordNotes = chordNotes.map(note => normalizeNoteName(note));
    const normalizedScaleNotes = scaleNotes ? scaleNotes.map(note => normalizeNoteName(note)) : [];
    const normalizedRoot = rootNote ? normalizeNoteName(rootNote) : null;
    
    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', config.width);
    svg.setAttribute('height', config.height + 20); // Extra space for labels
    svg.style.cssText = `
        display: block;
        margin: 4px auto;
        background: rgba(0,0,0,0.05);
        border-radius: 4px;
        padding: 2px;
    `;
    
    // Draw white keys first
    WHITE_KEYS.forEach((note, index) => {
        const x = index * config.whiteKeyWidth;
        const y = 0;
        
        // Check note status (priority: root > chord > scale)
        const isRoot = normalizedRoot === note;
        const isChordNote = normalizedChordNotes.includes(note);
        const isScaleNote = normalizedScaleNotes.includes(note);
        
        // Determine fill color based on priority
        let fillColor = config.whiteKeyFill;
        let isHighlighted = false;
        
        if (isRoot) {
            fillColor = config.rootNoteColor;
            isHighlighted = true;
        } else if (isChordNote) {
            fillColor = config.chordNoteColor;
            isHighlighted = true;
        } else if (isScaleNote) {
            fillColor = config.scaleNoteColor;
            isHighlighted = true;
        }
        
        // Create white key rectangle
        const key = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        key.setAttribute('x', x);
        key.setAttribute('y', y);
        key.setAttribute('width', config.whiteKeyWidth);
        key.setAttribute('height', config.whiteKeyHeight);
        key.setAttribute('fill', fillColor);
        key.setAttribute('stroke', config.whiteKeyStroke);
        key.setAttribute('stroke-width', '1');
        key.setAttribute('rx', config.cornerRadius);
        key.setAttribute('ry', config.cornerRadius);
        
        svg.appendChild(key);
        
        // Add note name label if highlighted
        if (isHighlighted) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + config.whiteKeyWidth / 2);
            text.setAttribute('y', config.whiteKeyHeight - 8);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', config.textColor);
            text.setAttribute('font-size', config.fontSize);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', isRoot ? 'bold' : 'normal');
            text.textContent = note;
            svg.appendChild(text);
        }
    });
    
    // Draw black keys on top
    BLACK_KEYS.forEach(note => {
        const position = BLACK_KEY_POSITIONS[note];
        const x = (position * config.whiteKeyWidth) - (config.blackKeyWidth / 2);
        const y = 0;
        
        // Check note status (priority: root > chord > scale)
        const isRoot = normalizedRoot === note;
        const isChordNote = normalizedChordNotes.includes(note);
        const isScaleNote = normalizedScaleNotes.includes(note);
        
        // Determine fill color based on priority
        let fillColor = config.blackKeyFill;
        let isHighlighted = false;
        
        if (isRoot) {
            fillColor = config.rootNoteColor;
            isHighlighted = true;
        } else if (isChordNote) {
            fillColor = config.chordNoteColor;
            isHighlighted = true;
        } else if (isScaleNote) {
            fillColor = config.scaleNoteColor;
            isHighlighted = true;
        }
        
        // Create black key rectangle
        const key = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        key.setAttribute('x', x);
        key.setAttribute('y', y);
        key.setAttribute('width', config.blackKeyWidth);
        key.setAttribute('height', config.blackKeyHeight);
        key.setAttribute('fill', fillColor);
        key.setAttribute('stroke', config.blackKeyStroke);
        key.setAttribute('stroke-width', '1');
        key.setAttribute('rx', config.cornerRadius);
        key.setAttribute('ry', config.cornerRadius);
        
        svg.appendChild(key);
        
        // Add note name label if highlighted
        if (isHighlighted) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + config.blackKeyWidth / 2);
            text.setAttribute('y', config.blackKeyHeight - 6);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', config.blackKeyTextColor);
            text.setAttribute('font-size', config.fontSize - 1);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', isRoot ? 'bold' : 'normal');
            text.textContent = note;
            svg.appendChild(text);
        }
    });
    
    return svg;
}

/**
 * Get the configuration object for customization
 * @returns {Object} Configuration object
 */
export function getMiniPianoConfig() {
    return { ...MINI_PIANO_CONFIG };
}

/**
 * Update the configuration for all future mini piano instances
 * @param {Object} newConfig - New configuration values to merge
 */
export function updateMiniPianoConfig(newConfig) {
    Object.assign(MINI_PIANO_CONFIG, newConfig);
}
