// The computer keyboard as a musical input device: which physical key is
// which note, and which notes are being held right now.
//
// `keyboardState.currentPressed` was a module-level `var` inside
// src/index.js's key handler, unreadable from anywhere else. It lives here as
// a mutable object (REFACTOR_PLAN.md 2.3 rule 2 - not an exported `let`,
// which importers cannot reassign) because the piano needs it: a render that
// happens mid-press builds fresh <li> elements that have never seen the
// keydown, so it has to reapply `pressedKey` from the held set itself.

/**
 * Notes currently held on the computer keyboard, in `Name/Octave` form
 * ('E/4') - the same shape src/piano/ and Fretboard.markNote use.
 */
const keyboardState = {
    currentPressed: []
};

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

export {keyToNote, keyboardState}