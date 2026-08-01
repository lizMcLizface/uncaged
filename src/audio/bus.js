// The master bus every audio channel sums into: a single gain node between
// each channel's output and the shared AudioContext's destination. Today
// only PolySynth's master chain feeds it; future instrument channels
// (guitar, bass, piano, drums - see SESSION_MODE_FEASIBILITY.md) connect
// here too instead of each wiring their own path to destination.
//
// Visualisers (SpectrumAnalyzer, Spectrogram, Oscilloscope, PeakMeter)
// already accept `{ audioCtx, sourceNode }` and can tap this node directly
// once more than one channel feeds it.
import { audioContext } from './context';

export const masterBus = audioContext.createGain();
masterBus.connect(audioContext.destination);
