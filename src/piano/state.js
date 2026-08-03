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

export const pianoState = {
    /** Which instrument occupies the slot at the top of the page. */
    viewMode: VIEW_FRETBOARD,
    /** Displayed range. Step 7 puts a control on these. */
    lowOctave: 2,
    octaveCount: 3
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
    pianoState.lowOctave = savedPianoSettings.lowOctave ?? pianoState.lowOctave;
    pianoState.octaveCount = savedPianoSettings.octaveCount ?? pianoState.octaveCount;
}

export function persistPianoSettings() {
    try {
        localStorage.setItem(PIANO_SETTINGS_KEY, JSON.stringify({
            viewMode: pianoState.viewMode,
            lowOctave: pianoState.lowOctave,
            octaveCount: pianoState.octaveCount
        }));
    } catch (error) {
        console.warn('Could not persist piano settings', error);
    }
}
