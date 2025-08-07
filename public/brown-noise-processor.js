class BrownNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.lastOut = 0;
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        
        if (!output || output.length === 0) {
            return true;
        }
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            
            if (!outputChannel) {
                continue;
            }
            
            for (let i = 0; i < outputChannel.length; i++) {
                // Brown noise (Brownian noise/red noise) using random walk
                const white = (Math.random() * 2 - 1) * 0.1;
                this.lastOut = (this.lastOut + white) * 0.996; // Slight leak to prevent DC buildup
                
                // Clamp to prevent runaway values and NaN/Infinity
                if (!isFinite(this.lastOut)) {
                    this.lastOut = 0;
                }
                this.lastOut = Math.max(-1, Math.min(1, this.lastOut));
                
                outputChannel[i] = this.lastOut * 3.5; // Scale up since brown noise is quieter
            }
        }
        
        return true;
    }
}

registerProcessor('brown-noise-processor', BrownNoiseProcessor);
