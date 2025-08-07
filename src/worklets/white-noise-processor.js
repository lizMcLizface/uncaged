class WhiteNoiseProcessor extends AudioWorkletProcessor {
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
                // White noise: random values between -1 and 1
                outputChannel[i] = (Math.random() * 2 - 1);
            }
        }
        
        return true;
    }
}

registerProcessor('white-noise-processor', WhiteNoiseProcessor);
