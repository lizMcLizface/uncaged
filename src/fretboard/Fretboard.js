/**
 * The Fretboard class - DOM rendering for one guitar fretboard instance:
 * building the neck/fret grid, marking notes/scales/chords, drawing
 * subscale boxes and chord-shape lines, and the CAGED/fingering display
 * methods that render what src/fretboard/patterns.js matches.
 *
 * Geometry math, marker-shape drawing and pattern matching were already
 * extracted (REFACTOR_PLAN.md Phase 3) into geometry.js/markers.js/
 * patterns.js; this class keeps thin same-named delegate methods to each,
 * so its public API (and the Phase 0 characterization tests that call
 * calculateNote/calculateChordPatternPositions/findChordPatternMatches as
 * instance methods) is unchanged.
 *
 * GUITAR_TUNING/FRET_COUNT (constructor defaults) and DEFAULT_COLORS
 * (fallback marker coloring) live here rather than in geometry.js or
 * markers.js because they're Fretboard-specific, not generic math/drawing -
 * src/fretboard/index.js (the barrel) imports GUITAR_TUNING
 * back for its own glue code and public re-export, and
 * ui/scalePositionGrid.js imports FRET_COUNT. addInteractiveEvent is a
 * generic DOM helper that happened to live next to this class before Phase
 * 3; it has no better home yet among today's modules, so it moved here
 * too, and ui/controls.js's and ui/chordGrid.js's button/hover handlers
 * import it back the same way.
 */

import { HeptatonicScales, getScaleNotes, getPrimaryScale, getPrimaryRootNote } from '../scales';
import {
    translateNotes as notationTranslateNotes,
    areEnharmonicEquivalent,
    findEnharmonicMatch,
    noteArrayContains
} from '../theory/notation';
import { getIntervalColor } from '../theory/intervals';
import { getPatternsByChordType } from '../chordPatterns';
import { fretboardState } from './state';
import {
    calculateFretPositions,
    calculateFretPosition as geometryCalculateFretPosition,
    calculateNote as geometryCalculateNote,
    extractNoteName as geometryExtractNoteName,
    extractOctave as geometryExtractOctave,
    getNoteAt as geometryGetNoteAt,
    findNotePositions as geometryFindNotePositions,
    getIntervalLabelFromRoot,
    getSemitoneFromRoot
} from './geometry';
import {
    calculateChordPatternPositions as patternsCalculateChordPatternPositions,
    findChordPatternMatches as patternsFindChordPatternMatches,
    findOptimalChordShape as patternsFindOptimalChordShape
} from './patterns';

// Fallback tuning used only if no active instrument config is available yet.
export const GUITAR_TUNING = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
export const FRET_COUNT = 21; // Number of frets to display

// Default marker colors
const DEFAULT_COLORS = {
    primary: '#666666',
    secondary: '#999999',
    text: '#ffffff'
};

/**
 * Utility function to add both mouse and touch event listeners for better mobile support
 * @param {HTMLElement} element - The element to add events to
 * @param {string} eventType - Type of event: 'enter', 'leave', 'click'
 * @param {function} handler - The event handler function
 */
export function addInteractiveEvent(element, eventType, handler) {
    switch (eventType) {
        case 'enter':
            element.addEventListener('mouseenter', handler);
            element.addEventListener('touchstart', handler, { passive: true });
            break;
        case 'leave':
            element.addEventListener('mouseleave', handler);
            element.addEventListener('touchend', handler, { passive: true });
            element.addEventListener('touchcancel', handler, { passive: true });
            break;
        case 'click':
            element.addEventListener('click', handler);
            element.addEventListener('touchend', (e) => {
                e.preventDefault();
                handler(e);
            });
            break;
        default: break; // unknown eventType wires nothing, as before
    }
}

/**
 * Class representing a guitar fretboard
 */
class Fretboard {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
        
        this.tuning = options.tuning || GUITAR_TUNING;
        this.fretCount = options.fretCount || FRET_COUNT;
        this.showFretNumbers = options.showFretNumbers !== false;
        this.showStringNames = options.showStringNames !== false;
        
        this.fretboardElement = null;
        this.markers = new Map(); // Store markers by string-fret key
        this.subscaleBoxes = new Map(); // Store subscale boxes by ID
        this.chordLines = new Map(); // Store chord lines by ID
        
        this.init();
    }
    
    /**
     * Initialize the fretboard visual structure
     */
    init() {
        this.container.innerHTML = '';
        this.fretboardElement = null;
        this.buildFretboardElement();
    }

    /**
     * Build (or rebuild) this.fretboardElement from this.tuning. Split out
     * of init() so setTuning() can rebuild the fretboard's contents in place
     * - reusing the same DOM node at the same position in this.container -
     * instead of removing/re-appending it, which would either lose its
     * position among siblings (top bar, tabs) or, if that bookkeeping is
     * ever wrong, leave a stray duplicate node behind.
     */
    buildFretboardElement() {
        // Calculate fret positions first
        this.fretPositions = calculateFretPositions(this.fretCount);

        // Create the fretboard's own node once; every later rebuild reuses
        // it in place rather than re-inserting into this.container.
        if (!this.fretboardElement) {
            this.fretboardElement = document.createElement('div');
            this.container.appendChild(this.fretboardElement);
        }
        this.fretboardElement.innerHTML = '';
        this.fretboardElement.className = 'fretboard';
        this.fretboardElement.style.cssText = `
            position: relative;
            background: #1e1e1e;
            border: 1px solid #333;
            border-radius: 12px;
            margin: 20px 0;
            padding: 20px; /* Reduced padding since elements are now properly contained */
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            overflow: visible; /* Allow content to extend beyond bounds for labels */
        `;

        // Add mobile-specific styles
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            this.fretboardElement.style.cssText += `
                margin: ${isLandscape ? '2px 0' : '5px 0'} !important;
                padding: ${isLandscape ? '8px 5px 12px 5px' : '15px 8px 20px 8px'} !important;
                height: ${isLandscape ? '100px' : '160px'} !important;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
            `;
        }

        // Add CSS animations and styles for subscale features
        this.addSubscaleStyles();

        // Add fret numbers if enabled
        if (this.showFretNumbers) {
            this.addFretNumbers();
        }

        // Add string names if enabled
        if (this.showStringNames) {
            this.addStringNames();
        }

        // Create the neck structure
        this.createNeckStructure();

        // Create fret grid
        this.createFretGrid();
    }

    /**
     * Change the active tuning (and implicitly string count) and rebuild
     * the fretboard's own visual structure in place - unlike init(), this
     * does not clear this.container, since by the time tuning can be
     * changed the container also holds the top bar, tabs, etc.
     */
    setTuning(newTuning) {
        this.tuning = newTuning;
        this.markers.clear();
        this.subscaleBoxes.clear();
        this.chordLines.clear();
        this.buildFretboardElement();
    }

    /**
     * Add CSS styles for subscale boxes and animations
     */
    addSubscaleStyles() {
        // Check if styles already exist
        if (document.getElementById('fretboard-subscale-styles')) {
            return;
        }
        
        const styleElement = document.createElement('style');
        styleElement.id = 'fretboard-subscale-styles';
        styleElement.textContent = `
            @keyframes rootPulse {
                0%, 100% { 
                    transform: translate(-50%, -50%) scale(1);
                    box-shadow: 0 3px 8px rgba(0,0,0,0.4);
                }
                50% { 
                    transform: translate(-50%, -50%) scale(1.1);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                }
            }
            
            @keyframes subscaleBoxGlow {
                0%, 100% { 
                    box-shadow: 0 0 5px rgba(255, 107, 53, 0.3);
                }
                50% { 
                    box-shadow: 0 0 15px rgba(255, 107, 53, 0.6);
                }
            }
            
            .subscale-box {
                animation: subscaleBoxGlow 3s ease-in-out infinite;
            }
            
            .subscale-label {
                transition: all 0.2s ease;
            }
            
            .subscale-label:hover {
                transform: translateX(-50%) scale(1.05);
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    /**
     * Add fret number labels under each fret wire
     */
    addFretNumbers() {
        // Calculate responsive font size and spacing
        let fontSize = 12;
        let padding = '2px 4px';
        let minWidth = 20;
        
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            if (isLandscape) {
                fontSize = 9;
                padding = '1px 2px';
                minWidth = 15;
            } else {
                fontSize = 10;
                padding = '1px 3px';
                minWidth = 18;
            }
        }
        
        const fretNumberRow = document.createElement('div');
        
        // Calculate responsive bottom positioning
        let bottomPosition = 10;
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            bottomPosition = isLandscape ? 5 : 8;
        }
        
        fretNumberRow.style.cssText = `
            position: absolute;
            bottom: ${bottomPosition}px; /* Position within the container padding */
            left: 0;
            right: 0;
            z-index: 10;
        `;
        
        // Add fret 0 (nut) label
        const nutLabel = document.createElement('div');
        nutLabel.textContent = '0';
        nutLabel.style.cssText = `
            position: absolute;
            left: 0%;
            transform: translateX(-50%);
            text-align: center;
            font-size: ${fontSize}px;
            font-weight: bold;
            color: #ddd;
            min-width: ${minWidth}px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 3px;
            padding: ${padding};
            border: 1px solid #555;
        `;
        fretNumberRow.appendChild(nutLabel);
        
        // Add labels for each fret aligned with fret markers (center of fret spaces)
        for (let fret = 1; fret <= this.fretCount; fret++) {
            const fretLabel = document.createElement('div');
            fretLabel.textContent = fret.toString();
            
            // Position label to align with fret markers (center of fret space)
            const fretPosition = this.calculateFretPosition(fret);
            
            fretLabel.style.cssText = `
                position: absolute;
                left: ${fretPosition}%;
                transform: translateX(-50%);
                text-align: center;
                font-size: ${fontSize}px;
                font-weight: bold;
                color: #ddd;
                min-width: ${minWidth}px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 3px;
                padding: ${padding};
                border: 1px solid #555;
            `;
            fretNumberRow.appendChild(fretLabel);
        }
        
        this.fretboardElement.appendChild(fretNumberRow);
    }
    
    /**
     * Add string name labels
     */
    addStringNames() {
        // Calculate responsive sizing
        let containerWidth = 40;
        let containerLeft = -50;
        let labelHeight = 24;
        let fontSize = 12;
        
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            if (isLandscape) {
                containerWidth = 22;
                containerLeft = -27;
                labelHeight = 14;
                fontSize = 8;
            } else {
                containerWidth = 32;
                containerLeft = -40;
                labelHeight = 20;
                fontSize = 10;
            }
        }
        
        const stringContainer = document.createElement('div');
        
        // Calculate responsive positioning
        let topPosition = 20;
        let bottomPosition = 20;
        
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            if (isLandscape) {
                topPosition = 8;
                bottomPosition = 12;
            } else {
                topPosition = 15;
                bottomPosition = 20;
            }
        }
        
        stringContainer.style.cssText = `
            position: absolute;
            left: ${containerLeft}px;
            top: ${topPosition}px; /* Adjusted to align with neck container */
            bottom: ${bottomPosition}px; /* Adjusted to align with neck container */
            width: ${containerWidth}px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            z-index: 10;
        `;
        
        this.tuning.forEach((stringNote, stringIndex) => {
            const stringLabel = document.createElement('div');
            stringLabel.textContent = this.extractNoteName(stringNote);
            stringLabel.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #fff;
                background-color: rgba(40, 40, 40, 0.9);
                border: 1px solid #555;
                border-radius: 6px;
                height: ${labelHeight}px;
                font-size: ${fontSize}px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.4);
            `;
            stringContainer.appendChild(stringLabel);
        });
        
        this.fretboardElement.appendChild(stringContainer);
    }
    
    /**
     * Create the neck structure with strings and fret wires
     */
    createNeckStructure() {
        const neckContainer = document.createElement('div');
        neckContainer.className = 'neck-container';
        
        // Calculate responsive height for mobile
        let neckHeight = 160;
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            neckHeight = isLandscape ? 70 : 120;
        }
        
        neckContainer.style.cssText = `
            position: relative;
            height: ${neckHeight}px;
            width: 100%;
            margin: 0;
            background: linear-gradient(to bottom, #2e2e2e, #1a1a1a);
            border-radius: 8px;
            box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
        `;
        
        // Store reference to neck container for fret grid
        this.neckContainer = neckContainer;
        
        // Create strings
        this.tuning.forEach((stringNote, stringIndex) => {
            const stringElement = document.createElement('div');
            stringElement.className = 'guitar-string';
            const stringPosition = (stringIndex / (this.tuning.length - 1)) * 100;
            stringElement.style.cssText = `
                position: absolute;
                top: ${stringPosition}%;
                left: 0;
                right: 0;
                height: ${stringIndex < 2 ? '3px' : stringIndex < 4 ? '2px' : '1px'};
                background: linear-gradient(to right, #C0C0C0, #E0E0E0, #C0C0C0);
                z-index: 1;
                box-shadow: 0 1px 2px rgba(0,0,0,0.3);
            `;
            neckContainer.appendChild(stringElement);
        });
        
        // Create nut (at the start of the fretboard)
        const nut = document.createElement('div');
        nut.className = 'nut';
        nut.style.cssText = `
            position: absolute;
            left: 0;
            top: -5px;
            bottom: -5px;
            width: 4px;
            // background: linear-gradient(to bottom, #f5f5f5, #e0e0e0, #f5f5f5);
            z-index: 2;
            border-radius: 2px;
            box-shadow: 1px 0 3px rgba(0,0,0,0.4);
        `;
        neckContainer.appendChild(nut);
        
        // Create fret wires using calculated positions
        for (let fret = 1; fret <= this.fretCount; fret++) {
            const fretWire = document.createElement('div');
            fretWire.className = 'fret-wire';
            const fretPosition = this.fretPositions[fret];
            fretWire.style.cssText = `
                position: absolute;
                left: ${fretPosition}%;
                top: -5px;
                bottom: -5px;
                width: 3px;
                background: linear-gradient(to bottom, #666, #999, #666);
                z-index: 2;
                border-radius: 1px;
                box-shadow: 1px 0 3px rgba(0,0,0,0.4);
            `;
            neckContainer.appendChild(fretWire);
        }
        
        // Add position markers (dots) - centered between fret wires
        const dotPositions = [3, 5, 7, 9, 12, 15, 18];
        const doubleDotPositions = [12];
        
        dotPositions.forEach(fret => {
            if (fret <= this.fretCount) {
                const isDouble = doubleDotPositions.includes(fret);
                // Position marker in the center of the fret space
                const markerPosition = this.calculateFretPosition(fret);
                
                if (isDouble) {
                    // Double dots for 12th fret
                    [30, 70].forEach(yPos => {
                        const dot = document.createElement('div');
                        dot.className = 'position-marker';
                        dot.style.cssText = `
                            position: absolute;
                            left: ${markerPosition}%;
                            top: ${yPos}%;
                            width: 12px;
                            height: 12px;
                            background: radial-gradient(circle, #D4AF37, #B8860B);
                            border-radius: 50%;
                            transform: translate(-50%, -50%);
                            z-index: 3;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                        `;
                        neckContainer.appendChild(dot);
                    });
                } else {
                    // Single dot
                    const dot = document.createElement('div');
                    dot.className = 'position-marker';
                    dot.style.cssText = `
                        position: absolute;
                        left: ${markerPosition}%;
                        top: 50%;
                        width: 14px;
                        height: 14px;
                        background: radial-gradient(circle, #D4AF37, #B8860B);
                        border-radius: 50%;
                        transform: translate(-50%, -50%);
                        z-index: 3;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    `;
                    neckContainer.appendChild(dot);
                }
            }
        });
        
        this.fretboardElement.appendChild(neckContainer);
    }
    
    /**
     * Create the fret grid structure
     */
    createFretGrid() {
        const fretGrid = document.createElement('div');
        fretGrid.className = 'fret-grid';
        fretGrid.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10;
        `;
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const fretElement = document.createElement('div');
                fretElement.className = 'fret';
                fretElement.dataset.string = stringIndex;
                fretElement.dataset.fret = fret;
                
                const note = this.calculateNote(stringNote, fret);
                fretElement.dataset.note = note;
                
                // Calculate position for this fret
                const stringPosition = (stringIndex / (this.tuning.length - 1)) * 100;
                const fretPosition = this.calculateFretPosition(fret);
                
                // Calculate responsive fret element size
                let fretSize = 30;
                if (window.innerWidth <= 768) {
                    const isLandscape = window.innerWidth > window.innerHeight;
                    fretSize = isLandscape ? 18 : 25;
                }
                
                fretElement.style.cssText = `
                    position: absolute;
                    left: ${fretPosition}%;
                    top: ${stringPosition}%;
                    width: ${fretSize}px;
                    height: ${fretSize}px;
                    transform: translate(-50%, -50%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                
                // Add hover effect with touch support
                addInteractiveEvent(fretElement, 'enter', () => {
                    if (!this.markers.has(`${stringIndex}-${fret}`)) {
                        fretElement.style.transform = 'translate(-50%, -50%) scale(1.1)';
                    }
                });
                
                addInteractiveEvent(fretElement, 'leave', () => {
                    if (!this.markers.has(`${stringIndex}-${fret}`)) {
                        fretElement.style.transform = 'translate(-50%, -50%) scale(1)';
                    }
                });
                
                fretGrid.appendChild(fretElement);
            }
        });
        
        // Add the fret grid to the neck container instead of the main fretboard element
        this.neckContainer.appendChild(fretGrid);
    }
    
    /**
     * Calculate the note at a specific string and fret using enhanced notation
     */
    calculateNote(openStringNote, fret) {
        return geometryCalculateNote(openStringNote, fret);
    }

    /**
     * Extract note name without octave from a full note string
     * Handles both "C/4" and "C4" formats, with proper notation support
     */
    extractNoteName(noteString) {
        return geometryExtractNoteName(noteString);
    }

    /**
     * Extract octave number from a full note string
     * Returns null if no octave found
     */
    extractOctave(noteString) {
        return geometryExtractOctave(noteString);
    }

    /**
     * Calculate the horizontal position for a fret (same logic as dot inlays)
     */
    calculateFretPosition(fret) {
        return geometryCalculateFretPosition(this.fretPositions, fret);
    }
    
    /**
     * Clear all markers from the fretboard
     */
    clearMarkers() {
        this.markers.forEach((marker, key) => {
            const [stringIndex, fret] = key.split('-').map(Number);
            const fretElement = this.fretboardElement.querySelector(
                `[data-string="${stringIndex}"][data-fret="${fret}"]`
            );
            if (fretElement) {
                // Remove any existing marker elements
                const existingMarker = fretElement.querySelector('.note-marker');
                if (existingMarker) {
                    existingMarker.remove();
                }
                // Reset transform consistently for all frets
                fretElement.style.transform = 'translate(-50%, -50%) scale(1)';
            }
        });
        this.markers.clear();
        
        // Only remove from scale tracking if not in an automatic update cycle
        if (!fretboardState.isUpdatingFretboards) {
            fretboardState.fretboardsShowingScale.delete(this.containerId);
        }
    }
    
    /**
     * Mark a specific fret with color and label
     */
    markFret(stringIndex, fret, options = {}) {
        const key = `${stringIndex}-${fret}`;
        const fretElement = this.fretboardElement.querySelector(
            `[data-string="${stringIndex}"][data-fret="${fret}"]`
        );
        
        // console.log(`Marking fret ${fret} on string ${stringIndex} with key ${key} -> `, fretElement);
        if (!fretElement) return;
        
        const {
            color = DEFAULT_COLORS.primary,
            textColor = DEFAULT_COLORS.text,
            label = '',
            isRoot = false,
            useCustomStyle = false,
            backgroundColor = '#ffffff',
            borderColor = '#ff4444',
            borderWidth = 3,
            borderStyle = 'solid',
            size = 26,
            disableAnimation = false
        } = options;
        
        // Remove any existing marker
        const existingMarker = fretElement.querySelector('.note-marker');
        if (existingMarker) {
            existingMarker.remove();
        }
        
        // Create new marker
        const marker = document.createElement('div');
        marker.className = `note-marker ${isRoot ? 'root-note' : ''}`;
        marker.textContent = label;
        
        if (useCustomStyle) {
            // Calculate responsive marker size
            let baseSize = size;
            if (window.innerWidth <= 768) {
                const isLandscape = window.innerWidth > window.innerHeight;
                baseSize = isLandscape ? Math.floor(size * 0.65) : Math.floor(size * 0.85);
            }
            
            // Use the new custom styling system
            const markerSize = isRoot ? Math.max(baseSize, 18) : baseSize;
            const fontSize = Math.max(6, Math.floor(markerSize * 0.4));
            let borderWidthPx = isRoot ? Math.max(borderWidth, 2) : Math.max(borderWidth - 1, 1);
            
            // Further reduce border width for mobile landscape
            if (window.innerWidth <= 768) {
                const isLandscape = window.innerWidth > window.innerHeight;
                if (isLandscape) {
                    borderWidthPx = Math.max(borderWidthPx - 1, 1);
                }
            }
            
            marker.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: ${backgroundColor};
                color: ${textColor};
                width: ${markerSize}px;
                height: ${markerSize}px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${fontSize}px;
                font-weight: bold;
                border: ${borderWidthPx}px ${borderStyle} ${borderColor};
                box-shadow: 0 ${Math.floor(markerSize * 0.15)}px ${Math.floor(markerSize * 0.3)}px rgba(0,0,0,0.4);
                z-index: 15;
                ${(isRoot && !disableAnimation) ? 'animation: rootPulse 2s infinite ease-in-out;' : ''}
            `;
        } else {
            // Calculate responsive marker size for original styling
            let markerWidth = 28;
            let markerHeight = 28;
            let fontSize = isRoot ? 12 : 10;
            
            if (window.innerWidth <= 768) {
                const isLandscape = window.innerWidth > window.innerHeight;
                if (isLandscape) {
                    markerWidth = markerHeight = 16;
                    fontSize = isRoot ? 7 : 6;
                } else {
                    markerWidth = markerHeight = 20;
                    fontSize = isRoot ? 9 : 7;
                }
            }
            
            // Use the original styling system
            marker.style.cssText = `
                position: absolute;
                top: 50%;
                left: 0px;
                right: 0px;
                transform: translate(-${Math.floor(markerWidth/2)}px, -${Math.floor(markerHeight/2)}px);
                padding:0;
                background: ${color};
                color: ${textColor};
                width: ${markerWidth}px;
                height: ${markerHeight}px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${fontSize}px;
                font-weight: bold;
                border: ${isRoot ? '3px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.3)'};
                box-shadow: 0 ${isRoot ? '3px 8px' : '2px 6px'} rgba(0,0,0,0.4);
                z-index: 15;
                ${(isRoot && !disableAnimation) ? 'animation: rootPulse 2s infinite ease-in-out;' : ''}
            `;
        }
        
        fretElement.appendChild(marker);
        this.markers.set(key, { 
            color, 
            textColor, 
            label, 
            isRoot, 
            useCustomStyle, 
            backgroundColor, 
            borderColor, 
            borderWidth, 
            size,
            disableAnimation
        });
        // console.log(`Marked fret ${fret} on string ${stringIndex} with key ${key}`);
    }
    
    /**
     * Mark all notes on the fretboard with note names
     */
    markAllNotes() {
        this.clearMarkers();
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const note = this.calculateNote(stringNote, fret);
                // Show full note with octave (e.g., "C/4")
                
                this.markFret(stringIndex, fret, {
                    backgroundColor: '#ffffff',
                    borderColor: DEFAULT_COLORS.secondary,
                    borderWidth: 2,
                    textColor: '#333333',
                    size: 24,
                    label: note,
                    useCustomStyle: true
                });
            }
        });
    }
    
    /**
     * Mark scale notes, coloured by semitone distance from the root.
     *
     * Coloured by *scale degree* until PIANO_VIEW_PLAN.md step 5: a ♭3 and a
     * natural 3 were both "degree 3" and came out the same yellow, as did
     * ♭6/6 and ♭7/7, so a minor scale and its parallel major were coloured
     * identically. Everything else in the app - the Scale Position Grid,
     * every MiniPiano, and now the piano view - keys off semitones via
     * theory/intervals.js, so the fretboard was the sole exception to the
     * palette its own header claimed was shared.
     */
    markScale(scaleNotes, rootNote, options = {}) {
        const {
            showIntervals = false
        } = options;

        this.clearMarkers();
        
        // Normalize scale notes (remove octave numbers) and translate to proper notation
        const translatedScaleNotes = notationTranslateNotes(scaleNotes);
        const normalizedScaleNotes = translatedScaleNotes.map(note => this.extractNoteName(note));
        const normalizedRoot = this.extractNoteName(rootNote);
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const note = this.calculateNote(stringNote, fret);
                const noteName = this.extractNoteName(note);
                
                // Use enharmonic matching to find the note in the scale
                const matchedScaleNote = findEnharmonicMatch(noteName, normalizedScaleNotes);
                if (matchedScaleNote) {
                    const isRoot = areEnharmonicEquivalent(noteName, normalizedRoot);

                    // Colour and label both derive from the same semitone
                    // distance, so they can never disagree about an interval.
                    const semitone = getSemitoneFromRoot(normalizedRoot, matchedScaleNote);
                    const scaleColor = semitone === null
                        ? DEFAULT_COLORS.primary
                        : getIntervalColor(semitone);

                    // Use either interval labels relative to the root or note names
                    const intervalLabel = getIntervalLabelFromRoot(normalizedRoot, matchedScaleNote);
                    const displayNoteName = showIntervals && intervalLabel ? intervalLabel : matchedScaleNote;
                    
                    this.markFret(stringIndex, fret, {
                        backgroundColor: '#ffffff',
                        borderColor: scaleColor,
                        borderWidth: isRoot ? 4 : 3,
                        textColor: '#333333',
                        size: isRoot ? 28 : 24,
                        label: displayNoteName,
                        isRoot: isRoot,
                        useCustomStyle: true
                    });
                }
            }
        });
        
        // Always add to tracking if showing scale, whether from user action or auto-update
        fretboardState.fretboardsShowingScale.add(this.containerId);
    }
    
    /**
     * Mark all instances of a specific note on the fretboard
     * @param {string} targetNote - The note to mark (e.g., 'C', 'F#', 'Bb' for all octaves, or 'C/4', 'F#/3' for specific octave)
     * @param {Object} options - Styling options for the markers
     */
    markNote(targetNote, options = {}) {
        const {
            backgroundColor = '#ffffff',
            borderColor = '#ff4444',
            borderWidth = 3,
            textColor = '#333333',
            size = 26,
            showLabel = true,
            label = null,
            isRoot = false,
            clearFirst = true
        } = options;
        
        if (clearFirst) {
            this.clearMarkers();
        }
        
        // Check if targeting a specific octave (has a slash) or all octaves
        const hasSpecificOctave = targetNote.includes('/');
        let targetNoteName, targetOctave;
        
        if (hasSpecificOctave) {
            targetNoteName = this.extractNoteName(targetNote);
            targetOctave = this.extractOctave(targetNote);
        } else {
            targetNoteName = targetNote;
            targetOctave = null;
        }
        
        let displayLabel;
        if (label !== null) {
            displayLabel = label;
        } else if (showLabel) {
            displayLabel = hasSpecificOctave ? targetNote : targetNoteName;
        } else {
            displayLabel = '';
        }
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const note = this.calculateNote(stringNote, fret);
                const noteName = this.extractNoteName(note);
                const noteOctave = this.extractOctave(note);
                
                console.log(`Checking note ${note} (${noteName}/${noteOctave}) at string ${stringIndex}, fret ${fret}`);
                
                let shouldMark = false;
                
                if (hasSpecificOctave) {
                    // Match both note name and octave using enharmonic equivalence
                    shouldMark = (areEnharmonicEquivalent(noteName, targetNoteName) && noteOctave === targetOctave);
                } else {
                    // Match just the note name using enharmonic equivalence
                    shouldMark = areEnharmonicEquivalent(noteName, targetNoteName);
                }
                
                if (shouldMark) {
                    console.log(`Marking note ${note} at string ${stringIndex}, fret ${fret}`);
                    this.markFret(stringIndex, fret, {
                        backgroundColor,
                        borderColor,
                        borderWidth,
                        textColor,
                        size,
                        label: displayLabel,
                        isRoot,
                        useCustomStyle: true
                    });
                }
            }
        });
        
        // Remove from scale tracking since we're showing specific notes
        if (clearFirst) {
            fretboardState.fretboardsShowingScale.delete(this.containerId);
        }
    }
    
    /**
     * Mark multiple notes with different colors
     * @param {Array} noteConfigs - Array of {note, options} objects
     */
    markMultipleNotes(noteConfigs, clearFirst = true) {
        if (clearFirst) {
            this.clearMarkers();
        }
        
        noteConfigs.forEach(config => {
            const { note, ...options } = config;
            this.markNote(note, { ...options, clearFirst: false });
        });
        
        // Remove from scale tracking since we're showing specific notes
        if (clearFirst) {
            fretboardState.fretboardsShowingScale.delete(this.containerId);
        }
    }
    
    /**
     * Display a chord on the fretboard with chord tones highlighted
     * @param {Array} chordNotes - Array of note names in the chord
     * @param {string} chordName - Name of the chord for labeling
     * @param {Object} options - Display options
     */
    displayChord(chordNotes, chordName = '', options = {}) {
        const {
            clearFirst = true,
            showLines = true,
            rootColor = '#ff4444',
            thirdColor = '#ffcc44',
            fifthColor = '#44ff44',
            seventhColor = '#4444ff',
            backgroundColor = '#ffffff',
            textColor = '#333333',
            borderWidth = 3,
            size = 28,
            showScaleContext = true,
            showIntervals = false,
            intervalLabels = []
        } = options;
        
        if (clearFirst) {
            this.clearMarkers();
            this.clearChordLines();
        }
        
        // First, mark all scale notes as grey background if scale context is enabled
        if (showScaleContext) {
            try {
                const primaryScale = getPrimaryScale();
                const rootNote = getPrimaryRootNote();
                
                if (primaryScale && rootNote) {
                    const [family, mode] = primaryScale.split('-');
                    // Guard against accessing HeptatonicScales before it's initialized
                    if (!HeptatonicScales || !HeptatonicScales[family]) {
                        return;
                    }
                    const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
                    const scaleNotes = getScaleNotes(rootNote, intervals);
                    const translatedScaleNotes = notationTranslateNotes(scaleNotes);
                    const normalizedScaleNotes = translatedScaleNotes.map(note => this.extractNoteName(note));
                    
                    // Mark all scale notes with subtle grey markers (no labels)
                    this.tuning.forEach((stringNote, stringIndex) => {
                        for (let fret = 0; fret <= this.fretCount; fret++) {
                            const note = this.calculateNote(stringNote, fret);
                            const noteName = this.extractNoteName(note);
                            
                            // Use enharmonic matching for scale context
                            if (noteArrayContains(normalizedScaleNotes, noteName)) {
                                this.markFret(stringIndex, fret, {
                                    backgroundColor: '#f8f9fa',
                                    borderColor: '#dee2e6',
                                    borderWidth: 1,
                                    textColor: '#6c757d',
                                    size: 20,
                                    label: '', // No label for context markers
                                    isRoot: false,
                                    useCustomStyle: true
                                });
                            }
                        }
                    });
                }
            } catch (error) {
                console.warn('Could not add scale context to chord display:', error);
            }
        }
        
        // Color mapping for chord tones
        const colorMap = [rootColor, thirdColor, fifthColor, seventhColor];
        const roleNames = ['Root', '3rd', '5th', '7th'];
        
        // Translate chord notes to proper notation
        const translatedChordNotes = notationTranslateNotes(chordNotes);
        
        // Find all positions for each chord tone and mark them with prominent colors
        const chordPositions = [];
        
        translatedChordNotes.forEach((note, index) => {
            const noteName = this.extractNoteName(note);
            const positions = this.findNotePositions(noteName);
            const intervalLabel = intervalLabels[index] || '';
            const normalizedIntervalLabel = intervalLabel === 'P1' ? 'R' : intervalLabel;
            const markerLabel = showIntervals && normalizedIntervalLabel ? normalizedIntervalLabel : noteName;
            
            positions.forEach(pos => {
                // Override any existing marker (including scale context markers) with chord tone marker
                this.markFret(pos.string, pos.fret, {
                    backgroundColor,
                    borderColor: colorMap[index % colorMap.length],
                    borderWidth: index === 0 ? borderWidth + 1 : borderWidth, // Root gets thicker border
                    textColor,
                    size: index === 0 ? size + 2 : size, // Root gets slightly larger
                    label: markerLabel,
                    isRoot: index === 0,
                    useCustomStyle: true,
                    disableAnimation: true  // Disable animation for chord display
                });
                
                // Store position for potential line drawing
                chordPositions.push({
                    string: pos.string,
                    fret: pos.fret,
                    note: noteName,
                    role: roleNames[index % roleNames.length]
                });
            });
        });
        
        // Draw connecting lines between chord tones if requested
        if (showLines && chordPositions.length > 1) {
            // Find a good chord shape to connect (prefer closer frets)
            const chordShape = this.findOptimalChordShape(chordPositions, chordNotes);
            
            if (chordShape.length > 1) {
                this.drawChordLine(`chord-${chordName}`, chordShape, {
                    color: rootColor,
                    lineWidth: 2,
                    style: 'solid',
                    opacity: 0.5,
                    label: chordName,
                    labelPosition: 'middle'
                });
            }
        }
        
        // Add to chord tracking
        fretboardState.fretboardsShowingChords.add(this.containerId);
        // Remove from scale tracking since we're showing chords
        fretboardState.fretboardsShowingScale.delete(this.containerId);
    }
    
    /**
     * Find an optimal chord shape from available positions
     * @param {Array} positions - All available positions for chord tones
     * @param {Array} chordNotes - The chord notes to prioritize
     * @returns {Array} Optimal positions for chord shape
     */
    findOptimalChordShape(positions, chordNotes) {
        return patternsFindOptimalChordShape(positions, chordNotes);
    }
    
    /**
     * Get the note at a specific string and fret
     */
    getNoteAt(stringIndex, fret) {
        return geometryGetNoteAt(this.tuning, this.fretCount, stringIndex, fret);
    }

    /**
     * Find all positions of a specific note on the fretboard
     */
    findNotePositions(targetNote) {
        return geometryFindNotePositions(this.tuning, this.fretCount, targetNote);
    }
    
    /**
     * Draw a box around a section of the fretboard to mark subscales
     * @param {string} boxId - Unique identifier for the box
     * @param {number} startString - Starting string index (0-based)
     * @param {number} endString - Ending string index (0-based)
     * @param {number} startFret - Starting fret number
     * @param {number} endFret - Ending fret number
     * @param {Object} options - Styling and label options
     */
    drawSubscaleBox(boxId, startString, endString, startFret, endFret, options = {}) {
        const {
            color = '#ff6b35',
            lineWidth = 2,
            label = '',
            labelPosition = 'bottom', // 'top' or 'bottom'
            labelColor = '#333',
            labelBackgroundColor = 'rgba(255, 255, 255, 0.9)'
        } = options;
        
        // Remove existing box if it exists
        this.removeSubscaleBox(boxId);
        
        // Calculate positions
        const topStringPos = (Math.min(startString, endString) / (this.tuning.length - 1)) * 100;
        const bottomStringPos = (Math.max(startString, endString) / (this.tuning.length - 1)) * 100;
        
        let leftPos, rightPos;
        
        if (startFret === 0) {
            leftPos = 0;
        } else {
            const prevFretPos = startFret > 1 ? this.fretPositions[startFret - 1] : 0;
            const currentFretPos = this.fretPositions[startFret];
            leftPos = (prevFretPos + currentFretPos) / 2;
        }
        
        if (endFret === 0) {
            rightPos = 0;
        } else {
            const prevFretPos = endFret > 1 ? this.fretPositions[endFret - 1] : 0;
            const currentFretPos = this.fretPositions[endFret];
            rightPos = (prevFretPos + currentFretPos) / 2;
        }
        
        // Ensure left is less than right
        if (leftPos > rightPos) {
            [leftPos, rightPos] = [rightPos, leftPos];
        }
        
        // Create box container
        const boxContainer = document.createElement('div');
        boxContainer.className = 'subscale-box';
        boxContainer.dataset.boxId = boxId;
        
        // Create the box outline
        const boxOutline = document.createElement('div');
        boxOutline.style.cssText = `
            position: absolute;
            left: ${leftPos}%;
            top: ${topStringPos}%;
            width: ${rightPos - leftPos}%;
            height: ${bottomStringPos - topStringPos}%;
            border: ${lineWidth}px solid ${color};
            border-radius: 8px;
            pointer-events: none;
            z-index: 8;
            background: ${color}08; /* Very transparent background */
        `;
        
        boxContainer.appendChild(boxOutline);
        
        // Create label if provided
        if (label) {
            const labelElement = document.createElement('div');
            labelElement.className = 'subscale-label';
            labelElement.textContent = label;
            
            const labelTop = labelPosition === 'top' 
                ? `${topStringPos - 12}%`  // More space above with new padding
                : `${bottomStringPos + 8}%`; // More space below with new padding
            
            labelElement.style.cssText = `
                position: absolute;
                left: ${(leftPos + rightPos) / 2}%;
                top: ${labelTop};
                transform: translateX(-50%);
                background: ${labelBackgroundColor};
                color: ${labelColor};
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: bold;
                white-space: nowrap;
                z-index: 9;
                border: 1px solid ${color};
                box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            `;
            
            boxContainer.appendChild(labelElement);
        }
        
        // Position the container relative to the fret grid (responsive padding)
        let topPadding = 40;
        let leftPadding = 40;
        let rightPadding = 40;
        let bottomPadding = 60;
        
        if (window.innerWidth <= 768) {
            const isLandscape = window.innerWidth > window.innerHeight;
            if (isLandscape) {
                topPadding = 15;
                leftPadding = 10;
                rightPadding = 10;
                bottomPadding = 25;
            } else {
                topPadding = 25;
                leftPadding = 20;
                rightPadding = 20;
                bottomPadding = 35;
            }
        }
        
        boxContainer.style.cssText = `
            position: absolute;
            top: ${topPadding}px;
            left: ${leftPadding}px;
            right: ${rightPadding}px;
            bottom: ${bottomPadding}px;
            pointer-events: none;
            z-index: 8;
        `;
        
        this.fretboardElement.appendChild(boxContainer);
        this.subscaleBoxes.set(boxId, {
            element: boxContainer,
            startString,
            endString,
            startFret,
            endFret,
            options
        });
    }
    
    /**
     * Remove a subscale box by ID
     */
    removeSubscaleBox(boxId) {
        const box = this.subscaleBoxes.get(boxId);
        if (box && box.element) {
            box.element.remove();
            this.subscaleBoxes.delete(boxId);
        }
    }
    
    /**
     * Clear all subscale boxes
     */
    clearSubscaleBoxes() {
        this.subscaleBoxes.forEach((box, boxId) => {
            if (box.element) {
                box.element.remove();
            }
        });
        this.subscaleBoxes.clear();
    }
    
    /**
     * Update the position and size of an existing subscale box
     */
    updateSubscaleBox(boxId, startString, endString, startFret, endFret, options = {}) {
        const existingBox = this.subscaleBoxes.get(boxId);
        if (existingBox) {
            // Merge with existing options
            const mergedOptions = { ...existingBox.options, ...options };
            this.drawSubscaleBox(boxId, startString, endString, startFret, endFret, mergedOptions);
        }
    }
    
    /**
     * Get all subscale boxes
     */
    getSubscaleBoxes() {
        return new Map(this.subscaleBoxes);
    }
    
    /**
     * Draw lines between frets to mark chord shapes or patterns
     * @param {string} lineId - Unique identifier for the line
     * @param {Array} points - Array of {string, fret} objects defining the line path
     * @param {Object} options - Styling and label options
     */
    drawChordLine(lineId, points, options = {}) {
        const {
            color = '#ff6b35',
            lineWidth = 3,
            style = 'solid', // 'solid', 'dashed', 'dotted'
            label = '',
            labelPosition = 'middle', // 'start', 'middle', 'end'
            labelColor = '#333',
            labelBackgroundColor = 'rgba(255, 255, 255, 0.9)',
            opacity = 0.8
        } = options;
        
        if (points.length < 2) {
            console.warn('At least 2 points are required to draw a line');
            return;
        }
        
        // Remove existing line if it exists
        this.removeChordLine(lineId);
        
        // Create line container
        const lineContainer = document.createElement('div');
        lineContainer.className = 'chord-line';
        lineContainer.dataset.lineId = lineId;
        
        // Calculate positions for each point
        const positions = points.map(point => {
            // console.log(`Calculating position for point: ${JSON.stringify(point)}`);
            const stringPosition = (point.string / (this.tuning.length - 1)) * 100;
            const fretPosition = this.calculateFretPosition(point.fret);
            return { x: fretPosition, y: stringPosition };
        });
        
        // Create SVG for precise line drawing
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 12;
            opacity: ${opacity};
        `;
        
        // Create path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // Build path data using viewBox coordinates (0-100)
        let pathData = `M ${positions[0].x} ${positions[0].y}`;
        for (let i = 1; i < positions.length; i++) {
            pathData += ` L ${positions[i].x} ${positions[i].y}`;
        }
        
        // Style the path
        let strokeDasharray = '';
        switch (style) {
            case 'dashed':
                strokeDasharray = '4,2';
                break;
            case 'dotted':
                strokeDasharray = '1,1';
                break;
            default:
                strokeDasharray = 'none';
        }
        
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', lineWidth / 10); // Scale for viewBox
        path.setAttribute('stroke-dasharray', strokeDasharray);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        
        svg.appendChild(path);
        lineContainer.appendChild(svg);
        
        // Add label if provided
        if (label) {
            const labelElement = document.createElement('div');
            labelElement.className = 'chord-line-label';
            labelElement.textContent = label;
            
            // Calculate label position
            let labelPos;
            switch (labelPosition) {
                case 'start':
                    labelPos = positions[0];
                    break;
                case 'end':
                    labelPos = positions[positions.length - 1];
                    break;
                default: // 'middle'
                    const midIndex = Math.floor(positions.length / 2);
                    if (positions.length % 2 === 0) {
                        // Average of two middle points
                        const pos1 = positions[midIndex - 1];
                        const pos2 = positions[midIndex];
                        labelPos = {
                            x: (pos1.x + pos2.x) / 2,
                            y: (pos1.y + pos2.y) / 2
                        };
                    } else {
                        labelPos = positions[midIndex];
                    }
            }
            
            labelElement.style.cssText = `
                position: absolute;
                left: ${labelPos.x}%;
                top: ${labelPos.y}%;
                transform: translate(-50%, -50%);
                background: ${labelBackgroundColor};
                color: ${labelColor};
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
                white-space: nowrap;
                z-index: 13;
                border: 1px solid ${color};
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                pointer-events: none;
            `;
            
            lineContainer.appendChild(labelElement);
        }
        
        lineContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 12;
        `;
        
        // Add the chord line to the neck container to align with fret grid
        this.neckContainer.appendChild(lineContainer);
        
        // Store line data
        if (!this.chordLines) {
            this.chordLines = new Map();
        }
        this.chordLines.set(lineId, {
            element: lineContainer,
            points,
            options
        });
    }
    
    /**
     * Remove a chord line by ID
     */
    removeChordLine(lineId) {
        if (!this.chordLines) return;
        
        const line = this.chordLines.get(lineId);
        if (line && line.element) {
            line.element.remove();
            this.chordLines.delete(lineId);
        }
    }
    
    /**
     * Clear all chord lines
     */
    clearChordLines() {
        if (!this.chordLines) return;
        
        this.chordLines.forEach((line, lineId) => {
            if (line.element) {
                line.element.remove();
            }
        });
        this.chordLines.clear();
    }
    
    /**
     * Get all chord lines
     */
    getChordLines() {
        if (!this.chordLines) {
            this.chordLines = new Map();
        }
        return new Map(this.chordLines);
    }

    /**
     * Search for all instances of a note on the fretboard
     * @param {string} searchNote - The note to search for (e.g., 'C' for all C notes, 'C/4' for specific octave)
     * @returns {Array} Array of {string, fret, note, octave} objects representing all matches
     */
    searchNote(searchNote) {
        const results = [];
        
        // Check if searching for a specific octave or all octaves
        const hasSpecificOctave = searchNote.includes('/');
        let targetNoteName, targetOctave;
        
        if (hasSpecificOctave) {
            targetNoteName = this.extractNoteName(searchNote);
            targetOctave = this.extractOctave(searchNote);
        } else {
            targetNoteName = searchNote;
            targetOctave = null;
        }
        
        // Search through all fret positions
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const fretNote = this.calculateNote(stringNote, fret);
                const fretNoteName = this.extractNoteName(fretNote);
                const fretOctave = this.extractOctave(fretNote);
                
                let isMatch = false;
                
                if (hasSpecificOctave) {
                    // Match both note name and octave using enharmonic equivalence
                    isMatch = areEnharmonicEquivalent(fretNoteName, targetNoteName) && fretOctave === targetOctave;
                } else {
                    // Match note name only using enharmonic equivalence
                    isMatch = areEnharmonicEquivalent(fretNoteName, targetNoteName);
                }
                
                if (isMatch) {
                    results.push({
                        string: stringIndex,
                        fret: fret,
                        note: fretNote,
                        noteName: fretNoteName,
                        octave: fretOctave,
                        stringName: this.tuning[stringIndex],
                        position: `String ${stringIndex + 1}, Fret ${fret}`
                    });
                }
            }
        });
        
        // Sort results by string (low to high) then by fret (low to high)
        results.sort((a, b) => {
            if (a.string !== b.string) {
                return a.string - b.string;
            }
            return a.fret - b.fret;
        });
        
        return results;
    }

    /**
     * Search for multiple notes at once
     * @param {Array} searchNotes - Array of note names to search for
     * @returns {Object} Object with note names as keys and arrays of positions as values
     */
    searchMultipleNotes(searchNotes) {
        const results = {};
        
        searchNotes.forEach(note => {
            results[note] = this.searchNote(note);
        });
        
        return results;
    }

    /**
     * Get all unique notes on the fretboard (useful for debugging or analysis)
     * @returns {Array} Array of unique note names found on the fretboard
     */
    getAllUniqueNotes() {
        const uniqueNotes = new Set();
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const fretNote = this.calculateNote(stringNote, fret);
                const fretNoteName = this.extractNoteName(fretNote);
                uniqueNotes.add(fretNoteName);
            }
        });
        
        return Array.from(uniqueNotes).sort();
    }
    
    /**
     * Draw a chord shape with both markers and connecting lines
     * @param {string} chordId - Unique identifier for the chord
     * @param {Array} notes - Array of {string, fret, label, color} objects
     * @param {Object} options - Options for both markers and lines
     */
    drawChordShape(chordId, notes, options = {}) {
        const {
            markerOptions = {},
            lineOptions = {},
            drawLines = true,
            clearFirst = true
        } = options;
        
        if (clearFirst) {
            this.clearMarkers();
            this.clearChordLines();
        }
        
        // Draw markers for each note
        notes.forEach((note, index) => {
            const {
                string: stringIndex,
                fret,
                label = '',
                backgroundColor = '#ffffff',
                borderColor = '#ff6b35',
                borderWidth = 3,
                textColor = '#333333',
                size = 28,
                isRoot = false
            } = { ...markerOptions, ...note };
            
            this.markFret(stringIndex, fret, {
                backgroundColor,
                borderColor,
                borderWidth,
                textColor,
                size,
                label,
                isRoot,
                useCustomStyle: true
            });
        });
        
        // Draw connecting lines if requested
        if (drawLines && notes.length > 1) {
            const linePoints = notes.map(note => ({
                string: note.string,
                fret: note.fret
            }));
            
            this.drawChordLine(`${chordId}-shape`, linePoints, {
                color: lineOptions.color || '#ff6b35',
                lineWidth: lineOptions.lineWidth || 2,
                style: lineOptions.style || 'solid',
                opacity: lineOptions.opacity || 0.6,
                ...lineOptions
            });
        }
    }

    /**
     * Calculate the actual fret positions for a chord pattern at a given root position
     * @param {Object} pattern - The chord pattern definition
     * @param {number} rootFret - The fret where the root note should be placed
     * @returns {Array|null} Array of {string, fret, interval, label} objects or null if invalid
     */
    calculateChordPatternPositions(pattern, rootFret) {
        return patternsCalculateChordPatternPositions(pattern, rootFret, this.fretCount);
    }

    /**
     * Find all possible chord pattern matches for given chord notes
     * @param {Array} chordNotes - Array of note names that make up the chord
     * @param {string} rootNote - The root note of the chord
     * @param {Array} patternNames - Optional array of specific pattern names to check
     * @returns {Array} Array of matching pattern results
     */
    findChordPatternMatches(chordNotes, rootNote, patternNames = null) {
        return patternsFindChordPatternMatches(this.tuning, this.fretCount, chordNotes, rootNote, patternNames);
    }

    /**
     * Display a chord using pattern matching
     * @param {Array} chordNotes - Array of note names that make up the chord
     * @param {string} rootNote - The root note of the chord
     * @param {Object} options - Display options
     */
    displayChordWithPatterns(chordNotes, rootNote, options = {}) {
        const {
            clearFirst = true,
            showAllMatches = false,
            preferredPatterns = null,
            markerOptions = {},
            lineOptions = {},
            drawLines = true,
            highlightRoot = true
        } = options;
        
        if (clearFirst) {
            this.clearMarkers();
            this.clearChordLines();
        }
        
        console.log('chord notes:', chordNotes)
        // Find pattern matches
        const matches = this.findChordPatternMatches(chordNotes, rootNote, preferredPatterns);
        
        if (matches.length === 0) {
            // console.log(`No chord patterns found for ${rootNote} chord with notes: ${chordNotes.join(', ')}`);
            return;
        }
        
        // Use the first match (or all matches if showAllMatches is true)
        const matchesToDisplay = showAllMatches ? matches : [matches[0]];
        
        for (const match of matchesToDisplay) {
            const patternId = `pattern-${match.patternName}-${match.rootPosition.fret}`;
            
            // Create markers for each position
            const markerPositions = match.positions.map(pos => {
                const noteAtPos = this.getNoteAt(pos.string, pos.fret);
                const isRoot = this.extractNoteName(noteAtPos) === this.extractNoteName(rootNote);
                
                return {
                    string: pos.string,
                    fret: pos.fret,
                    label: pos.label,
                    backgroundColor: markerOptions.backgroundColor || '#ffffff',
                    borderColor: isRoot && highlightRoot ? 
                        (markerOptions.rootColor || '#ff4444') : 
                        (markerOptions.borderColor || '#ff6b35'),
                    borderWidth: isRoot && highlightRoot ? 4 : 3,
                    textColor: markerOptions.textColor || '#333333',
                    size: isRoot && highlightRoot ? 30 : 26,
                    isRoot: isRoot,
                    ...markerOptions
                };
            });
            
            // Draw the chord shape
            this.drawChordShape(patternId, markerPositions, {
                markerOptions: markerOptions,
                lineOptions: {
                    color: lineOptions.color || '#ff6b35',
                    lineWidth: lineOptions.lineWidth || 2,
                    style: lineOptions.style || 'solid',
                    opacity: lineOptions.opacity || 0.6,
                    label: `${match.pattern.name}`,
                    ...lineOptions
                },
                drawLines: drawLines,
                clearFirst: false // Already cleared above
            });
            
            console.log(`Displaying chord pattern: ${match.pattern.name} at fret ${match.rootPosition.fret}`);
        }
        
        return matches;
    }

    /**
     * Get all available chord patterns for a specific chord type
     * @param {string} chordType - Type of chord (e.g., 'major', 'minor', 'dominant7')
     * @returns {Array} Array of pattern names matching the chord type
     */
    getPatternsByChordType(chordType) {
        return getPatternsByChordType(chordType);
    }

    /**
     * Display all possible patterns for a chord
     * @param {Array} chordNotes - Array of note names that make up the chord
     * @param {string} rootNote - The root note of the chord
     * @param {string} chordType - Type of chord to filter patterns
     * @param {Object} options - Display options
     */
    showAllChordPatterns(chordNotes, rootNote, chordType = null, options = {}) {
        const preferredPatterns = chordType ? this.getPatternsByChordType(chordType) : null;
        
        return this.displayChordWithPatterns(chordNotes, rootNote, {
            ...options,
            showAllMatches: true,
            preferredPatterns: preferredPatterns
        });
    }
}

export { Fretboard };
