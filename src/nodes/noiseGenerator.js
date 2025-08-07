class NoiseGenerator {
    constructor(AC) {
        this.AC = AC;
        this.workletNode = null;
        this.gainNode = new GainNode(AC, { gain: 1 }); // Start with gain 1, mixer will control it
        this.isInitialized = false;
        this.currentNoiseType = 'white';
        this.usingFallback = false;
        this.silentGain = null; // Track silent connection for cleanup
        this.isChangingType = false; // Prevent race conditions
        this.lastTypeChange = 0; // Timestamp to prevent rapid changes
        
        // Start with fallback immediately, then upgrade to worklet if available
        this.initializeFallback();
        this.initializeWorklets();
    }
    
    async initializeWorklets() {
        try {
            // Load all noise processor worklets
            await this.AC.audioWorklet.addModule('/white-noise-processor.js');
            await this.AC.audioWorklet.addModule('/pink-noise-processor.js');
            await this.AC.audioWorklet.addModule('/brown-noise-processor.js');
            
            // Upgrade to worklet-based noise
            this.upgradeToWorklet();
        } catch (error) {
            console.error('Failed to initialize noise worklets, using fallback:', error);
            // Keep using fallback
        }
    }
    
    upgradeToWorklet() {
        // Prevent multiple simultaneous upgrades
        if (this.isChangingType) {
            return;
        }
        this.isChangingType = true;
        
        try {
            // Clean up fallback if it exists
            this.cleanupCurrentNode();
            
            // Create new worklet based on current type
            switch (this.currentNoiseType) {
                case 'white':
                    this.workletNode = new AudioWorkletNode(this.AC, 'white-noise-processor');
                    break;
                case 'pink':
                    this.workletNode = new AudioWorkletNode(this.AC, 'pink-noise-processor');
                    break;
                case 'brown':
                    this.workletNode = new AudioWorkletNode(this.AC, 'brown-noise-processor');
                    break;
                default:
                    this.workletNode = new AudioWorkletNode(this.AC, 'white-noise-processor');
            }
            
            this.workletNode.connect(this.gainNode);
            this.usingFallback = false;
            this.isInitialized = true;
            console.log('Upgraded to AudioWorklet noise generation');
        } catch (error) {
            console.error('Failed to create worklet, keeping fallback:', error);
            // Ensure fallback is properly initialized if worklet fails
            if (!this.usingFallback) {
                this.initializeFallback();
            }
        } finally {
            this.isChangingType = false;
        }
    }
    
    initializeFallback() {
        // Don't initialize fallback if we're already using it
        if (this.usingFallback) {
            return;
        }
        
        console.log('Initializing noise fallback');
        // Clean up any existing node first
        this.cleanupCurrentNode();
        
        // Fallback using ScriptProcessorNode for older browsers
        const bufferSize = 4096;
        this.workletNode = this.AC.createScriptProcessor(bufferSize, 0, 1);
        
        this.workletNode.onaudioprocess = (event) => {
            const outputBuffer = event.outputBuffer;
            const outputData = outputBuffer.getChannelData(0);
            
            for (let i = 0; i < outputBuffer.length; i++) {
                switch (this.currentNoiseType) {
                    case 'white':
                        outputData[i] = (Math.random() * 2 - 1);
                        break;
                    case 'pink':
                        // Simplified pink noise for fallback
                        outputData[i] = (Math.random() * 2 - 1) * 0.5;
                        break;
                    case 'brown':
                        // Simplified brown noise for fallback
                        outputData[i] = (Math.random() * 2 - 1) * 0.3;
                        break;
                    default:
                        outputData[i] = 0;
                }
            }
        };
        
        this.workletNode.connect(this.gainNode);
        
        // ScriptProcessorNode needs to be connected to destination to actually process
        // Create a silent connection to ensure processing happens
        this.silentGain = this.AC.createGain();
        this.silentGain.gain.value = 0;
        this.workletNode.connect(this.silentGain);
        this.silentGain.connect(this.AC.destination);
        
        this.usingFallback = true;
        this.isInitialized = true;
        console.log('Noise fallback initialized and connected');
    }
    
    cleanupCurrentNode() {
        if (this.workletNode) {
            try {
                this.workletNode.disconnect();
                // Clean up ScriptProcessorNode event handler to prevent memory leaks
                if (this.usingFallback && this.workletNode.onaudioprocess) {
                    this.workletNode.onaudioprocess = null;
                }
            } catch (error) {
                console.warn('Error disconnecting noise node:', error);
            }
            this.workletNode = null;
        }
        
        // Clean up silent connection for fallback
        if (this.silentGain) {
            try {
                this.silentGain.disconnect();
            } catch (error) {
                console.warn('Error disconnecting silent gain:', error);
            }
            this.silentGain = null;
        }
    }
    
    setNoiseType(type) {
        // Prevent race conditions and unnecessary changes
        if (this.isChangingType) {
            console.log('NoiseGenerator: Type change already in progress, ignoring');
            return;
        }
        
        // Throttle rapid changes (minimum 50ms between changes)
        const now = Date.now();
        if (now - this.lastTypeChange < 50) {
            console.log('NoiseGenerator: Type change too rapid, ignoring');
            return;
        }
        this.lastTypeChange = now;
        
        // Don't recreate node if type hasn't changed
        if (this.currentNoiseType === type && this.isInitialized) {
            console.log('NoiseGenerator: Type unchanged, skipping recreation');
            return;
        }
        
        const oldType = this.currentNoiseType;
        this.currentNoiseType = type;
        
        if (!this.isInitialized) {
            return;
        }
        
        console.log(`NoiseGenerator: Changing type from ${oldType} to ${type}`);
        this.isChangingType = true;
        
        // Add small delay to prevent rapid changes
        setTimeout(() => {
            this.performTypeChange(type);
        }, 10);
    }
    
    performTypeChange(type) {
        try {
            // Clean up current node
            this.cleanupCurrentNode();
            
            // Try to create new worklet based on type
            switch (type) {
                case 'white':
                    this.workletNode = new AudioWorkletNode(this.AC, 'white-noise-processor');
                    break;
                case 'pink':
                    this.workletNode = new AudioWorkletNode(this.AC, 'pink-noise-processor');
                    break;
                case 'brown':
                    this.workletNode = new AudioWorkletNode(this.AC, 'brown-noise-processor');
                    break;
                default:
                    this.workletNode = new AudioWorkletNode(this.AC, 'white-noise-processor');
            }
            
            this.workletNode.connect(this.gainNode);
            this.usingFallback = false;
            console.log(`NoiseGenerator: Successfully created ${type} worklet`);
        } catch (error) {
            // Fall back to ScriptProcessorNode if worklet fails
            console.log('Worklet failed, using fallback for noise type:', type, error);
            this.initializeFallback();
        } finally {
            this.isChangingType = false;
        }
    }
    
    setGain(gain) {
        try {
            this.gainNode.gain.setValueAtTime(gain, this.AC.currentTime);
        } catch (error) {
            console.warn('Error setting noise gain:', error);
        }
    }
    
    connect(destination) {
        this.gainNode.connect(destination);
    }
    
    disconnect() {
        this.gainNode.disconnect();
    }
    
    // Cleanup method to properly dispose of resources
    destroy() {
        this.cleanupCurrentNode();
        try {
            this.gainNode.disconnect();
        } catch (error) {
            console.warn('Error disconnecting gain node:', error);
        }
        this.isInitialized = false;
    }
    
    getNode() {
        return this.gainNode;
    }
}

export default NoiseGenerator;
