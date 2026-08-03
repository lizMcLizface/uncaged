// Builds the per-chord "card" in the progression display: the chord name/
// notes, optional mini piano/stave, the pattern-selector dropdown (which
// picks which fretboard voicing a chord uses), and the mini fretboard SVG
// that visualizes the selected pattern (with copy-as-PNG support). Tightly
// coupled internally - createChordElement calls createPatternSelector calls
// createMiniFretboardVisualization calls copySvgAsPng calls
// showNotification, plus lightenColor - so it's one file, not further
// split (REFACTOR_PLAN.md's Phase 4 investigation note).
//
// getChordDisplayName moved here rather than staying behind in
// progressionBuilder.js as the plan's investigation note originally
// expected: both of its remaining internal callers (inside
// createChordElement and createPatternSelector) are in this cluster, so
// after this move progressionBuilder.js would have had zero callers left -
// verified by grep before moving, the same "don't trust the plan's earlier
// snapshot once the surrounding code has moved" lesson ARCHITECTURE.md
// §6.15/§6.17 already applied once each. parse.js/playback.js's existing
// cross-imports of it are repointed here from progressionBuilder.js.
//
// updateProgressionDisplay is imported from src/progression/progressionList.js,
// where it moved in Phase 4 step 8. progressionList.js imports
// createChordElement back from this module, so - like getChordDisplayName
// above - it's a two-way import between two already-extracted modules, not
// with the progressionBuilder.js residual.
//
// window.processedProgression/window.polySynthRef here are the
// progression-sequencer-control surface ARCHITECTURE.md §5.1 documents as
// still live and unmigrated - untouched by this move, not this phase's job.
//
// Lifted from progressionBuilder.js as part of REFACTOR_PLAN.md Phase 4.

import { intervalToSemitones } from '../theory/chords';
import { CHROMATIC } from '../theory/notes';
import { stripOctave as notationStripOctave } from '../theory/notation';
import { getNoteAtStringFret } from '../tuning';
import { getPrimaryScale, getPrimaryRootNote, HeptatonicScales, getScaleNotes } from '../scales';
import { createChordPiano, createMixedPiano } from '../components/MiniPiano/MiniPiano';
import { createChordStave, createMixedStave } from '../components/MiniStave/MiniStave';
import { getChannel, isChannelEnabled } from '../audio/dispatch';
import { progressionState, MINI_FRETBOARD_CONFIG } from './state';
import { precomputePatternData } from './parse';
import {
    getProcessedChordNotes,
    getProcessedProgression,
    triggerChordProgression
} from './playback';
import { displaySingleChordPattern, displayAllChordPatterns } from './fretboardDisplay';
import { updateProgressionDisplay } from './progressionList';

/**
 * Copy an SVG element to the clipboard as a PNG image
 * @param {SVGElement} svgElement - The SVG element to convert and copy
 * @param {string} chordName - Name of the chord for the filename
 */
async function copySvgAsPng(svgElement, chordName = 'chord') {
    try {
        // Clone the SVG to avoid modifying the original
        const svgClone = svgElement.cloneNode(true);

        // Get SVG dimensions
        const svgRect = svgElement.getBoundingClientRect();
        const width = parseInt(svgElement.getAttribute('width')) || svgRect.width;
        const height = parseInt(svgElement.getAttribute('height')) || svgRect.height;

        // Create a canvas with higher resolution for better quality
        const scale = 2; // 2x resolution for crisp images
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        // Scale the context for higher resolution
        ctx.scale(scale, scale);

        // Set white background (SVGs are transparent by default)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        // Create image and draw to canvas
        const img = new Image();
        img.onload = async function() {
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(svgUrl);

            // Convert canvas to blob
            canvas.toBlob(async function(blob) {
                try {
                    // Copy to clipboard using the Clipboard API
                    if (navigator.clipboard && navigator.clipboard.write) {
                        const clipboardItem = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([clipboardItem]);

                        // Show success notification
                        showNotification(`${chordName} fretboard copied to clipboard as PNG!`, 'success');
                    } else {
                        // Fallback: create download link
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${chordName.replace(/[^a-z0-9]/gi, '_')}_fretboard.png`;
                        a.click();
                        URL.revokeObjectURL(url);

                        showNotification(`${chordName} fretboard downloaded as PNG (clipboard not supported)`, 'info');
                    }
                } catch (clipboardError) {
                    console.warn('Clipboard copy failed, falling back to download:', clipboardError);
                    // Fallback: create download link
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${chordName.replace(/[^a-z0-9]/gi, '_')}_fretboard.png`;
                    a.click();
                    URL.revokeObjectURL(url);

                    showNotification(`${chordName} fretboard downloaded as PNG`, 'info');
                }
            }, 'image/png');
        };

        img.onerror = function() {
            URL.revokeObjectURL(svgUrl);
            showNotification('Failed to convert fretboard to PNG', 'error');
        };

        img.src = svgUrl;

    } catch (error) {
        console.error('Error copying SVG as PNG:', error);
        showNotification('Failed to copy fretboard to clipboard', 'error');
    }
}

/**
 * Show a temporary notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('success', 'error', 'info')
 */
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.copy-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = message;

    const backgroundColor = {
        'success': '#4CAF50',
        'error': '#f44336',
        'info': '#2196F3'
    }[type] || '#2196F3';

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${backgroundColor};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideInRight 0.3s ease, slideOutRight 0.3s ease 2.7s;
        opacity: 1;
        pointer-events: none;
    `;

    // Add CSS animation keyframes if they don't exist
    if (!document.querySelector('#copy-notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'copy-notification-styles';
        styles.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(notification);

    // Remove notification after animation
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

/**
 * Lighten a hex color by a specified amount
 * @param {string} color - Hex color (e.g., '#ff0000')
 * @param {number} amount - Amount to lighten (0-1, where 1 is white)
 * @returns {string} Lightened hex color
 */
function lightenColor(color, amount) {
    const usePound = color[0] === '#';
    const col = usePound ? color.slice(1) : color;
    const num = parseInt(col, 16);
    let r = (num >> 16) + amount * (255 - (num >> 16));
    let g = ((num >> 8) & 0x00FF) + amount * (255 - ((num >> 8) & 0x00FF));
    let b = (num & 0x0000FF) + amount * (255 - (num & 0x0000FF));
    r = Math.min(255, Math.max(0, Math.round(r)));
    g = Math.min(255, Math.max(0, Math.round(g)));
    b = Math.min(255, Math.max(0, Math.round(b)));
    return (usePound ? '#' : '') + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/**
 * Create a mini fretboard visualization for a chord pattern
 * This shows a 5-fret vertical section with chord notes highlighted,
 * fret numbers above, and note names or intervals below.
 * @param {Object} pattern - Chord pattern with positions (may include interval data)
 * @param {Array} chordNotes - Array of chord note names
 * @param {string} chordName - Name of the chord for display and copying
 * @returns {HTMLElement} Mini fretboard wrapper element containing SVG
 */
function createMiniFretboardVisualization(pattern, chordNotes, chordName = 'Chord') {
    if (!pattern || !pattern.positions || pattern.positions.length === 0) {
        return null;
    }

    // Tab20 color palette


// P1 m3 M3 d5 P5 m7 M7
// 0 3 4 6 7 10 11
    const tab20Colors = [
        '#ff3888', // P1 [ 0 Semitones] *
        '#80b1d3', // m2 [ 1 Semitone ] *
        '#fdb462', // M2 [ 2 Semitones] *
        '#9049D4', // m3 [ 3 Semitones] *
        '#C949BF', // M3 [ 4 Semitones] *
        '#b3de69', // P4 [ 5 Semitones]
        '#F28983', // d5 [ 6 Semitones] *
        '#F6AA7E', // P5 [ 7 Semitones] *
        '#d9d9d9', // A5 [ 8 Semitones]
        '#ffffb3', // M6 [ 9 Semitones]
        '#F8CA82', // m7 [10 Semitones] *
        '#F0EA95'  // M7 [11 Semitones] *
    ];

    const config = MINI_FRETBOARD_CONFIG;
    const positions = pattern.positions;

    // Find the fret range for this pattern
    const minFret = Math.min(...positions.map(p => p.fret));
    const maxFret = Math.max(...positions.map(p => p.fret));
    const startFret = minFret; // Start from the actual minimum fret (could be 0)
    const endFret = Math.max(startFret + config.fretCount - 1, maxFret); // Ensure we show all pattern notes

    // Create SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', config.width + 10); // Add extra width padding
    svg.setAttribute('height', config.height + 30); // Extra space for labels
    svg.style.cssText = `
        display: block;
        margin: 0 auto 8px auto;
        background: rgba(0,0,0,0.1);
        border-radius: 4px;
        padding: 5px;
    `;

    // Calculate positions
    const stringSpacing = config.stringSpacing;
    const fretHeight = config.fretHeight;
    const startX = 20; // Increased left margin
    const startY = 20;

    // Draw fret lines (horizontal)
    for (let fret = 0; fret <= config.fretCount; fret++) {
        const y = startY + fret * fretHeight;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', startX);
        line.setAttribute('y1', y);
        line.setAttribute('x2', startX + (config.stringCount - 1) * stringSpacing);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', fret === 0 ? '#fff' : '#666'); // Nut is white, frets are gray
        line.setAttribute('stroke-width', fret === 0 ? '3' : '1');
        svg.appendChild(line);
    }

    // Draw string lines (vertical)
    for (let string = 0; string < config.stringCount; string++) {
        const x = startX + string * stringSpacing;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', x);
        line.setAttribute('y2', startY + config.fretCount * fretHeight);
        line.setAttribute('stroke', '#888');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }

    // Draw fret numbers to the left of the fretboard
    for (let fret = 1; fret <= config.fretCount; fret++) {
        // Calculate the actual fret number this position represents
        let actualFret;
        if (startFret === 0) {
            // For open chords, fret positions 1,2,3,4,5 represent actual frets 1,2,3,4,5
            actualFret = fret;
        } else {
            // For higher frets, adjust calculation
            actualFret = startFret + fret - 1;
        }

        if (actualFret >= 1) { // Only show fret numbers for actual frets (not open strings)
            const y = startY + (fret - 0.5) * fretHeight;

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', startX - 10); // Position to the left of the fretboard
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#ccc');
            text.setAttribute('font-size', config.fretNumberSize);
            text.setAttribute('font-family', 'monospace');
            text.textContent = actualFret;
            svg.appendChild(text);
        }
    }

    // Create maps to store notes and intervals for each string at the displayed frets
    const stringNotes = new Map();
    const stringIntervals = new Map();

    // Draw chord notes on the fretboard
    positions.forEach(position => {
        const { string: stringNum, fret } = position;

        // Convert to display index: highest string on the right, lowest on the left.
        // stringNum is 0-based (0=highest string), so reverse the display order.
        const stringIndex = config.stringCount - stringNum - 1;

        // Check if this fret is within our display range
        if (fret >= startFret && fret <= endFret) {
            const x = startX + stringIndex * stringSpacing;
            let y;

            if (fret === 0) {
                // Open string - place marker on the nut (fret 0 line)
                y = startY;

                // Add "0" label to the left for open strings
                const openLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                openLabel.setAttribute('x', startX - 10);
                openLabel.setAttribute('y', y);
                openLabel.setAttribute('text-anchor', 'middle');
                openLabel.setAttribute('dominant-baseline', 'middle');
                openLabel.setAttribute('fill', '#ccc');
                openLabel.setAttribute('font-size', config.fretNumberSize);
                openLabel.setAttribute('font-family', 'monospace');
                openLabel.textContent = '0';
                svg.appendChild(openLabel);
            } else {
                // Fretted note - place marker between frets
                // Calculate the display position based on the startFret context
                let displayFret;
                if (startFret === 0) {
                    // For open chords, fret N goes to display position N
                    displayFret = fret;
                } else {
                    // For higher frets, adjust calculation
                    displayFret = fret - startFret + 1;
                }
                y = startY + (displayFret - 0.5) * fretHeight;
            }

            // Calculate the note name for this position
            const noteAtFret = getNoteAtStringFret(stringNum, fret);
            const strippedNote = noteAtFret ? noteAtFret.letter : '';


            // Store note for this string
            stringNotes.set(stringIndex, strippedNote);

            // Store interval for this string (if available from the pattern)
            if (position.interval) {
                stringIntervals.set(stringIndex, position.interval);
            }

            // Determine if this is a root note
            const isRootNote = chordNotes.length > 0 && strippedNote === chordNotes[0];

            // Calculate color based on semitone distance from root
            let circleColor = '#4CAF50'; // Default color

            if (isRootNote) {
                // Root note maps to index 7 with the offset system
                // (0 semitones + 7 offset) % 20 = 7
                circleColor = tab20Colors[0];
            } else if (position.interval) {
                // Use interval to calculate semitone distance
                try {
                    const semitones = intervalToSemitones(position.interval);
                    // Apply offset of 7 and modulo to map to tab20 colors
                    const colorIndex = (semitones) % tab20Colors.length;
                    circleColor = tab20Colors[colorIndex];
                } catch (error) {
                    console.warn('Could not calculate semitones for interval:', position.interval, error);
                    // Fallback: if we can't calculate interval, try to calculate from note names
                    if (chordNotes.length > 0) {
                        const rootNote = chordNotes[0];
                        // Simple semitone calculation (basic chromatic distance)
                        const chromaticNotes = CHROMATIC;
                        const rootIndex = chromaticNotes.indexOf(rootNote);
                        const noteIndex = chromaticNotes.indexOf(strippedNote);
                        if (rootIndex !== -1 && noteIndex !== -1) {
                            const semitones = (noteIndex - rootIndex + 12) % 12;
                            const colorIndex = (semitones) % tab20Colors.length;
                            circleColor = tab20Colors[colorIndex];
                        }
                    }
                }
            } else if (chordNotes.length > 0) {
                // Fallback: calculate from note names if no interval data
                const rootNote = chordNotes[0];
                const chromaticNotes = CHROMATIC;
                const rootIndex = chromaticNotes.indexOf(rootNote);
                const noteIndex = chromaticNotes.indexOf(strippedNote);
                if (rootIndex !== -1 && noteIndex !== -1) {
                    const semitones = (noteIndex - rootIndex + 12) % 12;
                    const colorIndex = (semitones + 7) % 20;
                    circleColor = tab20Colors[colorIndex];
                }
            }

            // Draw note circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', config.noteRadius);
            circle.setAttribute('fill', circleColor);
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '1');
            svg.appendChild(circle);
        }
    });

    // Draw arpeggiation notes if toggle is enabled
    if (progressionState.showArpeggiationNotes && pattern.arpeggiationNotes && pattern.arpeggiationNotes.length > 0) {
        pattern.arpeggiationNotes.forEach(arpNote => {
            const { string: stringNum, fret, note, interval } = arpNote;

            // Convert to display index: same logic as pattern notes
            const stringIndex = config.stringCount - stringNum - 1;

            // Check if this fret is within our display range
            if (fret >= startFret && fret <= endFret) {
                const x = startX + stringIndex * stringSpacing;
                let y;

                if (fret === 0) {
                    // Open string - place marker on the nut
                    y = startY;
                } else {
                    // Fretted note - place marker between frets
                    let displayFret;
                    if (startFret === 0) {
                        displayFret = fret;
                    } else {
                        displayFret = fret - startFret + 1;
                    }
                    y = startY + (displayFret - 0.5) * fretHeight;
                }

                // Calculate color for arpeggiation note (same logic as pattern notes but lightened)
                let baseColor = '#4CAF50'; // Default color

                const isRootNote = chordNotes.length > 0 && note === chordNotes[0];

                if (isRootNote) {
                    baseColor = tab20Colors[0];
                } else if (interval && interval !== '?') {
                    // Use interval to calculate color
                    try {
                        const semitones = intervalToSemitones(interval);
                        const colorIndex = (semitones) % tab20Colors.length;
                        baseColor = tab20Colors[colorIndex];
                    } catch (error) {
                        // Fallback to note-based calculation
                        if (chordNotes.length > 0) {
                            const rootNote = chordNotes[0];
                            const chromaticNotes = CHROMATIC;
                            const rootIndex = chromaticNotes.indexOf(rootNote);
                            const noteIndex = chromaticNotes.indexOf(note);
                            if (rootIndex !== -1 && noteIndex !== -1) {
                                const semitones = (noteIndex - rootIndex + 12) % 12;
                                const colorIndex = (semitones) % tab20Colors.length;
                                baseColor = tab20Colors[colorIndex];
                            }
                        }
                    }
                } else if (chordNotes.length > 0) {
                    // Fallback: calculate from note names
                    const rootNote = chordNotes[0];
                    const chromaticNotes = CHROMATIC;
                    const rootIndex = chromaticNotes.indexOf(rootNote);
                    const noteIndex = chromaticNotes.indexOf(note);
                    if (rootIndex !== -1 && noteIndex !== -1) {
                        const semitones = (noteIndex - rootIndex + 12) % 12;
                        const colorIndex = (semitones) % tab20Colors.length;
                        baseColor = tab20Colors[colorIndex];
                    }
                }

                // Lighten the color for arpeggiation notes
                const arpeggiationColor = lightenColor(baseColor, 0.4);

                // Draw arpeggiation note circle (slightly smaller and with dashed border)
                const arpCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                arpCircle.setAttribute('cx', x);
                arpCircle.setAttribute('cy', y);
                arpCircle.setAttribute('r', config.noteRadius * 0.8); // Slightly smaller
                arpCircle.setAttribute('fill', arpeggiationColor);
                arpCircle.setAttribute('stroke', '#fff');
                arpCircle.setAttribute('stroke-width', '1');
                arpCircle.setAttribute('stroke-dasharray', '2,2'); // Dashed border to distinguish from pattern notes
                arpCircle.setAttribute('opacity', '0.8'); // Slightly transparent
                svg.appendChild(arpCircle);

                // Store arpeggiation note for display below fretboard
                // if (progressionState.showFretboardIntervals && interval && interval !== '?') {
                //     stringIntervals.set(stringIndex, interval);
                // } else {
                //     stringNotes.set(stringIndex, note);
                // }
            }
        });
    }

    // Draw note names or intervals below the fretboard
    for (let stringIndex = 0; stringIndex < config.stringCount; stringIndex++) {
        const x = startX + stringIndex * stringSpacing;
        const y = startY + config.fretCount * fretHeight + 15;

        let displayText = '';
        if (progressionState.showFretboardIntervals && stringIntervals.has(stringIndex)) {
            // Show interval if intervals toggle is enabled and we have interval data
            displayText = stringIntervals.get(stringIndex);
        } else if (stringNotes.has(stringIndex)) {
            // Show note name as fallback or when intervals are disabled
            displayText = stringNotes.get(stringIndex);
        }

        if (displayText) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', config.noteNameSize);
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('font-weight', 'bold');
            text.textContent = displayText;
            svg.appendChild(text);
        }
    }

    // Create a wrapper container for the SVG with copy functionality
    const wrapper = document.createElement('div');
    wrapper.className = 'mini-fretboard-wrapper';
    wrapper.style.cssText = `
        position: relative;
        display: inline-block;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s ease;
    `;

    // Add hover effect
    wrapper.addEventListener('mouseenter', () => {
        wrapper.style.transform = 'scale(1.02)';
        wrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    });

    wrapper.addEventListener('mouseleave', () => {
        wrapper.style.transform = 'scale(1)';
        wrapper.style.boxShadow = 'none';
    });

    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'mini-fretboard-copy-btn';
    copyButton.innerHTML = '📋';
    copyButton.title = 'Copy fretboard as PNG';
    copyButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 4px;
        width: 24px;
        height: 24px;
        font-size: 12px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Show/hide copy button on hover
    wrapper.addEventListener('mouseenter', () => {
        copyButton.style.opacity = '1';
    });

    wrapper.addEventListener('mouseleave', () => {
        copyButton.style.opacity = '0';
    });

    // Handle copy button click
    copyButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        copySvgAsPng(svg, chordName);
    });

    // Handle right-click on the wrapper
    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Prevent default context menu
        copySvgAsPng(svg, chordName);
    });

    // Add click handler for the entire wrapper as well
    wrapper.addEventListener('click', (e) => {
        // Only handle click if it's not on the copy button
        if (e.target !== copyButton) {
            copySvgAsPng(svg, chordName);
        }
    });

    wrapper.appendChild(svg);
    wrapper.appendChild(copyButton);

    return wrapper;
}

/**
 * Create a visual element for a single chord
 * @param {Object} chord - Chord data
 * @param {number} index - Index in progression
 * @returns {HTMLElement} Chord element
 */
function createChordElement(chord, index) {
    const element = document.createElement('div');
    element.className = 'chord-element';

    // Determine border color based on chord status
    let borderColor = '#666'; // Default
    if (chord.isInvalid) {
        borderColor = '#ff4444'; // Red for invalid chords
    } else if (chord.isFallback) {
        borderColor = '#ffaa00'; // Orange for fallback resolution
    }

    element.style.cssText = `
        background: #444;
        border: 2px solid ${borderColor};
        border-radius: 8px;
        padding: 15px;
        min-width: 120px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
    `;

    // Add status indicator if needed
    if (chord.isInvalid || chord.isFallback) {
        const statusIndicator = document.createElement('div');
        statusIndicator.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: ${chord.isInvalid ? '#ff4444' : '#ffaa00'};
        `;
        statusIndicator.title = chord.isInvalid ?
            'Chord could not be resolved in current scale' :
            'Chord resolved using fallback (scale may not be fully defined)';
        element.appendChild(statusIndicator);
    }

    // Create chord name display
    const chordName = document.createElement('div');
    chordName.className = 'chord-name';
    const displayName = getChordDisplayName(chord, index);
    chordName.textContent = displayName;
    chordName.style.cssText = `
        font-size: 18px;
        font-weight: bold;
        color: ${chord.isInvalid ? '#ff9999' : '#fff'};
        text-align: center;
        margin-bottom: 8px;
    `;
    element.appendChild(chordName);

    // Create chord info display
    if (chord.chordInfo && chord.chordInfo.notes) {
        const notesDisplay = document.createElement('div');
        notesDisplay.className = 'chord-notes';
        const notes = chord.chordInfo.notes.map(note => notationStripOctave(note));
        notesDisplay.textContent = notes.join(' - ');
        notesDisplay.style.cssText = `
            font-size: 12px;
            color: ${chord.isInvalid ? '#ff9999' : '#ccc'};
            text-align: center;
            margin-bottom: 10px;
        `;
        element.appendChild(notesDisplay);

        // Add mini piano visualization if enabled
        if (progressionState.showMiniPianos) {
            const scaleToggleCheckbox = document.getElementById('chord-progression-scale-toggle');
            const showScaleContext = scaleToggleCheckbox && scaleToggleCheckbox.checked;

            let miniPiano;
            if (showScaleContext) {
                // Get current scale notes for context
                const primaryScaleId = getPrimaryScale();
                const primaryRoot = getPrimaryRootNote();
                if (primaryScaleId && primaryRoot) {
                    try {
                        // Parse the scale ID to get family and mode
                        const [family, mode] = primaryScaleId.split('-');
                        const scales = HeptatonicScales;
                        if (scales[family] && scales[family][parseInt(mode, 10) - 1]) {
                            const intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                            const scaleNotes = getScaleNotes(primaryRoot, intervals);
                            const scaleNotesNoOctave = scaleNotes.map(note => notationStripOctave(note));

                            // Create mixed piano showing both chord and scale
                            miniPiano = createMixedPiano(notes, scaleNotesNoOctave, notes[0]);
                        } else {
                            // Fallback to chord-only display if scale data is invalid
                            miniPiano = createChordPiano(notes, notes[0]);
                        }
                    } catch (error) {
                        console.warn('Error getting scale notes for mini piano:', error);
                        // Fallback to chord-only display
                        miniPiano = createChordPiano(notes, notes[0]);
                    }
                } else {
                    // Fallback to chord-only display
                    miniPiano = createChordPiano(notes, notes[0]);
                }
            } else {
                // Show chord only
                miniPiano = createChordPiano(notes, notes[0]);
            }

            if (miniPiano) {
                miniPiano.style.cssText = `
                    margin: 8px auto;
                `;
                element.appendChild(miniPiano);
            }
        }

        // Add mini stave visualization if enabled
        if (progressionState.showMiniStaves) {
            // Choose notes based on theory mode
            let notesToUse;
            let theoreticalNotes = null; // For enharmonic correction reference

            if (progressionState.staveTheoryMode) {
                // Theory mode: use chord theory notes in 4th octave
                if (chord.chordInfo && chord.chordInfo.notes) {
                    theoreticalNotes = chord.chordInfo.notes; // Keep original theory notes for reference
                    notesToUse = chord.chordInfo.notes.map(note => {
                        const cleanNote = notationStripOctave(note);
                        return cleanNote + '4'; // Force 4th octave for theory
                    });
                } else {
                    notesToUse = [];
                }
            } else {
                // Fretboard mode: use actual fretboard notes with their octaves
                notesToUse = getProcessedChordNotes(chord, index);
                // Also get theoretical notes for enharmonic correction if available
                if (chord.chordInfo && chord.chordInfo.notes) {
                    theoreticalNotes = chord.chordInfo.notes;
                }
            }

            // Create version without octaves for scale mixing
            const notesNoOctave = notesToUse.map(note => notationStripOctave(note));

            // Get current scale notes for enharmonic correction
            let currentScaleNotes = null;
            const primaryScaleId = getPrimaryScale();
            const primaryRoot = getPrimaryRootNote();
            if (primaryScaleId && primaryRoot) {
                try {
                    const [family, mode] = primaryScaleId.split('-');
                    const scales = HeptatonicScales;
                    if (scales[family] && scales[family][parseInt(mode, 10) - 1]) {
                        const intervals = scales[family][parseInt(mode, 10) - 1].intervals;
                        currentScaleNotes = getScaleNotes(primaryRoot, intervals);
                    }
                } catch (error) {
                    console.warn('Error getting scale notes for enharmonic correction:', error);
                }
            }

            const scaleToggleCheckbox = document.getElementById('chord-progression-scale-toggle');
            const showScaleContext = scaleToggleCheckbox && scaleToggleCheckbox.checked;

            let miniStave;
            if (showScaleContext) {
                // Get current scale notes for context
                if (primaryScaleId && primaryRoot && currentScaleNotes) {
                    try {
                        const scaleNotesNoOctave = currentScaleNotes.map(note => notationStripOctave(note));

                        // Create mixed stave showing both chord and scale
                        miniStave = createMixedStave(notesNoOctave, scaleNotesNoOctave, notesNoOctave[0] || notes[0], progressionState.staveKey, theoreticalNotes);
                    } catch (error) {
                        console.warn('Error creating mixed stave:', error);
                        // Fallback to chord-only display
                        miniStave = createChordStave(notesToUse, notesToUse[0] || notes[0], progressionState.staveKey, theoreticalNotes, currentScaleNotes);
                    }
                } else {
                    // Fallback to chord-only display
                    miniStave = createChordStave(notesToUse, notesToUse[0] || notes[0], progressionState.staveKey, theoreticalNotes, currentScaleNotes);
                }
            } else {
                // Show chord only
                miniStave = createChordStave(notesToUse, notesToUse[0] || notes[0], progressionState.staveKey, theoreticalNotes, currentScaleNotes);
            }

            if (miniStave) {
                // Create a wrapper container for better positioning
                const miniStaveWrapper = document.createElement('div');
                miniStaveWrapper.style.cssText = `
                    margin: 8px auto;
                    position: relative;
                    z-index: 10;
                    background: white;
                    border-radius: 6px;
                    padding: 4px;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
                    border: 1px solid #ccc;
                `;
                miniStaveWrapper.appendChild(miniStave);
                element.appendChild(miniStaveWrapper);
            }
        }
    } else {
        // Show error message for invalid chords
        const errorDisplay = document.createElement('div');
        errorDisplay.textContent = 'Could not resolve chord';
        errorDisplay.style.cssText = `
            font-size: 12px;
            color: #ff9999;
            text-align: center;
            margin-bottom: 10px;
            font-style: italic;
        `;
        element.appendChild(errorDisplay);
    }

    // Create pattern selector (only if chord is valid)
    if (!chord.isInvalid && chord.chordInfo) {
        const patternSelector = createPatternSelector(chord, index);
        element.appendChild(patternSelector);
    }

    // Add hover effects with dynamic highlighting
    element.addEventListener('mouseenter', () => {
        if (!chord.isInvalid) {
            element.style.borderColor = '#4CAF50';
            element.style.background = '#555';
            progressionState.hoveredChordIndex = index;
            displaySingleChordPattern(chord, index, true); // Highlight when hovered
        }
    });

    element.addEventListener('mouseleave', () => {
        element.style.borderColor = borderColor; // Restore original border color
        element.style.background = '#444';
        progressionState.hoveredChordIndex = null;
        displayAllChordPatterns();
    });

    // Add click handler for chord triggering
    element.addEventListener('click', () => {
        if (!chord.isInvalid && isChannelEnabled('synth') && getChannel('synth')) {
            triggerChordProgression(chord, index);

            // Visual feedback for click
            element.style.background = '#4CAF50';
            setTimeout(() => {
                element.style.background = progressionState.hoveredChordIndex === index ? '#555' : '#444';
            }, 200);
        }
    });

    return element;
}

/**
 * Get display name for a chord
 * @param {Object} chord - Chord data
 * @returns {string} Display name
 */
function getChordDisplayName(chord, chordIndex = null) {
    let baseName;
    if (chord.type === 'roman') {
        if (chord.resolvedRoot && chord.resolvedChordType) {
            baseName = `${chord.originalToken} (${chord.resolvedRoot}${chord.resolvedChordType})`;
        } else {
            baseName = chord.originalToken;
        }
    } else {
        baseName = chord.originalToken;
    }

    // If a default pattern was specified and it's still the currently selected pattern,
    // include it in the display name
    if (chord.defaultPatternIndex !== undefined && chordIndex !== null) {
        const currentSelectedPattern = progressionState.selectedPatternIndexes.get(chordIndex);
        const isStillDefaultPattern = currentSelectedPattern === chord.defaultPatternIndex;

        if (isStillDefaultPattern) {
            return `${baseName.replace(/-\d+$/, '')} [Pattern ${chord.defaultPatternIndex + 1}]`;
        }
    }

    return baseName.replace(/-\d+$/, ''); // Remove pattern notation from display
}

/**
 * Create pattern selector dropdown for a chord
 * @param {Object} chord - Chord data
 * @param {number} index - Chord index
 * @returns {HTMLElement} Pattern selector element
 */
function createPatternSelector(chord, index) {
    const container = document.createElement('div');
    container.className = 'pattern-selector-container';

    // Use precomputed pattern data if available
    let patternData = progressionState.precomputedPatternData.get(index);
    if (!patternData || !patternData.chord || patternData.chord !== chord) {
        // Fallback to computing on demand, or recompute if chord has changed
        patternData = precomputePatternData(chord, index);
        progressionState.precomputedPatternData.set(index, patternData);
    }

    const { patterns } = patternData;

    if (patterns.length === 0) {
        const noPatterns = document.createElement('div');
        noPatterns.textContent = 'No patterns found';
        noPatterns.style.cssText = `
            font-size: 11px;
            color: #999;
            text-align: center;
        `;
        container.appendChild(noPatterns);
        return container;
    }

    // Create mini fretboard visualization container (will be populated later)
    let miniFretboardContainer = null;
    if (progressionState.showMiniFretboards) {
        miniFretboardContainer = document.createElement('div');
        miniFretboardContainer.className = 'mini-fretboard-container';
        miniFretboardContainer.style.cssText = `
            margin-bottom: 8px;
            text-align: center;
        `;
        container.appendChild(miniFretboardContainer);
    }

    // Create main container for the pattern selector
    const selectorContainer = document.createElement('div');
    selectorContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 2px;
        width: 100%;
    `;

    // Create previous pattern button
    const prevButton = document.createElement('button');
    prevButton.textContent = '−';
    prevButton.style.cssText = `
        width: 18px;
        height: 24px;
        padding: 0;
        border: 1px solid #666;
        border-radius: 3px;
        background: #444;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    `;
    prevButton.title = 'Previous pattern';

    // Create dropdown
    const select = document.createElement('select');
    select.className = 'pattern-selector';
    select.style.cssText = `
        flex: 1;
        padding: 4px;
        font-size: 11px;
        border: 1px solid #666;
        border-radius: 3px;
        background: #333;
        color: #fff;
        min-width: 0;
    `;

    // Create next pattern button
    const nextButton = document.createElement('button');
    nextButton.textContent = '+';
    nextButton.style.cssText = `
        width: 18px;
        height: 24px;
        padding: 0;
        border: 1px solid #666;
        border-radius: 3px;
        background: #444;
        color: #fff;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    `;
    nextButton.title = 'Next pattern';
    // console.log(`Patterns: ${JSON.stringify(patterns)}`);

    // Function to update button states
    const updateButtonStates = () => {
        const currentIndex = parseInt(select.value) || 0;
        const isFirst = currentIndex <= 0;
        const isLast = currentIndex >= patterns.length - 1;

        prevButton.disabled = isFirst;
        nextButton.disabled = isLast;

        // Style disabled buttons
        [prevButton, nextButton].forEach(btn => {
            if (btn.disabled) {
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
    };

    // Function to change pattern selection
    const changePattern = (direction) => {
        const currentIndex = parseInt(select.value) || 0;
        let newIndex = currentIndex + direction;

        // Clamp to valid range
        newIndex = Math.max(0, Math.min(patterns.length - 1, newIndex));

        if (newIndex !== currentIndex) {
            select.value = newIndex;
            // Trigger change event
            select.dispatchEvent(new Event('change'));
        }
    };

    // Function to update mini fretboard visualization
    const updateMiniFretboard = () => {
        if (!progressionState.showMiniFretboards || !miniFretboardContainer) return;

        const patternIndex = parseInt(select.value) || 0;
        if (patternIndex >= patterns.length) return;

        const pattern = patterns[patternIndex];
        const { chordNotes } = patternData;
        const chordName = getChordDisplayName(chord, index);
        console.log(`Updating mini fretboard for pattern ${patternIndex}:`, pattern, chordNotes);

        // Clear existing mini fretboard
        miniFretboardContainer.innerHTML = '';

        // Create new mini fretboard
        const miniFretboard = createMiniFretboardVisualization(pattern, chordNotes, chordName);
        if (miniFretboard) {
            miniFretboardContainer.appendChild(miniFretboard);
        }
    };

    // Add pattern options with improved naming
    patterns.forEach((pattern, patternIndex) => {
        const option = document.createElement('option');
        option.value = patternIndex;

        const minFret = Math.min(...pattern.positions.map(p => p.fret));
        const maxFret = Math.max(...pattern.positions.map(p => p.fret));
        const fretSpan = maxFret - minFret;

        // Create descriptive pattern name
        let patternName = `Fret ${minFret}`;
        if (fretSpan > 0) {
            patternName += `-${maxFret}`;
        }

        // Add pattern type if available
        if (pattern.name) {
            patternName += ` (${pattern.name})`;
        } else {
            patternName += ` (${pattern.positions.length} notes)`;
        }

        option.textContent = patternName;
        select.appendChild(option);
    });

    // Set initial selection
    const initialSelection = progressionState.selectedPatternIndexes.get(index) ?? 0;
    select.value = initialSelection;

    // Ensure the initial selection is stored in the map if not already present
    if (!progressionState.selectedPatternIndexes.has(index)) {
        progressionState.selectedPatternIndexes.set(index, initialSelection);
    }

    // Add change event listener with improved highlighting
    select.addEventListener('change', (e) => {
        const patternIndex = parseInt(e.target.value);
        progressionState.selectedPatternIndexes.set(index, patternIndex);

        console.log(`🎯 Pattern selected for chord ${index}: pattern ${patternIndex} (${patterns[patternIndex]?.name || 'Unknown'})`);
        console.log('Updated progressionState.selectedPatternIndexes Map:', progressionState.selectedPatternIndexes);

        // Invalidate cached pattern data to force display name update
        progressionState.precomputedPatternData.delete(index);

        // Update button states
        updateButtonStates();

        // Update mini fretboard visualization
        updateMiniFretboard();

        // Update the chord name display to reflect pattern change
        updateProgressionDisplay();

        // Update processed progression for sequencer
        window.processedProgression = getProcessedProgression();

        // If sequencer is running, update it with the new processed progression
        if (window.polySynthRef && window.polySynthRef.getProgressionSequencerState) {
            const state = window.polySynthRef.getProgressionSequencerState();
            if (state.playing && window.polySynthRef.updateProgressionSettings) {
                window.polySynthRef.updateProgressionSettings(window.processedProgression);
                console.log('🔄 Updated running sequencer with new pattern selection');
            }
        }

        // Add subtle visual feedback to the dropdown itself
        select.style.background = '#4CAF50';
        select.style.transition = 'background 0.3s ease';
        setTimeout(() => {
            select.style.background = '#333';
        }, 300);

        // Immediately update the display without temporary highlighting to avoid conflicts
        if (progressionState.hoveredChordIndex === index) {
            // If this chord is currently hovered, show it highlighted
            displaySingleChordPattern(chord, index, true);
        } else if (progressionState.hoveredChordIndex === null) {
            // If no chord is hovered, show all patterns
            displayAllChordPatterns();
        } else {
            // If another chord is hovered, show that one
            displaySingleChordPattern(progressionState.currentProgression[progressionState.hoveredChordIndex], progressionState.hoveredChordIndex, true);
        }
    });

    // Add button event listeners
    prevButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changePattern(-1);
    });

    nextButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        changePattern(1);
    });

    // Initial button state update
    updateButtonStates();

    // Assemble the selector container
    selectorContainer.appendChild(prevButton);
    selectorContainer.appendChild(select);
    selectorContainer.appendChild(nextButton);

    container.appendChild(selectorContainer);

    // Initialize mini fretboard visualization
    updateMiniFretboard();

    return container;
}

export {
    createChordElement,
    getChordDisplayName
};
