/**
 * Canonical chromatic scale and the simple note<->MIDI conversions that used
 * to live in src/midi.js. Framework-free - no DOM, no app-specific imports.
 *
 * These are NOT the same conversions as src/theory/notation.js's noteToMidi
 * /noteToName/midiToNote. That is a separate, richer, scale-context-aware
 * system with its own MIDI-number convention (standard: MIDI 60 = C/4). This
 * module's noteToMidi/noteToName use a different, non-standard octave
 * convention (noteToMidi('C/4') === 48, not 60) inherited unmodified from
 * midi.js, including its noteToMidi/noteToName asymmetry (they are not
 * exact inverses of each other - see midi.test.js). The two pairs were
 * already used side by side under different names (e.g. frets.js aliases
 * notation.js's as notationNoteToMidi) before this refactor; that did not
 * change, so neither did which one any given call site uses.
 */

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function normalize(note) {
    if (typeof note !== 'string') return note;

    return note.trim()
        .replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/𝄪/g, '##')
        .replace(/𝄫/g, 'bb')
        .replace(/♮/g, ''); // Natural symbol cancels accidentals
}

function noteToMidi(note) {
    var pitch = note[0].toLowerCase();
    var octave = parseInt(note.slice(-1));
    var normalizedNote = normalize(note);
    var sliced = normalizedNote.slice(1, -2);
    var offset = 0;
    switch (sliced) {
        default: break;
        case '#': offset = 1; break;
        case '##': offset = 2; break;
        case 'b': offset = -1; break;
        case 'bb': offset = -2; break;
    }
    var key = 0;
    switch (pitch) {
        case 'c': key = 0; break;
        case 'd': key = 2; break;
        case 'e': key = 4; break;
        case 'f': key = 5; break;
        case 'g': key = 7; break;
        case 'a': key = 9; break;
        case 'b': key = 11; break;
        default: break; // unrecognized pitch letter keeps key = 0, as before
    }
    return (octave * 12) + key + offset;
}

function noteToName(input) {
    var octave = String(Math.floor(input / 12) - 1);
    var note = input % 12;
    return CHROMATIC[note] + '/' + octave;
}

export { CHROMATIC, normalize, noteToMidi, noteToName };
