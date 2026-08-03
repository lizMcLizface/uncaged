/**
 * The visualization stack: the single answer to "what is currently shown on
 * the main display?".
 *
 * Owns: a persistent base layer (the active scale, or a selected chord) plus
 * an ordered list of overlays pushed on top of it, and the subscription that
 * tells renderers to repaint.
 *
 * Depends on nothing - no DOM, no app state, no imports. That is the point:
 * both renderers (src/fretboard/Fretboard.js and src/piano/Piano.js) become
 * pure functions of what this holds, and neither can reach around it.
 *
 * Depended on by: src/fretboard/index.js, which subscribes the renderers and
 * owns every producer that sets the base; and by the hover sources that push
 * overlays (chord grid, Roman numerals, the scale and root tables, the mini
 * pianos and mini fretboards).
 *
 * Replaces the six `fretboardState` flags and the four copies of the
 * re-derivation ladder that VISUALIZATION_STACK_PLAN.md section 1.1
 * inventories. The property that makes it worth the swap: **undoing a hover
 * is popLayer(id), not re-running a producer.** A `mouseleave` that arrives
 * without its `mouseenter` is a no-op here; today it re-renders whatever the
 * flags currently imply.
 *
 * ## Base and overlays are separate fields
 *
 * VISUALIZATION_STACK_PLAN.md section 2.1 describes one array with the base
 * at index 0. Two fields instead, decided while building it: with one array,
 * "the base is replaced, never popped" is a convention that `popLayer` and
 * `pushLayer` each need a guard to uphold, an id collision with the base is a
 * silent trap, and "no base at all" needs a sentinel. With two, every one of
 * those invariants is structural and there is nothing to guard. `getLayers()`
 * still presents them as one bottom-first list, which is all a renderer sees.
 *
 * ## transient
 *
 * An overlay is transient unless it says otherwise, because the overwhelming
 * case is a hover preview and a preview is stale the moment the base moves.
 * `transient: false` marks an overlay meant to outlive a base change - a
 * chord pinned over its scale - which is what makes
 * VISUALIZATION_STACK_PLAN.md section 8's first open question implementable
 * without touching this file.
 */

export const visualizationState = {
    // The persistent selection. null means nothing is selected, which is a
    // real state today (fretboardState.currentDisplayedChord === null).
    base: null,
    // Bottom-first, all above the base.
    overlays: []
};

const subscribers = new Set();

/**
 * A layer needs a non-empty string id, because the id is the pop handle and
 * the replace-in-place key. Everything else about a layer is a renderer's
 * business, so nothing else is checked here.
 */
function isValidLayer(layer) {
    return Boolean(layer)
        && typeof layer === 'object'
        && typeof layer.id === 'string'
        && layer.id.length > 0;
}

function isTransient(layer) {
    return layer.transient !== false;
}

/**
 * Renderers get the whole list, bottom-first, as a fresh array - so a
 * renderer that holds onto it cannot mutate the stack through it.
 *
 * One subscriber throwing must not stop the others: the fretboard and the
 * piano are both subscribed to this, and a broken repaint in one is not a
 * reason to leave the other stale.
 */
function notify() {
    const layers = getLayers();
    Array.from(subscribers).forEach(subscriber => {
        try {
            subscriber(layers);
        } catch (error) {
            console.warn('Visualization subscriber failed', error);
        }
    });
}

/**
 * Every layer, bottom-first: the base (if any) then the overlays in push
 * order.
 */
export function getLayers() {
    return visualizationState.base
        ? [visualizationState.base, ...visualizationState.overlays]
        : [...visualizationState.overlays];
}

export function getBaseLayer() {
    return visualizationState.base;
}

/**
 * Replace the persistent selection, and drop every transient overlay with it.
 *
 * Dropping them is what makes "the scale changed while a chord was hovered"
 * correct by construction. `updateFretboardsForScaleChange`
 * (src/fretboard/index.js:669) currently special-cases exactly that case with
 * an `isInHoverState` check.
 *
 * @param {object|null} layer - null clears the base, which is the display
 *        state the Roman-numeral buttons produce when you click the active
 *        one off.
 */
export function setBaseLayer(layer) {
    visualizationState.base = isValidLayer(layer) ? layer : null;
    visualizationState.overlays = visualizationState.overlays.filter(overlay => !isTransient(overlay));
    notify();
    return getLayers();
}

/**
 * Add an overlay, or replace the one with this id **in place**.
 *
 * In place, not moved to the top: a hover handler that re-fires must not
 * reorder the stack, and a source cannot leak more than one layer no matter
 * how many times it pushes.
 *
 * @returns {boolean} whether the stack changed
 */
export function pushLayer(layer) {
    if (!isValidLayer(layer)) return false;

    const index = visualizationState.overlays.findIndex(overlay => overlay.id === layer.id);
    if (index === -1) {
        visualizationState.overlays.push(layer);
    } else {
        visualizationState.overlays[index] = layer;
    }

    notify();
    return true;
}

/**
 * Remove an overlay by id.
 *
 * **A pop of something not on the stack is a silent no-op, and does not
 * notify.** That is the guarantee that makes hover handlers safe to write:
 * a `mouseleave` firing without its `mouseenter` (tab switch, element
 * replaced mid-hover, touch cancel) costs nothing.
 *
 * @returns {boolean} whether the stack changed
 */
export function popLayer(id) {
    const index = visualizationState.overlays.findIndex(overlay => overlay.id === id);
    if (index === -1) return false;

    visualizationState.overlays.splice(index, 1);
    notify();
    return true;
}

/**
 * Drop every transient overlay, keeping the base and any pinned overlay.
 *
 * For sources that rebuild their own DOM while a hover is live - a
 * progression card re-rendering under the cursor leaves a layer whose
 * `mouseleave` will never arrive.
 *
 * @returns {boolean} whether the stack changed
 */
export function clearTransient() {
    const remaining = visualizationState.overlays.filter(overlay => !isTransient(overlay));
    if (remaining.length === visualizationState.overlays.length) return false;

    visualizationState.overlays = remaining;
    notify();
    return true;
}

/**
 * Empty the stack completely, pinned overlays and base included.
 */
export function clearLayers() {
    if (!visualizationState.base && visualizationState.overlays.length === 0) return false;

    visualizationState.base = null;
    visualizationState.overlays = [];
    notify();
    return true;
}

/**
 * Attach a renderer. Returns its unsubscribe function.
 *
 * Subscribers are not called on subscribe - the caller knows whether it has
 * anything to paint yet, and the two renderers here are built at different
 * points in init.
 */
export function subscribe(callback) {
    if (typeof callback !== 'function') return () => {};

    subscribers.add(callback);
    return () => subscribers.delete(callback);
}
