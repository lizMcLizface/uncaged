# Logarithmic Scaling Examples for Knob Component

The Knob component now supports three different scaling types:

## 1. Linear Scaling (Default)
```jsx
<Knob
    label="Volume"
    value={volume}
    modifier={1}
    offset={0}
    scalingType="linear" // Default
    onUpdate={(val) => setVolume(val)}
/>
```

## 2. Logarithmic Scaling (for Frequency Parameters)
Perfect for filter cutoff frequencies, oscillator frequencies, etc.

```jsx
// Example: Filter Cutoff with logarithmic scaling
<Knob
    label="Cutoff"
    value={filterFreq}
    scalingType="logarithmic"
    minValue={20}        // 20 Hz minimum
    maxValue={20000}     // 20 kHz maximum
    resetValue={1000}    // Reset to 1 kHz
    isRounded
    onUpdate={(val) => setFilterFreq(val)}
/>

// Example: Oscillator frequency
<Knob
    label="Frequency"
    value={oscFreq}
    scalingType="logarithmic"
    minValue={40}        // 40 Hz minimum
    maxValue={4000}      // 4 kHz maximum
    resetValue={440}     // Reset to A4
    decimalPlaces={1}
    onUpdate={(val) => setOscFreq(val)}
/>
```

## 3. Symmetric Logarithmic Scaling (for Detune/Pitch Parameters)
Perfect for detune, pitch bend, and other parameters that need symmetric behavior around zero.

```jsx
// Example: Detune parameter
<Knob
    label="Detune"
    value={detune}
    scalingType="symmetric-log"
    maxValue={1200}      // ±1200 cents (1 octave)
    offset={0}           // Center point
    resetValue={0}       // Reset to center
    decimalPlaces={0}
    onUpdate={(val) => setDetune(val)}
/>

// Example: Vibrato depth with symmetric scaling
<Knob
    label="Vibrato Depth"
    value={vibratoDepth}
    scalingType="symmetric-log"
    maxValue={100}       // ±100 cents
    offset={0}
    resetValue={0}
    onUpdate={(val) => setVibratoDepth(val)}
/>
```

## Migration Guide

### Converting existing linear frequency knobs:
```jsx
// Before (linear scaling):
<Knob
    label="Cutoff"
    value={filterFreq}
    modifier={11000}
    resetValue={11000}
    isRounded
    onUpdate={(val) => setFilterFreq(val)}
/>

// After (logarithmic scaling):
<Knob
    label="Cutoff"
    value={filterFreq}
    scalingType="logarithmic"
    minValue={20}
    maxValue={11020}  // Was modifier + offset (11000 + 0)
    resetValue={11000}
    isRounded
    onUpdate={(val) => setFilterFreq(val)}
/>
```

### Converting detune parameters:
```jsx
// Before (linear detune):
<Knob
    label="Depth"
    value={vibratoDepth}
    modifier={200}
    onUpdate={(val) => setVibratoDepth(val)}
/>

// After (symmetric logarithmic):
<Knob
    label="Depth" 
    value={vibratoDepth}
    scalingType="symmetric-log"
    maxValue={200}    // Was modifier
    offset={0}        // Center at 0
    resetValue={0}
    onUpdate={(val) => setVibratoDepth(val)}
/>
```

## Key Benefits

1. **Frequency Parameters**: Logarithmic scaling provides more intuitive control over frequencies, with more precision in lower frequencies and appropriate coarse control in higher frequencies.

2. **Detune Parameters**: Symmetric logarithmic scaling gives fine control around the center (0) with increasingly coarse control as you move away from center, which matches how pitch perception works.

3. **Backward Compatibility**: All existing knobs continue to work exactly as before since `scalingType="linear"` is the default.
