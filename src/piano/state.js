/**
 * Piano view settings, persisted so the user returns to whichever instrument
 * they were looking at.
 *
 * One mutable object rather than exported `let`s - ES module named exports are
 * live bindings importers cannot reassign, the same reason `fretboardState` /
 * `progressionState` / `scaleState` exist (ARCHITECTURE.md §6.3).
 *
 * Depends on nothing but localStorage. `src/fretboard/index.js` reads
 * `viewMode` to decide what to show at init and writes it from the top-bar
 * toggle; `Piano.js` reads the range settings.
 */

const PIANO_SETTINGS_KEY = 'PolySynth-PianoSettings';

export const VIEW_FRETBOARD = 'fretboard';
export const VIEW_PIANO = 'piano';

/**
 * How the displayed range is chosen.
 *
 * `RANGE_FULL` is its own mode rather than a large `octaveCount` because a
 * full keyboard is **A0-C8**, which is not a whole number of C-to-B octaves.
 * Expressing it as octaves would either clip the bottom three keys or
 * overshoot the top.
 */
export const RANGE_OCTAVES = 'octaves';
export const RANGE_FULL = 'full';

export const pianoState = {
    /** Which instrument occupies the slot at the top of the page. */
    viewMode: VIEW_FRETBOARD,
    /**
     * Whether the range comes from lowOctave/octaveCount or is the full 88.
     *
     * **Defaults to the whole keyboard.** A piano is 88 keys; showing three
     * octaves of it by default made the view look like a controller strip and
     * pushed a fingering's real octaves off the ends - the very thing step 8e
     * added the piano to show (VISUALIZATION_STACK_PLAN.md §5.2 flagged this
     * as an accepted cost of a C2 default, and it stopped being worth paying
     * once the chord layers landed). Narrowing is one dropdown away and is
     * remembered, so the cost falls on whoever wants the narrow view rather
     * than on everyone.
     */
    rangeMode: RANGE_FULL,
    /** Displayed range when rangeMode is RANGE_OCTAVES. */
    lowOctave: 2,
    octaveCount: 3,
    /**
     * Whether to veil keys the active instrument cannot reach, and whether to
     * bracket the octave Z/X is playing in (`Piano.renderBounds`).
     *
     * Two flags rather than one, because the markers answer unrelated
     * questions - "can I play this on the guitar" and "where is my keyboard
     * right now" - and someone reading the piano as a piano wants the second
     * without the first. Both default on: they are the point of step 9, and a
     * feature nobody sees is not a feature.
     */
    showInstrumentRange: true,
    showOctaveMarker: true
};

function loadSavedPianoSettings() {
    try {
        const raw = localStorage.getItem(PIANO_SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('Could not load saved piano settings, using defaults', error);
        return null;
    }
}

const savedPianoSettings = loadSavedPianoSettings();
if (savedPianoSettings) {
    // Anything other than the two known modes falls back to the fretboard, so
    // a stale or hand-edited value can't leave the page showing nothing.
    pianoState.viewMode = savedPianoSettings.viewMode === VIEW_PIANO ? VIEW_PIANO : VIEW_FRETBOARD;
    // An unrecognised or absent value keeps the default rather than forcing
    // RANGE_OCTAVES: settings blobs written before this field existed would
    // otherwise opt every returning user out of the new default.
    if (savedPianoSettings.rangeMode === RANGE_FULL || savedPianoSettings.rangeMode === RANGE_OCTAVES) {
        pianoState.rangeMode = savedPianoSettings.rangeMode;
    }
    pianoState.lowOctave = savedPianoSettings.lowOctave ?? pianoState.lowOctave;
    pianoState.octaveCount = savedPianoSettings.octaveCount ?? pianoState.octaveCount;
    pianoState.showInstrumentRange = savedPianoSettings.showInstrumentRange ?? pianoState.showInstrumentRange;
    pianoState.showOctaveMarker = savedPianoSettings.showOctaveMarker ?? pianoState.showOctaveMarker;
}

export function persistPianoSettings() {
    try {
        localStorage.setItem(PIANO_SETTINGS_KEY, JSON.stringify({
            viewMode: pianoState.viewMode,
            rangeMode: pianoState.rangeMode,
            lowOctave: pianoState.lowOctave,
            octaveCount: pianoState.octaveCount,
            showInstrumentRange: pianoState.showInstrumentRange,
            showOctaveMarker: pianoState.showOctaveMarker
        }));
    } catch (error) {
        console.warn('Could not persist piano settings', error);
    }
}
