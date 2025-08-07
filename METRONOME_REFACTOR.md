# Metronome Refactor: Absolute Timebase Implementation

## Overview

The metronome has been refactored from using an incremental approach with relative timings to an absolute timebase system. This provides more robust timing, better synchronization capabilities, and easier integration with other components.

## Key Changes

### 1. Absolute Timebase Properties
- **`referenceTime`**: The absolute time when the metronome started or tempo changed
- **`timePerBeat`**: Duration of each beat in seconds (calculated as 60 / BPM)
- **`totalBeatsPlayed`**: Total number of beats played since reference time

### 2. Core Methods

#### `setReferenceTime(time)`
Sets the reference time and resets the timebase. Called automatically when starting or changing tempo.

#### `setTempo(newTempo)`
Updates tempo and recalculates timebase while preserving timing accuracy during tempo changes.

#### `getTimeForBeat(beatNumber)`
Returns the absolute time for any specific beat number using:
```javascript
beatTime = referenceTime + (beatNumber * timePerBeat)
```

#### `getNextBeatTime()`
Calculates the time for the next beat after the current audio context time.

#### `getCurrentBeatInfo()`
Returns information about the current timing state including total beats and beat position in bar.

### 3. Utility Methods for External Integration

#### `getTimePerBeat()` / `getTempo()` / `getReferenceTime()`
Getters for accessing timing information from other components.

#### `isOnBeat(tolerance)`
Checks if the current time is within tolerance of a beat boundary.

#### `getTimeUntilNextBeat()`
Returns the time remaining until the next beat.

#### `scheduleOnNextBeat(callback, offset)`
Schedules a callback to execute on the next beat, with optional time offset.

## Benefits

### 1. Improved Timing Accuracy
- No cumulative timing drift from incremental additions
- Exact beat times can be calculated for any beat number
- Tempo changes don't affect timing precision

### 2. Better Synchronization
- External components can easily sync to the metronome timeline
- Absolute beat times enable precise scheduling
- Multiple components can share the same timing reference

### 3. Enhanced Functionality
- Query timing information at any point
- Schedule events for specific beats
- Check beat alignment for recording/playback
- Create synchronized visual effects and sequencers

### 4. Easier Integration
- Clear API for timing queries
- Methods for scheduling synchronized events
- Support for complex timing relationships

## Usage Examples

### Basic Timing Queries
```javascript
import { metronome } from './metronome.js';

// Get current timing info
const timePerBeat = metronome.getTimePerBeat();
const beatInfo = metronome.getCurrentBeatInfo();
const isOnBeat = metronome.isOnBeat(0.02); // 20ms tolerance
```

### Event Scheduling
```javascript
// Schedule something on the next beat
const timerId = metronome.scheduleOnNextBeat(() => {
    console.log('Beat triggered!');
});

// Schedule for a specific beat number
const beatTime = metronome.getTimeForBeat(100);
```

### Synchronization
```javascript
// Check if we should start recording on a beat boundary
if (metronome.isOnBeat()) {
    startRecording();
}

// Sync visual effects to beats
const timeUntilNext = metronome.getTimeUntilNextBeat();
scheduleVisualEffect(timeUntilNext);
```

## Migration Notes

The refactor maintains backward compatibility for the basic start/stop functionality and UI integration. The main changes are:

1. Tempo changes now use `setTempo(bpm)` instead of directly setting `metronome.tempo`
2. The internal timing logic is completely rewritten but the external interface remains the same
3. New utility methods are available for advanced timing integration

## Implementation Details

The scheduler now uses integer division to determine how many beats should be scheduled:
1. Calculate elapsed time from reference
2. Determine target beats to schedule based on look-ahead time
3. Schedule any unscheduled beats up to the target
4. Use absolute beat times for precise scheduling

This approach ensures that:
- Beats are always scheduled at exact intervals
- No timing drift occurs over time
- Tempo changes are handled smoothly
- External components can reliably sync to the timeline

## Files Modified

- `src/metronome.js` - Complete refactor of the Metronome class
- `src/metronome-example.js` - Example usage and integration patterns

The refactored metronome is now much more robust and provides a solid foundation for building synchronized features in your synth project.
