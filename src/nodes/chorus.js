import Gain from './gain';
import LFO from './lfo';

const MAX_DELAY_TIME = 0.03; // 30ms max delay
const MAX_LFO_RATE = 10;
const MAX_LFO_DEPTH = 0.01; // 10ms max depth

class Chorus {
    constructor(AC) {
        this.AC = AC;
        
        // Input and output gains
        this.inputGain = new Gain(this.AC);
        this.dryGain = new Gain(this.AC);
        this.wetGain = new Gain(this.AC);
        this.outputGain = new Gain(this.AC);
        
        // Multiple voice delays for richer chorus effect
        this.numVoices = 3;
        this.delays = [];
        this.lfos = [];
        this.voiceGains = [];
        
        // Create multiple delayed voices
        for (let i = 0; i < this.numVoices; i++) {
            const delay = this.AC.createDelay(MAX_DELAY_TIME);
            const lfo = new LFO(this.AC);
            const voiceGain = new Gain(this.AC);
            
            // Set different base delays and LFO rates for each voice
            const baseDelay = 0.005 + (i * 0.003); // 5ms, 8ms, 11ms
            delay.delayTime.setValueAtTime(baseDelay, this.AC.currentTime);
            
            // Different LFO rates for each voice (0.5Hz, 0.7Hz, 0.9Hz)
            lfo.setRate(0.5 + (i * 0.2));
            lfo.setDepth(0.002); // 2ms modulation depth
            lfo.start();
            
            // Connect the modulation
            lfo.connect(delay.delayTime);
            
            // Connect signal path
            this.inputGain.connect(delay);
            delay.connect(voiceGain.getNode());
            voiceGain.connect(this.wetGain.getNode());
            voiceGain.setGain(0.3); // Each voice at 30% to avoid clipping
            
            this.delays.push(delay);
            this.lfos.push(lfo);
            this.voiceGains.push(voiceGain);
        }
        
        // Direct signal path
        this.inputGain.connect(this.dryGain.getNode());
        
        // Mix dry and wet signals
        this.dryGain.connect(this.outputGain.getNode());
        this.wetGain.connect(this.outputGain.getNode());
        
        // Initialize default values
        this.amount = 0;
        this.rate = 0.6;
        this.depth = 0.002;
        this.feedback = 0;
        
        this.setAmount(0);
    }
    
    connect = (destination) => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => {
                this.outputGain.connect(dest);
            });
        } else {
            this.outputGain.connect(destination);
        }
    }
    
    // Input connection point
    getNode = () => this.inputGain.getNode();
    
    // Getters
    getAmount = () => this.amount;
    getRate = () => this.rate;
    getDepth = () => this.depth;
    getFeedback = () => this.feedback;
    
    // Setters
    setAmount = (val) => {
        this.amount = Math.max(0, Math.min(1, val));
        this.dryGain.setGain(1 - this.amount);
        this.wetGain.setGain(this.amount);
    }
    
    setRate = (val) => {
        if (val < 0 || val > MAX_LFO_RATE) return false;
        this.rate = val;
        this.lfos.forEach((lfo, index) => {
            // Slightly different rates for each voice
            lfo.setRate(val + (index * 0.1));
        });
    }
    
    setDepth = (val) => {
        if (val < 0 || val > MAX_LFO_DEPTH) return false;
        this.depth = val;
        this.lfos.forEach(lfo => {
            lfo.setDepth(val);
        });
    }
    
    setFeedback = (val) => {
        this.feedback = Math.max(0, Math.min(0.95, val));
        // Note: Feedback not implemented in this basic version
        // Could be added by connecting delayed signal back to input
    }
}

export default Chorus;
