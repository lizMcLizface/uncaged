// Turns a chord in the progression into actual notes and plays them on the
// synth: resolving the currently-selected fretboard pattern (or falling
// back to chord theory) to concrete note+octave strings, then dispatching
// them through the 'synth' channel (src/audio/dispatch.js).
//
// getChordDisplayName is imported back from progressionBuilder.js rather
// than moved here - most of its callers stay there (chord-element/pattern-
// selector rendering). Same two-way-import shape as parse.js/share.js
// (ARCHITECTURE.md §6.13/§6.14).
//
// window.polySynthRef here is the progression-sequencer-control surface
// (getProgressionSequencerState) ARCHITECTURE.md §5.1 documents as still
// live and unmigrated - untouched by this move, not this phase's job.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { stripOctave as notationStripOctave } from '../theory/notation';
import { getNoteAtStringFret } from '../tuning';
import { getChannel } from '../audio/dispatch';
import { progressionState } from './state';
import { getChordPatternMatches } from './parse';
import { getChordDisplayName } from '../progressionBuilder';

/**
 * Process a chord to get the actual notes based on selected pattern
 * @param {Object} chord - Chord data containing chordInfo with notes
 * @param {number} index - Index of chord in progression
 * @returns {Array} Array of processed note strings with octaves
 */
function getProcessedChordNotes(chord, index) {
    if (!chord.chordInfo || !chord.chordInfo.notes) {
        return [];
    }

    let chordNotes = [];

    // Get the available patterns for this chord
    const patterns = getChordPatternMatches(chord);

    // Try to get fret-specific notes from selected pattern first
    // Default to pattern index 0 if no pattern is explicitly selected
    const selectedPatternIndex = progressionState.selectedPatternIndexes.get(index) ?? 0;

    if (patterns && patterns[selectedPatternIndex]) {
        const selectedPattern = patterns[selectedPatternIndex];

        if (selectedPattern.positions && selectedPattern.positions.length > 0) {
            // Calculate specific notes from fret positions against the active
            // instrument tuning (pos.string is 0-based, 0 = highest string).
            chordNotes = selectedPattern.positions.map(pos => {
                const noteAtFret = getNoteAtStringFret(pos.string, pos.fret);

                if (!noteAtFret) {
                    console.warn(`⚠️ Could not resolve note for string ${pos.string} fret ${pos.fret}`);
                    return null;
                }

                return convertNoteForPolySynth(noteAtFret.letter, noteAtFret.octave);
            }).filter(note => note !== null); // Remove any failed conversions
        }
    }

    // Fallback to chord theory notes if no pattern-specific notes
    if (chordNotes.length === 0 && chord.chordInfo && chord.chordInfo.notes) {
        chordNotes = chord.chordInfo.notes.map(note => {
            const cleanNote = notationStripOctave(note);
            return convertNoteForPolySynth(cleanNote, 4); // Use octave 4 as default
        });
    }

    return chordNotes;
}

/**
 * Get processed progression data with actual chord notes for sequencer
 * @returns {Array} Array of processed chord data with actual notes
 */
function getProcessedProgression() {
    return progressionState.currentProgression.map((chord, index) => {
        const processedNotes = getProcessedChordNotes(chord, index);
        return {
            ...chord,
            processedNotes: processedNotes,
            displayName: getChordDisplayName(chord, index)
        };
    });
}

/**
 * Convert note name to format expected by PolySynth
 * @param {string} noteName - Note name like "C", "F#", "Bb"
 * @param {number} octave - Octave number (default 4)
 * @returns {string} Formatted note like "C4", "F#4", "Bb4"
 */
function convertNoteForPolySynth(noteName, octave = 4) {
    if (!noteName || typeof noteName !== 'string') {
        console.warn('⚠️ convertNoteForPolySynth received invalid noteName:', noteName);
        return 'C4'; // Fallback to C4
    }
    return noteName.replace('/', '') + octave;
}

/**
 * Trigger a chord on the PolySynth
 * @param {Object} chord - Chord data containing chordInfo with notes
 * @param {number} index - Index of chord in progression
 */
function triggerChordProgression(chord, index) {
    if (!window.polySynthRef) {
        console.warn('PolySynth not available');
        return;
    }

    try {
        // Use the centralized function to get processed chord notes
        const chordNotes = getProcessedChordNotes(chord, index);

        if (chordNotes.length === 0) {
            console.warn('No notes available for chord');
            return;
        }

        console.log(`Triggering chord ${index}: ${getChordDisplayName(chord, index)}`, chordNotes);

        // Check if progression sequencer is running
        let sequencerState = null;
        if (window.polySynthRef.getProgressionSequencerState) {
            sequencerState = window.polySynthRef.getProgressionSequencerState();
        }

        // If sequencer is running, this is a timed/sequenced playback
        const isSequencedPlayback = sequencerState && sequencerState.playing;

        // Playback (as opposed to the sequencer-state read above) goes
        // through the 'synth' channel registered in src/audio/dispatch.js -
        // see that module's header for why the two are split.
        const synthChannel = getChannel('synth');

        // Stop any currently playing notes
        if (synthChannel.stopAllNotes) {
            synthChannel.stopAllNotes();
        }

        // Trigger the chord notes with appropriate duration
        if (synthChannel.playNotes) {
            if (isSequencedPlayback) {
                // Use the sequencer's duration setting (already converted to ms in the sequencer)
                const duration = getDurationInMs(sequencerState.duration);
                synthChannel.playNotes(chordNotes, 70, duration);
            } else {
                // Direct click - play for one beat (quarter note duration)
                const oneBeatDuration = getOneBeatDuration();
                synthChannel.playNotes(chordNotes, 70, oneBeatDuration);
            }
        } else if (synthChannel.triggerChord) {
            synthChannel.triggerChord(chordNotes);
        } else {
            console.warn('PolySynth playNotes/triggerChord method not available');
        }

    } catch (error) {
        console.error('Error triggering chord progression:', error);
    }
}

// Helper function to calculate one beat duration in milliseconds
function getOneBeatDuration() {
    try {
        // Get BPM from the metronome or default to 120
        const bpmSlider = document.querySelector('#bpmSlider');
        const bpm = bpmSlider ? Number(bpmSlider.value) : 120;
        return (60 / bpm) * 1000; // Quarter note duration in ms
    } catch (error) {
        console.warn('Could not get BPM, using default duration');
        return 500; // Default 500ms (120 BPM quarter note)
    }
}

// Helper function to convert duration string to milliseconds (matching PolySynth pattern)
function getDurationInMs(durationString) {
    try {
        const bpmSlider = document.querySelector('#bpmSlider');
        const bpm = bpmSlider ? Number(bpmSlider.value) : 120;
        const msPerBeat = (60 / bpm) * 1000; // Quarter note duration in ms

        switch (durationString) {
            case 'whole': return msPerBeat * 4;
            case 'half': return msPerBeat * 2;
            case 'quarter': return msPerBeat;
            case 'eighth': return msPerBeat / 2;
            case 'sixteenth': return msPerBeat / 4;
            default: return msPerBeat; // Default to quarter note
        }
    } catch (error) {
        return 500; // Fallback duration
    }
}

export {
    getProcessedChordNotes,
    getProcessedProgression,
    triggerChordProgression
};
