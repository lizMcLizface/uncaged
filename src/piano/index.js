/**
 * Public surface of `src/piano/` - the piano view that can replace the main
 * fretboard in `#fretNotPlaceholder` (PIANO_VIEW_PLAN.md).
 *
 * Imported by `src/fretboard/index.js`, which owns that container and builds
 * the keyboard alongside the fretboard at init.
 *
 * `keyModel.js` and `range.js` are pure and have no dependency on the rest of
 * the app; `Piano.js` is the only file here that touches the DOM.
 */

export {
    createPiano,
    getPiano,
    setPianoOctaveSpan,
    MIN_OCTAVE_COUNT,
    MAX_OCTAVE_COUNT,
    MIN_LOW_OCTAVE,
    MAX_LOW_OCTAVE
} from './Piano';

export {
    pianoState,
    persistPianoSettings,
    VIEW_FRETBOARD,
    VIEW_PIANO
} from './state';

export {
    buildKeyRange,
    countWhiteKeys,
    isBlackKey,
    octaveOf,
    octaveSpanToMidiRange,
    pitchClassOf,
    LOWEST_KEY_MIDI,
    HIGHEST_KEY_MIDI
} from './keyModel';

export {
    getInstrumentRange,
    isInInstrumentRange,
    DEFAULT_PRACTICAL_FRET
} from './range';
