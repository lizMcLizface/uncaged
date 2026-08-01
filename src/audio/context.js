// The single shared AudioContext, created once at import time. Every
// audio-producing module (PolySynth, the metronome, and future instrument
// channels) must use this instead of constructing its own - see
// ARCHITECTURE.md §2 for the two-AudioContext bug this replaces and why it
// mattered (independent, un-syncable clocks).
export const audioContext = new (window.AudioContext || window.webkitAudioContext)();
