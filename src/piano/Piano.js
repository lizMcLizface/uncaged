/**
 * The piano's DOM: `<ul id="keyboard"><li class="white|black" midi="N">`.
 * The only DOM-touching file in `src/piano/`.
 *
 * Owns: building and rebuilding that markup from `keyModel.js`'s descriptors,
 * setting `--num-keys`, and showing/hiding the keyboard.
 *
 * This is the markup `src/index.css` has been styled for all along with
 * nothing to attach to (PIANO_VIEW_PLAN.md section 1.1). Rendering it is
 * what makes `src/midi.js`'s `keys` table, its `initializeMouseInput`, the
 * held-key `pressedKey` highlighting in `src/index.js` and
 * `src/scales/index.js`'s `highlightKeysForScales` reachable at all - so
 * `<li midi="N">` and the `white`/`black` class names are a contract with
 * those files, not free choices. `[midi="N"]` is what `getElementByMIDI`
 * queries.
 *
 * The keyboard is built once, at fretboard init, and hidden. Showing it is
 * the view toggle's job and is a visibility change only - it must never be
 * torn down and rebuilt, because `#fretNotPlaceholder` also hosts the
 * Synthesizer tab's React portal target (see src/index.js's note).
 *
 * **What is shown on it is not decided here.** Since
 * VISUALIZATION_STACK_PLAN.md step 8b this file paints whatever
 * `src/visualization/` resolves and holds no opinion about scales or chords;
 * `renderStack` is the whole of its content API. It deliberately does not
 * import the stack - `src/fretboard/index.js` subscribes it, the same
 * division that keeps `midi.js` and `keyboard.js` out of this folder.
 */

import {
    buildKeyRange,
    countWhiteKeys,
    octaveSpanToMidiRange,
    LOWEST_KEY_MIDI,
    HIGHEST_KEY_MIDI
} from './keyModel';
import { pianoState, persistPianoSettings, RANGE_OCTAVES, RANGE_FULL } from './state';

/**
 * Selectable span, in octaves. The ceiling is a legibility limit, not a
 * technical one: seven octaves is 49 white keys, which at the app's real
 * width leaves each one narrow enough that a two-character label (`F♯`, `m3`)
 * is about as small as it can usefully get. `keyModel.js` clamps whatever it
 * is handed to the 88-key window regardless.
 */
export const MIN_OCTAVE_COUNT = 1;
export const MAX_OCTAVE_COUNT = 7;
export const MIN_LOW_OCTAVE = 0;
export const MAX_LOW_OCTAVE = 7;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

// One keyboard per page. Held here rather than on `window` so the toggle and
// the key-table refresh can reach it without adding a global.
let activePiano = null;

/**
 * Build the keyboard and insert it into `container`.
 *
 * The initial range comes from `pianoState`, not from arguments: the mode
 * (octave span vs the full 88) is persisted, and applying it here is what
 * makes a reload come back to the same keyboard.
 *
 * @param {HTMLElement} container - #fretNotPlaceholder
 * @param {{afterNode?: Node, visible?: boolean, onRender?: (piano) => void}} [options]
 *        afterNode: insert directly after this child, so the piano takes the
 *        fretboard's slot rather than landing at the end of the container.
 *        onRender: called after every render, including the first. This is
 *        how the DOM-keyed tables outside this folder (src/midi.js's `keys`,
 *        the held-key set) are refreshed without src/piano/ importing them -
 *        the mount site owns that wiring.
 */
export function createPiano(container, options = {}) {
    if (!container) return null;

    const {
        afterNode = null,
        visible = false,
        onRender = null
    } = options;

    const element = document.createElement('ul');
    element.id = 'keyboard';
    container.insertBefore(element, afterNode ? afterNode.nextSibling : null);

    const piano = {
        element,
        // midi -> <li>, the lookup step 3 repopulates midi.js's key tables from
        keyElements: new Map(),
        lowMidi: 0,
        highMidi: 0,
        // Last flattened stack painted, so setRange can restore it on the new
        // key elements. The piano holds this rather than asking the stack for
        // it, which is what keeps src/piano/ from importing
        // src/visualization/ at all - the mount site owns that wiring, the
        // same division syncPianoKeyState already uses.
        resolved: null,

        /**
         * Rebuild every key. Safe to call repeatedly - the keyboard element
         * itself survives, only its children are replaced.
         */
        setRange(lowMidi, highMidi) {
            piano.lowMidi = lowMidi;
            piano.highMidi = highMidi;
            piano.keyElements.clear();
            element.innerHTML = '';

            const keyRange = buildKeyRange(lowMidi, highMidi);
            element.style.setProperty('--num-keys', String(countWhiteKeys(keyRange)));

            keyRange.forEach(key => {
                const keyElement = document.createElement('li');
                keyElement.className = key.isBlack ? 'black' : 'white';
                keyElement.setAttribute('midi', String(key.midi));
                element.appendChild(keyElement);
                piano.keyElements.set(key.midi, keyElement);
            });

            // The new elements have never been painted; repaint before the
            // caller's hook runs, so onRender sees a complete keyboard.
            if (piano.resolved) piano.renderStack(piano.resolved);

            if (onRender) onRender(piano);
            return piano;
        },

        /**
         * Paint the visualization stack across the keyboard.
         *
         * The piano is a pure function of what it is handed: every key either
         * has a resolved entry - `scaleKey`, coloured by that entry, labelled
         * by it - or has none and is unlit. There is no per-source state here
         * and no notion of what a "scale" or a "chord" is; the layers already
         * decided (VISUALIZATION_STACK_PLAN.md section 4).
         *
         * **This method only ever touches the three classes it owns**:
         * `scaleKey`, `rootKey`, `dimKey`. `pressedKey` is live input
         * feedback on its own class, applied by src/midi.js's mouse handler
         * and src/index.js's keydown handler, and a key held down must stay
         * lit across every repaint here (section 2.5). Adding it to the
         * remove list below is the way to break that, and nothing about the
         * rendering needs to.
         *
         * Held on `piano.resolved` so a range re-render repaints itself
         * without the caller having to know it needs to.
         *
         * @param {{resolve: (midi: number) => object|null}|null} resolved -
         *        `flattenLayers(getLayers())`, or null to clear the keyboard.
         */
        renderStack(resolved) {
            piano.resolved = resolved || null;

            piano.keyElements.forEach((keyElement, midi) => {
                const entry = piano.resolved ? piano.resolved.resolve(midi) : null;

                if (entry) {
                    keyElement.classList.add('scaleKey');
                    keyElement.classList.toggle('rootKey', entry.isRoot);
                    keyElement.classList.toggle('dimKey', entry.dimmed);
                    if (entry.color) {
                        keyElement.style.setProperty('--scale-key-color', entry.color);
                    } else {
                        keyElement.style.removeProperty('--scale-key-color');
                    }
                    keyElement.textContent = entry.label;
                } else {
                    keyElement.classList.remove('scaleKey', 'rootKey', 'dimKey');
                    keyElement.style.removeProperty('--scale-key-color');
                    keyElement.textContent = '';
                }
            });

            return piano;
        },

        setOctaveSpan(low, count) {
            const { lowMidi, highMidi } = octaveSpanToMidiRange(low, count);
            return piano.setRange(lowMidi, highMidi);
        },

        setVisible(shouldShow) {
            // '' rather than 'flex' so #keyboard's own display rule applies.
            element.style.display = shouldShow ? '' : 'none';
            return piano;
        },

        isVisible() {
            return element.style.display !== 'none';
        }
    };

    activePiano = piano;
    applyPianoRange();
    piano.setVisible(visible);
    return piano;
}

/**
 * The page's keyboard, or null before `createPiano` has run.
 */
export function getPiano() {
    return activePiano;
}

/**
 * Change how much of the keyboard is shown, and remember it.
 *
 * The rebuild this triggers is the only routine re-render the piano has, and
 * everything hanging off a key element has to survive it: the stack
 * repaints itself from `piano.resolved`, and `createPiano`'s `onRender` hook
 * re-resolves `src/midi.js`'s key table, rebinds mouse input and reapplies
 * any notes currently held on the computer keyboard. That last one is why
 * `keyboardState.currentPressed` was lifted out of `src/index.js` in step 3 -
 * this is the call that makes it matter.
 */
export function setPianoOctaveSpan(lowOctave, octaveCount) {
    pianoState.rangeMode = RANGE_OCTAVES;
    const count = clamp(Math.round(octaveCount), MIN_OCTAVE_COUNT, MAX_OCTAVE_COUNT);
    let low = clamp(Math.round(lowOctave), MIN_LOW_OCTAVE, MAX_LOW_OCTAVE);

    // Slide the start down rather than truncate the span: asking for 7
    // octaves from C2 would otherwise silently give six and a bit, because
    // B8 is past the top of an 88-key piano. Starting lower honours the
    // request. If it still doesn't fit at the bottom, keyModel's clamp
    // decides, and the caller reads the real range back from lowMidi/highMidi.
    while (low > MIN_LOW_OCTAVE && octaveSpanToMidiRange(low, count).highMidi < (low + 1) * 12 + count * 12 - 1) {
        low -= 1;
    }

    pianoState.lowOctave = low;
    pianoState.octaveCount = count;
    persistPianoSettings();

    const piano = getPiano();
    if (piano) piano.setOctaveSpan(low, count);

    const { lowMidi, highMidi } = octaveSpanToMidiRange(low, count);
    return { lowOctave: low, octaveCount: count, lowMidi, highMidi };
}

/**
 * Show the whole 88-key keyboard, A0-C8.
 *
 * Not expressible as an octave count: a full keyboard starts on A and ends on
 * C, so any whole number of C-to-B octaves either clips A0-B0 off the bottom
 * or overshoots the top. Hence its own mode.
 *
 * At 52 white keys the labels shrink to their floor and stop being
 * comfortably readable. That is accepted deliberately - the keys stay
 * pressable, and the keyboard still works as an input display, which is the
 * point of the mode.
 */
export function setPianoFullRange() {
    pianoState.rangeMode = RANGE_FULL;
    persistPianoSettings();

    const piano = getPiano();
    if (piano) piano.setRange(LOWEST_KEY_MIDI, HIGHEST_KEY_MIDI);
    return {
        lowOctave: pianoState.lowOctave,
        octaveCount: pianoState.octaveCount,
        lowMidi: LOWEST_KEY_MIDI,
        highMidi: HIGHEST_KEY_MIDI
    };
}

/**
 * Apply whatever `pianoState` currently says. Used at creation time so the
 * persisted range mode is honoured on the first paint.
 */
export function applyPianoRange() {
    return pianoState.rangeMode === RANGE_FULL
        ? setPianoFullRange()
        : setPianoOctaveSpan(pianoState.lowOctave, pianoState.octaveCount);
}
