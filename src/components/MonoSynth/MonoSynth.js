import { Oscillator, Gain, Filter, NoiseGenerator, OscNoiseMixer, StereoPanner } from '../../nodes';
import { clamp, minTime } from '../../util/util';

// Monophonic Synth Class with Voice Spreading Support
class MonoSynth {
    constructor(AC) {
        this.AC = AC;

        // Voice spreading parameters
        this.voiceCount = 8;
        this.maxVoices = 8; // Maximum number of voices to pre-create
        this.detuneSpread = 0;
        this.stereoSpread = 0;
        
        // Sub oscillator parameters - single always-connected sub oscillator
        this.subOscOctaveOffset = 0; // Range: -3 to +3 octaves
        this.subOscillator = new Oscillator(this.AC);
        this.subOscillatorPanner = new StereoPanner(this.AC);
        this.subOscillatorGain = new Gain(this.AC); // Gain control for sub oscillator
        this.subOscillatorGain.setGain(0); // Initialize to 0 to prevent sound on startup
        
        // Second oscillator for monosynth  
        this.osc2 = new Oscillator(this.AC);
        this.osc2PhaseDelay = this.AC.createDelay(0.1); // Small delay for phase offset
        this.osc2Gain = new Gain(this.AC);
        this.osc2Gain.setGain(0); // Initialize to 0 to prevent sound on startup
        this.osc2Detune = 0; // Detune in cents
        this.osc2Amount = 0; // Mix amount (0-1)
        this.osc2PhaseOffset = 0; // Phase offset in degrees (0-360)
        this.osc2OctaveOffset = 0; // Range: -3 to +3 octaves
        this.osc2Started = false; // Track if osc2 has been started
        
        // Primary voice oscillator (always active)
        this.primaryOscillator = new Oscillator(this.AC);
        this.primaryOscillatorPanner = new StereoPanner(this.AC);
        
        // Additional voices for voice spreading
        this.additionalOscillators = [];
        this.additionalOscillatorPanners = [];
        this.oscillatorMixer = new Gain(this.AC); // Mix all oscillators
        
        // Main oscillator mixer (combines main oscs, sub oscs, and osc2)
        this.mainOscillatorMixer = new Gain(this.AC);
        
        // Pre-create maximum number of additional oscillators for perfect phase alignment
        this.preCreateAdditionalOscillators(this.maxVoices - 1); // -1 because primary is separate
        // this.connectVibratoToAll(this.vibratoLFO);
        
        // Initialize with one voice active (just the primary)
        this.setActiveVoiceCount(1);
        
        this.noiseGen = new NoiseGenerator(this.AC);
        this.noiseFilter = new Filter(this.AC); // Bandpass filter for noise
        this.noiseFilterBypassGain = new Gain(this.AC); // For true bypass
        this.noiseFilterGain = new Gain(this.AC); // For filtered path
        this.noiseMixerOutput = new Gain(this.AC); // Combines filtered and bypass paths
        this.mixer = new OscNoiseMixer(this.AC);
        this.gain = new Gain(this.AC); // AHDSR Gain
        this.volume = new Gain(this.AC); // Volume
        this.filter = new Filter(this.AC);

        this.currentNote = null;
        this.currentNoteInfo = null; // Store full note info for microtonal updates
        this.timeoutIds = [];
        this.isInHoldPhase = false;
        this.holdPhaseEndTime = null;
        this.currentHoldLevel = 1; // Store hold level for use in noteOff
        this.voiceId = null; // Unique identifier for the current voice session
        this.voiceIdCounter = 0; // Counter for generating unique voice IDs
        
        // Noise filter settings
        this.noiseFilterEnabled = false;
        this.noiseFilterQ = 1;
        
        // Track initialization state
        this.isInitialized = false;
        
        // Auto-resync mechanism
        this.autoResyncEnabled = true; // Enable/disable auto-resync
        this.autoResyncDelay = 5000; // 5 seconds of inactivity before auto-resync
        this.lastActivityTime = Date.now(); // Track last note activity
        this.autoResyncTimer = null; // Timer for auto-resync
        this.isAutoResyncing = false; // Prevent multiple simultaneous auto-resyncs
    }

    preCreateAdditionalOscillators(maxAdditionalVoices) {
        // Pre-create all additional oscillators and panners but don't connect them yet
        this.additionalOscillators = [];
        this.additionalOscillatorPanners = [];
        
        for (let i = 0; i < maxAdditionalVoices; i++) {
            const osc = new Oscillator(this.AC);
            const panner = new StereoPanner(this.AC);
            
            this.additionalOscillators.push(osc);
            this.additionalOscillatorPanners.push(panner);
            
            // Connect oscillator to panner, but don't connect panner to mixer yet
            osc.connect(panner.getNode());
        }
    }

    setActiveVoiceCount(count) {
        const clampedCount = Math.max(1, Math.min(this.maxVoices, Math.round(count)));
        
        // Disconnect all additional oscillator panners first
        this.additionalOscillatorPanners.forEach(panner => {
            try {
                panner.disconnect();
            } catch (e) {
                // Already disconnected, ignore
            }
        });
        
        // Connect only the required additional voices (count - 1 because primary is always connected)
        const additionalVoicesNeeded = clampedCount - 1;
        for (let i = 0; i < additionalVoicesNeeded; i++) {
            try {
                this.additionalOscillatorPanners[i].connect(this.oscillatorMixer.getNode());
            } catch (e) {
                console.warn('Failed to connect additional voice', i, ':', e);
            }
        }
        
        // Adjust mixer gain based on voice count to prevent clipping
        const gainReduction = clampedCount === 1 ? 1.0 : 1.0 / (1 + (clampedCount - 1) * 0.2);
        this.oscillatorMixer.setGain(gainReduction);
        
        this.voiceCount = clampedCount;
        
        // Update sub oscillator mix
        this.updateSubOscillatorMix();
        
        // Force immediate update of detuning and stereo spread
        this.updateVoiceDetuning();
        this.updateStereoSpread();
        
        // Reconnect vibrato if it was previously connected
        if (this.vibratoLFO) {
            this.connectVibratoToAdditional(this.vibratoLFO);
        }
    }

    updateVoiceDetuning(scheduleTime = null, rampTime = 0.001) {
        // Use provided schedule time or create one for standalone calls
        const actualScheduleTime = scheduleTime !== null ? scheduleTime : (this.AC.currentTime + 0.001);
        
        if (this.voiceCount <= 1) {
            // Single oscillator (primary only), ensure it's not detuned
            if (this.currentNoteInfo) {
                // If a note is playing, set to base frequency with no detune
                this.setOscillatorFrequency(this.primaryOscillator, 0, rampTime, actualScheduleTime);
            } else {
                // If no note is playing, reset to a standard frequency to clear any detune
                // Use smooth ramp to prevent clicks
                try {
                    this.primaryOscillator.setFreq(440, Math.max(rampTime, 0.002), actualScheduleTime); // Minimum 2ms ramp for reset
                } catch (e) {
                    console.warn('Failed to reset primary oscillator frequency:', e);
                }
            }
            return;
        }

        // Calculate detune values for multiple oscillators
        const centerIndex = (this.voiceCount - 1) / 2;
        
        // Primary oscillator (index 0)
        if (this.currentNoteInfo) {
            let detuneOffset = 0;
            if (this.voiceCount > 1 && this.detuneSpread > 0) {
                if (this.voiceCount === 2) {
                    // Special case for 2 oscillators: -spread/2 and +spread/2
                    detuneOffset = (0 - 0.5) * this.detuneSpread;
                } else {
                    // For 3+ oscillators: spread evenly across the range
                    detuneOffset = (0 - centerIndex) * (this.detuneSpread / centerIndex);
                }
            }
            
            // Clamp detune to reasonable range to prevent frequency issues
            detuneOffset = Math.max(-1200, Math.min(1200, detuneOffset)); // ±1 octave max
            
            this.setOscillatorFrequency(this.primaryOscillator, detuneOffset, rampTime, actualScheduleTime);
        }
        
        // Additional oscillators (indices 1 to voiceCount-1)
        const additionalVoicesNeeded = this.voiceCount - 1;
        for (let i = 0; i < additionalVoicesNeeded; i++) {
            if (!this.currentNoteInfo) return;
            
            const osc = this.additionalOscillators[i];
            const actualIndex = i + 1; // Since primary is index 0
            
            // Calculate detune offset from center
            let detuneOffset = 0;
            if (this.voiceCount > 1 && this.detuneSpread > 0) {
                if (this.voiceCount === 2) {
                    // Special case for 2 oscillators: -spread/2 and +spread/2
                    detuneOffset = (actualIndex - 0.5) * this.detuneSpread;
                } else {
                    // For 3+ oscillators: spread evenly across the range
                    detuneOffset = (actualIndex - centerIndex) * (this.detuneSpread / centerIndex);
                }
            }
            
            // Clamp detune to reasonable range to prevent frequency issues
            detuneOffset = Math.max(-1200, Math.min(1200, detuneOffset)); // ±1 octave max
            
            this.setOscillatorFrequency(osc, detuneOffset, rampTime, actualScheduleTime);
        }
    }

    updateStereoSpread() {
        if (this.voiceCount <= 1) {
            // Single oscillator (primary only), ensure it's centered
            try {
                this.primaryOscillatorPanner.setPan(0); // Force center position
            } catch (e) {
                console.warn('Failed to center primary oscillator pan:', e);
            }
            return;
        }

        // Distribute oscillators across the stereo field
        // Primary oscillator (index 0)
        let panPosition = 0;
        if (this.voiceCount === 2) {
            panPosition = (0 - 0.5) * 2; // -1
        } else {
            panPosition = (0 / (this.voiceCount - 1) - 0.5) * 2;
        }
        
        let scaledPan = panPosition * (this.stereoSpread / 100);
        let clampedPan = Math.max(-1, Math.min(1, scaledPan));
        
        try {
            this.primaryOscillatorPanner.setPan(clampedPan);
        } catch (e) {
            console.warn('Failed to set primary oscillator pan position:', e);
        }
        
        // Additional oscillators (indices 1 to voiceCount-1)
        const additionalVoicesNeeded = this.voiceCount - 1;
        for (let i = 0; i < additionalVoicesNeeded; i++) {
            const panner = this.additionalOscillatorPanners[i];
            const actualIndex = i + 1; // Since primary is index 0
            
            if (this.voiceCount === 2) {
                panPosition = (actualIndex - 0.5) * 2; // +1
            } else {
                panPosition = (actualIndex / (this.voiceCount - 1) - 0.5) * 2;
            }
            
            scaledPan = panPosition * (this.stereoSpread / 100);
            clampedPan = Math.max(-1, Math.min(1, scaledPan));
            
            try {
                panner.setPan(clampedPan);
            } catch (e) {
                console.warn('Failed to set additional oscillator pan position:', e);
            }
        }
    }

    setOscillatorFrequency(oscillator, detuneInCents, rampTime = 0.002, scheduleTime = null) {
        if (!this.currentNoteInfo || !oscillator) return;
        
        const { baseFreq_ } = this.currentNoteInfo;
        
        // Validate base frequency
        if (!baseFreq_ || baseFreq_ <= 0 || !isFinite(baseFreq_)) {
            console.warn('Invalid base frequency:', baseFreq_);
            return;
        }
        
        // Validate detune amount
        if (!isFinite(detuneInCents)) {
            console.warn('Invalid detune amount:', detuneInCents);
            return;
        }
        
        // Use provided schedule time or create one for UI changes
        const actualScheduleTime = scheduleTime !== null ? scheduleTime : (this.AC.currentTime + 0.001);
        
        const detuneRatio = Math.pow(2, detuneInCents / 1200); // Convert cents to frequency ratio
        const detunedFreq = baseFreq_ * detuneRatio;
        
        // Validate final frequency
        if (!isFinite(detunedFreq) || detunedFreq <= 0 || detunedFreq > 20000) {
            console.warn('Invalid detuned frequency:', detunedFreq, 'base:', baseFreq_, 'detune:', detuneInCents);
            return;
        }
        
        try {
            // Use small ramp time to prevent clicks/cracks
            oscillator.setFreq(detunedFreq, rampTime, actualScheduleTime);
        } catch (e) {
            console.warn('Failed to set oscillator frequency:', e);
        }
    }

    init(startTime = null) {
        console.log('MonoSynth init - connecting audio nodes');
        
        // Use provided start time or create one for synchronized oscillator startup
        const actualStartTime = startTime || (this.AC.currentTime + 0.001);
        
        // Set up noise filter as bandpass
        this.noiseFilter.setType('bandpass');
        this.noiseFilter.setFreq(440); // Default frequency
        this.noiseFilter.setQ(this.noiseFilterQ);
        
        // Proper routing: NoiseGen -> [Split to Filter AND Bypass paths] -> NoiseMixerOutput -> Mixer
        // Connect noise to both filter and bypass paths (they're controlled by gain nodes)
        this.noiseGen.connect(this.noiseFilter.getNode()); // Goes to filter path
        this.noiseFilter.connect(this.noiseFilterGain.getNode());
        this.noiseFilterGain.connect(this.noiseMixerOutput.getNode());
        
        // Also connect noise directly to bypass path
        this.noiseGen.connect(this.noiseFilterBypassGain.getNode()); // Direct bypass path
        this.noiseFilterBypassGain.connect(this.noiseMixerOutput.getNode());
        
        // Connect main oscillators and sub oscillator to main oscillator mixer
        this.primaryOscillator.connect(this.primaryOscillatorPanner.getNode());
        this.primaryOscillatorPanner.connect(this.mainOscillatorMixer.getNode());
        
        this.oscillatorMixer.connect(this.mainOscillatorMixer.getNode());
        
        // Connect sub oscillator (always connected but controlled by gain)
        this.subOscillator.connect(this.subOscillatorGain.getNode());
        // this.subOscillatorPanner.connect(this.subOscillatorGain.getNode());
        this.subOscillatorGain.connect(this.mainOscillatorMixer.getNode());
        
        // Connect second oscillator through delay node (always enabled for phase control)
        this.osc2.connect(this.osc2PhaseDelay);
        this.osc2PhaseDelay.connect(this.osc2Gain.getNode());
        this.osc2Gain.connect(this.mainOscillatorMixer.getNode());
        
        // Connect main oscillator mixer and combined noise to main mixer
        this.mixer.connectOscillator(this.mainOscillatorMixer.getNode());
        this.mixer.connectNoise(this.noiseMixerOutput.getNode());
        
        console.log('Connected oscillator mixers and noise paths to mixer');
        
        // Set all oscillators to the same base frequency BEFORE starting them
        // This ensures consistent phase alignment regardless of when frequencies are later changed
        const baseFreq = 440; // A4 as reference frequency
        
        // Set frequency for all oscillators
        this.primaryOscillator.setFreq(baseFreq, 0, actualStartTime);
        
        this.additionalOscillators.forEach(osc => {
            try {
                osc.setFreq(baseFreq, 0, actualStartTime);
            } catch (e) {
                console.warn('Failed to set additional oscillator base frequency:', e);
            }
        });
        
        // Set frequency for sub oscillator
        try {
            this.subOscillator.setFreq(baseFreq, 0, actualStartTime);
        } catch (e) {
            console.warn('Failed to set sub oscillator base frequency:', e);
        }
        
        // Set frequency for second oscillator
        try {
            this.osc2.setFreq(baseFreq, 0, actualStartTime);
        } catch (e) {
            console.warn('Failed to set second oscillator base frequency:', e);
        }
        
        // Set default waveforms for all oscillators to ensure consistent initialization
        this.primaryOscillator.setType('sine'); // Default to sine wave
        
        this.additionalOscillators.forEach(osc => {
            try {
                osc.setType('sine'); // Default to sine wave
            } catch (e) {
                console.warn('Failed to set additional oscillator default waveform:', e);
            }
        });
        
        try {
            this.subOscillator.setType('sine'); // Default to sine wave
        } catch (e) {
            console.warn('Failed to set sub oscillator default waveform:', e);
        }
        
        try {
            this.osc2.setType('sine'); // Default to sine wave
        } catch (e) {
            console.warn('Failed to set second oscillator default waveform:', e);
        }
        
        // Start ALL oscillators with synchronized timing for perfect phase alignment
        this.primaryOscillator.start(actualStartTime);
        
        this.additionalOscillators.forEach((osc, index) => {
            try {
                osc.start(actualStartTime);
            } catch (e) {
                console.warn('Additional oscillator', index, 'already started:', e);
            }
        });
        
        // Start sub oscillator with synchronized timing
        try {
            this.subOscillator.start(actualStartTime);
        } catch (e) {
            console.warn('Sub oscillator already started:', e);
        }
        
        // Start second oscillator with synchronized timing
        try {
            this.osc2.start(actualStartTime);
            this.osc2Started = true; // Mark as started to prevent re-starting
        } catch (e) {
            console.warn('Second oscillator already started:', e);
        }
        
        // Connect mixer to gain and filter chain
        this.mixer.connect(this.gain.getNode());
        this.gain.connect(this.filter.getNode());
        this.filter.connect(this.volume.getNode());

        this.volume.setGain(0.2);
        this.gain.setGain(0);
        
        // Initialize filter state
        this.updateNoiseFilterBypass();
        
        // Mark as initialized
        this.isInitialized = true;
        
        // Start auto-resync timer
        this.updateActivityTime();
        
        console.log('MonoSynth audio chain connected');
    }

    // Voice spreading methods
    setVoiceCount(count) {
        const clampedCount = Math.max(1, Math.min(this.maxVoices, Math.round(count))); // Limit to 1-maxVoices
        if (clampedCount !== this.voiceCount) {
            this.setActiveVoiceCount(clampedCount);
        }
    }

    setDetuneSpread(spreadInCents) {
        this.detuneSpread = Math.max(0, Math.min(100, spreadInCents)); // Limit to 0-100 cents
        // Use very short ramp when updating detuning to prevent clicks
        this.updateVoiceDetuning();
    }

    setStereoSpread(spreadPercent) {
        this.stereoSpread = Math.max(0, Math.min(100, spreadPercent)); // Limit to 0-100%
        this.updateStereoSpread();
        this.updateSubOscillatorStereoSpread();
    }

    // Method to reset all active oscillators to clean state
    resetOscillatorStates() {
        // Capture scheduling time once for all oscillators to ensure phase alignment
        const scheduleTime = this.AC.currentTime + 0.001; // 1ms offset for stable scheduling
        
        // Reset primary oscillator
        try {
            this.primaryOscillator.setFreq(440, 0.005, scheduleTime); // 5ms ramp
        } catch (e) {
            console.warn('Failed to reset primary oscillator state:', e);
        }
        
        // Reset active additional oscillators
        const additionalVoicesNeeded = this.voiceCount - 1;
        for (let i = 0; i < additionalVoicesNeeded; i++) {
            try {
                // Reset to standard frequency with smooth ramp to prevent clicks
                this.additionalOscillators[i].setFreq(440, 0.005, scheduleTime); // 5ms ramp
            } catch (e) {
                console.warn('Failed to reset additional oscillator state:', e);
            }
        }
        
        // Small delay to allow frequency ramp to complete, then update detuning
        setTimeout(() => {
            this.updateVoiceDetuning();
            this.updateStereoSpread();
        }, 10);
    }

    // Connect vibrato LFO to all oscillators
    connectVibratoToAdditional(vibratoLFO) {
        this.vibratoLFO = vibratoLFO; // Store reference for later use
        
        // Connect to primary oscillator
        // try {
        //     const primaryOscNode = this.primaryOscillator.getOscillatorNode();
        //     if (primaryOscNode && primaryOscNode.detune) {
        //         vibratoLFO.connect(primaryOscNode.detune);
        //     }
        // } catch (e) {
        //     console.warn('Failed to connect vibrato to primary oscillator:', e);
        // }
        
        // Connect to additional oscillators
        this.additionalOscillators.forEach((osc, index) => {
            try {
                const oscNode = osc.getOscillatorNode();
                if (oscNode && oscNode.detune) {
                    vibratoLFO.connect(oscNode.detune);
                }
            } catch (e) {
                console.warn('Failed to connect vibrato to additional oscillator', index, ':', e);
            }
        });
        
        // Connect to sub oscillator
        // this.connectVibratoToSubOscillator(vibratoLFO);
        
        // Connect to second oscillator
        // try {
        //     const osc2Node = this.osc2.getOscillatorNode();
        //     if (osc2Node && osc2Node.detune) {
        //         vibratoLFO.connect(osc2Node.detune);
        //     }
        // } catch (e) {
        //     console.warn('Failed to connect vibrato to second oscillator:', e);
        // }
    }
    connectVibratoToAll(vibratoLFO) {
        this.vibratoLFO = vibratoLFO; // Store reference for later use
        
        // Connect to primary oscillator
        try {
            const primaryOscNode = this.primaryOscillator.getOscillatorNode();
            if (primaryOscNode && primaryOscNode.detune) {
                vibratoLFO.connect(primaryOscNode.detune);
            }
        } catch (e) {
            console.warn('Failed to connect vibrato to primary oscillator:', e);
        }
        
        // // Connect to additional oscillators
        // this.additionalOscillators.forEach((osc, index) => {
        //     try {
        //         const oscNode = osc.getOscillatorNode();
        //         if (oscNode && oscNode.detune) {
        //             vibratoLFO.connect(oscNode.detune);
        //         }
        //     } catch (e) {
        //         console.warn('Failed to connect vibrato to additional oscillator', index, ':', e);
        //     }
        // });
        
        // Connect to sub oscillator
        this.connectVibratoToSubOscillator(vibratoLFO);
        
        // Connect to second oscillator
        try {
            const osc2Node = this.osc2.getOscillatorNode();
            if (osc2Node && osc2Node.detune) {
                vibratoLFO.connect(osc2Node.detune);
            }
        } catch (e) {
            console.warn('Failed to connect vibrato to second oscillator:', e);
        }
    }

    connect = (destination) => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => this.volume.connect(dest));
        } else {
            this.volume.connect(destination);
        }
    }

    clearTimeouts() {
        this.timeoutIds.forEach((id) => clearTimeout(id));
        this.timeoutIds = [];
        this.isInHoldPhase = false;
        this.holdPhaseEndTime = null;
    }

    // Getters
    getNode = () => this.oscillatorMixer.getNode(); // Return the oscillator mixer
    getOscillatorNode = () => this.primaryOscillator.getOscillatorNode(); // Return primary oscillator for compatibility
    getWaveform = () => this.primaryOscillator.getType();
    getDutyCycle = () => this.primaryOscillator.getDutyCycle();
    getFilterType = () => this.filter.getType();
    getFilterFreq = () => this.filter.getFreq();
    getFilterQ = () => this.filter.getQ();
    getFilterGain = () => this.filter.getGain();
    getCurrentNoteInfo = () => this.currentNoteInfo;

    // Method to stop, disconnect, and recreate all oscillators with perfect synchronization
    resynchronizeAllOscillators(startTime = null, isAutoResync = false) {
        const logPrefix = isAutoResync ? 'MonoSynth AUTO-RESYNC:' : 'MonoSynth MANUAL RESYNC:';
        console.log(`${logPrefix} disconnecting and recreating all oscillators`);
        
        if (!this.isInitialized) {
            console.warn('MonoSynth not initialized, cannot resynchronize');
            return;
        }
        
        // Prevent multiple simultaneous auto-resyncs
        if (isAutoResync && this.isAutoResyncing) {
            console.log('MonoSynth: Auto-resync already in progress, skipping');
            return;
        }
        
        if (isAutoResync) {
            this.isAutoResyncing = true;
        }
        
        // Use provided start time or create one for synchronized oscillator recreation
        const actualStartTime = startTime || (this.AC.currentTime + 0.1); // 100ms delay for clean recreation
        
        // Store current oscillator settings to restore them
        const primaryType = this.primaryOscillator.getType();
        const primaryDutyCycle = this.primaryOscillator.getDutyCycle();
        const subType = this.subOscillator.getType();
        const subDutyCycle = this.subOscillator.getDutyCycle();
        const osc2Type = this.osc2.getType();
        const osc2DutyCycle = this.osc2.getDutyCycle();
        
        // Store current playing state
        const wasPlaying = !!this.currentNoteInfo;
        const currentNoteInfo = this.currentNoteInfo;
        
        try {
            // 1. Disconnect primary oscillator (don't stop - just disconnect and recreate)
            this.primaryOscillator.disconnect();
            this.primaryOscillatorPanner.disconnect();
            
            // 2. Disconnect additional oscillators
            this.additionalOscillators.forEach((osc, index) => {
                try {
                    osc.disconnect();
                    this.additionalOscillatorPanners[index].disconnect();
                } catch (e) {
                    console.warn('Failed to disconnect additional oscillator', index, ':', e);
                }
            });
            
            // 3. Disconnect sub oscillator
            this.subOscillator.disconnect();
            this.subOscillatorGain.disconnect();
            
            // 4. Disconnect second oscillator
            this.osc2.disconnect();
            this.osc2PhaseDelay.disconnect();
            
        } catch (e) {
            console.warn('Error during oscillator disconnection phase:', e);
        }
        
        // 5. Recreate all oscillators
        try {
            // Recreate primary oscillator
            this.primaryOscillator = new Oscillator(this.AC);
            this.primaryOscillatorPanner = new StereoPanner(this.AC);
            
            // Recreate additional oscillators
            this.additionalOscillators = [];
            this.additionalOscillatorPanners = [];
            for (let i = 0; i < this.maxVoices - 1; i++) {
                const osc = new Oscillator(this.AC);
                const panner = new StereoPanner(this.AC);
                
                this.additionalOscillators.push(osc);
                this.additionalOscillatorPanners.push(panner);
                
                // Connect oscillator to panner
                osc.connect(panner.getNode());
            }
            
            // Recreate sub oscillator
            this.subOscillator = new Oscillator(this.AC);
            
            // Recreate second oscillator and delay
            this.osc2 = new Oscillator(this.AC);
            this.osc2PhaseDelay = this.AC.createDelay(0.1);
            
        } catch (e) {
            console.error('Error during oscillator recreation:', e);
            return;
        }
        
        // 6. Reconnect audio routing with synchronized timing
        try {
            // Set base frequency for all oscillators BEFORE starting them
            const baseFreq = 440; // A4 as reference frequency
            
            // Configure primary oscillator
            this.primaryOscillator.setType(primaryType);
            this.primaryOscillator.setDutyCycle(primaryDutyCycle);
            this.primaryOscillator.setFreq(baseFreq, 0, actualStartTime);
            
            // Configure additional oscillators
            this.additionalOscillators.forEach((osc, index) => {
                try {
                    osc.setType(primaryType); // Same as primary
                    osc.setDutyCycle(primaryDutyCycle);
                    osc.setFreq(baseFreq, 0, actualStartTime);
                } catch (e) {
                    console.warn('Failed to configure additional oscillator', index, ':', e);
                }
            });
            
            // Configure sub oscillator
            this.subOscillator.setType(subType);
            this.subOscillator.setDutyCycle(subDutyCycle);
            this.subOscillator.setFreq(baseFreq, 0, actualStartTime);
            
            // Configure second oscillator
            this.osc2.setType(osc2Type);
            this.osc2.setDutyCycle(osc2DutyCycle);
            this.osc2.setFreq(baseFreq, 0, actualStartTime);
            
            // Reconnect audio routing
            this.primaryOscillator.connect(this.primaryOscillatorPanner.getNode());
            this.primaryOscillatorPanner.connect(this.mainOscillatorMixer.getNode());
            
            this.subOscillator.connect(this.subOscillatorGain.getNode());
            this.subOscillatorGain.connect(this.mainOscillatorMixer.getNode());
            
            this.osc2.connect(this.osc2PhaseDelay);
            this.osc2PhaseDelay.connect(this.osc2Gain.getNode());
            this.osc2Gain.connect(this.mainOscillatorMixer.getNode());
            
        } catch (e) {
            console.error('Error during oscillator configuration:', e);
            return;
        }
        
        // 7. Start ALL oscillators with perfect synchronization
        try {
            this.primaryOscillator.start(actualStartTime);
            
            this.additionalOscillators.forEach((osc, index) => {
                try {
                    osc.start(actualStartTime);
                } catch (e) {
                    console.warn('Failed to start additional oscillator', index, ':', e);
                }
            });
            
            this.subOscillator.start(actualStartTime);
            this.osc2.start(actualStartTime);
            this.osc2Started = true;
            
        } catch (e) {
            console.error('Error during oscillator starting:', e);
            return;
        }
        
        // 8. Restore active voice connections and settings
        setTimeout(() => {
            try {
                // Restore active voice count connections
                this.setActiveVoiceCount(this.voiceCount);
                
                // Reconnect vibrato if it was previously connected
                if (this.vibratoLFO) {
                    this.connectVibratoToAll(this.vibratoLFO);
                }
                
                // If a note was playing, restore its frequency and detuning
                if (wasPlaying && currentNoteInfo) {
                    this.currentNoteInfo = currentNoteInfo;
                    
                    // Apply current frequencies with detuning
                    const scheduleTime = this.AC.currentTime + 0.001;
                    this.updateVoiceDetuning(scheduleTime, 0.001);
                    this.updateSubOscillatorFrequency(scheduleTime, 0.001);
                    this.updateOsc2Frequency(scheduleTime, 0.001);
                    
                    // Update stereo spread
                    this.updateStereoSpread();
                    this.updateSubOscillatorStereoSpread();
                    
                    // Update phase delay
                    this.updateOsc2PhaseDelay();
                }
                
                console.log(`${logPrefix} oscillator resynchronization completed successfully`);
                
                // Reset auto-resync flag
                if (isAutoResync) {
                    this.isAutoResyncing = false;
                }
                
            } catch (e) {
                console.error('Error during post-resync restoration:', e);
                // Reset auto-resync flag even on error
                if (isAutoResync) {
                    this.isAutoResyncing = false;
                }
            }
        }, (actualStartTime - this.AC.currentTime + 0.01) * 1000); // Wait for start time + small buffer
    }

    // Auto-resync management methods
    updateActivityTime() {
        this.lastActivityTime = Date.now();
        this.resetAutoResyncTimer();
    }

    resetAutoResyncTimer() {
        // Clear existing timer
        if (this.autoResyncTimer) {
            clearTimeout(this.autoResyncTimer);
            this.autoResyncTimer = null;
        }

        // Only set new timer if auto-resync is enabled and synth is initialized
        if (this.autoResyncEnabled && this.isInitialized) {
            this.autoResyncTimer = setTimeout(() => {
                // Check if we're still inactive and not currently playing a note
                const timeSinceActivity = Date.now() - this.lastActivityTime;
                
                if (timeSinceActivity >= this.autoResyncDelay && !this.currentNote) {
                    console.log(`MonoSynth: Auto-resync triggered after ${timeSinceActivity}ms of inactivity`);
                    this.resynchronizeAllOscillators(null, true); // true indicates auto-resync
                } else {
                    // If there was recent activity or a note is playing, reset the timer
                    this.resetAutoResyncTimer();
                }
            }, this.autoResyncDelay);
        }
    }

    setAutoResyncEnabled(enabled) {
        this.autoResyncEnabled = enabled;
        if (enabled) {
            this.updateActivityTime(); // Reset timer when enabling
        } else {
            // Clear timer when disabling
            if (this.autoResyncTimer) {
                clearTimeout(this.autoResyncTimer);
                this.autoResyncTimer = null;
            }
        }
        console.log(`MonoSynth auto-resync ${enabled ? 'enabled' : 'disabled'}`);
    }

    setAutoResyncDelay(delayMs) {
        this.autoResyncDelay = Math.max(1000, delayMs); // Minimum 1 second
        console.log(`MonoSynth auto-resync delay set to ${this.autoResyncDelay}ms`);
        
        // Reset timer with new delay if currently active
        if (this.autoResyncEnabled) {
            this.resetAutoResyncTimer();
        }
    }

    // Method to ensure oscillators stay synchronized after internal changes
    ensureOscillatorSynchronization() {
        return;
        if (!this.isInitialized) return;
        
        const scheduleTime = this.AC.currentTime + 0.001;
        const baseFreq = this.currentNoteInfo ? this.currentNoteInfo.baseFreq_ : 440;
        
        // Resync primary oscillator
        try {
            this.primaryOscillator.setFreq(baseFreq, 0.001, scheduleTime);
        } catch (e) {
            console.warn('Failed to resync primary oscillator:', e);
        }
        
        // Resync additional oscillators
        this.additionalOscillators.forEach((osc, index) => {
            try {
                osc.setFreq(baseFreq, 0.001, scheduleTime);
            } catch (e) {
                console.warn('Failed to resync additional oscillator', index, ':', e);
            }
        });
        
        // Resync sub oscillator
        if (this.subOscOctaveOffset !== 0 && this.currentNoteInfo) {
            const octaveMultiplier = Math.pow(2, this.subOscOctaveOffset);
            const subBaseFreq = baseFreq * octaveMultiplier;
            try {
                this.subOscillator.setFreq(subBaseFreq, 0.001, scheduleTime);
            } catch (e) {
                console.warn('Failed to resync sub oscillator:', e);
            }
        } else {
            try {
                this.subOscillator.setFreq(440, 0.001, scheduleTime);
            } catch (e) {
                console.warn('Failed to resync sub oscillator:', e);
            }
        }
        
        // Resync second oscillator
        try {
            this.osc2.setFreq(baseFreq, 0.001, scheduleTime);
        } catch (e) {
            console.warn('Failed to resync second oscillator:', e);
        }
        
        // Update detuning and phase relationships
        setTimeout(() => {
            this.updateVoiceDetuning();
            this.updateOsc2Frequency();
        }, 10);
    }

    // Parameter setters - apply to all oscillators
    setVolume = (val) => this.volume.setGain(clamp(val, 0, 1));
    setWaveform = (type) => {
        // Handle "off" waveform by setting gain to 0 instead of changing oscillator type
        if (type === 'off') {
            this.oscillatorMixer.setGain(0);
            return;
        } else {
            // Restore normal gain when not "off"
            const count = this.voiceCount;
            const gainReduction = count === 1 ? 1.0 : 1.0 / (1 + (count - 1) * 0.2);
            this.oscillatorMixer.setGain(gainReduction);
        }
        
        // Set waveform for primary oscillator
        this.primaryOscillator.setType(type);
        
        // Set waveform for additional oscillators
        this.additionalOscillators.forEach(osc => osc.setType(type));
        
        // Ensure synchronization is maintained after waveform change
        this.ensureOscillatorSynchronization();
    };
    setDutyCycle = (val) => {
        // Set duty cycle for primary oscillator
        this.primaryOscillator.setDutyCycle(val);
        
        // Set duty cycle for additional oscillators
        this.additionalOscillators.forEach(osc => osc.setDutyCycle(val));
        
        // Note: Sub oscillator and osc2 have independent duty cycle control
    };
    
    // Sub oscillator waveform control
    setSubOscWaveform = (type) => {
        // Handle "off" waveform by setting gain to 0 instead of changing oscillator type
        if (type === 'off') {
            this.subOscillatorGain.setGain(0);
            return;
        } else {
            // Restore normal gain when not "off" (but only if sub osc offset is not 0)
            this.updateSubOscillatorMix();
        }
        
        this.subOscillator.setType(type);
        // Ensure synchronization is maintained after waveform change
        // this.ensureOscillatorSynchronization();
    };
    getSubOscWaveform = () => this.subOscillator.getType();
    setSubOscDutyCycle = (val) => this.subOscillator.setDutyCycle(val);
    getSubOscDutyCycle = () => this.subOscillator.getDutyCycle();
    
    // Second oscillator controls
    setOsc2Waveform = (type) => {
        // Handle "off" waveform by setting gain to 0 instead of changing oscillator type
        if (type === 'off') {
            this.osc2Gain.setGain(0);
            return;
        } else {
            // Restore the user-set osc2Amount when not "off"
            this.osc2Gain.setGain(this.osc2Amount);
        }
        
        this.osc2.setType(type);
        // Ensure synchronization is maintained after waveform change
        this.ensureOscillatorSynchronization();
        // Update phase delay when waveform changes
        this.updateOsc2PhaseDelay();
    };
    getOsc2Waveform = () => this.osc2.getType();
    setOsc2DutyCycle = (val) => this.osc2.setDutyCycle(val);
    getOsc2DutyCycle = () => this.osc2.getDutyCycle();
    setOsc2Detune = (cents, scheduleTime = null) => {
        this.osc2Detune = cents;
        // Use provided schedule time or create one for UI parameter changes
        const actualScheduleTime = scheduleTime !== null ? scheduleTime : (this.AC.currentTime + 0.001);
        this.updateOsc2Frequency(actualScheduleTime);
    };
    getOsc2Detune = () => this.osc2Detune;
    setOsc2Amount = (amount) => {
        this.osc2Amount = clamp(amount, 0, 1);
        this.osc2Gain.setGain(this.osc2Amount);
        
        // Note: osc2 is always started during init() with synchronized timing
        // We don't start it here to maintain phase synchronization across all synths
    };
    
    // Method to resynchronize secondary oscillator with specified start time
    resyncOsc2 = (startTime = null) => {
        // if (!this.isInitialized) return;
        
        // const actualStartTime = startTime || (this.AC.currentTime + 0.001);
        
        // try {
        //     // Disconnect the old oscillator
        //     this.osc2.disconnect();
            
        //     // Create a new oscillator with the same settings
        //     const newOsc2 = new Oscillator(this.AC);
        //     newOsc2.setType(this.osc2.getType());
        //     newOsc2.setDutyCycle(this.osc2.getDutyCycle());
            
        //     // Replace the old oscillator
        //     this.osc2 = newOsc2;
            
        //     // Reconnect with the same audio routing
        //     this.osc2.connect(this.osc2PhaseDelay);
            
        //     // Start with synchronized timing
        //     this.osc2.start(actualStartTime);
            
        //     // Update frequency and phase delay if a note is playing
        //     if (this.currentNoteInfo) {
        //         this.updateOsc2Frequency(actualStartTime);
        //         this.updateOsc2PhaseDelay(actualStartTime);
        //     }
            
        //     // Reconnect vibrato if it was connected
        //     if (this.vibratoLFO) {
        //         try {
        //             const osc2Node = this.osc2.getOscillatorNode();
        //             if (osc2Node && osc2Node.detune) {
        //                 this.vibratoLFO.connect(osc2Node.detune);
        //             }
        //         } catch (e) {
        //             console.warn('Failed to reconnect vibrato to resync\'d second oscillator:', e);
        //         }
        //     }
        // } catch (e) {
        //     console.warn('Failed to resync secondary oscillator:', e);
        // }
    };
    getOsc2Amount = () => this.osc2Amount;
    setOsc2PhaseOffset = (degrees, scheduleTime = null) => {
        this.osc2PhaseOffset = clamp(degrees, 0, 360);
        this.updateOsc2PhaseDelay(scheduleTime);
    };
    getOsc2PhaseOffset = () => this.osc2PhaseOffset;
    
    setOsc2OctaveOffset = (octaveOffset) => {
        const clampedOffset = Math.max(-3, Math.min(3, octaveOffset));
        this.osc2OctaveOffset = clampedOffset;
        
        // Update frequency if a note is currently playing
        this.updateOsc2Frequency();
    };
    
    getOsc2OctaveOffset = () => this.osc2OctaveOffset;
    
    // Method to update phase delay based on current frequency and phase offset
    updateOsc2PhaseDelay = (scheduleTime = null) => {
        // Use provided schedule time or current time for synchronized updates
        const actualScheduleTime = scheduleTime !== null ? scheduleTime : this.AC.currentTime;
        
        // Always calculate delay time if we have valid note info
        if (this.currentNoteInfo) {
            const { baseFreq_ } = this.currentNoteInfo;
            const detuneMultiplier = Math.pow(2, this.osc2Detune / 1200);
            const actualFreq = baseFreq_ * detuneMultiplier;
            
            // Convert phase offset from degrees to seconds
            // Phase offset in radians = degrees * π / 180
            // Time delay = phase_radians / (2π * frequency)
            const phaseRadians = (this.osc2PhaseOffset * Math.PI) / 180;
            const delayTime = phaseRadians / (2 * Math.PI * actualFreq);
            
            // Clamp delay time to valid range (0 to 0.1 seconds for our delay node)
            const clampedDelay = Math.max(0, Math.min(delayTime, 0.1));
            
            this.osc2PhaseDelay.delayTime.setValueAtTime(clampedDelay, actualScheduleTime);
        } else {
            // No note playing, set delay to 0
            this.osc2PhaseDelay.delayTime.setValueAtTime(0, actualScheduleTime);
        }
    };
    
    // Method to update second oscillator frequency based on current note and detune
    updateOsc2Frequency = (scheduleTime = null, rampTime = 0.001) => {
        if (!this.currentNoteInfo) return;
        
        const { baseFreq_ } = this.currentNoteInfo;
        if (!baseFreq_ || !isFinite(baseFreq_)) return;
        
        // Use provided schedule time or create one for UI changes
        const actualScheduleTime = scheduleTime !== null ? scheduleTime : (this.AC.currentTime + 0.001);
        
        // Apply octave offset first
        const octaveMultiplier = Math.pow(2, this.osc2OctaveOffset);
        const octaveShiftedFreq = baseFreq_ * octaveMultiplier;
        
        // Then apply detune in cents
        const detuneRatio = Math.pow(2, this.osc2Detune / 1200);
        const finalFreq = octaveShiftedFreq * detuneRatio;
        
        // Validate frequency and update to keep it tracking
        if (isFinite(finalFreq) && finalFreq > 0 && finalFreq <= 20000) {
            try {
                this.osc2.setFreq(finalFreq, rampTime, actualScheduleTime);
                // Update phase delay whenever frequency changes
                this.updateOsc2PhaseDelay();
            } catch (e) {
                console.warn('Failed to set second oscillator frequency:', e);
            }
        }
    };
    
    setFilterType = (val) => this.filter.setType(val);
    setFilterFreq = (val) => this.filter.setFreq(val);
    setFilterQ = (val) => this.filter.setQ(val);
    setFilterGain = (val) => this.filter.setGain(val);
    
    // Noise-related methods
    setNoiseType = (type) => {
        // console.log('MonoSynth setNoiseType:', type);
        this.noiseGen.setNoiseType(type);
    };
    setNoiseMix = (ratio) => {
        // console.log('MonoSynth setNoiseMix:', ratio);
        try {
            if (typeof ratio !== 'number' || !isFinite(ratio)) {
                console.warn('MonoSynth: Invalid noise mix ratio:', ratio);
                return;
            }
            this.mixer.setMixRatio(ratio);
        } catch (error) {
            console.error('MonoSynth: Error setting noise mix:', error);
        }
    };
    setNoiseGain = (gain) => {
        // console.log('MonoSynth setNoiseGain:', gain);
        this.noiseGen.setGain(gain);
    };
    
    // Noise filter methods
    setNoiseFilterEnabled = (enabled) => {
        this.noiseFilterEnabled = enabled;
        this.updateNoiseFilterBypass();
    };
    
    setNoiseFilterQ = (q) => {
        this.noiseFilterQ = q;
        if (this.noiseFilterEnabled) {
            // Only update Q if filter is enabled, use smooth transition
            this.noiseFilter.setQ(q, 0.01); // 10ms ramp
        }
    };
    
    updateNoiseFilterBypass = () => {
        const rampTime = 0.01; // 10ms ramp to prevent pops
        
        if (this.noiseFilterEnabled) {
            // Enable filtering - route through filter
            this.noiseFilterGain.setGain(1, rampTime);
            this.noiseFilterBypassGain.setGain(0, rampTime);
            
            // Set filter parameters
            this.noiseFilter.setQ(this.noiseFilterQ, rampTime);
            this.updateNoiseFilterFrequency();
        } else {
            // Bypass filtering - route directly
            this.noiseFilterGain.setGain(0, rampTime);
            this.noiseFilterBypassGain.setGain(1, rampTime);
        }
        
        console.log('Noise filter', this.noiseFilterEnabled ? 'enabled' : 'bypassed');
    };
    
    updateNoiseFilterFrequency = () => {
        if (this.noiseFilterEnabled && this.currentNoteInfo) {
            const { baseFreq_ } = this.currentNoteInfo;
            this.noiseFilter.setFreq(baseFreq_);
            console.log('Updated noise filter frequency to:', baseFreq_);
        }
    };

    // Update frequency for microtonal adjustments
    updateNoteFrequency = (pitchEnv) => {
        if (!this.currentNoteInfo) return;
        
        const { noteName, octave } = this.currentNoteInfo;
        
        let noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        let baseFrequency = 261.63; // Default base frequency for C4
        let baseFrequencies = [baseFrequency]
        for(let i = 1; i < noteNames.length; i++) {
            baseFrequencies.push(baseFrequencies[i - 1] * Math.pow(pitchEnv.Octave, 1/12));
        }
        const baseFreq = {            'C': baseFrequencies[0], 'C#': baseFrequencies[1], 'D': baseFrequencies[2], 'D#': baseFrequencies[3],
            'E': baseFrequencies[4], 'F': baseFrequencies[5], 'F#': baseFrequencies[6], 'G': baseFrequencies[7],
            'G#': baseFrequencies[8], 'A': baseFrequencies[9], 'A#': baseFrequencies[10], 'B': baseFrequencies[11]
        }[noteName];

        // Apply microtonal pitch adjustments
        const pitchAdjustments = {
            'C': pitchEnv.C, 'C#': pitchEnv.CSharp, 'D': pitchEnv.D, 'D#': pitchEnv.DSharp,
            'E': pitchEnv.E, 'F': pitchEnv.F, 'F#': pitchEnv.FSharp, 'G': pitchEnv.G,
            'G#': pitchEnv.GSharp, 'A': pitchEnv.A, 'A#': pitchEnv.ASharp, 'B': pitchEnv.B
        };
        
        const adjustedBaseFreq = baseFreq * pitchAdjustments[noteName] * pitchEnv.AllThemPitches;
        
        // Calculate frequency using custom octave ratio
        const newFreq = adjustedBaseFreq * Math.pow(pitchEnv.Octave, octave - 4);
        
        // Update the stored frequency and apply to all oscillators with detuning
        this.currentNoteInfo.baseFreq_ = newFreq;
        
        // Capture scheduling time once for all oscillators to ensure phase alignment
        const scheduleTime = this.AC.currentTime + 0.001; // 1ms offset for stable scheduling
        const rampTime = 0.001; // Short ramp for microtonal changes
        
        // Update all oscillator frequencies with synchronized timing
        this.updateVoiceDetuning(scheduleTime, rampTime);
        
        // Also update sub oscillator and osc2 with the same schedule time and ramp time
        this.updateSubOscillatorFrequency(scheduleTime, rampTime);
        this.updateOsc2Frequency(scheduleTime, rampTime);
    };

    // Note trigger methods
    noteOn = (noteInfo, synthProps) => {
        if (!noteInfo) return;

        // Update activity time for auto-resync
        this.updateActivityTime();

        // Clear any existing timeouts and generate new voice ID
        this.clearTimeouts();
        this.voiceId = ++this.voiceIdCounter;
        const currentVoiceId = this.voiceId; // Capture current voice ID for closures
        
        const { freq, note, oct } = noteInfo;
        const { gainEnv, filterEnv, portamentoSpeed, scheduleTime } = synthProps;

        this.currentNote = note;
        
        // Store note info for microtonal updates
        // Extract note name from full note string (e.g., "C4" -> "C")
        const noteName = note.replace(/\d+$/, '');
        const baseFreq = {
            'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
            'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
            'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88
        }[noteName];
        
        this.currentNoteInfo = {
            noteName: noteName,
            baseFreq: baseFreq,
            octave: oct || parseInt(note.match(/\d+$/)?.[0]) || 4,
            baseFreq_: freq // Store the actual frequency for noise filter
        };
        
        // Update noise filter frequency if enabled
        this.updateNoiseFilterFrequency();
        
        // Use provided schedule time or capture one for all oscillators to ensure phase alignment
        const actualScheduleTime = scheduleTime || (this.AC.currentTime + 0.001); // 1ms offset for stable scheduling
        
        // Set frequency for primary oscillator with detuning and portamento
        if (this.voiceCount <= 1) {
            // Single oscillator (primary only), no detuning
            this.primaryOscillator.setFreq(freq, portamentoSpeed, actualScheduleTime);
        } else {
            // Primary oscillator with detuning (index 0)
            let detuneOffset = 0;
            if (this.detuneSpread > 0) {
                if (this.voiceCount === 2) {
                    detuneOffset = (0 - 0.5) * this.detuneSpread;
                } else {
                    const centerIndex = (this.voiceCount - 1) / 2;
                    detuneOffset = (0 - centerIndex) * (this.detuneSpread / centerIndex);
                }
            }
            
            detuneOffset = Math.max(-1200, Math.min(1200, detuneOffset));
            const detuneRatio = Math.pow(2, detuneOffset / 1200);
            const detunedFreq = freq * detuneRatio;
            
            if (isFinite(detunedFreq) && detunedFreq > 0 && detunedFreq <= 20000) {
                this.primaryOscillator.setFreq(detunedFreq, portamentoSpeed, actualScheduleTime);
            } else {
                console.warn('Invalid primary oscillator detuned frequency in noteOn:', detunedFreq);
                this.primaryOscillator.setFreq(freq, portamentoSpeed, actualScheduleTime);
            }
        }

        // Set frequency for additional oscillators with detuning
        const additionalVoicesNeeded = this.voiceCount - 1;
        for (let i = 0; i < additionalVoicesNeeded; i++) {
            const osc = this.additionalOscillators[i];
            const actualIndex = i + 1; // Since primary is index 0
            
            let detuneOffset = 0;
            if (this.detuneSpread > 0) {
                if (this.voiceCount === 2) {
                    detuneOffset = (actualIndex - 0.5) * this.detuneSpread;
                } else {
                    const centerIndex = (this.voiceCount - 1) / 2;
                    detuneOffset = (actualIndex - centerIndex) * (this.detuneSpread / centerIndex);
                }
            }
            
            detuneOffset = Math.max(-1200, Math.min(1200, detuneOffset));
            const detuneRatio = Math.pow(2, detuneOffset / 1200);
            const detunedFreq = freq * detuneRatio;
            
            if (isFinite(detunedFreq) && detunedFreq > 0 && detunedFreq <= 20000) {
                osc.setFreq(detunedFreq, portamentoSpeed, actualScheduleTime);
            } else {
                console.warn('Invalid additional oscillator detuned frequency in noteOn:', detunedFreq);
                osc.setFreq(freq, portamentoSpeed, actualScheduleTime);
            }
        }

        // Set frequency for sub oscillator (no detuning, just octave offset)
        // if (this.subOscOctaveOffset !== 0) 
            {
            const octaveMultiplier = Math.pow(2, this.subOscOctaveOffset);
            const subBaseFreq = freq * octaveMultiplier;
            
            // Validate sub frequency
            if (isFinite(subBaseFreq) && subBaseFreq > 0 && subBaseFreq <= 20000) {
                this.subOscillator.setFreq(subBaseFreq, portamentoSpeed, actualScheduleTime);
            } else {
                console.warn('Invalid sub oscillator frequency:', subBaseFreq);
            }
        }
        
        // Update second oscillator frequency with detune
        this.updateOsc2Frequency(actualScheduleTime, portamentoSpeed);

        // console.log('MonoSynth noteOn:', note, 'Freq:', freq, 'gainEnv:', gainEnv, 'filterEnv:', filterEnv);
        
        // Determine hold level (use holdLevel if set and non-zero, otherwise use 1 as default attack level)
        const hasHold = gainEnv.hold && gainEnv.hold > 0;
        const holdLevel = hasHold ? gainEnv.holdLevel : 1;
        this.currentHoldLevel = holdLevel; // Store for use in noteOff
        
        // Gain Envelope AHDSR (R is in noteOff())
        if (gainEnv.a) {
            // console.log('MonoSynth gainEnv.a:', gainEnv.a, 'holdLevel:', holdLevel, 'hasHold:', hasHold);
            this.gain.setGainCurve(this.gain.getGain(), 0, 0); // Reset Volume immediately
            const attackTime = Math.max(gainEnv.a, minTime);
            this.gain.setGainCurve(0, holdLevel, attackTime, gainEnv.attackShape, gainEnv.attackExponent); // Attack to hold level

            if (hasHold) {
                // Attack -> Hold -> Decay -> Sustain
                // console.log('MonoSynth gainEnv.hold:', gainEnv.hold, 'gainEnv.d:', gainEnv.d);
                const attackTimeoutId = setTimeout(() => {
                    // Check if this voice is still active
                    if (this.voiceId !== currentVoiceId) return;
                    
                    // Hold phase - maintain hold level
                    this.isInHoldPhase = true;
                    this.holdPhaseEndTime = Date.now() + (gainEnv.hold * 1000);
                    
                    const holdTimeoutId = setTimeout(() => {
                        // Check if this voice is still active
                        if (this.voiceId !== currentVoiceId) return;
                        
                        this.isInHoldPhase = false;
                        this.holdPhaseEndTime = null;
                        const decayTime = Math.max(gainEnv.d, minTime);
                        this.gain.setGainCurve(holdLevel, gainEnv.s, decayTime, gainEnv.decayShape, gainEnv.decayExponent); // Decay from hold level to sustain
                    }, (gainEnv.hold * 1000));
                    this.timeoutIds.push(holdTimeoutId);
                }, (attackTime * 1000));
                this.timeoutIds.push(attackTimeoutId);
            } else {
                // Traditional ADSR: Attack -> Decay -> Sustain
                const timeoutId = setTimeout(() => {
                    // Check if this voice is still active
                    if (this.voiceId !== currentVoiceId) return;
                    
                    const decayTime = Math.max(gainEnv.d, minTime);
                    this.gain.setGainCurve(holdLevel, gainEnv.s, decayTime, gainEnv.decayShape, gainEnv.decayExponent); // Decay from hold level to sustain
                }, (attackTime * 1000));
                this.timeoutIds.push(timeoutId);
            }
        } else if (gainEnv.d) {
            // console.log('MonoSynth gainEnv.d:', gainEnv.d, 'holdLevel:', holdLevel);
            this.gain.setGainCurve(this.gain.getGain(), holdLevel, 0); // Reset to hold level immediately

            const timeoutId = setTimeout(() => {
                // Check if this voice is still active
                if (this.voiceId !== currentVoiceId) return;
                
                const decayTime = Math.max(gainEnv.d, minTime);
                this.gain.setGainCurve(holdLevel, gainEnv.s, decayTime, gainEnv.decayShape, gainEnv.decayExponent); // Decay
            }, (minTime * 1000));
            this.timeoutIds.push(timeoutId);
        } else if (gainEnv.s) {
            // console.log('MonoSynth gainEnv.s:', gainEnv.s);
            this.gain.setGainCurve(this.gain.getGain(), gainEnv.s, 0); // Set Volume immediately
        }

        // Filter Envelope ADS (R is in noteOff())
        if (filterEnv.amount) {
            if (filterEnv.a) {
                this.filter.setDetune(0, 0); // Reset Detune
                const attackTime = Math.max(filterEnv.a, minTime);
                this.filter.setDetune(filterEnv.amount, attackTime); // Attack

                const timeoutId = setTimeout(() => {
                    // Check if this voice is still active
                    if (this.voiceId !== currentVoiceId) return;
                    
                    this.filter.setDetune(0, Math.max(filterEnv.d, minTime)); // Decay
                }, (attackTime * 1000));
                this.timeoutIds.push(timeoutId);
            } else if (filterEnv.d) {
                this.filter.setDetune(filterEnv.amount, 0); // Reset Detune
                this.filter.setDetune(0, Math.max(filterEnv.d, minTime)); // Decay
            }
        }
        
        return currentVoiceId; // Return voice ID for caller to track
    }
    noteOff = ({ gainEnv, filterEnv }, voiceId = null) => {
        // Update activity time for auto-resync
        this.updateActivityTime();
        
        // If voiceId is provided, only process if it matches current voice
        if (voiceId !== null && this.voiceId !== voiceId) {
            console.log('MonoSynth noteOff ignored - voice ID mismatch. Current:', this.voiceId, 'Requested:', voiceId);
            return;
        }
        
        const currentVoiceId = this.voiceId; // Capture current voice ID for closures
        
        if (this.isInHoldPhase && this.holdPhaseEndTime) {
            // We're in hold phase - schedule decay->sustain->release after hold completes
            const remainingHoldTime = Math.max(0, this.holdPhaseEndTime - Date.now());
            // console.log('MonoSynth noteOff during hold phase, remaining hold time:', remainingHoldTime);
            
            const holdCompleteTimeoutId = setTimeout(() => {
                // Check if this voice is still active
                if (this.voiceId !== currentVoiceId) return;
                
                // Hold phase completed, now do decay to sustain
                this.isInHoldPhase = false;
                this.holdPhaseEndTime = null;
                
                if (gainEnv.d && gainEnv.d > 0) {
                    // Has decay phase - decay from hold level to sustain
                    // console.log('MonoSynth decay after hold, decay time:', gainEnv.d, 'sustain level:', gainEnv.s);
                    const decayTime = Math.max(gainEnv.d, minTime);
                    this.gain.setGainCurve(this.currentHoldLevel, gainEnv.s, decayTime, gainEnv.decayShape, gainEnv.decayExponent);
                    
                    // Then release after decay completes
                    const releaseTimeoutId = setTimeout(() => {
                        // Check if this voice is still active
                        if (this.voiceId !== currentVoiceId) return;
                        
                        this.currentNote = null;
                        this.currentNoteInfo = null;
                        const releaseTime = Math.max(gainEnv.r, minTime);
                        this.gain.setGainCurve(gainEnv.s, 0, releaseTime, gainEnv.releaseShape, gainEnv.releaseExponent); // Release
                        this.filter.setDetune(0, Math.max(filterEnv.r, minTime)); // Release
                    }, Math.max(gainEnv.d, minTime) * 1000);
                    this.timeoutIds.push(releaseTimeoutId);
                } else {
                    // No decay phase - go directly to release from hold level
                    // console.log('MonoSynth no decay, direct release from hold level');
                    this.currentNote = null;
                    this.currentNoteInfo = null;
                    const releaseTime = Math.max(gainEnv.r, minTime);
                    this.gain.setGainCurve(this.currentHoldLevel, 0, releaseTime, gainEnv.releaseShape, gainEnv.releaseExponent); // Release
                    this.filter.setDetune(0, Math.max(filterEnv.r, minTime)); // Release
                }
            }, remainingHoldTime);
            this.timeoutIds.push(holdCompleteTimeoutId);
        } else {
            // Normal release - not in hold phase
            this.clearTimeouts();
            this.currentNote = null;
            this.currentNoteInfo = null;
            const releaseTime = Math.max(gainEnv.r, minTime);
            this.gain.setGainCurve(this.gain.getGain(), 0, releaseTime, gainEnv.releaseShape, gainEnv.releaseExponent); // Release
            this.filter.setDetune(0, Math.max(filterEnv.r, minTime)); // Release
        }
    }
    noteStop = (voiceId = null) => {
        // Update activity time for auto-resync
        this.updateActivityTime();
        
        // If voiceId is provided, only process if it matches current voice
        if (voiceId !== null && this.voiceId !== voiceId) {
            console.log('MonoSynth noteStop ignored - voice ID mismatch. Current:', this.voiceId, 'Requested:', voiceId);
            return;
        }
        
        const currentVoiceId = this.voiceId; // Capture current voice ID for closures
        
        if (this.isInHoldPhase && this.holdPhaseEndTime) {
            // Even for noteStop, respect the hold phase
            const remainingHoldTime = Math.max(0, this.holdPhaseEndTime - Date.now());
            // console.log('MonoSynth noteStop during hold phase, remaining hold time:', remainingHoldTime);
            
            const holdCompleteTimeoutId = setTimeout(() => {
                // Check if this voice is still active
                if (this.voiceId !== currentVoiceId) return;
                
                this.clearTimeouts();
                this.currentNote = null;
                this.currentNoteInfo = null;
                this.gain.setGainCurve(this.gain.getGain(), 0, 0); // Immediate stop
                this.filter.setDetune(0, minTime);
            }, remainingHoldTime);
            
            // Clear existing timeouts but keep the hold completion timeout
            this.timeoutIds.forEach((id) => clearTimeout(id));
            this.timeoutIds = [holdCompleteTimeoutId];
        } else {
            // Normal immediate stop
            this.clearTimeouts();
            this.currentNote = null;
            this.currentNoteInfo = null;
            this.gain.setGainCurve(this.gain.getGain(), 0, 0); // Immediate stop
            this.filter.setDetune(0, minTime);
        }
    }

    updateSubOscillatorMix() {
        // When subOscOctaveOffset is 0, set gain to 0 to bypass the sub oscillator
        if (this.subOscOctaveOffset === 0) {
            this.subOscillatorGain.setGain(0);
        } else {
            // Gentle gain reduction to prevent clipping when sub oscillator is active
            const gainReduction = 0.5; // Fixed gain for single sub oscillator
            this.subOscillatorGain.setGain(gainReduction);
        }
    }

    updateSubOscillatorFrequency(scheduleTime = null, rampTime = 0.001) {
        if (!this.currentNoteInfo || this.subOscOctaveOffset === 0) return;
        
        const { baseFreq_ } = this.currentNoteInfo;
        const octaveMultiplier = Math.pow(2, this.subOscOctaveOffset);
        const subBaseFreq = baseFreq_ * octaveMultiplier;
        
        // Validate sub frequency
        if (!isFinite(subBaseFreq) || subBaseFreq <= 0 || subBaseFreq > 20000) {
            console.warn('Invalid sub oscillator frequency:', subBaseFreq);
            return;
        }
        
        // Use provided schedule time or create one for standalone calls
        const actualScheduleTime = scheduleTime !== null ? scheduleTime : (this.AC.currentTime + 0.001);
        
        try {
            // Sub oscillator doesn't get detuning - it stays pitched at exact octave intervals
            this.subOscillator.setFreq(subBaseFreq, rampTime, actualScheduleTime);
        } catch (e) {
            console.warn('Failed to set sub oscillator frequency:', e);
        }
    }

    updateSubOscillatorStereoSpread() {
        // For single sub oscillator, always keep it centered
        // This method exists for compatibility with PolySynth
        try {
            this.subOscillatorPanner.setPan(0); // Always center for single sub oscillator
        } catch (e) {
            console.warn('Failed to center sub oscillator pan:', e);
        }
    }

    // Sub oscillator control methods
    setSubOscOctaveOffset(octaveOffset) {
        const clampedOffset = Math.max(-3, Math.min(3, octaveOffset));
        this.subOscOctaveOffset = clampedOffset;
        
        // Update the sub oscillator mix (bypass when offset is 0)
        this.updateSubOscillatorMix();
        
        // Update frequency if a note is currently playing
        this.updateSubOscillatorFrequency();
    }

    getSubOscOctaveOffset() {
        return this.subOscOctaveOffset;
    }

    // Connect vibrato LFO to sub oscillator
    connectVibratoToSubOscillator(vibratoLFO) {
        try {
            const subOscNode = this.subOscillator.getOscillatorNode();
            if (subOscNode && subOscNode.detune) {
                vibratoLFO.connect(subOscNode.detune);
            }
        } catch (e) {
            console.warn('Failed to connect vibrato to sub oscillator:', e);
        }
    }
    
    // Cleanup method to properly dispose of resources
    destroy() {
        // Clear any running timeouts
        this.clearTimeouts();
        
        // Stop any playing notes
        this.noteStop();
        
        // Destroy noise generator
        if (this.noiseGen) {
            this.noiseGen.destroy();
        }
        
        // Clean up oscillators
        try {
            this.primaryOscillator.disconnect();
        } catch (e) {
            console.warn('Error disconnecting primary oscillator:', e);
        }
        
        this.additionalOscillators.forEach(osc => {
            try {
                osc.disconnect();
            } catch (e) {
                console.warn('Error disconnecting additional oscillator:', e);
            }
        });
        
        // Clean up sub oscillator
        try {
            this.subOscillator.disconnect();
        } catch (e) {
            console.warn('Error disconnecting sub oscillator:', e);
        }
        
        // Clean up audio nodes
        try {
            this.mixer.disconnect();
            this.gain.disconnect();
            this.filter.disconnect();
            this.volume.disconnect();
        } catch (e) {
            console.warn('Error disconnecting audio nodes:', e);
        }
    }

    // Cleanup method to properly dispose of resources
    destroy() {
        // Clear auto-resync timer
        if (this.autoResyncTimer) {
            clearTimeout(this.autoResyncTimer);
            this.autoResyncTimer = null;
        }
        
        // Clear any running timeouts
        this.clearTimeouts();
        
        // Stop any playing notes
        this.noteStop();
        
        console.log('MonoSynth destroyed and resources cleaned up');
    }
}

export default MonoSynth;
