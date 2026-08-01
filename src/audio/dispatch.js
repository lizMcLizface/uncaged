// Channel registry replacing `window.polySynthRef`/`window.polySynthEnabled`
// as the way entry points (keyboard, mouse, programmatic click-to-play)
// reach the active instrument. A channel is whatever imperative handle the
// instrument component exposes (today: PolySynth's `playNotes`/`stopNotes`/
// `stopAllNotes`/`isActive`/`activate`, registered under the `'synth'` id) -
// this module does not define a channel's shape, it just relocates the
// pointer to it off `window`.
//
// Scope note (Phase 2b, 2026-08-01): only the *playback* entry points were
// migrated onto this registry. `window.polySynthRef` also carries an
// unrelated progression-sequencer-control surface (getProgressionSequencerState,
// toggleProgressionSequencer, setProgressionRate/Duration, ...) used
// exclusively inside progressionBuilder.js's own sequencer UI - that's not
// note dispatch, and it still reads `window.polySynthRef` directly. See
// ARCHITECTURE.md §3/§5 for the split.
const channels = new Map();
const enabledFlags = new Map();

export function registerChannel(id, channel) {
    channels.set(id, channel);
}

export function unregisterChannel(id) {
    channels.delete(id);
}

export function getChannel(id) {
    return channels.get(id) || null;
}

export function setChannelEnabled(id, isEnabled) {
    enabledFlags.set(id, isEnabled);
}

export function isChannelEnabled(id) {
    return !!enabledFlags.get(id);
}
