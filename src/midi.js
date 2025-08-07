
function noteToMidi(note){
    var pitch = note[0].toLowerCase();
    var octave = parseInt(note.slice(-1));
    var sliced = note.slice(1,-2);
    // console.log('pos:', pitch, octave, sliced);
    var offset = 0;
    switch(sliced){
        default: break;
        case '#' : offset = 1; break;
        case '##': offset = 2; break;
        case 'b' : offset = -1; break;
        case 'bb': offset = -2; break;
    }
    // console.log('accidental offset:', sliced, offset)
    var key = 0;
    switch(pitch){
        case 'c': key = 0; break;
        case 'd': key = 2; break;
        case 'e': key = 4; break;
        case 'f': key = 5; break;
        case 'g': key = 7; break;
        case 'a': key = 9; break;
        case 'b': key = 11; break;
    }
    // console.log('key:', pitch, key)
    return (octave * 12) + key + offset;
}
// // noteToMidi('E/4')
// // noteToMidi('E#/4')
// // noteToMidi('Ebb/4')

function noteToName(input){
    var octave = String(Math.floor(input / 12) - 1);
    var note = input % 12;
    var noteName = 'C';
    switch(note){
        case 0:
            noteName = 'C';
            break;
        case 1:
            noteName = 'C#';
            break;
        case 2:
            noteName = 'D';
            break;
        case 3:
            noteName = 'D#';
            break;
        case 4:
            noteName = 'E';
            break;
        case 5:
            noteName = 'F';
            break;
        case 6:
            noteName = 'F#';
            break;
        case 7:
            noteName = 'G';
            break;
        case 8:
            noteName = 'G#';
            break;
        case 9:
            noteName = 'A';
            break;
        case 10:
            noteName = 'A#';
            break;
        case 11:
            noteName = 'B';
            break;
    }
    return noteName + '/' + octave;

}


const getElementByNote = (note) =>
  note && document.querySelector(`[note="${note}"]`);
const getElementByMIDI = (note) =>
  note && document.querySelector(`[midi="${note}"]`);

// Function to initialize mouse input for piano keys
const initializeMouseInput = (playNote2Callback, stopNotes2Callback) => {
  console.log('Initializing mouse input for piano keys...');
  let initializedCount = 0;
  
  // Keep track of currently pressed notes for proper cleanup
  const pressedNotes = new Set();
  // Track mouse button state
  let isMouseDown = false;
  let currentMouseNote = null;
  
  // Add click event listeners to all piano keys
  for (let midiNote = 21; midiNote <= 108; midiNote++) {
    const element = getElementByMIDI(midiNote.toString());
    if (element) {
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
            document.getElementById('polySynthMidiBox') && 
            document.getElementById('polySynthMidiBox').checked &&
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
          
          // Stop the current note if different from the new one
          if (currentMouseNote && currentMouseNote !== noteWithOctave && pressedNotes.has(currentMouseNote)) {
            console.log('Stopping previous note via mouse glide:', currentMouseNote);
            if (stopNotes2Callback && typeof stopNotes2Callback === 'function') {
              stopNotes2Callback([currentMouseNote]);
            }
            pressedNotes.delete(currentMouseNote);
            
            // Remove visual feedback from previous key
            const prevMidiNote = Object.keys(keys).find(key => {
              const keyData = keys[key];
              return keyData.note === currentMouseNote.slice(0, -1) && keyData.octave === parseInt(currentMouseNote.slice(-1));
            });
            if (prevMidiNote) {
              const prevElement = getElementByMIDI(prevMidiNote);
              if (prevElement) {
                prevElement.classList.remove('pressedKey');
              }
            }
          }
          
          // Play the new note if not already playing
          if (playNote2Callback && typeof playNote2Callback === 'function' && 
              document.getElementById('polySynthMidiBox') && 
              document.getElementById('polySynthMidiBox').checked &&
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
            document.getElementById('polySynthMidiBox') && 
            document.getElementById('polySynthMidiBox').checked &&
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
  
  // Add global mouse up listener to handle mouse release outside of piano keys
  document.addEventListener('mouseup', (event) => {
    if (isMouseDown) {
      console.log('Global mouse up detected - cleaning up');
      isMouseDown = false;
      
      // Stop current note if playing
      if (currentMouseNote && stopNotes2Callback && typeof stopNotes2Callback === 'function' && 
          pressedNotes.has(currentMouseNote)) {
        console.log('Stopping note via global mouse up:', currentMouseNote);
        stopNotes2Callback([currentMouseNote]);
        pressedNotes.delete(currentMouseNote);
        
        // Remove visual feedback
        const midiNoteForCleanup = Object.keys(keys).find(key => {
          const keyData = keys[key];
          return keyData.note === currentMouseNote.slice(0, -1) && keyData.octave === parseInt(currentMouseNote.slice(-1));
        });
        if (midiNoteForCleanup) {
          const elementForCleanup = getElementByMIDI(midiNoteForCleanup);
          if (elementForCleanup) {
            elementForCleanup.classList.remove('pressedKey');
          }
        }
      }
      
      currentMouseNote = null;
    }
  });
  
  console.log(`Mouse input initialized for ${initializedCount} piano keys (MIDI ${21}-${108})`);
};

const keys = {
    21 : { element: getElementByMIDI("21"), note: "A",  octave: 0 },
    22 : { element: getElementByMIDI("22"), note: "A#", octave: 0 },
    23 : { element: getElementByMIDI("23"), note: "B",  octave: 0 },
    24 : { element: getElementByMIDI("24"), note: "C",  octave: 1 },
    25 : { element: getElementByMIDI("25"), note: "C#", octave: 1 },
    26 : { element: getElementByMIDI("26"), note: "D",  octave: 1 },
    27 : { element: getElementByMIDI("27"), note: "D#", octave: 1 },
    28 : { element: getElementByMIDI("28"), note: "E",  octave: 1 },
    29 : { element: getElementByMIDI("29"), note: "F",  octave: 1 },
    30 : { element: getElementByMIDI("30"), note: "F#", octave: 1 },
    31 : { element: getElementByMIDI("31"), note: "G",  octave: 1 },
    32 : { element: getElementByMIDI("32"), note: "G#", octave: 1 },
    33 : { element: getElementByMIDI("33"), note: "A",  octave: 1 },
    34 : { element: getElementByMIDI("34"), note: "A#", octave: 1 },
    35 : { element: getElementByMIDI("35"), note: "B",  octave: 1 },
    36 : { element: getElementByMIDI("36"), note: "C",  octave: 2 },
    37 : { element: getElementByMIDI("37"), note: "C#", octave: 2 },
    38 : { element: getElementByMIDI("38"), note: "D",  octave: 2 },
    39 : { element: getElementByMIDI("39"), note: "D#", octave: 2 },
    40 : { element: getElementByMIDI("40"), note: "E",  octave: 2 },
    41 : { element: getElementByMIDI("41"), note: "F",  octave: 2 },
    42 : { element: getElementByMIDI("42"), note: "F#", octave: 2 },
    43 : { element: getElementByMIDI("43"), note: "G",  octave: 2 },
    44 : { element: getElementByMIDI("44"), note: "G#", octave: 2 },
    45 : { element: getElementByMIDI("45"), note: "A",  octave: 2 },
    46 : { element: getElementByMIDI("46"), note: "A#", octave: 2 },
    47 : { element: getElementByMIDI("47"), note: "B",  octave: 2 },
    48 : { element: getElementByMIDI("48"), note: "C",  octave: 3 },
    49 : { element: getElementByMIDI("49"), note: "C#", octave: 3 },
    50 : { element: getElementByMIDI("50"), note: "D",  octave: 3 },
    51 : { element: getElementByMIDI("51"), note: "D#", octave: 3 },
    52 : { element: getElementByMIDI("52"), note: "E",  octave: 3 },
    53 : { element: getElementByMIDI("53"), note: "F",  octave: 3 },
    54 : { element: getElementByMIDI("54"), note: "F#", octave: 3 },
    55 : { element: getElementByMIDI("55"), note: "G",  octave: 3 },
    56 : { element: getElementByMIDI("56"), note: "G#", octave: 3 },
    57 : { element: getElementByMIDI("57"), note: "A",  octave: 3 },
    58 : { element: getElementByMIDI("58"), note: "A#", octave: 3 },
    59 : { element: getElementByMIDI("59"), note: "B",  octave: 3 },
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
    85 : { element: getElementByMIDI("85"), note: "C#", octave: 6 },
    86 : { element: getElementByMIDI("86"), note: "D",  octave: 6 },
    87 : { element: getElementByMIDI("87"), note: "D#", octave: 6 },
    88 : { element: getElementByMIDI("88"), note: "E",  octave: 6 },
    89 : { element: getElementByMIDI("89"), note: "F",  octave: 6 },
    90 : { element: getElementByMIDI("90"), note: "F#", octave: 6 },
    91 : { element: getElementByMIDI("91"), note: "G",  octave: 6 },
    92 : { element: getElementByMIDI("92"), note: "G#", octave: 6 },
    93 : { element: getElementByMIDI("93"), note: "A",  octave: 6 },
    94 : { element: getElementByMIDI("94"), note: "A#", octave: 6 },
    95 : { element: getElementByMIDI("95"), note: "B",  octave: 6 },
    96 : { element: getElementByMIDI("96"), note: "C",  octave: 7 },
    97 : { element: getElementByMIDI("97"), note: "C#", octave: 7 },
    98 : { element: getElementByMIDI("98"), note: "D",  octave: 7 },
    99 : { element: getElementByMIDI("99"), note: "D#", octave: 7 },
    100 : { element: getElementByMIDI("100"), note: "E",  octave: 7 },
    101 : { element: getElementByMIDI("101"), note: "F",  octave: 7 },
    102 : { element: getElementByMIDI("102"), note: "F#", octave: 7 },
    103 : { element: getElementByMIDI("103"), note: "G",  octave: 7 },
    104 : { element: getElementByMIDI("104"), note: "G#", octave: 7 },
    105 : { element: getElementByMIDI("105"), note: "A",  octave: 7 },
    106 : { element: getElementByMIDI("106"), note: "A#", octave: 7 },
    107 : { element: getElementByMIDI("107"), note: "B",  octave: 7 },
    108 : { element: getElementByMIDI("108"), note: "C",  octave: 8 },
};


export { noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI, initializeMouseInput };