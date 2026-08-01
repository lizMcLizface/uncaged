import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import $ from 'jquery';
import {HeptatonicScales, scales, getScaleNotes, highlightKeysForScales} from './scales';
import {createHeptatonicScaleTable, selectedRootNote, selectedScales, navigateToNextScale, navigateToPreviousScale, navigateToNextRootNote, navigateToPreviousRootNote, refreshChordsForRootNote, getPrimaryScale, getPrimaryRootNote, exclusiveMode, navigateRootUpExclusive, navigateRootDownExclusive, navigateModeUpExclusive, navigateModeDownExclusive, navigateScaleFamilyUpExclusive, navigateScaleFamilyDownExclusive, navigateSequentialUpExclusive, navigateSequentialDownExclusive, updateCurrentScaleDisplay} from './scaleGenerator';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput} from './midi';
import {modifiers, keyToNote} from './keyboard';
import {initializeFretboard, getFretboard, showChordOnFretboard, showScaleOnFretboard, fretboardState} from './frets';
import { ThemeProvider } from './contexts/ThemeContext';
import { getChannel, isChannelEnabled } from './audio/dispatch';

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

window.$ = window.jQuery = require('jquery');

// Defer initialization until DOM and modules are fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize chord cache for default selected scales
    refreshChordsForRootNote();
});

let firstScaleId = selectedScales[0];
let [family, mode] = firstScaleId.split('-');
let intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
let scaleNotes = getScaleNotes(selectedRootNote[0], intervals);

// Export scale and fretboard functions for chord button grid
window.getPrimaryScale = getPrimaryScale;
window.getPrimaryRootNote = getPrimaryRootNote;
window.getScaleNotes = getScaleNotes;
window.HeptatonicScales = HeptatonicScales;
window.getFretboard = getFretboard;
window.showChordOnFretboard = showChordOnFretboard;
window.showScaleOnFretboard = showScaleOnFretboard;
window.currentDisplayedChord = fretboardState.currentDisplayedChord;

const { Vex, Formatter, Renderer, Stave, Accidental, StaveNote, BarNote, Beam, Dot, StaveConnector, Voice, GhostNote } = require("vexflow");
const { Factory } = Vex.Flow;

// Make VexFlow available globally for other modules
window.Vex = Vex;
window.VexFlowComponents = { Formatter, Renderer, Stave, Accidental, StaveNote, BarNote, Beam, Dot, StaveConnector, Voice, GhostNote };

function drawNotes(div, noteArray, stacked = false) {}
let outputNoteArray = [];
function advanceSelectedPosition() {}
function highlightBothPositions() {}
function clearNoteHighlighting() {}
function highlightSelectedNotesSecondary() {}
function updateOutputText() {}

var currentPressed = [];

var currentSynthNotes = {};

let baseOctave = 4;

// Expose the synth's currently selected reference octave (shifted via Z/X)
// so other modules - e.g. the mini pianos' click-to-play - can align their
// own playback octave with whatever register the on-screen keyboard is in.
if (typeof window !== 'undefined') {
    window.getSynthBaseOctave = () => baseOctave;
}

// Function to check if a text input element is currently focused
function isTextInputFocused() {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    const tagName = activeElement.tagName.toLowerCase();
    const inputType = activeElement.type ? activeElement.type.toLowerCase() : '';

    // Check for various text input elements
    return (
        tagName === 'input' && (
            inputType === 'text' ||
            inputType === 'password' ||
            inputType === 'email' ||
            inputType === 'search' ||
            inputType === 'url' ||
            inputType === 'tel' ||
            inputType === '' // Default input type
        )
    ) ||
    tagName === 'textarea' ||
    activeElement.contentEditable === 'true';
}

function onKeyPress(event, up) {
    // Skip keyboard input processing if a text input is focused
    if (isTextInputFocused()) {
        return;
    }
    // Handle octave and navigation keys
    if (event.type == 'keydown' && event.code == 'KeyZ'){
        console.log('Reducing Base Octave: ', baseOctave);
        baseOctave -= 1;
        if(baseOctave < 0) baseOctave = 0;
        updateCurrentScaleDisplay(); // Refresh Scale Information pianos to the new octave
    }
    if (event.type == 'keydown' && event.code == 'KeyX'){
        console.log('Increasing Base Octave: ', baseOctave);
        baseOctave += 1;
        if(baseOctave > 8) baseOctave = 8;
        updateCurrentScaleDisplay(); // Refresh Scale Information pianos to the new octave
    }

    // Scale/root navigation hotkeys. In exclusive mode (single selection),
    // ,/. move the root, n/m move the mode within the current scale family,
    // v/b move the scale family itself, and </> (shift+,/shift+.) step
    // sequentially through every family x mode combination. Outside exclusive
    // mode, the keys fall back to cycling through whatever's in the
    // multi-select arrays (the original behavior).
    if (event.type == 'keydown' && event.code == 'KeyN'){
        if (exclusiveMode ? navigateModeDownExclusive() : navigateToPreviousScale()) {
            console.log('Navigated mode down');
        }
        return; // Don't process as a musical note
    }
    if (event.type == 'keydown' && event.code == 'KeyM'){
        if (exclusiveMode ? navigateModeUpExclusive() : navigateToNextScale()) {
            console.log('Navigated mode up');
        }
        return; // Don't process as a musical note
    }
    if (event.type == 'keydown' && event.code == 'KeyV' && exclusiveMode){
        if (navigateScaleFamilyDownExclusive()) {
            console.log('Navigated scale family down');
        }
        return; // Don't process as a musical note
    }
    if (event.type == 'keydown' && event.code == 'KeyB' && exclusiveMode){
        if (navigateScaleFamilyUpExclusive()) {
            console.log('Navigated scale family up');
        }
        return; // Don't process as a musical note
    }

    if (event.type == 'keydown' && event.code == 'Comma'){
        if (event.shiftKey && exclusiveMode) {
            if (navigateSequentialDownExclusive()) {
                console.log('Navigated sequentially down');
            }
        } else if (exclusiveMode ? navigateRootDownExclusive() : navigateToPreviousRootNote()) {
            console.log('Navigated root down');
        }
        return; // Don't process as a musical note
    }
    if (event.type == 'keydown' && event.code == 'Period'){
        if (event.shiftKey && exclusiveMode) {
            if (navigateSequentialUpExclusive()) {
                console.log('Navigated sequentially up');
            }
        } else if (exclusiveMode ? navigateRootUpExclusive() : navigateToNextRootNote()) {
            console.log('Navigated root up');
        }
        return; // Don't process as a musical note
    }

    // Only process musical notes if PolySynth is enabled
    const synthChannel = getChannel('synth');
    if (!isChannelEnabled('synth') || !synthChannel) {
        return;
    }

    var note = keyToNote(event, baseOctave);

    if (!note) {
        return; // Key not mapped to a musical note
    }

    // Convert note format for PolySynth
    const noteWithOctave = note.replace('/', '');

    if (event.type == 'keydown' && !currentPressed.includes(note)) {
        console.log('Key Down: ', note, '-> PolySynth format:', noteWithOctave);
        currentPressed.push(note);

        // Trigger note on PolySynth using the exposed methods
        if (synthChannel && synthChannel.playNotes) {
            console.log('PolySynth active status BEFORE activation:', synthChannel.isActive());

            // Explicitly activate the synth if not active
            if (!synthChannel.isActive() && synthChannel.activate) {
                console.log('Synth not active, calling activate method...');
                synthChannel.activate();
                // Check status after a brief delay to allow React state update
                setTimeout(() => {
                    console.log('PolySynth active status AFTER activation:', synthChannel.isActive());
                }, 10);
            }

            console.log('Calling PolySynth playNotes with:', [noteWithOctave], 70);
            synthChannel.playNotes([noteWithOctave], 70);
            console.log('PolySynth active status AFTER playNotes call:', synthChannel.isActive());
        } else {
            console.log('PolySynth ref not available:', synthChannel);
        }

        // Add visual feedback to piano keys if available
        var midi = noteToMidi(note) + 12;
        if (keys[midi] && keys[midi].element) {
            keys[midi].element.classList.add('pressedKey');
        }
    }
    else if (event.type == 'keyup' && currentPressed.includes(note)) {
        console.log('Key Up: ', note, '-> PolySynth format:', noteWithOctave);
        currentPressed = currentPressed.filter(item => item !== note);

        // Stop note on PolySynth using the exposed methods
        if (synthChannel && synthChannel.stopNotes) {
            synthChannel.stopNotes([noteWithOctave]);
        }

        // Remove visual feedback from piano keys if available
        var midi = noteToMidi(note) + 12;
        if (keys[midi] && keys[midi].element) {
            keys[midi].element.classList.remove('pressedKey');
        }
    }
}

document.addEventListener('keydown', onKeyPress);
document.addEventListener('keyup', onKeyPress);

// Initialize mouse input for piano keys when PolySynth is available
function initializePolySynthMouse() {
    // Define callbacks for playing and stopping notes
    const playNote2Callback = (notes, volume = 70) => {
        const synthChannel = getChannel('synth');
        if (synthChannel && synthChannel.playNotes) {
            synthChannel.playNotes(notes, volume);
        }
    };

    const stopNotes2Callback = (notes) => {
        const synthChannel = getChannel('synth');
        if (synthChannel && synthChannel.stopNotes) {
            synthChannel.stopNotes(notes);
        }
    };

    // Initialize mouse input with these callbacks
    initializeMouseInput(playNote2Callback, stopNotes2Callback);
}

// Wire up mouse input for piano keys once PolySynth becomes available.
// (Fretboard/tabs/progression-builder/scale-table init all happen once,
// on their own, via frets.js's own DOMContentLoaded/setTimeout bootstrap -
// calling initializeFretboard() again here used to race with that, randomly
// tearing down #fretNotPlaceholder - including the Synthesizer tab's
// PolySynth portal target - out from under React after it had already
// mounted into it.)
document.addEventListener('DOMContentLoaded', () => {
    const checkPolySynth = setInterval(() => {
        if (getChannel('synth')) {
            initializePolySynthMouse();
            clearInterval(checkPolySynth);
        }
    }, 100);

    // Clear the interval after 30 seconds to avoid infinite checking
    setTimeout(() => clearInterval(checkPolySynth), 30000);
});

// Create React root and render the App
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
