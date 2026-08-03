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
    }
    return undefined;
}

export {keyToNote}