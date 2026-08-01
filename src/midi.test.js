import { noteToMidi, noteToName } from './midi';

// Characterization tests written ahead of REFACTOR_PLAN.md Phase 2, which
// relocates these into src/theory/notes.js. They pin today's behavior so
// the move can be verified byte-for-byte, not a spec of correct behavior.

describe('noteToMidi', () => {
  test('natural notes', () => {
    expect(noteToMidi('C/4')).toBe(48);
    expect(noteToMidi('E/4')).toBe(52);
    expect(noteToMidi('A/4')).toBe(57);
  });

  test('sharps and double sharps', () => {
    expect(noteToMidi('E#/4')).toBe(53);
    expect(noteToMidi('C##/4')).toBe(50);
  });

  test('flats and double flats', () => {
    expect(noteToMidi('Ebb/4')).toBe(50);
    expect(noteToMidi('Bb/3')).toBe(46);
  });

  test('octave boundary', () => {
    expect(noteToMidi('C/0')).toBe(0);
    expect(noteToMidi('C/5')).toBe(60);
  });
});

describe('noteToName', () => {
  // Note: noteToName is NOT the inverse of noteToMidi - it subtracts 1 from
  // the octave that noteToMidi would have produced for the same pitch
  // (noteToMidi('C/4') === 48, but noteToName(48) === 'C/3'). This
  // asymmetry is exactly the kind of thing REFACTOR_PLAN.md 2.2 flags about
  // the duplicated notation.js pair - pinned here, not endorsed.
  test('naturals', () => {
    expect(noteToName(60)).toBe('C/4');
    expect(noteToName(69)).toBe('A/4');
  });

  test('spells accidentals as sharps', () => {
    expect(noteToName(61)).toBe('C#/4');
    expect(noteToName(70)).toBe('A#/4');
  });

  test('low input can go to a negative octave string', () => {
    expect(noteToName(0)).toBe('C/-1');
    expect(noteToName(11)).toBe('B/-1');
  });
});
