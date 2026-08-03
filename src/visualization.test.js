import {
  visualizationState,
  setBaseLayer,
  pushLayer,
  popLayer,
  clearTransient,
  clearLayers,
  getLayers,
  getBaseLayer,
  subscribe
} from './visualization/stack';
import { flattenLayers, parseLayerNote } from './visualization/flatten';
import { scaleLayer, chordLayer, noteLayer, SCALE_LAYER_ID } from './visualization/layers';
import { getIntervalColor } from './theory/intervals';

// Tests for VISUALIZATION_STACK_PLAN.md step 8a. A spec, not a
// characterization pin - all three modules are new. They exist because 8a is
// the step whose bugs stay invisible until both renderers sit on top of it,
// the same argument PIANO_VIEW_PLAN.md made for keyModel.js.
//
// The stack is module-level state, so every test starts from empty.

beforeEach(() => {
  clearLayers();
});

const layerWith = (id, notes, extra = {}) => ({ id, notes, ...extra });
const note = (name, extra = {}) => ({ note: name, color: '#000000', label: name, ...extra });

describe('stack: base and overlays', () => {
  test('an empty stack has no layers and no base', () => {
    expect(getLayers()).toEqual([]);
    expect(getBaseLayer()).toBeNull();
  });

  test('the base sits at the bottom, overlays above it in push order', () => {
    setBaseLayer(layerWith('scale', []));
    pushLayer(layerWith('a', []));
    pushLayer(layerWith('b', []));

    expect(getLayers().map(layer => layer.id)).toEqual(['scale', 'a', 'b']);
  });

  test('overlays render without a base', () => {
    pushLayer(layerWith('a', []));
    expect(getLayers().map(layer => layer.id)).toEqual(['a']);
  });

  test('setBaseLayer(null) clears the base - a real display state', () => {
    setBaseLayer(layerWith('scale', []));
    setBaseLayer(null);
    expect(getBaseLayer()).toBeNull();
    expect(getLayers()).toEqual([]);
  });

  test('getLayers hands out a copy, so a renderer cannot mutate the stack', () => {
    setBaseLayer(layerWith('scale', []));
    const layers = getLayers();
    layers.push(layerWith('sneaky', []));
    expect(getLayers()).toHaveLength(1);
  });

  test('a layer without a usable id is rejected rather than stacked', () => {
    expect(pushLayer(null)).toBe(false);
    expect(pushLayer({ notes: [] })).toBe(false);
    expect(pushLayer({ id: '', notes: [] })).toBe(false);
    expect(getLayers()).toEqual([]);
  });
});

describe('stack: push, pop, replace', () => {
  test('pushing an existing id replaces in place, never stacks a duplicate', () => {
    pushLayer(layerWith('a', []));
    pushLayer(layerWith('b', []));
    pushLayer(layerWith('a', [note('C')]));

    const ids = getLayers().map(layer => layer.id);
    expect(ids).toEqual(['a', 'b']); // 'a' did not move to the top
    expect(getLayers()[0].notes).toHaveLength(1); // but its content did update
  });

  test('a source that never pops cannot leak more than one layer', () => {
    for (let i = 0; i < 20; i++) pushLayer(layerWith('hover', []));
    expect(getLayers()).toHaveLength(1);
  });

  test('popping an absent id is a silent no-op', () => {
    pushLayer(layerWith('a', []));
    expect(popLayer('nope')).toBe(false);
    expect(popLayer(undefined)).toBe(false);
    expect(getLayers()).toHaveLength(1);
  });

  test('pop removes only its own layer', () => {
    pushLayer(layerWith('a', []));
    pushLayer(layerWith('b', []));
    pushLayer(layerWith('c', []));
    popLayer('b');
    expect(getLayers().map(layer => layer.id)).toEqual(['a', 'c']);
  });

  test('pop never touches the base, even by id collision', () => {
    setBaseLayer(layerWith('scale', []));
    expect(popLayer('scale')).toBe(false);
    expect(getBaseLayer()).not.toBeNull();
  });
});

describe('stack: transience', () => {
  test('a new base drops hover previews', () => {
    setBaseLayer(layerWith('scale', []));
    pushLayer(layerWith('hover', []));
    setBaseLayer(layerWith('scale2', []));

    expect(getLayers().map(layer => layer.id)).toEqual(['scale2']);
  });

  test('an overlay is transient unless it says otherwise', () => {
    pushLayer(layerWith('hover', []));
    setBaseLayer(layerWith('scale', []));
    expect(getLayers().map(layer => layer.id)).toEqual(['scale']);
  });

  test('transient: false survives a base change - a chord pinned over its scale', () => {
    setBaseLayer(layerWith('scale', []));
    pushLayer(layerWith('pinned-chord', [], { transient: false }));
    pushLayer(layerWith('hover', []));
    setBaseLayer(layerWith('scale2', []));

    expect(getLayers().map(layer => layer.id)).toEqual(['scale2', 'pinned-chord']);
  });

  test('clearTransient drops previews and keeps the pinned layer and base', () => {
    setBaseLayer(layerWith('scale', []));
    pushLayer(layerWith('pinned', [], { transient: false }));
    pushLayer(layerWith('hover', []));

    expect(clearTransient()).toBe(true);
    expect(getLayers().map(layer => layer.id)).toEqual(['scale', 'pinned']);
    expect(clearTransient()).toBe(false); // nothing left to clear
  });

  test('clearLayers empties everything, pinned included', () => {
    setBaseLayer(layerWith('scale', []));
    pushLayer(layerWith('pinned', [], { transient: false }));

    expect(clearLayers()).toBe(true);
    expect(getLayers()).toEqual([]);
    expect(visualizationState.base).toBeNull();
    expect(visualizationState.overlays).toEqual([]);
  });
});

describe('stack: subscription', () => {
  test('every mutation notifies once, with the whole stack', () => {
    const seen = [];
    const unsubscribe = subscribe(layers => seen.push(layers.map(layer => layer.id)));

    setBaseLayer(layerWith('scale', []));
    pushLayer(layerWith('hover', []));
    popLayer('hover');

    expect(seen).toEqual([['scale'], ['scale', 'hover'], ['scale']]);
    unsubscribe();
  });

  test('a no-op does not notify - a stray mouseleave costs nothing', () => {
    const subscriber = jest.fn();
    const unsubscribe = subscribe(subscriber);

    popLayer('never-pushed');
    clearTransient();
    pushLayer({ id: '' });

    expect(subscriber).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('unsubscribing stops the notifications', () => {
    const subscriber = jest.fn();
    subscribe(subscriber)();
    setBaseLayer(layerWith('scale', []));
    expect(subscriber).not.toHaveBeenCalled();
  });

  test('one broken renderer does not stop the other', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const healthy = jest.fn();
    const unsubscribeBroken = subscribe(() => { throw new Error('render failed'); });
    const unsubscribeHealthy = subscribe(healthy);

    setBaseLayer(layerWith('scale', []));

    expect(healthy).toHaveBeenCalledTimes(1);
    unsubscribeBroken();
    unsubscribeHealthy();
    warn.mockRestore();
  });
});

describe('flatten: parseLayerNote', () => {
  test("a '/' selects specific, its absence selects periodic", () => {
    expect(parseLayerNote('E')).toMatchObject({ midi: null, pitchClass: 4, specific: false });
    expect(parseLayerNote('E/2')).toMatchObject({ midi: 40, pitchClass: 4, specific: true });
  });

  test('enharmonics collapse, including across an octave boundary', () => {
    expect(parseLayerNote('Gb').pitchClass).toBe(parseLayerNote('F#').pitchClass);
    expect(parseLayerNote('Cb/5').pitchClass).toBe(11);
    expect(parseLayerNote('B#/4').pitchClass).toBe(0);
  });

  test('unparseable input gives null rather than throwing', () => {
    expect(parseLayerNote('H')).toBeNull();
    expect(parseLayerNote('')).toBeNull();
    expect(parseLayerNote(null)).toBeNull();
    expect(parseLayerNote(42)).toBeNull();
  });
});

describe('flatten: periodic vs specific', () => {
  test("'E' lights every octave", () => {
    const flat = flattenLayers([layerWith('a', [note('E')])]);
    expect(flat.resolve(40)).not.toBeNull(); // E2
    expect(flat.resolve(64)).not.toBeNull(); // E4
    expect(flat.resolve(76)).not.toBeNull(); // E5
  });

  test("'E/4' lights exactly one key", () => {
    const flat = flattenLayers([layerWith('a', [note('E/4')])]);
    expect(flat.resolve(64)).not.toBeNull();
    expect(flat.resolve(76)).toBeNull(); // E5
    expect(flat.resolve(52)).toBeNull(); // E3
  });

  test('an unlit key resolves to null, not to an empty entry', () => {
    const flat = flattenLayers([layerWith('a', [note('E')])]);
    expect(flat.resolve(65)).toBeNull(); // F4
    expect(flat.resolve(NaN)).toBeNull();
  });

  test('a Gb layer and an F# layer address the same key', () => {
    const flat = flattenLayers([
      layerWith('a', [note('F#')]),
      layerWith('b', [{ note: 'Gb', color: '#ffffff', label: 'Gb' }])
    ]);
    expect(flat.resolve(66).label).toBe('Gb'); // the higher layer won
    expect(flat.periodic.size).toBe(1); // and did not stack a second entry
  });

  test('an empty or absent layer list flattens to nothing', () => {
    expect(flattenLayers([]).resolve(60)).toBeNull();
    expect(flattenLayers(null).resolve(60)).toBeNull();
    expect(flattenLayers([{ id: 'a' }]).resolve(60)).toBeNull();
  });
});

describe('flatten: layer order', () => {
  test('the higher layer wins an overlapping pitch class', () => {
    const flat = flattenLayers([
      layerWith('scale', [{ note: 'E', color: '#111111', label: 'scale' }]),
      layerWith('chord', [{ note: 'E', color: '#222222', label: 'chord' }])
    ]);
    expect(flat.resolve(64)).toMatchObject({ label: 'chord', layerId: 'chord', layerIndex: 1 });
  });

  test('specific beats periodic within one layer', () => {
    const flat = flattenLayers([
      layerWith('a', [
        { note: 'E', color: '#111111', label: 'any' },
        { note: 'E/4', color: '#222222', label: 'one' }
      ])
    ]);
    expect(flat.resolve(64).label).toBe('one');
    expect(flat.resolve(76).label).toBe('any'); // E5 falls back to the periodic entry
  });

  test('across layers, order beats specificity', () => {
    const flat = flattenLayers([
      layerWith('low', [{ note: 'E/4', color: '#111111', label: 'specific-below' }]),
      layerWith('high', [{ note: 'E', color: '#222222', label: 'periodic-above' }])
    ]);
    expect(flat.resolve(64).label).toBe('periodic-above');
  });

  test('entries carry which layer produced them', () => {
    const flat = flattenLayers([layerWith('scale', [note('C')]), layerWith('hover', [note('G')])]);
    expect(flat.resolve(60)).toMatchObject({ layerId: 'scale', layerIndex: 0 });
    expect(flat.resolve(67)).toMatchObject({ layerId: 'hover', layerIndex: 1 });
  });
});

describe('flatten: dimBelow', () => {
  test('dims exactly the layers below the one that set it', () => {
    const flat = flattenLayers([
      layerWith('scale', [note('C')]),
      layerWith('mid', [note('D')]),
      layerWith('chord', [note('E')], { dimBelow: true })
    ]);
    expect(flat.resolve(60).dimmed).toBe(true);  // scale
    expect(flat.resolve(62).dimmed).toBe(true);  // mid
    expect(flat.resolve(64).dimmed).toBe(false); // the dimming layer itself
  });

  test('nothing dims when no layer asks for it', () => {
    const flat = flattenLayers([layerWith('scale', [note('C')]), layerWith('chord', [note('E')])]);
    expect(flat.resolve(60).dimmed).toBe(false);
    expect(flat.dimIndex).toBe(-1);
  });

  test('dimBelow on the bottom layer dims nothing', () => {
    const flat = flattenLayers([layerWith('scale', [note('C')], { dimBelow: true })]);
    expect(flat.resolve(60).dimmed).toBe(false);
  });

  test('two stacked previews dim from the topmost one only', () => {
    const flat = flattenLayers([
      layerWith('scale', [note('C')]),
      layerWith('first', [note('D')], { dimBelow: true }),
      layerWith('second', [note('E')], { dimBelow: true })
    ]);
    expect(flat.dimIndex).toBe(2);
    expect(flat.resolve(62).dimmed).toBe(true); // 'first' is now below the top dimmer
    expect(flat.resolve(64).dimmed).toBe(false);
  });
});

describe('flatten: hideBelow', () => {
  test('layers below the hider contribute nothing at all', () => {
    const flat = flattenLayers([
      layerWith('scale', [note('C')]),
      layerWith('chord', [note('E')], { hideBelow: true })
    ]);
    expect(flat.resolve(60)).toBeNull();
    expect(flat.resolve(64)).not.toBeNull();
  });

  test('hiding wins over dimming for the same layer', () => {
    const flat = flattenLayers([
      layerWith('scale', [note('C')]),
      layerWith('chord', [note('E')], { dimBelow: true, hideBelow: true })
    ]);
    expect(flat.resolve(60)).toBeNull();
  });

  test('hideBelow on the bottom layer hides nothing', () => {
    const flat = flattenLayers([layerWith('scale', [note('C')], { hideBelow: true })]);
    expect(flat.resolve(60)).not.toBeNull();
  });
});

describe('layers: scaleLayer', () => {
  // getScaleNotes' real output shape: spelled, octave-suffixed, and it
  // repeats the root an octave up at the end.
  const eAeolian = ['E/5', 'F#/5', 'G/5', 'A/5', 'B/5', 'C/6', 'D/6', 'E/6'];

  test('is the persistent base: fixed id, not transient, dims nothing', () => {
    const layer = scaleLayer(eAeolian, 'E');
    expect(layer.id).toBe(SCALE_LAYER_ID);
    expect(layer.transient).toBe(false);
    expect(layer.dimBelow).toBe(false);
  });

  test('is periodic - the octaves in scaleNotes carry no meaning', () => {
    const layer = scaleLayer(eAeolian, 'E');
    expect(layer.notes).toHaveLength(7); // the repeated root collapsed
    layer.notes.forEach(entry => expect(entry.note).not.toContain('/'));

    const flat = flattenLayers([layer]);
    expect(flat.resolve(40)).not.toBeNull(); // E2, nowhere near the given octaves
  });

  test('colour comes from semitones above the root, not scale degree', () => {
    const minor = scaleLayer(['C/5', 'Eb/5', 'G/5'], 'C');
    const major = scaleLayer(['C/5', 'E/5', 'G/5'], 'C');
    const minorThird = minor.notes.find(entry => entry.note === 'Eb');
    const majorThird = major.notes.find(entry => entry.note === 'E');

    expect(minorThird.semitone).toBe(3);
    expect(majorThird.semitone).toBe(4);
    expect(minorThird.color).toBe(getIntervalColor(3));
    expect(minorThird.color).not.toBe(majorThird.color);
  });

  test('keeps the scale\'s own spelling, octave stripped', () => {
    const layer = scaleLayer(['Bb/5', 'C/6', 'D/6'], 'Bb');
    expect(layer.notes.map(entry => entry.note)).toEqual(['Bb', 'C', 'D']);
    expect(layer.notes[0].label).toBe('Bb');
  });

  test("'interval' mode labels from the root, 'finger' falls back to note names", () => {
    const intervals = scaleLayer(eAeolian, 'E', 'interval');
    expect(intervals.notes.map(entry => entry.label)).toEqual(['R', 'M2', 'm3', 'P4', 'P5', 'm6', 'm7']);

    const finger = scaleLayer(eAeolian, 'E', 'finger');
    expect(finger.notes.map(entry => entry.label)).toEqual(scaleLayer(eAeolian, 'E', 'note').notes.map(entry => entry.label));
  });

  test('marks the root, once', () => {
    const roots = scaleLayer(eAeolian, 'E').notes.filter(entry => entry.isRoot);
    expect(roots).toHaveLength(1);
    expect(roots[0].note).toBe('E');
  });

  test('an enharmonically-spelled root still measures correctly', () => {
    const layer = scaleLayer(['Gb/5', 'Bb/5', 'Db/6'], 'F#');
    expect(layer.notes.find(entry => entry.note === 'Gb').semitone).toBe(0);
    expect(layer.notes.find(entry => entry.note === 'Bb').semitone).toBe(4);
  });

  test('bad input gives an empty layer, not a throw', () => {
    expect(scaleLayer(null, 'C').notes).toEqual([]);
    expect(scaleLayer(['C/4'], 'H').notes).toEqual([]);
    expect(scaleLayer(['C/4', 'nonsense', null], 'C').notes).toHaveLength(1);
  });
});

describe('layers: chordLayer', () => {
  test('keeps the octaves a fingering resolved to', () => {
    const layer = chordLayer({
      id: 'chord',
      notes: ['E/2', 'B/2', 'E/3', 'G#/3', 'B/3', 'E/4'],
      rootNote: 'E'
    });
    expect(layer.notes.map(entry => entry.note)).toEqual(['E/2', 'B/2', 'E/3', 'G#/3', 'B/3', 'E/4']);

    const flat = flattenLayers([layer]);
    expect(flat.resolve(40)).not.toBeNull(); // E2, in the shape
    expect(flat.resolve(76)).toBeNull();     // E5, not in the shape
  });

  test('a chord with no playable shape stays periodic', () => {
    const flat = flattenLayers([chordLayer({ notes: ['E', 'G#', 'B'], rootNote: 'E' })]);
    expect(flat.resolve(40)).not.toBeNull();
    expect(flat.resolve(76)).not.toBeNull(); // every octave
  });

  test('colours measure from the chord root, not the scale root', () => {
    const layer = chordLayer({ notes: ['G', 'B', 'D'], rootNote: 'G' });
    expect(layer.notes.map(entry => entry.semitone)).toEqual([0, 4, 7]);
    expect(layer.notes[1].color).toBe(getIntervalColor(4));
  });

  test('a doubled pitch is one entry, a doubled pitch class across octaves is not', () => {
    expect(chordLayer({ notes: ['E/2', 'E/2'], rootNote: 'E' }).notes).toHaveLength(1);
    expect(chordLayer({ notes: ['E/2', 'E/4'], rootNote: 'E' }).notes).toHaveLength(2);
    expect(chordLayer({ notes: ['E', 'E'], rootNote: 'E' }).notes).toHaveLength(1);
  });

  test('positions ride along untouched, for the fretboard renderer only', () => {
    const positions = [{ string: 5, fret: 0, note: 'E', isRoot: true }];
    const layer = chordLayer({ notes: ['E/2'], rootNote: 'E', positions });
    expect(layer.positions).toBe(positions);
    // and nothing in the flattened result depends on them
    expect(flattenLayers([layer]).resolve(40)).not.toBeNull();
  });

  test('defaults to a transient overlay that dims nothing', () => {
    const layer = chordLayer({ notes: ['E'], rootNote: 'E' });
    expect(layer.transient).toBe(true);
    expect(layer.dimBelow).toBe(false);
    expect(layer.hideBelow).toBe(false);
  });

  test('remembers its root and label mode, so it can be rebuilt from itself', () => {
    // The position picker swaps one fingering of a chord for another by
    // rebuilding the live layer. Without these two fields it would have to
    // thread them back through the caller, which is how they drift - and a
    // naive `{...layer, notes: [...]}` spread produces a layer whose notes
    // are raw names rather than resolved objects, which nothing can render.
    const layer = chordLayer({ notes: ['E/2'], rootNote: 'E', labelMode: 'interval' });
    expect(layer.rootNote).toBe('E');
    expect(layer.labelMode).toBe('interval');

    const rebuilt = chordLayer({
      id: layer.id,
      label: layer.label,
      rootNote: layer.rootNote,
      labelMode: layer.labelMode,
      notes: ['B/2'],
      dimBelow: layer.dimBelow,
      transient: layer.transient
    });
    expect(rebuilt.notes[0]).toMatchObject({ note: 'B/2', semitone: 7 });
    expect(flattenLayers([rebuilt]).resolve(47)).not.toBeNull(); // B2
  });

  test('without a root, notes are uncoloured rather than mis-coloured', () => {
    const layer = chordLayer({ notes: ['E', 'G#'] });
    expect(layer.notes[0].color).toBeNull();
    expect(layer.notes[0].semitone).toBeNull();
    expect(layer.notes[0].isRoot).toBe(false);
  });
});

describe('layers: noteLayer', () => {
  test('one colour across the given notes, periodic or specific as written', () => {
    const layer = noteLayer({ id: 'search', notes: ['C', 'F#/3'], color: '#ff0000' });
    expect(layer.notes.map(entry => entry.color)).toEqual(['#ff0000', '#ff0000']);

    const flat = flattenLayers([layer]);
    expect(flat.resolve(72)).not.toBeNull();  // C5, periodic
    expect(flat.resolve(54)).not.toBeNull();  // F#3
    expect(flat.resolve(66)).toBeNull();      // F#4, not asked for
  });

  test('labels can be suppressed', () => {
    expect(noteLayer({ notes: ['C/4'], showLabels: false }).notes[0].label).toBe('');
    expect(noteLayer({ notes: ['C/4'] }).notes[0].label).toBe('C');
  });

  test('bad input gives an empty layer, not a throw', () => {
    expect(noteLayer({ notes: null }).notes).toEqual([]);
    expect(noteLayer({ notes: ['H', 'C'] }).notes).toHaveLength(1);
  });
});

describe('the stack end to end', () => {
  test('hovering a chord over a scale, then leaving, restores exactly the scale', () => {
    const scale = scaleLayer(['C/4', 'D/4', 'E/4', 'F/4', 'G/4', 'A/4', 'B/4'], 'C');
    setBaseLayer(scale);
    const before = flattenLayers(getLayers());

    pushLayer(chordLayer({
      id: 'chord-hover',
      notes: ['G/3', 'B/3', 'D/4'],
      rootNote: 'G',
      dimBelow: true
    }));
    const during = flattenLayers(getLayers());

    // The chord's own keys are undimmed and in the chord's colours; the rest
    // of the scale is still visible, dimmed.
    expect(during.resolve(55)).toMatchObject({ layerId: 'chord-hover', dimmed: false }); // G3
    expect(during.resolve(64)).toMatchObject({ layerId: SCALE_LAYER_ID, dimmed: true }); // E4

    popLayer('chord-hover');
    const after = flattenLayers(getLayers());
    expect(after.resolve(64)).toEqual(before.resolve(64));
    expect(after.resolve(55)).toEqual(before.resolve(55));
  });

  test('a scale change while a chord is hovered leaves no stale preview', () => {
    setBaseLayer(scaleLayer(['C/4', 'E/4', 'G/4'], 'C'));
    pushLayer(chordLayer({ id: 'chord-hover', notes: ['G/3'], rootNote: 'G' }));

    setBaseLayer(scaleLayer(['A/4', 'C/5', 'E/5'], 'A'));

    expect(getLayers().map(layer => layer.id)).toEqual([SCALE_LAYER_ID]);
    expect(flattenLayers(getLayers()).resolve(55)).toBeNull(); // G3 preview gone
  });
});
