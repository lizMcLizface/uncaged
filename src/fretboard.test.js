import { Fretboard } from './fretboard';
import { getChordPatterns } from './chordPatterns';
import { flattenLayers, scaleLayer, chordLayer, noteLayer } from './visualization';
import { getIntervalColor } from './theory/intervals';

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

// ---------------------------------------------------------------------------
// VISUALIZATION_STACK_PLAN.md step 8c: the fretboard renders the layer stack.
//
// The pass condition for that step is that `renderStack` fed a scale layer
// produces *the same markers* `markScale` does, because step 8d then moves
// the producers over and must not change what is drawn. Asserted against the
// `markers` map rather than a screenshot: it holds every styling option the
// marker was built from, so a divergence names itself instead of being
// something to spot by eye (REFACTOR_PLAN.md 2.3 lesson 9).
// ---------------------------------------------------------------------------

const markerSnapshot = fb => Array.from(fb.markers.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, marker]) => [key, marker]);

const stackFor = (...layers) => flattenLayers(layers);

describe('Fretboard.renderStack: parity with markScale', () => {
  // Real getScaleNotes output shapes: spelled, octave-suffixed, root repeated.
  const scales = {
    'C major': [['C/4', 'D/4', 'E/4', 'F/4', 'G/4', 'A/4', 'B/4', 'C/5'], 'C'],
    'E aeolian (sharps)': [['E/5', 'F#/5', 'G/5', 'A/5', 'B/5', 'C/6', 'D/6', 'E/6'], 'E'],
    'Bb major (flats)': [['Bb/4', 'C/5', 'D/5', 'Eb/5', 'F/5', 'G/5', 'A/5', 'Bb/5'], 'Bb'],
  };

  Object.entries(scales).forEach(([name, [scaleNotes, root]]) => {
    test(`${name}: same markers, same order`, () => {
      const viaMarkScale = makeFretboard();
      viaMarkScale.markScale(scaleNotes, root, { showIntervals: false });

      const viaStack = makeFretboard();
      viaStack.renderStack(stackFor(scaleLayer(scaleNotes, root, 'note')));

      expect(markerSnapshot(viaStack)).toEqual(markerSnapshot(viaMarkScale));
      expect(viaStack.markers.size).toBeGreaterThan(0);
    });

    test(`${name}: same markers in interval mode`, () => {
      const viaMarkScale = makeFretboard();
      viaMarkScale.markScale(scaleNotes, root, { showIntervals: true });

      const viaStack = makeFretboard();
      viaStack.renderStack(stackFor(scaleLayer(scaleNotes, root, 'interval')));

      expect(markerSnapshot(viaStack)).toEqual(markerSnapshot(viaMarkScale));
    });
  });
});

describe('Fretboard.renderStack: what the stack adds', () => {
  const cMajor = ['C/4', 'D/4', 'E/4', 'F/4', 'G/4', 'A/4', 'B/4'];

  test('a null stack clears the neck', () => {
    const fb = makeFretboard();
    fb.renderStack(stackFor(scaleLayer(cMajor, 'C')));
    expect(fb.markers.size).toBeGreaterThan(0);
    fb.renderStack(null);
    expect(fb.markers.size).toBe(0);
  });

  test('a layer above wins the frets it owns, and dims the rest', () => {
    const fb = makeFretboard();
    fb.renderStack(stackFor(
      scaleLayer(cMajor, 'C'),
      chordLayer({ id: 'chord', notes: ['G', 'B', 'D'], rootNote: 'G', dimBelow: true })
    ));

    // Low E string, fret 3 is G2 - a chord tone, so the chord layer owns it.
    const g = fb.markers.get('5-3');
    expect(g.borderColor).toBe(getIntervalColor(0)); // R of G, not 5 of C
    expect(g.opacity).toBe(1);
    expect(g.isRoot).toBe(true);

    // Fret 1 is F2 - in the scale, not in the chord, so it recedes.
    const f = fb.markers.get('5-1');
    expect(f.opacity).toBe(0.4);
    expect(f.label).toBe('F'); // still readable, which is the point of dimming
  });

  test('hideBelow leaves only the top layer on the neck', () => {
    const fb = makeFretboard();
    const withScale = makeFretboard();
    withScale.renderStack(stackFor(scaleLayer(cMajor, 'C')));

    fb.renderStack(stackFor(
      scaleLayer(cMajor, 'C'),
      chordLayer({ id: 'chord', notes: ['G', 'B', 'D'], rootNote: 'G', hideBelow: true })
    ));

    expect(fb.markers.size).toBeLessThan(withScale.markers.size);
    expect(fb.markers.get('5-1')).toBeUndefined(); // F2, scale-only
    expect(fb.markers.get('5-3')).toBeDefined();   // G2, in the chord
  });

  test('a specific-octave note lights one fret, not every octave', () => {
    const fb = makeFretboard();
    fb.renderStack(stackFor(noteLayer({ notes: ['E/2'], color: '#ff0000' })));
    expect(fb.markers.get('5-0')).toBeDefined(); // open low E is E2
    expect(fb.markers.get('0-0')).toBeUndefined(); // open high E is E4
  });

  test('enharmonic layers light the same frets without string matching', () => {
    const sharp = makeFretboard();
    sharp.renderStack(stackFor(noteLayer({ notes: ['F#'], color: '#ff0000' })));
    const flat = makeFretboard();
    flat.renderStack(stackFor(noteLayer({ notes: ['Gb'], color: '#ff0000' })));

    expect(Array.from(flat.markers.keys()).sort()).toEqual(Array.from(sharp.markers.keys()).sort());
    expect(sharp.markers.size).toBeGreaterThan(0);
  });
});
