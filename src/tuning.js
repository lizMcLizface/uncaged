/**
 * Single source of truth for the active instrument's string count and tuning.
 *
 * Every tuning array uses the same convention as the fretboard engine
 * (frets.js) and chord pattern positions: index 0 is the highest-pitched
 * string, index (stringCount - 1) is the lowest-pitched string. Notes are
 * plain "LetterOctave" strings (e.g. 'E4', 'F#1', 'Bb2') - the same format
 * frets.js's GUITAR_TUNING already used.
 */

import { NOTE_TO_SEMITONE } from './theory/notation';
import { CHROMATIC as SHARP_NAMES } from './theory/notes';

/**
 * Parse 'E4', 'F#1' or slash-form 'E/4' into { letter, offset, octave }.
 */
function parseNoteOctave(note) {
    const cleaned = String(note).trim();
    const slashIndex = cleaned.indexOf('/');
    let namePart, octavePart;

    if (slashIndex !== -1) {
        namePart = cleaned.slice(0, slashIndex);
        octavePart = cleaned.slice(slashIndex + 1);
    } else {
        const match = cleaned.match(/^([A-Ga-g][#b]{0,2})(-?\d+)$/);
        namePart = match ? match[1] : cleaned;
        octavePart = match ? match[2] : '4';
    }

    const letter = namePart.charAt(0).toUpperCase();
    let offset = 0;
    for (const ch of namePart.slice(1)) {
        if (ch === '#') offset += 1;
        else if (ch === 'b') offset -= 1;
    }

    return { letter, offset, octave: parseInt(octavePart, 10) };
}

function noteOctaveToSemitones({ letter, offset, octave }) {
    return octave * 12 + NOTE_TO_SEMITONE[letter] + offset;
}

function semitonesToNoteOctave(semitones) {
    const octave = Math.floor(semitones / 12);
    const pitchClass = ((semitones % 12) + 12) % 12;
    return { letter: SHARP_NAMES[pitchClass], octave };
}

export const INSTRUMENT_PRESETS = {
    guitar6: { label: '6-String Guitar (Standard)', family: 'guitar', stringCount: 6, tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'] },
    guitar6DropD: { label: '6-String Guitar (Drop D)', family: 'guitar', stringCount: 6, tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'D2'] },
    guitar6OpenD: { label: '6-String Guitar (Open D)', family: 'guitar', stringCount: 6, tuning: ['D4', 'A3', 'F#3', 'D3', 'A2', 'D2'] },
    guitar6OpenG: { label: '6-String Guitar (Open G)', family: 'guitar', stringCount: 6, tuning: ['D4', 'B3', 'G3', 'D3', 'G2', 'D2'] },
    guitar6DADGAD: { label: '6-String Guitar (DADGAD)', family: 'guitar', stringCount: 6, tuning: ['D4', 'A3', 'G3', 'D3', 'A2', 'D2'] },
    guitar7: { label: '7-String Guitar (Standard)', family: 'guitar', stringCount: 7, tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2', 'B1'] },
    guitar7DropA: { label: '7-String Guitar (Drop A)', family: 'guitar', stringCount: 7, tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2', 'A1'] },
    guitar8: { label: '8-String Guitar (Standard)', family: 'guitar', stringCount: 8, tuning: ['E4', 'B3', 'G3', 'D3', 'A2', 'E2', 'B1', 'F#1'] },
    bass4: { label: '4-String Bass (Standard)', family: 'bass', stringCount: 4, tuning: ['G2', 'D2', 'A1', 'E1'] },
    bass4DropD: { label: '4-String Bass (Drop D)', family: 'bass', stringCount: 4, tuning: ['G2', 'D2', 'A1', 'D1'] },
    bass5: { label: '5-String Bass (Standard)', family: 'bass', stringCount: 5, tuning: ['G2', 'D2', 'A1', 'E1', 'B0'] },
    bass6: { label: '6-String Bass (Standard)', family: 'bass', stringCount: 6, tuning: ['C3', 'G2', 'D2', 'A1', 'E1', 'B0'] }
};

const STORAGE_KEY = 'PolySynth-Instrument';
const DEFAULT_PRESET_ID = 'guitar6';

function clonePreset(presetId) {
    const preset = INSTRUMENT_PRESETS[presetId];
    return { presetId, family: preset.family, stringCount: preset.stringCount, tuning: [...preset.tuning] };
}

function loadActiveConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.tuning) && parsed.tuning.length >= 4 && parsed.tuning.length <= 8) {
                return {
                    presetId: parsed.presetId || 'custom',
                    family: parsed.family || 'guitar',
                    stringCount: parsed.tuning.length,
                    tuning: parsed.tuning
                };
            }
        }
    } catch (error) {
        console.warn('Could not load saved instrument tuning, using default', error);
    }
    return clonePreset(DEFAULT_PRESET_ID);
}

let activeConfig = loadActiveConfig();
let listeners = [];

/**
 * All built-in instrument/tuning presets, keyed by id.
 */
export function getPresets() {
    return INSTRUMENT_PRESETS;
}

/**
 * The currently active { presetId, family, stringCount, tuning } config.
 */
export function getActiveConfig() {
    return activeConfig;
}

/**
 * Set the active instrument/tuning config, persist it, and notify subscribers.
 * @param {{presetId?: string, family?: string, tuning: string[]}} config
 */
export function setActiveConfig(config) {
    if (!config || !Array.isArray(config.tuning) || config.tuning.length < 1) {
        throw new Error('setActiveConfig requires a { tuning: [...] } config');
    }

    activeConfig = {
        presetId: config.presetId || 'custom',
        family: config.family || 'guitar',
        stringCount: config.tuning.length,
        tuning: [...config.tuning]
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activeConfig));
    } catch (error) {
        console.warn('Could not persist instrument tuning', error);
    }

    listeners.forEach(listener => {
        try {
            listener(activeConfig);
        } catch (error) {
            console.error('Tuning change listener failed', error);
        }
    });

    return activeConfig;
}

/**
 * Subscribe to active-config changes. Returns an unsubscribe function.
 */
export function subscribe(callback) {
    listeners.push(callback);
    return () => {
        listeners = listeners.filter(listener => listener !== callback);
    };
}

/**
 * Whether the given tuning is exactly standard 6-string guitar tuning -
 * used to gate the canned (standard-tuning-only) chord shape library.
 */
export function isStandardGuitarTuning(tuning) {
    const standard = INSTRUMENT_PRESETS.guitar6.tuning;
    if (!Array.isArray(tuning) || tuning.length !== standard.length) return false;
    return tuning.every((note, index) => note === standard[index]);
}

/**
 * The open-string note (e.g. 'A2') for a given string index.
 */
export function getOpenStringNote(stringIndex, tuning = activeConfig.tuning) {
    return tuning[stringIndex];
}

/**
 * The note produced by fretting a given string at a given fret.
 * @returns {{letter: string, octave: number, name: string}|null}
 */
export function getNoteAtStringFret(stringIndex, fret, tuning = activeConfig.tuning) {
    const openNote = tuning[stringIndex];
    if (openNote === undefined) return null;

    const semitones = noteOctaveToSemitones(parseNoteOctave(openNote)) + fret;
    const { letter, octave } = semitonesToNoteOctave(semitones);
    return { letter, octave, name: `${letter}${octave}` };
}

/**
 * Convert plain 'E4' style tuning entries to VexFlow/notation.js style 'E/4'.
 */
export function toSlashFormat(tuning) {
    return tuning.map(note => {
        const { letter, octave } = parseNoteOctave(note);
        return `${letter}/${octave}`;
    });
}
