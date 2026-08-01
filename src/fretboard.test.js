import { Fretboard } from './fretboard';
import { getChordPatterns } from './chordPatterns';

// Characterization tests written ahead of REFACTOR_PLAN.md Phase 3, which
// splits these off of the Fretboard class into src/fretboard/geometry.js
// and src/fretboard/patterns.js. Pins today's behavior so the move can be
// verified, not a spec of correctness.

function makeFretboard() {
  document.body.innerHTML = '<div id="fretboard-container"></div>';
  return new Fretboard('fretboard-container');
}

describe('Fretboard.calculateNote', () => {
  test('open string returns the string note unchanged', () => {
    const fb = makeFretboard();
    expect(fb.calculateNote('E2', 0)).toBe('E/2');
  });

  test('fretting up moves the pitch, up to and across an octave', () => {
    const fb = makeFretboard();
    expect(fb.calculateNote('E2', 5)).toBe('A/2');
    expect(fb.calculateNote('A2', 12)).toBe('A/3');
  });
});

describe('Fretboard.calculateChordPatternPositions', () => {
  test('offsets each pattern note from the given root fret', () => {
    const fb = makeFretboard();
    const pattern = getChordPatterns().major_E_string;
    expect(fb.calculateChordPatternPositions(pattern, 3)).toEqual([
      { string: 5, fret: 3, interval: 1, label: 'R' },
      { string: 4, fret: 5, interval: 5, label: '5' },
      { string: 3, fret: 5, interval: 1, label: 'R' },
      { string: 2, fret: 4, interval: 3, label: '3' },
      { string: 1, fret: 3, interval: 5, label: '5' },
      { string: 0, fret: 3, interval: 1, label: 'R' },
    ]);
  });

  test('returns null when the root fret is outside the pattern\'s range', () => {
    const fb = makeFretboard();
    const pattern = getChordPatterns().major_E_string; // maxFret: 18
    expect(fb.calculateChordPatternPositions(pattern, 25)).toBeNull();
  });
});

describe('Fretboard.findChordPatternMatches', () => {
  test('finds every known shape for a C major triad, root C', () => {
    const fb = makeFretboard();
    const matches = fb.findChordPatternMatches(['C', 'E', 'G'], 'C');
    expect(matches).toHaveLength(8);
    expect(matches.map(m => m.patternName)).toEqual(
      expect.arrayContaining(['major_E_string', 'major_D_string', 'major_open_C'])
    );
  });

  test('a match pairs the pattern with concrete fretted positions', () => {
    const fb = makeFretboard();
    const matches = fb.findChordPatternMatches(['C', 'E', 'G'], 'C');
    const eStringMatch = matches.find(m => m.patternName === 'major_E_string');
    expect(eStringMatch.rootPosition).toEqual({ string: 5, fret: 8, note: 'C/3' });
    expect(eStringMatch.positions).toHaveLength(6);
    expect(eStringMatch.patternNotes).toEqual(['C', 'G', 'C', 'E', 'G', 'C']);
  });
});
