import Gain from './gain';
import LFO from './lfo';

const MAX_LFO_RATE = 10;
const MAX_LFO_DEPTH = 1000;

class Phaser {
    constructor(AC) {
        this.AC = AC;
        
        // Input and output gains
        this.inputGain = new Gain(this.AC);
        this.dryGain = new Gain(this.AC);
        this.wetGain = new Gain(this.AC);
        this.outputGain = new Gain(this.AC);
        this.feedbackGain = new Gain(this.AC);
        
        // Create a separate input node for the wet signal path
        this.wetInputGain = new Gain(this.AC);
        
        // Number of all-pass filter stages (more stages = more pronounced effect)
        this.numStages = 6;
        this.allPassFilters = [];
        
        // LFO for modulation
        this.lfo = new LFO(this.AC);
        this.lfo.setType('sine');
        this.lfo.setRate(0.5); // Default rate
        this.lfo.setDepth(800); // Default depth
        this.lfo.start();
        
        // Connect input to both dry and wet paths
        this.inputGain.connect(this.dryGain.getNode());
        this.inputGain.connect(this.wetInputGain.getNode());
        
        // Create cascaded all-pass filters for wet path only
        let previousNode = this.wetInputGain.getNode();
        
        for (let i = 0; i < this.numStages; i++) {
            const allPassFilter = this.AC.createBiquadFilter();
            allPassFilter.type = 'allpass';
            allPassFilter.frequency.setValueAtTime(800, this.AC.currentTime); // Base frequency
            allPassFilter.Q.setValueAtTime(0.5, this.AC.currentTime);
            
            // Connect LFO to modulate the filter frequency
            this.lfo.connect(allPassFilter.frequency);
            
            // Connect in series
            previousNode.connect(allPassFilter);
            previousNode = allPassFilter;
            
            this.allPassFilters.push(allPassFilter);
        }
        
        // Connect the final filter output to wet signal
        previousNode.connect(this.wetGain.getNode());
        
        // Feedback path (from final allpass output back to wet input)
        previousNode.connect(this.feedbackGain.getNode());
        this.feedbackGain.connect(this.wetInputGain.getNode());
        
        // Mix dry and wet signals at output
        this.dryGain.connect(this.outputGain.getNode());
        this.wetGain.connect(this.outputGain.getNode());
        
        // Initialize default values
        this.amount = 0;
        this.rate = 0.5;
        this.depth = 800;
        this.feedback = 0.3;
        this.frequency = 800;
        
        this.setAmount(0);
        this.setFeedback(0.3);
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
    getFrequency = () => this.frequency;
    
    // Setters
    setAmount = (val) => {
        this.amount = Math.max(0, Math.min(1, val));
        this.dryGain.setGain(1 - this.amount);
        this.wetGain.setGain(this.amount);
    }
    
    setRate = (val) => {
        if (val < 0 || val > MAX_LFO_RATE) return false;
        this.rate = val;
        this.lfo.setRate(val);
    }
    
    setDepth = (val) => {
        if (val < 0 || val > MAX_LFO_DEPTH) return false;
        this.depth = val;
        this.lfo.setDepth(val);
    }
    
    setFeedback = (val) => {
        this.feedback = Math.max(0, Math.min(0.95, val));
        this.feedbackGain.setGain(this.feedback);
    }
    
    setFrequency = (val) => {
        if (val < 20 || val > 20000) return false;
        this.frequency = val;
        this.allPassFilters.forEach(filter => {
            filter.frequency.setValueAtTime(val, this.AC.currentTime);
        });
    }
}

export default Phaser;
