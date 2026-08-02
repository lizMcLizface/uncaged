// DOM key-highlighting for the on-screen mini piano: a MIDI-indexed lookup
// table of key elements (`keys_chords`) and the function that toggles the
// `highlightedKey` class from a set of scale note names. The only piece of
// scaleGenerator.js's/scales.js's original scale-data surface that touches
// the DOM - everything else moved to src/scales/scaleData.js.
//
// Split out of scales.js as part of REFACTOR_PLAN.md Phase 4 (the
// scaleGenerator.js/scales.js -> src/scales/ half); re-exports the
// scaleData.js names external files still import from './scales' so their
// import paths don't need to change until the barrel lands.

import { noteToMidi } from './midi';
import {
    HeptatonicScales,
    HexatonicScales,
    PentatonicScales,
    scales,
    precomputeScaleChords,
    precomputeChordsForScales,
    getPrecomputedChords,
    getChordsForScale,
    clearChordCache,
    getChordCacheStats,
    getScaleNotes
} from './scales/scaleData';

const getElementByNote = (note) =>
  note && document.querySelector(`[note="${note}_scale"]`);
const getElementByMIDI = (note) =>
  note && document.querySelector(`[midi="${note}_scale"]`);

const keys_chords = {
    60 : { element: getElementByMIDI("60"), note: "C",  octave: 4 },
    61 : { element: getElementByMIDI("61"), note: "C#", octave: 4 },
    62 : { element: getElementByMIDI("62"), note: "D",  octave: 4 },
    63 : { element: getElementByMIDI("63"), note: "D#", octave: 4 },
    64 : { element: getElementByMIDI("64"), note: "E",  octave: 4 },
    65 : { element: getElementByMIDI("65"), note: "F",  octave: 4 },
    66 : { element: getElementByMIDI("66"), note: "F#", octave: 4 },
    67 : { element: getElementByMIDI("67"), note: "G",  octave: 4 },
    68 : { element: getElementByMIDI("68"), note: "G#", octave: 4 },
    69 : { element: getElementByMIDI("69"), note: "A",  octave: 4 },
    70 : { element: getElementByMIDI("70"), note: "A#", octave: 4 },
    71 : { element: getElementByMIDI("71"), note: "B",  octave: 4 },
    72 : { element: getElementByMIDI("72"), note: "C",  octave: 5 },
    73 : { element: getElementByMIDI("73"), note: "C#", octave: 5 },
    74 : { element: getElementByMIDI("74"), note: "D",  octave: 5 },
    75 : { element: getElementByMIDI("75"), note: "D#", octave: 5 },
    76 : { element: getElementByMIDI("76"), note: "E",  octave: 5 },
    77 : { element: getElementByMIDI("77"), note: "F",  octave: 5 },
    78 : { element: getElementByMIDI("78"), note: "F#", octave: 5 },
    79 : { element: getElementByMIDI("79"), note: "G",  octave: 5 },
    80 : { element: getElementByMIDI("80"), note: "G#", octave: 5 },
    81 : { element: getElementByMIDI("81"), note: "A",  octave: 5 },
    82 : { element: getElementByMIDI("82"), note: "A#", octave: 5 },
    83 : { element: getElementByMIDI("83"), note: "B",  octave: 5 },
    84 : { element: getElementByMIDI("84"), note: "C",  octave: 6 },
};

function highlightKeysForScales(notes){
    for(var key in keys_chords) {
        if (keys_chords[key].element) {
            keys_chords[key].element.classList.remove('highlightedKey');
        }
    }
    // console.log("Highlighting keys for notes:", notes);
    if (notes && notes.length > 0) {
        notes.forEach(note => {
            var n = noteToMidi(note) + 12;
            let key = keys_chords[n];
            // console.log("Key for note:", note, "is", key, "MIDI:", n);
            if (key && key.element) {
                // console.log("Highlighting key:", key.note, "Octave:", key.octave);
                key.element.classList.add('highlightedKey');
            }
        });
    }
}

export {
    HeptatonicScales,
    HexatonicScales,
    PentatonicScales,
    scales,
    highlightKeysForScales,
    getScaleNotes,
    precomputeScaleChords,
    precomputeChordsForScales,
    getPrecomputedChords,
    getChordsForScale,
    clearChordCache,
    getChordCacheStats
};
