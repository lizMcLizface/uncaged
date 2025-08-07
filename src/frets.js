import {processChord, generateSyntheticChords} from './intervals';
import {HeptatonicScales, scales, getScaleNotes, highlightKeysForScales} from './scales';
import {createHeptatonicScaleTable, selectedRootNote, selectedScales, getPrimaryScale, getPrimaryRootNote} from './scaleGenerator';
import {chords, processedChords, highlightKeysForChords, createChordRootNoteTable, createChordSuffixTable, selectedChordRootNote, selectedChordSuffixes} from './chords';
import {noteToMidi, noteToName, keys, getElementByNote, getElementByMIDI} from './midi';
import {getChordPatterns, getPatternsByChordType} from './chordPatterns';

// Standard guitar tuning (lowest to highest strings) - displayed from top to bottom
const GUITAR_TUNING = ['E4', 'B3', 'G3', 'D3', 'A2', 'E2'];
const FRET_COUNT = 21; // Number of frets to display

// Calculate fret positions using the rule of 18 (each fret divides remaining string length by 18)
function calculateFretPositions(fretCount) {
    const positions = [0]; // Open string position at 0%
    
    // Calculate what the full string length should be so that the 15th fret ends at 100%
    // Work backwards from the desired end position
    let totalLength = 100;
    let tempLength = totalLength;
    
    // Calculate the theoretical positions if we started with this length
    const tempPositions = [0];
    for (let fret = 1; fret <= fretCount; fret++) {
        const fretDistance = tempLength / 17.817;
        tempPositions.push(totalLength - tempLength + fretDistance);
        tempLength -= fretDistance;
    }
    
    // Scale so that the last fret (15th) is at 100%
    const lastFretPosition = tempPositions[fretCount];
    const scaleFactor = 100 / lastFretPosition;
    
    // Apply scaling to all positions
    for (let fret = 1; fret <= fretCount; fret++) {
        positions.push(tempPositions[fret] * scaleFactor);
    }
    
    return positions;
}

// Scale degree colors for visual differentiation
const SCALE_COLORS = {
    1: '#ff4444', // Root - red
    2: '#ff8844', // 2nd - orange
    3: '#ffcc44', // 3rd - yellow
    4: '#44ff44', // 4th - green
    5: '#44ccff', // 5th - light blue
    6: '#4444ff', // 6th - blue
    7: '#cc44ff', // 7th - purple
    8: '#ff4444'  // Octave - red (same as root)
};

// Default marker colors
const DEFAULT_COLORS = {
    primary: '#666666',
    secondary: '#999999',
    text: '#ffffff'
};

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
        
        // Calculate fret positions first
        this.fretPositions = calculateFretPositions(this.fretCount);
        
        // Create main fretboard container
        this.fretboardElement = document.createElement('div');
        this.fretboardElement.className = 'fretboard';
        this.fretboardElement.style.cssText = `
            position: relative;
            background: #f5f5f5;
            border-radius: 12px;
            margin: 20px 0;
            padding: 40px 20px 60px 20px; /* Increased top and bottom padding for boxes and labels */
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            overflow: visible; /* Allow content to extend beyond bounds for labels */
        `;
        
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
        
        this.container.appendChild(this.fretboardElement);
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
        const fretNumberRow = document.createElement('div');
        fretNumberRow.style.cssText = `
            position: absolute;
            bottom: 10px; /* Position within the container padding */
            left: 40px; /* Match fret grid left margin exactly */
            right: 60px; /* Match fret grid right margin exactly */
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
            font-size: 12px;
            font-weight: bold;
            color: #333;
            min-width: 20px;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 3px;
            padding: 2px 4px;
            border: 1px solid #ccc;
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
                font-size: 12px;
                font-weight: bold;
                color: #333;
                min-width: 20px;
                background: rgba(255, 255, 255, 0.8);
                border-radius: 3px;
                padding: 2px 4px;
                border: 1px solid #ccc;
            `;
            fretNumberRow.appendChild(fretLabel);
        }
        
        this.fretboardElement.appendChild(fretNumberRow);
    }
    
    /**
     * Add string name labels
     */
    addStringNames() {
        const stringContainer = document.createElement('div');
        stringContainer.style.cssText = `
            position: absolute;
            left: -50px;
            top: 40px; /* Adjusted for new padding */
            bottom: 60px; /* Adjusted for new padding */
            width: 40px;
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
                color: #333;
                background-color: rgba(255, 255, 255, 0.9);
                border-radius: 6px;
                height: 24px;
                font-size: 12px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
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
        neckContainer.style.cssText = `
            position: relative;
            height: 160px;
            margin: 0 40px 0 40px; /* Adjusted for new padding */
        `;
        
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
        const dotPositions = [3, 5, 7, 9, 12, 15];
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
            top: 40px; /* Adjusted for new padding */
            left: 40px; /* Match neck container margins exactly */
            right: 60px; /* Match neck container margins exactly */
            bottom: 60px; /* Adjusted for new padding */
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
                
                fretElement.style.cssText = `
                    position: absolute;
                    left: ${fretPosition}%;
                    top: ${stringPosition}%;
                    width: 30px;
                    height: 30px;
                    transform: ${fret === 0 ? 'translateY(-50%)' : 'translate(-50%, -50%)'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                
                // Add hover effect
                fretElement.addEventListener('mouseenter', () => {
                    if (!this.markers.has(`${stringIndex}-${fret}`)) {
                        if (fret === 0) {
                            fretElement.style.transform = 'translateY(-50%) scale(1.1)';
                        } else {
                            fretElement.style.transform = 'translate(-50%, -50%) scale(1.1)';
                        }
                    }
                });
                
                fretElement.addEventListener('mouseleave', () => {
                    if (!this.markers.has(`${stringIndex}-${fret}`)) {
                        if (fret === 0) {
                            fretElement.style.transform = 'translateY(-50%) scale(1)';
                        } else {
                            fretElement.style.transform = 'translate(-50%, -50%) scale(1)';
                        }
                    }
                });
                
                fretGrid.appendChild(fretElement);
            }
        });
        
        this.fretboardElement.appendChild(fretGrid);
    }
    
    /**
     * Calculate the note at a specific string and fret
     */
    calculateNote(openStringNote, fret) {
        const openMidi = noteToMidi(openStringNote);
        const frettedMidi = openMidi + fret + 12; // Add 12 to correct octave offset
        return noteToName(frettedMidi);
    }
    
    /**
     * Extract note name without octave from a full note string
     * Handles both "C/4" and "C4" formats
     */
    extractNoteName(noteString) {
        if (!noteString) return '';
        // Handle format like "C/4" or "C#/4"
        if (noteString.includes('/')) {
            return noteString.split('/')[0];
        }
        // Handle format like "C4" or "C#4" (fallback)
        return noteString.replace(/\d+$/, '');
    }
    
    /**
     * Extract octave number from a full note string
     * Returns null if no octave found
     */
    extractOctave(noteString) {
        if (!noteString) return null;
        // Handle format like "C/4"
        if (noteString.includes('/')) {
            const parts = noteString.split('/');
            return parts.length > 1 ? parseInt(parts[1]) : null;
        }
        // Handle format like "C4" (fallback)
        const match = noteString.match(/(\d+)$/);
        return match ? parseInt(match[1]) : null;
    }
    
    /**
     * Calculate the horizontal position for a fret (same logic as dot inlays)
     */
    calculateFretPosition(fret) {
        if (fret === 0) {
            return 0; // Nut position
        } else {
            // Position in the center of the fret space, same as dot inlays
            const prevFretPos = fret > 1 ? this.fretPositions[fret - 1] : 0;
            const currentFretPos = this.fretPositions[fret];
            return (prevFretPos + currentFretPos) / 2;
        }
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
                // Reset transform based on fret position
                if (fret === 0) {
                    fretElement.style.transform = 'translateY(-50%) scale(1)';
                } else {
                    fretElement.style.transform = 'translate(-50%, -50%) scale(1)';
                }
            }
        });
        this.markers.clear();
        
        // Only remove from scale tracking if not in an automatic update cycle
        if (!isUpdatingFretboards) {
            fretboardsShowingScale.delete(this.containerId);
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
            // Use the new custom styling system
            const markerSize = isRoot ? Math.max(size, 28) : size;
            const fontSize = Math.max(8, Math.floor(markerSize * 0.4));
            const borderWidthPx = isRoot ? Math.max(borderWidth, 3) : borderWidth;
            
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
                border: ${borderWidthPx}px solid ${borderColor};
                box-shadow: 0 ${Math.floor(markerSize * 0.15)}px ${Math.floor(markerSize * 0.3)}px rgba(0,0,0,0.4);
                z-index: 15;
                ${(isRoot && !disableAnimation) ? 'animation: rootPulse 2s infinite ease-in-out;' : ''}
            `;
        } else {
            // Use the original styling system
            marker.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: ${color};
                color: ${textColor};
                width: ${isRoot ? '28px' : '24px'};
                height: ${isRoot ? '28px' : '24px'};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${isRoot ? '12px' : '10px'};
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
                    color: DEFAULT_COLORS.secondary,
                    label: note
                });
            }
        });
    }
    
    /**
     * Mark scale notes with color coding based on scale degrees
     */
    markScale(scaleNotes, rootNote) {
        this.clearMarkers();
        
        // Normalize scale notes (remove octave numbers)
        const normalizedScaleNotes = scaleNotes.map(note => this.extractNoteName(note));
        const normalizedRoot = this.extractNoteName(rootNote);
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const note = this.calculateNote(stringNote, fret);
                const noteName = this.extractNoteName(note);
                
                const scaleIndex = normalizedScaleNotes.indexOf(noteName);
                if (scaleIndex !== -1) {
                    const scaleDegree = scaleIndex + 1;
                    const isRoot = noteName === normalizedRoot;
                    
                    this.markFret(stringIndex, fret, {
                        color: isRoot ? SCALE_COLORS[1] : SCALE_COLORS[scaleDegree] || DEFAULT_COLORS.primary,
                        label: noteName,
                        isRoot: isRoot
                    });
                }
            }
        });
        
        // Always add to tracking if showing scale, whether from user action or auto-update
        fretboardsShowingScale.add(this.containerId);
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
                    // Match both note name and octave
                    shouldMark = (noteName === targetNoteName && noteOctave === targetOctave);
                } else {
                    // Match just the note name, any octave
                    shouldMark = (noteName === targetNoteName);
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
            fretboardsShowingScale.delete(this.containerId);
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
            fretboardsShowingScale.delete(this.containerId);
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
            showScaleContext = true
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
                    const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
                    const scaleNotes = getScaleNotes(rootNote, intervals);
                    const normalizedScaleNotes = scaleNotes.map(note => this.extractNoteName(note));
                    
                    // Mark all scale notes with subtle grey markers (no labels)
                    this.tuning.forEach((stringNote, stringIndex) => {
                        for (let fret = 0; fret <= this.fretCount; fret++) {
                            const note = this.calculateNote(stringNote, fret);
                            const noteName = this.extractNoteName(note);
                            
                            if (normalizedScaleNotes.includes(noteName)) {
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
        
        // Find all positions for each chord tone and mark them with prominent colors
        const chordPositions = [];
        
        chordNotes.forEach((note, index) => {
            const noteName = this.extractNoteName(note);
            const positions = this.findNotePositions(noteName);
            
            positions.forEach(pos => {
                // Override any existing marker (including scale context markers) with chord tone marker
                this.markFret(pos.string, pos.fret, {
                    backgroundColor,
                    borderColor: colorMap[index % colorMap.length],
                    borderWidth: index === 0 ? borderWidth + 1 : borderWidth, // Root gets thicker border
                    textColor,
                    size: index === 0 ? size + 2 : size, // Root gets slightly larger
                    label: noteName,
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
        fretboardsShowingChords.add(this.containerId);
        // Remove from scale tracking since we're showing chords
        fretboardsShowingScale.delete(this.containerId);
    }
    
    /**
     * Find an optimal chord shape from available positions
     * @param {Array} positions - All available positions for chord tones
     * @param {Array} chordNotes - The chord notes to prioritize
     * @returns {Array} Optimal positions for chord shape
     */
    findOptimalChordShape(positions, chordNotes) {
        // Group positions by note
        const positionsByNote = {};
        positions.forEach(pos => {
            if (!positionsByNote[pos.note]) {
                positionsByNote[pos.note] = [];
            }
            positionsByNote[pos.note].push(pos);
        });
        
        // Try to find a compact chord shape
        const chordShape = [];
        const usedStrings = new Set();
        
        // Prioritize positions in a reasonable fret range (3-7 frets)
        for (let centerFret = 3; centerFret <= 12; centerFret++) {
            const candidateShape = [];
            const tempUsedStrings = new Set();
            
            chordNotes.forEach(note => {
                const noteName = this.extractNoteName(note);
                const notePositions = positionsByNote[noteName] || [];
                
                // Find closest position to centerFret on an unused string
                const bestPos = notePositions
                    .filter(pos => !tempUsedStrings.has(pos.string))
                    .filter(pos => Math.abs(pos.fret - centerFret) <= 4)
                    .sort((a, b) => Math.abs(a.fret - centerFret) - Math.abs(b.fret - centerFret))[0];
                
                if (bestPos) {
                    candidateShape.push(bestPos);
                    tempUsedStrings.add(bestPos.string);
                }
            });
            
            // If we found a good shape (at least 3 notes), use it
            if (candidateShape.length >= Math.min(3, chordNotes.length)) {
                return candidateShape.sort((a, b) => a.string - b.string);
            }
        }
        
        // Fallback: just take the first position of each note
        chordNotes.forEach(note => {
            const noteName = this.extractNoteName(note);
            const notePositions = positionsByNote[noteName] || [];
            if (notePositions.length > 0 && !usedStrings.has(notePositions[0].string)) {
                chordShape.push(notePositions[0]);
                usedStrings.add(notePositions[0].string);
            }
        });
        
        return chordShape.sort((a, b) => a.string - b.string);
    }
    
    /**
     * Get the note at a specific string and fret
     */
    getNoteAt(stringIndex, fret) {
        if (stringIndex < 0 || stringIndex >= this.tuning.length || fret < 0 || fret > this.fretCount) {
            return null;
        }
        return this.calculateNote(this.tuning[stringIndex], fret);
    }
    
    /**
     * Find all positions of a specific note on the fretboard
     */
    findNotePositions(targetNote) {
        const positions = [];
        
        // Check if targeting a specific octave or all octaves
        const hasSpecificOctave = targetNote.includes('/');
        let targetNoteName, targetOctave;
        
        if (hasSpecificOctave) {
            targetNoteName = this.extractNoteName(targetNote);
            targetOctave = this.extractOctave(targetNote);
        } else {
            targetNoteName = targetNote;
            targetOctave = null;
        }
        
        this.tuning.forEach((stringNote, stringIndex) => {
            for (let fret = 0; fret <= this.fretCount; fret++) {
                const note = this.calculateNote(stringNote, fret);
                const noteName = this.extractNoteName(note);
                const noteOctave = this.extractOctave(note);
                
                let shouldInclude = false;
                
                if (hasSpecificOctave) {
                    // Match both note name and octave
                    shouldInclude = (noteName === targetNoteName && noteOctave === targetOctave);
                } else {
                    // Match just the note name, any octave
                    shouldInclude = (noteName === targetNoteName);
                }
                
                if (shouldInclude) {
                    positions.push({ string: stringIndex, fret, note });
                }
            }
        });
        
        return positions;
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
        
        // Position the container relative to the fret grid
        boxContainer.style.cssText = `
            position: absolute;
            top: 40px; /* Adjusted for new padding */
            left: 40px; /* Adjusted for new padding */
            right: 40px; /* Adjusted for new padding */
            bottom: 60px; /* Adjusted for new padding */
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
        
        // Position the container relative to the fret grid
        lineContainer.style.cssText = `
            position: absolute;
            top: 40px; /* Adjusted for new padding */
            left: 40px; /* Adjusted for new padding */
            right: 40px; /* Adjusted for new padding */
            bottom: 60px; /* Adjusted for new padding */
            pointer-events: none;
            z-index: 12;
        `;
        
        this.fretboardElement.appendChild(lineContainer);
        
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
                    // Match both note name and octave
                    isMatch = fretNoteName === targetNoteName && fretOctave === targetOctave;
                } else {
                    // Match note name only (any octave)
                    isMatch = fretNoteName === targetNoteName;
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
        const positions = [];
        
        // Check if this pattern is restricted to open voicing
        if (pattern.openVoicingOnly && pattern.fixedPosition !== undefined) {
            if (rootFret !== pattern.fixedPosition) {
                return null; // Pattern only works at fixed position
            }
        }
        
        // Check fret range constraints
        if (rootFret < pattern.minFret || rootFret > pattern.maxFret) {
            return null;
        }
        
        // Calculate positions for each note in the pattern
        for (const note of pattern.notes) {
            const actualFret = rootFret + note.fretOffset;
            
            // Check if fret is valid (0-15 range)
            if (actualFret < 0 || actualFret > this.fretCount) {
                continue; // Skip invalid fret positions
            }
            
            positions.push({
                string: note.string,
                fret: actualFret,
                interval: note.interval,
                label: note.label
            });
        }
        
        return positions.length > 0 ? positions : null;
    }

    /**
     * Find all possible chord pattern matches for given chord notes
     * @param {Array} chordNotes - Array of note names that make up the chord
     * @param {string} rootNote - The root note of the chord
     * @param {Array} patternNames - Optional array of specific pattern names to check
     * @returns {Array} Array of matching pattern results
     */
    findChordPatternMatches(chordNotes, rootNote, patternNames = null) {
        const patterns = getChordPatterns();
        const matches = [];
        
        // Convert chord notes to a set for easy lookup
        const chordNoteSet = new Set(chordNotes.map(note => this.extractNoteName(note)));
        
        // Extract just the note name from the root note (remove octave)
        const rootNoteName = this.extractNoteName(rootNote);
        
        // Check each pattern (or only specified patterns)
        const patternsToCheck = patternNames ? 
            patternNames.filter(name => patterns[name]).map(name => ({name, pattern: patterns[name]})) :
            Object.entries(patterns).map(([name, pattern]) => ({name, pattern}));
        
        for (const {name, pattern} of patternsToCheck) {
            // console.log(`Checking pattern: ${name} for root note: ${rootNoteName} (all octaves)`);
            // Find ALL positions of the root note (all octaves) for this pattern
            const rootPositions = this.findNotePositions(rootNoteName);
            
            for (const rootPos of rootPositions) {
                // Only check positions on the pattern's root string
                if (rootPos.string !== pattern.rootString) {
                    // console.log(`Skipping pattern ${name} for root ${rootNoteName} at ${rootPos.string}:${rootPos.fret} - root string mismatch (expected string ${pattern.rootString})`);
                    continue;
                }
                
                // console.log(`Testing pattern ${name} with root ${rootNoteName} at string ${rootPos.string}, fret ${rootPos.fret}`);
                
                const positions = this.calculateChordPatternPositions(pattern, rootPos.fret);
                if (!positions) {
                    // console.log(`Skipping pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - invalid positions`);
                    continue;
                }
                
                // Check if all pattern notes match the chord
                let isValidMatch = true;
                const patternNotes = [];
                
                for (const pos of positions) {
                    const noteAtPosition = this.getNoteAt(pos.string, pos.fret);
                    if (noteAtPosition) {
                        // console.log(`Found note ${noteAtPosition} at position ${pos.string}:${pos.fret}`);
                        const noteName = this.extractNoteName(noteAtPosition);
                        patternNotes.push(noteName);
                        
                        // Check if this note is in the chord
                        if (!chordNoteSet.has(noteName)) {
                            isValidMatch = false;
                            // console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - note ${noteName} not in chord [${Array.from(chordNoteSet).join(', ')}]`);
                            break;
                        }
                    } else {
                        // console.log(`Pattern ${name} - no note found at string ${pos.string}, fret ${pos.fret}`);
                        isValidMatch = false;
                        break;
                    }
                }
                
                if (isValidMatch && patternNotes.length > 0) {
                    // Additional check: ensure all chord notes are represented in the pattern
                    const patternNoteSet = new Set(patternNotes);
                    const allChordNotesPresent = Array.from(chordNoteSet).every(chordNote => patternNoteSet.has(chordNote));
                    
                    if (allChordNotesPresent) {
                        matches.push({
                            patternName: name,
                            pattern: pattern,
                            rootPosition: rootPos,
                            positions: positions,
                            patternNotes: patternNotes
                        });
                        // console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - VALID MATCH (all chord notes present)`);
                    } else {
                        // console.log(`Pattern ${name} for root ${rootNoteName} at fret ${rootPos.fret} - REJECTED (missing chord notes: ${Array.from(chordNoteSet).filter(note => !patternNoteSet.has(note)).join(', ')})`);
                    }
                }
            }
        }
        
        return matches;
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

// Global fretboard instances
let fretboardInstances = new Map();

// Track which fretboards are showing the current scale
let fretboardsShowingScale = new Set();

// Track which fretboards are showing chords
let fretboardsShowingChords = new Set();

// Track current chord display state
let currentChordType = 'triads'; // 'triads' or 'sevenths'
let currentDisplayedChord = null; // Currently displayed chord index (0-6)
let isInHoverState = false; // Track if we're currently in a temporary hover state

// Track chord grid state
let currentChordGridSelection = null; // Track permanent chord grid selections {note, chordType}

// Color cycle for chord pattern lines (based on lowest fret position)
const CHORD_LINE_COLORS = [
    '#ff6b35', // Orange
    '#4ecdc4', // Teal
    '#45b7d1', // Blue
    '#f9ca24', // Yellow
    '#f0932b', // Dark orange
    '#eb4d4b', // Red
    '#6c5ce7', // Purple
    '#a55eea', // Light purple
    '#26de81', // Green
    '#fd79a8'  // Pink
];

// Flag to prevent infinite update loops
let isUpdatingFretboards = false;

/**
 * Create a new fretboard instance
 */
function createFretboard(containerId, options = {}) {
    const fretboard = new Fretboard(containerId, options);
    fretboardInstances.set(containerId, fretboard);
    return fretboard;
}

/**
 * Get an existing fretboard instance
 */
function getFretboard(containerId) {
    return fretboardInstances.get(containerId);
}

/**
 * Initialize the main fretboard in the fretNotPlaceholder
 */
function initializeFretboard() {
    const mainFretboard = createFretboard('fretNotPlaceholder', {
        showFretNumbers: true,
        showStringNames: false
    });
    
    // Create control panel
    createFretboardControls(mainFretboard);
    
    // Set the scale button as active by default and show the scale
    currentDisplayedChord = 0; // Scale button is index 0
    showScaleOnFretboard();
    updateChordButtonStyles();
    
    return mainFretboard;
}

/**
 * Create control buttons for the fretboard
 */
function createFretboardControls(fretboard) {
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: linear-gradient(to bottom, #f8f8f8, #e8e8e8);
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
    clearButton.addEventListener('click', () => {
        // Clear hover state flag
        isInHoverState = false;
        
        fretboard.clearMarkers();
        fretboard.clearChordLines();
        // Clear all tracking state
        fretboardsShowingScale.delete(fretboard.containerId);
        fretboardsShowingChords.delete(fretboard.containerId);
        currentDisplayedChord = null;
        currentChordGridSelection = null; // Clear chord grid selection
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
    showAllButton.addEventListener('click', () => {
        fretboard.markAllNotes();
        // Remove this fretboard from the scale tracking set since it's now showing all notes
        fretboardsShowingScale.delete(fretboard.containerId);
    });
    
    // Show current scale button
    const showScaleButton = document.createElement('button');
    showScaleButton.textContent = 'Show Current Scale';
    showScaleButton.style.cssText = buttonStyle + `
        background: linear-gradient(to bottom, #ff6b35, #e55a2b);
    `;
    showScaleButton.addEventListener('mouseenter', () => {
        showScaleButton.style.cssText = buttonStyle + buttonHoverStyle + `
            background: linear-gradient(to bottom, #ff7b45, #f56a3b);
        `;
    });
    showScaleButton.addEventListener('mouseleave', () => {
        showScaleButton.style.cssText = buttonStyle + `
            background: linear-gradient(to bottom, #ff6b35, #e55a2b);
        `;
    });
    showScaleButton.addEventListener('click', () => {
        // Get current scale from the scale generator
        try {
            const primaryScale = getPrimaryScale();
            if (!primaryScale) {
                console.warn('No primary scale available');
                return;
            }
            
            const [family, mode] = primaryScale.split('-');
            const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
            const rootNote = getPrimaryRootNote();
            const scaleNotes = getScaleNotes(rootNote, intervals);
            
            fretboard.markScale(scaleNotes, rootNote);
            
            // Track that this fretboard is showing the current scale
            fretboardsShowingScale.add(fretboard.containerId);
            
            // Set the Scale button as the current selection
            currentDisplayedChord = 0;
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
    clearBoxesButton.addEventListener('click', () => {
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
    demoBoxButton.addEventListener('click', () => {
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
    markNoteButton.addEventListener('click', () => {
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
    demoNotesButton.addEventListener('click', () => {
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
        color: #333;
        margin-right: 4px;
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
        currentChordType = chordTypeSelect.value;
        // Update displayed chord if one is currently shown
        if (currentDisplayedChord !== null && currentDisplayedChord > 0) {
            // Only update if a chord is selected (not scale)
            showChordOnFretboard(currentDisplayedChord - 1);
        }
    });
    
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
            if (currentDisplayedChord !== index) {
                chordButton.style.background = 'linear-gradient(to bottom, #e2e6ea, #dae0e5)';
                chordButton.style.transform = 'translateY(-1px)';
                // Set hover state flag
                isInHoverState = true;
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
            if (currentDisplayedChord !== index) {
                chordButton.style.background = 'linear-gradient(to bottom, #f8f9fa, #e9ecef)';
                chordButton.style.transform = 'translateY(0)';
                // Clear hover state flag
                isInHoverState = false;
                // Use centralized restoration function that handles both Roman numerals and chord grid
                restoreFretboardState();
            }
        });
        
        // Click to toggle chord/scale display
        chordButton.addEventListener('click', () => {
            // Clear hover state flag since we're making a permanent selection
            isInHoverState = false;
            
            // Clear any chord grid selection since we're now using Roman numerals
            currentChordGridSelection = null;
            
            if (currentDisplayedChord === index) {
                // If this option is already displayed, clear it
                currentDisplayedChord = null;
                fretboard.clearMarkers();
                fretboard.clearChordLines();
                fretboardsShowingChords.delete(fretboard.containerId);
                fretboardsShowingScale.delete(fretboard.containerId);
                // Clear chord info display
                updateChordInfoDisplay();
                updateChordButtonStyles();
            } else {
                // Display this option
                currentDisplayedChord = index;
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
    
    noteInputContainer.appendChild(noteInput);
    noteInputContainer.appendChild(markNoteButton);
    
    controlsContainer.appendChild(clearButton);
    controlsContainer.appendChild(showAllButton);
    // controlsContainer.appendChild(showScaleButton);
    controlsContainer.appendChild(chordControlsContainer);
    controlsContainer.appendChild(chordInfoContainer);
    
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
    
    // Insert controls before the fretboard
    fretboard.container.insertBefore(controlsContainer, fretboard.fretboardElement);
    
    // Add chord button grid after the fretboard
    const chordGrid = createChordButtonGrid();
    if (chordGrid) {
        fretboard.container.appendChild(chordGrid);
    }
}

/**
 * Create chord button grid directly (avoiding circular dependency)
 */
function createChordButtonGrid() {
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const commonChordTypes = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', 'm7b5'];
    
    let gridContainer = document.createElement('div');
    gridContainer.style.cssText = `
        margin: 20px auto;
        max-width: 600px;
        background: #f8f9fa;
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
        color: #333;
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
            cell.style.cssText = `
                width: 30px;
                height: 30px;
                border: 1px solid #333;
                text-align: center;
                vertical-align: middle;
                background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
                padding: 0;
                position: relative;
            `;
            
            // Add hover and click functionality directly to the cell
            cell.addEventListener('mouseenter', () => {
                cell.style.background = 'linear-gradient(to bottom, #e2e6ea, #dae0e5)';
                cell.style.transform = 'scale(1.1)';
                cell.style.zIndex = '10';
                
                // Show chord pattern on fretboard temporarily
                showChordPatternOnFretboard(note, chordType, true);
            });
            
            cell.addEventListener('mouseleave', () => {
                cell.style.background = 'linear-gradient(to bottom, #f8f9fa, #e9ecef)';
                cell.style.transform = 'scale(1)';
                cell.style.zIndex = '1';
                
                // Restore previous fretboard state
                restoreFretboardState();
            });
            
            cell.addEventListener('click', () => {
                // Toggle persistent display
                showChordPatternOnFretboard(note, chordType, false);
            });
            
            row.appendChild(cell);
        }
        
        grid.appendChild(row);
    }
    
    gridContainer.appendChild(gridLabel);
    gridContainer.appendChild(grid);
    
    return gridContainer;
}

/**
 * Show chord pattern on fretboard with scale context (local version)
 */
function showChordPatternOnFretboard(rootNote, chordType, isTemporary) {
    try {
        // If this is a permanent selection, update the tracking state
        if (!isTemporary) {
            currentChordGridSelection = { note: rootNote, chordType: chordType };
            // Clear Roman numeral selection since we're now showing a chord grid selection
            currentDisplayedChord = null;
            updateChordButtonStyles();
        }
        
        // Get current scale information
        const primaryScale = getPrimaryScale();
        const scaleRootNote = getPrimaryRootNote();
        
        if (primaryScale && scaleRootNote) {
            const [family, mode] = primaryScale.split('-');
            const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
            const scaleNotes = getScaleNotes(scaleRootNote, intervals);
            
            // Process the chord to get its notes
            const chordName = rootNote + chordType;
            const chordInfo = processChord(chordName);
            
            if (chordInfo && chordInfo.notes) {
                // Get the fretboard instance
                const fretboard = getFretboard('fretNotPlaceholder');
                if (fretboard) {
                    // Clear previous markers and lines
                    fretboard.clearMarkers();
                    fretboard.clearChordLines();
                    
                    // First, mark all scale notes in grey
                    scaleNotes.forEach(note => {
                        const noteName = typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note;
                        const positions = fretboard.findNotePositions(noteName);
                        
                        positions.forEach(pos => {
                            fretboard.markFret(pos.string, pos.fret, {
                                backgroundColor: '#e0e0e0',
                                borderColor: '#999999',
                                borderWidth: 1,
                                textColor: '#666666',
                                size: 20,
                                label: noteName,
                                isRoot: false,
                                useCustomStyle: true
                            });
                        });
                    });
                    
                    // Then, mark chord notes with their usual colorings
                    const chordNotes = chordInfo.notes.map(note => 
                        typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note
                    );
                    
                    // Remove scale notes octave info for comparison
                    const scaleNoteNames = scaleNotes.map(note => 
                        typeof note === 'string' && note.includes('/') ? note.split('/')[0] : note
                    );
                    
                    const colorMap = ['#ff4444', '#ffcc44', '#44ff44', '#4444ff']; // Root, 3rd, 5th, 7th
                    
                    chordNotes.forEach((note, index) => {
                        const positions = fretboard.findNotePositions(note);
                        const isInScale = scaleNoteNames.includes(note);
                        const isRoot = index === 0;
                        
                        positions.forEach(pos => {
                            fretboard.markFret(pos.string, pos.fret, {
                                backgroundColor: '#ffffff',
                                borderColor: isInScale ? colorMap[index % colorMap.length] : '#000000ff', // Distinct color for out-of-scale notes
                                borderWidth: isRoot ? 4 : 3,
                                textColor: '#333333',
                                size: isRoot ? 30 : 26,
                                label: note,
                                isRoot: isRoot,
                                useCustomStyle: true
                            });
                        });
                    });
                    
                    // Add chord pattern lines - map chord types to pattern types
                    const chordTypeMapping = {
                        'Major': 'major',
                        'Minor': 'minor',
                        '7': 'dominant7',
                        'maj7': 'major7',
                        'm7': 'minor7',
                        'dim': 'dim',
                        'dim7': 'dim7',
                        'aug': 'aug',
                        'sus2': 'sus2',
                        'sus4': 'sus4',
                        '5': 'power',
                        'm7b5': 'm7b5'
                    };
                    
                    const patternType = chordTypeMapping[chordType];
                    if (patternType) {
                        // Get patterns only for this specific chord type to optimize performance
                        const specificPatterns = getPatternsByChordType(patternType);
                        const chordMatches = fretboard.findChordPatternMatches(chordNotes, chordNotes[0], specificPatterns);
                        
                        if (chordMatches.length > 0) {
                            // Sort matches by lowest fret position for color assignment
                            const sortedMatches = chordMatches.sort((a, b) => {
                                const minFretA = Math.min(...a.positions.map(pos => pos.fret));
                                const minFretB = Math.min(...b.positions.map(pos => pos.fret));
                                return minFretA - minFretB;
                            });
                            
                            // Color cycle for chord pattern lines
                            const CHORD_LINE_COLORS = [
                                '#ff6b35', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
                                '#eb4d4b', '#6c5ce7', '#a55eea', '#26de81', '#fd79a8'
                            ];
                            
                            // Add chord pattern lines on top of the traditional markers
                            sortedMatches.forEach((match, matchIndex) => {
                                const lineColor = CHORD_LINE_COLORS[matchIndex % CHORD_LINE_COLORS.length];
                                const linePoints = match.positions.map(pos => ({
                                    string: pos.string,
                                    fret: pos.fret
                                }));
                                
                                // Only draw lines if we have at least 2 points
                                if (linePoints.length >= 2) {
                                    fretboard.drawChordLine(`${chordName}-pattern-${matchIndex}`, linePoints, {
                                        color: lineColor,
                                        lineWidth: 30,
                                        style: 'solid',
                                        opacity: 0.7,
                                    });
                                }
                            });
                            
                            console.log(`Displaying ${chordName} with ${sortedMatches.length} chord pattern lines ${isTemporary ? 'temporarily' : 'persistently'}`);
                        } else {
                            console.log(`Displaying ${chordName} (no chord patterns found for type: ${patternType})`);
                        }
                    } else {
                        console.log(`Displaying ${chordName} (no pattern mapping for chord type: ${chordType})`);
                    }
                    
                    console.log(`Scale: ${scaleRootNote} ${family} (${scaleNoteNames.join(', ')})`);
                    console.log(`Chord: ${chordNotes.join(', ')}`);
                    
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
    if (currentChordGridSelection) {
        // Restore the chord grid selection
        showChordPatternOnFretboard(currentChordGridSelection.note, currentChordGridSelection.chordType, false);
        return;
    }
    
    // Try to restore the previous Roman numeral state
    if (currentDisplayedChord === null) {
        // Clear fretboard and chord info display
        const fretboard = getFretboard('fretNotPlaceholder');
        if (fretboard) {
            fretboard.clearMarkers();
            fretboard.clearChordLines();
        }
        updateChordInfoDisplay(); // Clear chord info display
    } else if (currentDisplayedChord === 0) {
        // Show scale
        showScaleOnFretboard();
    } else {
        // Show current chord
        showChordOnFretboard(currentDisplayedChord - 1);
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
        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
        
        // Generate chords
        const chordLength = currentChordType === 'sevenths' ? 4 : 3;
        const syntheticChords = generateSyntheticChords({ intervals }, chordLength, rootNote);
        
        if (chordIndex >= 0 && chordIndex < syntheticChords.length) {
            const chord = syntheticChords[chordIndex];
            const romanNumerals = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
            const chordName = `${romanNumerals[chordIndex]} (${currentChordType})`;
            console.log(`Displaying chord: ${chordName} (${chord.join(', ')})`);
            
            // Update chord info display
            updateChordInfoDisplay(chordName, chord);
            
            // Always start with traditional chord display to show full scale context
            fretboard.displayChord(chord, chordName, {
                clearFirst: true,
                showLines: false,
                showScaleContext: true
            });
            
            // Then add chord pattern lines on top
            const chordMatches = fretboard.findChordPatternMatches(chord, chord[0]);
            
            if (chordMatches.length > 0) {
                // Sort matches by lowest fret position for color assignment
                const sortedMatches = chordMatches.sort((a, b) => {
                    const minFretA = Math.min(...a.positions.map(pos => pos.fret));
                    const minFretB = Math.min(...b.positions.map(pos => pos.fret));
                    return minFretA - minFretB;
                });
                
                // Add chord pattern lines on top of the traditional markers
                sortedMatches.forEach((match, matchIndex) => {
                    const colorIndex = matchIndex % CHORD_LINE_COLORS.length;
                    const lineColor = CHORD_LINE_COLORS[colorIndex];
                    const patternId = `roman-${chordIndex}-${match.patternName}-${match.rootPosition.fret}`;
                    
                    // Draw connecting lines with thick lines and no labels
                    if (match.positions.length > 1) {
                        const linePoints = match.positions.map(pos => ({
                            string: pos.string,
                            fret: pos.fret
                        }));
                        
                        fretboard.drawChordLine(patternId, linePoints, {
                            color: lineColor,
                            lineWidth: 40, // Thicker lines for chord patterns
                            style: 'solid',
                            opacity: 0.8,
                            label: '', // No text labels as requested
                            labelPosition: 'middle'
                        });
                    }
                });
                
                console.log(`Displaying traditional chord markers with ${sortedMatches.length} chord pattern lines for ${chordName}`);
            } else {
                console.log(`Displaying traditional chord markers for ${chordName} (no chord patterns found)`);
            }
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
        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
        const scaleNotes = getScaleNotes(rootNote, intervals);
        
        // Update chord info display to show scale information
        const scaleName = `${rootNote} ${family} (Mode ${mode})`;
        updateChordInfoDisplay(scaleName, scaleNotes);
        
        // Clear markers and lines first to prevent overlap
        fretboard.clearMarkers();
        fretboard.clearChordLines();
        
        fretboard.markScale(scaleNotes, rootNote);
        
        if (!isTemporary) {
            // Add to scale tracking only if this is a permanent selection
            fretboardsShowingScale.add(fretboard.containerId);
            fretboardsShowingChords.delete(fretboard.containerId);
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
        // Show chord information
        chordNameDisplay.textContent = chordName;
        chordNotesDisplay.textContent = `Notes: ${chordNotes.join(' - ')}`;
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
        if (currentDisplayedChord === chordIndex) {
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
    if ((fretboardsShowingScale.size === 0 && fretboardsShowingChords.size === 0) || isUpdatingFretboards) return;
    
    try {
        isUpdatingFretboards = true;
        
        const { primaryScale, rootNote, scaleNotes } = scaleData;
        
        if (!primaryScale || !rootNote || !scaleNotes) {
            console.warn('Invalid scale data for fretboard update');
            return;
        }
        
        console.log(`Updating fretboards for scale change: ${rootNote} ${primaryScale}`);
        
        // Update all fretboards that are showing the scale
        fretboardsShowingScale.forEach(containerId => {
            const fretboard = fretboardInstances.get(containerId);
            if (fretboard) {
                fretboard.markScale(scaleNotes, rootNote);
            }
        });
        
        // Update all fretboards that are showing chords
        fretboardsShowingChords.forEach(containerId => {
            const fretboard = fretboardInstances.get(containerId);
            if (fretboard && currentDisplayedChord !== null) {
                // If we're in a hover state, show the full scale instead of chord
                if (isInHoverState) {
                    fretboard.clearMarkers();
                    fretboard.clearChordLines();
                    fretboard.markScale(scaleNotes, rootNote);
                    return;
                }
                
                // Re-generate and display the current chord with new scale
                try {
                    if (currentDisplayedChord === 0) {
                        // Scale is selected, show scale
                        showScaleOnFretboard();
                    } else {
                        // Chord is selected (adjust index for chord array)
                        const [family, mode] = primaryScale.split('-');
                        const intervals = HeptatonicScales[family][parseInt(mode, 10) - 1].intervals;
                        const chordLength = currentChordType === 'sevenths' ? 4 : 3;
                        const syntheticChords = generateSyntheticChords({ intervals }, chordLength, rootNote);
                        
                        const chordIndex = currentDisplayedChord - 1;
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
        isUpdatingFretboards = false;
    }
}

// Listen for scale change events from the scale generator
let lastScaleUpdateTime = 0;
let lastScaleData = null;
window.addEventListener('scaleChanged', (event) => {
    // Debounce the updates to prevent rapid-fire events
    const now = Date.now();
    if (now - lastScaleUpdateTime < 200) { // Increased debounce to 200ms
        return;
    }
    
    // Check if the scale data has actually changed
    const currentScaleData = event.detail;
    const scaleKey = `${currentScaleData.rootNote}-${currentScaleData.primaryScale}`;
    const lastScaleKey = lastScaleData ? `${lastScaleData.rootNote}-${lastScaleData.primaryScale}` : null;
    
    if (scaleKey === lastScaleKey) {
        // Scale hasn't actually changed, skip update
        return;
    }
    
    lastScaleUpdateTime = now;
    lastScaleData = currentScaleData;
    
    updateFretboardsForScaleChange(event.detail);
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
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootIndex = notes.indexOf(root);
        const offset = type === 'major' ? 4 : 3;
        return notes[(rootIndex + offset) % 12];
    };
    
    const getFifth = (root) => {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootIndex = notes.indexOf(root);
        return notes[(rootIndex + 7) % 12];
    };
    
    const getSeventh = (root, type) => {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
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
    currentDisplayedChord,
    GUITAR_TUNING,
    SCALE_COLORS
};



// Initialize Fretboard
let mainFretboard = null;
try {
    mainFretboard = initializeFretboard();
    console.log('Fretboard initialized successfully');
} catch (error) {
    console.warn('Failed to initialize fretboard:', error);
}

// Make fretboard globally accessible for other modules
window.mainFretboard = mainFretboard;

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