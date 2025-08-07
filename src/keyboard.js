import { context,
    masterVolume,
    customWaveform,
    waveform,
    pianoNotes,
    attackTime,
    sustainLevel,
    releaseTime,
    noteLength,
    vibratoSpeed,
    vibratoAmount,
    delay,
    feedback,
    delayAmountGain,
    startButton,
    stopButton,
    tempoControl,
    tempo,
    isPlaying} from './synth';
import {processChord} from './intervals';
import {HeptatonicScales, scales, getScaleNotes, highlightKeysForScales} from './scales';
import {createHeptatonicScaleTable, selectedRootNote, selectedScales} from './scaleGenerator';
import {chords, processedChords, highlightKeysForChords, createChordRootNoteTable, createChordSuffixTable, selectedChordRootNote, selectedChordSuffixes} from './chords';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI} from './midi';
import {createScaleChordCrossReference, updateCrossReferenceDisplay} from './cross';



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

var modifiers = {
    'LeftShift': false,
    'RightShift': false,
    'LeftControl': false,
    'RightControl': false,
    'LeftAlt': false,
    'RightAlt': false,
}

export {modifiers, keyToNote}