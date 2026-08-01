// The persistent top bar (title + instrument/tuning picker), the tabbed
// panel shell, the hotkey footer, and the "Other Controls" tab's button
// panel - the pieces of frets.js that build UI chrome around a Fretboard
// instance rather than the fretboard itself, its geometry, its markers, or
// its patterns (those are ../geometry.js, ../markers.js, ../patterns.js,
// ../Fretboard.js).
//
// createFretboardControls is the entry point (called once, from
// initializeFretboard() in frets.js): it builds the "Other Controls" panel,
// the top bar, and the full tabbed layout (Scale Information / Chord
// Progression / Scale Position Grid / Scale Selection / Other Controls /
// Synthesizer), then wires in the chord grid and scale position grid, both
// their own ui/*.js modules by this point.
//
// This creates a two-way import between this file and frets.js: frets.js
// imports createFretboardControls from here, and the button handlers below
// import glue functions (showChordOnFretboard, showChordPatternOnFretboard,
// restoreFretboardState, updateChordButtonStyles, updateChordInfoDisplay)
// back from frets.js. This is safe the same way the pre-existing chords.js
// <-> theory/chords.js cycle is (see ARCHITECTURE.md §6.1): every
// cross-import here is only touched inside a function body invoked later (a
// click handler or initializeFretboard() itself), never at module
// top-level, so neither module needs the other to have finished evaluating
// first.
//
// Lifted from src/frets.js as part of REFACTOR_PLAN.md Phase 3, step 6/8
// (chordGrid.js import added in step 7/8, scalePositionGrid.js in step 8/8).

import { fretboardState } from '../state';
import { addInteractiveEvent } from '../Fretboard';
import { HeptatonicScales, getScaleNotes } from '../../scales';
import { getPrimaryScale, getPrimaryRootNote } from '../../scaleGenerator';
import {
    getPresets as getInstrumentPresets,
    getActiveConfig as getActiveInstrumentConfig,
    setActiveConfig as setActiveInstrumentConfig
} from '../../tuning';
import { createChordProgressionUI, loadSharedStateFromURL } from '../../progressionBuilder';
import {
    showChordOnFretboard,
    showScaleOnFretboard,
    showChordPatternOnFretboard,
    restoreFretboardState,
    updateChordButtonStyles,
    updateChordInfoDisplay
} from '../../frets';
import {
    clearFingeringTabs,
    createChordButtonGrid,
    updateChordGridColors
} from './chordGrid';
import { createScalePositionGrid, renderScalePositionGrid } from './scalePositionGrid';

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

// The button/demo groups below are exactly what createFretboardControls used
// to build inline, split one function per source comment-delimited group so
// the 1,137-line original isn't moved as one function (REFACTOR_PLAN.md
// Phase 3). Most of these groups are dead code that predates this phase:
// buildDisplayControls, buildNoteMarkingControls, buildNoteSearchControls and
// buildChordPatternDemoControls all build buttons that are never appended to
// `controlsContainer` (the appendChild calls for them are commented out at
// the original call site) - kept exactly as inert as they already were,
// since removing them is a dead-code cleanup this phase doesn't call for.
// Only buildDisplayControls' clearButton/showAllButton and everything
// buildChordVisualizationControls returns are actually live.

function buildDisplayControls(fretboard, buttonStyle, buttonHoverStyle) {
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

    return { clearButton, showAllButton };
}

function buildNoteMarkingControls(fretboard, buttonStyle, buttonHoverStyle) {
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

    noteInputContainer.appendChild(noteInput);
    noteInputContainer.appendChild(markNoteButton);

    return noteInputContainer;
}

function buildNoteSearchControls(fretboard, buttonStyle, buttonHoverStyle) {
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

    return noteSearchContainer;
}

function buildChordVisualizationControls(fretboard) {
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

    return { chordControlsContainer, chordInfoContainer, fingeringTabsContainer };
}

function buildChordPatternDemoControls(fretboard, buttonStyle, buttonHoverStyle) {
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

    return patternDemoContainer;
}

/**
 * Build the "Other Controls" tab content: highlight/clear buttons, the
 * chord-type/label-mode/roman-numeral row, the chord info display and
 * fingering tabs, plus several dead demo-button groups kept for parity with
 * the original (see the comment above buildDisplayControls).
 */
function buildOtherControlsPanel(fretboard) {
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

    const { clearButton, showAllButton } = buildDisplayControls(fretboard, buttonStyle, buttonHoverStyle);
    // Built for parity with the original inline code but never appended below
    // (matches the original's commented-out appendChild calls) - see the
    // comment above buildDisplayControls.
    buildNoteMarkingControls(fretboard, buttonStyle, buttonHoverStyle);
    buildNoteSearchControls(fretboard, buttonStyle, buttonHoverStyle);
    const { chordControlsContainer, chordInfoContainer, fingeringTabsContainer } = buildChordVisualizationControls(fretboard);
    buildChordPatternDemoControls(fretboard, buttonStyle, buttonHoverStyle);

    controlsContainer.appendChild(clearButton);
    controlsContainer.appendChild(showAllButton);
    // controlsContainer.appendChild(showScaleButton);
    controlsContainer.appendChild(chordControlsContainer);
    controlsContainer.appendChild(chordInfoContainer);
    controlsContainer.appendChild(fingeringTabsContainer);

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

    return controlsContainer;
}

/**
 * Create control buttons for the fretboard
 */
function createFretboardControls(fretboard) {
    const controlsContainer = buildOtherControlsPanel(fretboard);

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

export { createFretboardControls };
