
// CONTEXT AND MASTER VOLUME
var AudioContext = window.AudioContext ||
    window.webkitAudioContext;
  
const context = new AudioContext();
const masterVolume = context.createGain();
masterVolume.connect(context.destination);
masterVolume.gain.value = 0.05

const sineTerms = new Float32Array([0, 0, 1, 0, 1]);
const cosineTerms = new Float32Array(sineTerms.length);
const customWaveform = context.createPeriodicWave(cosineTerms, sineTerms);
const volumeControl = document.querySelector('#volume-control');

volumeControl.addEventListener('input', function(){
    masterVolume.gain.value = this.value;
});

//WAVEFORM SELECT
// const waveforms = document.getElementsByName('waveform');
let waveform = "custom";


// $('#waveFormSelect').on('change', function(e){
//     // console.log(e,$('#waveFormSelect').val() )
//     switch($('#waveFormSelect').val()){
//         case '0': waveform = 'sine'; break;
//         case '1': waveform = 'square'; break;
//         case '2': waveform = 'triangle'; break;
//         case '3': waveform = 'sawtooth'; break;
//         case '4': waveform = 'custom'; break;
//     }
// })

// EFFECTS CONTROLS

// Envelope
let attackTime = 0.32;
let sustainLevel = 0.8;
let releaseTime = 0.34;
let noteLength = 0.2;
  
const attackControl = document.querySelector('#attack-control');
const releaseControl = document.querySelector('#release-control');
const noteLengthControl = document.querySelector('#note-length-control');

// attackControl.addEventListener('input', function() {
//     attackTime = Number(this.value);
// });

// releaseControl.addEventListener('input', function() {
//     releaseTime = Number(this.value);
// });

// noteLengthControl.addEventListener('input', function() {
//     noteLength = Number(this.value);
// });

// Vibrato
let vibratoSpeed = 10;
let vibratoAmount = 0;
const vibratoAmountControl = document.querySelector('#vibrato-amount-control');
const vibratoSpeedControl= document.querySelector('#vibrato-speed-control');

// vibratoAmountControl.addEventListener('input', function() {
//     vibratoAmount = this.value;
// })

// vibratoSpeedControl.addEventListener('input', function() {
//     vibratoSpeed = this.value;
// })

// Delay
const delayAmountControl = document.querySelector('#delay-amount-control');
const delayTimeControl= document.querySelector('#delay-time-control');
const feedbackControl= document.querySelector('#feedback-control');
const delay = context.createDelay();
const feedback = context.createGain();
const delayAmountGain = context.createGain();

delayAmountGain.connect(delay)
delay.connect(feedback)
feedback.connect(delay)
delay.connect(masterVolume)


delay.delayTime.value = 0;
delayAmountGain.gain.value = 0;
feedback.gain.value = 0;

// delayAmountControl.addEventListener('input', function() {
//     delayAmountGain.value = this.value;
// })

// delayTimeControl.addEventListener('input', function() {
//     delay.delayTime.value = this.value;
// })

// feedbackControl.addEventListener('input', function() {
//     feedback.gain.value = this.value;
// })

const pianoNotes = {
     "A/0": 27.50,
    "A#/0": 29.14,
     "B/0": 30.87,
     "C/1": 32.70,
    "C#/1": 34.65,
     "D/1": 36.71,
    "D#/1": 38.89,
     "E/1": 41.20,
     "F/1": 43.65,
    "F#/1": 46.25,
     "G/1": 49.00,
    "G#/1": 51.91,
     "A/1": 55.00,
    "A#/1": 58.27,
     "B/1": 61.74,
     "C/2": 65.41,
    "C#/2": 69.30,
     "D/2": 73.42,
    "D#/2": 77.78,
     "E/2": 82.41,
     "F/2": 87.31,
    "F#/2": 92.50,
     "G/2": 98.00,
    "G#/2": 103.83,
     "A/2": 110.00,
    "A#/2": 116.54,
     "B/2": 123.47,
     "C/3": 130.81,
    "C#/3": 138.59,
     "D/3": 146.83,
    "D#/3": 155.56,
     "E/3": 164.81,
     "F/3": 174.61,
    "F#/3": 185.00,
     "G/3": 196.00,
    "G#/3": 207.65,
     "A/3": 220.00,
    "A#/3": 233.08,
     "B/3": 246.94,
     "C/4": 266.63,
    "C#/4": 277.18,
     "D/4": 293.66,
    "D#/4": 311.13,
     "E/4": 329.63,
     "F/4": 349.23,
    "F#/4": 369.99,
     "G/4": 392.00,
    "G#/4": 415.30,
     "A/4": 440.00,
    "A#/4": 466.16,
     "B/4": 493.88,
     "C/5": 523.25,
    "C#/5": 554.25,
     "D/5": 587.33,
    "D#/5": 622.26,
     "E/5": 659.25,
     "F/5": 698.46,
    "F#/5": 739.99,
     "G/5": 783.99,
    "G#/5": 830.61,
     "A/5": 880.00,
    "A#/5": 932.33,
     "B/5": 987.77,
     "C/6": 1046.50,
    "C#/6": 1108.73,
     "D/6": 1174.66,
    "D#/6": 1244.51,
     "E/6": 1318.51,
     "F/6": 1396.91,
    "F#/6": 1479.98,
     "G/6": 1567.98,
    "G#/6": 1661.22,
     "A/6": 1760.00,
    "A#/6": 1864.00,
     "B/6": 1975.33,
     "C/7": 2093.00,
    "C#/7": 2217.46,
     "D/7": 2349.22,
    "D#/7": 2217.46,
     "E/7": 2637.02,
     "F/7": 2793.83,
    "F#/7": 2959.96,
     "G/7": 3135.95,
    "G#/7": 3322.44,
     "A/7": 3520.00,
    "A#/7": 3729.31,
     "B/7": 3951.07,
     "C/8": 4186.01
};


//LOOP CONTROLS
const startButton = document.querySelector('#startButton8');
const stopButton = document.querySelector('#stopButton8');
const tempoControl = document.querySelector('#tempo-control');
let tempo = 200.0;
let isPlaying = false;

tempoControl.addEventListener('input', function() {
    tempo = Number(this.value);
}, false);


export {
    context,
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
    isPlaying
}