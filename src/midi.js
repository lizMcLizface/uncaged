// noteToMidi/noteToName moved to src/theory/notes.js (REFACTOR_PLAN.md
// Phase 2) and re-exported here unchanged so this file's own DOM-touching
// code (keys/getElementByMIDI/initializeMouseInput below) stays out of
// src/theory/, while every existing importer of these two names from
// './midi' keeps working without a path change.
import { noteToMidi, noteToName } from './theory/notes';

const getElementByNote = (note) =>
  note && document.querySelector(`[note="${note}"]`);
const getElementByMIDI = (note) =>
  note && document.querySelector(`[midi="${note}"]`);

// Mouse-input state, at module scope rather than per-call: binding happens in
// more than one pass now (see bindMouseInputToKeys), and a note started on a
// key bound in one pass has to be findable by a key bound in another - a
// glide from an old key to a new one would otherwise leak a held note.
const pressedNotes = new Set();
let isMouseDown = false;
let currentMouseNote = null;

// The callbacks the synth passes in, kept so keys rendered later can be bound
// without the caller having to hand them over again.
let mouseInputCallbacks = null;
// Elements already carrying listeners, so a second binding pass adds nothing
// twice. A WeakSet, so discarded keys from a previous render are collectable.
const boundElements = new WeakSet();
let globalMouseUpBound = false;

/**
 * Drop the `pressedKey` highlight from the key sounding `noteWithOctave`
 * ("C4", "F#3" - the synth's format, not the slash form).
 *
 * Deliberately per-note rather than "clear them all": src/index.js applies
 * the same class for notes held on the computer keyboard, and a mouse release
 * must not wipe those.
 */
const clearPressedHighlight = (noteWithOctave) => {
  if (!noteWithOctave) return;
  const noteName = noteWithOctave.slice(0, -1);
  const octave = parseInt(noteWithOctave.slice(-1), 10);
  const midiNote = Object.keys(keys).find(key =>
    keys[key].note === noteName && keys[key].octave === octave);
  const element = midiNote && keys[midiNote].element;
  if (element) element.classList.remove('pressedKey');
};

/**
 * Attach listeners to every key element in `keys` that doesn't have them yet.
 *
 * Called from both directions of the ordering problem: by
 * initializeMouseInput once the synth exists, and by refreshKeyElements once
 * the piano has rendered. Whichever happens second completes the wiring, so
 * neither has to know about the other.
 */
const bindMouseInputToKeys = () => {
  if (!mouseInputCallbacks) return 0;
  const { playNote2Callback, stopNotes2Callback } = mouseInputCallbacks;
  let initializedCount = 0;

  for (let midiNote = 21; midiNote <= 108; midiNote++) {
    const element = keys[midiNote] && keys[midiNote].element;
    if (element && !boundElements.has(element)) {
      boundElements.add(element);
      initializedCount++;
      // Prevent text selection on the piano key elements
      element.style.userSelect = 'none';
      element.style.webkitUserSelect = 'none';
      element.style.msUserSelect = 'none';
      
      // Mouse down event (note on)
      element.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const noteName = noteToName(midiNote);
        const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
        console.log('Mouse press on key:', noteWithOctave, 'MIDI:', midiNote);
        
        isMouseDown = true;
        currentMouseNote = noteWithOctave;
        
        // Only play if PolySynth is enabled and note isn't already pressed
        if (playNote2Callback && typeof playNote2Callback === 'function' &&
            !pressedNotes.has(noteWithOctave)) {
          console.log('Playing note via mouse press:', noteWithOctave);
          playNote2Callback([noteWithOctave], 70); // Default volume of 70
          pressedNotes.add(noteWithOctave);
        } else if (pressedNotes.has(noteWithOctave)) {
          console.log('Note already pressed, ignoring:', noteWithOctave);
        } else {
          console.log('PolySynth not enabled or callback not available');
        }
        
        // Add visual feedback
        element.classList.add('pressedKey');
      });
      
      // Mouse enter event (for gliding between keys while pressed)
      element.addEventListener('mouseenter', (event) => {
        if (isMouseDown) {
          const noteName = noteToName(midiNote);
          const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
          console.log('Mouse enter on key while pressed:', noteWithOctave, 'MIDI:', midiNote);
          
          if (currentMouseNote && currentMouseNote !== noteWithOctave) {
            // Stop the previous note, if it was actually sounding
            if (pressedNotes.has(currentMouseNote)) {
              console.log('Stopping previous note via mouse glide:', currentMouseNote);
              if (stopNotes2Callback && typeof stopNotes2Callback === 'function') {
                stopNotes2Callback([currentMouseNote]);
              }
              pressedNotes.delete(currentMouseNote);
            }
            // ...but un-highlight it either way. The highlight is added
            // unconditionally on press/glide, so gating its removal on the
            // note having sounded strands it lit whenever the synth is off.
            clearPressedHighlight(currentMouseNote);
          }

          // Play the new note if not already playing
          if (playNote2Callback && typeof playNote2Callback === 'function' &&
              !pressedNotes.has(noteWithOctave)) {
            console.log('Playing new note via mouse glide:', noteWithOctave);
            playNote2Callback([noteWithOctave], 70); // Default volume of 70
            pressedNotes.add(noteWithOctave);
          }
          
          currentMouseNote = noteWithOctave;
          // Add visual feedback
          element.classList.add('pressedKey');
        }
      });
      
      // Mouse up event (note off) - stop note and remove visual feedback
      element.addEventListener('mouseup', (event) => {
        event.preventDefault();
        const noteName = noteToName(midiNote);
        const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
        console.log('Mouse release on key:', noteWithOctave, 'MIDI:', midiNote);
        
        isMouseDown = false;
        
        // Stop the note if it was playing
        if (stopNotes2Callback && typeof stopNotes2Callback === 'function' && 
            pressedNotes.has(noteWithOctave)) {
          console.log('Stopping note via mouse release:', noteWithOctave);
          stopNotes2Callback([noteWithOctave]);
          pressedNotes.delete(noteWithOctave);
        }
        
        currentMouseNote = null;
        element.classList.remove('pressedKey');
      });
      
      // Mouse leave event (in case user drags mouse away while holding down)
      element.addEventListener('mouseleave', (event) => {
        const noteName = noteToName(midiNote);
        const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
        
        // Only remove visual feedback, don't stop the note if mouse is still down
        // The note will be stopped when mouse enters another key or when mouse is released
        if (!isMouseDown) {
          element.classList.remove('pressedKey');
          
          // Stop the note if it was playing and mouse is not down
          if (stopNotes2Callback && typeof stopNotes2Callback === 'function' && 
              pressedNotes.has(noteWithOctave)) {
            console.log('Stopping note via mouse leave:', noteWithOctave);
            stopNotes2Callback([noteWithOctave]);
            pressedNotes.delete(noteWithOctave);
          }
        }
      });
      
      // Prevent context menu on right click
      element.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
      
      // Add touch support for mobile devices (simplified for touch)
      element.addEventListener('touchstart', (event) => {
        event.preventDefault();
        const noteName = noteToName(midiNote);
        const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
        console.log('Touch start on key:', noteWithOctave, 'MIDI:', midiNote);
        
        // Only play if PolySynth is enabled and note isn't already pressed
        if (playNote2Callback && typeof playNote2Callback === 'function' &&
            !pressedNotes.has(noteWithOctave)) {
          playNote2Callback([noteWithOctave], 70); // Default volume of 70
          pressedNotes.add(noteWithOctave);
        }
        
        // Add visual feedback
        element.classList.add('pressedKey');
      });
      
      element.addEventListener('touchend', (event) => {
        event.preventDefault();
        const noteName = noteToName(midiNote);
        const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
        
        // Stop the note if it was playing
        if (stopNotes2Callback && typeof stopNotes2Callback === 'function' && 
            pressedNotes.has(noteWithOctave)) {
          stopNotes2Callback([noteWithOctave]);
          pressedNotes.delete(noteWithOctave);
        }
        
        element.classList.remove('pressedKey');
      });
      
      element.addEventListener('touchcancel', (event) => {
        event.preventDefault();
        const noteName = noteToName(midiNote);
        const noteWithOctave = noteName.replace('/', ''); // Convert "C/4" to "C4"
        
        // Stop the note if it was playing
        if (stopNotes2Callback && typeof stopNotes2Callback === 'function' && 
            pressedNotes.has(noteWithOctave)) {
          stopNotes2Callback([noteWithOctave]);
          pressedNotes.delete(noteWithOctave);
        }
        
        element.classList.remove('pressedKey');
      });
    }
  }

  return initializedCount;
};

// Global mouse up listener to handle mouse release outside of piano keys.
// Bound once for the page, not once per binding pass.
const bindGlobalMouseUp = () => {
  if (globalMouseUpBound) return;
  globalMouseUpBound = true;
  const { stopNotes2Callback } = mouseInputCallbacks;

  document.addEventListener('mouseup', (event) => {
    if (isMouseDown) {
      console.log('Global mouse up detected - cleaning up');
      isMouseDown = false;
      
      if (currentMouseNote) {
        // Stop current note if playing
        if (stopNotes2Callback && typeof stopNotes2Callback === 'function' &&
            pressedNotes.has(currentMouseNote)) {
          console.log('Stopping note via global mouse up:', currentMouseNote);
          stopNotes2Callback([currentMouseNote]);
          pressedNotes.delete(currentMouseNote);
        }
        // Un-highlight regardless - see the same note in the glide handler.
        // A release outside the key (drag off, or off the piano entirely)
        // never reaches that key's own mouseup, so this is the only cleanup
        // it gets.
        clearPressedHighlight(currentMouseNote);
      }

      currentMouseNote = null;
    }
  });
};

/**
 * Wire mouse/touch input to the piano keys. Safe to call again; keys already
 * bound are skipped, and keys that don't exist yet are picked up by
 * refreshKeyElements when they do.
 */
const initializeMouseInput = (playNote2Callback, stopNotes2Callback) => {
  console.log('Initializing mouse input for piano keys...');
  mouseInputCallbacks = { playNote2Callback, stopNotes2Callback };
  bindGlobalMouseUp();
  const initializedCount = bindMouseInputToKeys();
  console.log(`Mouse input initialized for ${initializedCount} piano keys (MIDI ${21}-${108})`);
};

/**
 * Re-resolve every `keys[midi].element` against the live DOM, and bind any
 * newly-found key.
 *
 * `keys` is a module-scope object literal: before this existed it captured
 * `getElementByMIDI(...)` **at import time**, long before anything rendered a
 * keyboard, so every element was permanently null and everything reading the
 * table silently did nothing. src/piano/Piano.js calls this after each render.
 *
 * @returns {number} how many of the 88 keys are currently in the DOM
 */
const refreshKeyElements = () => {
  let found = 0;
  for (let midiNote = 21; midiNote <= 108; midiNote++) {
    const element = getElementByMIDI(String(midiNote));
    keys[midiNote].element = element;
    if (element) found++;
  }
  bindMouseInputToKeys();
  return found;
};

const keys = {
    21 : { element: null, note: "A",  octave: 0 },
    22 : { element: null, note: "A#", octave: 0 },
    23 : { element: null, note: "B",  octave: 0 },
    24 : { element: null, note: "C",  octave: 1 },
    25 : { element: null, note: "C#", octave: 1 },
    26 : { element: null, note: "D",  octave: 1 },
    27 : { element: null, note: "D#", octave: 1 },
    28 : { element: null, note: "E",  octave: 1 },
    29 : { element: null, note: "F",  octave: 1 },
    30 : { element: null, note: "F#", octave: 1 },
    31 : { element: null, note: "G",  octave: 1 },
    32 : { element: null, note: "G#", octave: 1 },
    33 : { element: null, note: "A",  octave: 1 },
    34 : { element: null, note: "A#", octave: 1 },
    35 : { element: null, note: "B",  octave: 1 },
    36 : { element: null, note: "C",  octave: 2 },
    37 : { element: null, note: "C#", octave: 2 },
    38 : { element: null, note: "D",  octave: 2 },
    39 : { element: null, note: "D#", octave: 2 },
    40 : { element: null, note: "E",  octave: 2 },
    41 : { element: null, note: "F",  octave: 2 },
    42 : { element: null, note: "F#", octave: 2 },
    43 : { element: null, note: "G",  octave: 2 },
    44 : { element: null, note: "G#", octave: 2 },
    45 : { element: null, note: "A",  octave: 2 },
    46 : { element: null, note: "A#", octave: 2 },
    47 : { element: null, note: "B",  octave: 2 },
    48 : { element: null, note: "C",  octave: 3 },
    49 : { element: null, note: "C#", octave: 3 },
    50 : { element: null, note: "D",  octave: 3 },
    51 : { element: null, note: "D#", octave: 3 },
    52 : { element: null, note: "E",  octave: 3 },
    53 : { element: null, note: "F",  octave: 3 },
    54 : { element: null, note: "F#", octave: 3 },
    55 : { element: null, note: "G",  octave: 3 },
    56 : { element: null, note: "G#", octave: 3 },
    57 : { element: null, note: "A",  octave: 3 },
    58 : { element: null, note: "A#", octave: 3 },
    59 : { element: null, note: "B",  octave: 3 },
    60 : { element: null, note: "C",  octave: 4 },
    61 : { element: null, note: "C#", octave: 4 },
    62 : { element: null, note: "D",  octave: 4 },
    63 : { element: null, note: "D#", octave: 4 },
    64 : { element: null, note: "E",  octave: 4 },
    65 : { element: null, note: "F",  octave: 4 },
    66 : { element: null, note: "F#", octave: 4 },
    67 : { element: null, note: "G",  octave: 4 },
    68 : { element: null, note: "G#", octave: 4 },
    69 : { element: null, note: "A",  octave: 4 },
    70 : { element: null, note: "A#", octave: 4 },
    71 : { element: null, note: "B",  octave: 4 },
    72 : { element: null, note: "C",  octave: 5 },
    73 : { element: null, note: "C#", octave: 5 },
    74 : { element: null, note: "D",  octave: 5 },
    75 : { element: null, note: "D#", octave: 5 },
    76 : { element: null, note: "E",  octave: 5 },
    77 : { element: null, note: "F",  octave: 5 },
    78 : { element: null, note: "F#", octave: 5 },
    79 : { element: null, note: "G",  octave: 5 },
    80 : { element: null, note: "G#", octave: 5 },
    81 : { element: null, note: "A",  octave: 5 },
    82 : { element: null, note: "A#", octave: 5 },
    83 : { element: null, note: "B",  octave: 5 },
    84 : { element: null, note: "C",  octave: 6 },
    85 : { element: null, note: "C#", octave: 6 },
    86 : { element: null, note: "D",  octave: 6 },
    87 : { element: null, note: "D#", octave: 6 },
    88 : { element: null, note: "E",  octave: 6 },
    89 : { element: null, note: "F",  octave: 6 },
    90 : { element: null, note: "F#", octave: 6 },
    91 : { element: null, note: "G",  octave: 6 },
    92 : { element: null, note: "G#", octave: 6 },
    93 : { element: null, note: "A",  octave: 6 },
    94 : { element: null, note: "A#", octave: 6 },
    95 : { element: null, note: "B",  octave: 6 },
    96 : { element: null, note: "C",  octave: 7 },
    97 : { element: null, note: "C#", octave: 7 },
    98 : { element: null, note: "D",  octave: 7 },
    99 : { element: null, note: "D#", octave: 7 },
    100 : { element: null, note: "E",  octave: 7 },
    101 : { element: null, note: "F",  octave: 7 },
    102 : { element: null, note: "F#", octave: 7 },
    103 : { element: null, note: "G",  octave: 7 },
    104 : { element: null, note: "G#", octave: 7 },
    105 : { element: null, note: "A",  octave: 7 },
    106 : { element: null, note: "A#", octave: 7 },
    107 : { element: null, note: "B",  octave: 7 },
    108 : { element: null, note: "C",  octave: 8 },
};


export { noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput, refreshKeyElements };