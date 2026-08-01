import { parseChordToken, parseRomanNumeral, romanToDegree, resolveRomanChord } from './theory/roman';

// Characterization tests written ahead of REFACTOR_PLAN.md Phase 2, which
// lifted roman-numeral parsing/resolution into src/theory/roman.js (done -
// this import was updated from './progressionBuilder'). Pins today's
// behavior so the move can be verified, not a spec of correctness.

describe('romanToDegree', () => {
  test('maps roman numerals I-VII to 1-7, case-insensitively', () => {
    expect(romanToDegree('I')).toBe(1);
    expect(romanToDegree('vii')).toBe(7);
  });

  test('returns null for anything else', () => {
    expect(romanToDegree('Z')).toBeNull();
  });
});

describe('parseRomanNumeral', () => {
  test('plain uppercase numeral is major, lowercase is minor', () => {
    expect(parseRomanNumeral('I')).toEqual({
      type: 'roman', degree: 1, prefix: '', baseRoman: 'I', suffix: '',
      isNaturallyMinor: false, originalToken: 'I',
    });
    expect(parseRomanNumeral('ii')).toEqual({
      type: 'roman', degree: 2, prefix: '', baseRoman: 'ii', suffix: '',
      isNaturallyMinor: true, originalToken: 'ii',
    });
  });

  test('degrees 2, 3, 6, 7 read as naturally minor even when uppercase', () => {
    expect(parseRomanNumeral('bVII')).toEqual({
      type: 'roman', degree: 7, prefix: 'b', baseRoman: 'VII', suffix: '',
      isNaturallyMinor: true, originalToken: 'bVII',
    });
  });

  test('trailing suffix (e.g. seventh) is captured separately', () => {
    expect(parseRomanNumeral('V7')).toEqual({
      type: 'roman', degree: 5, prefix: '', baseRoman: 'V', suffix: '7',
      isNaturallyMinor: false, originalToken: 'V7',
    });
  });
});

describe('parseChordToken', () => {
  test('explicit chord name resolves via processChord', () => {
    const result = parseChordToken('C');
    expect(result.type).toBe('explicit');
    expect(result.rootNote).toBe('C');
    expect(result.chordType).toBe('Major');
    expect(result.chordInfo.notes).toEqual(['C/4', 'E/4', 'G/4']);
  });

  test('explicit chord with a suffix', () => {
    const result = parseChordToken('Dm7');
    expect(result.chordType).toBe('m7');
    expect(result.chordInfo.notes).toEqual(['D/4', 'F/4', 'A/4', 'C/5']);
  });

  test('roman numeral with a trailing "-N" pattern index', () => {
    const result = parseChordToken('ii-2');
    expect(result.type).toBe('roman');
    expect(result.degree).toBe(2);
    expect(result.defaultPatternIndex).toBe(1); // 1-based "-2" -> 0-based 1
    expect(result.originalToken).toBe('ii-2');
  });

  test('unparseable token returns null', () => {
    expect(parseChordToken('XYZ###')).toBeNull();
  });
});

describe('resolveRomanChord', () => {
  // Resolution reads module-level scale-selection state from
  // scaleGenerator.js. With no localStorage entry (as in a fresh test
  // environment) that defaults to scale 'Major-6' (Aeolian) rooted on 'E' -
  // this is what makes degree I resolve to E minor below, not a property of
  // resolveRomanChord itself.
  test('degree I resolves against the default scale/root (Aeolian on E -> Em)', () => {
    const resolved = resolveRomanChord(parseRomanNumeral('I'));
    expect(resolved.resolvedRoot).toBe('E');
    expect(resolved.resolvedChordType).toBe('m');
    expect(resolved.fullChordName).toBe('Em');
    expect(resolved.chordInfo.notes).toEqual(['E/4', 'G/4', 'B/4']);
  });

  test('degree vi resolves to the relative major (C)', () => {
    const resolved = resolveRomanChord(parseRomanNumeral('vi'));
    expect(resolved.resolvedRoot).toBe('C');
    expect(resolved.resolvedChordType).toBe('M');
    expect(resolved.fullChordName).toBe('CM');
  });
});
