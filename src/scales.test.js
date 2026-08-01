import { getScaleNotes } from './scales';

// Characterization tests written ahead of REFACTOR_PLAN.md Phase 2, which
// relocates this into src/theory/scales.js as data plus a builder. Pins
// today's behavior so the move can be verified, not a spec of correctness.

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
