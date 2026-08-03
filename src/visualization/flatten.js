/**
 * Resolving a stack of layers into "what does this key/fret actually look
 * like?" - the one place the ordering, specificity and dimming rules live.
 *
 * Pure: layers in, a resolver out. No DOM, no app state.
 *
 * Owned by src/visualization/; used by both renderers
 * (src/piano/Piano.js, src/fretboard/Fretboard.js), which is the entire
 * reason it exists as its own file rather than inside either of them.
 *
 * ## The rules, in one place
 *
 * 1. **Later layers win.** Walk bottom-first; a higher layer's entry replaces
 *    a lower one for the same key. Winner-takes-all, never blended - a chord
 *    tone *is* a scale tone, and striping it against its own scale colour
 *    reads as a conflict that isn't there (VISUALIZATION_STACK_PLAN.md
 *    section 2.4).
 * 2. **Specific beats periodic only within the same layer.** `'E/4'` is one
 *    key, `'E'` is that pitch class in every octave
 *    (PIANO_VIEW_PLAN.md section 5.1). Across layers, layer order decides
 *    regardless of specificity - a higher periodic layer covers a lower
 *    specific one.
 * 3. **`dimBelow` / `hideBelow` are measured from the topmost layer that
 *    sets them**, not per layer, so two stacked previews cannot dim the same
 *    thing twice.
 *
 * ## Why this doesn't reuse src/piano/labels.js's noteNameToPitchClass
 *
 * That function collapses a name to a pitch class and is deliberately blind
 * to the octave, which is exactly what the piano's scale layer wants and
 * exactly what this cannot do: rule 2 depends on knowing whether an octave
 * was given. `parseLayerNote` below answers a different question with the
 * same one-line technique. `piano/labels.js`'s copy is retired in step 8b,
 * when Piano.js starts taking its scale from `layers.js` instead.
 */

import { noteToMidi } from '../theory/notation';

function pitchClassOfMidi(midi) {
    return ((midi % 12) + 12) % 12;
}

/**
 * Read a layer note name into what the stack needs to key it by.
 *
 * The presence of `/` selects periodic vs specific - the convention
 * `Fretboard.markNote` (Fretboard.js:898) already documents and
 * `geometry.js:148-171` already implements, followed here rather than
 * inventing a flag so the piano and the fretboard describe highlights
 * identically.
 *
 * Enharmonics collapse by construction, since everything goes through MIDI:
 * a `Gb` layer and an `F#` layer address the same key. That is
 * VISUALIZATION_STACK_PLAN.md section 1.4's requirement, met by arithmetic
 * rather than by string comparison, and it also folds in `Cb`/`B#`, which
 * cross an octave boundary.
 *
 * @returns {{midi: number|null, pitchClass: number, specific: boolean}|null}
 *          null if the name can't be parsed, so one bad note in a layer
 *          drops that note rather than the layer.
 */
export function parseLayerNote(noteName) {
    if (!noteName || typeof noteName !== 'string') return null;

    const specific = noteName.includes('/');
    try {
        // An octave-less name is parsed at an arbitrary octave purely to
        // reach its pitch class; `midi` stays null so nothing downstream can
        // mistake it for a real pitch.
        const midi = noteToMidi(specific ? noteName : `${noteName}/4`);
        return {
            midi: specific ? midi : null,
            pitchClass: pitchClassOfMidi(midi),
            specific
        };
    } catch (error) {
        return null;
    }
}

/**
 * Index of the topmost layer with `flag` set, or -1 if none has it.
 */
function topmostIndexWith(layers, flag) {
    let found = -1;
    layers.forEach((layer, index) => {
        if (layer && layer[flag]) found = index;
    });
    return found;
}

/**
 * Flatten a bottom-first layer list into a resolver.
 *
 * @param {Array<object>} layers - as returned by `stack.js`'s `getLayers()`
 * @returns {{
 *   resolve: (midi: number) => object|null,
 *   specific: Map<number, object>,
 *   periodic: Map<number, object>,
 *   dimIndex: number,
 *   hideIndex: number
 * }}
 */
export function flattenLayers(layers) {
    const list = Array.isArray(layers) ? layers : [];
    const dimIndex = topmostIndexWith(list, 'dimBelow');
    const hideIndex = topmostIndexWith(list, 'hideBelow');

    const specific = new Map();
    const periodic = new Map();

    list.forEach((layer, layerIndex) => {
        if (!layer || !Array.isArray(layer.notes)) return;
        // A hidden layer contributes nothing at all, rather than contributing
        // something the renderer then has to know to skip.
        if (layerIndex < hideIndex) return;

        layer.notes.forEach(note => {
            if (!note) return;
            const parsed = parseLayerNote(note.note);
            if (!parsed) return;

            const entry = {
                note: note.note,
                color: note.color || null,
                label: typeof note.label === 'string' ? note.label : '',
                isRoot: Boolean(note.isRoot),
                semitone: Number.isFinite(note.semitone) ? note.semitone : null,
                layerId: layer.id,
                layerIndex,
                specific: parsed.specific,
                dimmed: layerIndex < dimIndex
            };

            if (parsed.specific) {
                specific.set(parsed.midi, entry);
            } else {
                periodic.set(parsed.pitchClass, entry);
            }
        });
    });

    return {
        specific,
        periodic,
        dimIndex,
        hideIndex,

        /**
         * What to render on the key with this MIDI number, or null for an
         * unlit key.
         *
         * A specific entry and a periodic one can both match; the higher
         * layer wins, and a tie goes to the specific one (rule 2).
         */
        resolve(midi) {
            if (!Number.isFinite(midi)) return null;

            const exact = specific.get(midi) || null;
            const pitchClass = periodic.get(pitchClassOfMidi(midi)) || null;

            if (!exact) return pitchClass;
            if (!pitchClass) return exact;
            return pitchClass.layerIndex > exact.layerIndex ? pitchClass : exact;
        }
    };
}
