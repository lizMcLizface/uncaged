# Temporal Grid System Test

## Problem Description
The original grid format assumed that treble and bass notes at the same array index should be played simultaneously, but this doesn't work when notes have different durations.

## Example Problem Case
```javascript
// Original problematic case:
var testNoteArray = [
    [ // Treble notes
        [
            {"note": "C/5", "duration": "h"},  // Half note (2 beats)
            {"note": "E/5", "duration": "q"}   // Quarter note (1 beat) - starts after treble half note ends
        ]
    ],
    [ // Bass notes
        [
            {"note": "C/3", "duration": "q"},  // Quarter note (1 beat)
            {"note": "G/3", "duration": "q"},  // Quarter note (1 beat)
            {"note": "E/3", "duration": "h"}   // Half note (2 beats) - overlaps with both previous notes
        ]
    ]
];
```

## Solution: Temporal Grid System
The new system:
1. **Creates temporal events** for each note with start/end times
2. **Builds a unified timeline** with all time points
3. **Creates grid segments** for each time interval
4. **Handles overlapping notes** correctly
5. **Maintains original durations** for proper rendering

## Timeline Example
For the test case above:
- Time 0-1: C/5 (treble) + C/3 (bass) 
- Time 1-2: C/5 (treble) + G/3 (bass)
- Time 2-3: E/5 (treble) + E/3 (bass)
- Time 3-4: (rest) + E/3 (bass)

## Benefits
- ✅ Supports notes with different durations in treble vs bass
- ✅ Properly handles temporal overlaps
- ✅ Maintains correct musical timing
- ✅ Grid navigation works correctly with complex rhythms
- ✅ Highlighting works accurately for each note
- ✅ Backward compatible with existing functionality

## Code Changes
- Updated `drawNotes2()` function with temporal grid logic
- Updated `highlightNotesInNotation()` function to use same system
- Added `trebleTime` and `bassTime` tracking to grid data
- Enhanced grid data structure with temporal information
