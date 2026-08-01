/**
 * Mini Piano Component
 * 
 * A modular mini piano visualization that displays 12 keys (one octave)
 * and highlights notes in different colors based on their function.
 * Can be used for chords, scales, or any collection of notes.
 */

import { stripOctave as notationStripOctave } from '../../theory/notation';
import { getIntervalColor, getIntervalLabel } from '../../theory/intervals';
import { getChannel, isChannelEnabled } from '../../audio/dispatch';

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
    chordScaleOverlapColor: '#ffaa44', // Orange for chord+scale overlap
    rootScaleOverlapColor: '#ff6666', // Lighter red for root+scale overlap
    textColor: '#000',
    blackKeyTextColor: '#fff',
    fontSize: 9,
    cornerRadius: 2,
    overlapBorderWidth: 2,
    overlapBorderColor: '#8B4513' // Brown border for overlap indication
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

// Interval-color palette and label table moved to src/theory/intervals.js
// (Phase 2) - imported above. Mirrors the palette used throughout the Scale
// Position Grid (frets.js's getIntervalColor) so a given scale tone reads
// as the same color everywhere in the app - the scale piano, every chord
// piano, and the fretboard all agree on what color "the b7" is.

const CHROMATIC_SEMITONES = {
    C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11
};

/**
 * Semitone distance of a note from a reference root (both plain note names;
 * octave and enharmonic spelling are normalized away first).
 * @param {string} rootNote
 * @param {string} note
 * @returns {number} 0-11
 */
function getSemitoneFromRoot(rootNote, note) {
    const rootSemitone = CHROMATIC_SEMITONES[normalizeNoteName(rootNote)] || 0;
    const noteSemitone = CHROMATIC_SEMITONES[normalizeNoteName(note)] || 0;
    return ((noteSemitone - rootSemitone) % 12 + 12) % 12;
}

/**
 * Interval semitone distance, standard label (R, m3, P5, ...) and palette
 * color for a note relative to a reference root - the single source of
 * truth consumers should use rather than re-deriving each piece themselves.
 * @param {string} rootNote
 * @param {string} note
 * @returns {{semitone: number, label: string, color: string}}
 */
export function getIntervalInfo(rootNote, note) {
    const semitone = getSemitoneFromRoot(rootNote, note);
    return { semitone, label: getIntervalLabel(semitone), color: getIntervalColor(semitone) };
}

// --- Click-to-play wiring ---
// Mirrors progressionBuilder.js's triggerChordProgression: the synth is a
// React component mounted elsewhere, reached from this vanilla-JS module via
// the 'synth' channel App.js registers in src/audio/dispatch.js.
function getActivePolySynth() {
    if (!isChannelEnabled('synth')) {
        return null;
    }
    const synthChannel = getChannel('synth');
    if (!synthChannel || !synthChannel.playNotes) {
        return null;
    }
    return synthChannel;
}

// Fallback register used only when a note carries no octave of its own and
// the synth hasn't reported a selected octave (see getSynthBaseOctave). Also
// the register getScaleNotes() anchors a scale's root to, so it doubles as
// the reference point other modules shift away from when following the
// synth's selected octave.
export const DEFAULT_BASE_OCTAVE = 4;

/**
 * The synth's currently selected reference octave (the register Z/X shift
 * up/down in index.js), so mini-piano playback lines up with whatever
 * octave the on-screen/QWERTY keyboard is currently playing in. Falls back
 * to DEFAULT_BASE_OCTAVE if the synth hasn't published one yet. Exported so
 * other modules (e.g. the Scale Information panel) can shift their own
 * displayed/played note octaves to match the same reference.
 * @returns {number}
 */
export function getSynthBaseOctave() {
    if (typeof window !== 'undefined' && typeof window.getSynthBaseOctave === 'function') {
        const value = window.getSynthBaseOctave();
        if (typeof value === 'number' && !Number.isNaN(value)) return value;
    }
    return DEFAULT_BASE_OCTAVE;
}

/**
 * Extract the octave from a "Note/octave" string (e.g. "C#/5" -> 5).
 * @param {string} note
 * @returns {number|null}
 */
function extractOctave(note) {
    if (typeof note !== 'string') return null;
    const match = /\/(-?\d+)\s*$/.exec(note);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Assign real octaves to a sequence of notes for playback. Notes that
 * already carry an explicit octave (e.g. "C/5", as produced from an actual
 * scale degree) keep that exact register - this is what lets a chord built
 * on a high scale degree play at its true pitch instead of being reset to
 * baseOctave. Bare note letters (no octave) fall back to the previous
 * behavior: the first (lowest) note sits at baseOctave and every following
 * note is strictly higher in pitch, rolling over to the next octave
 * whenever its pitch class would otherwise land at or below the previous
 * note's.
 * @param {Array<string>} noteLetters
 * @param {number} [baseOctave] - defaults to the synth's selected octave
 * @returns {Array<string>} e.g. ['E4', 'G4', 'B4', 'D5']
 */
function assignAscendingOctaves(noteLetters, baseOctave = getSynthBaseOctave()) {
    let octave = baseOctave;
    let prevSemitone = null;
    return noteLetters.map(note => {
        const normalized = normalizeNoteName(note);
        const explicitOctave = extractOctave(note);
        if (explicitOctave !== null) {
            return `${normalized}${explicitOctave}`;
        }
        const semitone = CHROMATIC_SEMITONES[normalized] || 0;
        if (prevSemitone !== null && semitone <= prevSemitone) {
            octave += 1;
        }
        prevSemitone = semitone;
        return `${normalized}${octave}`;
    });
}

/**
 * Play a set of note letters together as a block chord.
 */
function playNotesAsChord(noteLetters, { volume = 70, duration = 800 } = {}) {
    const synth = getActivePolySynth();
    if (!synth || !noteLetters.length) return;
    const notes = assignAscendingOctaves(noteLetters);
    if (synth.stopAllNotes) synth.stopAllNotes();
    synth.playNotes(notes, volume, duration);
}

/**
 * Play a set of note letters one at a time, ascending - used for the scale
 * piano's "run up the scale" playback.
 */
function playNotesAsSequence(noteLetters, { volume = 70, noteDuration = 320, gap = 340 } = {}) {
    const synth = getActivePolySynth();
    if (!synth || !noteLetters.length) return;
    const notes = assignAscendingOctaves(noteLetters);
    if (synth.stopAllNotes) synth.stopAllNotes();
    notes.forEach((note, index) => {
        setTimeout(() => {
            const activeSynth = getActivePolySynth();
            if (activeSynth) activeSynth.playNotes([note], volume, noteDuration);
        }, index * gap);
    });
}

/**
 * Wire a mini piano SVG so clicking (or pressing Enter/Space when focused)
 * plays noteLetters through the synth, either as a chord or as an ascending
 * sequence. No-ops harmlessly if the synth isn't available/enabled.
 * @param {SVGElement} svg
 * @param {Array<string>} noteLetters
 * @param {'chord'|'sequence'} playMode
 */
function makePianoPlayable(svg, noteLetters, playMode) {
    if (!noteLetters || noteLetters.length === 0) return;

    svg.style.cursor = 'pointer';
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('role', 'button');
    svg.setAttribute('aria-label', playMode === 'sequence' ? 'Play scale' : 'Play chord');

    const trigger = () => {
        if (playMode === 'sequence') {
            playNotesAsSequence(noteLetters);
        } else {
            playNotesAsChord(noteLetters);
        }
    };

    svg.addEventListener('click', trigger);
    svg.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            trigger();
        }
    });
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
    return createIntervalPiano({ notes: scaleNotes, rootNote, showNoteNames: true, playMode: 'sequence' });
}

/**
 * Create a mini piano where every highlighted note is colored by its
 * interval distance from rootNote, using the same palette as the Scale
 * Position Grid (see getIntervalColor above). Used for the scale piano and
 * for per-chord pianos so a given scale tone is always the same color,
 * whether it's the scale's own display or the root of one chord and the
 * 3rd of another.
 * Clicking the piano plays notes through the synth (see makePianoPlayable):
 * 'chord' mode (the default, used for triad/seventh pianos) plays every note
 * together; 'sequence' mode (used for the scale piano) plays them one at a
 * time, ascending.
 * @param {Object} options
 * @param {Array} options.notes - Notes to highlight
 * @param {string} options.rootNote - Reference root for interval coloring
 * @param {boolean} [options.showNoteNames=true]
 * @param {boolean} [options.playable=true] - Whether clicking plays the notes
 * @param {'chord'|'sequence'} [options.playMode='chord']
 * @returns {HTMLElement|null} SVG element containing the mini piano
 */
export function createIntervalPiano(options = {}) {
    const { notes = [], rootNote, showNoteNames = true, playable = true, playMode = 'chord' } = options;

    if (!notes || notes.length === 0 || !rootNote) {
        return null;
    }

    const config = MINI_PIANO_CONFIG;
    const normalizedNotes = notes.map(note => normalizeNoteName(note));
    const normalizedRoot = normalizeNoteName(rootNote);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', config.width);
    svg.setAttribute('height', config.height + 20);
    svg.style.cssText = `
        display: block;
        margin: 4px auto;
        background: rgba(0,0,0,0.05);
        border-radius: 4px;
        padding: 2px;
    `;

    const drawKey = (note, x, y, width, height, isBlack) => {
        const isHighlighted = normalizedNotes.includes(note);
        const isRoot = normalizedRoot === note;

        let fillColor = isBlack ? config.blackKeyFill : config.whiteKeyFill;
        if (isHighlighted) {
            fillColor = getIntervalColor(getSemitoneFromRoot(normalizedRoot, note));
        }

        const key = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        key.setAttribute('x', x);
        key.setAttribute('y', y);
        key.setAttribute('width', width);
        key.setAttribute('height', height);
        key.setAttribute('fill', fillColor);
        key.setAttribute('stroke', isBlack ? config.blackKeyStroke : config.whiteKeyStroke);
        key.setAttribute('stroke-width', isRoot ? config.overlapBorderWidth : 1);
        key.setAttribute('rx', config.cornerRadius);
        key.setAttribute('ry', config.cornerRadius);
        svg.appendChild(key);

        if (showNoteNames && isHighlighted) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + width / 2);
            text.setAttribute('y', height - (isBlack ? 6 : 8));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', isBlack ? config.blackKeyTextColor : config.textColor);
            text.setAttribute('font-size', config.fontSize - (isBlack ? 1 : 0));
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', isRoot ? 'bold' : 'normal');
            text.textContent = note;
            svg.appendChild(text);
        }
    };

    WHITE_KEYS.forEach((note, index) => {
        drawKey(note, index * config.whiteKeyWidth, 0, config.whiteKeyWidth, config.whiteKeyHeight, false);
    });

    BLACK_KEYS.forEach(note => {
        const position = BLACK_KEY_POSITIONS[note];
        const x = (position * config.whiteKeyWidth) - (config.blackKeyWidth / 2);
        drawKey(note, x, 0, config.blackKeyWidth, config.blackKeyHeight, true);
    });

    if (playable) {
        makePianoPlayable(svg, notes, playMode);
    }

    return svg;
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
        
        // Check note status
        const isRoot = normalizedRoot === note;
        const isChordNote = normalizedChordNotes.includes(note);
        const isScaleNote = normalizedScaleNotes.includes(note);
        
        // Determine fill color and border based on overlap conditions
        let fillColor = config.whiteKeyFill;
        let strokeColor = config.whiteKeyStroke;
        let strokeWidth = 1;
        let isHighlighted = false;
        
        // Priority and overlap logic
        if (isRoot) {
            if (isScaleNote) {
                // Root note that's also in scale - special highlighting
                fillColor = config.rootScaleOverlapColor;
                strokeColor = config.overlapBorderColor;
                strokeWidth = config.overlapBorderWidth;
            } else {
                fillColor = config.rootNoteColor;
            }
            isHighlighted = true;
        } else if (isChordNote && isScaleNote) {
            // Chord note that's also in scale - special highlighting
            fillColor = config.chordScaleOverlapColor;
            strokeColor = config.overlapBorderColor;
            strokeWidth = config.overlapBorderWidth;
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
        key.setAttribute('stroke', strokeColor);
        key.setAttribute('stroke-width', strokeWidth);
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
        
        // Check note status
        const isRoot = normalizedRoot === note;
        const isChordNote = normalizedChordNotes.includes(note);
        const isScaleNote = normalizedScaleNotes.includes(note);
        
        // Determine fill color and border based on overlap conditions
        let fillColor = config.blackKeyFill;
        let strokeColor = config.blackKeyStroke;
        let strokeWidth = 1;
        let isHighlighted = false;
        
        // Priority and overlap logic
        if (isRoot) {
            if (isScaleNote) {
                // Root note that's also in scale - special highlighting
                fillColor = config.rootScaleOverlapColor;
                strokeColor = config.overlapBorderColor;
                strokeWidth = config.overlapBorderWidth;
            } else {
                fillColor = config.rootNoteColor;
            }
            isHighlighted = true;
        } else if (isChordNote && isScaleNote) {
            // Chord note that's also in scale - special highlighting
            fillColor = config.chordScaleOverlapColor;
            strokeColor = config.overlapBorderColor;
            strokeWidth = config.overlapBorderWidth;
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
        key.setAttribute('stroke', strokeColor);
        key.setAttribute('stroke-width', strokeWidth);
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
