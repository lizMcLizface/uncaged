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

// Missing chord suffixes to be added later:a
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
