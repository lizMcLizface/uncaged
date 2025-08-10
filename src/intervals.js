import {scales, getScaleNotes} from './scales';
import { chords } from './chords';
import { areArraysEnharmonicEquivalent, normalizeNote, noteToMidi as notationNoteToMidi, midiToNote as notationMidiToNote } from './notation';

function intervalToSemitones(interval) {
    switch (interval) {
        case 'P1':
        case 'd2':
            return 0;
        case 'm2':
        case 'A1':
            return 1;
        case 'M2':
        case 'd3':
            return 2;
        case 'm3':
        case 'A2':
            return 3;
        case 'M3':
        case 'd4':
            return 4;
        case 'P4':
        case 'A3':
            return 5;
        case 'd5':
        case 'A4':
            return 6;
        case 'P5':
        case 'd6':
            return 7;
        case 'm6':
        case 'A5':
            return 8;
        case 'M6':
        case 'd7':
            return 9;
        case 'm7':
        case 'A6':
            return 10;
        case 'M7':
        case 'd8':
            return 11;
        case 'P8':
        case 'A7':
        case 'd9':
            return 12;
        case 'm9':
        case 'A8':
            return 13;
        case 'M9':
        case 'd10':
            return 14;
        case 'm10':
        case 'A9':
            return 15;
        case 'M10':
        case 'd11':
            return 16;
        case 'P11':
        case 'A10':
            return 17;
        case 'd12':
        case 'A11':
            return 18;
        case 'P12':
        case 'd13':
            return 19;
        case 'm13':
        case 'A12':
            return 20;
        case 'M13':
        case 'd14':
            return 21;
        case 'm14':
        case 'A13':
            return 22;
        case 'M14':
        case 'd15':
            return 23;
        case 'P15':
        case 'A14':
            return 24;
        default:
            throw new Error(`Unknown interval: ${interval}`);
    }
}
function chordToIntervals(chordType) {
    const chordName = chordType.trim().toLowerCase();
    switch (chordName) {
        case 'major triad':
            return ['P1', 'M3', 'P5'];
        case 'minor triad':
            return ['P1', 'm3', 'P5'];
        case 'diminished triad':
            return ['P1', 'm3', 'd5'];
        case 'augmented triad':
            return ['P1', 'M3', 'A5'];
        case 'power chord':
            return ['P1', 'P5'];
        case 'dominant seventh':
            return ['P1', 'M3', 'P5', 'm7'];
        case 'minor seventh':
            return ['P1', 'm3', 'P5', 'm7'];
        case 'minor major seventh':
            return ['P1', 'm3', 'P5', 'M7'];
        case 'major seventh':
            return ['P1', 'M3', 'P5', 'M7'];
        case 'augmented major seventh':
            return ['P1', 'M3', 'A5', 'M7'];
        case 'augmented seventh':
            return ['P1', 'M3', 'A5', 'm7'];
        case 'half diminished seventh':
            return ['P1', 'm3', 'd5', 'm7'];
        case 'diminished seventh':
            return ['P1', 'm3', 'd5', 'd7'];
        case 'diminished seventh flat five':
            return ['P1', 'M3', 'd5', 'm7'];
        case 'major ninth':
            return ['P1', 'M3', 'P5', 'M7', 'M9'];
        case 'minor ninth':
            return ['P1', 'm3', 'P5', 'm7', 'M9'];
        case 'dominant ninth':
            return ['P1', 'M3', 'P5', 'm7', 'M9'];
        case 'dominant minor ninth':
            return ['P1', 'M3', 'P5', 'm7', 'm9'];
        case 'minor major ninth':
            return ['P1', 'm3', 'P5', 'M7', 'M9'];
        case 'augmented major ninth':
            return ['P1', 'M3', 'A5', 'M7', 'M9'];
        case 'augmented dominant ninth':
            return ['P1', 'M3', 'A5', 'm7', 'M9'];
        case 'half diminished ninth':
            return ['P1', 'm3', 'd5', 'm7', 'M9'];
        case 'half diminished minor ninth':
            return ['P1', 'm3', 'd5', 'm7', 'm9'];
        case 'diminished ninth':
            return ['P1', 'm3', 'd5', 'd7', 'M9'];
        case 'diminished minor ninth':
            return ['P1', 'm3', 'd5', 'd7', 'm9'];
        case 'eleventh':
            return ['P1', 'M3', 'P5', 'm7', 'M9', 'P11'];
        case 'minor eleventh':
            return ['P1', 'm3', 'P5', 'm7', 'M9', 'P11'];
        case 'major eleventh':
            return ['P1', 'M3', 'P5', 'M7', 'M9', 'P11'];
        case 'minor major eleventh':
            return ['P1', 'm3', 'P5', 'M7', 'M9', 'P11'];
        case 'augmented major eleventh':
            return ['P1', 'M3', 'A5', 'M7', 'M9', 'P11'];
        case 'augmented eleventh':
            return ['P1', 'M3', 'A5', 'm7', 'M9', 'P11'];
        case 'half diminished eleventh':
            return ['P1', 'm3', 'd5', 'm7', 'M9', 'P11'];
        case 'diminished eleventh':
            return ['P1', 'm3', 'd5', 'd7', 'M9', 'P11'];
        case 'major thirteenth':
            return ['P1', 'M3', 'P5', 'M7', 'M9', 'P11', 'M13'];
        case 'minor thirteenth':
            return ['P1', 'm3', 'P5', 'm7', 'M9', 'P11', 'M13'];
        case 'dominant thirteenth':
            return ['P1', 'M3', 'P5', 'm7', 'M9', 'P11', 'M13'];
        case 'minor major thirteenth':
            return ['P1', 'm3', 'P5', 'M7', 'M9', 'P11', 'M13'];
        case 'augmented major thirteenth':
            return ['P1', 'M3', 'A5', 'M7', 'M9', 'P11', 'M13'];
        case 'augmented thirteenth':
            return ['P1', 'M3', 'A5', 'm7', 'M9', 'P11', 'M13'];
        case 'half diminished thirteenth':
            return ['P1', 'm3', 'd5', 'm7', 'M9', 'P11', 'M13'];
        case 'diminished thirteenth':
            return ['P1', 'm3', 'd5', 'd7', 'M9', 'P11', 'M13'];
        case 'diminished minor thirteenth':
            return ['P1', 'm3', 'd5', 'd7', 'm9', 'P11', 'M13'];
        case 'minor sixth':
            return ['P1', 'm3', 'P5', 'M6'];
        case 'major sixth':
            return ['P1', 'M3', 'P5', 'M6'];
        default:
            throw new Error(`Unknown chord type: ${chordName}`);
    }
}

function resolveChordType(chordType) {
    let chord = null;
    if (['', 'maj', 'M', 'Δ', 'D'].includes(chordType)) {
        chord = 'Major Triad';
    } else if (['min', 'm', '−'].includes(chordType)) {
        chord = 'Minor Triad';
    } else if (['dim', '°', 'o', 'm♭5', 'mo5', 'm°5'].includes(chordType)) {
        chord = 'Diminished Triad';
    } else if (['aug', '+', 'M♯5', 'M+5'].includes(chordType)) {
        chord = 'Augmented Triad';
    } else if (['5'].includes(chordType)) {
        chord = 'Power Chord';
    } else if (['7', 'Mm7', 'maj♭7', 'majm7', 'majb7'].includes(chordType)) {
        chord = 'Dominant Seventh';
    } else if (['m7', 'min7', '−7', '−7'].includes(chordType)) {
        chord = 'Minor Seventh';
    } else if (['mM7', 'm#7', '-M7', '-Δ7', 'minmaj7', 'm♯7', '-D7'].includes(chordType)) {
        chord = 'Minor Major Seventh';
    } else if (['M7', 'Ma7', 'maj7', 'Δ7', 'D7'].includes(chordType)) {
        chord = 'Major Seventh';
    } else if (['+M7', '+D', 'augmaj7', 'M7#5', 'M7+5', 'D#5, D+5'].includes(chordType)) {
        chord = 'Augmented Major Seventh';
    } else if (['+7', 'aug7', '7#5', '7+5'].includes(chordType)) {
        chord = 'Augmented Seventh';
    } else if (['ø', 'ø7', 'min7dim5', 'm7b5', 'm7o5', '-7b5', '-7o5'].includes(chordType)) {
        chord = 'Half Diminished Seventh';
    } else if (['o7', 'dim7'].includes(chordType)) {
        chord = 'Diminished Seventh';
    } else if (['7b5', '7dim5'].includes(chordType)) {
        chord = 'Diminished Seventh Flat Five';
    } else if (['M9', 'D9', 'maj9'].includes(chordType)) {
        chord = 'Major Ninth';
    } else if (['m9', 'min9', '−9'].includes(chordType)) {
        chord = 'Minor Ninth';
    } else if (['9'].includes(chordType)) {
        chord = 'Dominant Ninth';
    } else if (['7b9'].includes(chordType)) {
        chord = 'Dominant minor Ninth';
    } else if (['mM9', '-M9', 'minmaj9'].includes(chordType)) {
        chord = 'Minor Major Ninth';
    } else if (['+M9', 'augmaj9'].includes(chordType)) {
        chord = 'Augmented Major Ninth';
    } else if (['+9', '9#5', 'aug9'].includes(chordType)) {
        chord = 'Augmented dominant ninth';
    } else if (['ø9'].includes(chordType)) {
        chord = 'Half Diminished Ninth';
    } else if (['øb9'].includes(chordType)) {
        chord = 'Half Diminished minor Ninth';
    } else if (['o9', 'dim9'].includes(chordType)) {
        chord = 'Diminished Ninth';
    } else if (['ob9', 'dimb9'].includes(chordType)) {
        chord = 'Diminished minor Ninth';
    } else if (['11'].includes(chordType)) {
        chord = 'Eleventh';
    } else if (['m11', 'min11', '−11'].includes(chordType)) {
        chord = 'Minor Eleventh';
    } else if (['M11', 'maj11', 'D11'].includes(chordType)) {
        chord = 'Major Eleventh';
    } else if (['mM11', '-M11', 'minmaj11'].includes(chordType)) {
        chord = 'Minor Major Eleventh';
    } else if (['+M11', 'augmaj11'].includes(chordType)) {
        chord = 'Augmented Major Eleventh';
    } else if (['+11', '11#5', 'aug11'].includes(chordType)) {
        chord = 'Augmented Eleventh';
    } else if (['ø11'].includes(chordType)) {
        chord = 'Half Diminished Eleventh';
    } else if (['o11', 'dim11'].includes(chordType)) {
        chord = 'Diminished Eleventh';
    } else if (['M13', 'maj13', 'D13'].includes(chordType)) {
        chord = 'Major Thirteenth';
    } else if (['m13', 'min13', '−13'].includes(chordType)) {
        chord = 'Minor Thirteenth';
    } else if (['13'].includes(chordType)) {
        chord = 'Dominant Thirteenth';
    } else if (['mM13', '-M13', 'minmaj13'].includes(chordType)) {
        chord = 'Minor Major Thirteenth';
    } else if (['+M13', 'augmaj13'].includes(chordType)) {
        chord = 'Augmented Major Thirteenth';
    } else if (['+13', '13#5', 'aug13'].includes(chordType)) {
        chord = 'Augmented Thirteenth';
    } else if (['ø13'].includes(chordType)) {
        chord = 'Half Diminished Thirteenth';
    } else if (['min6', 'm6'].includes(chordType)) {
        chord = 'Minor Sixth';
    }
    else if (['M6', 'maj6', '6'].includes(chordType)) {
        chord = 'Major Sixth';
    } else {
        throw new Error(`Unknown chord type: ${chordType}`);
    }
    return chord;
}

function resolveChord(chordName) {
    chordName = chordName.replace(/\s+/g, '')
        .replace(/Major/gi, 'maj')
        .replace(/Minor/gi, 'min');

    
    let flatNotes = [];
    if (chordName.includes('b3') || chordName.includes('b5') || chordName.includes('b7') || chordName.includes('b9') || chordName.includes('b11') || chordName.includes('b13')) {
        if (chordName.includes('b3')) {
            flatNotes.push(3);
            chordName = chordName.replace('b3', '');
        }
        if (chordName.includes('b5')) {
            flatNotes.push(5);
            chordName = chordName.replace('b5', '');
        }
        if (chordName.includes('b7')) {
            flatNotes.push(7);
            chordName = chordName.replace('b7', '');
        }
        if (chordName.includes('b9')) {
            flatNotes.push(9);
            chordName = chordName.replace('b9', '');
        }
        if (chordName.includes('b11')) {
            flatNotes.push(11);
            chordName = chordName.replace('b11', '');
        }
        if (chordName.includes('b13')) {
            flatNotes.push(13);
            chordName = chordName.replace('b13', '');
        }
    }

    let sharpNotes = [];
    if (chordName.includes('#3') || chordName.includes('#5') || chordName.includes('#7') || chordName.includes('#9') || chordName.includes('#11') || chordName.includes('#13')) {
        if (chordName.includes('#3')) {
            sharpNotes.push(3);
            chordName = chordName.replace('#3', '');
        }
        if (chordName.includes('#5')) {
            sharpNotes.push(5);
            chordName = chordName.replace('#5', '');
        }
        if (chordName.includes('#7')) {
            sharpNotes.push(7);
            chordName = chordName.replace('#7', '');
        }
        if (chordName.includes('#9')) {
            sharpNotes.push(9);
            chordName = chordName.replace('#9', '');
        }
        if (chordName.includes('#11')) {
            sharpNotes.push(11);
            chordName = chordName.replace('#11', '');
        }
        if (chordName.includes('#13')) {
            sharpNotes.push(13);
            chordName = chordName.replace('#13', '');
        }
    }

    // Regex for root note and chord type
    const noteRegex = /^([A-G](?:b|#|♮|♭|♯|𝄫|𝄪|)?)(.*)$/;
    const noteRegex2 = /^(.*)\/([A-G](?:b|#|♮|♭|♯|𝄫|𝄪|)?)$/;

    let result = chordName.match(noteRegex);
    if (!result) {
        throw new Error("Invalid chord name: No root note found");
    }
    const rootNote = result[1];
    let subString = result[2];

    result = subString.match(noteRegex2);
    let chordType, bassNote;
    if (result) {
        chordType = result[1];
        bassNote = result[2];
    } else {
        chordType = subString;
        bassNote = null;
    }

    let suspended = [];
    if (chordType.includes('sus')) {
        // Find all sus patterns - sus2, sus4, or just sus (defaults to sus4)
        const susMatches = chordType.match(/sus(\d+)/g);
        if (susMatches) {
            for (const match of susMatches) {
                const susNumber = match.replace('sus', '');
                suspended.push(`sus${susNumber}`);
                chordType = chordType.replace(match, '');
            }
        } else if (chordType.includes('sus')) {
            // Handle plain 'sus' which defaults to sus4
            suspended.push('sus4');
            chordType = chordType.replace('sus', '');
        }
    }

    let addedTones = [];
    if (chordType.includes('add')) {
        const addMatches = chordType.match(/add(\d+)/g);
        if (addMatches) {
            for (const match of addMatches) {
                const addNumber = match.replace('add', '');
                addedTones.push(addNumber);
                chordType = chordType.replace(match, '');
            }
        }
    }

    let noTones = [];
    if (chordType.includes('no')) {
        const noMatches = chordType.match(/no(\d+)/g);
        if (noMatches) {
            for (const match of noMatches) {
                const noNumber = match.replace('no', '');
                noTones.push(noNumber);
                chordType = chordType.replace(match, '');
            }
        }
    }

    chordType = chordType.replace(/♯/g, '#')
        .replace(/♭/g, 'b')
        .replace(/𝄫/g, 'bb')
        .replace(/𝄪/g, '##')
        .replace(/♮/g, '')
        .replace(/°/g, 'o')
        .replace(/Δ/g, 'D');
    let chord = null;
    try {
        chord = resolveChordType(chordType);
    } catch (error) {
        console.error(`Error resolving chord type: ${chordType}`);
        throw new Error(`Invalid chord type: ${chordType}`);
    }
    // console.log(`Resolved chord: ${chord} for chord name: ${chordName}`);
    // console.log(`Root Note: ${rootNote}, Chord Type: ${chord}, Suspended: ${suspended}, Added Tone: ${addedTone}, Bass Note: ${bassNote}, No Tone: ${noTone}, Flat Notes: ${flatNotes}, Sharp Notes: ${sharpNotes}`);

    return {
        rootNote,
        chordType: chord,
        suspended,
        addedTones,
        bassNote,
        noTones,
        flatNotes,
        sharpNotes
    };
}
function processChord(chordName) {
    // console.log("Processing chord:", chordName);
    const chord = resolveChord(chordName);
    const rootNote = chord.rootNote;
    const chordType = chord.chordType;
    const suspended = chord.suspended;
    const addedTones = chord.addedTones;
    const bassNote = chord.bassNote;
    const noTones = chord.noTones;
    const flatNotes = chord.flatNotes;
    const sharpNotes = chord.sharpNotes;

    let intervals = chordToIntervals(chordType);

    const rootMidi = notationNoteToMidi(rootNote);

    // Handle suspended chords
    if (suspended && suspended.length > 0) {
        for (const sus of suspended) {
            if (sus === 'sus2') {
                intervals[1] = 'M2';
            } else if (sus === 'sus4') {
                intervals[1] = 'P4';
            }
        }
    }
    if (flatNotes && flatNotes.length > 0) {
        for (const note of flatNotes) {
            if (note === 3) {
                intervals[1] = 'm3';
            } else if (note === 5) {
                if (intervals.length > 2) {
                    intervals[2] = 'd5';
                }
                else{
                    intervals.push('d5');
                }
            } else if (note === 7) {
                if (intervals.length > 3) {
                    intervals[3] = 'm7';
                } else {
                    intervals.push('m7');
                }
            } else if (note === 9) {
                if (intervals.length > 4) {
                    intervals[4] = 'm9';
                } else {
                    intervals.push('m9');
                }
            } else if (note === 11) {
                if (intervals.length > 5) {
                    intervals[5] = 'P11';
                } else {
                    intervals.push('P11');
                }
            } else if (note === 13) {
                if (intervals.length > 6) {
                    intervals[6] = 'M13';
                } else {
                    intervals.push('M13');
                }
            }
        }
    }
    if (sharpNotes && sharpNotes.length > 0) {
        for (const note of sharpNotes) {
            if (note === 3) {
                intervals[1] = 'A3';
            } else if (note === 5) {
                if (intervals.length > 2) {
                    intervals[2] = 'A5';
                } else {
                    intervals.push('A5');
                }
            } else if (note === 7) {
                if (intervals.length > 3) {
                    intervals[3] = 'A7';
                } else {
                    intervals.push('A7');
                }
            } else if (note === 9) {
                if (intervals.length > 4) {
                    intervals[4] = 'A9';
                } else {
                    intervals.push('A9');
                }
            } else if (note === 11) {
                if (intervals.length > 5) {
                    intervals[5] = 'A11';
                } else {
                    intervals.push('A11');
                }
            } else if (note === 13) {
                if (intervals.length > 6) {
                    intervals[6] = 'A13';
                } else {
                    intervals.push('A13');
                }
            }
        }
    }

    // Handle added tones
    if (addedTones && addedTones.length > 0) {
        for (const addedTone of addedTones) {
            if (addedTone === '4') 
                intervals.push('P4');
            else if (addedTone === '11')
                intervals.push('P11');
            else
                intervals.push(`M${addedTone}`);
        }
    }

    // Handle omitted tones
    if (noTones && noTones.length > 0) {
        for (const noTone of noTones) {
            intervals = intervals.filter(i => !i.includes(noTone));
        }
    }

    const notes = [];
    for (const interval of intervals) {
        const semitones = intervalToSemitones(interval);
        const noteMidi = rootMidi + semitones;
        if (noteMidi >= 128) {
            throw new Error("MIDI note out of range");
        }
        notes.push(notationMidiToNote(noteMidi));
    }

    // Handle bass note
    if (bassNote) {
        const bassMidi = notationNoteToMidi(bassNote);
        let bassInterval = bassMidi - rootMidi;
        if (bassInterval < 0) {
            bassInterval += 12;
        }
        notes.push(notationMidiToNote(bassMidi));
    }

    return {
        root: rootMidi,
        rootNote,
        chordType,
        suspended,
        addedTones,
        noTones,
        intervals,
        rootMidi,
        notes
    };
}
function matchChord(inputChord, chords, verbose = false) {
    if (verbose) {
        console.log(`Matching Chord: ${inputChord}`);
    }
    const candidates = [];
    for (const chordGroup in chords) {
        if (inputChord.length === 3 && chordGroup !== 'triads') continue;
        if (inputChord.length === 4 && chordGroup !== 'sevenths') continue;
        if (verbose) {
            console.log(`${chordGroup.charAt(0).toUpperCase() + chordGroup.slice(1)} Chords:`);
        }
        for (const chord of chords[chordGroup]) {
            let chordNotes = processChord(inputChord[0] + chord).notes;
            chordNotes = chordNotes.map(note => note.replace(/\/\d+$/, '')); // Remove octave info
            if (verbose) {
                console.log(`  ${chord.padEnd(16)}: ${chordNotes.join(', ')}`);
            }
            if (chordNotes.length === inputChord.length && areArraysEnharmonicEquivalent(chordNotes, inputChord)) {
                candidates.push(chord);
            }
        }
        if (candidates.length === 0) {
            if (verbose) {
                console.log(`No matches found in ${chordGroup.charAt(0).toUpperCase() + chordGroup.slice(1)} Chords`);
                console.log('Trying sus2');
            }
            for (const chord of chords[chordGroup]) {
                if (chord.includes('sus')) continue;
                if (chord === 'b5') continue;
                let chordNotes = processChord(inputChord[0] + chord + 'sus2').notes;
                chordNotes = chordNotes.map(note => note.replace(/\/\d+$/, ''));
                if (verbose) {
                    console.log(`  ${chord.padEnd(16)}sus2: ${chordNotes.join(', ')}`);
                }
                if (chordNotes.length === inputChord.length && areArraysEnharmonicEquivalent(chordNotes, inputChord)) {
                    candidates.push(chord + 'sus2');
                }
            }
        }
        if (candidates.length === 0) {
            if (verbose) {
                console.log(`No matches found in ${chordGroup.charAt(0).toUpperCase() + chordGroup.slice(1)} Chords with sus2`);
                console.log('Trying sus4');
            }
            for (const chord of chords[chordGroup]) {
                if (chord.includes('sus')) continue;
                if (chord === 'b5') continue;
                let chordNotes = processChord(inputChord[0] + chord + 'sus4').notes;
                chordNotes = chordNotes.map(note => note.replace(/\/\d+$/, ''));
                if (verbose) {
                    console.log(`  ${chord.padEnd(16)}sus4: ${chordNotes.join(', ')}`);
                }
                if (chordNotes.length === inputChord.length && areArraysEnharmonicEquivalent(chordNotes, inputChord)) {
                    candidates.push(chord + 'sus4');
                }
            }
        }
    }
    return candidates;
}

function generateSyntheticChords(scale, length = 3, root = 'C') {
    const scaleNotes = getScaleNotes(root, scale.intervals);
    const syntheticChords = [];
    for (let i = 0; i < scaleNotes.length - 1; i++) {
        const chordNotes = [];
        for (let j = 0; j < length; j++) {
            chordNotes.push(scaleNotes[(i + j * 2) % (scaleNotes.length - 1)]);
        }
        syntheticChords.push(chordNotes);
    }
    return syntheticChords;
}
// Assuming scales and getScale are defined/imported elsewhere

// const scale = scales[0]['scales']['Double Harmonic Major'][2];
// console.log(`Scale: ${scale.name}, Intervals: ${scale.intervals}`);

// const scaleNotes = getScaleNotes('C', scale.intervals);
// console.log(`Scale Notes for ${scale.name}: ${scaleNotes}`);

// const syntheticChords = generateSyntheticChords(scale, 3);

// const trimmedSyntheticChords = syntheticChords.map(chord =>
//     chord.map(note => note.slice(0, -2))
// );

// console.log(`Synthetic Chords for ${scale.name}:`);
// console.log(`Scale Notes: ${scaleNotes}`);

// trimmedSyntheticChords.forEach((chord, i) => {
//     console.log(`Synthetic Chord ${i + 1} for ${scale.name}: ${chord}`);
// });

// console.log('\n\n---------------------------------\n\n');
// trimmedSyntheticChords.forEach(chord => {
//     const matchedChords = matchChord(chord, chords, false);
//     if (matchedChords && matchedChords.length > 0) {
//         console.log(`Matched Chords for ${chord}: ${matchedChords}`);
//     } else {
//         console.log(`No matches found for ${chord}`);
//         matchChord(chord, chords, true);
//     }
// });

function identifySyntheticChords(scale, length = 3, root = 'C') {
    // const scaleNotes = getScaleNotes(root, scale.intervals);

    const syntheticChords = generateSyntheticChords(scale, length, root);
    const trimmedSyntheticChords = syntheticChords.map(chord =>
        chord.map(note => note.slice(0, -2))
    );
    let matchedChords_ = [];
    trimmedSyntheticChords.forEach(chord => {
        const matchedChords = matchChord(chord, chords, false);
        if (matchedChords && matchedChords.length > 0) {
            matchedChords_.push({
                chord: chord,
                matches: matchedChords
            });
            // console.log(`Matched Chords for ${chord}: ${matchedChords}`);
        } else {
            console.log(`No matches found for ${chord}`);
            matchChord(chord, chords, true);
            throw new Error(`No matches found for ${chord}`);
        }
    });
    return matchedChords_;
}

// let identifiedChords = identifySyntheticChords(scales[0]['scales']['Double Harmonic Major'][2], 4);
// console.log('Identified Chords:', identifiedChords);


export { intervalToSemitones, chordToIntervals, notationNoteToMidi as noteToMidi, notationMidiToNote as midiToNote, resolveChord, processChord, matchChord, generateSyntheticChords, identifySyntheticChords };