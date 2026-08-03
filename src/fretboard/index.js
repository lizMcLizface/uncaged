// Public barrel for src/fretboard/. This is what src/frets.js was reduced
// to across REFACTOR_PLAN.md Phase 3's extraction steps: state.js,
// geometry.js, markers.js, patterns.js, Fretboard.js (the class),
// ui/controls.js, ui/chordGrid.js and ui/scalePositionGrid.js all moved out
// (see ARCHITECTURE.md §6.3-6.10); what's left here is pure glue -
// `initializeFretboard()` and the console-facing search/chord-pattern
// helpers - plus the re-exports that make this folder's public surface a
// single import.
//
// External callers (src/index.js, src/chords.js, src/frets.test.js) import
// from here (`from './fretboard'`) instead of the now-deleted
// src/frets.js. The export surface below is unchanged from what frets.js
// exported - this step is a pure move, not a public-API change.
//
// Two-way imports with ./ui/controls.js / ./ui/chordGrid.js are pre-existing
// (frets.js had the same shape before this move) and safe for the same reason
// noted throughout Phase 3: every cross-import is only read inside a function
// body invoked later, never at module top-level.

import {processChord, generateSyntheticChords} from '../theory/chords';
import {HeptatonicScales, getScaleNotes, createHeptatonicScaleTable, createQuickScalePicker, getPrimaryScale, getPrimaryRootNote} from '../scales';
import {noteToMidi, noteToName, refreshKeyElements} from '../midi';
import {keyboardState} from '../keyboard';
import {
    translateNotes,
    stripOctave,
    translateNotes as notationTranslateNotes,
    stripOctave as notationStripOctave,
    noteToMidi as notationNoteToMidi
} from '../theory/notation';
import { CHROMATIC } from '../theory/notes';
import { getChannel } from '../audio/dispatch';
import {getChordPatterns, getPatternsByChordType} from '../chordPatterns';
import {
    getActiveConfig as getActiveInstrumentConfig,
    subscribe as subscribeToInstrumentChanges
} from '../tuning';
import { fretboardState, refreshScalePositionTuning } from './state';
import { getIntervalLabelFromRoot } from './geometry';
import {
    Fretboard,
    GUITAR_TUNING,
    SCALE_COLORS
} from './Fretboard';
import {
    createPiano,
    getPiano,
    pianoState,
    persistPianoSettings,
    VIEW_FRETBOARD,
    VIEW_PIANO
} from '../piano';
import { createFretboardControls } from './ui/controls';
import {
    buildIntervalLabelMap,
    buildFingeringShapes,
    renderFingeringShape,
    renderFingeringTabs,
    clearFingeringTabs,
    analyzeChordScaleCompatibility,
    updateChordGridColors
} from './ui/chordGrid';
import { renderScalePositionGrid } from './ui/scalePositionGrid';

// Map chord-suffix names (as used by processChord/the chord grid) to the
// pattern-type keys known-shape lookups in chordPatterns.js are keyed by.
const CHORD_TYPE_TO_PATTERN_TYPE = {
    'Major': 'major',
    'Minor': 'minor',
    '7': 'dominant7',
    'maj7': 'maj7',
    'm7': 'min7',
    'dim': 'dim',
    'dim7': 'dim7',
    'aug': 'aug',
    'sus2': 'sus2',
    'sus4': 'sus4',
    '5': 'power',
    'm7b5': 'm7b5'
};

/**
 * Create a new fretboard instance
 */
function createFretboard(containerId, options = {}) {
    const fretboard = new Fretboard(containerId, options);
    fretboardState.fretboardInstances.set(containerId, fretboard);
    return fretboard;
}

/**
 * Get an existing fretboard instance
 */
function getFretboard(containerId) {
    return fretboardState.fretboardInstances.get(containerId);
}

/**
 * Reconnect everything that is keyed to piano key elements, after the piano
 * has (re)built them.
 *
 * `refreshKeyElements` re-resolves src/midi.js's `keys` table and binds mouse
 * input to any newly-rendered key. Held computer-keyboard notes are then
 * reapplied by hand: `keydown` already fired for those, so a key element
 * created afterwards would otherwise render unpressed until the user let go.
 */
function syncPianoKeyState(piano) {
    refreshKeyElements();

    keyboardState.currentPressed.forEach(note => {
        const element = piano.keyElements.get(notationNoteToMidi(note));
        if (element) element.classList.add('pressedKey');
    });
}

/**
 * Repaint the piano's scale layer from the app's current scale and label
 * mode.
 *
 * Lives here rather than in `src/piano/` on purpose: this is the file that
 * already knows about `src/scales/` and `fretboardState`, and keeping the
 * reads on this side is what lets `src/piano/labels.js` stay a pure function
 * of its arguments. Same division as `syncPianoKeyState`.
 *
 * @param {{rootNote?: string, scaleNotes?: string[]}} [scaleData] - the
 *        `'scaleChanged'` event's detail, when there is one. Omitted on the
 *        initial paint and on a label-mode change, where the scale hasn't
 *        moved and is read from `src/scales/` instead.
 */
function refreshPianoScale(scaleData) {
    const piano = getPiano();
    if (!piano) return;

    let rootNote = scaleData && scaleData.rootNote;
    let scaleNotes = scaleData && scaleData.scaleNotes;

    if (!scaleNotes) {
        rootNote = getPrimaryRootNote();
        const primaryScale = getPrimaryScale();
        if (!rootNote || !primaryScale) return;

        // primaryScale is 'Family-Mode' ('Major-6'), and getScaleNotes wants
        // the interval pattern - the same resolution showChordOnFretboard does.
        const [family, mode] = primaryScale.split('-');
        if (!HeptatonicScales || !HeptatonicScales[family]) return;
        const scaleMode = HeptatonicScales[family][parseInt(mode, 10) - 1];
        if (!scaleMode) return;
        scaleNotes = getScaleNotes(rootNote, scaleMode.intervals);
    }

    // 'finger' is guitar-only; labels.js falls it back to note names (§8.3).
    piano.showScale(scaleNotes, rootNote, fretboardState.mainFretboardLabelMode);
}

/**
 * Swap what occupies the slot at the top of the page: the fretboard, or the
 * piano. Persisted, so a reload comes back to the same instrument.
 *
 * **Visibility only.** Both elements are built once at init and stay in the
 * DOM; nothing is torn down or re-created. `#fretNotPlaceholder` also hosts
 * the Synthesizer tab's React portal target, and rebuilding this container
 * out from under a mounted React tree is a race this codebase has already
 * hit once (src/index.js:230-236). It also means every module-level
 * `getElementById` lookup into the hidden half keeps resolving - the same
 * reason the six tabs toggle by `display` rather than unmounting.
 */
function setMainViewMode(mode) {
    const viewMode = mode === VIEW_PIANO ? VIEW_PIANO : VIEW_FRETBOARD;
    pianoState.viewMode = viewMode;
    persistPianoSettings();

    const fretboard = fretboardState.mainFretboard;
    if (fretboard && fretboard.fretboardElement) {
        fretboard.fretboardElement.style.display = viewMode === VIEW_PIANO ? 'none' : '';
    }
    const piano = getPiano();
    if (piano) {
        piano.setVisible(viewMode === VIEW_PIANO);
        // Repaint on the way in: the scale may have moved while the piano was
        // hidden, and its own 'scaleChanged' listener has nothing to do with
        // visibility.
        if (viewMode === VIEW_PIANO) refreshPianoScale();
    }

    document.dispatchEvent(new CustomEvent('mainViewModeChanged', { detail: { viewMode } }));
    return viewMode;
}

function getMainViewMode() {
    return pianoState.viewMode;
}

/**
 * Initialize the main fretboard in the fretNotPlaceholder
 */
function initializeFretboard() {
    const mainFretboard = createFretboard('fretNotPlaceholder', {
        showFretNumbers: true,
        showStringNames: false,
        tuning: getActiveInstrumentConfig().tuning
    });

    // Create control panel
    createFretboardControls(mainFretboard);

    // The piano view shares the fretboard's slot in #fretNotPlaceholder: built
    // here, immediately after the fretboard element, and hidden. It is built
    // once and only ever shown/hidden from now on - rebuilding this container's
    // contents races with the Synthesizer tab's React portal (src/index.js's
    // note). Nothing reveals it yet; that is PIANO_VIEW_PLAN.md step 6.
    createPiano(mainFretboard.container, {
        afterNode: mainFretboard.fretboardElement,
        visible: false,
        lowOctave: pianoState.lowOctave,
        octaveCount: pianoState.octaveCount,
        onRender: syncPianoKeyState
    });

    // setMainViewMode reads the main-fretboard pointer, which
    // initializeFretboardWithScale otherwise only assigns once this function
    // has returned - too late to apply the persisted view on first paint.
    fretboardState.mainFretboard = mainFretboard;
    setMainViewMode(pianoState.viewMode);
    refreshPianoScale();

    // Set the scale button as active by default and show the scale
    fretboardState.currentDisplayedChord = 0; // Scale button is index 0
    showScaleOnFretboard();
    updateChordButtonStyles();

    // Initialize scales in the new container after a short delay to ensure DOM is ready
    setTimeout(() => {
        initializeScalesInFretboard();
    }, 100);

    // Keep the fretboard, Scale Position Grid and chord-fingering UI in sync
    // whenever the active instrument/tuning changes (e.g. via the picker in
    // the top bar).
    subscribeToInstrumentChanges((config) => {
        mainFretboard.setTuning(config.tuning);
        refreshScalePositionTuning(config.tuning);
        clearFingeringTabs();
        fretboardState.currentDisplayedChord = 0;
        showScaleOnFretboard();
        updateChordButtonStyles();
        renderScalePositionGrid();
    });

    return mainFretboard;
}

/**
 * Initialize scales within the fretboard container
 */
function initializeScalesInFretboard() {
    // createQuickScalePicker() must run first: it creates #currentScaleNode/
    // #currentRootNode, and createHeptatonicScaleTable() ends by calling
    // updateCurrentScaleDisplay(), which silently no-ops (bailing out before
    // it dispatches the 'scaleChanged' event or populates the Scale
    // Information panel) if those nodes don't exist yet.
    if (typeof createQuickScalePicker === 'function') {
        createQuickScalePicker();
    } else {
        console.warn('createQuickScalePicker function not available');
    }
    if (typeof createHeptatonicScaleTable === 'function') {
        createHeptatonicScaleTable();
    } else {
        console.warn('createHeptatonicScaleTable function not available');
    }
}

/**
 * Force refresh of fretboard and chord grid (useful for manual calls)
 */
function refreshFretboardDisplay() {
    try {
        const primaryScale = getPrimaryScale();
        const rootNote = getPrimaryRootNote();

        if (primaryScale && rootNote && HeptatonicScales && Object.keys(HeptatonicScales).length > 0) {
            console.log('Manually refreshing fretboard display');

            // Update chord grid colors first
            updateChordGridColors();
            renderScalePositionGrid();

            // Then restore the appropriate fretboard display
            if (fretboardState.currentChordGridSelection) {
                // Re-apply chord grid selection with new scale context
                showChordPatternOnFretboard(fretboardState.currentChordGridSelection.note, fretboardState.currentChordGridSelection.chordType, false);
            } else if (fretboardState.currentDisplayedChord === 0) {
                // Show scale
                showScaleOnFretboard();
            } else if (fretboardState.currentDisplayedChord !== null && fretboardState.currentDisplayedChord > 0) {
                // Show Roman numeral chord
                showChordOnFretboard(fretboardState.currentDisplayedChord - 1);
            } else {
                // Default to showing scale
                showScaleOnFretboard();
            }
        } else {
            console.log('Cannot refresh: no scale selected or HeptatonicScales not available');
        }
    } catch (error) {
        console.warn('Error refreshing fretboard display:', error);
    }
}

/**
 * Resolve the actual sounding pitches (real octave, per string) for a
 * chord's best playable fretboard shape - the same shape-picking logic
 * used to display the chord's fingering on hover - so playback matches
 * what's shown rather than a generic root-position triad.
 * @param {Fretboard} fretboard
 * @param {string} rootNote
 * @param {string} chordType
 * @returns {Array<string>} notes in PolySynth format (e.g. "C4", "D#5")
 */
function getChordVoicingNotes(fretboard, rootNote, chordType) {
    const chordInfo = processChord(rootNote + chordType);
    if (!chordInfo || !chordInfo.notes) {
        return [];
    }

    const translatedChordNotes = notationTranslateNotes(chordInfo.notes);
    const chordNotes = translatedChordNotes.map(note =>
        typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note
    );

    const patternType = CHORD_TYPE_TO_PATTERN_TYPE[chordType];
    const specificPatterns = patternType ? getPatternsByChordType(patternType) : null;

    const shapes = buildFingeringShapes(fretboard, chordNotes, chordNotes[0], {}, specificPatterns);
    const bestShape = shapes[0];
    if (!bestShape || !Array.isArray(bestShape.positions)) {
        return [];
    }

    return bestShape.positions
        .map(position => fretboard.getNoteAt(position.string, position.fret))
        .filter(note => typeof note === 'string')
        .map(note => note.replace('/', ''));
}

/**
 * Play a chord voicing through PolySynth, activating the synth first if
 * needed - mirrors the activation dance used for regular key playback.
 * @param {Array<string>} notes - PolySynth-format notes (e.g. "C4")
 */
function playChordVoicing(notes) {
    const synthChannel = getChannel('synth');
    if (!notes || notes.length === 0 || !synthChannel || !synthChannel.playNotes) {
        return;
    }
    if (synthChannel.isActive && !synthChannel.isActive() && synthChannel.activate) {
        synthChannel.activate();
    }
    synthChannel.playNotes(notes, 70, 800);
}

/**
 * Show chord pattern on fretboard with scale context (local version)
 */
function showChordPatternOnFretboard(rootNote, chordType, isTemporary) {
    try {
        // If this is a permanent selection, update the tracking state
        if (!isTemporary) {
            fretboardState.currentChordGridSelection = { note: rootNote, chordType: chordType };
            // Clear Roman numeral selection since we're now showing a chord grid selection
            fretboardState.currentDisplayedChord = null;
            updateChordButtonStyles();
        }

        // Get current scale information
        const primaryScale = getPrimaryScale();
        const scaleRootNote = getPrimaryRootNote();

        if (primaryScale && scaleRootNote) {
            const [family] = primaryScale.split('-');
            // Guard against accessing HeptatonicScales before it's initialized
            if (!HeptatonicScales || !HeptatonicScales[family]) {
                console.warn('HeptatonicScales not yet initialized');
                return;
            }
            // Process the chord to get its notes
            const chordName = rootNote + chordType;
            const chordInfo = processChord(chordName);

            if (chordInfo && chordInfo.notes) {
                // Translate chord notes to match current scale context
                const translatedChordNotes = notationTranslateNotes(chordInfo.notes);

                // Get the fretboard instance
                const fretboard = getFretboard('fretNotPlaceholder');
                if (fretboard) {
                    const chordNotes = translatedChordNotes.map(note =>
                        typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note
                    );

                    const chordIntervalLabels = Array.isArray(chordInfo.intervals)
                        ? chordInfo.intervals
                        : chordNotes.map(note => getIntervalLabelFromRoot(chordNotes[0], note));
                    const intervalLabelMap = buildIntervalLabelMap(fretboard, chordNotes, chordIntervalLabels);

                    // Map chord types to pattern types for known-shape lookup
                    const patternType = CHORD_TYPE_TO_PATTERN_TYPE[chordType];
                    const specificPatterns = patternType ? getPatternsByChordType(patternType) : null;

                    // Find playable shapes (predefined first, best-effort fallback) and
                    // render the first one, with a position picker for the rest.
                    fretboardState.chordFingeringShapes = buildFingeringShapes(fretboard, chordNotes, chordNotes[0], intervalLabelMap, specificPatterns);
                    fretboardState.selectedFingeringTabIndex = 0;

                    const labelMode = fretboardState.mainFretboardLabelMode;
                    if (fretboardState.chordFingeringShapes.length > 0) {
                        renderFingeringShape(fretboard, fretboardState.chordFingeringShapes[0], labelMode);
                        console.log(`Displaying ${chordName} with ${fretboardState.chordFingeringShapes.length} playable shape(s) ${isTemporary ? 'temporarily' : 'persistently'}`);
                    } else {
                        fretboard.clearMarkers();
                        fretboard.clearChordLines();
                        console.log(`Displaying ${chordName} (no playable shape found)`);
                    }
                    renderFingeringTabs(fretboard, labelMode);

                    // Update chord info display for chord grid selections (both hover and click)
                    const chordDisplayName = `${rootNote} ${chordType}`;
                    updateChordInfoDisplay(chordDisplayName, chordNotes);
                }
            }
        }
    } catch (error) {
        console.warn('Could not display chord pattern:', error);
    }
}

/**
 * Restore fretboard to previous state (local version)
 */
function restoreFretboardState() {
    // Check if we have a permanent chord grid selection
    if (fretboardState.currentChordGridSelection) {
        // Restore the chord grid selection
        showChordPatternOnFretboard(fretboardState.currentChordGridSelection.note, fretboardState.currentChordGridSelection.chordType, false);
        return;
    }

    // Try to restore the previous Roman numeral state
    if (fretboardState.currentDisplayedChord === null) {
        // Clear fretboard and chord info display
        const fretboard = getFretboard('fretNotPlaceholder');
        if (fretboard) {
            fretboard.clearMarkers();
            fretboard.clearChordLines();
        }
        clearFingeringTabs();
        updateChordInfoDisplay(); // Clear chord info display
    } else if (fretboardState.currentDisplayedChord === 0) {
        // Show scale
        showScaleOnFretboard();
    } else {
        // Show current chord
        showChordOnFretboard(fretboardState.currentDisplayedChord - 1);
    }
}

/**
 * Helper function to show chord on fretboard
 */
function showChordOnFretboard(chordIndex, isTemporary = false) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) return;

    try {
        const primaryScale = getPrimaryScale();
        const rootNote = getPrimaryRootNote();

        if (!primaryScale || !rootNote) {
            console.warn('No primary scale or root note available');
            return;
        }

        // Get scale intervals
        const [family, mode] = primaryScale.split('-');
        // Guard against accessing HeptatonicScales before it's initialized
        if (!HeptatonicScales || !HeptatonicScales[family]) {
            console.warn('HeptatonicScales not yet initialized');
            return;
        }
        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;

        // Generate chords
        const chordLength = fretboardState.currentChordType === 'sevenths' ? 4 : 3;
        const syntheticChords = generateSyntheticChords({ intervals }, chordLength, rootNote);

        if (chordIndex >= 0 && chordIndex < syntheticChords.length) {
            const chord = syntheticChords[chordIndex];
            const romanNumerals = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
            const chordName = `${romanNumerals[chordIndex]} (${fretboardState.currentChordType})`;
            console.log(`Displaying chord: ${chordName} (${chord.join(', ')})`);

            // Update chord info display
            updateChordInfoDisplay(chordName, chord);

            // Find playable shapes (predefined chordPatterns.js shapes first, sorted by
            // lowest fret, best-effort fallback if none match) and render the first one,
            // with a position picker for the rest.
            const chordIntervalLabels = chord.map(note => getIntervalLabelFromRoot(chord[0], note));
            const intervalLabelMap = buildIntervalLabelMap(fretboard, chord, chordIntervalLabels);

            fretboardState.chordFingeringShapes = buildFingeringShapes(fretboard, chord, chord[0], intervalLabelMap, null);
            fretboardState.selectedFingeringTabIndex = 0;

            const labelMode = fretboardState.mainFretboardLabelMode;
            if (fretboardState.chordFingeringShapes.length > 0) {
                renderFingeringShape(fretboard, fretboardState.chordFingeringShapes[0], labelMode);
                console.log(`Displaying ${chordName} with ${fretboardState.chordFingeringShapes.length} playable shape(s)`);
            } else {
                fretboard.clearMarkers();
                fretboard.clearChordLines();
                console.log(`Displaying ${chordName} (no playable shape found)`);
            }
            renderFingeringTabs(fretboard, labelMode);
        }
    } catch (error) {
        console.warn('Could not generate chord:', error);
    }
}

/**
 * Helper function to show scale on fretboard
 */
function showScaleOnFretboard(isTemporary = false) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) return;

    try {
        const primaryScale = getPrimaryScale();
        const rootNote = getPrimaryRootNote();

        if (!primaryScale || !rootNote) {
            console.warn('No primary scale or root note available');
            return;
        }

        const [family, mode] = primaryScale.split('-');
        // Guard against accessing HeptatonicScales before it's initialized
        if (!HeptatonicScales || !HeptatonicScales[family]) {
            console.warn('HeptatonicScales not yet initialized');
            return;
        }
        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
        const scaleNotes = getScaleNotes(rootNote, intervals);

        // Update chord info display to show scale information
        const scaleName = `${rootNote} ${family} (Mode ${mode})`;
        updateChordInfoDisplay(scaleName, scaleNotes);

        // Clear markers and lines first to prevent overlap
        fretboard.clearMarkers();
        fretboard.clearChordLines();
        clearFingeringTabs();

        fretboard.markScale(scaleNotes, rootNote, {
            showIntervals: fretboardState.mainFretboardLabelMode === 'interval'
        });

        if (!isTemporary) {
            // Add to scale tracking only if this is a permanent selection
            fretboardState.fretboardsShowingScale.add(fretboard.containerId);
            fretboardState.fretboardsShowingChords.delete(fretboard.containerId);
        }
    } catch (error) {
        console.warn('Could not show scale:', error);
    }
}

/**
 * Helper function to update chord info display
 */
function updateChordInfoDisplay(chordName = null, chordNotes = null) {
    const chordInfoContainer = document.getElementById('chord-info-display');
    const chordNameDisplay = document.getElementById('chord-name-display');
    const chordNotesDisplay = document.getElementById('chord-notes-display');

    if (!chordInfoContainer || !chordNameDisplay || !chordNotesDisplay) {
        return; // Elements not found, probably not initialized yet
    }

    if (chordName && chordNotes) {
        // Translate notes to proper notation if scale context is available
        const translatedNotes = notationTranslateNotes(chordNotes);
        const displayNotes = translatedNotes.map(note => notationStripOctave(note));

        // Log for debugging the notation system
        if (JSON.stringify(chordNotes) !== JSON.stringify(displayNotes)) {
            console.log('🎵 Notation Translation:', {
                original: chordNotes.map(note => notationStripOctave(note)),
                translated: displayNotes,
                chord: chordName
            });
        }

        // Show chord information with properly notated notes
        chordNameDisplay.textContent = chordName;
        chordNotesDisplay.textContent = `Notes: ${displayNotes.join(' - ')}`;
        chordInfoContainer.style.display = 'block';
    } else {
        // Hide chord information
        chordInfoContainer.style.display = 'none';
    }
}

/**
 * Helper function to update chord button styles
 */
function updateChordButtonStyles() {
    const chordButtons = document.querySelectorAll('[data-chord-index]');
    chordButtons.forEach((button, index) => {
        const chordIndex = parseInt(button.dataset.chordIndex);
        if (fretboardState.currentDisplayedChord === chordIndex) {
            button.style.background = 'linear-gradient(to bottom, #007bff, #0056b3)';
            button.style.color = 'white';
            button.style.borderColor = '#0056b3';
        } else {
            button.style.background = 'linear-gradient(to bottom, #f8f9fa, #e9ecef)';
            button.style.color = '#333';
            button.style.borderColor = '#dee2e6';
        }
    });
}

/**
 * Update all fretboards that are currently showing the scale
 * This function should be called whenever the primary scale changes
 */
function updateFretboardsForScaleChange(scaleData) {
    // Skip if no fretboards are showing scales or chords, or if already updating
    if ((fretboardState.fretboardsShowingScale.size === 0 && fretboardState.fretboardsShowingChords.size === 0) || fretboardState.isUpdatingFretboards) return;

    try {
        fretboardState.isUpdatingFretboards = true;

        const { primaryScale, rootNote, scaleNotes } = scaleData;

        if (!primaryScale || !rootNote || !scaleNotes) {
            console.warn('Invalid scale data for fretboard update');
            return;
        }

        console.log(`Updating fretboards for scale change: ${rootNote} ${primaryScale}`);

        console.log('Scale notes:', scaleNotes);
        const [family, mode] = primaryScale.split('-');
        const scaleName = `${rootNote} ${family} (Mode ${mode})`;
        updateChordInfoDisplay(scaleName, scaleNotes);
        // Update all fretboards that are showing the scale
        fretboardState.fretboardsShowingScale.forEach(containerId => {
            const fretboard = fretboardState.fretboardInstances.get(containerId);
            if (fretboard) {
                fretboard.markScale(scaleNotes, rootNote, {
                    showIntervals: fretboardState.mainFretboardLabelMode === 'interval'
                });
            }
        });

        // Update all fretboards that are showing chords
        fretboardState.fretboardsShowingChords.forEach(containerId => {
            const fretboard = fretboardState.fretboardInstances.get(containerId);
            if (fretboard && fretboardState.currentDisplayedChord !== null) {
                // If we're in a hover state, show the full scale instead of chord
                if (fretboardState.isInHoverState) {
                    fretboard.clearMarkers();
                    fretboard.clearChordLines();
                    fretboard.markScale(scaleNotes, rootNote, {
                        showIntervals: fretboardState.mainFretboardLabelMode === 'interval'
                    });
                    return;
                }

                // Re-generate and display the current chord with new scale
                try {
                    if (fretboardState.currentDisplayedChord === 0) {
                        // Scale is selected, show scale
                        showScaleOnFretboard();
                    } else {
                        // Chord is selected (adjust index for chord array)
                        const [family, mode] = primaryScale.split('-');
                        // Guard against accessing HeptatonicScales before it's initialized
                        if (!HeptatonicScales || !HeptatonicScales[family]) {
                            console.warn('HeptatonicScales not yet initialized, skipping chord update');
                            return;
                        }
                        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
                        const chordLength = fretboardState.currentChordType === 'sevenths' ? 4 : 3;
                        const syntheticChords = generateSyntheticChords({ intervals }, chordLength, rootNote);

                        const chordIndex = fretboardState.currentDisplayedChord - 1;
                        if (chordIndex >= 0 && chordIndex < syntheticChords.length) {
                            // Use the updated showChordOnFretboard function which includes pattern matching
                            showChordOnFretboard(chordIndex);
                        }
                    }
                } catch (error) {
                    console.warn('Could not update chord for scale change:', error);
                }
            }
        });
    } catch (error) {
        console.warn('Could not update fretboards for scale change:', error);
    } finally {
        fretboardState.isUpdatingFretboards = false;
    }
}

// The piano's own scale subscription, deliberately separate from the
// fretboard's below: that one debounces and drops events whose root+scale key
// matches the last one, which is right for its expensive re-render and wrong
// here (a re-selection of the same scale should still repaint a piano that was
// hidden at the time). A CustomEvent listener rather than an entry in
// window.updateFretboardsForScaleChange - PIANO_VIEW_PLAN.md §7 - so the piano
// costs REFACTOR_PLAN.md Phase 5 nothing.
window.addEventListener('scaleChanged', (event) => {
    refreshPianoScale(event.detail);
});

// Listen for scale change events from the scale generator
window.addEventListener('scaleChanged', (event) => {
    // Debounce the updates to prevent rapid-fire events
    const now = Date.now();
    if (now - fretboardState.lastScaleUpdateTime < 200) { // Increased debounce to 200ms
        return;
    }

    // Check if the scale data has actually changed
    const currentScaleData = event.detail;
    const scaleKey = `${currentScaleData.rootNote}-${currentScaleData.primaryScale}`;
    const lastScaleKey = fretboardState.lastScaleData ? `${fretboardState.lastScaleData.rootNote}-${fretboardState.lastScaleData.primaryScale}` : null;

    if (scaleKey === lastScaleKey) {
        // Scale hasn't actually changed, skip update
        return;
    }

    fretboardState.lastScaleUpdateTime = now;
    fretboardState.lastScaleData = currentScaleData;
    console.log('Scale changed:', currentScaleData);

    updateFretboardsForScaleChange(event.detail);
    updateChordGridColors(); // Update chord grid colors when scale changes
    renderScalePositionGrid(); // Keep scale position mini-fretboards in sync with current scale

    // If there's a current chord grid selection, re-apply it with the new scale context
    if (fretboardState.currentChordGridSelection) {
        showChordPatternOnFretboard(fretboardState.currentChordGridSelection.note, fretboardState.currentChordGridSelection.chordType, false);
    }
});

/**
 * Global note search function - searches the main fretboard for a note
 * @param {string} note - Note to search for (e.g., 'C', 'F#', 'C/4')
 * @returns {Array} Array of position objects
 */
function searchFretboardNote(note) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return [];
    }
    return fretboard.searchNote(note);
}

/**
 * Global function to search for multiple notes at once
 * @param {Array} notes - Array of note names to search for
 * @returns {Object} Object with note names as keys and position arrays as values
 */
function searchFretboardNotes(notes) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return {};
    }
    return fretboard.searchMultipleNotes(notes);
}

/**
 * Quick search and mark function for console use
 * @param {string} note - Note to search for and mark
 * @param {Object} options - Optional styling options
 */
function quickSearchAndMark(note, options = {}) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return;
    }

    const results = fretboard.searchNote(note);
    console.log(`Found ${results.length} instances of "${note}":`, results);

    if (results.length > 0) {
        fretboard.clearMarkers();
        const defaultOptions = {
            backgroundColor: '#ffffff',
            borderColor: '#17a2b8',
            borderWidth: 3,
            textColor: '#333333',
            size: 24,
            useCustomStyle: true
        };

        results.forEach(result => {
            fretboard.markFret(result.string, result.fret, {
                ...defaultOptions,
                ...options,
                label: result.noteName + (result.octave !== null ? `/${result.octave}` : '')
            });
        });
    }

    return results;
}

/**
 * Get all unique notes available on the fretboard
 * @returns {Array} Array of unique note names
 */
function getFretboardNotes() {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return [];
    }
    return fretboard.getAllUniqueNotes();
}

/**
 * Analyze note distribution on the fretboard
 * @param {string} note - Note to analyze (optional, analyzes all if not provided)
 */
function analyzeFretboardNotes(note = null) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return;
    }

    if (note) {
        // Analyze specific note
        const results = fretboard.searchNote(note);
        console.group(`🎸 Analysis for note "${note}"`);
        console.log(`Total instances: ${results.length}`);

        if (results.length > 0) {
            // Fret distribution
            const fretDist = {};
            results.forEach(r => fretDist[r.fret] = (fretDist[r.fret] || 0) + 1);
            console.log('Fret distribution:', fretDist);

            // String distribution
            const stringDist = {};
            results.forEach(r => stringDist[`String ${r.string + 1}`] = (stringDist[`String ${r.string + 1}`] || 0) + 1);
            console.log('String distribution:', stringDist);

            // Octave distribution
            const octaveDist = {};
            results.forEach(r => octaveDist[`Octave ${r.octave}`] = (octaveDist[`Octave ${r.octave}`] || 0) + 1);
            console.log('Octave distribution:', octaveDist);
        }
        console.groupEnd();
    } else {
        // Analyze all notes
        const allNotes = fretboard.getAllUniqueNotes();
        console.group('🎸 Complete Fretboard Analysis');
        console.log(`Total unique notes: ${allNotes.length}`);
        console.log('Available notes:', allNotes);

        const noteDistribution = {};
        allNotes.forEach(noteName => {
            const count = fretboard.searchNote(noteName).length;
            noteDistribution[noteName] = count;
        });

        console.log('Note frequency distribution:');
        console.table(noteDistribution);
        console.groupEnd();
    }
}

/**
 * Helper function to create common subscale box patterns
 */
function createSubscaleBoxPattern(fretboard, patternType, startFret, options = {}) {
    const patterns = {
        'pentatonic-box1': { strings: [0, 2], frets: 3, label: 'Pentatonic Box 1' },
        'pentatonic-box2': { strings: [1, 3], frets: 3, label: 'Pentatonic Box 2' },
        'major-scale-position1': { strings: [0, 4], frets: 4, label: 'Major Scale Pos 1' },
        'minor-scale-position1': { strings: [0, 4], frets: 4, label: 'Minor Scale Pos 1' },
        'chord-shape': { strings: [1, 2], frets: 2, label: 'Chord Shape' },
        'three-string-run': { strings: [2, 4], frets: 3, label: 'Three String Run' },
        'full-neck': { strings: [0, 5], frets: 12, label: 'Full Neck' }
    };

    const pattern = patterns[patternType];
    if (!pattern) {
        console.warn(`Unknown pattern type: ${patternType}`);
        return false;
    }

    const endFret = Math.min(startFret + pattern.frets, 15);
    const mergedOptions = {
        label: pattern.label,
        labelPosition: 'bottom',
        color: '#ff6b35',
        ...options
    };

    fretboard.drawSubscaleBox(
        `${patternType}-${startFret}`,
        pattern.strings[0],
        pattern.strings[1],
        startFret,
        endFret,
        mergedOptions
    );

    return true;
}

/**
 * Global function to display chord patterns on the main fretboard
 * @param {Array} chordNotes - Array of note names that make up the chord
 * @param {string} rootNote - The root note of the chord
 * @param {Object} options - Display options
 * @returns {Array} Array of matching patterns
 */
function displayChordPatterns(chordNotes, rootNote, options = {}) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return [];
    }
    return fretboard.displayChordWithPatterns(chordNotes, rootNote, options);
}

/**
 * Global function to show all chord patterns for a specific chord type
 * @param {Array} chordNotes - Array of note names that make up the chord
 * @param {string} rootNote - The root note of the chord
 * @param {string} chordType - Type of chord (e.g., 'major', 'minor', 'dominant7')
 * @param {Object} options - Display options
 * @returns {Array} Array of matching patterns
 */
function showAllChordPatterns(chordNotes, rootNote, chordType = null, options = {}) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return [];
    }
    return fretboard.showAllChordPatterns(chordNotes, rootNote, chordType, options);
}

/**
 * Quick chord pattern demo function for console use
 * @param {string} chordName - Name of chord (e.g., 'C major', 'A minor', 'G7')
 * @param {Object} options - Optional display options
 */
function quickChordPattern(chordName, options = {}) {
    const fretboard = getFretboard('fretNotPlaceholder');
    if (!fretboard) {
        console.warn('Main fretboard not found');
        return;
    }

    // Parse chord name and determine notes
    const parseChord = (name) => {
        const lowerName = name.toLowerCase();

        // Extract root note (first character, potentially with # or b)
        let root = name.charAt(0).toUpperCase();
        let i = 1;
        if (i < name.length && (name.charAt(i) === '#' || name.charAt(i) === 'b')) {
            root += name.charAt(i);
            i++;
        }

        // Determine chord type
        let chordType = '';
        let notes = [];

        if (lowerName.includes('major') || (!lowerName.includes('minor') && !lowerName.includes('7'))) {
            chordType = 'major';
            notes = [root, getThird(root, 'major'), getFifth(root)];
        } else if (lowerName.includes('minor')) {
            chordType = 'minor';
            notes = [root, getThird(root, 'minor'), getFifth(root)];
        } else if (lowerName.includes('7')) {
            chordType = 'dominant7';
            notes = [root, getThird(root, 'major'), getFifth(root), getSeventh(root, 'dominant')];
        }

        return { root, chordType, notes };
    };

    // Helper functions to calculate chord tones (simplified)
    const getThird = (root, type) => {
        const notes = CHROMATIC;
        const rootIndex = notes.indexOf(root);
        const offset = type === 'major' ? 4 : 3;
        return notes[(rootIndex + offset) % 12];
    };

    const getFifth = (root) => {
        const notes = CHROMATIC;
        const rootIndex = notes.indexOf(root);
        return notes[(rootIndex + 7) % 12];
    };

    const getSeventh = (root, type) => {
        const notes = CHROMATIC;
        const rootIndex = notes.indexOf(root);
        const offset = type === 'dominant' ? 10 : 11;
        return notes[(rootIndex + offset) % 12];
    };

    try {
        const { root, chordType, notes } = parseChord(chordName);
        console.log(`🎸 Displaying patterns for ${chordName}: ${notes.join(' - ')}`);

        const matches = fretboard.displayChordWithPatterns(notes, root, {
            clearFirst: true,
            preferredPatterns: getPatternsByChordType(chordType),
            ...options
        });

        console.log(`Found ${matches.length} pattern matches for ${chordName}`);
        return matches;
    } catch (error) {
        console.error(`Could not parse chord "${chordName}":`, error);
        return [];
    }
}

// Export the main functions
export {
    Fretboard,
    createFretboard,
    getFretboard,
    initializeFretboard,
    setMainViewMode,
    getMainViewMode,
    refreshPianoScale,
    createSubscaleBoxPattern,
    searchFretboardNote,
    searchFretboardNotes,
    quickSearchAndMark,
    getFretboardNotes,
    analyzeFretboardNotes,
    displayChordPatterns,
    showAllChordPatterns,
    getChordPatterns,
    getPatternsByChordType,
    quickChordPattern,
    showChordOnFretboard,
    showScaleOnFretboard,
    analyzeChordScaleCompatibility,
    updateChordGridColors,
    refreshFretboardDisplay,
    fretboardState,
    GUITAR_TUNING,
    SCALE_COLORS
};

// Not part of the public barrel above - exported only so
// src/fretboard/ui/controls.js and src/fretboard/ui/chordGrid.js can
// cross-import them (REFACTOR_PLAN.md Phase 3). See the circular-import
// note at the top of this file for why this is safe.
export {
    showChordPatternOnFretboard,
    restoreFretboardState,
    updateChordButtonStyles,
    updateChordInfoDisplay,
    playChordVoicing,
    getChordVoicingNotes
};



// Initialize Fretboard - defer until DOM is ready
// (module-level main-fretboard pointer now lives in fretboardState.mainFretboard)

// Function to initialize fretboard with proper scale display
function initializeFretboardWithScale() {
    try {
        fretboardState.mainFretboard = initializeFretboard();
        console.log('Fretboard initialized successfully');

        // Force a scale visualization and chord grid color update after initialization
        // Use setTimeout to ensure all modules are fully loaded
        setTimeout(() => {
            // Check if we have HeptatonicScales available
            if (HeptatonicScales && Object.keys(HeptatonicScales).length > 0) {
                // Force show the scale if one is selected
                const primaryScale = getPrimaryScale();
                const rootNote = getPrimaryRootNote();

                if (primaryScale && rootNote) {
                    console.log('Refreshing fretboard display with current scale');
                    showScaleOnFretboard();
                    updateChordGridColors();
                    renderScalePositionGrid();
                } else {
                    console.log('No primary scale selected, fretboard initialized without scale display');
                }
            } else {
                console.warn('HeptatonicScales not yet available during fretboard initialization');
            }
        }, 250); // Give extra time for all modules to initialize

    } catch (error) {
        console.warn('Failed to initialize fretboard:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFretboardWithScale);
} else {
    // DOM is already ready, initialize now but with a small delay
    setTimeout(initializeFretboardWithScale, 100);
}

// Make fretboard globally accessible for other modules
window.mainFretboard = fretboardState.mainFretboard;

// Make search functions globally accessible for console use
window.searchFretboardNote = searchFretboardNote;
window.searchFretboardNotes = searchFretboardNotes;
window.quickSearchAndMark = quickSearchAndMark;
window.getFretboardNotes = getFretboardNotes;
window.analyzeFretboardNotes = analyzeFretboardNotes;

// Make chord pattern functions globally accessible for console use
window.displayChordPatterns = displayChordPatterns;
window.showAllChordPatterns = showAllChordPatterns;
window.getChordPatterns = getChordPatterns;
window.getPatternsByChordType = getPatternsByChordType;
window.quickChordPattern = quickChordPattern;

// Make chord grid analysis functions globally accessible for console use
window.analyzeChordScaleCompatibility = analyzeChordScaleCompatibility;
window.updateChordGridColors = updateChordGridColors;
window.refreshFretboardDisplay = refreshFretboardDisplay;
window.updateFretboardsForScaleChange = updateFretboardsForScaleChange;

// Make notation functions globally accessible for testing
window.testNotationSystem = function() {
    console.log('🎵 Testing Musical Notation System');
    console.log('=====================================');

    // Test scale generation with proper enharmonics
    const scales = [
        { root: 'C', intervals: ['W', 'W', 'H', 'W', 'W', 'W', 'H'], name: 'C Major' },
        { root: 'F#', intervals: ['W', 'W', 'H', 'W', 'W', 'W', 'H'], name: 'F# Major' },
        { root: 'Db', intervals: ['W', 'W', 'H', 'W', 'W', 'W', 'H'], name: 'Db Major' },
        { root: 'A', intervals: ['W', 'H', 'W', 'W', 'H', 'W', 'W'], name: 'A Minor' }
    ];

    scales.forEach(scale => {
        console.log(`\n${scale.name} Scale:`);

        // Generate scale using the new notation system
        const scaleNotes = getScaleNotes(scale.root, scale.intervals);
        const displayNotes = scaleNotes.map(note => stripOctave(note));
        console.log(`  Proper notation: ${displayNotes.join(' - ')}`);

        // Compare with original system for reference
        const oldScaleNotes = scale.intervals.reduce((acc, interval, i) => {
            if (i === 0) return [scale.root];
            const semitones = interval === 'W' ? 2 : interval === 'H' ? 1 : 3;
            const lastMidi = noteToMidi(acc[acc.length - 1] + '/4');
            const nextMidi = lastMidi + semitones;
            const nextNote = noteToName(nextMidi).split('/')[0];
            acc.push(nextNote);
            return acc;
        }, []);
        console.log(`  Old chromatic:   ${oldScaleNotes.join(' - ')}`);
    });

    console.log(`\n✨ Enhanced notation system active!`);
};

window.testScaleContext = function() {
    console.log('🎵 Testing Scale Context Translation');
    console.log('===================================');

    // Test note translation with F# Major
    const intervals = ['W', 'W', 'H', 'W', 'W', 'W', 'H'];
    const scaleNotes = getScaleNotes('F#', intervals);

    console.log('F# Major scale with proper notation:');
    console.log('Scale notes:', scaleNotes.map(n => stripOctave(n)).join(' - '));

    // Test translation of chord notes in this context
    const testChord = ['F#', 'A#', 'C#']; // F# Major chord
    const translated = translateNotes(testChord);
    console.log('F# Major chord - Original:', testChord.join(' - '));
    console.log('F# Major chord - Proper:  ', translated.map(n => stripOctave(n)).join(' - '));
};
