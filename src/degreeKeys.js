// The number row as scale-degree keys: 1-7 play a degree of the active
// scale, with a modifier stacking thirds on top of it.
//
//   1..7          the scale note itself
//   shift + 1..7  its triad     (3 notes)
//   ctrl  + 1..7  its seventh   (4 notes)
//   alt   + 1..7  its ninth     (5 notes)
//
// Every one of them sounds in whatever register Z/X has selected
// (keyboardState.baseOctave), so the number row and the letter rows agree
// about where "now" is on the keyboard.
//
// **One rule, four bindings.** The modifiers are not four separate chord
// vocabularies - each one stacks one more third than the last, which is why
// the fourth is a ninth rather than something needing its own definition.
// `theory/chords.js`'s buildStackedThirds does the stacking, shared with the
// Scale Information panel's chord cards so the key you press and the card you
// read cannot disagree.
//
// Held, not fired: keydown starts the notes and lights their keys, keyup
// stops them - the same lifecycle src/index.js gives the letter rows, and the
// reason a chord can be held under a melody. `pressedKey` is the visual, per
// VISUALIZATION_STACK_PLAN.md section 2.5: input feedback, never a layer.
//
// Depends on src/scales/ for the active scale, theory/chords for the
// stacking, audio/dispatch for the synth, src/midi.js for the key elements
// and src/keyboard.js for the register. Owns no state of its own beyond which
// degree keys are currently down.

import { HeptatonicScales, getScaleNotes, getPrimaryScale, getPrimaryRootNote } from './scales';
import { buildStackedThirds, bumpOctave } from './theory/chords';
import { noteToMidi, keys } from './midi';
import { keyboardState } from './keyboard';
import { getChannel, isChannelEnabled } from './audio/dispatch';

// getScaleNotes always spells a scale with its root in this octave, so the
// distance from here to the selected register is the shift to apply. Same
// anchor MiniPiano.js publishes as DEFAULT_BASE_OCTAVE; stated rather than
// imported, to keep this file out of components/.
const SCALE_ANCHOR_OCTAVE = 4;

/**
 * How many notes each modifier plays. The order is the point: each entry is
 * one more third than the one above it.
 */
const STACK_SIZE = {
    none: 1,
    shift: 3,
    ctrl: 4,
    alt: 5
};

const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];

// Which degree keys are down, and what each is sounding - keyed by event
// code, so a keyup stops exactly what its keydown started even if the
// modifiers were released first (holding shift+1 and letting go of shift
// alone must not strand the triad).
const heldDegrees = new Map();

/**
 * Which stack the modifiers on this event ask for, or null if it is not a
 * degree-key combination at all.
 *
 * Meta/Cmd is excluded rather than ignored: cmd+1..9 switches tabs in every
 * browser, and quietly playing a chord under that is worse than doing
 * nothing.
 */
function stackSizeFor(event) {
    if (event.metaKey) return null;
    if (event.altKey) return STACK_SIZE.alt;
    if (event.ctrlKey) return STACK_SIZE.ctrl;
    if (event.shiftKey) return STACK_SIZE.shift;
    return STACK_SIZE.none;
}

/**
 * The active scale's spelled notes, anchored at SCALE_ANCHOR_OCTAVE, or null
 * if no usable scale is selected.
 */
function activeScaleNotes() {
    const primaryScale = getPrimaryScale();
    const rootNote = getPrimaryRootNote();
    if (!primaryScale || !rootNote) return null;

    const [family, mode] = primaryScale.split('-');
    if (!HeptatonicScales || !HeptatonicScales[family]) return null;
    const scaleMode = HeptatonicScales[family][parseInt(mode, 10) - 1];
    if (!scaleMode) return null;

    return getScaleNotes(rootNote, scaleMode.intervals);
}

/**
 * The notes a given degree and stack size sound, in the selected register.
 *
 * @param {number} degreeIndex - 0-based; 0 is the scale's first degree
 * @param {number} stackSize - 1, 3, 4 or 5
 * @returns {string[]} `'Name/Octave'` notes, low to high, or [] if unavailable
 */
export function getDegreeNotes(degreeIndex, stackSize) {
    const scaleNotes = activeScaleNotes();
    if (!scaleNotes || scaleNotes.length < 2) return [];

    const octaveShift = keyboardState.baseOctave - SCALE_ANCHOR_OCTAVE;

    // A single note is the degree itself, not a one-note "chord" - but it is
    // the same lookup, so it goes through the same builder.
    const degrees = buildStackedThirds(scaleNotes, stackSize);
    // Scales shorter than seven degrees exist; a degree key past the end of
    // one plays nothing rather than wrapping to a degree the user did not ask
    // for.
    const degree = degrees[degreeIndex];
    if (!degree) return [];

    return degree.chordWithOctave.map(note => bumpOctave(note, octaveShift));
}

function setKeyLit(note, lit) {
    // +12 is src/index.js's own conversion at its two pressedKey sites: the
    // `keys` table is one octave up from theory/notation's numbering.
    const midi = noteToMidi(note) + 12;
    const element = keys[midi] && keys[midi].element;
    if (!element) return;
    element.classList.toggle('pressedKey', lit);
}

function startDegree(code, degreeIndex, stackSize) {
    const notes = getDegreeNotes(degreeIndex, stackSize);
    if (notes.length === 0) return;

    const synthChannel = getChannel('synth');
    if (!isChannelEnabled('synth') || !synthChannel || !synthChannel.playNotes) return;

    // The AudioContext starts suspended and only a user gesture may resume
    // it - the same activation dance onKeyPress and the mini pianos do.
    if (synthChannel.isActive && !synthChannel.isActive() && synthChannel.activate) {
        synthChannel.activate();
    }

    heldDegrees.set(code, notes);
    synthChannel.playNotes(notes.map(note => note.replace('/', '')), 70);
    notes.forEach(note => setKeyLit(note, true));
}

function stopDegree(code) {
    const notes = heldDegrees.get(code);
    if (!notes) return;
    heldDegrees.delete(code);

    const synthChannel = getChannel('synth');
    if (synthChannel && synthChannel.stopNotes) {
        synthChannel.stopNotes(notes.map(note => note.replace('/', '')));
    }
    notes.forEach(note => setKeyLit(note, false));
}

/**
 * Handle one key event. Returns true when it was a degree key, so the caller
 * knows not to process it as anything else.
 *
 * Exported for src/index.js's single keyboard entry point rather than
 * registering listeners here: two `keydown` handlers racing over the same
 * physical key is how "it plays twice sometimes" bugs start, and index.js
 * already owns the text-input guard everything must pass first.
 */
export function handleDegreeKey(event) {
    const degreeIndex = DIGIT_CODES.indexOf(event.code);
    if (degreeIndex === -1) return false;

    if (event.type === 'keyup') {
        stopDegree(event.code);
        return true;
    }
    if (event.type !== 'keydown') return false;

    const stackSize = stackSizeFor(event);
    if (stackSize === null) return false;

    // A held key repeats; ignore the repeats rather than restacking the same
    // notes on the synth every few milliseconds.
    if (heldDegrees.has(event.code)) return true;

    // ctrl+N and alt+N are browser-level shortcuts in some configurations,
    // and shift+N types a symbol into anything listening. Claiming the event
    // is what stops the page doing both.
    event.preventDefault();
    startDegree(event.code, degreeIndex, stackSize);
    return true;
}

/**
 * Release everything, for the case a keyup can never arrive: the window loses
 * focus mid-chord (alt+tab is literally one of these bindings plus tab), and
 * the note would sound until the tab was closed.
 */
export function releaseAllDegrees() {
    Array.from(heldDegrees.keys()).forEach(stopDegree);
}
