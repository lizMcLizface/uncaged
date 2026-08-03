/**
 * The chord-suffix vocabulary: which chord qualities this app can name,
 * grouped by the category headings the UI shows them under. Pure data, no
 * imports.
 *
 * This is the whole surviving content of src/chords.js, which Phase 4c
 * deleted (see REFACTOR_PLAN.md 1.2 and ARCHITECTURE.md 6.28). It lives
 * here because both consumers are chord-engine consumers:
 *
 * - ./chords.js - identifySyntheticChords passes `chords` to matchChord as
 *   the candidate set to spell an arbitrary note collection against.
 * - ../scales/ui/infoPanel.js - same, for the per-degree chord names in the
 *   scale info panel.
 *
 * Moving it here also breaks the theory/chords.js <-> chords.js circular
 * import that Phase 2 found and documented (ARCHITECTURE.md 6.1): the cycle
 * existed because the old src/chords.js imported processChord back out of
 * the engine for its DOM tooltips. That code is gone, and data has no
 * imports, so nothing points back.
 *
 * The group *keys* are load-bearing, the group order is not. matchChord
 * dispatches on them by name against the input's note count: a 3-note input
 * is only ever matched against 'triads' and a 4-note one only against
 * 'sevenths' (chords.js:604-605), so 'common', 'nines', 'elevens' and
 * 'thirteens' are reachable only for collections of some other size.
 * Renaming a group, or moving a suffix between groups, changes which names
 * a chord can report; reordering them does not.
 */

let chordSuffixesCommon = ['Major', 'Minor', '7', '5', 'dim', 'dim7', 'aug', 'sus2', 'sus4', 'maj7', 'm7', '7sus4', '7b9']
let chordSuffixesTriads = ['M', 'm', '+', 'o', 'b5', 'sus2', 'sus4']
let chordSuffixesSevenths = ['7', 'M7','mM7', 'm7', '+M7','+7','ø', 'o7', '7b5', 'm6', '6']
let chordSuffixesNines = ['M9', '9', '7b9', 'm9', 'mM9', '+M9', '+9', 'ø9', 'o9', 'ob9']
let chordSuffixesElevens = ['11', 'm11', 'M11', 'mM11', '+M11', '+11', 'ø11', 'o11']
let chordSuffixesThirteens = ['13', 'm13', 'M13', 'mM13', '+M13', '+13', 'ø13']

let chords = {
    'common': chordSuffixesCommon,
    'triads': chordSuffixesTriads,
    'sevenths': chordSuffixesSevenths,
    'nines': chordSuffixesNines,
    'elevens': chordSuffixesElevens,
    'thirteens': chordSuffixesThirteens
}

// Suffixes ./chords.js can already spell but that are not listed above, so
// matchChord will never name a chord with one. Marked "(supported)" below.
// The rest are not implemented at all. Kept as the standing TODO it has
// always been.
//
// sus24 = sus2add4 (supported)
// m2 = madd2 (supported)
// 6m = min6 (supported)
// 6/9 = 6add9 (supported)
// M#11
// M7sus24
// 57 = 7no3 (supported)
// 7#9
// M7b9
// m7b9
// mM7b9
// +M7b9
// +7b9
// ø7b9
// 7/6 = 7add6 (supported)
// 7/6sus2 = 7sus2add6 (supported)
// 7sus24 = 7sus2add4 (supported)
// 7#11
// 7b13
// M7#11
// m7#11
// 7b13sus
// +M7#9
// +7#9
// 7#9#11
// m11b5b9
// m11b9
// M9#11

export {chords};
