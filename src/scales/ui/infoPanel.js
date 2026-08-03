// The "Scale Information" panel: current scale's interval pattern, spelled
// notes, alternative names, a scale piano, an interval-color legend, and a
// per-degree triad/seventh chord card grid. Pure DOM construction driven by
// state.js's getPrimaryScale/getPrimaryRootNote and scaleData.js's
// HeptatonicScales/getScaleNotes - no state of its own.
//
// `intToRoman` (degree-number -> roman numeral for each chord card's
// heading) lives in ./scaleTable.js, not here - it has three call sites and
// only one is in this file, the other two are scaleTable.js's own.
//
// Split out of scaleGenerator.js as part of REFACTOR_PLAN.md Phase 4 (the
// scaleGenerator.js/scales.js -> src/scales/ half).

import { matchChord, buildStackedThirds, bumpOctave } from '../../theory/chords';
import { chords } from '../../theory/chordSuffixes';
import { createScalePiano, createIntervalPiano, getIntervalInfo, getSynthBaseOctave, DEFAULT_BASE_OCTAVE } from '../../components/MiniPiano/MiniPiano';
import { getPrimaryScale, getPrimaryRootNote } from '../state';
import { HeptatonicScales, getScaleNotes } from '../scaleData';
import { intToRoman } from './scaleTable';
import { pushChordPreview, bindPreviewSource } from '../../fretboard';

/**
 * `buildStackedThirds` plus a chord-name match per degree.
 *
 * The stacking itself moved to `theory/chords.js` once the degree hotkeys
 * needed it too (`src/degreeKeys.js`); only the naming is this panel's. It
 * uses `matchChord` directly rather than `identifySyntheticChords` because
 * that throws when a degree's stack matches no known chord type - some scales
 * (Blues Minor, say) don't yield "proper" named chords at every degree.
 * Callers treat an empty `matches` array as a synthetic (unnamed) chord and
 * fall back to showing just the root note.
 *
 * @param {Array<string>} scaleNotes - getScaleNotes() output (with octave; includes the trailing octave-duplicate root)
 * @param {number} length - 3 for triads, 4 for sevenths
 * @returns {Array<{ chord: string[], chordWithOctave: string[], scaleDegrees: number[], matches: string[] }>}
 */
function buildDegreeChords(scaleNotes, length) {
    return buildStackedThirds(scaleNotes, length).map(degree => ({
        ...degree,
        matches: matchChord(degree.chord, chords, false) || []
    }));
}

/**
 * Build one Triad or Seventh block (name/notes/intervals/scale-degrees +
 * its own mini piano) for a chord card. The mini piano is colored relative
 * to scaleRootNote (not the chord's own root) so a given scale tone is the
 * same color on every card and on the scale piano above them.
 *
 * **The whole block is a preview source.** Hovering (or tapping) it puts its
 * chord on the main fretboard/piano over the dimmed scale, which is what the
 * *sections* rather than the cards are the unit of: a card holds two
 * different chords, so the top half has to mean the triad and the bottom half
 * the seventh. The block includes its mini piano, so hovering the keys and
 * hovering the text beside them do the same thing rather than one of them
 * doing nothing.
 *
 * Pitch classes, not `chordWithOctave`: the same call
 * `pushChordPreview` makes for every other preview
 * (VISUALIZATION_STACK_PLAN.md section 6.6). Only a *selected* chord shows a
 * fingering's real octaves.
 *
 * @param {string} label - 'Triad' or 'Seventh'
 * @param {{ chord: string[], scaleDegrees: number[], matches: string[] }} chordInfo
 * @param {string} scaleRootNote
 * @returns {HTMLElement}
 */
function buildChordSection(label, chordInfo, scaleRootNote) {
    const chordRoot = chordInfo.chord[0];
    const chordName = `${chordRoot}${chordInfo.matches[0] || ''}`;
    const intervalLabels = chordInfo.chord.map(note => getIntervalInfo(chordRoot, note).label);

    const section = document.createElement('div');
    section.style.cssText = `margin: 6px 0; cursor: pointer;`;
    bindPreviewSource(section, () => {
        pushChordPreview(chordInfo.chord, chordRoot, chordName);
    });

    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: max-content 1fr;
        column-gap: 6px;
        row-gap: 2px;
        font-size: 11px;
        margin-bottom: 6px;
    `;
    [
        [`${label}:`, chordName],
        ['Notes:', `[${chordInfo.chord.join(', ')}]`],
        ['Intervals:', `[${intervalLabels.join(', ')}]`],
        ['Scale notes:', `[${chordInfo.scaleDegrees.join(', ')}]`]
    ].forEach(([labelText, valueText]) => {
        const labelCell = document.createElement('div');
        labelCell.textContent = labelText;
        labelCell.style.cssText = `text-align: right; opacity: 0.85; white-space: nowrap;`;
        const valueCell = document.createElement('div');
        valueCell.textContent = valueText;
        valueCell.style.cssText = `text-align: left;`;
        grid.appendChild(labelCell);
        grid.appendChild(valueCell);
    });
    section.appendChild(grid);

    try {
        const pianoSvg = createIntervalPiano({ notes: chordInfo.chordWithOctave, rootNote: scaleRootNote });
        if (pianoSvg) section.appendChild(pianoSvg);
    } catch (e) {
        console.warn(`Error creating ${label} chord piano:`, e);
    }

    return section;
}

function makeChordCardDivider() {
    const hr = document.createElement('hr');
    hr.style.cssText = `border: none; border-top: 1px solid rgba(255,255,255,0.15); margin: 6px 0;`;
    return hr;
}

function updateScaleInfoPanel() {
    const container = document.getElementById('scaleInfoPanel');
    if (!container) return;

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const primaryScale = getPrimaryScale();
    const rootNote = getPrimaryRootNote();
    if (!primaryScale || !rootNote) return;

    const [family, modeStr] = primaryScale.split('-');
    const modeNum = parseInt(modeStr, 10);
    const scaleData = HeptatonicScales[family] && HeptatonicScales[family][modeNum - 1];
    if (!scaleData) return;

    const panel = document.createElement('div');
    panel.style.cssText = `
        background: hsla(0, 0%, 24%, 1.00);
        border-radius: 8px;
        padding: 16px;
        color: #fff;
        margin-bottom: 16px;
    `;

    // Info column (heading, interval/notes text, scale piano, color legend)
    // and the chord cards sit side by side in contentRow below, instead of
    // the chord cards stacking underneath the info - keeps the panel from
    // growing so tall.
    const infoColumn = document.createElement('div');
    // flex-grow: 0 so this column hugs its own content width instead of
    // stretching to fill leftover row space (which pushed the chord cards
    // far to the right, reading as a big gap).
    infoColumn.style.cssText = `flex: 0 1 260px;`;

    const heading = document.createElement('h3');
    heading.textContent = `${rootNote} ${scaleData.name}`;
    heading.style.cssText = `margin: 0 0 8px 0; font-size: 20px;`;
    infoColumn.appendChild(heading);

    // getScaleNotes always anchors a scale's root to DEFAULT_BASE_OCTAVE
    // (see MiniPiano.js); shift every note by however far the synth's
    // selected octave (Z/X) has moved from that anchor, so the panel's
    // pianos - both the scale piano and every triad/seventh chord card -
    // track the synth's register instead of always sitting at the anchor.
    const octaveShift = getSynthBaseOctave() - DEFAULT_BASE_OCTAVE;
    const scaleNotes = getScaleNotes(rootNote, scaleData.intervals).map(note => bumpOctave(note, octaveShift));

    const intervalLine = document.createElement('div');
    intervalLine.innerHTML = `<strong>Interval:</strong> ${scaleData.intervals.join(' ')}`;
    intervalLine.style.cssText = `margin-bottom: 6px; font-size: 13px;`;
    infoColumn.appendChild(intervalLine);

    const scaleNotesLine = document.createElement('div');
    // Drop the trailing octave-duplicate root that getScaleNotes appends.
    const displayScaleNotes = scaleNotes.slice(0, -1).map(note => note.slice(0, -2));
    scaleNotesLine.innerHTML = `<strong>Scale Notes:</strong> ${displayScaleNotes.join(', ')}`;
    scaleNotesLine.style.cssText = `margin-bottom: 6px; font-size: 13px;`;
    infoColumn.appendChild(scaleNotesLine);

    if (scaleData.alternativeNames && scaleData.alternativeNames.length > 0) {
        const altDiv = document.createElement('div');
        altDiv.style.cssText = `margin-bottom: 10px; font-size: 13px;`;
        altDiv.innerHTML = `<strong>Alternative Names:</strong><br>${scaleData.alternativeNames.map(name => `• ${name}`).join('<br>')}`;
        infoColumn.appendChild(altDiv);
    }

    try {
        const pianoContainer = document.createElement('div');
        pianoContainer.style.cssText = `
            margin: 10px 0;
            padding: 8px;
            background: rgba(255,255,255,0.08);
            border-radius: 4px;
            display: inline-block;
        `;
        const pianoSvg = createScalePiano(scaleNotes, rootNote);
        if (pianoSvg) {
            pianoContainer.appendChild(pianoSvg);
            infoColumn.appendChild(pianoContainer);
        }
    } catch (e) {
        console.warn('Error creating scale info piano:', e);
    }

    // Legend mapping each scale tone to the interval color used on the
    // pianos above (and throughout the Scale Position Grid), so it's clear
    // what "the color of this key" means.
    try {
        const legendDiv = document.createElement('div');
        legendDiv.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
            margin: 8px 0 12px 0;
            font-size: 11px;
        `;

        const seenSemitones = new Set();
        scaleNotes.forEach(note => {
            const { semitone, label, color } = getIntervalInfo(rootNote, note);
            if (seenSemitones.has(semitone)) return;
            seenSemitones.add(semitone);

            const entry = document.createElement('span');
            entry.style.cssText = `display: inline-flex; align-items: center; gap: 4px;`;

            const swatch = document.createElement('span');
            swatch.style.cssText = `
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 3px;
                background: ${color};
                border: 1px solid rgba(255,255,255,0.4);
            `;
            entry.appendChild(swatch);

            const text = document.createElement('span');
            text.textContent = label;
            entry.appendChild(text);

            legendDiv.appendChild(entry);
        });

        infoColumn.appendChild(legendDiv);
    } catch (e) {
        console.warn('Error creating scale info color legend:', e);
    }

    const contentRow = document.createElement('div');
    contentRow.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 16px;
    `;
    contentRow.appendChild(infoColumn);
    panel.appendChild(contentRow);

    if (scaleData.intervals.length >= 3) {
        // Per-degree triad/seventh chord cards (name, notes, intervals, scale
        // degrees, and a mini piano for each), fully replacing the old plain-
        // text chord list. Chords are built via the same stacked-thirds
        // approach regardless of scale shape; when a degree's stack doesn't
        // match any known chord type (e.g. in Blues Minor), it's still shown
        // with its root note only and flagged as synthetic rather than
        // dropped, since it's still a usable chord tone grouping.
        const triadChords = buildDegreeChords(scaleNotes, 3);
        const seventhChords = buildDegreeChords(scaleNotes, 4);

        const chordCardsDiv = document.createElement('div');
        chordCardsDiv.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            align-content: flex-start;
            gap: 10px;
            flex: 2 1 120px;
        `;

        seventhChords.forEach((seventhInfo, degree) => {
            const triadInfo = triadChords[degree];
            const isSynthetic = triadInfo.matches.length === 0 || seventhInfo.matches.length === 0;
            const chordRootLetter = seventhInfo.chord[0];

            const chordCard = document.createElement('div');
            chordCard.style.cssText = `
                background: ${isSynthetic ? 'rgba(255,193,7,0.14)' : 'rgba(255,255,255,0.08)'};
                border: 1px solid ${isSynthetic ? 'rgba(255,193,7,0.4)' : 'rgba(255,255,255,0.12)'};
                border-radius: 6px;
                padding: 8px 10px;
                text-align: center;
                width: 200px;
            `;

            const heading = document.createElement('div');
            heading.textContent = `${intToRoman(degree + 1)}${isSynthetic ? ' (synthetic)' : ''} - ${chordRootLetter}`;
            heading.style.cssText = `font-size: 16px; font-weight: bold; margin-bottom: 4px;`;
            chordCard.appendChild(heading);

            chordCard.appendChild(makeChordCardDivider());
            chordCard.appendChild(buildChordSection('Triad', triadInfo, rootNote));
            chordCard.appendChild(makeChordCardDivider());
            chordCard.appendChild(buildChordSection('Seventh', seventhInfo, rootNote));

            chordCardsDiv.appendChild(chordCard);
        });
        contentRow.appendChild(chordCardsDiv);
    }

    container.appendChild(panel);
}

export { updateScaleInfoPanel };
