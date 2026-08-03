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
 */

import { buildKeyRange, countWhiteKeys, octaveSpanToMidiRange, pitchClassOf } from './keyModel';
import { buildScaleKeyStyles } from './labels';

/**
 * Hardcoded until the octave-count control lands (PIANO_VIEW_PLAN.md step 7)
 * and these become persisted `pianoState` settings. Three octaves from C2
 * covers a standard guitar's open strings through the 12th fret.
 */
const DEFAULT_LOW_OCTAVE = 2;
const DEFAULT_OCTAVE_COUNT = 3;

// One keyboard per page. Held here rather than on `window` so the toggle and
// the key-table refresh can reach it without adding a global.
let activePiano = null;

/**
 * Build the keyboard and insert it into `container`.
 *
 * @param {HTMLElement} container - #fretNotPlaceholder
 * @param {{afterNode?: Node, visible?: boolean, lowOctave?: number,
 *          octaveCount?: number, onRender?: (piano) => void}} [options]
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
        lowOctave = DEFAULT_LOW_OCTAVE,
        octaveCount = DEFAULT_OCTAVE_COUNT,
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
        // Last scale painted, so setRange can restore it on the new keys
        scale: null,

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
            if (piano.scale) {
                const { scaleNotes, rootNote, labelMode } = piano.scale;
                piano.showScale(scaleNotes, rootNote, labelMode);
            }

            if (onRender) onRender(piano);
            return piano;
        },

        /**
         * Paint a scale across the keyboard: `scaleKey` on every in-scale
         * key in every octave, coloured by semitone from the root, labelled
         * per `labelMode`.
         *
         * Held on `piano.scale` so a re-render (octave change) can repaint
         * itself without the caller having to know it needs to.
         */
        showScale(scaleNotes, rootNote, labelMode = 'note') {
            piano.scale = { scaleNotes, rootNote, labelMode };
            const styles = buildScaleKeyStyles(scaleNotes, rootNote, labelMode);

            piano.keyElements.forEach((keyElement, midi) => {
                const style = styles.get(pitchClassOf(midi));
                if (style) {
                    keyElement.classList.add('scaleKey');
                    keyElement.style.setProperty('--scale-key-color', style.color);
                    keyElement.textContent = style.label;
                } else {
                    keyElement.classList.remove('scaleKey');
                    keyElement.style.removeProperty('--scale-key-color');
                    keyElement.textContent = '';
                }
            });

            return piano;
        },

        clearScale() {
            piano.scale = null;
            piano.keyElements.forEach(keyElement => {
                keyElement.classList.remove('scaleKey');
                keyElement.style.removeProperty('--scale-key-color');
                keyElement.textContent = '';
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

    piano.setOctaveSpan(lowOctave, octaveCount);
    piano.setVisible(visible);

    activePiano = piano;
    return piano;
}

/**
 * The page's keyboard, or null before `createPiano` has run.
 */
export function getPiano() {
    return activePiano;
}
