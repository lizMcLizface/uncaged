import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import $ from 'jquery';
import { metronome, reset } from './metronome';
import {processChord} from './intervals';
import {HeptatonicScales, scales, getScaleNotes, highlightKeysForScales} from './scales';
import {createHeptatonicScaleTable, selectedRootNote, selectedScales, navigateToNextScale, navigateToPreviousScale, navigateToNextRootNote, navigateToPreviousRootNote, refreshChordsForRootNote, getPrimaryScale, getPrimaryRootNote} from './scaleGenerator';
import {chords, processedChords, highlightKeysForChords, createChordRootNoteTable, createChordSuffixTable, selectedChordRootNote, selectedChordSuffixes, createChordButtonGrid} from './chords';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput} from './midi';
import {createScaleChordCrossReference, updateCrossReferenceDisplay} from './cross';
import {modifiers, keyToNote} from './keyboard';
import {initializeFretboard, getFretboard, showChordOnFretboard, showScaleOnFretboard, currentDisplayedChord} from './frets';
import './staves'; // Import stave functions - functions will be available on window object
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
    tempo} from './synth';
import { chord_progressions } from './progressions';
import PolySynthWrapper from './components/PolySynthWrapper';
import IntervalPractice from './components/IntervalPractice';
import ThemeManagerApp from './components/ThemeManagerApp';
import { ThemeProvider } from './contexts/ThemeContext';
import { ThemeProvider as StyledThemeProvider } from 'styled-components';
import { useTheme } from './contexts/ThemeContext';
import { THEMES } from './styles/themes';

let PolySynthTabPlaceholder = document.getElementById('PolySynthTabPlaceholder');
let IntervalTabPlaceholder = document.getElementById('IntervalTabPlaceholder');

// Global reference to the PolySynth for programmatic control
let polySynthRef = null;
const polySynthComponentRef = React.createRef();

// Make polySynthRef globally accessible
window.polySynthRef = null;

// Make chord mode handling globally accessible
window.handleChordModeInput = handleChordModeInput;

// Centralized chord mode handling function
function handleChordModeInput(noteName, velocity, isNoteOn) {
    if (!polySynthRef || !$('#polySynthMidiBox') || !$('#polySynthMidiBox')[0].checked) {
        return false; // Chord mode not active or PolySynth not available
    }
    
    console.log('🎹 Chord mode input handling for:', noteName, 'velocity:', velocity, 'isNoteOn:', isNoteOn);
    
    // Get chord mode state
    const chordModeState = polySynthRef.getChordModeState ? polySynthRef.getChordModeState() : null;
    console.log('🔍 Chord mode state:', chordModeState);
    
    if (!chordModeState) {
        return false; // No chord mode state available
    }
    
    if (isNoteOn) {
        // Note on handling
        if (chordModeState.isCapturing) {
            // If capturing, consume the input without playing sound
            const currentNotes = Object.keys(noteArray).map(n => convertNoteNameToPolySynthFormat(n)).filter(n => n);
            console.log('🎹 Key down in capture mode, current notes:', currentNotes);
            polySynthRef.handleChordCapture(currentNotes);
            return true; // Input consumed by chord mode
        } else if (chordModeState.transpose && chordModeState.capturedChord.length > 0) {
            // If transpose mode is active and we have a captured chord, transpose and play it via arpeggiator
            console.log('🎵 Transpose conditions met:', {
                transpose: chordModeState.transpose,
                capturedChordLength: chordModeState.capturedChord.length,
                capturedChord: chordModeState.capturedChord
            });
            const noteWithOctave = convertNoteNameToPolySynthFormat(noteName);
            if (noteWithOctave) {
                console.log('🎵 Triggering arpeggiator transpose with note:', noteWithOctave);
                
                // Use the arpeggiator's transpose function
                if (polySynthRef.handleArpeggiatorTranspose) {
                    polySynthRef.handleArpeggiatorTranspose(noteWithOctave);
                    return true; // Input consumed by chord mode
                } else {
                    // Fallback to original behavior if arpeggiator not available
                    const transposedChord = polySynthRef.transposeChord(noteWithOctave);
                    if (transposedChord.length > 0) {
                        const volume = Math.round((velocity / 100) * 100);
                        console.log('🔊 Playing transposed chord:', transposedChord, 'at volume:', volume);
                        playNote2(transposedChord, volume);
                        return true; // Input consumed by chord mode
                    }
                }
            }
        }
    } else {
        // Note off handling
        if (chordModeState.isCapturing) {
            // If capturing, update the capture with current notes
            const currentNotes = Object.keys(noteArray).map(n => convertNoteNameToPolySynthFormat(n)).filter(n => n);
            console.log('🎹 Key up in capture mode, remaining notes:', currentNotes);
            polySynthRef.handleChordCapture(currentNotes);
            return true; // Input consumed by chord mode
        } else if (chordModeState.transpose && chordModeState.capturedChord.length > 0) {
            // If transpose mode is active, handle note off 
            const noteWithOctave = convertNoteNameToPolySynthFormat(noteName);
            if (noteWithOctave) {
                console.log('🔇 Note off in transpose mode for note:', noteWithOctave);
                
                // Check if arpeggiator is playing
                const arpeggiatorState = polySynthRef.getArpeggiatorState?.();
                if (!arpeggiatorState?.playing) {
                    // If arpeggiator is not playing, stop the transposed notes
                    // This allows notes to be held for key duration instead of arpeggiator duration
                    if (polySynthRef.stopTransposedNotes) {
                        polySynthRef.stopTransposedNotes();
                    }
                }
                return true; // Input consumed by chord mode
            }
        }
    }
    
    return false; // Input not consumed by chord mode, handle normally
}

// IntervalPractice wrapper component with styled-components theming
const IntervalPracticeWithTheme = () => {
    const { theme, themes } = useTheme();
    
    return (
        <StyledThemeProvider theme={themes[theme]}>
            <IntervalPractice />
        </StyledThemeProvider>
    );
};

// Comment out the main React app since this is a hybrid HTML/React application
// The main interface is in the HTML file, and React components are embedded in specific divs
// However, we'll render a minimal theme manager for global theming
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// Render PolySynth component into the PolySynthTabPlaceholder div
// This needs to be wrapped in the same ThemeProvider to enable theming
if (PolySynthTabPlaceholder) {
    const polySynthRoot = ReactDOM.createRoot(PolySynthTabPlaceholder);
    polySynthRoot.render(
        <ThemeProvider>
            {React.createElement(PolySynthWrapper, { ref: polySynthComponentRef })}
        </ThemeProvider>
    );
    
    // Set up the ref after a short delay to ensure component is mounted
    setTimeout(() => {
        polySynthRef = polySynthComponentRef.current;
        window.polySynthRef = polySynthRef; // Make globally accessible
        if (polySynthRef) {
            console.log('PolySynth ready for programmatic control');
            // Initialize mouse input for piano keys now that PolySynth is ready
            initializeMouseInput(playNote2, stopNotes2);
            console.log('Mouse input initialized for piano keys');
        }
    }, 1000);
}

// Render IntervalPractice component into the IntervalTabPlaceholder div
if (IntervalTabPlaceholder) {
    const intervalPracticeRoot = ReactDOM.createRoot(IntervalTabPlaceholder);
    intervalPracticeRoot.render(
        <ThemeProvider>
            <IntervalPracticeWithTheme />
        </ThemeProvider>
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();


// console.log(processChord('Cmaj7'));

window.$ = window.jQuery = require('jquery');


createHeptatonicScaleTable();

// Initialize chord cache for default selected scales
refreshChordsForRootNote();

let firstScaleId = selectedScales[0];
let [family, mode] = firstScaleId.split('-');
let intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
let scaleNotes = getScaleNotes(selectedRootNote[0], intervals);
// console.log("Scale Notes for", scaleName, ":", scaleNotes);
highlightKeysForScales(scaleNotes);

// Initialize the chord root note table
createChordRootNoteTable();
// Initialize the chord suffix table
createChordSuffixTable();

highlightKeysForChords(processChord(selectedChordRootNote + selectedChordSuffixes[0])['notes']);




// Initialize the cross-reference display
updateCrossReferenceDisplay();

// Export the update function so other modules can call it when selections change
window.updateCrossReferenceDisplay = updateCrossReferenceDisplay;
window.createScaleChordCrossReference = createScaleChordCrossReference;

// Export scale and fretboard functions for chord button grid
window.getPrimaryScale = getPrimaryScale;
window.getPrimaryRootNote = getPrimaryRootNote;
window.getScaleNotes = getScaleNotes;
window.HeptatonicScales = HeptatonicScales;
window.getFretboard = getFretboard;
window.showChordOnFretboard = showChordOnFretboard;
window.showScaleOnFretboard = showScaleOnFretboard;
window.currentDisplayedChord = currentDisplayedChord;


// Initialize Interval Practice Interface - now handled by React component
// initializeIntervalPractice();

let currentNoteIndex = 0;
let currentBarIndex = 0;
// isPlaying is now a global variable - window.isPlaying

// Second highlight system variables
let selectedNoteIndex = 0;
let selectedBarIndex = 0;

// Make playback variables globally accessible
window.currentNoteIndex = currentNoteIndex;
window.currentBarIndex = currentBarIndex;

// Make selection variables globally accessible
window.selectedNoteIndex = selectedNoteIndex;
window.selectedBarIndex = selectedBarIndex;



// const information = document.getElementById('info')
// information.innerText = `This app is using Chrome (v${process.versions.chrome()}), Node.js (v${process.versions.node()}), and Electron (v${process.versions.electron()})`

const { Vex,  Formatter, Renderer, Stave, Accidental, StaveNote, BarNote, Beam, Dot, StaveConnector, Voice, GhostNote } = require("vexflow");
// const { Factory } = Vex.Flow;



if (navigator.requestMIDIAccess) {
    console.log('Browser supports MIDI!');
}

if (navigator.requestMIDIAccess) {
    // console.log('Browser still supports MIDI!');
    navigator.requestMIDIAccess()
        .then(success, failure);
}

function listInputsAndOutputs(midiAccess) {
    for (const entry of midiAccess.inputs) {
      const input = entry[1];
      console.log(`Input port [type:'${input.type}']` +
        ` id:'${input.id}'` +
        ` manufacturer:'${input.manufacturer}'` +
        ` name:'${input.name}'` + 
        ` version:'${input.version}'`);
    }
  
    for (const entry of midiAccess.outputs) {
      const output = entry[1];
      console.log(`Output port [type:'${output.type}'] id:'${output.id}' manufacturer:'${output.manufacturer}' name:'${output.name}' version:'${output.version}'`);
    }
  }

function success (midi) {
    // console.log('Got midi!', midi);

    listInputsAndOutputs(midi);
    var inputs = midi.inputs.values();
    for (var input = inputs.next();
         input && !input.done;
         input = inputs.next()) {
        // each time there is a midi message call the onMIDIMessage function 
        input.value.onmidimessage = onMIDIMessage;
    }
}
function failure () {
    console.error('No access to your midi devices.')
}



let noteArray = {};
// let outputNoteArray = [];//[["e/4","d/4","d/5"],"e##/5","b/4","c/4","D/2","e/4","g/4","a/4","g/4","d/4"];
// let outputNoteArray = [{"e#/5":50}, {"e#/5":50,"b/4":50,"c/4":50,"D/2":50}];

var keySignature = 'C';
var selectedNote = 0;
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  
$(document).ready(function() {
    $('#modeSignatureSelect').on('change', function (e) {
        var currentValue = $(this).val();
        var keyValue = $('#keySignatureSelect').val();
        var majorOptions = `
        <option value="0">Gb</option>
        <option value="1">Db</option>
        <option value="2">Ab</option>
        <option value="3">Eb</option>
        <option value="4">Bb</option>
        <option value="5">F</option>
        <option value="6" selected>C</option>
        <option value="7">G</option>
        <option value="8">D</option>
        <option value="9">A</option>
        <option value="10">E</option>
        <option value="11">B</option>
        <option value="12">F#</option>
        `;
        var minorOptions = `
        <option value="0">eb</option>
        <option value="1">bb</option>
        <option value="2">f</option>
        <option value="3">c</option>
        <option value="4">g</option>
        <option value="5">d</option>
        <option value="6" selected>a</option>
        <option value="7">e</option>
        <option value="8">b</option>
        <option value="9">f#</option>
        <option value="10">c#</option>
        <option value="11">g#</option>
        <option value="12">d#</option>
        `;
        console.log(currentValue);
        $("#keySignatureSelect").html(currentValue == 0 ? majorOptions : minorOptions);
        $("#keySignatureSelect").val(keyValue);
        // $("#keySignatureSelect").element.dispatchEvent(new Event('change'))
        var key = $('#keySignatureSelect').find(':selected')[0].innerHTML;
        var signature = $('#modeSignatureSelect').find(':selected')[0].innerHTML;

        // key[0] = key[0].toUpperCase();
        key = capitalizeFirstLetter(key);
        if(signature == "Minor")
            key = key + 'm';

        keySignature = key;

        drawNotes(inputDiv, noteArray, true);
        drawNotes(outputDiv, outputNoteArray, false);
    });
});

// $('#keySignatureSelect').on('change', function (e) {
//     var key = $('#keySignatureSelect').find(':selected')[0].innerHTML;
//     var signature = $('#modeSignatureSelect').find(':selected')[0].innerHTML;

//     // key[0] = key[0].toUpperCase();
//     key = capitalizeFirstLetter(key);
//     if(signature == "Minor")
//         key = key + 'm';

//     keySignature = key;

//     drawNotes(inputDiv, noteArray, true);
//     drawNotes(outputDiv, outputNoteArray, false);
// });

const inputDiv = document.getElementById("input");
const outputDiv = document.getElementById("output");

// Make DOM elements globally accessible for staves.js module
window.outputDiv = outputDiv;
window.inputDiv = inputDiv;

// var currentHighlight = []
// function highlightNotes(noteArray){
//     for( var key of currentHighlight){
//         var midi = noteToMidi(key) + 12;
//         // if (midi < parseInt($('#lowestNoteSelection').val()) || midi > parseInt($('#highestNoteSelection').val())) continue;
//         keys[midi].element.classList.remove('highlightedKey');
//     }
//     currentHighlight = [];
//     if(Array.isArray(noteArray)){
//         for(var key of noteArray){
//             if ($('#yoloMode')[0] && $('#yoloMode')[0].checked) {
//                 var moduloKey = noteToMidi(key) % 12;
//                 console.log('moduloKey:', moduloKey, 'key:', key);
//                 for(var octave = 0; octave < 8; ++octave){
//                     var midi = moduloKey + 12 + (octave * 12);
//                     if (midi < parseInt($('#lowestNoteSelection').val()) || midi > parseInt($('#highestNoteSelection').val())) continue;
//                     keys[midi].element.classList.add('highlightedKey');
//                     currentHighlight.push(noteToName(midi));
//                 }
//             }
//             else{
//                 var midi = noteToMidi(key) + 12;
//                 // console.log('key: ', key, ' midi note:', midi);
//                 // console.log(keys[midi])
//                 keys[midi].element.classList.add('highlightedKey');;
//                 currentHighlight.push(key);
//             }
//         }
//     }else{
//         var midi = noteToMidi(noteArray) + 12;
//         keys[midi].element.classList.add('highlightedKey');;   
//         currentHighlight.push(noteArray);     
//     }
// }
// // highlightNotes(outputNoteArray[selectedNote])


// var currentScaleHighlight = []
// function highlightScaleNotes(noteArray){
//     for( var key of currentScaleHighlight){
//         var midi = noteToMidi(key) + 12;
//         keys[midi].element.classList.remove('scaleKey');
//     }
//     currentScaleHighlight = [];
//     if(Array.isArray(noteArray)){
//         for(var key of noteArray){
//             var midi = noteToMidi(key) + 12;
//             // console.log('key: ', key, ' midi note:', midi);
//             // console.log(keys[midi])
//             if(midi >=  parseInt($('#lowestNoteSelection').val()) && midi <=  parseInt($('#highestNoteSelection').val())){
//             keys[midi].element.classList.add('scaleKey');;
//             currentScaleHighlight.push(key);
//             }
//         }
//     }else{
//         var midi = noteToMidi(noteArray) + 12;
//         keys[midi].element.classList.add('scaleKey');;   
//         currentScaleHighlight.push(noteArray);     
//     }
// }


// ppp ~16 pp ~ 33 p ~ 49 mp ~ 64 mf ~ 80 f ~ 96 ff ~ 112 fff ~ 127
function setupStaves(div, divisions = 1){
    while (div.hasChildNodes()) {
        div.removeChild(div.lastChild);
    }

    const inputRenderer = new Renderer(div, Renderer.Backends.SVG);
    // console.log(inputDiv.offsetWidth)
    
    var inputDisplayWidth = div.offsetWidth
    // Configure the rendering context.
    inputRenderer.resize(inputDisplayWidth, 320);
    const inputContext = inputRenderer.getContext();
    // Create a stave of width 400 at position 10, 40 on the canvas.

    var maxWidth = inputDisplayWidth-100
    inputDisplayWidth = maxWidth;
    if(divisions == 0){
        const inputTrebleStave = new Stave(30, 80, maxWidth);
        const inputBassStave = new Stave(30, 160, maxWidth);
        // inputTrebleStave.addTimeSignature('3/8')
        inputTrebleStave.addClef("treble");
        inputBassStave.addClef("bass");

        inputTrebleStave.addKeySignature(keySignature);
        inputBassStave.addKeySignature(keySignature);

        // Connect it to the rendering context and draw!
        inputTrebleStave.setContext(inputContext).draw();
        inputBassStave.setContext(inputContext).draw();


        new StaveConnector(inputBassStave, inputTrebleStave)
        .setType('single')
        .setContext(inputContext)
        .draw();

        new StaveConnector(inputTrebleStave, inputBassStave)
        .setType('brace')
        .setContext(inputContext)
        .draw();

        return {inputRenderer, inputContext, inputDisplayWidth, inputTrebleStave, inputBassStave}
    }
    else{
        var divWidth = maxWidth / divisions
        var trebleStaves = [];
        var bassStaves = [];
        
        trebleStaves.push(new Stave(30,80,divWidth));
        bassStaves.push(new Stave(30,160,divWidth));

        trebleStaves[0].addClef("treble");
        bassStaves[0].addClef("bass");

        trebleStaves[0].addKeySignature(keySignature);
        bassStaves[0].addKeySignature(keySignature);


        for(var i = 1; i < divisions; ++i){
            trebleStaves.push(new Stave(trebleStaves[i-1].width + trebleStaves[i-1].x,80,divWidth));
            bassStaves.push(new Stave(bassStaves[i-1].width + bassStaves[i-1].x,160,divWidth));
        }
            
        for(var stave of trebleStaves)
            stave.setContext(inputContext).draw();
        for(var stave of bassStaves)
            stave.setContext(inputContext).draw();


        new StaveConnector(bassStaves[0], trebleStaves[0])
        .setType('single')
        .setContext(inputContext)
        .draw();

        new StaveConnector(trebleStaves[0], bassStaves[0])
        .setType('brace')
        .setContext(inputContext)
        .draw();
// console.log('treble Staves', trebleStaves)
        inputDisplayWidth = divWidth;
        return {inputRenderer, inputContext, inputDisplayWidth, trebleStaves, bassStaves}
    }

}

function drawIndividualNotes(noteArray, inputContext, inputTrebleStave, inputBassStave){
    var trebleNotes = [];
    var trebleAccidentals = [];
    var bassNotes = [];
    var bassAccidentals = [];
    if(noteArray.constructor == Object){
    for (const [key, value] of Object.entries(noteArray)) {
        // console.log(`${key}: ${value}`);
        if(parseInt(key.slice(-1)) >= 4){
            trebleNotes.push(key);
            // trebleAccidentals.push(key.includes('#') ? '#' : 'n');
        }
        else{
            bassNotes.push(key);
            // bassAccidentals.push(key.includes('#') ? '#' : 'n');

        }
      }
    }
    else{
        for (const key of noteArray) {
            if(parseInt(key.slice(-1)) >= 4){
                trebleNotes.push(key);
                // trebleAccidentals.push(key.includes('#') ? '#' : 'n');
            }
            else{
                bassNotes.push(key);
                // bassAccidentals.push(key.includes('#') ? '#' : 'n');

            }
          }
    }
    if(trebleNotes.length > 0){
      const sNote =  new StaveNote({keys: trebleNotes, duration:'4'});
      var i = 0;
      for( const accidental of trebleAccidentals){
          // console.log(accidental)
          // if(accidental != 'n')
              // sNote.addModifier(new Accidental(accidental), i++);
      }

      const notes =[ sNote];
      const voice = new Voice({ num_beats: 1, beat_value: 4 });
      voice.addTickables(notes);
      Accidental.applyAccidentals([voice], keySignature);

      // Format and justify the notes to 400 pixels.
      new Formatter().joinVoices([voice]).format([voice], 350);
      
      // Render voice
      // voice.draw(inputContext, inputTrebleStave);
      Formatter.FormatAndDraw(inputContext, inputTrebleStave, notes);
  }
  if(bassNotes.length > 0){
      const sNote =  new StaveNote({clef: "bass", keys: bassNotes, duration:'4'});
      var i = 0;
      for( const accidental of bassAccidentals){
          // console.log(accidental)
          // if(accidental != 'n')
              // sNote.addModifier(new Accidental(accidental), i++);
      }

      const notes =[ sNote];
      const voice = new Voice({ num_beats: 1, beat_value: 4 });
      voice.addTickables(notes);
      Accidental.applyAccidentals([voice], keySignature);
      
      // Format and justify the notes to 400 pixels.
      new Formatter().joinVoices([voice]).format([voice], 350);

      // Render voice
      // voice.draw(inputContext, inputBassStave);
      Formatter.FormatAndDraw(inputContext, inputBassStave, notes);
  }
    
}

function drawNotes(div, noteArray, stacked = false){
    // console.log('Current Note State:', noteArray);

    var noteString = [];
    for (const [key, value] of Object.entries(noteArray)) {
        // console.log(`${key}: ${value}`);
        noteString.push(key);
      }
    // console.log('note string', noteString);
    // document.getElementById("inputText").innerHTML = 'You have pressed: ' + noteString.join(',');
    var {inputRenderer, inputContext, inputDisplayWidth, inputTrebleStave, inputBassStave, trebleStaves, bassStaves} = 
        setupStaves(div, Array.isArray(noteArray) ? noteArray.length : 0);
    
    
    if(noteArray.constructor == Object){
        drawIndividualNotes(noteArray, inputContext, inputTrebleStave, inputBassStave);
        return;
    }

    // console.log(inputTrebleStave)
    if(!($('#chordCheckBox')[0].checked && $('#arpegioButton')[0].checked)){
        for( const [key, value] of Object.entries(noteArray)){
            // console.log('key value pair: ', key, value);
            var trebleNotes = [];
            var bassNotes = [];
            for(const note of value.notes){        
                // console.log('note:', note)    
                if(!Array.isArray(note)){
                    if(parseInt(note.slice(-1)) >= 4){
                        // console.log(key);
                        trebleNotes.push(new StaveNote({keys:[note], duration:'4'}));
                        bassNotes.push(new StaveNote({keys:['b/4'], duration:'qr'}));
                        // trebleNotes.push(key);
                        // trebleAccidentals.push(key.includes('#') ? '#' : 'n');
                    }
                    else{
                        // console.log(key);
                        bassNotes.push(new StaveNote({clef: "bass",keys:[note], duration:'4'}));
                        trebleNotes.push(new StaveNote({keys:['b/4'], duration:'qr'}));
                        // bassNotes.push(key);
                        // bassAccidentals.push(key.includes('#') ? '#' : 'n');
        
                    }
                }else{
                    // console.log(note)
                    var localTrebleNotes = []
                    var localBassNotes = []
                    for (const k of note) {
                        if(parseInt(k.slice(-1)) >= 4){
                            localTrebleNotes.push(k);
                            // trebleAccidentals.push(key.includes('#') ? '#' : 'n');
                        }
                        else{
                            localBassNotes.push(k);
                            // bassAccidentals.push(key.includes('#') ? '#' : 'n');
            
                        }
                    }
                    //   console.log('split: ', localTrebleNotes, localBassNotes)
                    if(localTrebleNotes.length > 0)
                        trebleNotes.push(new StaveNote({keys:localTrebleNotes, duration:'4'}));
                    else
                        trebleNotes.push(new StaveNote({keys:['b/4'], duration:'qr'}));
                    if(localBassNotes.length > 0)
                    bassNotes.push(new StaveNote({clef: "bass",keys:localBassNotes, duration:'4'}));
                    else
                    bassNotes.push(new StaveNote({keys:['b/4'], duration:'qr'}));

                }
            }
            // console.log('treble notes:', trebleNotes)
            // console.log('bass notes:', bassNotes)if(key == currentBarIndex)
            if(key == currentBarIndex){
                if(trebleNotes.length > currentNoteIndex){
                trebleNotes[currentNoteIndex].setStyle({fillStyle: "red", strokeStyle: "red"});
                bassNotes[currentNoteIndex].setStyle({fillStyle: "red", strokeStyle: "red"});
                }
            }
            if(key == 0){
                if(trebleNotes.length > selectedNote){
                trebleNotes[selectedNote].setStyle({fillStyle: "blue", strokeStyle: "blue"});
                bassNotes[selectedNote].setStyle({fillStyle: "blue", strokeStyle: "blue"});
                }
            }

            const notes = trebleNotes;
            const voice = new Voice({ num_beats: trebleNotes.length, beat_value: 4 });

            voice.addTickables(notes);
            Accidental.applyAccidentals([voice], keySignature);
            
            var text = new Vex.Flow.TextNote({
                text: value.root + ' ' + value.scale + ' ' + value.dir,
                font: {
                    family: "Arial",
                    size: 12,
                    weight: ""
                },
                duration: 'q',
                y_shift:22
            })
            .setLine(10)
            .setStave(trebleStaves[key])
            // .setJustification(Vex.Flow.TextNote.Justification.CENTER);

            const textVoice = new Voice({ num_beats: trebleNotes.length, beat_value: 4 });

            var missingDuration = trebleNotes.length - 1;

            var textTicks = [text];
            while(missingDuration > 0){
                if(missingDuration >= 4){
                    textTicks.push(new GhostNote({duration:'w'}))
                    missingDuration -= 4;
                }
                else if(missingDuration >= 2){
                    textTicks.push(new GhostNote({duration:'h'}))
                    missingDuration -= 2;
                }
                else if(missingDuration >= 1){
                    textTicks.push(new GhostNote({duration:'q'}))
                    missingDuration -= 1;
                }
            }
            // for(var i = 0; i < missingDuration; ++i)
            //     textTicks.push(new GhostNote({duration:'q'}))

            textVoice.addTickables(textTicks);

            // Format and justify the notes to 400 pixels.
            const beams = Beam.generateBeams(notes);
            new Formatter().joinVoices([voice]).format([voice], inputDisplayWidth - (key == 0 ? 50 : 50));
            
            // Render voice
            // voice.draw(inputContext, inputTrebleStave);
            // voice.draw(inputContext, inputTrebleStave);

            // console.log(inputTrebleStave)
            // Formatter.FormatAndDraw(inputContext, trebleStaves[key], notes);
            voice.draw(inputContext, trebleStaves[key]);
            new Formatter().joinVoices([textVoice]).format([textVoice], inputDisplayWidth - (key == 0 ? 50 : 50));
            text.setContext(inputContext).draw();
            
            // Formatter.FormatAndDraw(inputContext, trebleStaves[key], voice);
            beams.forEach(function (b) {
                b.setContext(inputContext).draw();
            });
            const voice2 = new Voice({ num_beats: bassNotes.length, beat_value: 4 });

            voice2.addTickables(bassNotes);
            Accidental.applyAccidentals([voice2], keySignature);

            // Format and justify the notes to 400 pixels.
            new Formatter().joinVoices([voice2]).format([voice2], inputDisplayWidth - (key == 0 ? 50 : 50));
            
            // Render voice
            voice2.draw(inputContext, bassStaves[key]);
            // Formatter.FormatAndDraw(inputContext, bassStaves[key], bassNotes);
    // return;
        }
    }
    else{
        var chordLengths = {};
        chordLengths[1]  = ['4'];
        chordLengths[2]  = ['8','8'];
        chordLengths[3]  = ['8','16', '16'];
        chordLengths[4]  = ['16','16','16','16'];
        chordLengths[5]  = ['16','16','16','32','32'];
        chordLengths[6]  = ['16','16','32','32','32','32'];
        chordLengths[7]  = ['16','32','32','32','32','32','32'];
        chordLengths[8]  = ['32','32','32','32','32','32','32','32'];
        chordLengths[9]  = ['32','32','32','32','32','32','32','64','64'];
        chordLengths[10] = ['32','32','32','32','32','32','64','64','64','64'];
        // console.log(chordLengths)
        for( const [key, value] of Object.entries(noteArray)){
            // console.log('key value pair: ', key, value);
            var trebleNotes = [];
            var bassNotes = [];

            var numBeats = value['chorded'].length
            var addedNotes = 0;
            for(const chord of value['chorded']){
                var chordNotes = []
                for(const note of chord){
                    chordNotes.push(noteToMidi(note) + 12)
                }
                chordNotes.sort();
                var treble = false;
                if(chordNotes[0] >= 60)
                    treble = true;
                if(treble){
                    var isSelected = false;
                    var isPlaying = false;
                    for(var i = 0; i < chord.length; ++ i){
                        const note = chord[i];
                        trebleNotes.push(new StaveNote({keys:[note], duration:chordLengths[chord.length][i]}));  
                        if(addedNotes == currentNoteIndex && key == currentBarIndex){
                            isPlaying = true;
                            trebleNotes[trebleNotes.length-1].setStyle({fillStyle: "red", strokeStyle: "red"});
                        }                      
                        if(addedNotes++ == selectedNote && key == 0){
                            isSelected = true;
                            trebleNotes[trebleNotes.length-1].setStyle({fillStyle: "blue", strokeStyle: "blue"});
                        }                      
                    }
                    bassNotes.push(new StaveNote({keys:['b/4'], duration:'qr'}));
                    if(isPlaying){
                        bassNotes[bassNotes.length-1].setStyle({fillStyle: "red", strokeStyle: "red"});
                    }
                    if(isSelected){
                        bassNotes[bassNotes.length-1].setStyle({fillStyle: "blue", strokeStyle: "blue"});
                    }
                }else{                    
                    for(var i = 0; i < chord.length; ++ i){
                        const note = chord[i];
                        bassNotes.push(new StaveNote({clef: "bass",keys:[note], duration:chordLengths[chord.length][i]}));   
                        
                        if(addedNotes == currentNoteIndex && key == currentBarIndex){
                            isPlaying = true;
                            bassNotes[bassNotes.length-1].setStyle({fillStyle: "red", strokeStyle: "red"});
                        }                      
                        if(addedNotes++ == selectedNote && key == 0){
                            isSelected = true;
                            bassNotes[bassNotes.length-1].setStyle({fillStyle: "blue", strokeStyle: "blue"});
                        }                                           
                    }
                    trebleNotes.push(new StaveNote({keys:['b/4'], duration:'qr'}));
                    if(isPlaying){
                        trebleNotes[trebleNotes.length-1].setStyle({fillStyle: "red", strokeStyle: "red"});
                    }
                    if(isSelected){
                        trebleNotes[trebleNotes.length-1].setStyle({fillStyle: "blue", strokeStyle: "blue"});
                    }
                }

            }

            // if(key == 0){
            //     if(trebleNotes.length > selectedNote){
            //     trebleNotes[selectedNote].setStyle({fillStyle: "blue", strokeStyle: "blue"});
            //     bassNotes[selectedNote].setStyle({fillStyle: "blue", strokeStyle: "blue"});
            //     }
            // }
            const notes = trebleNotes;
            // console.log('numBeats:', numBeats)
            // console.log('treblenotes:', trebleNotes.length)
            // console.log('bassnotes:', bassNotes.length)

            const voice = new Voice({ num_beats: numBeats, beat_value: 4 });
            const voice2 = new Voice({ num_beats: numBeats, beat_value: 4 });

            voice.addTickables(trebleNotes);
            voice2.addTickables(bassNotes);
            Accidental.applyAccidentals([voice], keySignature);
            Accidental.applyAccidentals([voice2], keySignature);
            
            var text = new Vex.Flow.TextNote({
                text: value.root + ' ' + value.scale + ' ' + value.dir,
                font: {
                    family: "Arial",
                    size: 12,
                    weight: ""
                },
                duration: 'q',
                y_shift:22
            })
            .setLine(10)
            .setStave(trebleStaves[key])
            const textVoice = new Voice({ num_beats: numBeats, beat_value: 4 });
            var missingDuration = numBeats - 1;
            var textTicks = [text];
            while(missingDuration > 0){
                if(missingDuration >= 4){
                    textTicks.push(new GhostNote({duration:'w'}))
                    missingDuration -= 4;
                }
                else if(missingDuration >= 2){
                    textTicks.push(new GhostNote({duration:'h'}))
                    missingDuration -= 2;
                }
                else if(missingDuration >= 1){
                    textTicks.push(new GhostNote({duration:'q'}))
                    missingDuration -= 1;
                }
            }
            textVoice.addTickables(textTicks);
            new Formatter().joinVoices([textVoice]).format([textVoice], inputDisplayWidth - (key == 0 ? 50 : 50));
            text.setContext(inputContext).draw();

            new Formatter().joinVoices([voice, voice2]).format([voice, voice2], inputDisplayWidth - (key == 0 ? 50 : 50));

            const beams = Beam.generateBeams(notes);
            voice.draw(inputContext, trebleStaves[key]);
            beams.forEach(function (b) {
                b.setContext(inputContext).draw();
            });
            const beams2 = Beam.generateBeams(bassNotes);
            voice2.draw(inputContext, bassStaves[key]);
            beams2.forEach(function (b) {
                b.setContext(inputContext).draw();
            });




            // new Formatter().joinVoices([voice2]).format([voice2], inputDisplayWidth - (key == 0 ? 50 : 50));
        }        
    }


    return;
}




drawNotes(inputDiv, noteArray, true);


// Format should be like this:
// Output Note Array: [[Treble Notes], [Bass Notes]]
// Treble Notes: [[bar1], [bar2], ...]
// Bass Notes: [[bar1], [bar2], ...]
// barn: [{"note": "C/4", "duration": "4"}, {"note": "D/4", "duration": "4"}, {"note": "Pause", "duration": "4"}]
// Example:
var outputNoteArray = [
    [ //treble notes
        [{"note": "C/4", "duration": "4"}, {"note": ["D/3"], "duration": "4"}, {"note": ["E/3"], "duration": "4"}, {"note": "F/3", "duration": "4"}], // bar 1
        [{"note": "G/4", "duration": "4"}, {"note": "A/3", "duration": "4"}, {"note": "B/3", "duration": "4"}, {"note": "C/4", "duration": "4"}], // bar 2
        [{"note": ["D/5"], "duration": "4"}, {"note": ["E/4"], "duration": "4"}, {"note": "F/4", "duration": "4"}], // bar 1
        [{"note": "G/5", "duration": "8"}, {"note": "A/4", "duration": "4"}, {"note": "B/4", "duration": "4"}, {"note": "C/6", "duration": "4"}]
    ],
    [ //bass notes
        [{"note": "C/3", "duration": "4"}, {"note": ["D/3"], "duration": "4"}, {"note": ["E/3"], "duration": "4"}, {"note": "F/3", "duration": "4"}], // bar 1
        [{"note": "G/3", "duration": "4"}, {"note": "A/3", "duration": "4"}, {"note": "B/3", "duration": "4"}, {"note": "C/4", "duration": "4"}], // bar 2
        [{"note": ["D/4"], "duration": "4"}, {"note": ["E/4"], "duration": "4"}, {"note": "F/4", "duration": "4"}], // bar 1
        [{"note": "G/4", "duration": "4"}, {"note": "A/4", "duration": "4"}, {"note": "B/4", "duration": "4"}, {"note": "C/5", "duration": "4"}]
    ]
];

// Make variables globally accessible for staves.js module
window.outputNoteArray = outputNoteArray;
window.noteArray = noteArray; // Make noteArray globally accessible for chord mode
window.drawNotes2 = drawNotes2;
window.isPlaying = false; // Will be updated by playback functions
window.resetPlaybackPosition = resetPlaybackPosition;

// Make selection functions globally accessible
window.highlightSelectedNotesSecondary = highlightSelectedNotesSecondary;
window.highlightBothPositions = highlightBothPositions;
window.getSelectedNotes = getSelectedNotes;
window.getPlaybackNotes = getPlaybackNotes;
window.setSelectedPosition = setSelectedPosition;
window.advanceSelectedPosition = advanceSelectedPosition;
window.retreatSelectedPosition = retreatSelectedPosition;
window.resetSelectedPosition = resetSelectedPosition;
window.resetBothPositions = resetBothPositions;
window.getSelectionStatus = getSelectionStatus;
window.getCompleteStatus = getCompleteStatus;
window.updateOutputText = updateOutputText;
window.initializeSelectionSystem = initializeSelectionSystem;

// Global variable to store grid-aligned note data (accessible from other JS files)
window.gridData = drawNotes2(outputDiv, outputNoteArray, false);
// console.log('Grid-aligned notes:', window.gridData);

// Initialize the selection system to highlight first note and update outputText
initializeSelectionSystem();

// Example usage of highlighting function:
// Highlight the first beat of the first bar in red and second beat of second bar in blue
/*
const highlightExamples = [
    { barIndex: 0, beatIndex: 0, color: 'red' },    // First beat of first bar
    { barIndex: 1, beatIndex: 1, color: 'blue' },   // Second beat of second bar
    { barIndex: 2, beatIndex: 2, color: 'green' }   // Third beat of third bar
];
highlightNotesInNotation(outputDiv, outputNoteArray, highlightExamples);
*/

// Example usage of addDrawNotes function (functions now work with global state):
/*
// Add new bars to existing notation - no return value, updates window.gridData directly
const newBars = [
    [ // Treble bars to add
        [{"note": "E/5", "duration": "4"}, {"note": "F/5", "duration": "4"}], // New bar 5
        [{"note": "G/5", "duration": "2"}, {"note": "A/5", "duration": "2"}]  // New bar 6
    ],
    [ // Bass bars to add  
        [{"note": "E/3", "duration": "4"}, {"note": "F/3", "duration": "4"}], // New bar 5
        [{"note": "G/3", "duration": "2"}, {"note": "A/3", "duration": "2"}]  // New bar 6
    ]
];
addDrawNotes(outputDiv, newBars); // Updates window.gridData automatically

// Or add a single bar
addSingleBar(outputDiv, 
    [{"note": "C/5", "duration": "4"}, {"note": "D/5", "duration": "4"}], // Treble notes
    [{"note": "C/2", "duration": "4"}, {"note": "D/2", "duration": "4"}]  // Bass notes
);

// Remove the last bar (useful for undo functionality)
removeLastBar(outputDiv); // Removes last bar and updates window.gridData

// Clear all notation and start fresh
clearAllNotation(outputDiv); // Resets window.gridData to empty array

// Access grid data from anywhere: console.log(window.gridData);
*/

// Test the addDrawNotes functionality (uncomment to test):
/*
// Wait a moment, then add some bars
setTimeout(() => {
    console.log('Adding test bars...');
    const testBars = [
        [ // Treble bars to add
            [{"note": "E/5", "duration": "4"}, {"note": "F/5", "duration": "4"}], // Test bar 1
        ],
        [ // Bass bars to add  
            [{"note": "E/3", "duration": "4"}, {"note": "F/3", "duration": "4"}], // Test bar 1
        ]
    ];
    addDrawNotes(outputDiv, testBars);
    console.log('Updated grid data:', window.gridData); // Check the global state
}, 2000);
*/

// highlightPlaybackPosition(1, 1)

// Helper function to highlight current playback position
function highlightPlaybackPosition(barIndex, beatIndex) {
    const highlight = { barIndex: barIndex, beatIndex: beatIndex, color: 'red' };
    highlightNotesInNotation(outputDiv, window.outputNoteArray, highlight);
}

// Helper function to highlight selected notes
function highlightSelectedNotes(barIndex, beatIndex) {
    const highlight = { barIndex: barIndex, beatIndex: beatIndex, color: 'blue' };
    highlightNotesInNotation(outputDiv, window.outputNoteArray, highlight);
}

// Enhanced helper function to highlight selected notes with separate tracking
function highlightSelectedNotesSecondary(barIndex, beatIndex) {
    // console.log('Highlighting selected notes at Bar:', barIndex, 'Beat:', beatIndex);
    // Update the selected position
    selectedBarIndex = barIndex;
    selectedNoteIndex = beatIndex;
    
    // Update global versions
    window.selectedBarIndex = selectedBarIndex;
    window.selectedNoteIndex = selectedNoteIndex;
    
    const highlight = { barIndex: barIndex, beatIndex: beatIndex, color: 'green' };
    highlightNotesInNotation(outputDiv, window.outputNoteArray, highlight);
    
    // Update the outputText div with selected notes
    updateOutputText();
}

// Helper function to highlight both playback and selection positions simultaneously
function highlightBothPositions() {
    console.log('Highlighting both playback and selected positions');
    console.log('Current Playback Position - Bar:', currentBarIndex, 'Beat:', currentNoteIndex);
    console.log('Selected Position - Bar:', selectedBarIndex, 'Beat:', selectedNoteIndex);
    console.log('Output Note Array:', window.outputNoteArray);
    const highlights = [
        { barIndex: currentBarIndex, beatIndex: currentNoteIndex, color: 'red' },      // Playback position
        { barIndex: selectedBarIndex, beatIndex: selectedNoteIndex, color: 'green' }   // Selected position
    ];
    highlightNotesInNotation(outputDiv, window.outputNoteArray, highlights);
}

// Helper function to get notes at selected position
function getSelectedNotes() {
    if (!window.gridData || !window.gridData[selectedBarIndex]) {
        console.log('No grid data available or invalid bar index:', selectedBarIndex);
        return null;
    }
    
    const barData = window.gridData[selectedBarIndex];
    if (!barData.notes || !barData.notes[selectedNoteIndex]) {
        console.log('No notes available at selected position - Bar:', selectedBarIndex, 'Beat:', selectedNoteIndex);
        return null;
    }
    
    const selectedNoteData = barData.notes[selectedNoteIndex];
    
    return {
        barIndex: selectedBarIndex,
        noteIndex: selectedNoteIndex,
        duration: selectedNoteData.duration,
        notes: selectedNoteData.notes || [],
        isPause: selectedNoteData.isPause || false
    };
}

// Helper function to update the outputText div with selected notes
function updateOutputText() {
    const selectedData = getSelectedNotes();
    
    if (!selectedData) {
        document.getElementById("outputText").innerHTML = 'You should press: (no notes available)';
        return;
    }
    
    if (selectedData.isPause) {
        document.getElementById("outputText").innerHTML = 'You should press: (pause/rest)';
        return;
    }
    
    const notes = selectedData.notes || [];
    if (notes.length === 0) {
        document.getElementById("outputText").innerHTML = 'You should press: (no notes)';
        return;
    }
    
    // Format the notes for display
    const notesList = notes.filter(note => note !== "Pause").join(', ');
    document.getElementById("outputText").innerHTML = `You should press: ${notesList}`;
}

// Helper function to initialize selection system
function initializeSelectionSystem() {
    // Default to first note of first bar
    selectedBarIndex = 0;
    selectedNoteIndex = 0;
    
    // Update global versions
    window.selectedBarIndex = selectedBarIndex;
    window.selectedNoteIndex = selectedNoteIndex;
    
    // Highlight the first note and update display
    highlightSelectedNotesSecondary(0, 0);
}

// Helper function to get notes at playback position
function getPlaybackNotes() {
    if (!window.gridData || !window.gridData[currentBarIndex]) {
        console.log('No grid data available or invalid bar index:', currentBarIndex);
        return null;
    }
    
    const barData = window.gridData[currentBarIndex];
    if (!barData.notes || !barData.notes[currentNoteIndex]) {
        console.log('No notes available at playback position - Bar:', currentBarIndex, 'Beat:', currentNoteIndex);
        return null;
    }
    
    const playbackNoteData = barData.notes[currentNoteIndex];
    
    return {
        barIndex: currentBarIndex,
        noteIndex: currentNoteIndex,
        duration: playbackNoteData.duration,
        notes: playbackNoteData.notes || [],
        isPause: playbackNoteData.isPause || false
    };
}

// Helper function to set selected position
function setSelectedPosition(barIndex, noteIndex) {
    selectedBarIndex = barIndex;
    selectedNoteIndex = noteIndex;
    
    // Update global versions
    window.selectedBarIndex = selectedBarIndex;
    window.selectedNoteIndex = selectedNoteIndex;
    
    // Update the output text
    updateOutputText();
    
    // console.log('Selected position set to - Bar:', selectedBarIndex, 'Beat:', selectedNoteIndex);
}

// Helper function to advance selected position
function advanceSelectedPosition() {
    if (!window.gridData || selectedBarIndex >= window.gridData.length) {
        console.log('Cannot advance - no grid data or at end');
        return false;
    }
    
    const currentBarData = window.gridData[selectedBarIndex];
    if (!currentBarData || !currentBarData.notes) {
        console.log('Cannot advance - invalid bar data');
        return false;
    }
    
    // Try to advance within current bar
    if (selectedNoteIndex + 1 < currentBarData.notes.length) {
        selectedNoteIndex++;
    } else {
        // Move to next bar
        if (selectedBarIndex + 1 < window.gridData.length) {
            selectedBarIndex++;
            selectedNoteIndex = 0;
        } else {
            // console.log('At end of notation');
            selectedBarIndex = 0;
            selectedNoteIndex = 0; // Reset to start if at end
            // return false;
        }
    }
    
    // Update global versions
    window.selectedBarIndex = selectedBarIndex;
    window.selectedNoteIndex = selectedNoteIndex;
    
    // Update the output text
    updateOutputText();
    
    // console.log('Selected position advanced to - Bar:', selectedBarIndex, 'Beat:', selectedNoteIndex);
    return true;
}

// Helper function to retreat selected position
function retreatSelectedPosition() {
    // Try to retreat within current bar
    if (selectedNoteIndex > 0) {
        selectedNoteIndex--;
    } else {
        // Move to previous bar
        if (selectedBarIndex > 0) {
            selectedBarIndex--;
            // Set to last note of previous bar
            if (window.gridData && window.gridData[selectedBarIndex] && window.gridData[selectedBarIndex].notes) {
                selectedNoteIndex = window.gridData[selectedBarIndex].notes.length - 1;
            } else {
                selectedNoteIndex = 0;
            }
        } else {
            // console.log('At beginning of notation');
            return false;
        }
    }
    
    // Update global versions
    window.selectedBarIndex = selectedBarIndex;
    window.selectedNoteIndex = selectedNoteIndex;
    
    // Update the output text
    updateOutputText();
    
    // console.log('Selected position retreated to - Bar:', selectedBarIndex, 'Beat:', selectedNoteIndex);
    return true;
}

// Helper function to clear highlighting (reset to black)
function clearNoteHighlighting() {
    window.gridData = drawNotes2(outputDiv, window.outputNoteArray, false);
}

// Helper function to highlight multiple positions with different colors
function highlightMultiplePositions(highlightArray) {
    // highlightArray format: [{ barIndex: 0, beatIndex: 1, color: 'red' }, ...]
    highlightNotesInNotation(outputDiv, window.outputNoteArray, highlightArray);
}

// Helper function to reset playback position
function resetPlaybackPosition() {
    currentBarIndex = 0;
    currentNoteIndex = 0;
    // Update global versions
    window.currentBarIndex = currentBarIndex;
    window.currentNoteIndex = currentNoteIndex;
    clearNoteHighlighting();
}

// Helper function to reset selected position
function resetSelectedPosition() {
    selectedBarIndex = 0;
    selectedNoteIndex = 0;
    // Update global versions
    window.selectedBarIndex = selectedBarIndex;
    window.selectedNoteIndex = selectedNoteIndex;
    
    // Update the output text
    updateOutputText();
    
    console.log('Selected position reset to - Bar: 0, Beat: 0');
}

// Helper function to reset both positions
function resetBothPositions() {
    resetPlaybackPosition();
    resetSelectedPosition();
}

// Helper function to get current playback status
function getPlaybackStatus() {
    return {
        isPlaying: window.isPlaying,
        currentBarIndex: currentBarIndex,
        currentNoteIndex: currentNoteIndex
    };
}

// Helper function to get current selection status
function getSelectionStatus() {
    return {
        selectedBarIndex: selectedBarIndex,
        selectedNoteIndex: selectedNoteIndex,
        selectedNotes: getSelectedNotes()
    };
}

// Helper function to get complete status
function getCompleteStatus() {
    return {
        playback: getPlaybackStatus(),
        selection: getSelectionStatus()
    };
}

function drawNotes2(div, noteArray, stacked = false){
    // console.log('Current Note State:', noteArray);

    // noteArray format: [[trebleNotes], [bassNotes]]
    // Each contains bars: [[bar1], [bar2], ...]
    // Each bar contains notes: [{"note": "C/4", "duration": "4"}, {"note": ["C/4", "E/4"], "duration": "4"}, ...]
    
    if (!noteArray || noteArray.length < 2) {
        console.log('Invalid noteArray format for drawNotes2');
        return;
    }

    const trebleNotes = noteArray[0];
    const bassNotes = noteArray[1];
    const numBars = Math.max(trebleNotes.length, bassNotes.length);

    var {inputRenderer, inputContext, inputDisplayWidth, inputTrebleStave, inputBassStave, trebleStaves, bassStaves} = 
        setupStaves(div, numBars);

    // Initialize the result structure to return
    const gridAlignedNotes = [];

    // Helper function to convert duration to beat value
    function getDurationValue(duration) {
        const isDotted = duration.includes('.');
        const baseDuration = duration.replace('.', '');
        
        let baseValue = baseDuration === 'w' ? 4 : 
                       baseDuration === 'h' ? 2 : 
                       baseDuration === 'q' || baseDuration === '4' ? 1 : 
                       baseDuration === '8' ? 0.5 : 
                       baseDuration === '16' ? 0.25 : 1;
        
        // Dotted notes are 1.5 times the base duration
        return isDotted ? baseValue * 1.5 : baseValue;
    }

    // Process each bar
    for (let barIndex = 0; barIndex < numBars; barIndex++) {
        const trebleBar = trebleNotes[barIndex] || [];
        const bassBar = bassNotes[barIndex] || [];
        
        // Create a temporal grid for this bar to handle different durations
        const temporalGrid = [];
        let currentTime = 0;
        
        // Calculate total bar duration by processing both clefs
        let trebleTime = 0;
        let bassTime = 0;
        
        // Process treble notes to get temporal positions
        const trebleEvents = [];
        trebleTime = 0;
        for (const noteObj of trebleBar) {
            const durationValue = getDurationValue(noteObj.duration);
            trebleEvents.push({
                startTime: trebleTime,
                endTime: trebleTime + durationValue,
                duration: noteObj.duration,
                durationValue: durationValue,
                note: noteObj.note,
                clef: 'treble'
            });
            trebleTime += durationValue;
        }
        
        // Process bass notes to get temporal positions
        const bassEvents = [];
        bassTime = 0;
        for (const noteObj of bassBar) {
            const durationValue = getDurationValue(noteObj.duration);
            bassEvents.push({
                startTime: bassTime,
                endTime: bassTime + durationValue,
                duration: noteObj.duration,
                durationValue: durationValue,
                note: noteObj.note,
                clef: 'bass'
            });
            bassTime += durationValue;
        }
        
        // Create a unified timeline by finding all unique time points
        const timePoints = new Set();
        timePoints.add(0);
        
        for (const event of trebleEvents) {
            timePoints.add(event.startTime);
            timePoints.add(event.endTime);
        }
        for (const event of bassEvents) {
            timePoints.add(event.startTime);
            timePoints.add(event.endTime);
        }
        
        const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);
        
        // Create grid entries based on note start times (not segments)
        // This ensures each note is only triggered once at its start time
        const barData = [];
        const trebleStaveNotes = [];
        const bassStaveNotes = [];
        
        // Get all unique start times for notes
        const noteStartTimes = new Set();
        for (const event of trebleEvents) {
            noteStartTimes.add(event.startTime);
        }
        for (const event of bassEvents) {
            noteStartTimes.add(event.startTime);
        }
        
        const sortedStartTimes = Array.from(noteStartTimes).sort((a, b) => a - b);
        
        // Create grid entries for each note start time
        // We need to create a temporal grid that properly handles notes with different durations
        // Instead of using shortest duration, we'll create entries at all unique time points
        for (const startTime of sortedStartTimes) {
            // Find notes that start at this time
            const trebleNotesAtTime = trebleEvents.filter(event => event.startTime === startTime);
            const bassNotesAtTime = bassEvents.filter(event => event.startTime === startTime);
            
            // Collect all notes that should play at this time
            const trebleNotesToPlay = [];
            const bassNotesToPlay = [];
            const simultaneousNotes = [];
            const trebleNotesDurations = [];
            const bassNotesDurations = [];
            let isPause = false;
            
            // Process treble notes starting at this time
            for (const event of trebleNotesAtTime) {
                if (event.note === "Pause") {
                    isPause = true;
                    simultaneousNotes.push("Pause");
                } else {
                    const notes = Array.isArray(event.note) ? event.note : [event.note];
                    for (let note of notes) {
                        simultaneousNotes.push(note);
                        const octave = parseInt(note.slice(-1));
                        if (octave >= 4) {
                            trebleNotesToPlay.push(note);
                            trebleNotesDurations.push(event.duration);
                        } else {
                            bassNotesToPlay.push(note);
                            bassNotesDurations.push(event.duration);
                        }
                    }
                }
            }
            
            // Process bass notes starting at this time
            for (const event of bassNotesAtTime) {
                if (event.note === "Pause") {
                    if (!isPause) {
                        isPause = true;
                        simultaneousNotes.push("Pause");
                    }
                } else {
                    const notes = Array.isArray(event.note) ? event.note : [event.note];
                    for (const note of notes) {
                        if (!simultaneousNotes.includes(note)) {
                            simultaneousNotes.push(note);
                        }
                        const octave = parseInt(note.slice(-1));
                        if (octave >= 4) {
                            if (!trebleNotesToPlay.includes(note)) {
                                trebleNotesToPlay.push(note);
                                trebleNotesDurations.push(event.duration);
                            }
                        } else {
                            if (!bassNotesToPlay.includes(note)) {
                                bassNotesToPlay.push(note);
                                bassNotesDurations.push(event.duration);
                            }
                        }
                    }
                }
            }
            
            // Calculate the duration until the next note starts
            // This ensures each grid entry lasts until something new happens
            const nextStartTimeIndex = sortedStartTimes.indexOf(startTime) + 1;
            let gridDuration;
            let gridDurationString;
            
            if (nextStartTimeIndex < sortedStartTimes.length) {
                // Duration until next note starts
                gridDuration = sortedStartTimes[nextStartTimeIndex] - startTime;
            } else {
                // Last note group - use shortest duration or standard quarter note
                const durationsAtThisTime = [...trebleNotesAtTime, ...bassNotesAtTime].map(e => e.durationValue);
                gridDuration = durationsAtThisTime.length > 0 ? Math.min(...durationsAtThisTime) : 1;
            }
            
            // Convert duration back to string representation
            if (gridDuration >= 4) gridDurationString = 'w';
            else if (gridDuration >= 2) gridDurationString = 'h';
            else if (gridDuration >= 1) gridDurationString = '4';
            else if (gridDuration >= 0.5) gridDurationString = '8';
            else gridDurationString = '16';
            
            // Add to grid data structure - each entry represents notes that start at this time
            barData.push({
                notes: simultaneousNotes,
                duration: gridDurationString,
                durationValue: gridDuration,
                isPause: isPause,
                timeStart: startTime,
                timeEnd: startTime + gridDuration,
                trebleNotes: trebleNotesToPlay,
                bassNotes: bassNotesToPlay,
                trebleDurations: trebleNotesDurations,
                bassDurations: bassNotesDurations
            });
        }
        
        // Now create the stave notes based on the original events (not segments)
        // We need to maintain the original note durations for proper rendering
        
        // Add treble notes
        for (const event of trebleEvents) {
            const notes = Array.isArray(event.note) ? event.note : [event.note];
            const trebleNotesToPlay = notes.filter(note => {
                if (note === "Pause") return false;
                const octave = parseInt(note.slice(-1));
                return octave >= 4;
            });
            
            const isDotted = event.duration.includes('.');
            const baseDuration = event.duration.replace('.', '');
            
            if (event.note === "Pause") {
                const note = new StaveNote({keys: ['b/4'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    trebleStaveNotes.push(note);
                    trebleStaveNotes.push(ghostNote);
                } else {
                    trebleStaveNotes.push(note);
                }
            } else if (trebleNotesToPlay.length > 0) {
                const note = new StaveNote({keys: trebleNotesToPlay, duration: baseDuration});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    trebleStaveNotes.push(note);
                    trebleStaveNotes.push(ghostNote);
                } else {
                    trebleStaveNotes.push(note);
                }
            } else {
                const note = new StaveNote({keys: ['b/4'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    trebleStaveNotes.push(note);
                    trebleStaveNotes.push(ghostNote);
                } else {
                    trebleStaveNotes.push(note);
                }
            }
        }
        
        // Add bass notes
        for (const event of bassEvents) {
            const notes = Array.isArray(event.note) ? event.note : [event.note];
            const bassNotesToPlay = notes.filter(note => {
                if (note === "Pause") return false;
                const octave = parseInt(note.slice(-1));
                return octave < 4;
            });
            
            const isDotted = event.duration.includes('.');
            const baseDuration = event.duration.replace('.', '');
            
            if (event.note === "Pause") {
                const note = new StaveNote({clef: "bass", keys: ['b/2'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    bassStaveNotes.push(note);
                    bassStaveNotes.push(ghostNote);
                } else {
                    bassStaveNotes.push(note);
                }
            } else if (bassNotesToPlay.length > 0) {
                const note = new StaveNote({clef: "bass", keys: bassNotesToPlay, duration: baseDuration});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    bassStaveNotes.push(note);
                    bassStaveNotes.push(ghostNote);
                } else {
                    bassStaveNotes.push(note);
                }
            } else {
                const note = new StaveNote({clef: "bass", keys: ['D/3'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    bassStaveNotes.push(note);
                    bassStaveNotes.push(ghostNote);
                } else {
                    bassStaveNotes.push(note);
                }
            }
        }
        
        // Calculate total beats for the bar (use the maximum of treble and bass)
        const totalBeats = Math.max(trebleTime, bassTime);

        console.log(`Bar ${barIndex + 1}: Treble Time = ${trebleTime}, Bass Time = ${bassTime}, Total Beats = ${totalBeats}`);
        console.log(`Treble Notes:`, trebleStaveNotes);
        console.log(`Bass Notes:`, bassStaveNotes);

        // Render treble staff for this bar
        if (trebleStaveNotes.length > 0) {
            const trebleVoice = new Voice({ num_beats: Math.max(trebleTime, 1), beat_value: 4 });
            trebleVoice.addTickables(trebleStaveNotes);
            Accidental.applyAccidentals([trebleVoice], keySignature);

            new Formatter().joinVoices([trebleVoice]).format([trebleVoice], inputDisplayWidth - 50);
            trebleVoice.draw(inputContext, trebleStaves[barIndex]);
        }

        // Render bass staff for this bar
        if (bassStaveNotes.length > 0) {
            const bassVoice = new Voice({ num_beats: Math.max(bassTime, 1), beat_value: 4 });
            bassVoice.addTickables(bassStaveNotes);
            Accidental.applyAccidentals([bassVoice], keySignature);

            new Formatter().joinVoices([bassVoice]).format([bassVoice], inputDisplayWidth - 50);
            bassVoice.draw(inputContext, bassStaves[barIndex]);
        }

        // Add this bar's data to the result
        gridAlignedNotes.push({
            barIndex: barIndex,
            totalBeats: totalBeats,
            notes: barData,
            trebleTime: trebleTime,
            bassTime: bassTime
        });
    }

    return gridAlignedNotes;
}

// Function to highlight specific notes in the notation based on bar and beat position
function highlightNotesInNotation(div, noteArray, highlightData = null) {
    // highlightData format: { barIndex: number, beatIndex: number, color: 'red'|'blue'|'black' }
    // or array of highlight objects: [{ barIndex: 0, beatIndex: 1, color: 'red' }, ...]
    
    if (!noteArray || noteArray.length < 2) {
        console.log('Invalid noteArray format for highlightNotesInNotation');
        return;
    }

    const trebleNotes = noteArray[0];
    const bassNotes = noteArray[1];
    const numBars = Math.max(trebleNotes.length, bassNotes.length);

    var {inputRenderer, inputContext, inputDisplayWidth, inputTrebleStave, inputBassStave, trebleStaves, bassStaves} = 
        setupStaves(div, numBars);

    // Initialize the result structure to return
    const gridAlignedNotes = [];

    // Helper function to convert duration to beat value
    function getDurationValue(duration) {
        const isDotted = duration.includes('.');
        const baseDuration = duration.replace('.', '');
        
        let baseValue = baseDuration === 'w' ? 4 : 
                       baseDuration === 'h' ? 2 : 
                       baseDuration === 'q' || baseDuration === '4' ? 1 : 
                       baseDuration === '8' ? 0.5 : 
                       baseDuration === '16' ? 0.25 : 1;
        
        // Dotted notes are 1.5 times the base duration
        return isDotted ? baseValue * 1.5 : baseValue;
    }

    // Process each bar
    for (let barIndex = 0; barIndex < numBars; barIndex++) {
        const trebleBar = trebleNotes[barIndex] || [];
        const bassBar = bassNotes[barIndex] || [];
        
        // Create a temporal grid for this bar to handle different durations
        let trebleTime = 0;
        let bassTime = 0;
        
        // Process treble notes to get temporal positions
        const trebleEvents = [];
        trebleTime = 0;
        for (const noteObj of trebleBar) {
            const durationValue = getDurationValue(noteObj.duration);
            trebleEvents.push({
                startTime: trebleTime,
                endTime: trebleTime + durationValue,
                duration: noteObj.duration,
                durationValue: durationValue,
                note: noteObj.note,
                clef: 'treble'
            });
            trebleTime += durationValue;
        }
        
        // Process bass notes to get temporal positions
        const bassEvents = [];
        bassTime = 0;
        for (const noteObj of bassBar) {
            const durationValue = getDurationValue(noteObj.duration);
            bassEvents.push({
                startTime: bassTime,
                endTime: bassTime + durationValue,
                duration: noteObj.duration,
                durationValue: durationValue,
                note: noteObj.note,
                clef: 'bass'
            });
            bassTime += durationValue;
        }
        
        // Create a unified timeline by finding all unique time points
        const timePoints = new Set();
        timePoints.add(0);
        
        for (const event of trebleEvents) {
            timePoints.add(event.startTime);
            timePoints.add(event.endTime);
        }
        for (const event of bassEvents) {
            timePoints.add(event.startTime);
            timePoints.add(event.endTime);
        }
        
        const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);
        
        // Create grid entries based on note start times (not segments)  
        // This ensures each note is only triggered once at its start time
        const barData = [];
        const trebleStaveNotes = [];
        const bassStaveNotes = [];
        
        // Get all unique start times for notes
        const noteStartTimes = new Set();
        for (const event of trebleEvents) {
            noteStartTimes.add(event.startTime);
        }
        for (const event of bassEvents) {
            noteStartTimes.add(event.startTime);
        }
        
        const sortedStartTimes = Array.from(noteStartTimes).sort((a, b) => a - b);
        
        // Create grid entries for each note start time
        // We need to create a temporal grid that properly handles notes with different durations  
        for (const startTime of sortedStartTimes) {
            // Find notes that start at this time
            const trebleNotesAtTime = trebleEvents.filter(event => event.startTime === startTime);
            const bassNotesAtTime = bassEvents.filter(event => event.startTime === startTime);
            
            // Collect all notes that should play at this time
            const trebleNotesToPlay = [];
            const bassNotesToPlay = [];
            const simultaneousNotes = [];
            let isPause = false;
            
            // Process treble notes starting at this time
            for (const event of trebleNotesAtTime) {
                if (event.note === "Pause") {
                    isPause = true;
                    simultaneousNotes.push("Pause");
                } else {
                    const notes = Array.isArray(event.note) ? event.note : [event.note];
                    for (const note of notes) {
                        simultaneousNotes.push(note);
                        const octave = parseInt(note.slice(-1));
                        if (octave >= 4) {
                            trebleNotesToPlay.push(note);
                        } else {
                            bassNotesToPlay.push(note);
                        }
                    }
                }
            }
            
            // Process bass notes starting at this time
            for (const event of bassNotesAtTime) {
                if (event.note === "Pause") {
                    if (!isPause) {
                        isPause = true;
                        simultaneousNotes.push("Pause");
                    }
                } else {
                    const notes = Array.isArray(event.note) ? event.note : [event.note];
                    for (const note of notes) {
                        if (!simultaneousNotes.includes(note)) {
                            simultaneousNotes.push(note);
                        }
                        const octave = parseInt(note.slice(-1));
                        if (octave >= 4) {
                            if (!trebleNotesToPlay.includes(note)) {
                                trebleNotesToPlay.push(note);
                            }
                        } else {
                            if (!bassNotesToPlay.includes(note)) {
                                bassNotesToPlay.push(note);
                            }
                        }
                    }
                }
            }
            
            // Calculate the duration until the next note starts
            const nextStartTimeIndex = sortedStartTimes.indexOf(startTime) + 1;
            let gridDuration;
            let gridDurationString;
            
            if (nextStartTimeIndex < sortedStartTimes.length) {
                // Duration until next note starts
                gridDuration = sortedStartTimes[nextStartTimeIndex] - startTime;
            } else {
                // Last note group - use shortest duration or standard quarter note  
                const durationsAtThisTime = [...trebleNotesAtTime, ...bassNotesAtTime].map(e => e.durationValue);
                gridDuration = durationsAtThisTime.length > 0 ? Math.min(...durationsAtThisTime) : 1;
            }
            
            // Convert duration back to string representation
            if (gridDuration >= 4) gridDurationString = 'w';
            else if (gridDuration >= 2) gridDurationString = 'h';
            else if (gridDuration >= 1) gridDurationString = '4';
            else if (gridDuration >= 0.5) gridDurationString = '8';
            else gridDurationString = '16';
            
            // Add to grid data structure - each entry represents notes that start at this time
            barData.push({
                notes: simultaneousNotes,
                duration: gridDurationString,
                durationValue: gridDuration,
                isPause: isPause,
                timeStart: startTime,
                timeEnd: startTime + gridDuration,
                trebleNotes: trebleNotesToPlay,
                bassNotes: bassNotesToPlay
            });
        }
        
        // Check if any segments should be highlighted
        const highlights = Array.isArray(highlightData) ? highlightData : (highlightData ? [highlightData] : []);
        
        // Now create the stave notes based on the original events with highlighting
        // Add treble notes
        for (let eventIndex = 0; eventIndex < trebleEvents.length; eventIndex++) {
            const event = trebleEvents[eventIndex];
            const notes = Array.isArray(event.note) ? event.note : [event.note];
            const trebleNotesToPlay = notes.filter(note => {
                if (note === "Pause") return false;
                const octave = parseInt(note.slice(-1));
                return octave >= 4;
            });
            
            // Check if this note should be highlighted
            let highlightColor = null;
            for (const highlight of highlights) {
                if (highlight.barIndex === barIndex && highlight.beatIndex === eventIndex) {
                    highlightColor = highlight.color;
                    break;
                }
            }
            
            const isDotted = event.duration.includes('.');
            const baseDuration = event.duration.replace('.', '');
            
            if (event.note === "Pause") {
                const note = new StaveNote({keys: ['b/4'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    trebleStaveNotes.push(note);
                    trebleStaveNotes.push(ghostNote);
                } else {
                    if (highlightColor && highlightColor !== 'black') {
                        note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                    }
                    trebleStaveNotes.push(note);
                }
                if (highlightColor && highlightColor !== 'black') {
                    note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                }
            } else if (trebleNotesToPlay.length > 0) {
                const note = new StaveNote({keys: trebleNotesToPlay, duration: baseDuration});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    trebleStaveNotes.push(note);
                    trebleStaveNotes.push(ghostNote);
                } else {
                    if (highlightColor && highlightColor !== 'black') {
                        note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                    }
                    trebleStaveNotes.push(note);
                }
                if (highlightColor && highlightColor !== 'black') {
                    note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                }
            } else {
                const note = new StaveNote({keys: ['b/4'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    trebleStaveNotes.push(note);
                    trebleStaveNotes.push(ghostNote);
                } else {
                    if (highlightColor && highlightColor !== 'black') {
                        note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                    }
                    trebleStaveNotes.push(note);
                }
                if (highlightColor && highlightColor !== 'black') {
                    note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                }
            }
        }
        
        // Add bass notes
        for (let eventIndex = 0; eventIndex < bassEvents.length; eventIndex++) {
            const event = bassEvents[eventIndex];
            const notes = Array.isArray(event.note) ? event.note : [event.note];
            const bassNotesToPlay = notes.filter(note => {
                if (note === "Pause") return false;
                const octave = parseInt(note.slice(-1));
                return octave < 4;
            });
            
            // Check if this note should be highlighted
            let highlightColor = null;
            for (const highlight of highlights) {
                if (highlight.barIndex === barIndex && highlight.beatIndex === eventIndex) {
                    highlightColor = highlight.color;
                    break;
                }
            }
            
            const isDotted = event.duration.includes('.');
            const baseDuration = event.duration.replace('.', '');
            
            if (event.note === "Pause") {
                const note = new StaveNote({clef: "bass", keys: ['b/2'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    bassStaveNotes.push(note);
                    bassStaveNotes.push(ghostNote);
                } else {
                    if (highlightColor && highlightColor !== 'black') {
                        note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                    }
                    bassStaveNotes.push(note);
                }
                if (highlightColor && highlightColor !== 'black') {
                    note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                }
            } else if (bassNotesToPlay.length > 0) {
                const note = new StaveNote({clef: "bass", keys: bassNotesToPlay, duration: baseDuration});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    bassStaveNotes.push(note);
                    bassStaveNotes.push(ghostNote);
                } else {
                    if (highlightColor && highlightColor !== 'black') {
                        note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                    }
                    bassStaveNotes.push(note);
                }
                if (highlightColor && highlightColor !== 'black') {
                    note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                }
            } else {
                const note = new StaveNote({clef: "bass", keys: ['D/3'], duration: baseDuration + 'r'});
                if (isDotted) {
                    Dot.buildAndAttach([note], {all: true});
                    // Add ghost note for the dot duration
                    const ghostDuration = baseDuration === 'w' ? 'h' : 
                                         baseDuration === 'h' ? 'q' : 
                                         baseDuration === 'q' ? '8' : 
                                         baseDuration === '8' ? '16' : '16';
                    const ghostNote = new GhostNote({duration: ghostDuration});
                    bassStaveNotes.push(note);
                    bassStaveNotes.push(ghostNote);
                } else {
                    if (highlightColor && highlightColor !== 'black') {
                        note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                    }
                    bassStaveNotes.push(note);
                }
                if (highlightColor && highlightColor !== 'black') {
                    note.setStyle({fillStyle: highlightColor, strokeStyle: highlightColor});
                }
            }
        }
        
        // Calculate total beats for the bar (use the maximum of treble and bass)
        const totalBeats = Math.max(trebleTime, bassTime);

        // Render treble staff for this bar
        if (trebleStaveNotes.length > 0) {
            const trebleVoice = new Voice({ num_beats: Math.max(trebleTime, 1), beat_value: 4 });
            trebleVoice.addTickables(trebleStaveNotes);
            Accidental.applyAccidentals([trebleVoice], keySignature);

            new Formatter().joinVoices([trebleVoice]).format([trebleVoice], inputDisplayWidth - 50);
            trebleVoice.draw(inputContext, trebleStaves[barIndex]);
        }

        // Render bass staff for this bar
        if (bassStaveNotes.length > 0) {
            const bassVoice = new Voice({ num_beats: Math.max(bassTime, 1), beat_value: 4 });
            bassVoice.addTickables(bassStaveNotes);
            Accidental.applyAccidentals([bassVoice], keySignature);

            new Formatter().joinVoices([bassVoice]).format([bassVoice], inputDisplayWidth - 50);
            bassVoice.draw(inputContext, bassStaves[barIndex]);
        }

        // Add this bar's data to the result
        gridAlignedNotes.push({
            barIndex: barIndex,
            totalBeats: totalBeats,
            notes: barData,
            trebleTime: trebleTime,
            bassTime: bassTime
        });
    }

    return gridAlignedNotes;
}


// const notes = {
//     "C4": 261.63,
//     "Db4": 277.18,
//     "D4": 293.66,
//     "Eb4": 311.13,
//     "E4": 329.63,
//     "F4": 349.23,
//     "Gb4": 369.99,
//     "G4": 392.00,
//     "Ab4": 415.30,
//     "A4": 440,
//     "Bb4": 466.16,
//     "B4": 493.88,
//     "C5": 523.25
// }
  

document.getElementById("inputText").innerHTML = 'You have pressed: ';
document.getElementById("outputText").innerHTML = 'You should press: ';

// function notesAreEqual(inputNotes, referenceNotes){
//     if(inputNotes.length == 0)
//     return false;
//     if(Array.isArray(referenceNotes)){
//         if(inputNotes.length != referenceNotes.length)
//             return false;

//         var parsedInput = [];
//         var parsedReference = [];
//         for(const input of inputNotes)
//             parsedInput.push(noteToMidi(input));
//         for(const input of referenceNotes)
//             parsedReference.push(noteToMidi(input));
//         parsedInput.sort();
//         parsedReference.sort();
//         // console.log(parsedInput)
//         // console.log(parsedReference)
//         // YOLO mode: allow octave-insensitive matching
//         if ($('#yoloMode')[0] && $('#yoloMode')[0].checked) {
//             // Compare only pitch class (modulo 12)
//             let inputMod = parsedInput.map(n => n % 12).sort();
//             let refMod = parsedReference.map(n => n % 12).sort();
//             return inputMod.length === refMod.length && inputMod.every((v, i) => v === refMod[i]);
//         }
//         return parsedInput.every(function(value, index) { return value === parsedReference[index]})
//         return parsedInput == parsedReference;
//     }
//     else{
//         // console.log(inputNotes , ' - ', referenceNotes);
//         // console.log(noteToMidi(inputNotes[0]), ' - ', noteToMidi(referenceNotes))
//     // 
//         if(noteToMidi(inputNotes[0]) == noteToMidi(referenceNotes))
//             return true;
//     }
//     return false;
// }

var currentPressed = [];

var currentSynthNotes = {};

let baseOctave = 4;

function onKeyPress(event, up) {
    // console.log(event.key, event.code, event.type);
    // if(event.type == 'keydown'){
    //     if(event.location == KeyboardEvent.DOM_KEY_LOCATION_LEFT && event.code.includes('Shift')){
    //         modifiers['LeftShift'] = true;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_RIGHT && event.code.includes('Shift')){
    //         modifiers['RightShift'] = true;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_LEFT && event.code.includes('Control')){
    //         modifiers['LeftControl'] = true;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_RIGHT && event.code.includes('Control')){
    //         modifiers['RightControl'] = true;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_LEFT && event.code.includes('Alt')){
    //         modifiers['LeftAlt'] = true;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_RIGHT && event.code.includes('Alt')){
    //         modifiers['RightAlt'] = true;
    //     }
    // }else if(event.type == 'keyup'){
    //     if(event.location == KeyboardEvent.DOM_KEY_LOCATION_LEFT && event.code.includes('Shift')){
    //         modifiers['LeftShift'] = false;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_RIGHT && event.code.includes('Shift')){
    //         modifiers['RightShift'] = false;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_LEFT && event.code.includes('Control')){
    //         modifiers['LeftControl'] = false;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_RIGHT && event.code.includes('Control')){  
    //         modifiers['RightControl'] = false;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_LEFT && event.code.includes('Alt')){
    //         modifiers['LeftAlt'] = false;
    //     }
    //     else if(event.location == KeyboardEvent.DOM_KEY_LOCATION_RIGHT && event.code.includes('Alt')){
    //         modifiers['RightAlt'] = false;
    //     }
    // }

    if (event.type == 'keydown' && event.code == 'KeyZ'){
        console.log('Reducing Base Octave: ', baseOctave);
        baseOctave -= 1;
        if(baseOctave < 0) baseOctave = 0;
    }
    if (event.type == 'keydown' && event.code == 'KeyX'){
        console.log('Increasing Base Octave: ', baseOctave);
        baseOctave += 1;
        if(baseOctave > 8) baseOctave = 8;
    }

    // Scale navigation with n and m keys
    if (event.type == 'keydown' && event.code == 'KeyN'){
        if (navigateToPreviousScale()) {
            console.log('Navigated to previous scale');
        }
        return; // Don't process as a musical note
    }
    if (event.type == 'keydown' && event.code == 'KeyM'){
        if (navigateToNextScale()) {
            console.log('Navigated to next scale');
        }
        return; // Don't process as a musical note
    }

    // Root note navigation with comma and period keys
    if (event.type == 'keydown' && event.code == 'Comma'){
        if (navigateToPreviousRootNote()) {
            console.log('Navigated to previous root note');
        }
        return; // Don't process as a musical note
    }
    if (event.type == 'keydown' && event.code == 'Period'){
        if (navigateToNextRootNote()) {
            console.log('Navigated to next root note');
        }
        return; // Don't process as a musical note
    }

    // console.log('Base Octave: ', baseOctave);

    var note = keyToNote(event, baseOctave);
    if (note == undefined){
        // console.log('Key not mapped: ', event.code);
        return;
    }
    // console.log('Modifiers: ', modifiers);
    // console.log('Note: ', note);
    var midiNote = noteToMidi(note) + 12;
    // console.log('Midi Note: ', midiNote);
    if(modifiers['LeftShift']) midiNote -= 12;
    if(modifiers['RightShift']) midiNote += 12;
    // if (modifiers['LeftControl']) midiNote -= 24;
    // if (modifiers['RightControl']) midiNote += 24;
    if (modifiers['LeftAlt']) midiNote -= 24;
    if (modifiers['RightAlt']) midiNote += 24;
    note = noteToName(midiNote);

    // console.log('Note: ', note, ' Midi Note: ', midiNote);

    if(event.type == 'keydown' && note != undefined && !currentPressed.includes(note)){
        noteArray[note] = 127; // Set velocity to 127 for keydown
        if(!currentPressed.includes(note)){
            currentPressed.push(note);
        }
        // console.log('Key Down: ', note);


        var noteString = [];
        for (const [key, value] of Object.entries(noteArray)) {
            // console.log(`${key}: ${value}`);
            noteString.push(key);
        }
        for(const [key, value] of Object.entries(noteArray)){
            var midi = noteToMidi(key) + 12;
            // console.log('key: ', key, ' midi note:', midi);
            // console.log(keys[midi])
            keys[midi].element.classList.add('pressedKey');;
            currentPressed.push(key);
        }

        // if(notesAreEqual(noteString, outputNoteArray[0]['notes'][selectedNote])){
        //     selectedNote = selectedNote + 1;
        //     if(selectedNote == outputNoteArray[0]['notes'].length){
        //         selectedNote = 0;
        //         const prior = outputNoteArray.slice(-1)[0]
        //         outputNoteArray.push(generatePattern(prior['dir'], prior['root'], prior['mode'], prior['scale']));
        //         outputNoteArray.shift();
        //         barCounter++;
        //         // generatePattern();
        //     }

        //     highlightNotes(outputNoteArray[0]['notes'][selectedNote])
        //     drawNotes(outputDiv, outputNoteArray, false);
        //     highlightScaleNotes(outputNoteArray[0]['scaleNotes'])
        //     // selectedNote = selectedNote % outputNoteArray[0]['notes'].length;
        // }

        // noteString = [];
        // for (const [key, value] of Object.entries(noteArray)) {
        //     // console.log(`${key}: ${value}`);
        //     noteString.push(`${key}[${value}]`);
        // }
        document.getElementById("inputText").innerHTML = 'You have pressed: ' + noteString.join(',');
        // document.getElementById("outputText").innerHTML = 'You should press: ' + outputNoteArray[0]['notes'][selectedNote];

        


        drawNotes(inputDiv, noteArray, true);

        

        // if($('#synthEnableBox')[0].checked){
        //     const osc = context.createOscillator();
        //     const noteGain = context.createGain();
        //     var startTime = context.currentTime;
        //     noteGain.gain.setValueAtTime(0, 0);
        //     var level = sustainLevel * 64 / 127;
        //     var activeNoteCount = Object.keys(noteArray).length;
        //     var dynamicLevel = Math.min(level, 0.8 / Math.max(1, activeNoteCount));
            
        //     noteGain.gain.linearRampToValueAtTime(dynamicLevel, startTime + noteLength * attackTime);

        //     // noteGain.gain.linearRampToValueAtTime(level, startTime + noteLength * attackTime);

        //     // noteGain.gain.setValueAtTime(sustainLevel, context.currentTime + noteLength - noteLength * releaseTime);
        //     // noteGain.gain.linearRampToValueAtTime(0, context.currentTime + noteLength);

        //     var lfoGain = context.createGain();
        //     lfoGain.gain.setValueAtTime(vibratoAmount, 0);
        //     lfoGain.connect(osc.frequency)

        //     var lfo = context.createOscillator();
        //     lfo.frequency.setValueAtTime(vibratoSpeed, 0);
        //     lfo.start(0);
        //     // lfo.stop(context.currentTime + noteLength);
        //     lfo.connect(lfoGain); 
        //     if(waveform == "custom")
        //         osc.setPeriodicWave(customWaveform);
        //     else
        //         osc.type = waveform;
        //     osc.frequency.setValueAtTime(pianoNotes[note], 0);
        //     osc.start(0);
        //     // osc.stop(context.currentTime + noteLength);
        //     osc.connect(noteGain);

        //     noteGain.connect(masterVolume);
        //     noteGain.connect(delay);

        //     currentSynthNotes[note] = [noteGain, lfo, osc, startTime, dynamicLevel];
        // }

        let noteName = note;
        let message = {
            data: [144, noteToMidi(note), 127] // Note on message
        };
        // console.log('Key Down: ', noteName, '@', message.data[2]);
        noteArray[noteName] = message.data[2];
        
        // Use PolySynth for new note playing if available
        if(polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            console.log('🎹 PolySynth key handling activated for note:', noteName);
            
            // Check if chord mode handled the input
            if (handleChordModeInput(noteName, message.data[2], true)) {
                return; // Input was consumed by chord mode
            }
            
            // Normal single note playing
            const noteWithOctave = convertNoteNameToPolySynthFormat(noteName);
            if (noteWithOctave) {
                const velocity = message.data[2];
                const volume = Math.round((velocity / 100) * 100); // Convert MIDI velocity to percentage
                playNote2([noteWithOctave], volume);
            }
        }

    }
    else if(event.type == 'keyup' && note != undefined){
        // console.log('Key Up: ', note);
        if(noteArray.hasOwnProperty(note)){ // true
            delete noteArray[note];
            var midi = noteToMidi(note) + 12;
            keys[midi].element.classList.remove('pressedKey');
            currentPressed = currentPressed.filter(item => item !== note);
        }
        var noteString = [];
        for (const [key, value] of Object.entries(noteArray)) {
            // console.log(`${key}: ${value}`);
            noteString.push(key);
        }
        // if(notesAreEqual(noteString, outputNoteArray[0]['notes'][selectedNote])){
        //     selectedNote = selectedNote + 1;
        //     if(selectedNote == outputNoteArray[0]['notes'].length){
        //         selectedNote = 0;
        //         const prior = outputNoteArray.slice(-1)[0]
        //         outputNoteArray.push(generatePattern(prior['dir'], prior['root'], prior['mode'], prior['scale']));
        //         outputNoteArray.shift();
        //         barCounter++;
        //         // generatePattern();
        //     }

        //     highlightNotes(outputNoteArray[0]['notes'][selectedNote])
        //     drawNotes(outputDiv, outputNoteArray, false);
        //     highlightScaleNotes(outputNoteArray[0]['scaleNotes'])
        //     // selectedNote = selectedNote % outputNoteArray[0]['notes'].length;
        // }

        // noteString = [];
        // for (const [key, value] of Object.entries(noteArray)) {
        //     // console.log(`${key}: ${value}`);
        //     noteString.push(`${key}[${value}]`);
        // }
        document.getElementById("inputText").innerHTML = 'You have pressed: ' + noteString.join(',');
        // document.getElementById("outputText").innerHTML = 'You should press: ' + outputNoteArray[0]['notes'][selectedNote];

        // if ($('#synthEnableBox')[0].checked && note in currentSynthNotes){
        //     var currentTime = context.currentTime;
        //     var endTime = Math.max(currentTime, currentSynthNotes[note][3] + noteLength - noteLength * releaseTime) + noteLength* releaseTime
        //     // var level = sustainLevel * message.data[2] / 127;
        //     currentSynthNotes[note][0].gain.setValueAtTime(currentSynthNotes[note][4], endTime - noteLength * releaseTime);
        //     currentSynthNotes[note][0].gain.linearRampToValueAtTime(0, endTime);
        //     currentSynthNotes[note][2].stop(endTime);
        //     currentSynthNotes[note][1].stop(endTime);
        //     delete currentSynthNotes[note];
        // }
        drawNotes(inputDiv, noteArray, true);

        let noteName = note;
        let message = {
            data: [144, noteToMidi(note), 127] // Note on message
        };
        // console.log('Key Up: ', noteName);
        if(noteArray.hasOwnProperty(noteName)){ // true
            // console.log('...');
            delete noteArray[noteName];
        }
        
        // Stop note in PolySynth if available
        if(polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            // Check if chord mode handled the input
            if (handleChordModeInput(noteName, 0, false)) {
                return; // Input was consumed by chord mode
            }
            
            // Normal single note stopping
            const noteWithOctave = convertNoteNameToPolySynthFormat(noteName);
            if (noteWithOctave) {
                stopNotes2([noteWithOctave]);
            }
        }
        // console.log('Note ', message.data[1])
        // console.log('Velocity ', message.data[2])


    }

    // console.log('Input: ', noteArray);  
    // console.log('Current Grid Data: ', window.gridData);
    // console.log('Selected Bar Index: ', selectedBarIndex);
    // console.log('Selected Note Index: ', selectedNoteIndex);
    // console.log('Current Output: ', window.gridData[selectedBarIndex].notes[selectedNoteIndex].notes);

    let matching = compareStates(noteArray, window.gridData[selectedBarIndex].notes[selectedNoteIndex].notes);
    // console.log('Matching: ', matching);
    if(matching){
        advanceSelectedPosition();
        highlightBothPositions();
    }
}





document.addEventListener('keydown', onKeyPress);
document.addEventListener('keyup', onKeyPress);

// Handle window focus/blur to prevent stuck keys
function releaseAllKeys() {
    console.log('Releasing all pressed keys due to focus loss');
    
    // Create a copy of currentPressed to avoid modifying array while iterating
    const keysToRelease = [...currentPressed];
    
    // Release all currently pressed keys
    for (const note of keysToRelease) {
        // Remove from noteArray
        if (noteArray.hasOwnProperty(note)) {
            delete noteArray[note];
        }
        
        // Remove visual highlighting
        const midi = noteToMidi(note) + 12;
        if (keys[midi] && keys[midi].element) {
            keys[midi].element.classList.remove('pressedKey');
        }
        
        // Stop note in PolySynth if available
        if (polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            const noteWithOctave = convertNoteNameToPolySynthFormat(note);
            if (noteWithOctave) {
                stopNotes2([noteWithOctave]);
            }
        }
    }
    
    // Clear the arrays
    currentPressed = [];
    
    // Update the UI
    document.getElementById("inputText").innerHTML = 'You have pressed: ';
    drawNotes(inputDiv, noteArray, true);
}

// Add event listeners for window focus/blur
window.addEventListener('blur', releaseAllKeys);
window.addEventListener('focus', function() {
    console.log('Window regained focus');
});

function onMIDIMessage (message) {
    let pressed = message.data[0] == 144 ? true : false;
    if (message.data[2] == 0) pressed = false; // Note off message with velocity 0
    // console.log('MIDI Message: ', message.data, 'Pressed: ', pressed);
    var noteName = noteToName(message.data[1]);
    for( var key of currentPressed){
        var midi = noteToMidi(key) + 12;
        keys[midi].element.classList.remove('pressedKey');
    }
    currentPressed = [];

    if(pressed){
        console.log('Key Down: ', noteName, '@', message.data[2]);
        noteArray[noteName] = message.data[2];
        
        // Use PolySynth for new note playing if available
        if(polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            // Check if chord mode handled the input
            if (handleChordModeInput(noteName, message.data[2], true)) {
                // Input was consumed by chord mode, skip normal processing
            } else {
                // Normal single note playing
                const noteWithOctave = convertNoteNameToPolySynthFormat(noteName);
                if (noteWithOctave) {
                    const velocity = message.data[2];
                    const volume = Math.round((velocity / 100) * 100); // Convert MIDI velocity to percentage
                    playNote2([noteWithOctave], volume);
                }
            }
        }
    }
    else{
        console.log('Key Up: ', noteName);
        if(noteArray.hasOwnProperty(noteName)){ // true
            // console.log('...');
            delete noteArray[noteName];
        }
        
        // Stop note in PolySynth if available
        if(polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            // Check if chord mode handled the input
            if (handleChordModeInput(noteName, 0, false)) {
                // Input was consumed by chord mode, skip normal processing
            } else {
                // Normal single note stopping
                const noteWithOctave = convertNoteNameToPolySynthFormat(noteName);
                if (noteWithOctave) {
                    stopNotes2([noteWithOctave]);
                }
            }
        }
        // console.log('Note ', message.data[1])
        // console.log('Velocity ', message.data[2])
    }
    // console.log('Current Note State:', noteArray);

    var noteString = [];
    for (const [key, value] of Object.entries(noteArray)) {
        // console.log(`${key}: ${value}`);
        noteString.push(key);
      }
      for(const [key, value] of Object.entries(noteArray)){
          var midi = noteToMidi(key) + 12;
          // console.log('key: ', key, ' midi note:', midi);
          // console.log(keys[midi])
          keys[midi].element.classList.add('pressedKey');;
          currentPressed.push(key);
      }
    // console.log(noteString);

    //outputNoteArray[selectedNote]

    // if(notesAreEqual(noteString, outputNoteArray[0]['notes'][selectedNote])){
    //     selectedNote = selectedNote + 1;
    //     if(selectedNote == outputNoteArray[0]['notes'].length){
    //         selectedNote = 0;
    //         const prior = outputNoteArray.slice(-1)[0]
    //         outputNoteArray.push(generatePattern(prior['dir'], prior['root'], prior['mode'], prior['scale']));
    //         outputNoteArray.shift();
    //         barCounter++;
    //         // generatePattern();
    //     }

    //     highlightNotes(outputNoteArray[0]['notes'][selectedNote])
    //     drawNotes(outputDiv, outputNoteArray, false);
    //     highlightScaleNotes(outputNoteArray[0]['scaleNotes'])
    //     // selectedNote = selectedNote % outputNoteArray[0]['notes'].length;
    // }

    // noteString = [];
    // for (const [key, value] of Object.entries(noteArray)) {
    //     // console.log(`${key}: ${value}`);
    //     noteString.push(`${key}[${value}]`);
    //   }
    document.getElementById("inputText").innerHTML = 'You have pressed: ' + noteString.join(',');

    // document.getElementById("outputText").innerHTML = 'You should press: ' + outputNoteArray[0]['notes'][selectedNote];

    


    drawNotes(inputDiv, noteArray, true);

    
    // if(pressed){
    //     if($('#synthEnableBox')[0].checked){
    //     const osc = context.createOscillator();
    //     const noteGain = context.createGain();
    //     var startTime = context.currentTime;
    //     noteGain.gain.setValueAtTime(0, 0);
    //     var level = sustainLevel * message.data[2] / 127;
    //     var activeNoteCount = Object.keys(noteArray).length;
    //     var dynamicLevel = Math.min(level, 0.8 / Math.max(1, activeNoteCount));
        
    //     noteGain.gain.linearRampToValueAtTime(dynamicLevel, startTime + noteLength * attackTime);

    //     // noteGain.gain.linearRampToValueAtTime(level, startTime + noteLength * attackTime);

    //     // noteGain.gain.setValueAtTime(sustainLevel, context.currentTime + noteLength - noteLength * releaseTime);
    //     // noteGain.gain.linearRampToValueAtTime(0, context.currentTime + noteLength);

    //     var lfoGain = context.createGain();
    //     lfoGain.gain.setValueAtTime(vibratoAmount, 0);
    //     lfoGain.connect(osc.frequency)

    //     var lfo = context.createOscillator();
    //     lfo.frequency.setValueAtTime(vibratoSpeed, 0);
    //     lfo.start(0);
    //     // lfo.stop(context.currentTime + noteLength);
    //     lfo.connect(lfoGain); 
    //     if(waveform == "custom")
    //         osc.setPeriodicWave(customWaveform);
    //     else
    //         osc.type = waveform;
    //     osc.frequency.setValueAtTime(pianoNotes[noteName], 0);
    //     osc.start(0);
    //     // osc.stop(context.currentTime + noteLength);
    //     osc.connect(noteGain);

    //     noteGain.connect(masterVolume);
    //     noteGain.connect(delay);

    //     currentSynthNotes[noteName] = [noteGain, lfo, osc, startTime, dynamicLevel];
    //     }
    // }
    // else{
    //     if(noteName in currentSynthNotes){
    //         var currentTime = context.currentTime;
    //         var endTime = Math.max(currentTime, currentSynthNotes[noteName][3] + noteLength - noteLength * releaseTime) + noteLength* releaseTime
    //     // var level = sustainLevel * message.data[2] / 127;
    //         currentSynthNotes[noteName][0].gain.setValueAtTime(currentSynthNotes[noteName][4], endTime - noteLength * releaseTime);
    //         currentSynthNotes[noteName][0].gain.linearRampToValueAtTime(0,endTime );
    //         // const noteGain = context.createGain();
    //         // noteGain.gain.linearRampToValueAtTime(sustainLevel, context.currentTime + noteLength * attackTime);

    //         currentSynthNotes[noteName][1].stop(endTime);
    //         currentSynthNotes[noteName][2].stop(endTime);
    //         delete currentSynthNotes[noteName];
    //     }
    // }


    // drawNotes(inputDiv, noteArray);
    // drawInputStaves()
// const notes = [
//     dotted(new StaveNote({ keys: ["e##/5"], duration: "8d" }).addModifier(new Accidental("##"))),
//     new StaveNote({ keys: ["b/4"], duration: "16" }).addModifier(new Accidental("b")),
//     new StaveNote({ keys: ["c/4"], duration: "8" }),
//     new StaveNote({ keys: ["d/2"], duration: "16" }),
//     new StaveNote({ keys: ["e/4"], duration: "16" }).addModifier(new Accidental("b")),
//     new StaveNote({ keys: ["d/4"], duration: "16" }),
//     new StaveNote({ keys: ["e/4"], duration: "16" }).addModifier(new Accidental("#")),
//     new StaveNote({ keys: ["g/4"], duration: "32" }),
//     new StaveNote({ keys: ["a/4"], duration: "32" }),
//     new StaveNote({ keys: ["g/4"], duration: "16" }),
//     new StaveNote({ keys: ["d/4"], duration: "q" }),
// ];

// const beams = Beam.generateBeams(notes);
// Formatter.FormatAndDraw(context, outputTrebleStave, notes);
// beams.forEach((b) => {
//     b.setContext(context).draw();
// });
    // let str = `MIDI message received at timestamp ${event.timeStamp}[${event.data.length} bytes]: `;
    // for (const character of event.data) {
    //   str += `0x${character.toString(16)} `;
    // }
    // console.log(str);

    // console.log(message.data);

    console.log('Input: ', noteArray);  
    console.log('Current Grid Data: ', window.gridData);
    console.log('Selected Bar Index: ', selectedBarIndex);
    console.log('Selected Note Index: ', selectedNoteIndex);
    console.log('Current Output: ', window.gridData[selectedBarIndex].notes[selectedNoteIndex].notes);

    let matching = compareStates(noteArray, window.gridData[selectedBarIndex].notes[selectedNoteIndex].notes);
    console.log('Matching: ', matching);
    if(matching){
        advanceSelectedPosition();
        highlightBothPositions();
    }
    }

function compareStates(inputState, targetState){
    // Convert inputState to MIDI numbers
    const inputStateMidi = Object.keys(inputState).map(note => noteToMidi(note) + 12);
    // Convert targetState to MIDI numbers
    const referenceStateMidi = targetState.map(note => noteToMidi(note) + 12);
    let yoloMode = ($('#yoloMode')[0] && $('#yoloMode')[0].checked);
    if(yoloMode){
        // YOLO mode: compare only pitch class (modulo 12)
        const inputMod = inputStateMidi.map(n => n % 12).sort();
        const referenceMod = referenceStateMidi.map(n => n % 12).sort();

        let uniqueInputMod = [...new Set(inputMod)];
        let uniqueReferenceMod = [...new Set(referenceMod)];

        // console.log('Unique Input MIDI: ', uniqueInputMod);
        // console.log('Unique Reference MIDI: ', uniqueReferenceMod);

        if (uniqueInputMod.length !== uniqueReferenceMod.length) {
            // console.log('Input and reference states do not match in YOLO mode.');
            return false;
        }
        for (let i = 0; i < uniqueInputMod.length; i++) {
            if (uniqueInputMod[i] !== uniqueReferenceMod[i]) {
                // console.log('Input and reference states do not match in YOLO mode.');
                return false;
            }
        }
        // console.log('Input and reference states match in YOLO mode.');
        return true;        
    }

    // console.log('Input State MIDI: ', inputStateMidi);
    // console.log('Reference State MIDI: ', referenceStateMidi);

    let uniqueInputs = [...new Set(inputStateMidi)];
    let uniqueReferences = [...new Set(referenceStateMidi)];

    if (uniqueInputs.length !== uniqueReferences.length) {
        // console.log('Input and reference states do not match.');
        return false;
    }
    let sortedInput = uniqueInputs.slice().sort();
    let sortedReference = uniqueReferences.slice().sort();
    for (let i = 0; i < sortedInput.length; i++) {
        if (sortedInput[i] !== sortedReference[i]) {
            // console.log('Input and reference states do not match.');
            return false;
        }
    }
    // console.log('Input and reference states match.');
    return true;


}

// function getScaleModes(mode){
//     if(mode == "Major Mode")
//         return ["Major", "Dorian", "Phrygian", "Lydian", "Mixolydian","Natural Minor","Locrian"];
//     if(mode == "Melodic Minor Mode")
//         return ["Melodic Minor", "Dorian b2", "Lydian Augmented", "Lydian Dominant", "Aeolian Dominant","Half diminished","Altered"];
//     if(mode == "Harmonic Minor Mode")
//         return ["Harmonic Minor", "Locrian ♮6", "Major #5", "Dorian #4", "Phrygian Dominant","Lydian #2","Altered dominant bb7"];
//     if(mode == "Harmonic Major Mode")
//         return ["Harmonic Major", "Dorian b5", "Phrygian b4", "Lydian b3", "Mixolydian b2","Lydian Augmented #2","Locrian bb7"];
//     if(mode == "Diminished Mode")
//         return ["Diminished","Inverted Diminished"];
//     if(mode == "Whole Tone Mode")
//         return ["Whole Tone"];
//     if(mode == "Augmented Mode")
//         return ["Augmented", "Inverted Augmented"];
// }
// function getScaleIntervals(mode){
//     if(mode == "Major Mode")
//         return [2,2,1,2,2,2,1];
//     if(mode == "Melodic Minor Mode")
//         return [2,1,2,2,2,2,1];
//     if(mode == "Harmonic Minor Mode")
//         return [2,1,2,2,1,3,1];
//     if(mode == "Harmonic Major Mode")
//         return [2,2,1,2,1,3,1];
//     if(mode == "Diminished Mode")
//         return [2,1,2,1,2,1,2,1];
//     if(mode == "Whole Tone Mode")
//         return [2,2,2,2,2,2];
//     if(mode == "Augmented Mode")
//         return [3,1,3,1,3,1]

// }

// function generateScale(rootNoteName, mode, scale, direction){
//     var root = noteToMidi(rootNoteName) + 12;
//     // console.log('rootNote: ', rootNoteName, root);

//     var scales = getScaleModes(mode);
//     var intervals = getScaleIntervals(mode);

// // console.log(scales);
// // console.log(scale);
//     var selectedScale = scales.findIndex(element => element == scale);
//     var intervals = getScaleIntervals(mode);

//     var selectedIntervals = selectedScale == 0 ? intervals : intervals.slice(selectedScale).concat(intervals.slice(0,selectedScale));

    
//     var scaleNotes = [];
//     var currentNote = root;
//     scaleNotes.push(noteToName(currentNote));
//     if(direction != "down"){
//         for(const step of selectedIntervals){
//             if(step == 1)
//                 currentNote = currentNote + 1;
//             if(step == 2)
//                 currentNote = currentNote + 2;
//             if(step == 3)
//                 currentNote = currentNote + 3;
//             scaleNotes.push(noteToName(currentNote));
//         }
//     }else{
//         selectedIntervals = selectedIntervals.reverse();
//         for(const step of selectedIntervals){
//             if(step == 1)
//                 currentNote = currentNote - 1;
//             if(step == 2)
//                 currentNote = currentNote - 2;
//             if(step == 3)
//                 currentNote = currentNote - 3;
//             scaleNotes.push(noteToName(currentNote));
//         }
//     }
//     return scaleNotes;
// }

// var currentRoot =  parseInt($("#rootScaleSelect").val());
// var currentScale =  $('#keyScaleSelect').val();
// var currentMode = $("#modeScaleSelect").find(':selected')[0].innerHTML;
// var intervals = getScaleIntervals(currentMode);
// var currentIntervals = currentScale == 0 ? intervals : intervals.slice(currentScale).concat(intervals.slice(0,currentScale));

// function setScaleText(){
//     // console.log()
//     var mode = $("#modeScaleSelect").find(':selected')[0].innerHTML;
//     var scale = $("#keyScaleSelect").find(':selected')[0].innerHTML;

//     var scales = getScaleModes(mode);
//     var intervals = getScaleIntervals(mode);
//     var selectedScale = $('#keyScaleSelect').val();
//     var selectedIntervals = selectedScale == 0 ? intervals : intervals.slice(selectedScale).concat(intervals.slice(0,selectedScale));

//     // console.log('Selected Mode:', mode);
//     // console.log('Selected Scale: ', scales[$('#keyScaleSelect').val()]);
//     // console.log('Selected Intervals: ', selectedIntervals, selectedIntervals.reduce((partialSum, a) => partialSum + a, 0));

//     var outArray = [];
//     for(const step of selectedIntervals){
//         if(step == 1)
//             outArray.push("H");
//         if(step == 2)
//             outArray.push("W");
//         if(step == 3)
//             outArray.push("WH");
//     }
//     var outString = outArray.join(' - ');
//     document.getElementById("scaleText").innerHTML = outString;

//     var root =  parseInt($("#rootScaleSelect").val());
//     // console.log( root);
//     // console.log(noteToName(root));

//     var scaleNotes = [];
//     var currentNote = root;
//     scaleNotes.push(noteToName(currentNote));
//     for(const step of selectedIntervals){
//         if(step == 1)
//             currentNote = currentNote + 1;
//         if(step == 2)
//             currentNote = currentNote + 2;
//         if(step == 3)
//             currentNote = currentNote + 3;
//         scaleNotes.push(noteToName(currentNote));
//     }
//     highlightScaleNotes(scaleNotes)
//     var outString = scaleNotes.join(' - ');
//     document.getElementById("scaleText").innerHTML = outString;
//     // outputNoteArray = scaleNotes;
//     selectedNote = 0;
//     // highlightNotes(outputNoteArray[selectedNote])

//     // drawNotes(inputDiv, noteArray, true);
//     // drawNotes(outputDiv, outputNoteArray, false);

// }

// function randomIntFromInterval(min, max) { // min and max included 
//     return Math.floor(Math.random() * (max - min + 1) + min)
//   }

//   function shuffle(array) {
//     let currentIndex = array.length,  randomIndex;
  
//     // While there remain elements to shuffle.
//     while (currentIndex != 0) {
  
//       // Pick a remaining element.
//       randomIndex = Math.floor(Math.random() * currentIndex);
//       currentIndex--;
  
//       // And swap it with the current element.
//       [array[currentIndex], array[randomIndex]] = [
//         array[randomIndex], array[currentIndex]];
//     }
  
//     return array;
//   }


// var barCounter = 0;

// function getScaleDistances(currentRoot, currentMode, currentIntervals, targetMode){                
//     // console.log('Changing Scale')
//     var baseInterval = getScaleIntervals(targetMode);
//     var intervals = [baseInterval]
//     for(var i = 1; i < baseInterval.length && i < getScaleModes(targetMode).length; ++i)
//         intervals.push(baseInterval.slice(i).concat(baseInterval.slice(0,i)))
//     // console.log('candidate intervals:', intervals)
//     var intervalNotes = []
//     for(var i = 0; i < intervals.length; ++i){
//         var notes = [currentRoot]
//         for( var j = 0; j < intervals[i].length; ++j){
//             notes.push(notes.slice(-1)[0] + intervals[i][j]);
//         }
//         intervalNotes.push(notes);
//     }
//     // console.log('candidate notes:', intervalNotes);
//     var currentNotes = [currentRoot];
//     // console.log(currentIntervals)
//     for( var j = 0; j < currentIntervals.length; ++j){
//         currentNotes.push(currentNotes.slice(-1)[0] + currentIntervals[j]);
//     }  
//     // console.log('Current notes:' , currentNotes)
//     var distances = []
//     for(var i = 0; i < intervalNotes.length; ++i){
//         var distance = 0;
//         for(var j = 0; j < currentNotes.length; ++j){
//             distance = distance + Math.abs(intervalNotes[i][j] - currentNotes[j])
//         }
//         distances.push(distance)
//     }
//     // console.log('Distances:', distances)
//     return distances;
// }

// function chordToIntervals(chord){
//     var intervals = [];
//     console.log('Chord:', chord);
//     switch(chord){
//         case 0: intervals = [0]; break; //monad
//         case 1: intervals = [0, 4]; break; //diad
//         case 2: intervals = [0, 4, 7]; break; //maj
//         case 3: intervals = [0, 3, 7]; break; //min
//         case 4: intervals = [0, 2, 7]; break; //sus2
//         case 5: intervals = [0, 5, 7]; break; //sus4
//         case 6: intervals = [0, 4, 7, 10]; break; //7
//         case 7: intervals = [0, 4, 7, 11]; break; //maj7
//         case 8: intervals = [0, 3, 7, 10]; break; //min7
//         case 9: intervals = [0, 3, 6]; break; //dim
//         case 10: intervals = [0, 4, 8]; break; //aug
//         case 11: intervals = [0, 4, 7, 9]; break; //6
//         case 12: intervals = [0, 2, 4, 7]; break; //9
//         case 13: intervals = [0, 4, 7, 10, 14]; break; //11
//         case 14: intervals = [0, 3, 7, 11]; break; // minmaj7
//         case 15: intervals = [0, 4, 7, 11]; break; // maj9
//         case 16: intervals = [0, 4, 7, 5]; break; // add4
//         case 17: intervals = [0, 4, 7, 13]; break; // add9
//         case 18: intervals = [0, 4, 7, 9]; break; // maj6/9
//         case 19: intervals = [0, 3, 7, 9]; break; // min6/9
//     }
//     return intervals;
// }

// function chordStringToIndex(chordString){
//     switch(chordString){
//         case 'monad': return 0;
//         case 'diad': return 1;
//         case 'maj': case 'M': return 2;
//         case 'min': case 'm': return 3;
//         case 'sus2': return 4;
//         case 'sus4': return 5;
//         case '7': return 6;
//         case 'maj7': return 7;
//         case 'min7': return 8;
//         case 'dim': return 9;
//         case 'aug': return 10;
//         case '6': return 11;
//         case '9': return 12;    
//         case '11': return 13;
//         case 'minmaj7': return 14;
//         case 'maj9': return 15;
//         case 'add4': return 16;
//         case 'add9': return 17;
//         case 'maj6/9': return 18;
//         case 'min6/9': return 19;
//     }
//     return 2;
// }

// function generatePattern(priorDirection, priorRoot, priorMode, priorScale){
//     console.log('Calling generate Pattern with: ', priorDirection, priorRoot, priorMode, priorScale);

//     const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

//     var currentRoot = noteToMidi(priorRoot) + 12;
//     var currentScaleModes = getScaleModes(priorMode);
//     var currentSelectedScale = 0;
//     for( const mode of currentScaleModes){
//         if(mode == priorScale)
//             break;
//         currentSelectedScale++;
//     }
//     var currentScaleIntervals = getScaleIntervals(priorMode);
//     var currentIntervals = currentSelectedScale == 0 ? currentScaleIntervals : currentScaleIntervals.slice(currentSelectedScale).concat(currentScaleIntervals.slice(0,currentSelectedScale));     

//     var newRoot = currentRoot;
//     var newMode = priorMode;
//     var newScale = getScaleModes(newMode)[currentSelectedScale];

//     if(priorDirection == null){
//         // console.log('Initial Pattern');
//     }
//     else{
//         if($('#scaleChangeButton')[0].checked){
//             var scaleInterval = parseInt($('#scaleChangeInterval').val());
//             var modeInterval = parseInt($('#modeChangeInterval').val());
//             // console.log('BarCounter:', barCounter,'interval:', interval,'mod:', barCounter % scaleInterval)
//             if(barCounter % scaleInterval == 0 && (!$('#modeChangeButton')[0].checked || barCounter % modeInterval != 0)){
//                 var distances = getScaleDistances(newRoot, priorMode, currentIntervals, priorMode)

//                 var candidates = []
//                 for(var i = 0; i < distances.length; ++i){
//                     if(distances[i] > 0 && distances[i] <= parseInt($('#modeIntervalDistance').val())){
//                         candidates.push(i);
//                     }
//                 }
//                 // console.log('Candidate Intervals:', candidates);
//                 if(candidates.length > 0){
//                     var pickedIndex = randomIntFromInterval(0, candidates.length - 1);
//                     // console.log('Picked:', pickedIndex)
//                     // console.log(getScaleModes(newMode)[candidates[pickedIndex]])
//                     // console.log(distances[candidates[pickedIndex]])
//                     newScale = getScaleModes(newMode)[candidates[pickedIndex]];
//                 }       
//             }
//         }
//         if($('#modeChangeButton')[0].checked){
//             var scaleInterval = parseInt($('#scaleChangeInterval').val());
//             var modeInterval = parseInt($('#modeChangeInterval').val());
//             // console.log('BarCounter:', barCounter,'interval:', interval,'mod:', barCounter % modeInterval)
//             if(barCounter % modeInterval == 0){
//                 var distanceDict = {}

//                 distanceDict['Major Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Major Mode")
//                 distanceDict['Melodic Minor Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Melodic Minor Mode")
//                 distanceDict['Harmonic Minor Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Harmonic Minor Mode")
//                 distanceDict['Harmonic Major Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Harmonic Major Mode")
//                 distanceDict['Diminished Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Diminished Mode")
//                 distanceDict['Whole Tone Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Whole Tone Mode")
//                 distanceDict['Augmented Mode'] = getScaleDistances(newRoot, priorMode, currentIntervals, "Augmented Mode")

//                 var candidates = []
//                 for (const [key, distances] of Object.entries(distanceDict)){
//                     // console.log(key, distances)
//                     for(var i = 0; i < distances.length; ++i){
//                         if(distances[i] > 0 && distances[i] <= parseInt($('#modeIntervalDistance').val())){
//                             candidates.push([key, i]);
//                         }
//                     }
//                 }

//                 // console.log('Candidate Intervals:', candidates);
//                 if(candidates.length > 0){
//                     var pickedIndex = randomIntFromInterval(0, candidates.length - 1);
//                     console.log('Picked:', pickedIndex)
//                     // console.log(getScaleModes(newMode)[candidates[pickedIndex]])
//                     // console.log(distances[candidates[pickedIndex]])
//                     // console.log( candidates[pickedIndex])
//                     newMode = candidates[pickedIndex][0];
//                     newScale = getScaleModes(newMode)[candidates[pickedIndex][1]];
//                     // console.log( newScale)
//                 }       
//             }
//         }


//         if($('#rootProgressionCheckBox')[0].checked){
//             var currentRootName = noteToName(currentRoot);
//             // console.log('Current Root:', noteToName(currentRoot));
//             var currentKey = currentRootName.slice(0,-2);
//             // console.log('Current Key:', currentKey);

//             var currentMidi = currentRoot;
//             var minKey = currentMidi;
//             var maxKey = currentMidi;
//             if($('#lowestRootNoteSelection').val() == '0' && $('#highestRootNoteSelection').val() == '11'){
//                 // console.log('No Root Limitations');
//                 minKey = currentMidi - parseInt($('#rootJumpSelection').val())
//                 maxKey = currentMidi + parseInt($('#rootJumpSelection').val())
//             }
//             else{
//                 var currentIndex = 0;
//                 switch(currentKey){
//                     case 'A':  currentIndex = 0; break;
//                     case 'A#': currentIndex = 1; break;
//                     case 'B':  currentIndex = 2; break;
//                     case 'C':  currentIndex = 3; break;
//                     case 'C#': currentIndex = 4; break;
//                     case 'D':  currentIndex = 5; break;
//                     case 'D#': currentIndex = 6; break;
//                     case 'E':  currentIndex = 7; break;
//                     case 'F':  currentIndex = 8; break;
//                     case 'F#': currentIndex = 9; break;
//                     case 'G':  currentIndex = 10; break;
//                     case 'G#': currentIndex = 11; break;
//                 }
//                 minKey = Math.max(currentIndex - parseInt($('#rootJumpSelection').val()), parseInt($('#lowestRootNoteSelection').val()));
//                 maxKey = Math.min(currentIndex + parseInt($('#rootJumpSelection').val()), parseInt($('#highestRootNoteSelection').val()));
//                 // console.log('Index:', currentIndex)
//                 // console.log('min:', parseInt($('#lowestRootNoteSelection').val()))
//                 // console.log('max:', parseInt($('#highestRootNoteSelection').val()))
//                 // console.log('minKey:', minKey)
//                 // console.log('maxKey:', maxKey)
//                 // var tempRoot = randomIntFromInterval(minKey, maxKey);
//                 // var distance = tempRoot - currentIndex;
//                 minKey = newRoot + (minKey - currentIndex);
//                 maxKey = newRoot + (maxKey - currentIndex);
//             }
//             // console.log('Current Midi Root:', newRoot);
//             // console.log('Minimum Midi Key: ', minKey);
//             // console.log('Maixmum Midi Key: ', maxKey);

//             minKey = clamp(minKey, parseInt($('#lowestNoteSelection').val()), parseInt($('#highestNoteSelection').val()) - 12)
//             maxKey = clamp(maxKey, parseInt($('#lowestNoteSelection').val()), parseInt($('#highestNoteSelection').val()) - 12)

//             var interval = parseInt($('#rootJumpRandomSelection').val());
//             // console.log('BarCounter:', barCounter,'interval:', interval,'mod:', barCounter % interval)
//             if(barCounter % interval == 0){
//                 // console.log('Changing Key')
//                 if(minKey != maxKey){
//                     var candidateRoot = randomIntFromInterval(minKey, maxKey);
//                     while(candidateRoot == newRoot){
//                         candidateRoot = randomIntFromInterval(minKey, maxKey);
//                     }
//                     // console.log('Changed from ', newRoot, 'to', candidateRoot)
//                     newRoot = candidateRoot;
//                 }

//             }

            
//             // console.log('Picked Key: ', newRoot)
//         }
//     }
//     var selectedDirection = 'up';
//     switch($("#octaveProgressionMode").val()){
//         case "0": selectedDirection = 'up'; break;
//         case "1": selectedDirection = 'down'; break;
//         case "2": selectedDirection = 'up/down'; break;
//         case "3": selectedDirection = 'random'; break;
//         case "4": selectedDirection = 'pattern'; break;
//     }

//     var scaleNotes = generateScale(noteToName(newRoot), newMode, newScale, 'up');
//     // console.log('Generated Scale:', scaleNotes)

//     var notes = scaleNotes;

//     if(selectedDirection == 'down')
//         scaleNotes = scaleNotes.reverse();
//     else if(selectedDirection == 'up');
//     else if(selectedDirection == 'up/down'){
//         if(priorDirection == null){
//             if(Math.random() > 0.5){
//                 notes = scaleNotes.reverse();
//                 selectedDirection = 'down'
//             }
//             else
//                 selectedDirection = 'up';
//         }
//         else if(!$('#octaveProgressionCheckBox')[0].checked){
//             if(priorDirection == 'up'){
//                 notes = scaleNotes.reverse();
//                 selectedDirection = 'down';
//             }
//             if(priorDirection == 'down')
//                 selectedDirection = 'up';
//         }else{
//             if(Math.random() > 0.5){
//                 if(priorDirection == 'up'){
//                     notes = scaleNotes.reverse();
//                     selectedDirection = 'down';
//                 }
//                 if(priorDirection == 'down')
//                     selectedDirection = 'up';
//             }
//             else{
//                 if(priorDirection == 'up'){
//                     newRoot = newRoot + 12;
//                     if(newRoot >= parseInt($('#highestNoteSelection').val())){
//                         newRoot = newRoot - 12;
//                         notes = scaleNotes.reverse();
//                         selectedDirection = 'down';
//                     }
//                     else{
//                         scaleNotes = generateScale(noteToName(newRoot), newMode, newScale, 'up');
//                         notes = scaleNotes;
//                         selectedDirection = 'up';
//                     }
//                 }
//                 if(priorDirection == 'down'){
//                     newRoot = newRoot - 12;
//                     if(newRoot <= parseInt($('#lowestNoteSelection').val())){
//                         newRoot = newRoot + 12;
//                         selectedDirection = 'up';
//                     }else{
//                         // console.log('Going to ', noteToName(newRoot + 12), 'from', noteToName(newRoot))
//                         scaleNotes = generateScale(noteToName(newRoot), newMode, newScale, 'up');
//                         notes = scaleNotes.reverse();
//                         selectedDirection = 'down';
//                     }
//                 }

//             }

//         }
//     }else if(priorDirection != null && $('#octaveProgressionCheckBox')[0].checked){
//         var lowestNote = parseInt($('#lowestNoteSelection').val());
//         var highestNote = parseInt($('#highestNoteSelection').val());

//         // console.log('current Root: ', currentRoot, 'min: ', lowestNote,' max: ', highestNote)

//         var octavesAbove = Math.floor(((highestNote - currentRoot - 12) / 12));
//         var octavesBelow = Math.floor(((currentRoot - lowestNote) / 12));

//         if($('#octaveJumpRandomSelection').val() == '1'){
//             octavesAbove = clamp(octavesAbove,0, parseInt($('#octaveJumpSelection').val()));
//             octavesBelow = clamp(octavesBelow,0, parseInt($('#octaveJumpSelection').val()));
//             var octave = randomIntFromInterval(-octavesBelow, octavesAbove);
//             newRoot = newRoot + octave * 12;
//             scaleNotes = generateScale(noteToName(newRoot), newMode, newScale, 'up');
//             notes = scaleNotes;
//         }
//         if($('#octaveJumpRandomSelection').val() == '2'){
//             octavesAbove = clamp(octavesAbove,0, parseInt($('#octaveJumpSelection').val()));
//             octavesBelow = clamp(octavesBelow,0, parseInt($('#octaveJumpSelection').val()));

//             var flip = Math.random() > 0.5;
//             if(flip < 1/3){}
//             else if(flip < 2/3){
//                 var octave = 1;
//                 while(Math.random() > 0.5){
//                     octave += 1;
//                 }
//                 octave = Math.max(octave, octavesAbove);
//                 newRoot = newRoot + octave * 12;
//                 scaleNotes = generateScale(noteToName(newRoot), newMode, newScale, 'up');
//                 notes = scaleNotes;
//             }
//             else{
//                 var octave = 1;
//                 while(Math.random() > 0.5){
//                     octave += 1;
//                 }
//                 octave = -Math.max(octave, octavesBelow);
//                 newRoot = newRoot + octave * 12;
//                 scaleNotes = generateScale(noteToName(newRoot), newMode, newScale, 'up');
//                 notes = scaleNotes;
//             }
//         }

//         // console.log(octavesAbove, octavesBelow)
//     }
//     notes = notes.slice(0,-1);
//     var selectedNotesElements = [];

//     if($('#octaveProgressionMode').val() == '4'){
//         selectedDirection = $('#octaveProgressionSequence').find(':selected')[0].innerHTML;
//         if(parseInt($('#octaveProgressionSequence').val()) == 12){
//             // complex case
//             var complexNotes = [];

//             var scaleNotes0 = parseInt($('#pattern1').val())
//             var scaleNotes1 = parseInt($('#pattern2').val())
//             var scaleNotes2 = parseInt($('#pattern3').val())
//             var scaleNotes3 = parseInt($('#pattern4').val())
//             var scaleNotes4 = parseInt($('#pattern5').val())
//             var scaleNotes5 = parseInt($('#pattern6').val())
//             var scaleNotes6 = parseInt($('#pattern7').val())
//             var scaleNotes7 = parseInt($('#pattern8').val())
//             selectedNotesElements = [scaleNotes0, scaleNotes1, scaleNotes2, scaleNotes3, scaleNotes4, scaleNotes5, scaleNotes6, scaleNotes7];
            
//             var scaleNotest = [scaleNotes0, scaleNotes1, scaleNotes2, scaleNotes3, scaleNotes4, scaleNotes5, scaleNotes6, scaleNotes7];
//             // var scaleNotest = [scaleNotes0, scaleNotes1, scaleNotes2];

//             for (var i = 0; i < scaleNotest.length; ++i){
//                 if (scaleNotest[i] != 7){
//                     complexNotes.push(notes[scaleNotest[i]]);
//                 }
//             }
//             notes = complexNotes;

//             console.log('Complex Notes:', notes);


//         }else if ($('#octaveProgressionSequence').val() == '13'){
//             // no progression
//             var noteStringInput = $('#customPatternInput').val() || '';

//             // Parse the string into an array of numbers, ignoring invalid entries
//             var selectedNotesElements_ = noteStringInput.split(' ');
//             // Fallback to default if input is empty or invalid
//             if (selectedNotesElements_.length === 0) {
//                 selectedNotesElements_ = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
//             }
//             for (var i = 0; i < selectedNotesElements_.length; ++i){
//                 selectedNotesElements_[i] = selectedNotesElements_[i].trim();
//                 console.log('Selected Note Element:', selectedNotesElements_[i]);
//                 if(selectedNotesElements_[i][0] == 'C' || selectedNotesElements_[i][0] == 'D' || selectedNotesElements_[i][0] == 'E'|| selectedNotesElements_[i][0] == 'F' || selectedNotesElements_[i][0] == 'G' || selectedNotesElements_[i][0] == 'A' || selectedNotesElements_[i][0] == 'B'){
//                     selectedNotesElements.push(selectedNotesElements_[i]);
//                 }
//             }


//             console.log('Custom Pattern Input:', selectedNotesElements);
//             // rootNoteName
//             notes = [];
//             for (var i = 0; i < selectedNotesElements.length; ++i){
//                 var substring = selectedNotesElements[i][0];
//                 if(substring == 'C' || substring == 'D' || substring == 'E' || substring == 'F' || substring == 'G' || substring == 'A' || substring == 'B'){
//                     console.log('Valid Note:', selectedNotesElements[i], 'Root Note: ', notes[0]);
//                     var rootNote = newRoot;
//                     var rootOctave = Math.floor(rootNote / 12);
//                     var currentNote = noteToMidi(substring + "/" + rootOctave);
//                     if(currentNote < rootNote){
//                         rootOctave += 1;
//                         currentNote = noteToMidi(substring + "/" + rootOctave);
//                     }
//                     // var noteName = substring + rootOctave;
//                     var noteName = noteToName(currentNote);
//                     notes.push(noteName);
//                     console.log('Custom Note:', noteName);
//                 }
//             }
                    
//             // notes = scaleNotes;
//         }       
//         else{
//         switch(parseInt($('#octaveProgressionSequence').val())){
//             case 0: break;
//             case 1: notes = shuffle(notes); break;
//             case 2: notes = [notes[0],notes[5], notes[6]]; break;
//             case 3: notes = [notes[0],notes[5], notes[2], notes[6]]; break;
//             case 4: notes = [notes[0],notes[3], notes[6]]; break;
//             case 5: notes = [notes[0],notes[3], notes[4], notes[0]]; break;
//             case 6: notes = [notes[0],notes[3], notes[0]]; break;
//             case 7: notes = [notes[0],notes[3], notes[4]]; break;
//             case 8: notes = [notes[5],notes[6], notes[0], notes[0]]; break;
//             case 9: notes = [notes[1],notes[4], notes[0]]; break;
//             case 10: notes = [notes[0],notes[0], notes[0], notes[0], notes[3], notes[3], notes[0], notes[0], notes[4], notes[3], notes[0], notes[0]]; break;
//             case 11: notes = [notes[0],notes[0], notes[0], notes[0], notes[3], notes[3], notes[0], notes[0], notes[4], notes[3], notes[0], notes[4]]; break;
//         }
//         console.log('Selected Notes:', notes);
//     }
//     }

//     for(var i = 0; i < parseInt($('#randomScaleSettings').val()); ++i){
//         var indexA = notes.length * Math.random() | 0;
//         var indexB = notes.length * Math.random() | 0;
//         var temp = notes[indexB];
//         notes[indexB] = notes[indexA];
//         notes[indexA] = temp;
//     }


//     // if($('#noteRemovalSettings').val() > 0){
//     if( parseInt($('#noteRemovalSettings').val()) == 6){
//         // console.log('notes before removal:', notes)
//         var index = notes.length * Math.random() | 0;
//         notes = [notes[index]];
//         // console.log('notes after removal:', notes, index)
//     }else{
//     for(var i = 0; i < parseInt($('#noteRemovalSettings').val()); ++i){
//         notes.splice(notes.length * Math.random() | 0, 1)
//     }
    
// }
//     // }
// var chordedNotes = []
//     if($('#chordCheckBox')[0].checked){
//         var reconstructedIntervals = []
//         for(var i = 1; i < scaleNotes.length; ++i)
//             reconstructedIntervals.push(noteToMidi(scaleNotes[i]) - noteToMidi(scaleNotes[i-1]))
//         // console.log(scaleNotes)
//         // console.log(notes)
//         // console.log('intervals were:', reconstructedIntervals)
//         reconstructedIntervals = reconstructedIntervals.concat(reconstructedIntervals)
//         reconstructedIntervals = reconstructedIntervals.concat(reconstructedIntervals)
//         var complexMode = false;
//         var chords = []
//         if($('#octaveProgressionMode').val() == '4'){
//             selectedDirection = $('#octaveProgressionSequence').find(':selected')[0].innerHTML;
//             if(parseInt($('#octaveProgressionSequence').val()) == 12){
//                 complexMode = true;
//                 var chord1 = parseInt($('#chord1').val());
//                 var chord2 = parseInt($('#chord2').val());
//                 var chord3 = parseInt($('#chord3').val());
//                 var chord4 = parseInt($('#chord4').val());
//                 var chord5 = parseInt($('#chord5').val());
//                 var chord6 = parseInt($('#chord6').val());
//                 var chord7 = parseInt($('#chord7').val());
//                 var chord8 = parseInt($('#chord8').val());
//                 var chordst = [chord1, chord2, chord3, chord4, chord5, chord6, chord7, chord8];
//                 console.log('Chord Patterns:', chordst);
//                 for (var i = 0; i < chordst.length; ++i){
//                     if(selectedNotesElements[i] != 7){
//                         chords.push(chordst[i]);
//                         // console.log('Chord:', chordst[i], ' at ', i, ' was selected');
//                     }
//                 }
//             }
//             else if ($('#octaveProgressionSequence').val() == '13'){
//                 complexMode = true;
//                 for (var i = 0; i < selectedNotesElements.length; ++i){
//                     var currentNote = selectedNotesElements[i];
//                     if(currentNote.length == 1){
//                         chords.push(2);
//                     }
//                     else{
//                         var substring = currentNote.slice(1);
//                         // You can use substring as needed here
//                         chords.push(chordStringToIndex(substring));
//                     }
//                 }
//             }
//         }
//         console.log('Chords:', chords);

//         for(var i = 0; i < notes.length; ++i){
//             var chord = []
//             var noteIndex = scaleNotes.findIndex((element) => element  == notes[i]);
//             chord.push(notes[i])
//             if(!complexMode){
//                 for(var c = 1; c < parseInt($('#chordDepthSelection').val()); ++c){
//                     var newNoteMidi = noteToMidi(chord.slice(-1)[0]) + 12 + reconstructedIntervals[noteIndex + 2 * c - 1] + reconstructedIntervals[noteIndex + 2 * c - 2]
//                     if(newNoteMidi > parseInt($('#highestNoteSelection').val()) || newNoteMidi < parseInt($('#lowestNoteSelection').val()))
//                         break;
//                     chord.push(noteToName(newNoteMidi))
//                 }
//             }
//             else{
//                 var currentChord = chords[i % chords.length];
//                 var currentChordIntervals = chordToIntervals(currentChord);
//                 console.log('Current Chord:', currentChord, 'Intervals:', currentChordIntervals);
//                 var rootNodeMidi = noteToMidi(chord[0]);
//                 console.log('Root Node Midi:', rootNodeMidi, 'Root Node Name:', chord[0]);
//                 for(var c = 1; c < currentChordIntervals.length; ++c){
//                     chord.push(noteToName(rootNodeMidi + currentChordIntervals[c] + 12));
//                 }
//                 console.log('Chord:', chord, ' at ', i, ' was selected');

//             }
//             // console.log('Note: ', notes[i], ' was at ', noteIndex);
//             // console.log('Chord:', chord)

//             var inversion = parseInt($('#chordInversionSelection').val())
//             var inversionStep = Math.ceil((noteToMidi(chord.slice(-1)[0]) - noteToMidi(chord[0])) / 12) * 12;
//             var inversions = [chord];
//             for(var c = 0; c < chord.length - 1; ++c){
//                 var referenceChord = inversions.slice(-1)[0]
//                 var invertedChord = []
//                 for(var j = 0; j < chord.length; ++j){
//                     var newNote = noteToMidi(referenceChord[c]) + 12 + inversionStep;
//                     // console.log(newNote, noteToMidi(referenceChord[c]) )
//                     if(newNote >= parseInt($('#highestNoteSelection').val()) || newNote < parseInt($('#lowestNoteSelection').val()))
//                         newNote = noteToMidi(referenceChord[c] + 12)
//                     // console.log(newNote, noteToName)
//                     invertedChord[j] = j != c ? referenceChord[j] : noteToName(newNote);
//                 }
//                 console.log(referenceChord, '-> ', invertedChord)
                
//                 inversions.push(invertedChord);
//             }
//             switch(inversion){
//                 case 2: chordedNotes.push(chord); break;
//                 case 3: chordedNotes.push(inversions[1]); break;
//                 case 4:{
//                     for(var inverted of inversions){
//                         chordedNotes.push(inverted);
//                     }
//                     break;
//                 }
//                 case 5:{
//                     inversions = inversions.reverse()
//                     for(var inverted of inversions){
//                         chordedNotes.push(inverted);
//                     }
//                     break;
//                 }
//                 case 6:{
//                     inversions = inversions.concat(inversions.slice(0,-1).reverse()).slice(0,-1)
//                     for(var inverted of inversions){
//                         chordedNotes.push(inverted);
//                     }
//                     break;
//                 }
//                 case 7:{
//                     inversions = inversions.concat(inversions.slice(0,-1).reverse()).slice(0,-1)
//                     inversions = shuffle(inversions)
//                     for(var inverted of inversions){
//                         chordedNotes.push(inverted);
//                     }
//                     break;
//                 }
//                 case 8: chordedNotes.push(inversions[randomIntFromInterval(0,inversions.length-1)]); break;
//             }

            
//         }
//         notes = chordedNotes;
        
//         if($('#arpegioButton')[0].checked){
//             var newNotes = []
//             for(var chord of notes){
//                 for(var note of chord){
//                     newNotes.push(note);
//                 }
//             }
//             notes = newNotes
//         }

//     }

//     var scale = {
//         notes: notes, 
//         scaleNotes: scaleNotes,
//         scale: newScale, 
//         mode: newMode, 
//         root: noteToName(newRoot), 
//         dir: selectedDirection, 
//         chorded: chordedNotes
//         // intervals : currentIntervals
//     } ;
    
//     return scale;

// }

// function generateFollowUpNotes(){
//     var lastNotes = outputNoteArray.slice(-1)[0];
//     // console.log('last note array:', lastNotes);

//     // currentRoot =  60 + parseInt($("#rootScaleSelect").val());
//     // currentScale =  $('#keyScaleSelect').val();
//     // currentMode = $("#modeScaleSelect").find(':selected')[0].innerHTML;
//     intervals = getScaleIntervals(currentMode);
//     // currentIntervals = currentScale == 0 ? intervals : intervals.slice(currentScale).concat(intervals.slice(0,currentScale));     

//     var scales = getScaleModes(currentMode);
//     // console.log('Generating Scale');
//     // var newDir = lastNotes['dir'] == 'up'? 'down' : 'up';
//     var newDir = Math.random() > 0.5 ? 'down' : 'up';

//     // console.log('Old direction:', lastNotes['dir']);
//     // console.log('New direction:', newDir);

//     var startingNote = 
//         lastNotes['dir'] == 'up' ? 
//             noteToName(noteToMidi(lastNotes['notes'][0]) + 24 ) :
//             noteToName(noteToMidi(lastNotes['notes'][0]) + 0 )
//     var bound = noteToMidi(startingNote) + 12 + (newDir == 'up' ? 12 : -12);
//     if( bound > 108 || bound < 21 )
//         newDir = newDir == 'down' ? 'up' : 'down';


//     currentRoot = newDir == 'up'  ? noteToMidi(startingNote) + 12 : noteToMidi(startingNote);

//     // console.log('Prior note:', lastNotes['notes'].slice(-1)[0]);
//     // console.log('Starting note: ', startingNote)
//     // console.log('Interval Step', lastNotes['intervals'].slice(-1)[0],  lastNotes['intervals'])
//     var scaleNotes = generateScale(startingNote, currentMode, scales[currentScale], newDir);
//     // console.log(scaleNotesUp.slice(-1));
//     // console.log(scaleNotesUp);
//     // var scaleNotesDown = generateScale(scaleNotesUp.slice(-1)[0], currentMode, scales[currentScale], 'down');

//     // console.log(scaleNotesDown);
//     // var scaleNotes = scaleNotesUp.slice(0,-1).concat( scaleNotesDown.slice(0,-1));

//     // document.getElementById("scaleText").innerHTML = outString;
//     outputNoteArray.push(
//         {notes: scaleNotes.slice(0,-1), scale: scales[currentScale], mode: currentMode, root: noteToName(currentRoot), dir: newDir, intervals : 
//             newDir == 'down' ? intervals.reverse() : intervals}, 
//         // {notes: scaleNotesDown.slice(0,-1), scale: scales[currentScale], mode: currentMode, root: noteToName(currentRoot), dir: 'down'}
//     );
// }

// function generateOutputNotes(reset = true){
//     if(reset){
//         barCounter = 0;
//         outputNoteArray = []
//     }

//     outputNoteArray.push(
//         generatePattern(null, 
//             $('#rootScaleSelect').find(':selected')[0].innerHTML, 
//             $('#modeScaleSelect').find(':selected')[0].innerHTML, 
//             $("#keyScaleSelect").find(':selected')[0].innerHTML)
//         );
//     barCounter++;

//     var la = parseInt($("#lookaheadSelection").val());
//     for(var i = 0; i < la; ++ i){
//         const prior = outputNoteArray.slice(-1)[0]
//         outputNoteArray.push(generatePattern(prior['dir'], prior['root'], prior['mode'], prior['scale']));
//         barCounter++;
//     }

//     selectedNote = 0;
//     // highlightNotes(outputNoteArray[0]['scaleNotes'][selectedNote])
//     highlightNotes(outputNoteArray[0]['notes'][selectedNote])

//     drawNotes(inputDiv, noteArray, true);
//     drawNotes(outputDiv, outputNoteArray, false);

//     return;
    
// }


// setScaleText();
// generateOutputNotes(true);

// console.log('outputNoteArray',outputNoteArray)
// console.log('outputNoteArray[0][notes]',outputNoteArray[0]['notes'])
// console.log('outputNoteArray[0][notes][selectedNote]',outputNoteArray[0]['notes'][selectedNote])

document.getElementById("inputText").innerHTML = 'You have pressed: ';
// document.getElementById("outputText").innerHTML = 'You should press: ' + outputNoteArray[0]['notes'][selectedNote];

// $('#modeScaleSelect').on('change', function (e) {
//     // console.log($("#modeScaleSelect").find(':selected')[0].innerHTML)
    
//     var scales = getScaleModes($("#modeScaleSelect").find(':selected')[0].innerHTML);

//     var i = 0;
//     var parsedScale = []
//     for(var scale of scales){
//         parsedScale.push('<option value ="' + i++ + '">' + scale + "</option>"); 
//     }
//     var scaleOptions = parsedScale.join(' ');
//     // console.log(scaleOptions);
    
//     $("#keyScaleSelect").html(scaleOptions);
//     $("#keyScaleSelect").val(0);
    
//     generateOutputNotes(true);

//     setScaleText()
// });
// $('#keyScaleSelect').on('change', function (e) {
//     generateOutputNotes(true);setScaleText()});
// $('#rootScaleSelect').on('change', function (e) {
//     generateOutputNotes(true);setScaleText()});

// $('#regenButton').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })


// $('#octaveProgressionMode').on('change', function (e) {
//     if($('#octaveProgressionMode').val() == '4'){
//         $('#octaveProgressionSequence').prop("disabled", false);
//     }
//     else
//         $('#octaveProgressionSequence').prop("disabled", true);
//     generateOutputNotes(true);
//     setScaleText()
//     // generateOutputNotes(true);setScaleText()
// });
// $('#octaveProgressionSequence').on('change', function (e) {
//     generateOutputNotes(true);
//     setScaleText()
//     // generateOutputNotes(true);setScaleText()
// });

// $('#arpegioButton').on('change', function (e) {
//     generateOutputNotes(true);
//     setScaleText()
//     // generateOutputNotes(true);setScaleText()
// });

$(document).ready(function() {
    $('#pianoCheckBox').on('change', function (e) {
        if($('#pianoCheckBox')[0].checked){
            $('#pianoContainer')[0].style.display = "flex"
        }else{
            $('#pianoContainer')[0].style.display = "none"

        }
    });
});
$(document).ready(function() {
    $('#promptCheckBox').on('change', function (e) {
        if($('#promptCheckBox')[0].checked){
            $('#outputContainer')[0].style.display = "flex"
        }else{
            $('#outputContainer')[0].style.display = "none"

        }
    });
    if ($('#promptCheckBox')[0].checked){
        $('#outputContainer')[0].style.display = "flex"
    }else{
        $('#outputContainer')[0].style.display = "none"
    }
});
$(document).ready(function() {
    $('#stavesCheckBox').on('change', function (e) {
        // console.log('stavebutton')
        // console.log($('#stavesCheckBox')[0].checked)
        // console.log($('#staveContainerBox')[0])
        // console.log($('#staveContainerBox')[0].style.display)
        if($('#stavesCheckBox')[0].checked){
            $('#staveContainerBox')[0].style.display = "flex"
        }else{
            $('#staveContainerBox')[0].style.display = "none"
        }
    });
    if ($('#stavesCheckBox')[0].checked){
        $('#staveContainerBox')[0].style.display = "flex"
    }else{
        $('#staveContainerBox')[0].style.display = "none"
    }
});



// console.log($('#rootScaleSelect').val())
// console.log($('#modeScaleSelect').val())
// console.log($('#keyScaleSelect').val())

// console.log($('#octaveProgressionMode').val())
// console.log($('#octaveProgressionSequence').val())

// console.log($('#randomScaleSettings').val())
// console.log($('#noteRemovalSettings').val())

// function encodeConfig(){
//     var rootScaleSelect = $('#rootScaleSelect').val().padStart(3,'0')
//     var modeScaleSelect = $('#modeScaleSelect').val().padStart(1,'0')
//     var keyScaleSelect = $('#keyScaleSelect').val().padStart(1,'0')
//     var octaveProgressionMode = $('#octaveProgressionMode').val().padStart(2,'0')
//     var octaveProgressionSequence = $('#octaveProgressionSequence').val().padStart(2,'0')
//     var randomScaleSettings = $('#randomScaleSettings').val().padStart(1,'0')
//     var noteRemovalSettings = $('#noteRemovalSettings').val().padStart(1,'0')

//     var scaleSettings = rootScaleSelect + modeScaleSelect + keyScaleSelect + octaveProgressionMode + octaveProgressionSequence + randomScaleSettings + noteRemovalSettings;

//     var scaleChangeButton = $('#scaleChangeButton')[0].checked ? '1' : '0'
//     var scaleChangeInterval = $('#scaleChangeInterval').val().padStart(1,'0')
//     var modeChangeButton = $('#modeChangeButton')[0].checked ? '1' : '0'
//     var modeChangeInterval = $('#modeChangeInterval').val().padStart(1,'0')
//     var modeIntervalDistance = $('#modeIntervalDistance').val().padStart(2,'0')

//     var scaleProgressionSettings = scaleChangeButton + scaleChangeInterval + modeChangeButton + modeChangeInterval + modeIntervalDistance


//     var rootProgressionCheckBox = $('#rootProgressionCheckBox')[0].checked ? '1' : '0'
//     var lowestRootNoteSelection = $('#lowestRootNoteSelection').val().padStart(2,'0')
//     var highestRootNoteSelection = $('#highestRootNoteSelection').val().padStart(2,'0')
//     var rootJumpSelection = $('#rootJumpSelection').val().padStart(2,'0')
//     var rootJumpRandomSelection = $('#rootJumpRandomSelection').val().padStart(1,'0')
//     var rootJumpRandomMode = $('#rootJumpRandomMode').val().padStart(1,'0')

//     var rootSettings = rootProgressionCheckBox + lowestRootNoteSelection + highestRootNoteSelection + rootJumpSelection + rootJumpRandomSelection + rootJumpRandomMode

//     var octaveProgressionCheckBox = $('#octaveProgressionCheckBox')[0].checked ? '1' : '0'
//     var lowestNoteSelection = $('#lowestNoteSelection').val().padStart(3,'0')
//     var highestNoteSelection = $('#highestNoteSelection').val().padStart(3,'0')
//     var octaveJumpSelection = $('#octaveJumpSelection').val().padStart(1,'0')
//     var octaveJumpRandomSelection = $('#octaveJumpRandomSelection').val().padStart(1,'0')

//     var octaveSettings = octaveProgressionCheckBox + lowestNoteSelection + highestNoteSelection + octaveJumpSelection + octaveJumpRandomSelection

//     var chordCheckBox = $('#chordCheckBox')[0].checked ? '1' : '0'
//     var chordDepthSelection = $('#chordDepthSelection').val().padStart(2,'0')
//     var chordInversionSelection = $('#chordInversionSelection').val().padStart(2,'0')
//     var arpegioButton = $('#arpegioButton')[0].checked ? '1' : '0'

//     var chordSettings = chordCheckBox + chordDepthSelection +  chordInversionSelection + arpegioButton;
    
//     var modeSignatureSelect = $('#modeSignatureSelect').val().padStart(1,'0')
//     var keySignatureSelect = $('#keySignatureSelect').val().padStart(2,'0')
//     var lookaheadSelection = $('#lookaheadSelection').val().padStart(1,'0')
//     var pianoCheckBox = $('#pianoCheckBox')[0].checked ? '1' : '0'
//     var stavesCheckBox = $('#stavesCheckBox')[0].checked ? '1' : '0'
//     var promptCheckBox = $('#promptCheckBox')[0].checked ? '1' : '0'

//     var generalSettings = modeSignatureSelect + keySignatureSelect + lookaheadSelection + pianoCheckBox + stavesCheckBox + promptCheckBox;

//     console.log(generalSettings);



//     var settings = scaleSettings + scaleProgressionSettings + rootSettings + octaveSettings + chordSettings + generalSettings;
    
//     var yoloMode = $('#yoloMode')[0].checked ? '1' : '0'
//     var synthesizerEnabled = $('#synthEnableBox')[0].checked ? '1' : '0'
//     var pattern1 = $('#pattern1').val().padStart(2,'0')
//     var pattern2 = $('#pattern2').val().padStart(2,'0')
//     var pattern3 = $('#pattern3').val().padStart(2,'0')
//     var pattern4 = $('#pattern4').val().padStart(2,'0')
//     var pattern5 = $('#pattern5').val().padStart(2,'0')
//     var pattern6 = $('#pattern6').val().padStart(2,'0')
//     var pattern7 = $('#pattern7').val().padStart(2,'0')
//     var pattern8 = $('#pattern8').val().padStart(2,'0')
//     var chord1 = $('#chord1').val().padStart(2,'0')
//     var chord2 = $('#chord2').val().padStart(2,'0')
//     var chord3 = $('#chord3').val().padStart(2,'0')
//     var chord4 = $('#chord4').val().padStart(2,'0')
//     var chord5 = $('#chord5').val().padStart(2,'0')
//     var chord6 = $('#chord6').val().padStart(2,'0')
//     var chord7 = $('#chord7').val().padStart(2,'0')
//     var chord8 = $('#chord8').val().padStart(2,'0')
//     var patternSettings = synthesizerEnabled + pattern1 + pattern2 + pattern3 + pattern4 + pattern5 + pattern6 + pattern7 + pattern8 + chord1 + chord2 + chord3 + chord4 + chord5 + chord6 + chord7 + chord8;

//     settings = settings + yoloMode + patternSettings;
//     console.log('btn', settings)
//     $('#presetCode').val(settings)

//     return settings
// }

// function decodeConfig(settings){
//     var scaleSettings = settings.slice(0, 11)
//     settings = settings.slice(11);
//     $('#rootScaleSelect').val(parseInt(scaleSettings.slice(0,3),10))
//     $('#modeScaleSelect').val(parseInt(scaleSettings.slice(3,4),10))
//     $('#keyScaleSelect').val(parseInt(scaleSettings.slice(4,5),10))
//     $('#octaveProgressionMode').val(parseInt(scaleSettings.slice(5,7),10))
//     $('#octaveProgressionSequence').val(parseInt(scaleSettings.slice(7,9),10))
//     $('#randomScaleSettings').val(parseInt(scaleSettings.slice(9,10),10))
//     $('#noteRemovalSettings').val(parseInt(scaleSettings.slice(10,11),10))

//     var scaleProgressionSettings = settings.slice(0,6)
//     settings = settings.slice(6);
//     $('#scaleChangeButton')[0].checked = parseInt(scaleProgressionSettings.slice(0,1),10) == 1
//     $('#scaleChangeInterval').val(parseInt(scaleProgressionSettings.slice(1,2),10))
//     $('#modeChangeButton')[0].checked = parseInt(scaleProgressionSettings.slice(2,3),10) == 1
//     $('#modeChangeInterval').val(parseInt(scaleProgressionSettings.slice(3,4),10))
//     $('#modeIntervalDistance').val(parseInt(scaleProgressionSettings.slice(4,6),10))

//     var rootSettings = settings.slice(0, 9);
//     settings = settings.slice(9);
//     $('#rootProgressionCheckBox')[0].checked = parseInt(rootSettings.slice(0,1),10) == 1
//     $('#lowestRootNoteSelection').val(parseInt(rootSettings.slice(1,3),10))
//     $('#highestRootNoteSelection').val(parseInt(rootSettings.slice(3,5),10))
//     $('#rootJumpSelection').val(parseInt(rootSettings.slice(5,7),10))
//     $('#rootJumpRandomSelection').val(parseInt(rootSettings.slice(7,8),10))
//     $('#rootJumpRandomMode').val(parseInt(rootSettings.slice(8,9),10))

//     var octaveSettings = settings.slice(0,9);
//     settings = settings.slice(9);
//     $('#octaveProgressionCheckBox')[0].checked = parseInt(octaveSettings.slice(0,1),10) == 1
//     $('#lowestNoteSelection').val(parseInt(octaveSettings.slice(1,4),10))
//     $('#highestNoteSelection').val(parseInt(octaveSettings.slice(4,7),10))
//     $('#octaveJumpSelection').val(parseInt(octaveSettings.slice(7,8),10))
//     $('#octaveJumpRandomSelection').val(parseInt(octaveSettings.slice(8,9),10))

//     var chordSettings = settings.slice(0,6);
//     settings = settings.slice(6);
//     $('#chordCheckBox')[0].checked = parseInt(chordSettings.slice(0,1),10) == 1
//     $('#chordDepthSelection').val(parseInt(chordSettings.slice(1,3),10))
//     $('#chordInversionSelection').val(parseInt(chordSettings.slice(3,5),10))
//     $('#arpegioButton')[0].checked = parseInt(chordSettings.slice(5,6),10) == 1

//     var generalSettings = settings.slice(0,7);
//     settings = settings.slice(7);
//     $('#modeSignatureSelect').val(parseInt(generalSettings.slice(0,1),10))
//     $('#keySignatureSelect').val(parseInt(generalSettings.slice(1,3),10))
//     $('#lookaheadSelection').val(parseInt(generalSettings.slice(3,4),10))
//     $('#pianoCheckBox')[0].checked = parseInt(generalSettings.slice(4,5),10) == 1
//     $('#stavesCheckBox')[0].checked = parseInt(generalSettings.slice(5,6),10) == 1
//     $('#promptCheckBox')[0].checked = parseInt(generalSettings.slice(6,7),10) == 1


//     console.log(scaleSettings, scaleProgressionSettings, rootSettings, octaveSettings, chordSettings, generalSettings);
    
//     var yoloMode = parseInt(settings.slice(0,1),10) == 1;
//     $('#yoloMode')[0].checked = yoloMode;
//     settings = settings.slice(1);

//     var synthesizerEnabled = parseInt(settings.slice(0,1),10) == 1;
//     $('#synthEnableBox')[0].checked = synthesizerEnabled;
//     settings = settings.slice(1);

//     var pattern1 = parseInt(settings.slice(0,2),10);
//     var pattern2 = parseInt(settings.slice(2,4),10);
//     var pattern3 = parseInt(settings.slice(4,6),10);
//     var pattern4 = parseInt(settings.slice(6,8),10);
//     var pattern5 = parseInt(settings.slice(8,10),10);
//     var pattern6 = parseInt(settings.slice(10,12),10);
//     var pattern7 = parseInt(settings.slice(12,14),10);
//     var pattern8 = parseInt(settings.slice(14,16),10);
//     $('#pattern1').val(pattern1);
//     $('#pattern2').val(pattern2);
//     $('#pattern3').val(pattern3);
//     $('#pattern4').val(pattern4);
//     $('#pattern5').val(pattern5);
//     $('#pattern6').val(pattern6);
//     $('#pattern7').val(pattern7);
//     $('#pattern8').val(pattern8);

//     var chord1 = parseInt(settings.slice(16,18),10);
//     var chord2 = parseInt(settings.slice(18,20),10);
//     var chord3 = parseInt(settings.slice(20,22),10);
//     var chord4 = parseInt(settings.slice(22,24),10);
//     var chord5 = parseInt(settings.slice(24,26),10);
//     var chord6 = parseInt(settings.slice(26,28),10);    
//     var chord7 = parseInt(settings.slice(28,30),10);
//     var chord8 = parseInt(settings.slice(30,32),10);
//     $('#chord1').val(chord1);
//     $('#chord2').val(chord2);
//     $('#chord3').val(chord3);
//     $('#chord4').val(chord4);
//     $('#chord5').val(chord5);   
//     $('#chord6').val(chord6);
//     $('#chord7').val(chord7);
//     $('#chord8').val(chord8);

//     var scales = getScaleModes($("#modeScaleSelect").find(':selected')[0].innerHTML);

//     var i = 0;
//     var parsedScale = []
//     for(var scale of scales){
//         parsedScale.push('<option value ="' + i++ + '">' + scale + "</option>"); 
//     }
//     var scaleOptions = parsedScale.join(' ');
//     // console.log(scaleOptions);
    
//     $("#keyScaleSelect").html(scaleOptions);
//     $("#keyScaleSelect").val(parseInt(scaleSettings.slice(4,5),10));
    
//     if($('#octaveProgressionMode').val() == '4'){
//         $('#octaveProgressionSequence').prop("disabled", false);
//     }
//     else
//         $('#octaveProgressionSequence').prop("disabled", true);

//     generateOutputNotes(true);

//     setScaleText()
//     if($('#stavesCheckBox')[0].checked){
//         $('#staveContainerBox')[0].style.display = "flex"
//     }else{
//         $('#staveContainerBox')[0].style.display = "none"
//     }
//     if($('#promptCheckBox')[0].checked){
//         $('#outputContainer')[0].style.display = "flex"
//     }else{
//         $('#outputContainer')[0].style.display = "none"

//     }
//     if($('#pianoCheckBox')[0].checked){
//         $('#container')[0].style.display = "flex"
//     }else{
//         $('#container')[0].style.display = "none"

//     }
// }


// var encoded = encodeConfig();


// var configToLoad = encoded;//'068240408001111061001106111021108511040210062';

function parse_query_string(query) {
    var vars = query.split("&");
    var query_string = {};
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split("=");
      var key = decodeURIComponent(pair.shift());
      var value = decodeURIComponent(pair.join("="));
      // If first entry with this name
      if (typeof query_string[key] === "undefined") {
        query_string[key] = value;
        // If second entry with this name
      } else if (typeof query_string[key] === "string") {
        var arr = [query_string[key], value];
        query_string[key] = arr;
        // If third or later entry with this name
      } else {
        query_string[key].push(value);
      }
    }
    return query_string;
  }

const queryString = window.location.search;
console.log(parse_query_string(queryString));
var parsedQuery = parse_query_string(queryString);
var configToLoad = '068240408001111061001106111021108511040210062'; // default config
if("?config" in  parsedQuery)
  configToLoad = parsedQuery['?config']
// window.location.search = "?BAKA";
// const urlParams = new URLSearchParams(queryString);
// console.log(urlParams)

// decodeConfig(configToLoad);
// var encoded = encodeConfig();

// $('#encodeButton').on('click', function(event){
//     var encoded = encodeConfig();
//     if (window.history.pushState) {
//         var newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?config="+encoded;;
//         window.history.pushState({path:newurl},'',newurl);
//     }
//     // window.location.search = 
// })

// $('#decodeButton').on('click', function(e){
//     decodeConfig($('#presetCode').val());
// })

// $('#regenButton').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton2').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton3').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton4').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton5').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton6').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton7').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })
// $('#regenButton8').on('click', function(e){
//     generateOutputNotes(true);
//     setScaleText()
//     currentBarIndex = 0;
//     currentNoteIndex = 0;
// })

// console.log($('#regenButton'))


// function playSelectedNote(){
//     var systainLevel = 0.5;
//     const osc = context.createOscillator();
//     const noteGain = context.createGain();
//     noteGain.gain.setValueAtTime(0, 0);
//     noteGain.gain.linearRampToValueAtTime(sustainLevel, context.currentTime + noteLength * attackTime);
//     noteGain.gain.setValueAtTime(sustainLevel, context.currentTime + noteLength - noteLength * releaseTime);
//     noteGain.gain.linearRampToValueAtTime(0, context.currentTime + noteLength);

//     var lfoGain = context.createGain();
//     lfoGain.gain.setValueAtTime(vibratoAmount, 0);
//     lfoGain.connect(osc.frequency)

//     var lfo = context.createOscillator();
//     lfo.frequency.setValueAtTime(vibratoSpeed, 0);
//     lfo.start(0);
//     lfo.stop(context.currentTime + noteLength);
//     lfo.connect(lfoGain); 

//     if(waveform == "custom")
//     osc.setPeriodicWave(customWaveform);
// else
//     osc.type = waveform;




//     osc.frequency.setValueAtTime(pianoNotes[outputNoteArray[0]['notes'].flat()[selectedNote]], 0);
//     osc.start(0);
//     osc.stop(context.currentTime + noteLength);
//     osc.connect(noteGain);

//     noteGain.connect(masterVolume);
//     noteGain.connect(delay);

// }

function playCurrentNote(gridAlign = false) {
    // console.log('Initializing context for metronome')
    metronome.initializeAudioContext();

    // console.log('Playing current note at time:', metronome.getCurrentTime());
    // console.log('Performance time to audio time:', metronome.performanceTimeToAudioTime(metronome.getCurrentTime()));

    let ct = metronome.getCurrentTime();
    let audioTime = metronome.performanceTimeToAudioTime(ct);

    let nextBeatTime = metronome.getNextNoteTime('eighth', false);
    // console.log('Next beat time:', nextBeatTime);
    let nextBeatAudioTime = metronome.performanceTimeToAudioTime(nextBeatTime);
    // console.log('Next beat audio time:', nextBeatAudioTime);

    return playCurrentNoteAtTime(audioTime, gridAlign);
}

$('#playButton').on('click', function(e) {
    // Use global grid data for single note playback
    // highlightPlaybackPosition(currentBarIndex, currentNoteIndex);
    playCurrentNote();
    highlightBothPositions();
})
// $('#playButton2').on('click', function(e) {playCurrentNote();})
// $('#playButton3').on('click', function(e) {playCurrentNote();})
// $('#playButton4').on('click', function(e) {playCurrentNote();})
// $('#playButton5').on('click', function(e) {playCurrentNote();})
// $('#playButton6').on('click', function(e) {playCurrentNote();})
// $('#playButton7').on('click', function(e) {playCurrentNote();})
// $('#playButton8').on('click', function(e) {playCurrentNote();})

$('#startButton').on('click', function(e) {
    if (!window.isPlaying){
        window.isPlaying = true; 
        // Reset sequencer timing for new playback session
        // nextNoteTime = 0.0;
        // Ensure metronome is running for timing synchronization
        // if (!metronome.isRunning) {
            // metronome.start();
        // }
        // Use global grid data for playback loop
        noteLoop();
    }
})
// $('#startButton2').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})
// $('#startButton3').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})
// $('#startButton4').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})
// $('#startButton5').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})
// $('#startButton6').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})
// $('#startButton7').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})
// $('#startButton8').on('click', function(e) {if (!isPlaying){isPlaying = true; noteLoop();}})

$('#stopButton').on('click', function(e) {
    window.isPlaying = false;
    // Clear any highlighting when stopping playback
    clearNoteHighlighting();
})
// $('#stopButton2').on('click', function(e) {isPlaying = false;})
// $('#stopButton3').on('click', function(e) {isPlaying = false;})
// $('#stopButton4').on('click', function(e) {isPlaying = false;})
// $('#stopButton5').on('click', function(e) {isPlaying = false;})
// $('#stopButton6').on('click', function(e) {isPlaying = false;})
// $('#stopButton7').on('click', function(e) {isPlaying = false;})
// $('#stopButton8').on('click', function(e) {isPlaying = false;})


const bpmSlider = document.querySelector('#bpmSlider');
function noteLoop() {
    metronome.initializeAudioContext();
    const secondsPerBeat = 60.0 / bpmSlider.value;
    if (window.isPlaying) {
        // Highlight current note being played
        highlightBothPositions();
        // highlightPlaybackPosition(currentBarIndex, currentNoteIndex);
        // highlightSelectedNotesSecondary(window.selectedBarIndex, window.selectedNoteIndex);
        
        let duration = playCurrentNote(true);
        nextNote();
        console.log('Next note duration:', duration, 'ms');
        
        window.setTimeout(function() {
            noteLoop();
        }, duration)
    } else {
        // Clear highlighting when playback stops
        clearNoteHighlighting();
        highlightSelectedNotesSecondary(window.selectedBarIndex, window.selectedNoteIndex);
    }
}

function nextNote() {
    currentNoteIndex++;
    
    // Check bounds using global grid data
    if (window.gridData && currentBarIndex < window.gridData.length) {
        if (currentNoteIndex >= window.gridData[currentBarIndex].notes.length) {
            // console.log('Moving to next bar from bar', currentBarIndex, 'to bar', currentBarIndex + 1);
            currentNoteIndex = 0;
            currentBarIndex = currentBarIndex + 1;
            if (currentBarIndex >= window.gridData.length) {
                // console.log('Wrapping around to start - total bars was', window.gridData.length);
                currentBarIndex = 0;
            }
        }
    } else {
        // console.log('Warning: no gridData available in global scope');
    }
    
    // Keep global variables in sync
    window.currentNoteIndex = currentNoteIndex;
    window.currentBarIndex = currentBarIndex;

    // setSelectedPosition(window.highlightedBarIndex, window.highlightedNoteIndex);
    // window.highlightedBarIndex
}

function notEventDurationToString(durationValue) {
    // Convert duration value to string representation
    // Handle dotted durations by stripping the dot
    const baseDuration = durationValue.replace('.', '');
    
    switch (baseDuration) {
        case 'w': return 'whole';
        case 'h': return 'half';
        case 'q':
        case '4': return 'quarter';
        case '8': return 'eighth';
        case '16': return 'sixteenth';
        default: throw new Error('Unknown duration value: ' + durationValue);
    }
}

function playCurrentNoteAtTime(audioTime, gridAlign = false) {

    console.log('Playing note at audio time:', audioTime, 'for bar:', currentBarIndex, 'note index:', currentNoteIndex);
    console.log('Metronome reference time:', metronome.referenceTime, 'ms');
    console.log('Performance time to audio time:', metronome.performanceTimeToAudioTime(metronome.referenceTime), 'ms');
    if (!window.gridData) {
        console.log('Warning: no gridData available in global scope');
        return;
    }

    // Reset position if out of bounds
    if (currentBarIndex >= window.gridData.length) {
        currentBarIndex = 0;
        currentNoteIndex = 0;
        // Keep global variables in sync
        window.currentBarIndex = currentBarIndex;
        window.currentNoteIndex = currentNoteIndex;
    }
    
    // Check if current position is valid within grid data
    if (currentBarIndex >= window.gridData.length || currentNoteIndex >= window.gridData[currentBarIndex].notes.length) {
        console.log('Invalid position in grid data, skipping playback');
        return;
    }

    const noteEvent = window.gridData[currentBarIndex].notes[currentNoteIndex];
    // Calculate note duration in seconds based on durationValue and current tempo
    const noteDurationSeconds = (60.0 / bpmSlider.value) * noteEvent.durationValue;

    if(gridAlign){
        let nextBeatTime = metronome.getNextNoteTime(notEventDurationToString(noteEvent.duration), false);
        // console.log('Next beat time:', nextBeatTime);
        audioTime = metronome.performanceTimeToAudioTime(nextBeatTime);
    }

    if (noteEvent.isPause) {
        // console.log('playing pause/rest');
        return noteDurationSeconds; // Don't play anything for pauses
    }
    
    // const notesToPlay = noteEvent.notes;
    // console.log('playing grid data notes:', noteEvent, bpmSlider.value, 'at bar:', currentBarIndex, 'note index:', currentNoteIndex);

    console.log('Not event:', noteEvent, 'at audio time:', audioTime, 'with duration:', noteDurationSeconds, 'seconds');

    const notesToPlay = [];
    const durationsToPlay = [];

    for(let i = 0; i < noteEvent.trebleNotes.length; i++) {
        notesToPlay.push(noteEvent.trebleNotes[i]);
        durationsToPlay.push(noteEvent.trebleDurations[i]);
    }
    for(let i = 0; i < noteEvent.bassNotes.length; i++) {
        notesToPlay.push(noteEvent.bassNotes[i]);
        durationsToPlay.push(noteEvent.bassDurations[i]);
    }

        // Helper function to convert duration to beat value
    function getDurationValue(duration) {
        const isDotted = duration.includes('.');
        const baseDuration = duration.replace('.', '');
        
        let baseValue = baseDuration === 'w' ? 4 : 
                       baseDuration === 'h' ? 2 : 
                       baseDuration === 'q' || baseDuration === '4' ? 1 : 
                       baseDuration === '8' ? 0.5 : 
                       baseDuration === '16' ? 0.25 : 1;
        
        // Dotted notes are 1.5 times the base duration
        return isDotted ? baseValue * 1.5 : baseValue;
    }
    let delay = metronome.timePerBeat;
    // Play the notes
    if (notesToPlay.length === 1) {
        // Single note
        // Also play with PolySynth if enabled
        if (polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            const noteWithOctave = convertNoteNameToPolySynthFormat(notesToPlay[0]);
            if (noteWithOctave) {
                // Schedule the note to play at the precise audio time
                delay = schedulePolySynthNote([noteWithOctave], audioTime, noteDurationSeconds * 1000);
            }
        }
    } else if (notesToPlay.length > 1) {
        // Multiple notes (chord)
        // console.log('playing chord notes:', notesToPlay);
        // Also play with PolySynth if enabled
        if (polySynthRef && $('#polySynthMidiBox') && $('#polySynthMidiBox')[0].checked) {
            const chordNotes = notesToPlay.map(note => convertNoteNameToPolySynthFormat(note)).filter(n => n);
            let delays = []
            for(let n = 0; n < notesToPlay.length; n++) {
                let note = notesToPlay[n];
                let noteDuration = durationsToPlay[n];
                const noteDurationSeconds = (60.0 / bpmSlider.value) * getDurationValue(noteDuration);
                let currentDelay = schedulePolySynthNote([note], audioTime, noteDurationSeconds * 1000);
                delays.push(currentDelay);
                // console.log('Converted chord note for PolySynth:', chordNotes[n]);
            }
            delay = Math.max(...delays); // Use the longest delay for chord playback

            // console.log('Converted chord notes for PolySynth:', chordNotes);
            // if (chordNotes.length > 0) {
                // console.log('Playing chord with PolySynth:', chordNotes, 'bpm:', bpmSlider.value);
                // delay = schedulePolySynthNote(chordNotes, audioTime, noteDurationSeconds * 1000);
            // }
        }
    }
    return delay + 0.01;
}

// Helper function to schedule PolySynth notes at precise timing
function schedulePolySynthNote(notes, audioTime, durationMs) {
    console.log('Scheduling PolySynth note at audio time:', audioTime, 'with duration:', durationMs, 'ms', 'current time:', context.currentTime, 'notes:', notes);
    // Calculate delay from current audio time to scheduled time
    const delayMs = Math.max(0, (audioTime - metronome.performanceTimeToAudioTime(metronome.getCurrentTime())) * 1000);

    console.log('Current audio time:', metronome.referenceTime, 'ms');
    console.log('Calculated delay for PolySynth note:', delayMs, 'ms');

    setTimeout(() => {
        // if (window.isPlaying) {
            console.log('Playing PolySynth note at scheduled time:', audioTime, 'with notes:', notes);
            playNote2(notes, 60, durationMs);
        // }
    }, delayMs);
    return delayMs;
}

function playNote(note, chordSize = 1) {
    const osc = context.createOscillator();
    const noteGain = context.createGain();
    noteGain.gain.setValueAtTime(0, 0);
    
    // Adjust volume based on chord size
    const adjustedSustainLevel = chordSize > 1 ? (0.5 / chordSize) : sustainLevel;
    noteGain.gain.linearRampToValueAtTime(adjustedSustainLevel, context.currentTime + noteLength * attackTime);
    noteGain.gain.setValueAtTime(adjustedSustainLevel, context.currentTime + noteLength - noteLength * releaseTime);
    noteGain.gain.linearRampToValueAtTime(0, context.currentTime + noteLength);

    var lfoGain = context.createGain();
    lfoGain.gain.setValueAtTime(vibratoAmount, 0);
    lfoGain.connect(osc.frequency);

    var lfo = context.createOscillator();
    lfo.frequency.setValueAtTime(vibratoSpeed, 0);
    lfo.start(0);
    lfo.stop(context.currentTime + noteLength);
    lfo.connect(lfoGain); 

    if (waveform == "custom") {
        osc.setPeriodicWave(customWaveform);
    } else {
        osc.type = waveform;
    }

    osc.frequency.setValueAtTime(pianoNotes[note], 0);
    osc.start(0);
    osc.stop(context.currentTime + noteLength);
    osc.connect(noteGain);

    noteGain.connect(masterVolume);
    noteGain.connect(delay);
}

// New function for programmatic note playing using PolySynth
function playNote2(notes, volume = 50, duration = null) {
    if (!polySynthRef) {
        console.warn('PolySynth not ready yet. Cannot play notes programmatically.');
        return;
    }
    
    // Ensure notes is an array
    const notesArray = Array.isArray(notes) ? notes : [notes];
    
    // console.log('Playing notes programmatically:', notesArray, 'Volume:', volume, 'Duration:', duration);
    
    // Convert duration from milliseconds to match expected format if provided
    const durationMs = duration ? duration : null;
    
    polySynthRef.playNotes(notesArray, volume, durationMs);
}

// Helper function to convert note names from MIDI format to PolySynth format
function convertNoteNameToPolySynthFormat(noteName) {
    // console.log('Converting note name for PolySynth:', noteName);
    noteName = noteName.replace('/','')
    // noteName comes in format like "C4", "D#3", etc.
    // PolySynth expects the same format, so we can return as-is
    // But we need to ensure it has an octave number
    if (/^[A-G]#?\d+$/.test(noteName)) {
        return noteName;
    }
    
    // If no octave specified, default to octave 4
    if (/^[A-G]#?$/.test(noteName)) {
        return noteName + '4';

    }
    console.warn('Invalid note format for PolySynth:', noteName);    
    return null; // Invalid format
}

// Function to stop specific notes
function stopNotes2(notes) {
    if (!polySynthRef) {
        console.warn('PolySynth not ready yet. Cannot stop notes programmatically.');
        return;
    }
    
    const notesArray = Array.isArray(notes) ? notes : [notes];
    polySynthRef.stopNotes(notesArray);
}

// Function to stop all notes
function stopAllNotes2() {
    if (!polySynthRef) {
        console.warn('PolySynth not ready yet. Cannot stop notes programmatically.');
        return;
    }
    
    polySynthRef.stopAllNotes();
}

// Make functions globally available
window.playNote2 = playNote2;
window.stopNotes2 = stopNotes2;
window.stopAllNotes2 = stopAllNotes2;

// Add some test functions for debugging
// window.testPolySynth = () => {
//     console.log('Testing PolySynth...');
//     console.log('PolySynth ref:', polySynthRef);
    
//     // Play a C major chord
//     playNote2(['C4', 'E4', 'G4'], 70, 2000);
    
//     setTimeout(() => {
//         // Play a different chord
//         playNote2(['F4', 'A4', 'C5'], 50, 1500);
//     }, 2500);
    
//     console.log('Test chords scheduled. Check audio output.');
// };

// // Add debug function to check active notes
// window.checkActiveNotes = () => {
//     if (polySynthRef) {
//         console.log('PolySynth is ready');
//         // We can't directly access the internal state, but we can check if it's working
//         console.log('PolySynth functions available:', {
//             playNotes: typeof polySynthRef.playNotes,
//             stopNotes: typeof polySynthRef.stopNotes,
//             stopAllNotes: typeof polySynthRef.stopAllNotes,
//             isActive: typeof polySynthRef.isActive
//         });
//         if (polySynthRef.isActive) {
//             console.log('PolySynth is active:', polySynthRef.isActive());
//         }
//     } else {
//         console.log('PolySynth ref not available');
//     }
// };

// // Example: Add buttons to test the functionality
// document.addEventListener('DOMContentLoaded', () => {
//     // Create a test section in the UI
//     const testSection = document.createElement('div');
//     testSection.innerHTML = `
//         <div style="margin: 20px; padding: 10px; border: 1px solid #ccc; background: #f9f9f9;">
//             <h3>PolySynth Test Controls</h3>
//             <button id="testCMajor">Play C Major Chord</button>
//             <button id="testScale">Play C Scale</button>
//             <button id="testArpeggio">Play Arpeggio</button>
//             <button id="stopAll">Stop All Notes</button>
//             <button id="checkNotes">Check Active Notes</button>
//         </div>
//     `;
    
//     // Insert after the first element in body
//     if (document.body.firstChild) {
//         document.body.insertBefore(testSection, document.body.firstChild);
//     } else {
//         document.body.appendChild(testSection);
//     }
    
//     // Add event listeners
//     document.getElementById('testCMajor')?.addEventListener('click', () => {
//         playNote2(['C4', 'E4', 'G4'], 60, 2000);
//     });
    
//     document.getElementById('testScale')?.addEventListener('click', () => {
//         const scale = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
//         scale.forEach((note, index) => {
//             setTimeout(() => {
//                 playNote2([note], 50, 400);
//             }, index * 300);
//         });
//     });
    
//     document.getElementById('testArpeggio')?.addEventListener('click', () => {
//         console.log('Starting arpeggio...');
//         const arpeggio = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4'];
//         arpeggio.forEach((note, index) => {
//             console.log(`Scheduling note ${note} at ${index * 200}ms for 600ms duration`);
//             setTimeout(() => {
//                 playNote2([note], 70, 600);
//             }, index * 200);
//         });
//         console.log('All arpeggio notes scheduled');
//     });
    
//     document.getElementById('stopAll')?.addEventListener('click', () => {
//         console.log('Stop all button clicked');
//         stopAllNotes2();
//     });
    
//     document.getElementById('checkNotes')?.addEventListener('click', () => {
//         window.checkActiveNotes();
//     });
// });

updateOutputText()


// drawNotes(outputDiv, outputNoteArray, false);


// Interval Practice Interface Initialization
function initializeIntervalPractice() {
    const intervalTabPlaceholder = document.getElementById('IntervalTabPlaceholder');
    if (!intervalTabPlaceholder) {
        console.error('IntervalTabPlaceholder not found');
        return;
    }

    // Define chromatic scale notes and intervals for the 12x12 grid
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const intervals = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4/d5', 'P5', 'm6', 'M6', 'm7', 'M7'];

    // Create the main container
    const container = document.createElement('div');
    container.style.cssText = `
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
        font-family: Arial, sans-serif;
    `;

    // Create title
    const title = document.createElement('h2');
    title.textContent = 'Interval Listening Practice';
    title.style.cssText = `
        text-align: center;
        margin-bottom: 20px;
        color: #333;
    `;
    container.appendChild(title);

    // Create instruction text
    const instructions = document.createElement('p');
    instructions.textContent = 'Select root notes (rows) and intervals (columns) to practice. Click a cell to toggle it on/off.';
    instructions.style.cssText = `
        text-align: center;
        margin-bottom: 20px;
        color: #666;
        font-size: 14px;
    `;
    container.appendChild(instructions);

    // Create main content container (grid + controls side by side)
    const mainContent = document.createElement('div');
    mainContent.style.cssText = `
        display: flex;
        gap: 30px;
        align-items: flex-start;
        justify-content: center;
        flex-wrap: wrap;
    `;

    // Create the grid container
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        display: grid;
        grid-template-columns: 60px repeat(12, 1fr);
        grid-template-rows: 30px repeat(12, 1fr);
        gap: 2px;
        max-width: 600px;
        background-color: #f5f5f5;
        padding: 10px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    // Create top-left corner cell (empty)
    const cornerCell = document.createElement('div');
    cornerCell.style.cssText = `
        background-color: #e0e0e0;
        border: 1px solid #ccc;
        border-radius: 4px;
    `;
    gridContainer.appendChild(cornerCell);

    // Create interval header row
    intervals.forEach((interval, colIndex) => {
        const headerCell = document.createElement('div');
        headerCell.textContent = interval;
        headerCell.dataset.colIndex = colIndex;
        headerCell.style.cssText = `
            background-color: #d0d0d0;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 11px;
            text-align: center;
            cursor: pointer;
            transition: background-color 0.2s ease;
        `;
        
        // Add hover effect for column headers
        headerCell.addEventListener('mouseenter', () => {
            headerCell.style.backgroundColor = '#c0c0c0';
        });
        
        headerCell.addEventListener('mouseleave', () => {
            headerCell.style.backgroundColor = '#d0d0d0';
        });
        
        // Add click handler for column selection
        headerCell.addEventListener('click', () => {
            toggleColumn(colIndex);
        });
        
        gridContainer.appendChild(headerCell);
    });

    // Create rows for each chromatic note
    chromaticNotes.forEach((note, rowIndex) => {
        // Create note label (row header)
        const noteLabel = document.createElement('div');
        noteLabel.textContent = note;
        noteLabel.dataset.rowIndex = rowIndex;
        noteLabel.style.cssText = `
            background-color: #d0d0d0;
            border: 1px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        `;
        
        // Add hover effect for row headers
        noteLabel.addEventListener('mouseenter', () => {
            noteLabel.style.backgroundColor = '#c0c0c0';
        });
        
        noteLabel.addEventListener('mouseleave', () => {
            noteLabel.style.backgroundColor = '#d0d0d0';
        });
        
        // Add click handler for row selection
        noteLabel.addEventListener('click', () => {
            toggleRow(rowIndex);
        });
        
        gridContainer.appendChild(noteLabel);

        // Create interval cells for this note
        intervals.forEach((interval, colIndex) => {
            const cell = document.createElement('div');
            cell.dataset.note = note;
            cell.dataset.interval = interval;
            cell.dataset.row = rowIndex;
            cell.dataset.col = colIndex;
            
            cell.style.cssText = `
                background-color: #ffffff;
                border: 2px solid #ccc;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                position: relative;
            `;

            // Add hover effect
            cell.addEventListener('mouseenter', () => {
                if (!cell.classList.contains('selected')) {
                    cell.style.backgroundColor = '#f0f0f0';
                }
            });

            cell.addEventListener('mouseleave', () => {
                if (!cell.classList.contains('selected')) {
                    cell.style.backgroundColor = '#ffffff';
                }
            });

            // Add click handler to toggle selection
            cell.addEventListener('click', () => {
                cell.classList.toggle('selected');
                if (cell.classList.contains('selected')) {
                    cell.style.backgroundColor = '#4CAF50';
                    cell.style.borderColor = '#45a049';
                    cell.style.color = 'white';
                    cell.textContent = '✓';
                } else {
                    cell.style.backgroundColor = '#ffffff';
                    cell.style.borderColor = '#ccc';
                    cell.style.color = 'black';
                    cell.textContent = '';
                }
                updateSelectedIntervals();
            });

            gridContainer.appendChild(cell);
        });
    });

    // Add grid to main content
    mainContent.appendChild(gridContainer);

    // Create practice configuration panel
    const configPanel = document.createElement('div');
    configPanel.style.cssText = `
        background-color: #f9f9f9;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        min-width: 280px;
        max-width: 300px;
    `;

    // Practice Configuration Title
    const configTitle = document.createElement('h3');
    configTitle.textContent = 'Practice Settings';
    configTitle.style.cssText = `
        margin: 0 0 15px 0;
        color: #333;
        font-size: 16px;
        text-align: center;
    `;
    configPanel.appendChild(configTitle);

    // Number of tries setting
    const triesContainer = document.createElement('div');
    triesContainer.style.cssText = `margin-bottom: 15px;`;
    
    const triesLabel = document.createElement('label');
    triesLabel.textContent = 'Number of tries: ';
    triesLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
        font-size: 14px;
    `;
    
    const triesInput = document.createElement('input');
    triesInput.type = 'number';
    triesInput.id = 'practiceTriesInput';
    triesInput.min = '1';
    triesInput.max = '12';
    triesInput.value = '3';
    triesInput.style.cssText = `
        width: 100%;
        padding: 5px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
    `;
    
    triesContainer.appendChild(triesLabel);
    triesContainer.appendChild(triesInput);
    configPanel.appendChild(triesContainer);

    // Number of relistens setting
    const relistensContainer = document.createElement('div');
    relistensContainer.style.cssText = `margin-bottom: 15px;`;
    
    const relistensLabel = document.createElement('label');
    relistensLabel.textContent = 'Number of relistens: ';
    relistensLabel.style.cssText = `
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
        font-size: 14px;
    `;
    
    const relistensInput = document.createElement('input');
    relistensInput.type = 'number';
    relistensInput.id = 'practiceRelistensInput';
    relistensInput.min = '0';
    relistensInput.max = '6';
    relistensInput.value = '2';
    relistensInput.style.cssText = `
        width: 100%;
        padding: 5px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
    `;
    
    relistensContainer.appendChild(relistensLabel);
    relistensContainer.appendChild(relistensInput);
    configPanel.appendChild(relistensContainer);

    // Infinite relistens checkbox
    const infiniteContainer = document.createElement('div');
    infiniteContainer.style.cssText = `
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    const infiniteCheckbox = document.createElement('input');
    infiniteCheckbox.type = 'checkbox';
    infiniteCheckbox.id = 'infiniteRelistensCheckbox';
    infiniteCheckbox.style.cssText = `
        width: 16px;
        height: 16px;
        cursor: pointer;
    `;
    
    const infiniteLabel = document.createElement('label');
    infiniteLabel.textContent = 'Infinite relistens';
    infiniteLabel.htmlFor = 'infiniteRelistensCheckbox';
    infiniteLabel.style.cssText = `
        font-weight: bold;
        font-size: 14px;
        cursor: pointer;
    `;
    
    // Handle infinite checkbox logic
    infiniteCheckbox.addEventListener('change', () => {
        relistensInput.disabled = infiniteCheckbox.checked;
        relistensInput.style.opacity = infiniteCheckbox.checked ? '0.5' : '1';
    });
    
    infiniteContainer.appendChild(infiniteCheckbox);
    infiniteContainer.appendChild(infiniteLabel);
    configPanel.appendChild(infiniteContainer);

    // Practice control buttons
    const controlButtonsContainer = document.createElement('div');
    controlButtonsContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;

    // Replay button
    const replayBtn = document.createElement('button');
    replayBtn.textContent = '🔊 Replay Interval';
    replayBtn.id = 'replayIntervalBtn';
    replayBtn.style.cssText = `
        padding: 10px 15px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: background-color 0.2s ease;
    `;
    replayBtn.addEventListener('mouseenter', () => {
        replayBtn.style.backgroundColor = '#1976D2';
    });
    replayBtn.addEventListener('mouseleave', () => {
        replayBtn.style.backgroundColor = '#2196F3';
    });
    replayBtn.addEventListener('click', replayCurrentInterval);

    // Skip button
    const skipBtn = document.createElement('button');
    skipBtn.textContent = '⏭️ Skip to Next';
    skipBtn.id = 'skipIntervalBtn';
    skipBtn.style.cssText = `
        padding: 10px 15px;
        background-color: #FF9800;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        transition: background-color 0.2s ease;
    `;
    skipBtn.addEventListener('mouseenter', () => {
        skipBtn.style.backgroundColor = '#F57C00';
    });
    skipBtn.addEventListener('mouseleave', () => {
        skipBtn.style.backgroundColor = '#FF9800';
    });
    skipBtn.addEventListener('click', skipToNextInterval);

    controlButtonsContainer.appendChild(replayBtn);
    controlButtonsContainer.appendChild(skipBtn);
    configPanel.appendChild(controlButtonsContainer);

    // Practice status display
    const statusDisplay = document.createElement('div');
    statusDisplay.id = 'practiceStatusDisplay';
    statusDisplay.style.cssText = `
        margin-top: 15px;
        padding: 10px;
        background-color: #e3f2fd;
        border-radius: 4px;
        font-size: 12px;
        color: #333;
        text-align: center;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    statusDisplay.textContent = 'Select intervals and click "Play Random Interval" to start practicing!';
    configPanel.appendChild(statusDisplay);

    // Add config panel to main content
    mainContent.appendChild(configPanel);

    container.appendChild(mainContent);

    // Create control buttons
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;
    `;

    // Select All button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.style.cssText = `
        padding: 8px 16px;
        background-color: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    `;
    selectAllBtn.addEventListener('click', () => {
        const cells = gridContainer.querySelectorAll('[data-note]');
        cells.forEach(cell => {
            if (!cell.classList.contains('selected')) {
                cell.click();
            }
        });
    });

    // Clear All button
    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.style.cssText = `
        padding: 8px 16px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    `;
    clearAllBtn.addEventListener('click', () => {
        const cells = gridContainer.querySelectorAll('[data-note].selected');
        cells.forEach(cell => cell.click());
    });

    // Play Random button
    const playRandomBtn = document.createElement('button');
    playRandomBtn.textContent = 'Play Random Interval';
    playRandomBtn.style.cssText = `
        padding: 8px 16px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    `;
    playRandomBtn.addEventListener('click', playRandomInterval);

    controlsContainer.appendChild(selectAllBtn);
    controlsContainer.appendChild(clearAllBtn);
    controlsContainer.appendChild(playRandomBtn);
    container.appendChild(controlsContainer);

    // Create guess input section
    const guessSection = document.createElement('div');
    guessSection.style.cssText = `
        margin-top: 30px;
        padding: 20px;
        background-color: #f9f9f9;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    // Guess section title
    const guessTitle = document.createElement('h3');
    guessTitle.textContent = 'Make Your Guess';
    guessTitle.style.cssText = `
        text-align: center;
        margin: 0 0 15px 0;
        color: #333;
        font-size: 18px;
    `;
    guessSection.appendChild(guessTitle);

    // Guess instruction
    const guessInstruction = document.createElement('p');
    guessInstruction.textContent = 'Click the notes you hear in the interval. Click multiple times to cycle: Off → 1 → 2 → Off';
    guessInstruction.style.cssText = `
        text-align: center;
        margin-bottom: 20px;
        color: #666;
        font-size: 12px;
    `;
    guessSection.appendChild(guessInstruction);

    // Create guess buttons container
    const guessButtonsContainer = document.createElement('div');
    guessButtonsContainer.style.cssText = `
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 20px;
    `;

    // Create guess buttons for each chromatic note
    chromaticNotes.forEach(note => {
        const guessBtn = document.createElement('button');
        guessBtn.textContent = note;
        guessBtn.dataset.note = note;
        guessBtn.dataset.state = '0'; // 0 = off, 1 = once, 2 = twice
        guessBtn.style.cssText = `
            width: 45px;
            height: 45px;
            border: 2px solid #ccc;
            border-radius: 50%;
            background-color: #ffffff;
            color: #333;
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;

        // Add click handler for cycling through states
        guessBtn.addEventListener('click', () => {
            cycleGuessButtonState(guessBtn);
            updateGuessDisplay();
        });

        guessButtonsContainer.appendChild(guessBtn);
    });

    guessSection.appendChild(guessButtonsContainer);

    // Create guess action buttons
    const guessActionsContainer = document.createElement('div');
    guessActionsContainer.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 15px;
        margin-bottom: 15px;
    `;

    // Submit guess button
    const submitGuessBtn = document.createElement('button');
    submitGuessBtn.textContent = '✓ Submit Guess';
    submitGuessBtn.style.cssText = `
        padding: 10px 20px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
    `;
    submitGuessBtn.addEventListener('click', submitGuess);

    // Clear guess button
    const clearGuessBtn = document.createElement('button');
    clearGuessBtn.textContent = '✗ Clear Guess';
    clearGuessBtn.style.cssText = `
        padding: 10px 20px;
        background-color: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
    `;
    clearGuessBtn.addEventListener('click', clearGuess);

    guessActionsContainer.appendChild(submitGuessBtn);
    guessActionsContainer.appendChild(clearGuessBtn);
    guessSection.appendChild(guessActionsContainer);

    // Create guess display
    const guessDisplay = document.createElement('div');
    guessDisplay.id = 'guessDisplay';
    guessDisplay.style.cssText = `
        text-align: center;
        padding: 10px;
        background-color: #e3f2fd;
        border-radius: 4px;
        font-size: 12px;
        color: #333;
        min-height: 20px;
    `;
    guessDisplay.textContent = 'No notes selected';
    guessSection.appendChild(guessDisplay);

    container.appendChild(guessSection);

    // Add selected intervals display
    const selectedDisplay = document.createElement('div');
    selectedDisplay.id = 'selectedIntervalsDisplay';
    selectedDisplay.style.cssText = `
        margin-top: 20px;
        padding: 10px;
        background-color: #f9f9f9;
        border-radius: 4px;
        min-height: 40px;
        font-size: 12px;
        color: #333;
    `;
    container.appendChild(selectedDisplay);

    // Append to the placeholder
    intervalTabPlaceholder.appendChild(container);

    // Initialize with some default selections (optional)
    updateSelectedIntervals();
}

// Practice state variables
let currentPracticeInterval = null;
let practiceTriesRemaining = 0;
let practiceRelistensRemaining = 0;
let practiceStats = { correct: 0, total: 0 };

// Function to update the display of selected intervals
function updateSelectedIntervals() {
    const selectedCells = document.querySelectorAll('[data-note].selected');
    const display = document.getElementById('selectedIntervalsDisplay');
    
    if (selectedCells.length === 0) {
        display.textContent = 'No intervals selected. Click on grid cells to select intervals for practice.';
        return;
    }

    const intervals = [];
    selectedCells.forEach(cell => {
        const note = cell.dataset.note;
        const interval = cell.dataset.interval;
        intervals.push(`${note} + ${interval}`);
    });

    display.innerHTML = `
        <strong>Selected Intervals (${intervals.length}):</strong><br>
        ${intervals.join(', ')}
    `;
}

// Function to play a random interval from selected ones
function playRandomInterval() {
    const selectedCells = document.querySelectorAll('[data-note].selected');
    
    if (selectedCells.length === 0) {
        alert('Please select some intervals first!');
        return;
    }

    // Pick a random selected interval
    const randomCell = selectedCells[Math.floor(Math.random() * selectedCells.length)];
    const rootNote = randomCell.dataset.note;
    const interval = randomCell.dataset.interval;

    // Initialize practice session
    currentPracticeInterval = { rootNote, interval, cell: randomCell };
    practiceTriesRemaining = parseInt(document.getElementById('practiceTriesInput').value);
    
    const infiniteRelistens = document.getElementById('infiniteRelistensCheckbox').checked;
    practiceRelistensRemaining = infiniteRelistens ? Infinity : parseInt(document.getElementById('practiceRelistensInput').value);

    console.log(`Playing interval: ${rootNote} + ${interval}`);
    
    // Update status display
    updatePracticeStatus();
    
    // Here you would implement the actual audio playback
    // For now, just log what would be played
    // You can integrate with your existing synth system
    alert(`Playing: ${rootNote} + ${interval}`);
    
    // TODO: Integrate with PolySynth to actually play the interval
    // Example: playInterval(rootNote, interval);
}

// Function to replay the current interval
function replayCurrentInterval() {
    console.log('Replaying current interval...');
    if (!currentPracticeInterval) {
        alert('No interval is currently being practiced. Click "Play Random Interval" first!');
        return;
    }

    if (practiceRelistensRemaining <= 0) {
        alert('No relistens remaining for this interval!');
        return;
    }

    const { rootNote, interval } = currentPracticeInterval;
    
    if (practiceRelistensRemaining !== Infinity) {
        practiceRelistensRemaining--;
    }
    
    console.log(`Replaying interval: ${rootNote} + ${interval}`);
    updatePracticeStatus();
    
    // Here you would implement the actual audio playback
    alert(`Replaying: ${rootNote} + ${interval}`);
    
    // TODO: Integrate with PolySynth to actually play the interval
}

// Function to skip to the next interval
function skipToNextInterval() {
    if (!currentPracticeInterval) {
        alert('No interval is currently being practiced. Click "Play Random Interval" first!');
        return;
    }

    practiceStats.total++;
    updatePracticeStatus();
    
    // Automatically play the next random interval
    playRandomInterval();
}

// Function to update practice status display
function updatePracticeStatus() {
    const statusDisplay = document.getElementById('practiceStatusDisplay');
    
    if (!currentPracticeInterval) {
        statusDisplay.textContent = 'Select intervals and click "Play Random Interval" to start practicing!';
        return;
    }

    const { rootNote, interval } = currentPracticeInterval;
    const infiniteRelistens = practiceRelistensRemaining === Infinity;
    const relistensText = infiniteRelistens ? '∞' : practiceRelistensRemaining;
    
    statusDisplay.innerHTML = `
        <div>
            <strong>Current:</strong> ${rootNote} + ${interval}<br>
            <strong>Tries left:</strong> ${practiceTriesRemaining} | 
            <strong>Relistens:</strong> ${relistensText}<br>
            <strong>Score:</strong> ${practiceStats.correct}/${practiceStats.total}
        </div>
    `;
}

// Function to cycle through guess button states (0 -> 1 -> 2 -> 0)
function cycleGuessButtonState(button) {
    const currentState = parseInt(button.dataset.state);
    const nextState = (currentState + 1) % 3;
    
    button.dataset.state = nextState.toString();
    console.log(`Button for ${button.dataset.note} changed to state ${nextState}`);
    console.log(button.style)
    // Update button appearance based on state
    switch (nextState) {
        case 0: // Off
            button.style.backgroundColor = '#333333ff';
            button.style.borderColor = '#333333ff';
            // button.style.borderColor = '#ccc';
            // button.style.color = '#333';
            button.style.color = '#ffffff';
            button.textContent = button.dataset.note;
            break;
        case 1: // Once
            button.style.backgroundColor = '#4CAF50';
            button.style.borderColor = '#45a049';
            button.style.color = '#ffffff';
            button.textContent = button.dataset.note + '¹';
            break;
        case 2: // Twice
            button.style.backgroundColor = '#2196F3';
            button.style.borderColor = '#1976D2';
            button.style.color = '#ffffff';
            button.textContent = button.dataset.note + '²';
            break;
    }
}

// Function to update the guess display
function updateGuessDisplay() {
    console.log('Updating guess display...');
    const guessDisplay = document.getElementById('guessDisplay');
    const guessButtons = document.querySelectorAll('[data-note][data-state]');
    
    const selectedNotes = [];
    guessButtons.forEach(button => {
        const state = parseInt(button.dataset.state);
        const note = button.dataset.note;
        
        if (state === 1) {
            selectedNotes.push(note);
        } else if (state === 2) {
            selectedNotes.push(note + ' (×2)');
        }
    });
    
    if (selectedNotes.length === 0) {
        guessDisplay.textContent = 'No notes selected';
    } else {
        guessDisplay.innerHTML = `<strong>Your guess was:</strong> ${selectedNotes.join(', ')}`;
    }
}

// Function to clear all guess selections
function clearGuess() {
    const guessButtons = document.querySelectorAll('[data-note][data-state]');
    guessButtons.forEach(button => {
        if (button.dataset.state !== '0') {
            // Reset to state 0
            button.dataset.state = '0';
            button.style.backgroundColor = '#ffffff';
            button.style.borderColor = '#ccc';
            button.style.color = '#333';
            button.textContent = button.dataset.note;
        }
    });
    updateGuessDisplay();
}

// Function to submit the current guess
function submitGuess() {
    if (!currentPracticeInterval) {
        alert('No interval is currently being practiced!');
        return;
    }
    
    if (practiceTriesRemaining <= 0) {
        alert('No tries remaining for this interval!');
        return;
    }
    
    // Get the current guess
    const guessButtons = document.querySelectorAll('[data-note][data-state]');
    const guessedNotes = [];
    
    guessButtons.forEach(button => {
        const state = parseInt(button.dataset.state);
        const note = button.dataset.note;
        
        if (state > 0) {
            // Add the note the number of times specified by state
            for (let i = 0; i < state; i++) {
                guessedNotes.push(note);
            }
        }
    });
    
    if (guessedNotes.length === 0) {
        alert('Please select at least one note for your guess!');
        return;
    }
    
    // Calculate the correct answer
    const { rootNote, interval } = currentPracticeInterval;
    const correctAnswer = calculateIntervalNotes(rootNote, interval);
    
    // Check if the guess is correct
    const isCorrect = arraysEqual(guessedNotes.sort(), correctAnswer.sort());
    
    practiceTriesRemaining--;
    
    if (isCorrect) {
        practiceStats.correct++;
        practiceStats.total++;
        alert(`Correct! The interval was ${rootNote} + ${interval}`);
        updatePracticeStatus();
        clearGuess();
        // Move to next interval
        setTimeout(() => playRandomInterval(), 1000);
    } else {
        if (practiceTriesRemaining > 0) {
            alert(`Incorrect. You guessed: ${guessedNotes.join(', ')}\nCorrect answer: ${correctAnswer.join(', ')}\nTries remaining: ${practiceTriesRemaining}`);
            updatePracticeStatus();
            clearGuess();
        } else {
            // No more tries
            practiceStats.total++;
            alert(`Game over! The correct answer was: ${correctAnswer.join(', ')}`);
            updatePracticeStatus();
            clearGuess();
            // Move to next interval
            setTimeout(() => playRandomInterval(), 1000);
        }
    }
}

// Helper function to calculate what notes should be in an interval
function calculateIntervalNotes(rootNote, interval) {
    // This is a simplified version - you might want to integrate with your intervals.js
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rootIndex = chromaticNotes.indexOf(rootNote);
    
    const intervalSemitones = {
        'P1': 0, 'm2': 1, 'M2': 2, 'm3': 3, 'M3': 4, 'P4': 5,
        'A4/d5': 6, 'P5': 7, 'm6': 8, 'M6': 9, 'm7': 10, 'M7': 11
    };
    
    const semitones = intervalSemitones[interval];
    if (semitones === undefined) return [rootNote];
    
    const targetIndex = (rootIndex + semitones) % 12;
    const targetNote = chromaticNotes[targetIndex];
    
    // For unison (P1), the same note appears twice
    if (interval === 'P1') {
        return [rootNote, rootNote];
    }
    
    return [rootNote, targetNote];
}

// Helper function to compare arrays
function arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, index) => val === arr2[index]);
}

// Function to toggle an entire row
function toggleRow(rowIndex) {
    const rowCells = document.querySelectorAll(`[data-row="${rowIndex}"]`);
    
    // Check if all cells in the row are selected
    const allSelected = Array.from(rowCells).every(cell => cell.classList.contains('selected'));
    
    // If all are selected, deselect all; otherwise, select all
    rowCells.forEach(cell => {
        const isSelected = cell.classList.contains('selected');
        if (allSelected && isSelected) {
            // Deselect all
            cell.click();
        } else if (!allSelected && !isSelected) {
            // Select all unselected
            cell.click();
        }
    });
}

// Function to toggle an entire column
function toggleColumn(colIndex) {
    const columnCells = document.querySelectorAll(`[data-col="${colIndex}"]`);
    
    // Check if all cells in the column are selected
    const allSelected = Array.from(columnCells).every(cell => cell.classList.contains('selected'));
    
    // If all are selected, deselect all; otherwise, select all
    columnCells.forEach(cell => {
        const isSelected = cell.classList.contains('selected');
        if (allSelected && isSelected) {
            // Deselect all
            cell.click();
        } else if (!allSelected && !isSelected) {
            // Select all unselected
            cell.click();
        }
    });
}



export {drawNotes, outputNoteArray, outputDiv, updateOutputText, highlightBothPositions}

