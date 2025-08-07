import { noteToMidi, noteToName } from './midi';
import { identifySyntheticChords } from './intervals';

// Cache for precomputed chords
let scaleChordCache = new Map();

let HeptatonicScales = {
    'Major': [
        {'name': 'Ionian', 'intervals': ['W', 'W', 'H', 'W', 'W', 'W', 'H'], 'alternativeNames': ['Ionian', 'Major']},
        {'name': 'Dorian', 'intervals': ['W', 'H', 'W', 'W', 'W', 'H', 'W'], 'alternativeNames': ['Dorian']},
        {'name': 'Phrygian', 'intervals': ['H', 'W', 'W', 'W', 'H', 'W', 'W'], 'alternativeNames': ['Phrygian']},
        {'name': 'Lydian', 'intervals':   ['W', 'W', 'W', 'H', 'W', 'W', 'H'], 'alternativeNames': ['Lydian']},
        {'name': 'Mixolydian', 'intervals': ['W', 'W', 'H', 'W', 'W', 'H', 'W'], 'alternativeNames': ['Mixolydian']},
        {'name': 'Aeolian', 'intervals': ['W', 'H', 'W', 'W', 'H', 'W', 'W'], 'alternativeNames': ['Aeolian', 'Natural Minor']},
        {'name': 'Locrian', 'intervals': ['H', 'W', 'W', 'H', 'W', 'W', 'W'], 'alternativeNames': ['Locrian']}
    ],
    'Harmonic Minor':[{
        'name': 'Harmonic Minor',
        'intervals': ['W', 'H', 'W', 'W', 'H', 'A', 'H'],
        'alternativeNames': ['Harmonic Minor', 'Aeolian ♮7']
    }, {
        'name': 'Locrian ♮6',
        'intervals': ['H', 'W', 'W', 'H', 'A', 'H', 'W'],
        'alternativeNames': ['Locrian ♮6']
    }, {
        'name': 'Ionian ♯5',
        'intervals': ['W', 'W', 'H', 'A', 'H', 'W', 'H'],
        'alternativeNames': ['Ionian ♯5', 'Augmented Major']
    },{
        'name': 'Ukrainian Dorian',
        'intervals': ['W', 'H', 'A', 'H', 'W', 'H', 'W'],
        'alternativeNames': ['Ukrainian Dorian', 'Dorian #11', 'Dorian #4', 'Romanian Minor', 'Arabic Nikriz', 'Mi Sheberakh', 'altered Dorian']
    },{
        'name': 'Phrygian Dominant',
        'intervals': ['H', 'A', 'H', 'W', 'H', 'W', 'W'],
        'alternativeNames': ['Phrygian Dominant', 'Hijaz', 'Double Harmonic Major ♭7', 'Freygish']
    },{
        'name': 'Lydian #9',
        'intervals': ['A', 'H', 'W', 'H', 'W', 'W', 'H'],
        'alternativeNames': ['Lydian #9']
    },{
        'name': 'Super-Locrian scale 𝄫7',
        'intervals': ['H', 'W', 'H', 'W', 'W', 'H', 'A'],
        'alternativeNames': ['Super-Locrian scale 𝄫7', 'altered diminished', 'Ultralocian']
    }],
    'Harmonic Major': [
    {
        'name': 'Harmonic Major',
        'alternativeNames': ['Harmonic Major'],
        'intervals': ['W', 'W', 'H', 'W', 'H', 'A', 'H']
    },
    {
        'name': 'Locrian ♮2 ♮6',
        'alternativeNames': ['Locrian ♮2 ♮6', 'Dorian ♭5'],
        'intervals': ['W', 'H', 'W', 'H', 'A', 'H', 'W']
    },
    {
        'name': 'Altered Dominant ♮5',
        'alternativeNames': ['Altered Dominant ♮5', 'Phrygian ♭4'],
        'intervals': ['H', 'W', 'H', 'A', 'H', 'W', 'W']
    },
    {
        'name': 'Jazz Minor ♯4',
        'alternativeNames': ['Jazz Minor ♯4', 'Lydian ♭3'],
        'intervals': ['W', 'H', 'A', 'H', 'W', 'W', 'H']
    },
    {
        'name': 'Mixolydian ♭2',
        'alternativeNames': ['Mixolydian ♭2'],
        'intervals': ['H', 'A', 'H', 'W', 'W', 'H', 'W']
    },
    {
        'name': 'Lydian Augmented ♯2',
        'alternativeNames': ['Lydian Augmented ♯2'],
        'intervals': ['A', 'H', 'W', 'W', 'H', 'W', 'H']
    },
    {
        'name': "Locrian 𝄫7",
        'alternativeNames': ["Locrian 𝄫7"],
        'intervals': ['H', 'W', 'W', 'H', 'W', 'H', 'A']
    }
    ],
    'Melodic Minor': [{
        'name': 'Melodic Minor',
        'intervals': ['W', 'H', 'W', 'W', 'W', 'W', 'H'],
        'alternativeNames': ['Melodic Minor', 'Jazz Minor']
    }, {
        'name': 'Dorian ♭2',
        'intervals': ['H', 'W', 'W', 'W', 'W', 'H', 'W'],
        'alternativeNames': ['Dorian ♭2', 'Phrygian ♮6']
    }, {
        'name': 'Lydian Augmented',
        'intervals': ['W', 'W', 'W', 'W', 'H', 'W', 'H'],
        'alternativeNames': ['Lydian Augmented']
    },{
        'name': 'Acoustic scale',
        'intervals': ['W', 'W', 'W', 'H', 'W', 'H', 'W'],
        'alternativeNames': ['Acoustic scale', 'Lydian Dominant', 'Mixolydian ♯4', 'Overtone']
    },{
        'name': 'Aeolian dominant',
        'intervals': ['W', 'W', 'H', 'W', 'H', 'W', 'W'],
        'alternativeNames': ['Mixolydian ♭6', 'Aeolian dominant', 'Descending Melodic Minor', 'Hindu']
    }, {
        'name': 'Half Diminished',
        'intervals': ['W', 'H', 'W', 'H', 'W', 'W', 'W'],
        'alternativeNames': ['Aeolian ♭5', 'Half Diminished', 'Locrian ♮2']
    }, {
        'name': 'Altered Scale',
        'intervals': ['H', 'W', 'H', 'W', 'W', 'W', 'W'],
        'alternativeNames': ['Altered Scale', 'Super Locrian', 'Altered Dominant']
    }],
    'Double Harmonic Major':[
        {'name': 'Double Harmonic Major', 
        'intervals': ['H', 'A', 'H', 'W', 'H', 'A', 'H'],
        'alternativeNames': ['Double Harmonic Major', 'Byzantine', 'Gypsy Major', 'Arabic']
        },
        {
            'name': 'Lydian ♯2 ♯6',
            'intervals': ['A', 'H', 'W', 'H', 'A', 'H', 'H'],
            'alternativeNames': ['Lydian ♯2 ♯6']
        },
        {
            'name': 'Ultraphrygian',
            'intervals': ['H', 'W', 'H', 'A', 'H', 'H', 'A'],
            'alternativeNames': ['Ultraphrygian']
        },
        {
            'name': 'Hungarian',
            'intervals': ['W', 'H', 'A', 'H', 'H', 'A', 'H'],
            'alternativeNames': ['Hungarian', 'Gypsy Minor']
        },
        {
            'name': 'Oriental',
            'intervals': ['H', 'A', 'H', 'H', 'A', 'H', 'W'],
            'alternativeNames': ['Oriental']
        },
        {
            'name': 'Ionian ♯2 ♯5',
            'intervals': ['A', 'H', 'H', 'A', 'H', 'W', 'H'],
            'alternativeNames': ['Ionian ♯2 ♯5']
        },
        {
            'name': 'Locrian 𝄫3 𝄫7',
            'intervals': ['H', 'H', 'A', 'H', 'W', 'H', 'A'],
            'alternativeNames': ['Locrian 𝄫3 𝄫7']
        }
    ],
    'Neapolitan Major': [ {
        'name': 'Neapolitan Major',
        'intervals': ['H', 'W', 'W', 'W', 'W', 'W', 'H'],
        'alternativeNames': ['Neapolitan Major']
    },{
        'name': 'Leading Whole Tone',
        'intervals': ['W', 'W', 'W', 'W', 'W', 'H', 'H'],
        'alternativeNames': ['Leading Whole Tone', 'Lydian Augmented ♯6']
    },{
        'name': 'Lydian Augmented Dominant',
        'intervals': ['W', 'W', 'W', 'W', 'H', 'H', 'W'],
        'alternativeNames': ['Lydian Augmented Dominant']
    },{
        'name': 'Lydian Dominant ♭6',
        'intervals': ['W', 'W', 'W', 'H', 'H', 'W', 'W'],
        'alternativeNames': ['Lydian Dominant ♭6', 'Melodic Major ♯4']
    },{
        'name': 'Major Locrian',
        'intervals': ['W', 'W', 'H', 'H', 'W', 'W', 'W'],
        'alternativeNames': ['']
    },{
        'name': 'Half-Diminished ♭4',
        'intervals': ['W', 'H', 'H', 'W', 'W', 'W', 'W'],
        'alternativeNames': ['Half-Diminished ♭4', 'Altered Dominant #2']
    },{
        'name': 'Altered Dominant 𝄫3',
        'intervals': ['H', 'H', 'W', 'W', 'W', 'W', 'W'],
        'alternativeNames': ['Altered Dominant 𝄫3']
    },
    
],
    'Neapolitan Minor': [
    {
        'name': 'Neapolitan Minor',
        'intervals': ['H', 'W', 'W', 'W', 'H', 'A', 'H'],
        'alternativeNames': ['Neapolitan Minor']
    },
    {
        'name': 'Lydian ♯6',
        'intervals': ['W', 'W', 'W', 'H', 'A', 'H', 'H'],
        'alternativeNames': ['Lydian ♯6']
    },
    {
        'name': 'Mixolydian Augmented',
        'intervals': ['W', 'W', 'H', 'A', 'H', 'H', 'W'],
        'alternativeNames': ['Mixolydian Augmented']
    },
    {
        'name': 'Romani Minor',
        'intervals': ['W', 'H', 'A', 'H', 'H', 'W', 'W'],
        'alternativeNames': ['Romani Minor', 'Aeolian ♯4', 'Natural Minor ♯4']
    },
    {
        'name': 'Locrian Dominant',
        'intervals': ['H', 'A', 'H', 'H', 'W', 'W', 'W'],
        'alternativeNames': ['Locrian Dominant']
    },
    {
        'name': 'Ionian ♯2',
        'intervals': ['A', 'H', 'H', 'W', 'W', 'W', 'H'],
        'alternativeNames': ['Ionian ♯2', 'Major ♯2']
    },
    {
        'name': 'Ultralocrian 𝄫3',
        'intervals': ['H', 'H', 'W', 'W', 'W', 'H', 'A'],
        'alternativeNames': ['Ultralocrian 𝄫3', 'Altered Diminished double flat3']
    }
    
],
'Hexatonic':[
    {
        'name': 'Major Hexatonic',
        'alternativeNames': ['Major Hexatonic'],
        'intervals': ['W', 'W', 'H', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Hexatonic',
        'alternativeNames': ['Minor Hexatonic'],
        'intervals':['W', 'H', 'W', 'W', 'A', 'W']
    },
    {
        'name': "Ritsu Onkai",
        'alternativeNames': ['Ritsu Onkai'],
        'intervals': ['H', 'W', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Raga Kumud',
        'alternativeNames': ['Raga Kumud'],
        'intervals': ['W', 'W', 'A', 'W', 'H', 'W']
    },
    {
        'name': 'Mixolydian hexatonic',
        'alternativeNames': ['Mixolydian hexatonic'],
        'intervals': ['W', 'A', 'W', 'W', 'H', 'W']
    },
    {
        'name': 'Phyrgian hexatonic',
        'alternativeNames': ['Phyrgian hexatonic'],
        'intervals': ['A', 'W', 'W', 'H', 'W', 'W']
    },
    {
        'name': 'Blues',
        'alternativeNames': ['Blues'],
        'intervals': ['A', 'W', 'H', 'H', 'A', 'W']
    }
    
],
'Pentatonic':[
    {
        'name': 'Major Pentatonic',
        'alternativeNames': ['Major Pentatonic', 'gōng', 'Bhoopali', 'Mohanam', 'Mullaittīmpāṇi'],
        'intervals': ['W', 'W', 'A', 'W', 'A']
    },
    {
        'name': 'Egyptian',
        'alternativeNames': ['Egyptian', 'Suspended', 'shāng', 'Megh', 'Madhyamavati', 'Centurutti'],
        'intervals': ['W', 'A', 'W', 'A', 'W']
    },
    {
        'name': 'Blues Minor',
        'alternativeNames': ['Blues Minor', 'Man Gong', 'jué', 'Malkauns', 'Hindolam', 'Intaḷam'],
        'intervals': ['A', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Blues Major',
        'alternativeNames': ['Blues Major', 'ritsusen', 'yo', 'zhǐ', 'Durga', 'Shuddha Saveri', 'Koṉṟai'],
        'intervals': ['W', 'A', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Pentatonic',
        'alternativeNames': ['Minor Pentatonic', 'yǔ', 'Dhani', 'Shuddha Dhanyāsī', 'āmpal'],
        'intervals': ['A', 'W', 'W', 'A', 'W']
    },
    {
        'name': 'Japanese',
        'alternativeNames': ['Japanese', 'Insen', 'Ryukyu'],
        'intervals:': ['W', 'H', 'P', 'H', 'P']
    }
]
}

let HexatonicScales = [
    {
        'name': 'Major Hexatonic',
        'alternativeNames': ['Major Hexatonic'],
        'intervals': ['W', 'W', 'H', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Hexatonic',
        'alternativeNames': ['Minor Hexatonic'],
        'intervals':['W', 'H', 'W', 'W', 'A', 'W']
    },
    {
        'name': "Ritsu Onkai",
        'alternativeNames': ['Ritsu Onkai'],
        'intervals': ['H', 'W', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Raga Kumud',
        'alternativeNames': ['Raga Kumud'],
        'intervals': ['W', 'W', 'A', 'W', 'H', 'W']
    },
    {
        'name': 'Mixolydian hexatonic',
        'alternativeNames': ['Mixolydian hexatonic'],
        'intervals': ['W', 'A', 'W', 'W', 'H', 'W']
    },
    {
        'name': 'Phyrgian hexatonic',
        'alternativeNames': ['Phyrgian hexatonic'],
        'intervals': ['A', 'W', 'W', 'H', 'W', 'W']
    },
    {
        'name': 'Blues',
        'alternativeNames': ['Blues'],
        'intervals': ['A', 'W', 'H', 'H', 'A', 'W']
    }
    
]

let PentatonicScales = [
    {
        'name': 'Major Pentatonic',
        'alternativeNames': ['Major Pentatonic', 'gōng', 'Bhoopali', 'Mohanam', 'Mullaittīmpāṇi'],
        'intervals': ['W', 'W', 'A', 'W', 'A']
    },
    {
        'name': 'Egyptian',
        'alternativeNames': ['Egyptian', 'Suspended', 'shāng', 'Megh', 'Madhyamavati', 'Centurutti'],
        'intervals': ['W', 'A', 'W', 'A', 'W']
    },
    {
        'name': 'Blues Minor',
        'alternativeNames': ['Blues Minor', 'Man Gong', 'jué', 'Malkauns', 'Hindolam', 'Intaḷam'],
        'intervals': ['A', 'W', 'A', 'W', 'W']
    },
    {
        'name': 'Blues Major',
        'alternativeNames': ['Blues Major', 'ritsusen', 'yo', 'zhǐ', 'Durga', 'Shuddha Saveri', 'Koṉṟai'],
        'intervals': ['W', 'A', 'W', 'W', 'A']
    },
    {
        'name': 'Minor Pentatonic',
        'alternativeNames': ['Minor Pentatonic', 'yǔ', 'Dhani', 'Shuddha Dhanyāsī', 'āmpal'],
        'intervals': ['A', 'W', 'W', 'A', 'W']
    },
    {
        'name': 'Japanese',
        'alternativeNames': ['Japanese', 'Insen', 'Ryukyu'],
        'intervals:': ['W', 'H', 'P', 'H', 'P']
    }
]

let scales = [
    {
        'notes': 7,
        'name': 'Heptatonic',
        'scales': HeptatonicScales
    },
    {
        'notes': 6,
        'name': 'Hexatonic',
        'scales': HexatonicScales
    },
    {
        'notes': 5,
        'name': 'Pentatonic',
        'scales': PentatonicScales
    }
]



const getElementByNote = (note) =>
  note && document.querySelector(`[note="${note}_scale"]`);
const getElementByMIDI = (note) =>
  note && document.querySelector(`[midi="${note}_scale"]`);

const keys_chords = {
    60 : { element: getElementByMIDI("60"), note: "C",  octave: 4 },
    61 : { element: getElementByMIDI("61"), note: "C#", octave: 4 },
    62 : { element: getElementByMIDI("62"), note: "D",  octave: 4 },
    63 : { element: getElementByMIDI("63"), note: "D#", octave: 4 },
    64 : { element: getElementByMIDI("64"), note: "E",  octave: 4 },
    65 : { element: getElementByMIDI("65"), note: "F",  octave: 4 },
    66 : { element: getElementByMIDI("66"), note: "F#", octave: 4 },
    67 : { element: getElementByMIDI("67"), note: "G",  octave: 4 },
    68 : { element: getElementByMIDI("68"), note: "G#", octave: 4 },
    69 : { element: getElementByMIDI("69"), note: "A",  octave: 4 },
    70 : { element: getElementByMIDI("70"), note: "A#", octave: 4 },
    71 : { element: getElementByMIDI("71"), note: "B",  octave: 4 },
    72 : { element: getElementByMIDI("72"), note: "C",  octave: 5 },
    73 : { element: getElementByMIDI("73"), note: "C#", octave: 5 },
    74 : { element: getElementByMIDI("74"), note: "D",  octave: 5 },
    75 : { element: getElementByMIDI("75"), note: "D#", octave: 5 },
    76 : { element: getElementByMIDI("76"), note: "E",  octave: 5 },
    77 : { element: getElementByMIDI("77"), note: "F",  octave: 5 },
    78 : { element: getElementByMIDI("78"), note: "F#", octave: 5 },
    79 : { element: getElementByMIDI("79"), note: "G",  octave: 5 },
    80 : { element: getElementByMIDI("80"), note: "G#", octave: 5 },
    81 : { element: getElementByMIDI("81"), note: "A",  octave: 5 },
    82 : { element: getElementByMIDI("82"), note: "A#", octave: 5 },
    83 : { element: getElementByMIDI("83"), note: "B",  octave: 5 },
    84 : { element: getElementByMIDI("84"), note: "C",  octave: 6 },
};

function highlightKeysForScales(notes){
    for(var key in keys_chords) {
        if (keys_chords[key].element) {
            keys_chords[key].element.classList.remove('highlightedKey');
        }
    }
    // console.log("Highlighting keys for notes:", notes);
    if (notes && notes.length > 0) {
        notes.forEach(note => {
            var n = noteToMidi(note) + 12;
            let key = keys_chords[n];
            // console.log("Key for note:", note, "is", key, "MIDI:", n);
            if (key && key.element) {
                // console.log("Highlighting key:", key.note, "Octave:", key.octave);
                key.element.classList.add('highlightedKey');
            }
        });
    }
}

/**
 * Generate a cache key for a scale and root note combination
 * @param {string} scaleId - Scale identifier (e.g., "Major-1")
 * @param {string} rootNote - Root note (e.g., "C")
 * @returns {string} Cache key
 */
function generateScaleCacheKey(scaleId, rootNote) {
    return `${scaleId}_${rootNote}`;
}

/**
 * Get scale object from scaleId
 * @param {string} scaleId - Scale identifier (e.g., "Major-1")
 * @returns {object|null} Scale object or null if not found
 */
function getScaleFromId(scaleId) {
    const [scaleFamily, scaleIndex] = scaleId.split('-');
    const index = parseInt(scaleIndex) - 1;
    
    if (HeptatonicScales[scaleFamily] && HeptatonicScales[scaleFamily][index]) {
        return HeptatonicScales[scaleFamily][index];
    }
    
    return null;
}

/**
 * Precompute chords for a specific scale and root note
 * @param {string} scaleId - Scale identifier (e.g., "Major-1")
 * @param {string} rootNote - Root note (e.g., "C")
 * @returns {object|null} Object containing triads and sevenths, or null if error
 */
function precomputeScaleChords(scaleId, rootNote) {
    const scale = getScaleFromId(scaleId);
    if (!scale) {
        console.warn(`Scale not found: ${scaleId}`);
        return null;
    }

    // Only compute for heptatonic scales (7 notes)
    if (scale.intervals.length !== 7) {
        console.warn(`Scale ${scaleId} is not heptatonic, skipping chord computation`);
        return null;
    }

    try {
        const identifiedChords_3 = identifySyntheticChords(scale, 3, rootNote);
        const identifiedChords_4 = identifySyntheticChords(scale, 4, rootNote);

        const chordData = {
            scaleId,
            rootNote,
            scaleName: scale.name,
            triads: identifiedChords_3,
            sevenths: identifiedChords_4,
            computedAt: Date.now()
        };

        const cacheKey = generateScaleCacheKey(scaleId, rootNote);
        scaleChordCache.set(cacheKey, chordData);

        return chordData;
    } catch (error) {
        console.error(`Error computing chords for ${scaleId} in ${rootNote}:`, error);
        return null;
    }
}

/**
 * Precompute chords for multiple scales and root notes
 * @param {Array<string>} scaleIds - Array of scale identifiers
 * @param {Array<string>} rootNotes - Array of root notes
 * @returns {Array<object>} Array of successfully computed chord data objects
 */
function precomputeChordsForScales(scaleIds, rootNotes) {
    const results = [];
    
    for (const scaleId of scaleIds) {
        for (const rootNote of rootNotes) {
            const chordData = precomputeScaleChords(scaleId, rootNote);
            if (chordData) {
                results.push(chordData);
            }
        }
    }
    
    console.log(`Precomputed chords for ${results.length} scale-root combinations`);
    return results;
}

/**
 * Get precomputed chords for a scale and root note
 * @param {string} scaleId - Scale identifier (e.g., "Major-1")
 * @param {string} rootNote - Root note (e.g., "C")
 * @returns {object|null} Cached chord data or null if not found
 */
function getPrecomputedChords(scaleId, rootNote) {
    const cacheKey = generateScaleCacheKey(scaleId, rootNote);
    return scaleChordCache.get(cacheKey) || null;
}

/**
 * Get precomputed chords for a scale and root note, computing if not cached
 * @param {string} scaleId - Scale identifier (e.g., "Major-1")
 * @param {string} rootNote - Root note (e.g., "C")
 * @returns {object|null} Chord data (cached or newly computed)
 */
function getChordsForScale(scaleId, rootNote) {
    let chordData = getPrecomputedChords(scaleId, rootNote);
    
    if (!chordData) {
        console.log(`Chords not cached for ${scaleId} in ${rootNote}, computing...`);
        chordData = precomputeScaleChords(scaleId, rootNote);
    }
    
    return chordData;
}

/**
 * Clear the chord cache
 */
function clearChordCache() {
    scaleChordCache.clear();
    console.log('Chord cache cleared');
}

/**
 * Get cache statistics
 * @returns {object} Cache statistics
 */
function getChordCacheStats() {
    return {
        size: scaleChordCache.size,
        keys: Array.from(scaleChordCache.keys())
    };
}

function getScaleNotes(rootNote, intervals) {
    // console.log("Generating scale notes for root:", rootNote, "with intervals:", intervals);
    let rootNoteMidi = noteToMidi(rootNote + "/5");
    let notes = [rootNoteMidi];
    for (let i = 0; i < intervals.length; i++) {
        let interval = intervals[i];
        if (interval === 'W') {
            rootNoteMidi += 2; // Whole step
        } else if (interval === 'H') {
            rootNoteMidi += 1; // Half step
        } else if (interval === 'A') {
            rootNoteMidi += 3; // Augmented step
        } else if (interval === 'P') {
            rootNoteMidi += 4; // Perfect step
        }
        notes.push(rootNoteMidi);
    }
    return notes.map(midi => { 
        let noteName = noteToName(midi);
        return noteName ? noteName : midi; // Fallback to MIDI number if name is not found
    });
}

export { 
    HeptatonicScales, 
    HexatonicScales, 
    PentatonicScales, 
    scales, 
    highlightKeysForScales, 
    getScaleNotes,
    precomputeScaleChords,
    precomputeChordsForScales,
    getPrecomputedChords,
    getChordsForScale,
    clearChordCache,
    getChordCacheStats
};