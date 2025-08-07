export const minTime = 0.005;

export const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

// Keyboard key to note map
const noteMap = {
    'a': 'C0',
    'w': 'C#0',
    's': 'D0',
    'e': 'D#0',
    'd': 'E0',
    'f': 'F0',
    't': 'F#0',
    'g': 'G0',
    'y': 'G#0',
    'h': 'A0',
    'u': 'A#0',
    'j': 'B0',
    'k': 'C1',
    'o': 'C#1',
    'l': 'D1',
    'p': 'D#1',
    ';': 'E1',
};

// Frequency of 4th octave
const freqMap = {
    'C': 261.63,
    'C#': 277.18,
    'D': 293.66,
    'D#': 311.13,
    'E': 329.63,
    'F': 349.23,
    'F#': 369.99,
    'G': 392.00,
    'G#': 415.30,
    'A': 440.00,
    'A#': 466.16,
    'B': 493.88,
};

// Gets the note info based on the key pressed and octaveMod
export const getNoteInfo = (key, octaveMod = 4) => {
    const noteInfo = noteMap[key];
    if (!noteInfo) return false;

    const note = noteInfo.slice(0, -1);
    const oct = parseInt(noteInfo.slice(-1)) + octaveMod;
    const freq = freqMap[note] * Math.pow(2, oct - 4);

    return { note: `${note}${oct}`, oct, freq };
};

// - SVG Path Maps -
export const WAVEFORM = {
    off: 'M 15 25 L 35 25 M 20 20 L 20 30 M 30 20 L 30 30', // Off symbol (line with two bars)
    sine: 'M 10 25 Q 18 10 25 25 Q 32 40 40 25',
    triangle: 'M 10 25 L 19 16 L 31 34 L 40 25',
    square: 'M 10 32 L 10 18 L 25 18 L 25 32 L 40 32 L 40 18',
    sawtooth: 'M 10 32 L 10 18 L 25 32 L 25 18 L 40 32 L 40 18',
    square_dc: 'M 10 32 L 10 18 L 17 18 L 17 32 L 40 32 L 40 18', // Asymmetric square for duty cycle
};

export const FILTER = {
    lowpass: 'M 10 22 L 26 22 L 31 16 L 40 34',
    highpass: 'M 40 22 L 24 22 L 19 16 L 10 34',
    bandpass: 'M 10 34 L 15 34 L 21 16 L 29 16 L 35 34 L 40 34',
    notch: 'M 10 16 L 15 16 L 21 34 L 29 34 L 35 16 L 40 16',
    lowshelf: 'M 10 16 L 20 16 L 30 34 L 40 34',
    highshelf: 'M 10 34 L 20 34 L 30 16 L 40 16',
};

export const REVERB = {
    reverb1: 'M 20 20 A 8.5 5 0 1 1 30 20 A 3 2.5 0 1 1 30 30 A 8.5 5 0 1 1 20 30 A 3 2.5 0 1 1 20 20',
    reverb2: 'M 18 18 A 4 4 0 1 1 32 18 A 7 7 0 1 1 32 32 A 4 4 0 1 1 18 32 A 7 7 0 1 1 18 18',
    reverb3: 'M 20 22 A 2 2 0 1 1 30 22 A 3 1 0 1 1 30 28 A 2 2 0 1 1 20 28 A 3 1 0 1 1 20 22',
    reverb4: 'M 22 20 Q 25 22 28 20 A 8 8 0 1 1 28 30 Q 25 28 22 30 A 8 8 0 1 1 22 20',
    reverb5: 'M 22 20 A 4 4 0 1 1 28 20 A 6 6 0 1 1 28 30 A 4 4 0 1 1 22 30 A 6 6 0 1 1 22 20',
    reverb6: 'M 15 25 A 10 10 0 1 1 15 25.1',
};

export const NOISE = {
    white: 'M 10 15 L 12 30 L 14 10 L 16 35 L 18 20 L 20 5 L 22 40 L 24 25 L 26 15 L 28 35 L 30 10 L 32 30 L 34 20 L 36 40 L 38 15 L 40 25',
    pink: 'M 10 20 L 12 25 L 14 18 L 16 28 L 18 22 L 20 15 L 22 32 L 24 26 L 26 20 L 28 30 L 30 18 L 32 25 L 34 22 L 36 28 L 38 20 L 40 24',
    brown: 'M 10 25 Q 12 22 14 24 Q 16 26 18 25 Q 20 23 22 26 Q 24 28 26 26 Q 28 24 30 25 Q 32 27 34 26 Q 36 24 38 25 Q 40 27 40 25',
};

export const ENVELOPE_SHAPE = {
    linear: 'M 10 34 L 40 16',
    exponential: 'M 10 34 Q 20 30 40 16',
    logarithmic: 'M 10 34 Q 30 20 40 16',
    sine: 'M 10 34 Q 25 20 40 16',
    cosine: 'M 10 34 Q 25 28 40 16',
    smooth: 'M 10 34 Q 15 32 25 25 Q 35 18 40 16',
    sharp: 'M 10 34 L 15 32 Q 25 22 40 16',
    curved: 'M 10 34 C 15 32 20 28 25 24 C 30 20 35 18 40 16',
    steep: 'M 10 34 Q 12 30 15 20 Q 25 16 40 16',
    gentle: 'M 10 34 Q 25 32 35 28 Q 38 24 40 16',
    bounce: 'M 10 34 Q 20 28 25 30 Q 30 24 35 26 Q 38 20 40 16',
    overshoot: 'M 10 34 Q 25 18 30 14 Q 35 16 40 16',
};

/**
 * Generates an envelope curve based on shape and exponent
 * @param {number} initialLevel - Starting value of the envelope
 * @param {number} finalLevel - Ending value of the envelope
 * @param {string} shape - Shape type from ENVELOPE_SHAPE keys
 * @param {number} exponent - Exponential factor (0.1 to 4.0)
 * @param {number} steps - Number of steps in the output array (default: 100)
 * @returns {Array<number>} Array of envelope values from initial to final level
 */
export const generateEnvelopeCurve = (initialLevel, finalLevel, shape, exponent = 2, steps = 100) => {
    if (steps < 2) return [initialLevel, finalLevel];
    
    const curve = [];
    const range = finalLevel - initialLevel;
    
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1); // Normalized time (0 to 1)
        let scaledT;
        
        switch (shape) {
            case 'linear':
                scaledT = t;
                break;
                
            case 'exponential':
                scaledT = Math.pow(t, exponent);
                break;
                
            case 'logarithmic':
                scaledT = 1 - Math.pow(1 - t, exponent);
                break;
                
            case 'sine':
                scaledT = Math.sin(t * Math.PI / 2);
                if (exponent !== 1) {
                    scaledT = Math.pow(scaledT, exponent);
                }
                break;
                
            case 'cosine':
                scaledT = 1 - Math.cos(t * Math.PI / 2);
                if (exponent !== 1) {
                    scaledT = Math.pow(scaledT, exponent);
                }
                break;
                
            case 'smooth':
                // S-curve using smoothstep
                scaledT = t * t * (3 - 2 * t);
                if (exponent !== 1) {
                    scaledT = Math.pow(scaledT, exponent);
                }
                break;
                
            case 'sharp':
                // Sharp initial transition then smooth
                scaledT = t < 0.2 ? Math.pow(t / 0.2, exponent) * 0.6 : 0.6 + (t - 0.2) / 0.8 * 0.4;
                break;
                
            case 'curved':
                // Cubic bezier approximation
                scaledT = t * t * t * (t * (t * 6 - 15) + 10);
                if (exponent !== 1) {
                    scaledT = Math.pow(scaledT, exponent);
                }
                break;
                
            case 'steep':
                // Very steep initial curve
                scaledT = 1 - Math.pow(1 - t, exponent * 2);
                break;
                
            case 'gentle':
                // Very gentle curve
                scaledT = Math.pow(t, exponent * 0.5);
                break;
                
            case 'bounce':
                // Overshoot and settle
                if (t < 0.7) {
                    scaledT = Math.pow(t / 0.7, exponent) * 1.2;
                } else {
                    const overshoot = 1.2 - ((t - 0.7) / 0.3) * 0.2;
                    scaledT = Math.max(overshoot, 1);
                }
                break;
                
            case 'overshoot':
                // Overshoot past target then return
                if (t < 0.6) {
                    scaledT = Math.pow(t / 0.6, exponent) * 1.3;
                } else {
                    scaledT = 1.3 - ((t - 0.6) / 0.4) * 0.3;
                }
                break;
                
            default:
                scaledT = t; // Fallback to linear
        }
        
        // Clamp scaledT to reasonable bounds
        scaledT = Math.max(0, Math.min(2, scaledT));
        
        // Calculate final value
        const value = initialLevel + range * scaledT;
        curve.push(value);
    }
    
    return curve;
};
