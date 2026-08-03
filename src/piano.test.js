import {
  buildKeyRange,
  countWhiteKeys,
  isBlackKey,
  octaveOf,
  octaveSpanToMidiRange,
  pitchClassOf,
  LOWEST_KEY_MIDI,
  HIGHEST_KEY_MIDI
} from './piano/keyModel';
import { getInstrumentRange, isInInstrumentRange, DEFAULT_PRACTICAL_FRET } from './piano/range';
import { INSTRUMENT_PRESETS } from './tuning';

// Tests for PIANO_VIEW_PLAN.md step 1. Unlike the Phase 0 characterization
// tests these are a spec, not a pin on existing behavior: both modules are
// new. They exist because step 1 is the only step whose bugs stay invisible
// until the rendering steps sit on top of it.

describe('keyModel: MIDI convention', () => {
  test('60 is C4, matching midi.js keys and notation.js', () => {
    expect(pitchClassOf(60)).toBe(0);
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(21)).toBe(0); // A0, the lowest key
    expect(octaveOf(108)).toBe(8); // C8, the highest
  });
});

describe('keyModel: black key placement', () => {
  test('the five black pitch classes, and only those', () => {
    const blackFromC4 = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].filter(isBlackKey);
    expect(blackFromC4).toEqual([61, 63, 66, 68, 70]); // C# D# F# G# A#
  });

  test('no black key between E/F or B/C', () => {
    expect(isBlackKey(64)).toBe(false); // E4
    expect(isBlackKey(65)).toBe(false); // F4
    expect(isBlackKey(71)).toBe(false); // B4
    expect(isBlackKey(72)).toBe(false); // C5
  });

  test('placement is octave-invariant', () => {
    for (let midi = LOWEST_KEY_MIDI; midi <= HIGHEST_KEY_MIDI - 12; midi++) {
      expect(isBlackKey(midi)).toBe(isBlackKey(midi + 12));
    }
  });
});

describe('keyModel: buildKeyRange', () => {
  test('inclusive of both ends, ascending', () => {
    const keys = buildKeyRange(60, 72);
    expect(keys).toHaveLength(13);
    expect(keys[0].midi).toBe(60);
    expect(keys[12].midi).toBe(72);
    expect(keys.map(k => k.midi)).toEqual([...keys.map(k => k.midi)].sort((a, b) => a - b));
  });

  test('descriptors carry pitch class, octave and colour', () => {
    const [c4, cSharp4] = buildKeyRange(60, 61);
    expect(c4).toEqual({ midi: 60, pitchClass: 0, octave: 4, isBlack: false });
    expect(cSharp4).toEqual({ midi: 61, pitchClass: 1, octave: 4, isBlack: true });
  });

  test('octave boundary: B3 -> C4 increments the octave, not the pitch class run', () => {
    const [b3, c4] = buildKeyRange(59, 60);
    expect(b3).toMatchObject({ pitchClass: 11, octave: 3 });
    expect(c4).toMatchObject({ pitchClass: 0, octave: 4 });
  });

  test('clamps to the playable window midi.js keys covers', () => {
    const keys = buildKeyRange(0, 127);
    expect(keys[0].midi).toBe(LOWEST_KEY_MIDI);
    expect(keys[keys.length - 1].midi).toBe(HIGHEST_KEY_MIDI);
    expect(keys).toHaveLength(88);
  });

  test('inverted or non-numeric ranges yield no keys rather than throwing', () => {
    expect(buildKeyRange(72, 60)).toEqual([]);
    expect(buildKeyRange(undefined, 60)).toEqual([]);
    expect(buildKeyRange(60, NaN)).toEqual([]);
  });
});

describe('keyModel: countWhiteKeys', () => {
  test('7 white keys per octave', () => {
    expect(countWhiteKeys(buildKeyRange(60, 71))).toBe(7);
    expect(countWhiteKeys(buildKeyRange(60, 95))).toBe(21); // 3 octaves
  });

  test('an 88-key piano has 52 white keys', () => {
    expect(countWhiteKeys(buildKeyRange(LOWEST_KEY_MIDI, HIGHEST_KEY_MIDI))).toBe(52);
  });

  test('empty range counts zero', () => {
    expect(countWhiteKeys([])).toBe(0);
  });
});

describe('keyModel: octaveSpanToMidiRange', () => {
  test('n octaves from C is exactly 12n keys, C..B', () => {
    expect(octaveSpanToMidiRange(2, 3)).toEqual({ lowMidi: 36, highMidi: 71 });
    expect(buildKeyRange(36, 71)).toHaveLength(36);
    expect(octaveOf(36)).toBe(2);
    expect(octaveOf(71)).toBe(4); // C2..B4, not C2..C5
  });

  test('clamps at both ends of the playable window', () => {
    expect(octaveSpanToMidiRange(0, 1).lowMidi).toBe(LOWEST_KEY_MIDI); // C0 is below A0
    expect(octaveSpanToMidiRange(7, 3).highMidi).toBe(HIGHEST_KEY_MIDI);
  });
});

describe('range: getInstrumentRange', () => {
  test('standard 6-string guitar spans E2 to the practical fret on the high E', () => {
    const range = getInstrumentRange(INSTRUMENT_PRESETS.guitar6.tuning);
    expect(range.lowMidi).toBe(40); // E2
    expect(range.highMidi).toBe(82); // E4 (64) + 18 frets = A#5
    expect(octaveOf(range.lowMidi)).toBe(2);
    expect(octaveOf(range.highMidi)).toBe(5);
  });

  test('low note is the minimum over open strings, not the last tuning entry', () => {
    // Drop D puts the lowest string last, Open D does too, but a hand-written
    // ascending tuning must give the same answer as its descending form.
    const descending = getInstrumentRange(['E4', 'B3', 'G3', 'D3', 'A2', 'E2']);
    const ascending = getInstrumentRange(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(ascending.lowMidi).toBe(descending.lowMidi);
    expect(ascending.highMidi).toBe(descending.highMidi);
  });

  test('5-string bass reaches B0, the lowest note any preset produces', () => {
    const range = getInstrumentRange(INSTRUMENT_PRESETS.bass5.tuning);
    expect(range.lowMidi).toBe(23); // B0
    expect(range.lowMidi).toBeGreaterThanOrEqual(LOWEST_KEY_MIDI);
  });

  test('8-string guitar reaches F#1 without changing the top', () => {
    const guitar8 = getInstrumentRange(INSTRUMENT_PRESETS.guitar8.tuning);
    const guitar6 = getInstrumentRange(INSTRUMENT_PRESETS.guitar6.tuning);
    expect(guitar8.lowMidi).toBe(30); // F#1
    expect(guitar8.highMidi).toBe(guitar6.highMidi);
  });

  test('every preset fits inside the 88-key window', () => {
    Object.values(INSTRUMENT_PRESETS).forEach(preset => {
      const range = getInstrumentRange(preset.tuning);
      expect(range.lowMidi).toBeGreaterThanOrEqual(LOWEST_KEY_MIDI);
      expect(range.highMidi).toBeLessThanOrEqual(HIGHEST_KEY_MIDI);
    });
  });

  test('open strings come back in tuning order with MIDI numbers', () => {
    const { openStrings } = getInstrumentRange(INSTRUMENT_PRESETS.guitar6.tuning);
    expect(openStrings).toHaveLength(6);
    expect(openStrings[0]).toEqual({ stringIndex: 0, midi: 64, name: 'E4' });
    expect(openStrings[5]).toEqual({ stringIndex: 5, midi: 40, name: 'E2' });
  });

  test('practical fret is a parameter, not baked in', () => {
    const tuning = INSTRUMENT_PRESETS.guitar6.tuning;
    expect(getInstrumentRange(tuning, 0).highMidi).toBe(64); // open high E
    expect(getInstrumentRange(tuning, 12).highMidi).toBe(76);
    expect(getInstrumentRange(tuning).highMidi)
      .toBe(getInstrumentRange(tuning, DEFAULT_PRACTICAL_FRET).highMidi);
  });

  test('flats and sharps in a tuning resolve to the same pitch', () => {
    expect(getInstrumentRange(['Eb2'], 0).lowMidi).toBe(getInstrumentRange(['D#2'], 0).lowMidi);
  });

  test('an empty or non-array tuning gives null, not a throw', () => {
    expect(getInstrumentRange([])).toBeNull();
    expect(getInstrumentRange(null)).toBeNull();
  });
});

describe('range: isInInstrumentRange', () => {
  test('inclusive at both ends', () => {
    const range = getInstrumentRange(INSTRUMENT_PRESETS.guitar6.tuning);
    expect(isInInstrumentRange(40, range)).toBe(true);
    expect(isInInstrumentRange(82, range)).toBe(true);
    expect(isInInstrumentRange(39, range)).toBe(false);
    expect(isInInstrumentRange(83, range)).toBe(false);
  });

  test('a null range dims nothing', () => {
    expect(isInInstrumentRange(21, null)).toBe(true);
  });
});
