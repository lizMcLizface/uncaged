/**
 * Duty Cycle Square Wave Generator using WaveShaper
 * 
 * This demonstrates how to create square waves with arbitrary duty cycles
 * using the Web Audio API's WaveShaperNode instead of the built-in square wave.
 * 
 * The key insight is that we use a triangle wave as the source and apply
 * a step function transfer curve that creates the duty cycle effect.
 * 
 * IMPORTANT: This implementation uses a stable output buffer to prevent
 * connection issues when switching between waveform types.
 */

// Example usage function - improved version with stable output
function createDutyCycleSquareWave(audioContext, dutyCycle = 0.5) {
    // Create the basic oscillator with triangle wave
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'triangle'; // Triangle wave as source
    
    // Create the waveshaper
    const waveShaper = audioContext.createWaveShaperNode();
    
    // Create a stable output buffer (GainNode) that never changes
    const outputBuffer = audioContext.createGain();
    outputBuffer.gain.value = 1.0; // Unity gain, just acts as a buffer
    
    // Create the transfer function that shapes the wave
    const curveLength = 2048;
    const curve = new Float32Array(curveLength);
    
    // The magic happens here - create a step function at the duty cycle point
    for (let i = 0; i < curveLength; i++) {
        const x = i / (curveLength - 1);  // Normalize to 0-1 range
        curve[i] = x < dutyCycle ? 1.0 : -1.0; // Step function
    }
    
    waveShaper.curve = curve;
    
    // Connect the nodes: oscillator -> waveshaper -> output buffer
    oscillator.connect(waveShaper);
    waveShaper.connect(outputBuffer);
    
    return {
        oscillator,
        waveShaper,
        outputBuffer, // This is the stable output that external connections use
        output: outputBuffer, // Alias for clarity
        setDutyCycle: (newDutyCycle) => {
            const newCurve = new Float32Array(curveLength);
            for (let i = 0; i < curveLength; i++) {
                const x = i / (curveLength - 1);
                newCurve[i] = x < newDutyCycle ? 1.0 : -1.0;
            }
            waveShaper.curve = newCurve;
        }
    };
}

/**
 * How it works:
 * 
 * 1. Triangle Wave Input: We start with a triangle wave that goes from -1 to +1
 * 2. Transfer Function: The waveshaper applies a step function:
 *    - When the input is in the first X% of the cycle (duty cycle), output +1
 *    - When the input is in the remaining (100-X)% of the cycle, output -1
 * 3. Result: A square wave where the high portion lasts for X% of the cycle
 * 
 * Examples:
 * - dutyCycle = 0.5 → 50% high, 50% low (normal square wave)
 * - dutyCycle = 0.25 → 25% high, 75% low (narrow pulse)
 * - dutyCycle = 0.75 → 75% high, 25% low (wide pulse)
 * 
 * This technique is superior to using the built-in square wave because:
 * - Built-in square wave is always 50% duty cycle
 * - This allows any duty cycle from 1% to 99%
 * - Great for creating different timbres and rhythmic effects
 * - Essential for analog-style synthesis
 */

export default createDutyCycleSquareWave;
