/**
 * Public surface of `src/visualization/` - the layer stack that answers
 * "what is currently shown on the main display?"
 * (VISUALIZATION_STACK_PLAN.md).
 *
 * The main display is the main fretboard and the piano, which share the slot
 * in `#fretNotPlaceholder` and are mutually exclusive. Both render this
 * stack. `src/fretboard/index.js` owns the wiring: it subscribes the two
 * renderers and sets the base layer from the app's scale and chord
 * selections.
 *
 * ## The boundary that keeps this small
 *
 * **Mini fretboards and mini pianos push onto this stack. They never
 * subscribe to it.** There are three families of them - `MiniPiano.js`'s SVG
 * pianos, `createScalePositionMiniFretboard`, and the progression cards'
 * mini fretboards - and each renders one fixed thing of its own. If they
 * subscribed, every card in a progression would repaint on every hover
 * anywhere, and the per-instance display bookkeeping this stack exists to
 * delete (`fretboardState.fretboardsShowingScale` and its sibling) would come
 * straight back. They are sources of layers, never targets.
 *
 * Nothing here imports from `src/fretboard/` or `src/piano/`: the stack must
 * not know who renders it.
 */

export {
    visualizationState,
    setBaseLayer,
    pushLayer,
    popLayer,
    clearTransient,
    clearLayers,
    getLayers,
    getBaseLayer,
    subscribe
} from './stack';

export {
    flattenLayers,
    parseLayerNote
} from './flatten';

export {
    scaleLayer,
    chordLayer,
    positionLayer,
    noteLayer,
    noteLabelFor,
    SCALE_LAYER_ID
} from './layers';
