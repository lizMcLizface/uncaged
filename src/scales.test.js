import { getScaleNotes } from './scales';
import { buildStackedThirds, bumpOctave } from './theory/chords';

const MAJOR = ['W', 'W', 'H', 'W', 'W', 'W', 'H'];

// Characterization tests written ahead of REFACTOR_PLAN.md Phase 2. Pins
// today's behavior so later moves can be verified, not a spec of
// correctness - getScaleNotes itself now lives in src/scales/scaleData.js,
// reached here via the src/scales/ barrel (Phase 4).

describe('getScaleNotes', () => {
  test('major scale (W W H W W W H) from C', () => {
    expect(getScaleNotes('C', ['W', 'W', 'H', 'W', 'W', 'W', 'H']))
      .toEqual(['C/4', 'D/4', 'E/4', 'F/4', 'G/4', 'A/4', 'B/4', 'C/5']);
  });

  test('pentatonic scale using augmented (A) steps from A', () => {
    expect(getScaleNotes('A', ['A', 'W', 'W', 'A', 'W']))
      .toEqual(['A/4', 'C/5', 'D/5', 'E/5', 'G/5', 'A/5']);
  });

  test('invalid intervals fall back to the root note alone', () => {
    expect(getScaleNotes('C', [])).toEqual(['C/5']);
  });
});

// Extracted from scales/ui/infoPanel.js when the degree hotkeys
// (src/degreeKeys.js) became a second caller. A spec, not a pin: the whole
// reason it is not `generateSyntheticChords` is the octave bumping below.
describe('buildStackedThirds', () => {
  const cMajor = getScaleNotes('C', MAJOR);

  test('stacks thirds from each degree', () => {
    const degrees = buildStackedThirds(cMajor, 3);
    expect(degrees).toHaveLength(7);
    expect(degrees[0].chord).toEqual(['C', 'E', 'G']);
    expect(degrees[1].chord).toEqual(['D', 'F', 'A']);
    expect(degrees[6].chord).toEqual(['B', 'D', 'F']);
  });

  test('each length is one more third than the last', () => {
    const from = length => buildStackedThirds(cMajor, length)[0].chord;
    expect(from(1)).toEqual(['C']);
    expect(from(3)).toEqual(['C', 'E', 'G']);
    expect(from(4)).toEqual(['C', 'E', 'G', 'B']);
    expect(from(5)).toEqual(['C', 'E', 'G', 'B', 'D']);
  });

  test('a wrapped tone rises an octave instead of dropping below the root', () => {
    // This is the whole difference from generateSyntheticChords, which wraps
    // the index without bumping and so returns a scrambled inversion. The
    // ninth of I is D5, above B4 - not the D4 the scale array holds.
    const ninth = buildStackedThirds(cMajor, 5)[0];
    expect(ninth.chordWithOctave).toEqual(['C/4', 'E/4', 'G/4', 'B/4', 'D/5']);

    // vii° stacks past the top twice over and must keep rising throughout.
    const leadingTone = buildStackedThirds(cMajor, 4)[6];
    expect(leadingTone.chordWithOctave).toEqual(['B/4', 'D/5', 'F/5', 'A/5']);
  });

  test('scale degrees are reported 1-based, wrapping', () => {
    expect(buildStackedThirds(cMajor, 4)[6].scaleDegrees).toEqual([7, 2, 4, 6]);
  });

  test('a scale too short to have degrees yields nothing rather than throwing', () => {
    expect(buildStackedThirds(['C/4'], 3)).toEqual([]);
    expect(buildStackedThirds([], 3)).toEqual([]);
  });
});

describe('bumpOctave', () => {
  test('shifts whole octaves, keeping the spelling', () => {
    expect(bumpOctave('Eb/4', 1)).toBe('Eb/5');
    expect(bumpOctave('F#/3', -2)).toBe('F#/1');
  });

  test('a zero bump and an octave-less name are both returned untouched', () => {
    expect(bumpOctave('Eb/4', 0)).toBe('Eb/4');
    expect(bumpOctave('Eb', 1)).toBe('Eb');
  });
});
