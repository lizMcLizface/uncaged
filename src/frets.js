import {processChord, generateSyntheticChords} from './theory/chords';
import {HeptatonicScales, scales, getScaleNotes, highlightKeysForScales, translateNotes, stripOctave} from './scales';
import {createHeptatonicScaleTable, createQuickScalePicker, selectedRootNote, selectedScales, getPrimaryScale, getPrimaryRootNote} from './scaleGenerator';
import {chords, highlightKeysForChords, createChordRootNoteTable, createChordSuffixTable, selectedChordRootNote, selectedChordSuffixes} from './chords';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI} from './midi';
import {
    midiToNote as notationMidiToNote,
    noteToMidi as notationNoteToMidi,
    translateNotes as notationTranslateNotes,
    stripOctave as notationStripOctave,
    areEnharmonicEquivalent,
    noteArrayContains,
    filterEnharmonicMatches,
    normalizeNote
} from './theory/notation';
import { CHROMATIC } from './theory/notes';
import { getIntervalColor } from './theory/intervals';
import { getChannel } from './audio/dispatch';
import { createChordProgressionUI, loadSharedStateFromURL } from './progressionBuilder';
import {getChordPatterns, getPatternsByChordType} from './chordPatterns';
import {assignFingers, selectGripFromPositions, classifyFingeringSource} from './chordFingering';
import {
    getPresets as getInstrumentPresets,
    getActiveConfig as getActiveInstrumentConfig,
    setActiveConfig as setActiveInstrumentConfig,
    subscribe as subscribeToInstrumentChanges,
    toSlashFormat as tuningToSlashFormat
} from './tuning';
import { fretboardState, refreshScalePositionTuning, persistScalePositionGridSettings } from './fretboard/state';
import { getIntervalLabelFromRoot } from './fretboard/geometry';
import { createNoteShapeMarker } from './fretboard/markers';
import {
    Fretboard,
    GUITAR_TUNING,
    FRET_COUNT,
    SCALE_COLORS,
    addInteractiveEvent
} from './fretboard/Fretboard';

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

// Scale Position Grid row anchors/tuning, its persisted display settings,
// the fretboard instance registry, chord/display state and the scale-change
// debounce timestamps all live in src/fretboard/state.js (REFACTOR_PLAN.md
// Phase 3) as `fretboardState`, imported above alongside
// refreshScalePositionTuning()/persistScalePositionGridSettings(). What's
// left here is pure, never-reassigned config data for the grid.
const SCALE_POSITION_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const MINI_SCALE_FRET_COUNT = 6;
const GENERIC_VISIBLE_FRET_START = 1;
const GENERIC_ROOT_DISPLAY_COLUMN = 1;
const SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET = 0;

const SCALE_POSITION_STACK_SIZES = { dyad: 2, triad: 3, tetrad: 4 };

const SEMITONE_TO_SCALE_INTERVAL_LABEL = ['R', 'm2', 'M2', 'm3', 'M3', 'A3', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7'];
const NOTE_SHAPE_TYPES = ['circle', 'square', 'diamond', 'triangle-up', 'triangle-down', 'pentagon', 'hexagon', 'star', 'cross', 'plus', 'triangle-right', 'triangle-left'];
const MODE_DISPLAY_NAMES = ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'];

// The Fretboard class, its default tuning/fret-count/marker-color
// constants, and the addInteractiveEvent DOM helper now live in
// src/fretboard/Fretboard.js (REFACTOR_PLAN.md Phase 3) - imported above.

// Fretboard instance registry, chord/display state and chord-fingering tab
// state now live in src/fretboard/state.js as `fretboardState` (imported
// above) - REFACTOR_PLAN.md Phase 3.

function normalizeIntervalLabel(label) {
    if (!label || label === '?') {
        return '';
    }
    return label === 'P1' ? 'R' : label;
}

// getIntervalLabelFromRoot now lives in src/fretboard/geometry.js (imported
// above) - needed by both this file and the Fretboard class.

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
 * Build a simple tabbed panel: a horizontal tab bar plus a content area that
 * shows exactly one tab's content at a time (toggled via display, so nothing
 * is unmounted and module-level state / getElementById lookups keep working
 * regardless of which tab is active).
 * @param {Array<{label: string, content: HTMLElement}>} tabs
 * @param {number} defaultActiveIndex
 * @param {string} [storageKey] - When given, persists the active tab's label
 *   here on every switch so the last-opened tab is restored on reload.
 * @returns {HTMLElement}
 */
function createTabbedPanel(tabs, defaultActiveIndex = 0, storageKey = null) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        margin-top: 16px;
    `;

    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
        display: flex;
        gap: 4px;
        border-bottom: 2px solid #444;
        margin-bottom: 12px;
        flex-wrap: wrap;
    `;

    const helpBar = document.createElement('div');
    helpBar.style.cssText = `
        font-size: 12px;
        color: #bbb;
        background: rgba(255,255,255,0.05);
        border-radius: 6px;
        padding: 8px 12px;
        margin-bottom: 12px;
    `;

    const contentArea = document.createElement('div');

    let activeIndex = defaultActiveIndex;
    const buttons = [];

    function styleButton(button, isActive, alignRight) {
        button.style.cssText = `
            padding: 10px 18px;
            font-size: 14px;
            font-weight: ${isActive ? 'bold' : 'normal'};
            color: ${isActive ? '#fff' : '#aaa'};
            background: ${isActive ? 'hsla(0, 0%, 24%, 1.00)' : 'transparent'};
            border: none;
            border-bottom: 2px solid ${isActive ? '#4A90E2' : 'transparent'};
            margin-bottom: -2px;
            ${alignRight ? 'margin-left: auto;' : ''}
            cursor: pointer;
            border-radius: 6px 6px 0 0;
        `;
    }

    function setActive(index) {
        activeIndex = index;
        tabs.forEach((tab, i) => {
            tab.content.style.display = i === activeIndex ? '' : 'none';
            styleButton(buttons[i], i === activeIndex, tab.alignRight);
        });

        const helpText = tabs[activeIndex].help;
        helpBar.textContent = helpText || '';
        helpBar.style.display = helpText ? '' : 'none';

        if (storageKey) {
            try {
                localStorage.setItem(storageKey, tabs[activeIndex].label);
            } catch (error) {
                console.warn('Could not persist active tab', error);
            }
        }
    }

    tabs.forEach((tab, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = tab.label;
        button.addEventListener('click', () => setActive(i));
        buttons.push(button);
        tabBar.appendChild(button);
        contentArea.appendChild(tab.content);
    });

    setActive(defaultActiveIndex);

    wrapper.appendChild(tabBar);
    wrapper.appendChild(helpBar);
    wrapper.appendChild(contentArea);
    return wrapper;
}

/**
 * Build and attach the page footer listing the computer-keyboard hotkeys:
 * scale/root navigation (index.js's keydown handler) and the QWERTY-to-piano
 * mapping plus octave shift (keyboard.js / index.js).
 *
 * Anchored to the bottom of the page (position: fixed) rather than left in
 * normal flow, so it stays visible instead of trailing after whatever the
 * active tab's content happens to be. A same-height spacer is appended to
 * `container` right along with the footer so the fixed footer never covers
 * the tail end of the tab content beneath it; a ResizeObserver keeps the
 * spacer in sync as the footer wraps to more/fewer rows on resize.
 * @param {HTMLElement} container - element the footer (and its spacer) are appended to
 */
function attachHotkeyFooter(container) {
    const footer = document.createElement('div');
    footer.style.cssText = `
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
        padding: 12px 16px;
        background: rgba(20,20,20,0.95);
        border-top: 1px solid rgba(255,255,255,0.1);
        font-size: 12px;
        color: #aaa;
        line-height: 1.6;
        box-sizing: border-box;
    `;

    const heading = document.createElement('div');
    heading.textContent = 'Keyboard Shortcuts';
    heading.style.cssText = `font-weight: bold; color: #ddd; margin-bottom: 6px;`;
    // footer.appendChild(heading);

    const rows = document.createElement('div');
    rows.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px 28px;
    `;
    rows.innerHTML = `
        <div><h1>Hotkeys:</h1></div>
        <div><strong>, / .</strong> - previous/next root note</div>
        <div><strong>n / m</strong> - previous/next scale mode</div>
        <div><strong>v / b</strong> - previous/next scale family</div>
        <div><strong>Home row (A S D F G H J K L ; ')</strong> - white keys</div>
        <div><strong>Row above (W E T Y U I O)</strong> - black keys</div>
        <div><strong>z / x</strong> - shift the synth down/up an octave</div>
    `;
    footer.appendChild(rows);

    // Reserve enough space below the tab content so the fixed footer never
    // covers it. A spacer *child* (rather than padding on the container) is
    // used because the mobile media queries set `padding: 5px !important`
    // on the container, which would otherwise clobber a padding-based fix.
    // `order: 9999` keeps it last even if a sibling has an explicit order.
    const spacer = document.createElement('div');
    spacer.style.cssText = `flex-shrink: 0; width: 100%; order: 9999;`;
    const reserveSpace = () => {
        spacer.style.height = `${footer.offsetHeight}px`;
    };
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(reserveSpace).observe(footer);
    } else {
        window.addEventListener('resize', reserveSpace);
        setTimeout(reserveSpace, 0);
    }

    container.appendChild(spacer);
    container.appendChild(footer);
}

/**
 * Build the persistent top bar: the app title plus a compact root/scale/mode
 * quick-picker (populated by createQuickScalePicker into #quickScaleControls).
 * This is separate from the detailed root-note/scale-family×mode tables,
 * which remain in their own tab for browsing - the top bar is just for fast
 * changes. Sits above the fretboard so both are always visible regardless of tab.
 * @returns {HTMLElement}
 */
/**
 * Build the instrument/tuning picker: a preset dropdown (grouped by family)
 * plus a "Custom Tuning" mode that reveals a per-string note editor. Applying
 * either just calls setActiveInstrumentConfig() - actually rebuilding the
 * fretboard/grid/progression builder happens via the subscription each of
 * those wires up separately (see initializeFretboard / progressionBuilder.js).
 */
function createInstrumentTuningPicker() {
    const presets = getInstrumentPresets();
    const activeConfig = getActiveInstrumentConfig();

    const wrapper = document.createElement('div');
    wrapper.id = 'instrumentTuningControls';
    wrapper.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    `;

    const label = document.createElement('span');
    label.textContent = 'Instrument:';
    label.style.cssText = `color: #ccc; font-size: 13px; font-weight: 500;`;
    wrapper.appendChild(label);

    const select = document.createElement('select');
    select.id = 'instrumentTuningSelect';
    select.style.cssText = `
        padding: 6px 8px;
        border-radius: 6px;
        border: 1px solid #555;
        background: #333;
        color: #fff;
        font-size: 13px;
    `;

    const familyLabels = { guitar: 'Guitar', bass: 'Bass' };
    Object.entries(familyLabels).forEach(([familyKey, familyLabel]) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = familyLabel;
        Object.entries(presets)
            .filter(([, preset]) => preset.family === familyKey)
            .forEach(([presetId, preset]) => {
                const option = document.createElement('option');
                option.value = presetId;
                option.textContent = preset.label;
                optgroup.appendChild(option);
            });
        select.appendChild(optgroup);
    });

    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom Tuning…';
    select.appendChild(customOption);

    select.value = presets[activeConfig.presetId] ? activeConfig.presetId : 'custom';
    wrapper.appendChild(select);

    // Custom tuning editor: string count + one note field per string.
    const customPanel = document.createElement('div');
    customPanel.id = 'customTuningPanel';
    customPanel.style.cssText = `
        display: none;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        background: rgba(255, 255, 255, 0.08);
        padding: 6px 8px;
        border-radius: 6px;
    `;

    const fieldStyle = `
        width: 46px;
        padding: 4px;
        border-radius: 4px;
        border: 1px solid #555;
        background: #222;
        color: #fff;
        font-size: 12px;
        text-align: center;
    `;

    const stringCountLabel = document.createElement('span');
    stringCountLabel.textContent = 'Strings:';
    stringCountLabel.style.cssText = `color: #ccc; font-size: 12px;`;
    customPanel.appendChild(stringCountLabel);

    const stringCountInput = document.createElement('input');
    stringCountInput.type = 'number';
    stringCountInput.min = '4';
    stringCountInput.max = '8';
    stringCountInput.style.cssText = fieldStyle;
    customPanel.appendChild(stringCountInput);

    const stringInputsContainer = document.createElement('div');
    stringInputsContainer.style.cssText = `display: flex; gap: 4px; flex-wrap: wrap;`;
    customPanel.appendChild(stringInputsContainer);

    function renderStringInputs(tuning) {
        stringInputsContainer.innerHTML = '';
        tuning.forEach((note, index) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = note;
            input.title = `String ${index + 1} (${index === 0 ? 'highest' : index === tuning.length - 1 ? 'lowest' : 'e.g. E4, F#1, Bb2'})`;
            input.style.cssText = fieldStyle;
            stringInputsContainer.appendChild(input);
        });
    }

    stringCountInput.value = String(activeConfig.stringCount);
    renderStringInputs(activeConfig.tuning);

    stringCountInput.addEventListener('change', () => {
        let count = parseInt(stringCountInput.value, 10);
        if (!Number.isFinite(count)) count = stringInputsContainer.children.length;
        count = Math.max(4, Math.min(8, count));
        stringCountInput.value = String(count);

        const existing = Array.from(stringInputsContainer.children).map(el => el.value);
        const fallbackTuning = presets.guitar8.tuning;
        const newTuning = existing.slice(0, count);
        while (newTuning.length < count) {
            newTuning.push(fallbackTuning[newTuning.length] || existing[existing.length - 1] || 'E2');
        }
        renderStringInputs(newTuning);
    });

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.style.cssText = `
        padding: 5px 10px;
        border-radius: 5px;
        border: none;
        background: linear-gradient(to bottom, #4a4a4a, #333);
        color: #fff;
        cursor: pointer;
        font-size: 12px;
    `;
    addInteractiveEvent(applyButton, 'click', () => {
        const tuning = Array.from(stringInputsContainer.children)
            .map(el => el.value.trim())
            .filter(Boolean);
        if (tuning.length < 4) {
            window.alert('Please provide at least 4 strings.');
            return;
        }
        setActiveInstrumentConfig({ presetId: 'custom', family: activeConfig.family, tuning });
    });
    customPanel.appendChild(applyButton);

    wrapper.appendChild(customPanel);

    function syncCustomPanelVisibility() {
        customPanel.style.display = select.value === 'custom' ? 'flex' : 'none';
    }
    syncCustomPanelVisibility();

    select.addEventListener('change', () => {
        syncCustomPanelVisibility();
        if (select.value === 'custom') {
            // Seed the editor from whatever tuning is active right now.
            const currentConfig = getActiveInstrumentConfig();
            stringCountInput.value = String(currentConfig.stringCount);
            renderStringInputs(currentConfig.tuning);
            return;
        }
        const preset = presets[select.value];
        if (preset) {
            setActiveInstrumentConfig({ presetId: select.value, family: preset.family, tuning: preset.tuning });
        }
    });

    return wrapper;
}

function createTopBar() {
    const topBar = document.createElement('div');
    topBar.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
        padding: 14px 18px;
        margin-bottom: 12px;
        background: hsla(0, 0%, 20%, 1);
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    const title = document.createElement('h1');
    title.textContent = 'unCAGED';
    title.style.cssText = `
        margin: 0;
        color: #fff;
        font-size: 24px;
        font-weight: bold;
        flex: 0 0 auto;
    `;
    topBar.appendChild(title);
    topBar.appendChild(createInstrumentTuningPicker());

    const quickScaleControls = document.createElement('div');
    quickScaleControls.id = 'quickScaleControls';
    quickScaleControls.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
        margin-left: auto;
    `;
    topBar.appendChild(quickScaleControls);

    return topBar;
}

/**
 * Create control buttons for the fretboard
 */
function createFretboardControls(fretboard) {
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: hsla(0, 0%, 24%, 1.00);
        border-radius: 12px;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border: 1px solid #ddd;
    `;
    
    const buttonStyle = `
        padding: 10px 20px;
        background: linear-gradient(to bottom, #4a4a4a, #333);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    
    const buttonHoverStyle = `
        background: linear-gradient(to bottom, #5a5a5a, #444);
        transform: translateY(-1px);
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
    `;
    
    // Clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear All';
    clearButton.style.cssText = buttonStyle;
    clearButton.addEventListener('mouseenter', () => {
        clearButton.style.cssText = buttonStyle + buttonHoverStyle;
    });
    clearButton.addEventListener('mouseleave', () => {
        clearButton.style.cssText = buttonStyle;
    });
    addInteractiveEvent(clearButton, 'click', () => {
        // Clear hover state flag
        fretboardState.isInHoverState = false;
        
        fretboard.clearMarkers();
        fretboard.clearChordLines();
        // Clear all tracking state
        fretboardState.fretboardsShowingScale.delete(fretboard.containerId);
        fretboardState.fretboardsShowingChords.delete(fretboard.containerId);
        fretboardState.currentDisplayedChord = null;
        fretboardState.currentChordGridSelection = null; // Clear chord grid selection
        clearFingeringTabs();
        // Clear chord info display
        updateChordInfoDisplay();
        // Update chord button styles
        updateChordButtonStyles();
    });
    
    // Show all notes button
    const showAllButton = document.createElement('button');
    showAllButton.textContent = 'Show All Notes';
    showAllButton.style.cssText = buttonStyle;
    showAllButton.addEventListener('mouseenter', () => {
        showAllButton.style.cssText = buttonStyle + buttonHoverStyle;
    });
    showAllButton.addEventListener('mouseleave', () => {
        showAllButton.style.cssText = buttonStyle;
    });
    addInteractiveEvent(showAllButton, 'click', () => {
        fretboard.markAllNotes();
        clearFingeringTabs();
        // Remove this fretboard from the scale tracking set since it's now showing all notes
        fretboardState.fretboardsShowingScale.delete(fretboard.containerId);
    });
    
    // Show current scale button
    const showScaleButton = document.createElement('button');
    showScaleButton.textContent = 'Show Current Scale';
    showScaleButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #ff6b35, #e55a2b);
    `;
    addInteractiveEvent(showScaleButton, 'enter', () => {
        showScaleButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #ff7b45, #f56a3b);
        `;
    });
    addInteractiveEvent(showScaleButton, 'leave', () => {
        showScaleButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #ff6b35, #e55a2b);
        `;
    });
    addInteractiveEvent(showScaleButton, 'click', () => {
        // Get current scale from the scale generator
        try {
            const primaryScale = getPrimaryScale();
            if (!primaryScale) {
                console.warn('No primary scale available');
                return;
            }
            
            const [family, mode] = primaryScale.split('-');
            // Guard against accessing HeptatonicScales before it's initialized
            if (!HeptatonicScales || !HeptatonicScales[family]) {
                console.warn('HeptatonicScales not yet initialized');
                return;
            }
            const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
            const rootNote = getPrimaryRootNote();
            const scaleNotes = getScaleNotes(rootNote, intervals);
            
            fretboard.markScale(scaleNotes, rootNote, {
                showIntervals: fretboardState.mainFretboardLabelMode === 'interval'
            });

            // Track that this fretboard is showing the current scale
            fretboardState.fretboardsShowingScale.add(fretboard.containerId);
            
            // Set the Scale button as the current selection
            fretboardState.currentDisplayedChord = 0;
            updateChordButtonStyles();
        } catch (error) {
            console.warn('Could not get current scale:', error);
            fretboard.markAllNotes(); // Fallback
        }
    });
    
    // Clear subscale boxes button
    const clearBoxesButton = document.createElement('button');
    clearBoxesButton.textContent = 'Clear Boxes';
    clearBoxesButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #dc3545, #c82333);
    `;
    clearBoxesButton.addEventListener('mouseenter', () => {
        clearBoxesButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #e74c3c, #d32f2f);
        `;
    });
    clearBoxesButton.addEventListener('mouseleave', () => {
        clearBoxesButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #dc3545, #c82333);
        `;
    });
    addInteractiveEvent(clearBoxesButton, 'click', () => {
        fretboard.clearSubscaleBoxes();
    });
    
    // Demo subscale box button
    const demoBoxButton = document.createElement('button');
    demoBoxButton.textContent = 'Demo Box';
    demoBoxButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #28a745, #1e7e34);
    `;
    demoBoxButton.addEventListener('mouseenter', () => {
        demoBoxButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #34ce57, #2d8e47);
        `;
    });
    demoBoxButton.addEventListener('mouseleave', () => {
        demoBoxButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #28a745, #1e7e34);
        `;
    });
    addInteractiveEvent(demoBoxButton, 'click', () => {
        // Create a demo subscale box (3-string span, 3-fret span)
        fretboard.drawSubscaleBox(
            'demo-box',
            1, // start string (B string)
            3, // end string (D string)
            3, // start fret
            5, // end fret
            {
                color: '#ff6b35',
                label: 'Demo Subscale',
                labelPosition: 'bottom'
            }
        );
    });
    
    // Mark specific note button (with input)
    const noteInputContainer = document.createElement('div');
    noteInputContainer.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #ccc;
    `;
    
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = 'Note (e.g., C, F#, C/4)';
    noteInput.value = 'C';
    noteInput.style.cssText = `
        width: 100px;
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 12px;
    `;
    
    const markNoteButton = document.createElement('button');
    markNoteButton.textContent = 'Mark Note';
    markNoteButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #6f42c1, #5a2d91);
        padding: 6px 12px;
        font-size: 12px;
    `;
    markNoteButton.addEventListener('mouseenter', () => {
        markNoteButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #7952d1, #6a3da1);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    markNoteButton.addEventListener('mouseleave', () => {
        markNoteButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #6f42c1, #5a2d91);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    addInteractiveEvent(markNoteButton, 'click', () => {
        const note = noteInput.value.trim();
        if (note) {
            fretboard.markNote(note, {
                backgroundColor: '#ffffff',
                borderColor: '#6f42c1',
                borderWidth: 3,
                textColor: '#333333',
                size: 26,
                showLabel: true
            });
        }
    });
    
    // Demo multiple notes button
    const demoNotesButton = document.createElement('button');
    demoNotesButton.textContent = 'Demo C-E-G';
    demoNotesButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #fd7e14, #e85d04);
    `;
    demoNotesButton.addEventListener('mouseenter', () => {
        demoNotesButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #ff8e24, #f86e14);
        `;
    });
    demoNotesButton.addEventListener('mouseleave', () => {
        demoNotesButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #fd7e14, #e85d04);
        `;
    });
    addInteractiveEvent(demoNotesButton, 'click', () => {
        fretboard.markMultipleNotes([
            {
                note: 'C',
                backgroundColor: '#ffffff',
                borderColor: '#ff4444',
                borderWidth: 4,
                textColor: '#333333',
                size: 28,
                isRoot: true
            },
            {
                note: 'E',
                backgroundColor: '#ffffff',
                borderColor: '#44ff44',
                borderWidth: 3,
                textColor: '#333333',
                size: 24
            },
            {
                note: 'G',
                backgroundColor: '#ffffff',
                borderColor: '#4444ff',
                borderWidth: 3,
                textColor: '#333333',
                size: 24
            }
        ]);
    });
    
    // Demo specific octave button
    const demoOctaveButton = document.createElement('button');
    demoOctaveButton.textContent = 'Demo C/3';
    demoOctaveButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #17a2b8, #138496);
    `;
    demoOctaveButton.addEventListener('mouseenter', () => {
        demoOctaveButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #27b2c8, #1494a6);
        `;
    });
    demoOctaveButton.addEventListener('mouseleave', () => {
        demoOctaveButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #17a2b8, #138496);
        `;
    });
    demoOctaveButton.addEventListener('click', () => {
        fretboard.markNote('C/3', {
            backgroundColor: '#ffffff',
            borderColor: '#17a2b8',
            borderWidth: 4,
            textColor: '#333333',
            size: 28,
            showLabel: true
        });
    });
    
    // Clear chord lines button
    const clearLinesButton = document.createElement('button');
    clearLinesButton.textContent = 'Clear Lines';
    clearLinesButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #e83e8c, #d91a72);
    `;
    clearLinesButton.addEventListener('mouseenter', () => {
        clearLinesButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #f84e9c, #e92a82);
        `;
    });
    clearLinesButton.addEventListener('mouseleave', () => {
        clearLinesButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #e83e8c, #d91a72);
        `;
    });
    clearLinesButton.addEventListener('click', () => {
        fretboard.clearChordLines();
    });
    
    // Demo chord shape button
    const demoChordButton = document.createElement('button');
    demoChordButton.textContent = 'Demo C Chord';
    demoChordButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #20c997, #1ea085);
    `;
    demoChordButton.addEventListener('mouseenter', () => {
        demoChordButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #30d9a7, #2eb095);
        `;
    });
    demoChordButton.addEventListener('mouseleave', () => {
        demoChordButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #20c997, #1ea085);
        `;
    });
    demoChordButton.addEventListener('click', () => {
        // Demo a C major chord shape with connecting lines
        fretboard.drawChordShape('c-major', [
            { string: 1, fret: 1, label: 'C', borderColor: '#ff4444', isRoot: true },
            { string: 2, fret: 0, label: 'E', borderColor: '#44ff44' },
            { string: 3, fret: 2, label: 'G', borderColor: '#4444ff' },
            { string: 4, fret: 2, label: 'C', borderColor: '#ff4444' },
            { string: 5, fret: 3, label: 'E', borderColor: '#44ff44' }
        ], {
            markerOptions: {
                backgroundColor: '#ffffff',
                borderWidth: 3,
                textColor: '#333333',
                size: 30
            },
            lineOptions: {
                color: '#20c997',
                lineWidth: 3,
                style: 'solid',
                opacity: 0.7,
                label: 'C Major'
            }
        });
    });
    
    // Demo line pattern button
    const demoLineButton = document.createElement('button');
    demoLineButton.textContent = 'Demo Line';
    demoLineButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #6610f2, #520dc2);
    `;
    demoLineButton.addEventListener('mouseenter', () => {
        demoLineButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #7620f2, #621dd2);
        `;
    });
    demoLineButton.addEventListener('mouseleave', () => {
        demoLineButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #6610f2, #520dc2);
        `;
    });
    demoLineButton.addEventListener('click', () => {
        // Demo a diagonal line pattern
        fretboard.drawChordLine('demo-line', [
            { string: 0, fret: 3 },
            { string: 2, fret: 5 },
            { string: 4, fret: 7 },
            { string: 5, fret: 10 }
        ], {
            color: '#6610f2',
            lineWidth: 4,
            style: 'dashed',
            label: 'Scale Pattern',
            labelPosition: 'middle',
            opacity: 0.8
        });
    });

    // Note search controls
    const noteSearchContainer = document.createElement('div');
    noteSearchContainer.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #ccc;
        flex-wrap: wrap;
    `;

    const searchLabel = document.createElement('span');
    searchLabel.textContent = 'Search:';
    searchLabel.style.cssText = `
        font-size: 12px;
        font-weight: bold;
        color: #333;
        margin-right: 4px;
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Note search (e.g., C, F#, C/4)';
    searchInput.value = 'C';
    searchInput.style.cssText = `
        width: 120px;
        padding: 6px 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 12px;
    `;

    const searchButton = document.createElement('button');
    searchButton.textContent = 'Search & Mark';
    searchButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #17a2b8, #138496);
        padding: 6px 12px;
        font-size: 12px;
    `;
    searchButton.addEventListener('mouseenter', () => {
        searchButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #27b2c8, #1494a6);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    searchButton.addEventListener('mouseleave', () => {
        searchButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #17a2b8, #138496);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });

    const logResultsButton = document.createElement('button');
    logResultsButton.textContent = 'Search & Log';
    logResultsButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #ffc107, #e0a800);
        padding: 6px 12px;
        font-size: 12px;
        color: #333;
    `;
    logResultsButton.addEventListener('mouseenter', () => {
        logResultsButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #ffd117, #f0b800);
            padding: 6px 12px;
            font-size: 12px;
            color: #333;
        `;
    });
    logResultsButton.addEventListener('mouseleave', () => {
        logResultsButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #ffc107, #e0a800);
            padding: 6px 12px;
            font-size: 12px;
            color: #333;
        `;
    });

    // Search functionality
    searchButton.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            const results = fretboard.searchNote(searchTerm);
            console.log(`Search results for "${searchTerm}":`, results);
            
            if (results.length > 0) {
                // Mark all found positions
                fretboard.clearMarkers();
                results.forEach((result, index) => {
                    fretboard.markFret(result.string, result.fret, {
                        backgroundColor: '#ffffff',
                        borderColor: '#17a2b8',
                        borderWidth: 3,
                        textColor: '#333333',
                        size: 24,
                        label: result.noteName + (result.octave !== null ? `/${result.octave}` : ''),
                        useCustomStyle: true
                    });
                });
                
                // Show summary in console
                console.log(`Found ${results.length} instances of "${searchTerm}":`);
                results.forEach((result, index) => {
                    console.log(`  ${index + 1}. ${result.position} -> ${result.note}`);
                });
            } else {
                console.log(`No instances of "${searchTerm}" found on the fretboard.`);
            }
        }
    });

    logResultsButton.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            const results = fretboard.searchNote(searchTerm);
            
            // Create a detailed console log
            console.group(`🎸 Note Search Results for "${searchTerm}"`);
            console.log(`Total instances found: ${results.length}`);
            
            if (results.length > 0) {
                console.table(results.map(r => ({
                    'String': r.string + 1,
                    'Fret': r.fret,
                    'Full Note': r.note,
                    'Note Name': r.noteName,
                    'Octave': r.octave,
                    'String Tuning': r.stringName,
                    'Position': r.position
                })));
                
                // Group by octave if multiple octaves found
                const byOctave = {};
                results.forEach(r => {
                    if (!byOctave[r.octave]) byOctave[r.octave] = [];
                    byOctave[r.octave].push(r);
                });
                
                if (Object.keys(byOctave).length > 1) {
                    console.log('\n📊 Grouped by octave:');
                    Object.keys(byOctave).sort().forEach(octave => {
                        console.log(`  Octave ${octave}: ${byOctave[octave].length} instances`);
                        byOctave[octave].forEach(r => {
                            console.log(`    • String ${r.string + 1}, Fret ${r.fret}`);
                        });
                    });
                }
                
                // Show fret distribution
                const byFret = {};
                results.forEach(r => {
                    if (!byFret[r.fret]) byFret[r.fret] = 0;
                    byFret[r.fret]++;
                });
                console.log('\n🎯 Fret distribution:');
                Object.keys(byFret).sort((a, b) => parseInt(a) - parseInt(b)).forEach(fret => {
                    console.log(`  Fret ${fret}: ${byFret[fret]} instances`);
                });
            } else {
                console.log('❌ No instances found');
            }
            console.groupEnd();
        }
    });

    // Allow Enter key to trigger search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchButton.click();
        }
    });

    noteSearchContainer.appendChild(searchLabel);
    noteSearchContainer.appendChild(searchInput);
    noteSearchContainer.appendChild(searchButton);
    noteSearchContainer.appendChild(logResultsButton);
    
    // Chord visualization controls
    const chordControlsContainer = document.createElement('div');
    chordControlsContainer.style.cssText = `
        display: flex;
        gap: 0px;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
        padding: 0px;
        border-radius: 6px;
        border: 1px solid #ccc;
        flex-wrap: wrap;
        height: 48px;
    `;
    
    // Chord type dropdown
    const chordTypeLabel = document.createElement('span');
    chordTypeLabel.textContent = 'Chords:';
    chordTypeLabel.style.cssText = `
        font-size: 20px;
        font-weight: bold;
        color: #fff;
        margin-right: 4px;
        padding: 0 20px;
    `;
    
    const chordTypeSelect = document.createElement('select');
    chordTypeSelect.innerHTML = `
        <option value="triads">Triads</option>
        <option value="sevenths">Sevenths</option>
    `;
    chordTypeSelect.style.cssText = `
        padding: 4px 6px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 12px;
        margin-right: 8px;
    `;
    chordTypeSelect.addEventListener('change', () => {
        fretboardState.currentChordType = chordTypeSelect.value;
        // Update displayed chord if one is currently shown
        if (fretboardState.currentDisplayedChord !== null && fretboardState.currentDisplayedChord > 0) {
            // Only update if a chord is selected (not scale)
            showChordOnFretboard(fretboardState.currentDisplayedChord - 1);
        }
    });

    const intervalsToggleContainer = document.createElement('div');
    intervalsToggleContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-right: 10px;
    `;

    const intervalsToggleLabel = document.createElement('label');
    intervalsToggleLabel.htmlFor = 'main-fretboard-label-mode';
    intervalsToggleLabel.textContent = 'Labels';
    intervalsToggleLabel.style.cssText = `
        font-size: 12px;
        color: #fff;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
    `;

    const intervalsToggleSelect = document.createElement('select');
    intervalsToggleSelect.id = 'main-fretboard-label-mode';
    intervalsToggleSelect.innerHTML = `
        <option value="note">Note Name</option>
        <option value="interval">Interval</option>
        <option value="finger">Finger Number</option>
    `;
    intervalsToggleSelect.value = fretboardState.mainFretboardLabelMode;
    intervalsToggleSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
    `;

    intervalsToggleSelect.addEventListener('change', (e) => {
        fretboardState.mainFretboardLabelMode = e.target.value;

        if (fretboardState.currentChordGridSelection) {
            showChordPatternOnFretboard(fretboardState.currentChordGridSelection.note, fretboardState.currentChordGridSelection.chordType, false);
        } else if (fretboardState.currentDisplayedChord === 0) {
            showScaleOnFretboard();
        } else if (fretboardState.currentDisplayedChord !== null && fretboardState.currentDisplayedChord > 0) {
            showChordOnFretboard(fretboardState.currentDisplayedChord - 1);
        }
    });

    intervalsToggleContainer.appendChild(intervalsToggleLabel);
    intervalsToggleContainer.appendChild(intervalsToggleSelect);
    
    // Roman numeral chord buttons + Scale button
    const romanNumerals = ['Scale', 'I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    const chordButtons = [];
    
    romanNumerals.forEach((numeral, index) => {
        const chordButton = document.createElement('span');
        chordButton.textContent = numeral;
        chordButton.dataset.chordIndex = index;
        chordButton.style.cssText = `
            padding: 6px 10px;
            background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
            color: #333;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            cursor: pointer;
            font-size: 24px;
            font-weight: bold;
            transition: all 0.001s ease;
            user-select: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            text-align: center;
            height: 46px;
        `;
        
        // Hover effects
        chordButton.addEventListener('mouseenter', () => {
            if (fretboardState.currentDisplayedChord !== index) {
                chordButton.style.background = 'linear-gradient(to bottom, #e2e6ea, #dae0e5)';
                chordButton.style.transform = 'translateY(-1px)';
                // Set hover state flag
                fretboardState.isInHoverState = true;
                // Show chord or scale temporarily on hover
                if (index === 0) {
                    // Scale button
                    showScaleOnFretboard(true);
                } else {
                    // Chord button (adjust index for chord array)
                    showChordOnFretboard(index - 1, true);
                }
            }
        });
        
        chordButton.addEventListener('mouseleave', () => {
            if (fretboardState.currentDisplayedChord !== index) {
                chordButton.style.background = 'linear-gradient(to bottom, #f8f9fa, #e9ecef)';
                chordButton.style.transform = 'translateY(0)';
                // Clear hover state flag
                fretboardState.isInHoverState = false;
                // Use centralized restoration function that handles both Roman numerals and chord grid
                restoreFretboardState();
            }
        });
        
        // Click to toggle chord/scale display
        chordButton.addEventListener('click', () => {
            // Clear hover state flag since we're making a permanent selection
            fretboardState.isInHoverState = false;
            
            // Clear any chord grid selection since we're now using Roman numerals
            fretboardState.currentChordGridSelection = null;
            
            if (fretboardState.currentDisplayedChord === index) {
                // If this option is already displayed, clear it
                fretboardState.currentDisplayedChord = null;
                fretboard.clearMarkers();
                fretboard.clearChordLines();
                fretboardState.fretboardsShowingChords.delete(fretboard.containerId);
                fretboardState.fretboardsShowingScale.delete(fretboard.containerId);
                // Clear chord info display
                updateChordInfoDisplay();
                updateChordButtonStyles();
            } else {
                // Display this option
                fretboardState.currentDisplayedChord = index;
                if (index === 0) {
                    // Scale button
                    showScaleOnFretboard();
                } else {
                    // Chord button (adjust index for chord array)
                    showChordOnFretboard(index - 1);
                }
                updateChordButtonStyles();
            }
        });
        
        chordButtons.push(chordButton);
        chordControlsContainer.appendChild(chordButton);
    });
    
    chordControlsContainer.appendChild(chordTypeLabel);
    chordControlsContainer.appendChild(chordTypeSelect);
    chordControlsContainer.appendChild(intervalsToggleContainer);
    
    // Create chord info display
    const chordInfoContainer = document.createElement('div');
    chordInfoContainer.id = 'chord-info-display';
    chordInfoContainer.style.cssText = `
        margin: 10px 0;
        padding: 12px 16px;
        background: linear-gradient(to bottom, #e8f4fd, #d1ecf1);
        border-radius: 8px;
        border: 1px solid #bee5eb;
        display: none;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    const chordNameDisplay = document.createElement('div');
    chordNameDisplay.id = 'chord-name-display';
    chordNameDisplay.style.cssText = `
        font-size: 18px;
        font-weight: bold;
        color: #0c5460;
        margin-bottom: 6px;
    `;
    
    const chordNotesDisplay = document.createElement('div');
    chordNotesDisplay.id = 'chord-notes-display';
    chordNotesDisplay.style.cssText = `
        font-size: 14px;
        color: #0c5460;
        font-weight: 500;
    `;
    
    chordInfoContainer.appendChild(chordNameDisplay);
    chordInfoContainer.appendChild(chordNotesDisplay);

    // Create the chord fingering position picker (tabs for alternate playable shapes)
    const fingeringTabsContainer = document.createElement('div');
    fingeringTabsContainer.id = 'chord-fingering-tabs';
    fingeringTabsContainer.style.cssText = `
        margin: 10px 0 0 0;
        padding: 8px 12px;
        background: rgba(0,0,0,0.15);
        border-radius: 8px;
        border: 1px solid #4a4a4a;
        display: none;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
    `;

    noteInputContainer.appendChild(noteInput);
    noteInputContainer.appendChild(markNoteButton);

    controlsContainer.appendChild(clearButton);
    controlsContainer.appendChild(showAllButton);
    // controlsContainer.appendChild(showScaleButton);
    controlsContainer.appendChild(chordControlsContainer);
    controlsContainer.appendChild(chordInfoContainer);
    controlsContainer.appendChild(fingeringTabsContainer);
    
    // Create chord pattern demo controls
    const patternDemoContainer = document.createElement('div');
    patternDemoContainer.style.cssText = `
        display: flex;
        gap: 8px;
        align-items: center;
        background: rgba(255, 255, 255, 0.1);
        padding: 8px;
        border-radius: 6px;
        border: 1px solid #ccc;
        flex-wrap: wrap;
    `;
    
    const patternLabel = document.createElement('span');
    patternLabel.textContent = 'Chord Patterns:';
    patternLabel.style.cssText = `
        font-size: 14px;
        font-weight: bold;
        color: #333;
        margin-right: 8px;
    `;
    
    // C Major Pattern Demo
    const cMajorPatternButton = document.createElement('button');
    cMajorPatternButton.textContent = 'C Major Patterns';
    cMajorPatternButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #28a745, #1e7e34);
        padding: 6px 12px;
        font-size: 12px;
    `;
    cMajorPatternButton.addEventListener('mouseenter', () => {
        cMajorPatternButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #34ce57, #2d8e47);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    cMajorPatternButton.addEventListener('mouseleave', () => {
        cMajorPatternButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #28a745, #1e7e34);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    cMajorPatternButton.addEventListener('click', () => {
        const chordNotes = ['C', 'E', 'G'];
        const rootNote = 'C';
        const matches = fretboard.displayChordWithPatterns(chordNotes, rootNote, {
            clearFirst: true,
            showAllMatches: false,
            preferredPatterns: ['major_A_string', 'major_E_string', 'major_open_C'],
            drawLines: true,
            highlightRoot: true
        });
        console.log('C Major pattern matches:', matches);
    });
    
    // A Minor Pattern Demo
    const aMinorPatternButton = document.createElement('button');
    aMinorPatternButton.textContent = 'A Minor Patterns';
    aMinorPatternButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #6f42c1, #5a2d91);
        padding: 6px 12px;
        font-size: 12px;
    `;
    aMinorPatternButton.addEventListener('mouseenter', () => {
        aMinorPatternButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #7952d1, #6a3da1);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    aMinorPatternButton.addEventListener('mouseleave', () => {
        aMinorPatternButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #6f42c1, #5a2d91);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    aMinorPatternButton.addEventListener('click', () => {
        const chordNotes = ['A', 'C', 'E'];
        const rootNote = 'A';
        const matches = fretboard.displayChordWithPatterns(chordNotes, rootNote, {
            clearFirst: true,
            showAllMatches: false,
            preferredPatterns: ['minor_A_string', 'minor_E_string'],
            drawLines: true,
            highlightRoot: true
        });
        console.log('A Minor pattern matches:', matches);
    });
    
    // G7 Pattern Demo
    const g7PatternButton = document.createElement('button');
    g7PatternButton.textContent = 'G7 Patterns';
    g7PatternButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #fd7e14, #e85d04);
        padding: 6px 12px;
        font-size: 12px;
    `;
    g7PatternButton.addEventListener('mouseenter', () => {
        g7PatternButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #ff8e24, #f86e14);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    g7PatternButton.addEventListener('mouseleave', () => {
        g7PatternButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #fd7e14, #e85d04);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    g7PatternButton.addEventListener('click', () => {
        const chordNotes = ['G', 'B', 'D', 'F'];
        const rootNote = 'G';
        const matches = fretboard.displayChordWithPatterns(chordNotes, rootNote, {
            clearFirst: true,
            showAllMatches: false,
            preferredPatterns: ['dominant7_A_string', 'dominant7_E_string'],
            drawLines: true,
            highlightRoot: true
        });
        console.log('G7 pattern matches:', matches);
    });
    
    // Show All Patterns Demo
    const allPatternsButton = document.createElement('button');
    allPatternsButton.textContent = 'Show All C Major';
    allPatternsButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #dc3545, #c82333);
        padding: 6px 12px;
        font-size: 12px;
    `;
    allPatternsButton.addEventListener('mouseenter', () => {
        allPatternsButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #e74c3c, #d32f2f);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    allPatternsButton.addEventListener('mouseleave', () => {
        allPatternsButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #dc3545, #c82333);
            padding: 6px 12px;
            font-size: 12px;
        `;
    });
    allPatternsButton.addEventListener('click', () => {
        const chordNotes = ['C', 'E', 'G'];
        const rootNote = 'C';
        const matches = fretboard.showAllChordPatterns(chordNotes, rootNote, 'major', {
            clearFirst: true,
            drawLines: true,
            highlightRoot: true,
            lineOptions: {
                opacity: 0.4  // Make lines more transparent when showing multiple patterns
            }
        });
        console.log('All C Major pattern matches:', matches);
    });
    
    patternDemoContainer.appendChild(patternLabel);
    patternDemoContainer.appendChild(cMajorPatternButton);
    patternDemoContainer.appendChild(aMinorPatternButton);
    patternDemoContainer.appendChild(g7PatternButton);
    patternDemoContainer.appendChild(allPatternsButton);
    
    // controlsContainer.appendChild(patternDemoContainer);
    // controlsContainer.appendChild(noteSearchContainer);
    // controlsContainer.appendChild(clearBoxesButton);
    // controlsContainer.appendChild(clearLinesButton);
    // controlsContainer.appendChild(demoBoxButton);
    // controlsContainer.appendChild(noteInputContainer);
    // controlsContainer.appendChild(demoNotesButton);
    // controlsContainer.appendChild(demoOctaveButton);
    // controlsContainer.appendChild(demoChordButton);
    // controlsContainer.appendChild(demoLineButton);
    
    // Pin the title + root/scale/mode picker above the fretboard
    fretboard.container.insertBefore(createTopBar(), fretboard.fretboardElement);

    // Add chord progression builder
    const progressionContainer = createChordProgressionUI(fretboard);
    if (progressionContainer) {
        // Load shared state from URL if present
        loadSharedStateFromURL();
    }

    // Detailed root-note / scale-family x mode browser tables (populated by
    // createHeptatonicScaleTable) - kept as a full overview alongside the
    // compact top-bar quick-picker, not replaced by it.
    const scaleControlsContainer = document.createElement('div');
    scaleControlsContainer.id = 'scaleControlsContainer';
    scaleControlsContainer.style.cssText = `
        background: hsla(0, 0%, 24%, 1.00);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    // Add chord button grid after the fretboard
    const chordGrid = createChordButtonGrid();
    const scalePositionGrid = createScalePositionGrid();
    if (chordGrid) {
        // Permanent "current scale" info panel (name, intervals, alternative
        // names, mini piano, identified chords - the same info the scale
        // table's hover tooltip shows) sits beside the chord pattern grid.
        const scaleInfoPanel = document.createElement('div');
        scaleInfoPanel.id = 'scaleInfoPanel';
        scaleInfoPanel.style.cssText = `
            flex: 0 0 auto;
        `;

        const scaleInformationTabContent = document.createElement('div');
        scaleInformationTabContent.style.cssText = `
            display: flex;
            gap: 20px;
            align-items: flex-start;
            flex-wrap: wrap;
        `;
        scaleInformationTabContent.appendChild(scaleInfoPanel);
        scaleInformationTabContent.appendChild(chordGrid);

        // Synthesizer tab content - the actual synth UI is a React component
        // (App.js) that portals itself into this container once it's in the
        // DOM, rather than popping out as a modal.
        const synthesizerTabContent = document.createElement('div');
        synthesizerTabContent.id = 'synthesizerTabContent';
        synthesizerTabContent.style.cssText = `
            min-height: 400px;
        `;

        const tabs = [];
        tabs.push({
            label: 'Scale Information',
            content: scaleInformationTabContent,
            help: "The current scale's notes, interval pattern, alternative names, and every diatonic triad/seventh chord built from it. Click a mini piano to hear it - the scale piano plays up the scale one note at a time, chord pianos play their notes together."
        });
        if (progressionContainer) {
            tabs.push({
                label: 'Chord Progression',
                content: progressionContainer,
                help: "Build a chord progression from the current scale's diatonic chords. Click a chord to preview it, or play the whole progression back with the built-in sequencer."
            });
        }
        tabs.push({
            label: 'Scale Position Grid',
            content: scalePositionGrid,
            help: 'Movable fretboard patterns for the current scale, one per string position, with adjustable pattern/dot size, fret labels, note-label modes, and chord-grip overlays.'
        });
        tabs.push({
            label: 'Scale Selection',
            content: scaleControlsContainer,
            help: 'Pick root note(s) and a scale/mode from the full table of scale families, and toggle between selecting one at a time (exclusive) or comparing multiple selections side by side.'
        });
        tabs.push({
            label: 'Other Controls',
            content: controlsContainer,
            help: 'Highlight or clear all fretboard notes, and click a roman-numeral (I-VII) button to display that scale-degree chord along with its playable fingering shapes.'
        });
        tabs.push({
            label: 'Synthesizer',
            content: synthesizerTabContent,
            alignRight: true,
            help: 'The built-in synthesizer. Play it with your mouse, a MIDI keyboard, or your computer keyboard (see the hotkeys in the page footer), and shape the sound with oscillators, filters, and effects.'
        });

        const ACTIVE_TAB_STORAGE_KEY = 'PolySynth-ActiveTab';
        let lastActiveTabLabel = null;
        try {
            lastActiveTabLabel = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        } catch (error) {
            console.warn('Could not load saved active tab', error);
        }
        const lastActiveTabIndex = tabs.findIndex(tab => tab.label === lastActiveTabLabel);
        const defaultTabIndex = lastActiveTabIndex >= 0
            ? lastActiveTabIndex
            : tabs.findIndex(tab => tab.label === 'Scale Position Grid');
        fretboard.container.appendChild(createTabbedPanel(tabs, defaultTabIndex >= 0 ? defaultTabIndex : 0, ACTIVE_TAB_STORAGE_KEY));
        attachHotkeyFooter(fretboard.container);

        // Initialize chord grid colors based on current scale (if any)
        // Use setTimeout to ensure the DOM elements are fully added before updating colors
        setTimeout(() => {
            updateChordGridColors();
            renderScalePositionGrid();
        }, 100);
    }
}

/**
 * Analyze how well a chord fits within the current scale
 * @param {string} rootNote - The root note of the chord
 * @param {string} chordType - The type of chord
 * @returns {Object} Object with matchCount, totalNotes, matchPercentage, and color
 */
function analyzeChordScaleCompatibility(rootNote, chordType) {
    try {
        // Get current scale information
        const primaryScale = getPrimaryScale();
        const scaleRootNote = getPrimaryRootNote();
        
        if (!primaryScale || !scaleRootNote) {
            return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' }; // Grey for no scale
        }
        
        // Get scale notes - check if HeptatonicScales is available
        const [family, mode] = primaryScale.split('-');
        if (!HeptatonicScales || !HeptatonicScales[family] || !HeptatonicScales[family][parseInt(mode, 10) - 1]) {
            // HeptatonicScales not available yet, return neutral grey
            return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' };
        }
        
        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
        const scaleNotes = getScaleNotes(scaleRootNote, intervals);
        
        // Translate scale notes to proper notation and remove octave information
        const translatedScaleNotes = notationTranslateNotes(scaleNotes);
        const scaleNoteNames = translatedScaleNotes.map(note => notationStripOctave(note));
        
        // Process the chord to get its notes
        const chordName = rootNote + chordType;
        const chordInfo = processChord(chordName);
        
        if (!chordInfo || !chordInfo.notes || !Array.isArray(chordInfo.notes)) {
            return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' };
        }
        
        // Translate chord notes to proper notation and remove octave information
        const translatedChordNotes = notationTranslateNotes(chordInfo.notes);
        const chordNotes = translatedChordNotes.map(note => notationStripOctave(note));
        
        // Check how many chord notes are in the scale using enharmonic matching
        const notesInScale = chordNotes.filter(note => noteArrayContains(scaleNoteNames, note));
        const matchCount = notesInScale.length;
        const totalNotes = chordNotes.length;
        const matchPercentage = Math.round((matchCount / totalNotes) * 100);
        
        // Determine color based on match
        let color;
        if (matchCount === 0) {
            color = '#9E9E9E'; // Grey for no notes in scale
        } else if (matchCount === totalNotes) {
            color = '#4A90E2'; // Blue for all notes in scale
        } else if (matchCount === totalNotes - 1) {
            color = '#9B59B6'; // Purple for all but one note in scale
        } else {
            color = '#F39C12'; // Orange for partial match
        }
        
        return { matchCount, totalNotes, matchPercentage, color };
        
    } catch (error) {
        // Silently return grey color for compatibility errors during initialization
        return { matchCount: 0, totalNotes: 0, matchPercentage: 0, color: '#9E9E9E' };
    }
}

/**
 * Create chord button grid directly (avoiding circular dependency)
 */
function createChordButtonGrid() {
    const chromaticNotes = CHROMATIC;
    const commonChordTypes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', 'm7b5'];
    
    let gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        margin: 20px auto;
        max-width: 600px;
        background: hsla(0, 0%, 24%, 1.00);
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;
    gridContainer.id = 'chordButtonGridContainer';
    
    let gridLabel = document.createElement('h3');
    gridLabel.textContent = 'Chord Pattern Grid';
    gridLabel.style.cssText = `
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        color: #fff;
    `;
    
    let grid = document.createElement('table');
    grid.style.cssText = `
        border-collapse: collapse;
        margin: 0 auto;
        border: 2px solid #333;
        background: white;
    `;
    
    // Create header row with chord types
    let headerRow = document.createElement('tr');
    
    // Empty corner cell
    let cornerCell = document.createElement('th');
    cornerCell.style.cssText = `
        width: 30px;
        height: 30px;
        border: 1px solid #333;
        background: #2a2a2a;
        color: white;
        font-weight: bold;
        font-size: 10px;
        text-align: center;
        vertical-align: middle;
        padding: 0;
    `;
    headerRow.appendChild(cornerCell);
    
    // Add chord type header cells
    for (let chordType of commonChordTypes) {
        let cell = document.createElement('th');
        cell.style.cssText = `
            width: 30px;
            height: 30px;
            border: 1px solid #333;
            background: #2a2a2a;
            color: white;
            font-weight: bold;
            font-size: 8px;
            text-align: center;
            vertical-align: middle;
            padding: 0;
            writing-mode: vertical-rl;
            text-orientation: mixed;
        `;
        cell.textContent = chordType;
        headerRow.appendChild(cell);
    }
    
    grid.appendChild(headerRow);
    
    // Create rows for each chromatic note
    for (let note of chromaticNotes) {
        let row = document.createElement('tr');
        
        // Create note label cell
        let noteCell = document.createElement('td');
        noteCell.textContent = note;
        noteCell.style.cssText = `
            width: 30px;
            height: 30px;
            border: 1px solid #333;
            font-weight: bold;
            background: #383838;
            color: white;
            text-align: center;
            vertical-align: middle;
            font-size: 10px;
            padding: 0;
        `;
        row.appendChild(noteCell);
        
        // Create chord button cells - make the cells themselves clickable
        for (let chordType of commonChordTypes) {
            let cell = document.createElement('td');
            
            // Analyze chord-scale compatibility for color coding
            const compatibility = analyzeChordScaleCompatibility(note, chordType);
            
            cell.style.cssText = `
                width: 30px;
                height: 30px;
                border: 1px solid #333;
                text-align: center;
                vertical-align: middle;
                background: ${compatibility.color};
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                padding: 0;
                position: relative;
            `;
            
            // Add tooltip showing compatibility info
            if (compatibility.totalNotes > 0) {
                cell.title = `${note}${chordType}: ${compatibility.matchCount}/${compatibility.totalNotes} notes in scale (${compatibility.matchPercentage}%)`;
            } else {
                cell.title = `${note}${chordType}: No scale selected or chord analysis failed`;
            }
            
            // Store original color for hover effects
            cell.dataset.originalColor = compatibility.color;
            
            // Add hover and click functionality directly to the cell
            addInteractiveEvent(cell, 'enter', () => {
                // Lighten the background color for hover effect
                const originalColor = cell.dataset.originalColor;
                let hoverColor = originalColor;
                
                // Create a lighter version of the original color for hover
                if (originalColor === '#4A90E2') hoverColor = '#6BA6F0'; // Lighter blue
                else if (originalColor === '#9B59B6') hoverColor = '#B57BC6'; // Lighter purple
                else if (originalColor === '#F39C12') hoverColor = '#F5B041'; // Lighter orange
                else if (originalColor === '#9E9E9E') hoverColor = '#BDBDBD'; // Lighter grey
                
                cell.style.background = hoverColor;
                cell.style.transform = 'scale(1.1)';
                cell.style.zIndex = '10';
                
                // Show chord pattern on fretboard temporarily
                showChordPatternOnFretboard(note, chordType, true);
            });
            
            addInteractiveEvent(cell, 'leave', () => {
                cell.style.background = cell.dataset.originalColor;
                cell.style.transform = 'scale(1)';
                cell.style.zIndex = '1';
                
                // Restore previous fretboard state
                restoreFretboardState();
            });
            
            addInteractiveEvent(cell, 'click', () => {
                // Play the chord through the synth using the same fretboard
                // voicing shown on hover, rather than just toggling the
                // persistent display.
                const fretboard = getFretboard('fretNotPlaceholder');
                if (fretboard) {
                    playChordVoicing(getChordVoicingNotes(fretboard, note, chordType));
                }
            });
            
            row.appendChild(cell);
        }
        
        grid.appendChild(row);
    }
    
    gridContainer.appendChild(gridLabel);
    gridContainer.appendChild(grid);
    
    // Add color coding legend
    const legend = document.createElement('div');
    legend.style.cssText = `
        margin-top: 10px;
        padding: 8px;
        font-size: 11px;
        color: #fff;
        text-align: center;
        line-height: 1.4;
    `;
    legend.innerHTML = `
        <strong>Scale Compatibility Legend:</strong>
        <span style="background:#4A90E2; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">All notes</span>
        <span style="background:#9B59B6; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">All but one</span>
        <span style="background:#F39C12; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">Partial</span>
        <span style="background:#9E9E9E; color:white; padding:2px 6px; margin:0 2px; border-radius:3px;">No match</span>
    `;
    gridContainer.appendChild(legend);
    
    return gridContainer;
}

/**
 * Get the active scale notes with octave removed and duplicates removed.
 * @returns {Array<string>} Normalized scale notes
 */
function getCurrentScaleNoteNames() {
    const primaryScale = getPrimaryScale();
    const scaleRootNote = getPrimaryRootNote();

    if (!primaryScale || !scaleRootNote) {
        return [];
    }

    const [family, mode] = primaryScale.split('-');
    const modeIndex = parseInt(mode, 10) - 1;

    if (!HeptatonicScales || !HeptatonicScales[family] || !HeptatonicScales[family][modeIndex]) {
        return [];
    }

    const intervals = HeptatonicScales[family][modeIndex].intervals;
    const scaleNotes = getScaleNotes(scaleRootNote, intervals);
    const translatedScaleNotes = notationTranslateNotes(scaleNotes);
    const noteNames = translatedScaleNotes.map(note => notationStripOctave(note));

    return [...new Set(noteNames)];
}

/**
 * Build ordered semitone/note data for the active scale from its root.
 * @param {Array<string>} scaleNotes
 * @param {string} rootNote
 * @returns {Array<{ note: string, semitone: number, intervalLabel: string }>}
 */
function getScaleIntervalEntries(scaleNotes, rootNote) {
    const entries = [];
    const seen = new Set();

    for (const note of scaleNotes) {
        const semitone = getSemitoneFromReference(rootNote, note);
        if (seen.has(semitone)) {
            continue;
        }
        seen.add(semitone);
        entries.push({
            note,
            semitone,
            intervalLabel: SEMITONE_TO_SCALE_INTERVAL_LABEL[semitone]
        });
    }

    return entries;
}

/**
 * Derive a compact chord suffix from chord notes if it matches common qualities.
 * @param {string} chordRoot
 * @param {Array<string>} chordNotes
 * @returns {string} Suffix such as '', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', or '?'
 */
function deriveChordSuffix(chordRoot, chordNotes) {
    if (!chordRoot || !Array.isArray(chordNotes) || chordNotes.length === 0) {
        return '?';
    }

    const uniqueSemitones = [...new Set(chordNotes.map(note => getSemitoneFromReference(chordRoot, note)))].sort((a, b) => a - b);
    const pattern = uniqueSemitones.join(',');

    const qualityMap = {
        '0,4,7': '',
        '0,3,7': 'm',
        '0,3,6': 'dim',
        '0,4,8': 'aug',
        '0,4,7,10': '7',
        '0,4,7,11': 'maj7',
        '0,3,7,10': 'm7',
        '0,3,6,10': 'm7b5',
        '0,3,6,9': 'dim7'
    };

    return qualityMap[pattern] !== undefined ? qualityMap[pattern] : '?';
}

/**
 * Build degree header label with optional chord name.
 * @param {string} roman
 * @param {string} chordRoot
 * @param {Array<string>} chordNotes
 * @returns {string}
 */
function buildDegreeHeaderLabel(roman, chordRoot, chordNotes) {
    if (!fretboardState.scalePositionShowChordNames) {
        return roman;
    }

    const suffix = deriveChordSuffix(chordRoot, chordNotes);
    const fullChord = `${chordRoot}${suffix}`;
    // Keep the derived quality available from the selected root chord name.
    const derivedQuality = fullChord.replace(chordRoot, '');
    const displayChord = derivedQuality ? `${chordRoot}${derivedQuality}` : chordRoot;
    return `${roman}\n${displayChord}`;
}

/**
 * Build a readable scale descriptor from primary scale key.
 * @param {string|null} primaryScaleKey
 * @returns {string}
 */
function getScaleDescriptor(primaryScaleKey) {
    if (!primaryScaleKey || typeof primaryScaleKey !== 'string') {
        return 'Unknown Scale';
    }

    const [familyRaw, modeRaw] = primaryScaleKey.split('-');
    const family = familyRaw || 'Unknown';
    const modeNumber = parseInt(modeRaw, 10);

    if (!Number.isFinite(modeNumber) || modeNumber < 1 || modeNumber > MODE_DISPLAY_NAMES.length) {
        return family;
    }

    return `${family} ${MODE_DISPLAY_NAMES[modeNumber - 1]}`;
}

/**
 * Get chromatic interval distance from a reference root.
 * @param {string} referenceRootNote - Root note name without octave
 * @param {string} targetNote - Target note name without octave
 * @returns {number} Semitone interval in [0, 11]
 */
function getSemitoneFromReference(referenceRootNote, targetNote) {
    const referenceMidi = notationNoteToMidi(`${normalizeNote(referenceRootNote)}/4`);
    const targetMidi = notationNoteToMidi(`${normalizeNote(targetNote)}/4`);
    return ((targetMidi - referenceMidi) % 12 + 12) % 12;
}

// createNoteShapeMarker now lives in src/fretboard/markers.js (imported
// above) - REFACTOR_PLAN.md Phase 3.

/**
 * Find the first matching fret at or above a minimum fret for a row root note.
 * @param {number} rowStringIndex - String index (into fretboardState.MINI_SCALE_STRING_TUNING) used as the row anchor
 * @param {string} rowScaleRootNote - Scale root note used to anchor the row
 * @param {number} minFret - Minimum target fret
 * @returns {number|null} Absolute fret number or null if not found in range
 */
function findRowRootAbsoluteFret(rowStringIndex, rowScaleRootNote, minFret = SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET) {
    const anchorIndex = rowStringIndex;
    const anchorOpenMidi = notationNoteToMidi(fretboardState.MINI_SCALE_STRING_TUNING[anchorIndex]);
    const rootPitchClass = ((notationNoteToMidi(`${normalizeNote(rowScaleRootNote)}/4`) % 12) + 12) % 12;

    for (let fret = Math.max(0, minFret); fret <= FRET_COUNT; fret++) {
        const pitchClass = ((anchorOpenMidi + fret) % 12 + 12) % 12;
        if (pitchClass === rootPitchClass) {
            return fret;
        }
    }

    for (let fret = 0; fret <= FRET_COUNT; fret++) {
        const pitchClass = ((anchorOpenMidi + fret) % 12 + 12) % 12;
        if (pitchClass === rootPitchClass) {
            return fret;
        }
    }

    return null;
}

/**
 * Convert display column index to absolute fret for the row-generic board.
 * @param {number} rowRootAbsoluteFret - Absolute fret where row root is anchored
 * @param {number} displayColumn - Display column index from 0..MINI_SCALE_FRET_COUNT
 * @returns {number}
 */
function getAbsoluteFretForDisplayColumn(rowRootAbsoluteFret, displayColumn) {
    return rowRootAbsoluteFret + (displayColumn - GENERIC_ROOT_DISPLAY_COLUMN);
}

/**
 * Create one mini fretboard used inside each scale position grid cell.
 * @param {Array<string>} scaleNoteNames - Full active scale notes
 * @param {Array<string>} displayedNotes - Notes shown in this specific cell
 * @param {string} referenceRootNote - Reference root used for interval coloring
 * @param {number} rowStringIndex - Target row's string index (into fretboardState.MINI_SCALE_STRING_TUNING)
 * @param {string} rowScaleRootNote - Scale root used to anchor row-generic fret layout
 * @param {boolean} showOnlyDisplayedNotes - If true, only notes from displayedNotes are rendered
 * @param {boolean} showRelativeFretLabels - If true, show R/-1/+1 labels under fret columns
 * @returns {HTMLElement} Mini fretboard element
 */
function shadeColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = Math.min(255, Math.max(0, R + (R * percent / 100)));
    G = Math.min(255, Math.max(0, G + (G * percent / 100)));
    B = Math.min(255, Math.max(0, B + (B * percent / 100)));
    R = Math.round(R);
    G = Math.round(G);
    B = Math.round(B);

    // console.log(`Shading color ${color} by ${percent}% results in R:${R}, G:${G}, B:${B}`);

    const newColor = `#${R.toString(16).padStart(2, '0')}${G.toString(16).padStart(2, '0')}${B.toString(16).padStart(2, '0')}`;
    return newColor;
}

/**
 * Pick black or white text so it stays legible against a given background
 * color (e.g. white text on a bright green/yellow interval dot is unreadable).
 * @param {string} hexColor - '#rrggbb'
 * @returns {'#000000'|'#ffffff'}
 */
function getContrastTextColor(hexColor) {
    if (typeof hexColor !== 'string' || hexColor.length < 7) {
        return '#ffffff';
    }
    const r = parseInt(hexColor.substring(1, 3), 16);
    const g = parseInt(hexColor.substring(3, 5), 16);
    const b = parseInt(hexColor.substring(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
}

function createScalePositionMiniFretboard(
    scaleNoteNames,
    displayedNotes,
    referenceRootNote,
    rowStringIndex,
    rowScaleRootNote,
    showOnlyDisplayedNotes = false,
    patternScale = fretboardState.scalePositionPatternScale,
    showRelativeFretLabels = true,
    showAbsoluteFretLabels = fretboardState.scalePositionUseAbsoluteFretLabels
) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const width = Math.round(128 * patternScale);
    const startX = Math.round(10 * patternScale);
    const startY = Math.round(10 * patternScale);
    const fretGap = 18 * patternScale;
    const stringGap = 12 * patternScale;
    // Height scales with the number of strings on the active instrument (e.g.
    // 4-string bass vs 8-string guitar) instead of a fixed value tuned for
    // 6-string guitar, which made bass boards look squashed-tall and extended
    // range boards look cramped.
    const stringsSpan = (fretboardState.MINI_SCALE_STRING_TUNING.length - 1) * stringGap;
    const bottomMargin = showRelativeFretLabels ? (22 * patternScale) : (10 * patternScale);
    const height = Math.round(startY + stringsSpan + bottomMargin);

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.cssText = `
        background: rgba(0,0,0,0.22);
        border: 1px solid #505050;
        border-radius: 4px;
    `;

    for (let fret = 0; fret <= MINI_SCALE_FRET_COUNT; fret++) {
        const x = startX + fret * fretGap;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(x));
        line.setAttribute('y1', String(startY));
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(startY + (fretboardState.MINI_SCALE_STRING_TUNING.length - 1) * stringGap));
        line.setAttribute('stroke', '#6c6c6c');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }

    for (let stringIndex = 0; stringIndex < fretboardState.MINI_SCALE_STRING_TUNING.length; stringIndex++) {
        const y = startY + stringIndex * stringGap;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(startX));
        line.setAttribute('y1', String(y));
        line.setAttribute('x2', String(startX + MINI_SCALE_FRET_COUNT * fretGap));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke', '#8a8a8a');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }

    const scaleArray = Array.isArray(scaleNoteNames) ? scaleNoteNames : [];
    const displayedArray = Array.isArray(displayedNotes) ? displayedNotes : [];
    const rowRootAbsoluteFret = findRowRootAbsoluteFret(rowStringIndex, rowScaleRootNote, SCALE_POSITION_MIN_ABSOLUTE_ROOT_FRET);
    const colorReferenceRoot = fretboardState.scalePositionKeepColorConstant ? rowScaleRootNote : referenceRootNote;
    const shapeReferenceRoot = fretboardState.scalePositionKeepShapeConstant ? rowScaleRootNote : referenceRootNote;

    if (rowRootAbsoluteFret === null) {
        wrapper.appendChild(svg);
        return wrapper;
    }

    const candidates = [];

    for (let stringIndex = 0; stringIndex < fretboardState.MINI_SCALE_STRING_TUNING.length; stringIndex++) {
        const openMidi = notationNoteToMidi(fretboardState.MINI_SCALE_STRING_TUNING[stringIndex]);

        for (let displayColumn = 0; displayColumn <= MINI_SCALE_FRET_COUNT; displayColumn++) {
            const absoluteFret = getAbsoluteFretForDisplayColumn(rowRootAbsoluteFret, displayColumn);
            if (absoluteFret < -1) {
                continue;
            }
            const midi = openMidi + absoluteFret;
            const noteName = notationStripOctave(notationMidiToNote(midi));

            const isInScale = noteArrayContains(scaleArray, noteName);
            const isDisplayed = noteArrayContains(displayedArray, noteName);

            if (!isInScale) {
                continue;
            }

            if (showOnlyDisplayedNotes && !isDisplayed) {
                continue;
            }

            const x = startX + displayColumn * fretGap;
            const y = startY + stringIndex * stringGap;
            const isRoot = areEnharmonicEquivalent(noteName, referenceRootNote);
            const isTargetRootString = stringIndex === rowStringIndex;
            const colorSemitone = getSemitoneFromReference(colorReferenceRoot, noteName);
            const shapeSemitone = getSemitoneFromReference(shapeReferenceRoot, noteName);
            let intervalColor = getIntervalColor(colorSemitone);
            if(fretboardState.scalePositionDarkDuplicate){
                // If the note is on an x-position of 4 or higher, darken the color to indicate it's a duplicate note in the scale position grid.
                if(displayColumn >= 6 && stringIndex != 2){
                    intervalColor = shadeColor(intervalColor, -70);
                }
                else if(displayColumn >= 5 && stringIndex == 2){
                    intervalColor = shadeColor(intervalColor, -70);
                }
                if(displayColumn == 0){
                    intervalColor = shadeColor(intervalColor, -70);
                }
            }

            const baseRadius = isRoot ? 3.4 : 2.9;
            const radius = baseRadius * fretboardState.scalePositionDotScale;
            const shapeType = fretboardState.scalePositionUseNoteShapes
                ? NOTE_SHAPE_TYPES[shapeSemitone % NOTE_SHAPE_TYPES.length]
                : 'circle';

            candidates.push({
                string: stringIndex,
                fret: absoluteFret,
                x,
                y,
                radius,
                shapeType,
                noteName,
                note: noteName,
                isRoot,
                isTargetRootString,
                intervalColor,
                intervalLabel: SEMITONE_TO_SCALE_INTERVAL_LABEL[getSemitoneFromReference(referenceRootNote, noteName)]
            });
        }
    }

    // For chord cells (not the full-scale reference), pick one playable grip
    // (one dot per string, nearest to the row's root column) and give it a
    // finger number / label, distinguishing it from other same-chord dots
    // that fall in this window but aren't part of that specific grip.
    let gripMembers = null;
    if (showOnlyDisplayedNotes && candidates.length > 0) {
        const grip = selectGripFromPositions(candidates, rowRootAbsoluteFret);
        assignFingers(grip);
        gripMembers = new Set(grip);

        if (fretboardState.scalePositionShowGripLines && grip.length > 1) {
            const orderedGrip = grip.slice().sort((a, b) => a.string - b.string);
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('points', orderedGrip.map(c => `${c.x},${c.y}`).join(' '));
            polyline.setAttribute('fill', 'none');
            polyline.setAttribute('stroke', 'rgba(255,255,255,0.65)');
            polyline.setAttribute('stroke-width', String(Math.max(1, 1.4 * fretboardState.scalePositionDotScale)));
            polyline.setAttribute('stroke-linecap', 'round');
            polyline.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(polyline);
        }
    }

    candidates.forEach(candidate => {
        const isGripMember = gripMembers ? gripMembers.has(candidate) : false;
        const marker = createNoteShapeMarker(
            candidate.x,
            candidate.y,
            candidate.radius,
            candidate.shapeType,
            candidate.intervalColor,
            candidate.isRoot && candidate.isTargetRootString ? '#ffffff' : 'rgba(0,0,0,0.5)',
            candidate.isRoot && candidate.isTargetRootString ? 1 : 0.5,
            isGripMember
        );
        svg.appendChild(marker);

        if (fretboardState.scalePositionAllLabelsMode !== 'none') {
            // Show a single label (note name or interval) on every rendered
            // dot - chord cells and the full scale reference column alike -
            // independent of the picked grip.
            const allLabelText = fretboardState.scalePositionAllLabelsMode === 'interval' ? candidate.intervalLabel : candidate.noteName;
            if (allLabelText) {
                const allLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                allLabel.setAttribute('x', String(candidate.x));
                allLabel.setAttribute('y', String(candidate.y));
                allLabel.setAttribute('text-anchor', 'middle');
                allLabel.setAttribute('dominant-baseline', 'central');
                allLabel.setAttribute('fill', getContrastTextColor(candidate.intervalColor));
                allLabel.setAttribute('font-size', String(Math.max(6, Math.round(candidate.radius * 1.1))));
                allLabel.setAttribute('font-family', 'monospace');
                allLabel.setAttribute('font-weight', 'bold');
                allLabel.textContent = allLabelText;
                svg.appendChild(allLabel);
            }
        } else if (isGripMember && fretboardState.scalePositionLabelMode !== 'none') {
            const labelText = getFingeringMarkerLabel(candidate, fretboardState.scalePositionLabelMode);
            if (labelText) {
                const gripLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                gripLabel.setAttribute('x', String(candidate.x));
                gripLabel.setAttribute('y', String(candidate.y));
                gripLabel.setAttribute('text-anchor', 'middle');
                gripLabel.setAttribute('dominant-baseline', 'central');
                gripLabel.setAttribute('fill', getContrastTextColor(candidate.intervalColor));
                gripLabel.setAttribute('font-size', String(Math.max(6, Math.round(candidate.radius * 1.1))));
                gripLabel.setAttribute('font-family', 'monospace');
                gripLabel.setAttribute('font-weight', 'bold');
                gripLabel.textContent = labelText;
                svg.appendChild(gripLabel);
            }
        }
    });

    if (showRelativeFretLabels) {
        const labelY = startY + (fretboardState.MINI_SCALE_STRING_TUNING.length - 1) * stringGap + (12 * patternScale);
        for (let displayColumn = 0; displayColumn <= MINI_SCALE_FRET_COUNT; displayColumn++) {
            const x = startX + displayColumn * fretGap;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', String(x));
            text.setAttribute('y', String(labelY));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#d6d6d6');
            text.setAttribute('font-size', String(Math.max(8, Math.round(8 * patternScale))));
            text.setAttribute('font-family', 'monospace');

            if (showAbsoluteFretLabels) {
                const absoluteFret = getAbsoluteFretForDisplayColumn(rowRootAbsoluteFret, displayColumn);
                text.textContent = String(absoluteFret);
            } else {
                const delta = displayColumn - GENERIC_ROOT_DISPLAY_COLUMN;
                text.textContent = delta === 0 ? 'R' : (delta > 0 ? `+${delta}` : String(delta));
            }

            svg.appendChild(text);
        }
    }

    wrapper.appendChild(svg);
    return wrapper;
}

/**
 * Build the key used to track visibility of a scale position grid cell.
 * colIndex is -1 for the full-scale reference column, 0..N-1 for chord/degree columns.
 * @param {number} rowIndex
 * @param {number} colIndex
 * @returns {string}
 */
function scalePositionCellKey(rowIndex, colIndex) {
    return `${rowIndex}:${colIndex}`;
}

function isScalePositionCellVisible(rowIndex, colIndex) {
    return !fretboardState.scalePositionHiddenCells.has(scalePositionCellKey(rowIndex, colIndex));
}

function setScalePositionCellVisible(rowIndex, colIndex, visible) {
    const key = scalePositionCellKey(rowIndex, colIndex);
    if (visible) {
        fretboardState.scalePositionHiddenCells.delete(key);
    } else {
        fretboardState.scalePositionHiddenCells.add(key);
    }
}

function toggleScalePositionCell(rowIndex, colIndex) {
    setScalePositionCellVisible(rowIndex, colIndex, !isScalePositionCellVisible(rowIndex, colIndex));
}

function isScalePositionRowFullyVisible(rowIndex, columnCount) {
    for (let col = -1; col < columnCount; col++) {
        if (!isScalePositionCellVisible(rowIndex, col)) {
            return false;
        }
    }
    return true;
}

function isScalePositionRowFullyHidden(rowIndex, columnCount) {
    for (let col = -1; col < columnCount; col++) {
        if (isScalePositionCellVisible(rowIndex, col)) {
            return false;
        }
    }
    return true;
}

function isScalePositionColumnFullyVisible(colIndex, rowCount) {
    for (let row = 0; row < rowCount; row++) {
        if (!isScalePositionCellVisible(row, colIndex)) {
            return false;
        }
    }
    return true;
}

function isScalePositionColumnFullyHidden(colIndex, rowCount) {
    for (let row = 0; row < rowCount; row++) {
        if (isScalePositionCellVisible(row, colIndex)) {
            return false;
        }
    }
    return true;
}

function toggleScalePositionRow(rowIndex, columnCount) {
    const makeVisible = !isScalePositionRowFullyVisible(rowIndex, columnCount);
    for (let col = -1; col < columnCount; col++) {
        setScalePositionCellVisible(rowIndex, col, makeVisible);
    }
}

function toggleScalePositionColumn(colIndex, rowCount) {
    const makeVisible = !isScalePositionColumnFullyVisible(colIndex, rowCount);
    for (let row = 0; row < rowCount; row++) {
        setScalePositionCellVisible(row, colIndex, makeVisible);
    }
}

function toggleScalePositionAllCells(rowCount, columnCount) {
    let allVisible = true;
    outer:
    for (let row = 0; row < rowCount; row++) {
        for (let col = -1; col < columnCount; col++) {
            if (!isScalePositionCellVisible(row, col)) {
                allVisible = false;
                break outer;
            }
        }
    }
    const makeVisible = !allVisible;
    for (let row = 0; row < rowCount; row++) {
        for (let col = -1; col < columnCount; col++) {
            setScalePositionCellVisible(row, col, makeVisible);
        }
    }
}

/**
 * Style a single cell of the compact focus-selector matrix.
 * @param {HTMLElement} el
 * @param {boolean} visible
 * @param {boolean} isHeader
 */
function styleScalePositionFocusCell(el, visible, isHeader) {
    el.style.cssText = `
        border: 1px solid #444;
        width: 22px;
        height: 22px;
        min-width: 22px;
        font-size: 9px;
        text-align: center;
        cursor: pointer;
        user-select: none;
        padding: 0;
        color: ${visible ? '#fff' : '#888'};
        background: ${isHeader ? (visible ? '#454545' : '#242424') : (visible ? '#3f8f5f' : '#2a2a2a')};
        font-weight: ${isHeader ? 'bold' : 'normal'};
    `;
}

/**
 * Build the compact matrix that lets the user pick which (root, chord) cells
 * of the scale position grid should be shown, to reduce visual clutter.
 * @param {number} columnCount
 * @returns {HTMLElement}
 */
function buildScalePositionFocusMatrix(columnCount) {
    const rowCount = fretboardState.SCALE_POSITION_ROW_STRINGS.length;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        margin: 0 auto 12px auto;
        width: fit-content;
        text-align: center;
    `;

    const title = document.createElement('div');
    title.textContent = 'Focus Selector';
    title.style.cssText = `
        color: #f0f0f0;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 2px;
    `;
    wrapper.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = 'Click a header to toggle its whole row/column, the corner to toggle everything, or a cell to toggle it alone.';
    hint.style.cssText = `
        color: #a8a8a8;
        font-size: 9px;
        margin-bottom: 4px;
        max-width: 720px;
    `;
    wrapper.appendChild(hint);

    const focusTable = document.createElement('table');
    focusTable.style.cssText = `
        border-collapse: collapse;
        margin: 0 auto;
    `;

    const headerRow = document.createElement('tr');

    const corner = document.createElement('th');
    corner.textContent = 'All';
    corner.title = 'Toggle all rows and columns';
    styleScalePositionFocusCell(corner, true, true);
    corner.addEventListener('click', () => {
        toggleScalePositionAllCells(rowCount, columnCount);
        renderScalePositionGrid();
    });
    headerRow.appendChild(corner);

    const scaleColHeader = document.createElement('th');
    scaleColHeader.textContent = 'Sc';
    scaleColHeader.title = 'Toggle the full-scale reference column';
    styleScalePositionFocusCell(scaleColHeader, isScalePositionColumnFullyVisible(-1, rowCount), true);
    scaleColHeader.addEventListener('click', () => {
        toggleScalePositionColumn(-1, rowCount);
        renderScalePositionGrid();
    });
    headerRow.appendChild(scaleColHeader);

    for (let col = 0; col < columnCount; col++) {
        const colLabel = SCALE_POSITION_DEGREES[col] || String(col + 1);
        const th = document.createElement('th');
        th.textContent = colLabel;
        th.title = `Toggle column ${colLabel} for all roots`;
        styleScalePositionFocusCell(th, isScalePositionColumnFullyVisible(col, rowCount), true);
        th.addEventListener('click', () => {
            toggleScalePositionColumn(col, rowCount);
            renderScalePositionGrid();
        });
        headerRow.appendChild(th);
    }
    focusTable.appendChild(headerRow);

    for (let row = 0; row < rowCount; row++) {
        const tr = document.createElement('tr');
        const rowLabel = fretboardState.SCALE_POSITION_ROW_LABELS[row];

        const rowHeader = document.createElement('th');
        rowHeader.textContent = rowLabel;
        rowHeader.title = `Toggle all chords for Root ${rowLabel}`;
        styleScalePositionFocusCell(rowHeader, isScalePositionRowFullyVisible(row, columnCount), true);
        rowHeader.addEventListener('click', () => {
            toggleScalePositionRow(row, columnCount);
            renderScalePositionGrid();
        });
        tr.appendChild(rowHeader);

        const scaleCell = document.createElement('td');
        scaleCell.title = `Toggle full-scale reference for Root ${rowLabel}`;
        styleScalePositionFocusCell(scaleCell, isScalePositionCellVisible(row, -1), false);
        scaleCell.addEventListener('click', () => {
            toggleScalePositionCell(row, -1);
            renderScalePositionGrid();
        });
        tr.appendChild(scaleCell);

        for (let col = 0; col < columnCount; col++) {
            const colLabel = SCALE_POSITION_DEGREES[col] || String(col + 1);
            const td = document.createElement('td');
            td.title = `Toggle ${colLabel} for Root ${rowLabel}`;
            styleScalePositionFocusCell(td, isScalePositionCellVisible(row, col), false);
            td.addEventListener('click', () => {
                toggleScalePositionCell(row, col);
                renderScalePositionGrid();
            });
            tr.appendChild(td);
        }

        focusTable.appendChild(tr);
    }

    wrapper.appendChild(focusTable);
    return wrapper;
}

/**
 * Create a dimmed placeholder shown in place of a hidden scale position cell.
 * @param {() => void} onRestore
 * @returns {HTMLElement}
 */
function createScalePositionPlaceholderCell(onRestore) {
    const placeholder = document.createElement('div');
    placeholder.textContent = '···';
    placeholder.title = 'Hidden — click to show';
    placeholder.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        color: #666;
        font-size: 11px;
        cursor: pointer;
        border: 1px dashed #444;
        border-radius: 4px;
        background: rgba(0,0,0,0.15);
    `;
    placeholder.addEventListener('click', onRestore);
    return placeholder;
}

/**
 * Create or rebuild the scale position grid that sits between the main fretboard and chord grid.
 */
function renderScalePositionGrid() {
    const container = document.getElementById('scalePositionGridContainer');
    if (!container) {
        return;
    }

    persistScalePositionGridSettings();

    const scaleNoteNames = getCurrentScaleNoteNames();
    const primaryScale = getPrimaryScale();
    const primaryRoot = getPrimaryRootNote() || 'C';
    const normalizedRoot = notationStripOctave(normalizeNote(primaryRoot));
    const noteCount = scaleNoteNames.length;
    const columnCount = Math.min(8, Math.max(6, noteCount || 7));

    container.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = 'Scale Position Grid';
    title.style.cssText = `
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        color: #fff;
    `;
    container.appendChild(title);

    // Grid information (description, selected-scale summary, legend) on the
    // left, the Focus Selector matrix on the right, side by side.
    const infoRow = document.createElement('div');
    infoRow.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: flex-start;
        justify-content: center;
        margin-bottom: 10px;
    `;
    const infoColumn = document.createElement('div');
    infoColumn.style.cssText = `
        flex: 0 1 1080px;
        min-width: 280px;
        text-align: center;
    `;
    const focusColumn = document.createElement('div');
    focusColumn.style.cssText = `
        flex: 0 0 auto;
    `;
    infoRow.appendChild(infoColumn);
    infoRow.appendChild(focusColumn);
    container.appendChild(infoRow);

    const infoHeading = document.createElement('div');
    infoHeading.textContent = 'Grid Information';
    infoHeading.style.cssText = `
        color: #f0f0f0;
        font-size: 11px;
        font-weight: bold;
        margin-bottom: 2px;
    `;
    infoColumn.appendChild(infoHeading);

    const description = document.createElement('div');
    description.style.cssText = `
        color: #cbcbcb;
        font-size: 11px;
        text-align: center;
        margin-bottom: 10px;
    `;
    description.textContent = 'Generic row boards: root is fixed at displayed fret 2 (with one fret left), labels are row-consistent, and each row shifts by root string context.';
    infoColumn.appendChild(description);

    const controls = document.createElement('div');
    controls.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 12px;
        align-items: center;
        margin-top: 10px;
        color: #e3e3e3;
        font-size: 11px;
    `;

    const scaleControl = document.createElement('label');
    scaleControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const scaleLabel = document.createElement('span');
    scaleLabel.textContent = 'Pattern Size';
    const scaleInput = document.createElement('input');
    scaleInput.type = 'range';
    scaleInput.min = '0.8';
    scaleInput.max = '2.2';
    scaleInput.step = '0.05';
    scaleInput.value = String(fretboardState.scalePositionPatternScale);
    const scaleValue = document.createElement('span');
    scaleValue.style.cssText = 'min-width: 34px; text-align: right; font-family: monospace;';
    scaleValue.textContent = `${fretboardState.scalePositionPatternScale.toFixed(2)}x`;
    scaleInput.addEventListener('input', (event) => {
        const newValue = parseFloat(event.target.value);
        if (!Number.isNaN(newValue)) {
            fretboardState.scalePositionPatternScale = newValue;
            scaleValue.textContent = `${newValue.toFixed(2)}x`;
            renderScalePositionGrid();
        }
    });
    scaleControl.appendChild(scaleLabel);
    scaleControl.appendChild(scaleInput);
    scaleControl.appendChild(scaleValue);

    const dotControl = document.createElement('label');
    dotControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const dotLabel = document.createElement('span');
    dotLabel.textContent = 'Dot Size';
    const dotInput = document.createElement('input');
    dotInput.type = 'range';
    dotInput.min = '0.5';
    dotInput.max = '3';
    dotInput.step = '0.05';
    dotInput.value = String(fretboardState.scalePositionDotScale);
    const dotValue = document.createElement('span');
    dotValue.style.cssText = 'min-width: 34px; text-align: right; font-family: monospace;';
    dotValue.textContent = `${fretboardState.scalePositionDotScale.toFixed(2)}x`;
    dotInput.addEventListener('input', (event) => {
        const newValue = parseFloat(event.target.value);
        if (!Number.isNaN(newValue)) {
            fretboardState.scalePositionDotScale = newValue;
            dotValue.textContent = `${newValue.toFixed(2)}x`;
            renderScalePositionGrid();
        }
    });
    dotControl.appendChild(dotLabel);
    dotControl.appendChild(dotInput);
    dotControl.appendChild(dotValue);

    const modeControl = document.createElement('label');
    modeControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const modeToggle = document.createElement('input');
    modeToggle.type = 'checkbox';
    modeToggle.checked = fretboardState.scalePositionUseAbsoluteFretLabels;
    const modeLabel = document.createElement('span');
    modeLabel.textContent = fretboardState.scalePositionUseAbsoluteFretLabels ? 'Fret Labels: Absolute' : 'Fret Labels: Relative';
    modeToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionUseAbsoluteFretLabels = event.target.checked;
        modeLabel.textContent = fretboardState.scalePositionUseAbsoluteFretLabels ? 'Fret Labels: Absolute' : 'Fret Labels: Relative';
        renderScalePositionGrid();
    });
    modeControl.appendChild(modeToggle);
    modeControl.appendChild(modeLabel);

    const stackControl = document.createElement('label');
    stackControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const stackLabel = document.createElement('span');
    stackLabel.textContent = 'Stacking';
    const stackSelect = document.createElement('select');
    stackSelect.innerHTML = `
        <option value="dyad">Dyad</option>
        <option value="triad">Triad</option>
        <option value="tetrad">Tetrad</option>
    `;
    stackSelect.value = fretboardState.scalePositionStackType;
    stackSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 11px;
        background: #222;
        color: #e3e3e3;
    `;
    stackSelect.addEventListener('change', (event) => {
        fretboardState.scalePositionStackType = event.target.value;
        renderScalePositionGrid();
    });
    stackControl.appendChild(stackLabel);
    stackControl.appendChild(stackSelect);

    const gripLabelControl = document.createElement('label');
    gripLabelControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const gripLabelLabel = document.createElement('span');
    gripLabelLabel.textContent = 'Grip Labels';
    const gripLabelSelect = document.createElement('select');
    gripLabelSelect.innerHTML = `
        <option value="none">Off</option>
        <option value="note">Note Name</option>
        <option value="interval">Interval</option>
        <option value="finger">Finger Number</option>
    `;
    gripLabelSelect.value = fretboardState.scalePositionLabelMode;
    gripLabelSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 11px;
        background: #222;
        color: #e3e3e3;
    `;
    gripLabelSelect.addEventListener('change', (event) => {
        fretboardState.scalePositionLabelMode = event.target.value;
        renderScalePositionGrid();
    });
    gripLabelControl.appendChild(gripLabelLabel);
    gripLabelControl.appendChild(gripLabelSelect);

    const allLabelsControl = document.createElement('label');
    allLabelsControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const allLabelsLabel = document.createElement('span');
    allLabelsLabel.textContent = 'All Note Labels';
    const allLabelsSelect = document.createElement('select');
    allLabelsSelect.innerHTML = `
        <option value="none">Off</option>
        <option value="note">Note Name</option>
        <option value="interval">Interval</option>
    `;
    allLabelsSelect.value = fretboardState.scalePositionAllLabelsMode;
    allLabelsSelect.style.cssText = `
        padding: 2px 4px;
        border: 1px solid #666;
        border-radius: 4px;
        font-size: 11px;
        background: #222;
        color: #e3e3e3;
    `;
    allLabelsSelect.addEventListener('change', (event) => {
        fretboardState.scalePositionAllLabelsMode = event.target.value;
        renderScalePositionGrid();
    });
    allLabelsControl.appendChild(allLabelsLabel);
    allLabelsControl.appendChild(allLabelsSelect);

    const gripLinesControl = document.createElement('label');
    gripLinesControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const gripLinesToggle = document.createElement('input');
    gripLinesToggle.type = 'checkbox';
    gripLinesToggle.checked = fretboardState.scalePositionShowGripLines;
    const gripLinesLabel = document.createElement('span');
    gripLinesLabel.textContent = 'Connect Fingered Notes';
    gripLinesToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionShowGripLines = event.target.checked;
        renderScalePositionGrid();
    });
    gripLinesControl.appendChild(gripLinesToggle);
    gripLinesControl.appendChild(gripLinesLabel);

    const chordHeaderControl = document.createElement('label');
    chordHeaderControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const chordHeaderToggle = document.createElement('input');
    chordHeaderToggle.type = 'checkbox';
    chordHeaderToggle.checked = fretboardState.scalePositionShowChordNames;
    const chordHeaderLabel = document.createElement('span');
    chordHeaderLabel.textContent = 'Show Chord Names In Headers';
    chordHeaderToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionShowChordNames = event.target.checked;
        renderScalePositionGrid();
    });
    chordHeaderControl.appendChild(chordHeaderToggle);
    chordHeaderControl.appendChild(chordHeaderLabel);

    const instancedScaleControl = document.createElement('label');
    instancedScaleControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const instancedScaleToggle = document.createElement('input');
    instancedScaleToggle.type = 'checkbox';
    instancedScaleToggle.checked = fretboardState.scalePositionUseInstancedScale;
    const instancedScaleLabel = document.createElement('span');
    instancedScaleLabel.textContent = 'Instanced Scale Labels (Notes)';
    instancedScaleToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionUseInstancedScale = event.target.checked;
        renderScalePositionGrid();
    });
    instancedScaleControl.appendChild(instancedScaleToggle);
    instancedScaleControl.appendChild(instancedScaleLabel);

    const shapeControl = document.createElement('label');
    shapeControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const shapeToggle = document.createElement('input');
    shapeToggle.type = 'checkbox';
    shapeToggle.checked = fretboardState.scalePositionUseNoteShapes;
    const shapeLabel = document.createElement('span');
    shapeLabel.textContent = 'Use Note Shapes';
    shapeToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionUseNoteShapes = event.target.checked;
        renderScalePositionGrid();
    });
    shapeControl.appendChild(shapeToggle);
    shapeControl.appendChild(shapeLabel);

    const keepColorControl = document.createElement('label');
    keepColorControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const keepColorToggle = document.createElement('input');
    keepColorToggle.type = 'checkbox';
    keepColorToggle.checked = fretboardState.scalePositionKeepColorConstant;
    const keepColorLabel = document.createElement('span');
    keepColorLabel.textContent = 'Keep Color Constant';
    keepColorToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionKeepColorConstant = event.target.checked;
        renderScalePositionGrid();
    });
    keepColorControl.appendChild(keepColorToggle);
    keepColorControl.appendChild(keepColorLabel);

    const keepShapeControl = document.createElement('label');
    keepShapeControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;
    const keepShapeToggle = document.createElement('input');
    keepShapeToggle.type = 'checkbox';
    keepShapeToggle.checked = fretboardState.scalePositionKeepShapeConstant;
    const keepShapeLabel = document.createElement('span');
    keepShapeLabel.textContent = 'Keep Shape Constant';
    keepShapeToggle.addEventListener('change', (event) => {
        fretboardState.scalePositionKeepShapeConstant = event.target.checked;
        renderScalePositionGrid();
    });
    keepShapeControl.appendChild(keepShapeToggle);
    keepShapeControl.appendChild(keepShapeLabel);

    const darkDuplicateControl = document.createElement('label');
    darkDuplicateControl.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.2);
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        padding: 4px 8px;
    `;

    const darkDuplicate = document.createElement('input');
    darkDuplicate.type = 'checkbox';
    darkDuplicate.checked = fretboardState.scalePositionDarkDuplicate;
    const darkDuplicateLabel = document.createElement('span');
    darkDuplicateLabel.textContent = 'Dark Duplicate';
    darkDuplicate.addEventListener('change', (event) => {
        fretboardState.scalePositionDarkDuplicate = event.target.checked;
        renderScalePositionGrid();
    });
    darkDuplicateControl.appendChild(darkDuplicate);
    darkDuplicateControl.appendChild(darkDuplicateLabel);


    controls.appendChild(scaleControl);
    controls.appendChild(dotControl);
    controls.appendChild(modeControl);
    controls.appendChild(stackControl);
    controls.appendChild(gripLabelControl);
    controls.appendChild(allLabelsControl);
    controls.appendChild(gripLinesControl);
    controls.appendChild(chordHeaderControl);
    controls.appendChild(instancedScaleControl);
    controls.appendChild(shapeControl);
    controls.appendChild(keepColorControl);
    controls.appendChild(keepShapeControl);
    controls.appendChild(darkDuplicateControl);

    const fallbackScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const workingScale = scaleNoteNames.length > 0 ? scaleNoteNames : fallbackScale;
    const scaleIntervalEntries = getScaleIntervalEntries(workingScale, normalizedRoot);
    const intervalSummary = `${scaleIntervalEntries.map(entry => entry.intervalLabel).join(' - ')} - O`;
    const noteSummary = fretboardState.scalePositionUseInstancedScale ? ` | Notes: ${workingScale.join(' - ')}` : '';
    const scaleDescriptor = getScaleDescriptor(primaryScale);

    const selectedScaleTitle = document.createElement('div');
    selectedScaleTitle.style.cssText = `
        margin: 4px 0 10px 0;
        color: #f0f0f0;
        font-size: 12px;
        font-weight: bold;
        text-align: center;
    `;
    const titlePrefix = fretboardState.scalePositionUseInstancedScale ? `${normalizedRoot} ` : '';
    selectedScaleTitle.textContent = `${titlePrefix}${scaleDescriptor} | Intervals: ${intervalSummary} ${noteSummary}`;
    infoColumn.appendChild(selectedScaleTitle);

    const legend = document.createElement('div');
    legend.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
        align-items: center;
        margin: 0 auto 10px auto;
        max-width: 1100px;
        color: #e0e0e0;
        font-size: 10px;
    `;
    scaleIntervalEntries.forEach((entry) => {
        const item = document.createElement('span');
        item.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            border: 1px solid #4f4f4f;
            border-radius: 10px;
            background: rgba(0,0,0,0.2);
        `;

        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '12');
        iconSvg.setAttribute('height', '12');
        iconSvg.style.cssText = 'display:inline-block;';

        const legendShapeType = fretboardState.scalePositionUseNoteShapes
            ? NOTE_SHAPE_TYPES[entry.semitone % NOTE_SHAPE_TYPES.length]
            : 'circle';
        const legendShape = createNoteShapeMarker(
            6,
            6,
            4,
            legendShapeType,
            getIntervalColor(entry.semitone),
            'rgba(0,0,0,0.5)',
            0.7
        );
        iconSvg.appendChild(legendShape);

        const text = document.createElement('span');
        text.textContent = fretboardState.scalePositionUseInstancedScale ? entry.note : entry.intervalLabel;

        item.appendChild(iconSvg);
        item.appendChild(text);
        legend.appendChild(item);
    });

    {
        const gripItem = document.createElement('span');
        gripItem.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 6px;
            border: 1px dashed #999;
            border-radius: 10px;
            background: rgba(0,0,0,0.2);
        `;
        gripItem.textContent = 'Dashed = suggested fingering grip';
        legend.appendChild(gripItem);
    }
    infoColumn.appendChild(legend);

    focusColumn.appendChild(buildScalePositionFocusMatrix(columnCount));

    const rowCount = fretboardState.SCALE_POSITION_ROW_STRINGS.length;
    const showScaleColumn = !isScalePositionColumnFullyHidden(-1, rowCount);
    const visibleDegreeCols = [];
    for (let col = 0; col < columnCount; col++) {
        if (!isScalePositionColumnFullyHidden(col, rowCount)) {
            visibleDegreeCols.push(col);
        }
    }

    const table = document.createElement('table');
    table.style.cssText = `
        border-collapse: collapse;
        margin: 0 auto;
        background: rgba(17, 17, 17, 0.45);
        border: 1px solid #444;
    `;

    const headerRow = document.createElement('tr');
    const cornerCell = document.createElement('th');
    cornerCell.textContent = 'Pos';
    cornerCell.style.cssText = `
        border: 1px solid #444;
        background: #2b2b2b;
        color: #fff;
        padding: 4px 6px;
        font-size: 11px;
        min-width: 48px;
    `;
    headerRow.appendChild(cornerCell);

    if (showScaleColumn) {
        const scaleHeader = document.createElement('th');
        scaleHeader.textContent = 'Scale';
        scaleHeader.style.cssText = `
            border: 1px solid #444;
            background: #2b2b2b;
            color: #fff;
            padding: 4px;
            font-size: 11px;
            min-width: ${Math.round(130 * fretboardState.scalePositionPatternScale)}px;
            text-align: center;
        `;
        headerRow.appendChild(scaleHeader);
    }

    const chordSpan = SCALE_POSITION_STACK_SIZES[fretboardState.scalePositionStackType] || 3;

    for (const col of visibleDegreeCols) {
        const colHeader = document.createElement('th');
        const degreeIndexes = [];
        for (let i = 0; i < chordSpan; i++) {
            degreeIndexes.push((col + i * 2) % workingScale.length);
        }
        const degreeChordNotes = degreeIndexes.map(index => workingScale[index]);
        const degreeChordRoot = workingScale[col % workingScale.length];
        colHeader.textContent = buildDegreeHeaderLabel(
            SCALE_POSITION_DEGREES[col] || String(col + 1),
            degreeChordRoot,
            degreeChordNotes
        );
        colHeader.style.cssText = `
            border: 1px solid #444;
            background: #2b2b2b;
            color: #fff;
            padding: 4px;
            font-size: 11px;
            min-width: ${Math.round(130 * fretboardState.scalePositionPatternScale)}px;
            text-align: center;
            white-space: pre-line;
            line-height: 1.2;
        `;
        headerRow.appendChild(colHeader);
    }
    table.appendChild(headerRow);

    for (let row = 0; row < rowCount; row++) {
        if (isScalePositionRowFullyHidden(row, columnCount)) {
            continue;
        }

        const rowStringIndex = fretboardState.SCALE_POSITION_ROW_STRINGS[row];
        const rowLabel = fretboardState.SCALE_POSITION_ROW_LABELS[row];
        const tr = document.createElement('tr');

        const rowHeader = document.createElement('td');
        rowHeader.textContent = `Root ${rowLabel}`;
        rowHeader.style.cssText = `
            border: 1px solid #444;
            background: #383838;
            color: #fff;
            font-weight: bold;
            font-size: 11px;
            text-align: center;
            padding: 4px 6px;
            white-space: nowrap;
        `;
        tr.appendChild(rowHeader);

        if (showScaleColumn) {
            const fullScaleCell = document.createElement('td');
            fullScaleCell.style.cssText = `
                border: 1px solid #444;
                padding: 4px;
                vertical-align: middle;
                background: rgba(30,30,30,0.35);
            `;
            if (isScalePositionCellVisible(row, -1)) {
                const fullScaleMini = createScalePositionMiniFretboard(
                    workingScale,
                    workingScale,
                    normalizedRoot,
                    rowStringIndex,
                    normalizedRoot,
                    false,
                    fretboardState.scalePositionPatternScale,
                    true,
                    fretboardState.scalePositionUseAbsoluteFretLabels
                );
                fullScaleCell.appendChild(fullScaleMini);
            } else {
                fullScaleCell.appendChild(createScalePositionPlaceholderCell(() => {
                    setScalePositionCellVisible(row, -1, true);
                    renderScalePositionGrid();
                }));
            }
            tr.appendChild(fullScaleCell);
        }

        for (const col of visibleDegreeCols) {
            const td = document.createElement('td');
            td.style.cssText = `
                border: 1px solid #444;
                padding: 4px;
                vertical-align: middle;
                background: rgba(30,30,30,0.35);
            `;

            if (isScalePositionCellVisible(row, col)) {
                const chordIndexes = [];
                for (let i = 0; i < chordSpan; i++) {
                    chordIndexes.push((col + i * 2) % workingScale.length);
                }
                const chordPatternNotes = chordIndexes.map(index => workingScale[index]);
                const chordRoot = workingScale[col % workingScale.length];

                const mini = createScalePositionMiniFretboard(
                    workingScale,
                    chordPatternNotes,
                    chordRoot,
                    rowStringIndex,
                    normalizedRoot,
                    true,
                    fretboardState.scalePositionPatternScale,
                    true,
                    fretboardState.scalePositionUseAbsoluteFretLabels
                );
                td.appendChild(mini);
            } else {
                td.appendChild(createScalePositionPlaceholderCell(() => {
                    setScalePositionCellVisible(row, col, true);
                    renderScalePositionGrid();
                }));
            }
            tr.appendChild(td);
        }

        table.appendChild(tr);
    }

    container.appendChild(table);
    container.appendChild(controls);
}

/**
 * Create the wrapper container for the scale position grid.
 * @returns {HTMLElement}
 */
function createScalePositionGrid() {
    const gridContainer = document.createElement('div');
    gridContainer.id = 'scalePositionGridContainer';
    gridContainer.style.cssText = `
        margin: 16px auto 0 auto;
        width: fit-content;
        max-width: none;
        background: hsla(0, 0%, 24%, 1);
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        overflow-x: visible;
    `;

    renderScalePositionGrid();
    return gridContainer;
}

/**
 * Update chord grid colors based on current scale
 */
function updateChordGridColors() {
    const gridContainer = document.getElementById('chordButtonGridContainer');
    if (!gridContainer) {
        // Grid not ready yet, try again in a bit
        setTimeout(updateChordGridColors, 100);
        return;
    }
    
    const chromaticNotes = CHROMATIC;
    const commonChordTypes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', 'm7b5'];

    // Find all chord cells and update their colors
    const table = gridContainer.querySelector('table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tr');
    
    // Skip header row (index 0), start from note rows (index 1)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const noteIndex = i - 1; // Adjust for header row
        const note = chromaticNotes[noteIndex];
        const cells = row.querySelectorAll('td');
        
        // Skip note label cell (index 0), start from chord cells (index 1)
        for (let j = 1; j < cells.length; j++) {
            const cell = cells[j];
            const chordTypeIndex = j - 1; // Adjust for note label cell
            const chordType = commonChordTypes[chordTypeIndex];
            
            // Analyze chord-scale compatibility for new color
            const compatibility = analyzeChordScaleCompatibility(note, chordType);
            
            // Update cell color and tooltip
            cell.style.background = compatibility.color;
            cell.dataset.originalColor = compatibility.color;
            
            if (compatibility.totalNotes > 0) {
                cell.title = `${note}${chordType}: ${compatibility.matchCount}/${compatibility.totalNotes} notes in scale (${compatibility.matchPercentage}%)`;
            } else {
                cell.title = `${note}${chordType}: No scale selected or chord analysis failed`;
            }
        }
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
 * Build the note-name -> interval-label map used to label best-effort grip positions.
 * @param {Fretboard} fretboard
 * @param {Array<string>} chordNotes
 * @param {Array<string>} intervalLabels
 * @returns {Object}
 */
function buildIntervalLabelMap(fretboard, chordNotes, intervalLabels) {
    const map = {};
    chordNotes.forEach((note, index) => {
        const noteName = fretboard.extractNoteName(note);
        map[noteName] = normalizeIntervalLabel(intervalLabels[index]);
    });
    return map;
}

/**
 * Find playable shapes for a chord: known chordPatterns.js shapes first
 * (sorted by lowest fret, "predefined"), falling back to one generated
 * shape ("best-effort") when no known pattern matches.
 * @param {Fretboard} fretboard
 * @param {Array<string>} chordNotes
 * @param {string} rootNote
 * @param {Object} intervalLabelMap - noteName -> interval label
 * @param {Array<string>|null} specificPatterns
 * @returns {Array} shapes: {source, label, patternName, positions}
 */
function buildFingeringShapes(fretboard, chordNotes, rootNote, intervalLabelMap, specificPatterns) {
    const rootNoteName = fretboard.extractNoteName(rootNote);
    const matches = fretboard.findChordPatternMatches(chordNotes, rootNote, specificPatterns || null);
    const sortedMatches = matches.slice().sort((a, b) => {
        const minFretA = Math.min(...a.positions.map(pos => pos.fret));
        const minFretB = Math.min(...b.positions.map(pos => pos.fret));
        return minFretA - minFretB;
    });

    const shapes = sortedMatches.map(match => {
        const minFret = Math.min(...match.positions.map(pos => pos.fret));
        const positions = match.positions.map((pos, index) => ({
            string: pos.string,
            fret: pos.fret,
            note: match.patternNotes[index],
            intervalLabel: pos.label,
            isRoot: pos.label === 'R' || areEnharmonicEquivalent(match.patternNotes[index], rootNoteName)
        }));
        assignFingers(positions);
        return {
            source: classifyFingeringSource(match),
            label: minFret === 0 ? 'Open' : `Pos ${minFret}`,
            patternName: match.patternName,
            positions
        };
    });

    if (shapes.length === 0) {
        const allPositions = [];
        chordNotes.forEach(note => {
            const noteName = fretboard.extractNoteName(note);
            fretboard.findNotePositions(noteName).forEach(pos => {
                allPositions.push({
                    string: pos.string,
                    fret: pos.fret,
                    note: noteName,
                    intervalLabel: (intervalLabelMap && intervalLabelMap[noteName]) || '',
                    isRoot: areEnharmonicEquivalent(noteName, rootNoteName)
                });
            });
        });

        const grip = selectGripFromPositions(allPositions, 0);
        if (grip.length > 0) {
            assignFingers(grip);
            shapes.push({
                source: classifyFingeringSource(null),
                label: 'Best Effort',
                patternName: null,
                positions: grip
            });
        }
    }

    return shapes;
}

/**
 * Compute the text label to show on a fingering marker for the given label mode.
 * @param {Object} position
 * @param {'note'|'interval'|'finger'} labelMode
 * @returns {string}
 */
function getFingeringMarkerLabel(position, labelMode) {
    if (labelMode === 'finger') {
        if (position.finger === null || position.finger === undefined) {
            return '?';
        }
        return position.finger === 0 ? 'O' : String(position.finger);
    }
    if (labelMode === 'interval' && position.intervalLabel) {
        return position.intervalLabel;
    }
    return position.note || position.intervalLabel || '';
}

/**
 * Render a single chord shape's positions on the fretboard, styled to
 * distinguish predefined (known chordPatterns.js) shapes from best-effort
 * generated ones (solid vs. dashed marker border).
 * @param {Fretboard} fretboard
 * @param {Object} shape
 * @param {'note'|'interval'|'finger'} labelMode
 */
function renderFingeringShape(fretboard, shape, labelMode) {
    fretboard.clearMarkers();
    fretboard.clearChordLines();

    if (!shape || !Array.isArray(shape.positions)) {
        return;
    }

    const isPredefined = shape.source === 'predefined';
    const colorMap = ['#ff4444', '#ffcc44', '#44ff44', '#4444ff'];

    shape.positions.forEach((position, index) => {
        fretboard.markFret(position.string, position.fret, {
            backgroundColor: '#ffffff',
            borderColor: colorMap[index % colorMap.length],
            borderWidth: position.isRoot ? 4 : 3,
            borderStyle: isPredefined ? 'solid' : 'dashed',
            textColor: '#333333',
            size: position.isRoot ? 30 : 26,
            label: getFingeringMarkerLabel(position, labelMode),
            isRoot: position.isRoot,
            useCustomStyle: true,
            disableAnimation: true
        });
    });
}

/**
 * Clear the fingering shape state and hide the position-picker tab bar,
 * used whenever the fretboard stops showing a specific chord (scale view, clear).
 */
function clearFingeringTabs() {
    fretboardState.chordFingeringShapes = [];
    fretboardState.selectedFingeringTabIndex = 0;
    const container = document.getElementById('chord-fingering-tabs');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
    }
}

/**
 * Build/update the position-picker tab bar for the currently displayed chord.
 * @param {Fretboard} fretboard
 * @param {'note'|'interval'|'finger'} labelMode
 */
function renderFingeringTabs(fretboard, labelMode) {
    const container = document.getElementById('chord-fingering-tabs');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!fretboardState.chordFingeringShapes.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    const legendLabel = document.createElement('span');
    legendLabel.style.cssText = `
        font-size: 10px;
        color: #ccc;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-right: 4px;
    `;
    legendLabel.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:3px;">
            <span style="width:8px;height:8px;border-radius:50%;border:1px solid #ccc;display:inline-block;"></span>
            Known shape
        </span>
        <span style="display:inline-flex;align-items:center;gap:3px;">
            <span style="width:8px;height:8px;border-radius:50%;border:1px dashed #ccc;display:inline-block;"></span>
            Best effort
        </span>
    `;
    container.appendChild(legendLabel);

    fretboardState.chordFingeringShapes.forEach((shape, index) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.textContent = shape.label;
        tab.title = shape.source === 'predefined' ? `Known shape (${shape.patternName})` : 'Best-effort generated shape';
        const isActive = index === fretboardState.selectedFingeringTabIndex;
        tab.style.cssText = `
            padding: 4px 10px;
            font-size: 11px;
            border-radius: 4px;
            cursor: pointer;
            border: 1px ${shape.source === 'predefined' ? 'solid' : 'dashed'} ${isActive ? '#ffffff' : '#777'};
            background: ${isActive ? '#0056b3' : 'rgba(255,255,255,0.08)'};
            color: #fff;
        `;
        tab.addEventListener('click', () => {
            fretboardState.selectedFingeringTabIndex = index;
            renderFingeringShape(fretboard, fretboardState.chordFingeringShapes[index], labelMode);
            renderFingeringTabs(fretboard, labelMode);
        });
        container.appendChild(tab);
    });
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
        // Fallback to basic chord display
        const chordInfo = processChord(rootNote + chordType);
        if (chordInfo && chordInfo.notes) {
            highlightKeysForChords(chordInfo.notes);
        }
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