// The computer keyboard as a musical input device: which physical key is
// which note, and which notes are being held right now.
//
// `keyboardState.currentPressed` was a module-level `var` inside
// src/index.js's key handler, unreadable from anywhere else. It lives here as
// a mutable object (REFACTOR_PLAN.md 2.3 rule 2 - not an exported `let`,
// which importers cannot reassign) because the piano needs it: a render that
// happens mid-press builds fresh <li> elements that have never seen the
// keydown, so it has to reapply `pressedKey` from the held set itself.

const MIN_BASE_OCTAVE = 0;
const MAX_BASE_OCTAVE = 8;

const keyboardState = {
    /**
     * Notes currently held on the computer keyboard, in `Name/Octave` form
     * ('E/4') - the same shape src/piano/ and Fretboard.markNote use.
     */
    currentPressed: [],
    /**
     * The register Z/X shifts, and the anchor every keyboard-triggered note
     * is spelled against.
     *
     * It was a `let` inside src/index.js's key handler, readable from
     * elsewhere only through `window.getSynthBaseOctave` - one strand of the
     * bus REFACTOR_PLAN.md Phase 5 exists to cut. It moved here when
     * src/degreeKeys.js became a second reader: "which octave is the computer
     * keyboard playing in" is this module's subject, and the alternative was
     * a second module reaching through `window`. The global still exists and
     * still answers, reading from here - MiniPiano.js consumes it and is not
     * Phase 5's to change today.
     */
    baseOctave: 4
};

/**
 * Move the played register up or down, clamped to the 0-8 the synth covers.
 * @returns {number} the octave actually in effect afterwards
 */
function shiftBaseOctave(delta) {
    const next = keyboardState.baseOctave + delta;
    keyboardState.baseOctave = Math.min(MAX_BASE_OCTAVE, Math.max(MIN_BASE_OCTAVE, next));
    return keyboardState.baseOctave;
}

// Maps a physical key to a note name, in the two-row piano layout the
// on-screen keyboard uses: the home row plays the naturals, the row above
// plays the sharps that sit between them.
function keyToNote(event, octave){
    switch (event.code){
        case 'KeyA': return 'G/' + (octave - 1);
        case 'KeyW': return 'G#/' + (octave - 1);
        case 'KeyS': return 'A/' + (octave - 1);
        case 'KeyE': return 'A#/' + (octave - 1);
        case 'KeyD': return 'B/' + (octave - 1);
        case 'KeyF': return 'C/' + octave;
        case 'KeyT': return 'C#/' + octave;
        case 'KeyG': return 'D/' + octave;
        case 'KeyY': return 'D#/' + octave;
        case 'KeyH': return 'E/' + octave;
        case 'KeyJ': return 'F/' + octave;
        case 'KeyI': return 'F#/' + octave;
        case 'KeyK': return 'G/' + octave;
        case 'KeyO': return 'G#/' + octave;
        case 'KeyL': return 'A/' + octave;
        case 'KeyP': return 'A#/' + octave;
        case 'Semicolon': return 'B/' + octave;
        case 'Quote': return 'C/' + (octave + 1);
        case 'BracketRight': return 'C#/' + (octave + 1);
        default: break; // unmapped key - fall through to the undefined return
    }
    return undefined;
}

export {keyToNote, keyboardState, shiftBaseOctave, MIN_BASE_OCTAVE, MAX_BASE_OCTAVE}