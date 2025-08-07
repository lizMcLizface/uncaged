class OscNoiseMixer {
    constructor(AC) {
        this.AC = AC;
        
        // Create gain nodes for mixing
        this.oscGain = new GainNode(AC, { gain: 1 });
        this.noiseGain = new GainNode(AC, { gain: 0 });
        this.outputGain = new GainNode(AC, { gain: 1 });
        
        // Connect mixer
        this.oscGain.connect(this.outputGain);
        this.noiseGain.connect(this.outputGain);
    }
    
    // Connect oscillator to mixer
    connectOscillator(oscNode) {
        console.log('Mixer: connecting oscillator');
        oscNode.connect(this.oscGain);
    }
    
    // Connect noise generator to mixer
    connectNoise(noiseNode) {
        try {
            console.log('Mixer: connecting noise generator');
            if (!noiseNode) {
                console.warn('OscNoiseMixer: Attempted to connect null noise node');
                return;
            }
            noiseNode.connect(this.noiseGain);
        } catch (error) {
            console.error('OscNoiseMixer: Failed to connect noise node:', error);
        }
    }
    
    // Set the mix ratio (0 = all oscillator, 1 = all noise)
    setMixRatio(ratio) {
        // Prevent multiple rapid changes and invalid values
        if (typeof ratio !== 'number' || !isFinite(ratio)) {
            console.warn('Invalid mix ratio:', ratio);
            return;
        }
        
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        
        // Use equal power crossfade for smoother mixing
        const oscGain = Math.cos(clampedRatio * Math.PI / 2);
        const noiseGain = Math.sin(clampedRatio * Math.PI / 2);
        
        // Validate calculated gains
        if (!isFinite(oscGain) || !isFinite(noiseGain)) {
            console.warn('Invalid calculated gains:', { oscGain, noiseGain, ratio: clampedRatio });
            return;
        }
        
        try {
            // Use a small ramp time to prevent clicks
            const rampTime = 0.005; // 5ms
            const currentTime = this.AC.currentTime;
            
            this.oscGain.gain.setTargetAtTime(oscGain, currentTime, rampTime);
            this.noiseGain.gain.setTargetAtTime(noiseGain, currentTime, rampTime);
        } catch (error) {
            console.warn('Error setting mix ratio:', error, { ratio, oscGain, noiseGain });
        }
    }
    
    // Set overall output level
    setOutputGain(gain) {
        try {
            this.outputGain.gain.setValueAtTime(gain, this.AC.currentTime);
        } catch (error) {
            console.warn('Error setting output gain:', error);
        }
    }
    
    connect(destination) {
        try {
            this.outputGain.connect(destination);
        } catch (error) {
            console.warn('Error connecting mixer output:', error);
        }
    }
    
    disconnect() {
        try {
            this.outputGain.disconnect();
        } catch (error) {
            console.warn('Error disconnecting mixer output:', error);
        }
    }
    
    getNode() {
        return this.outputGain;
    }
}

export default OscNoiseMixer;
