/**
 * Example demonstrating how to use the new absolute timebase metronome
 * This shows how other components in your synth project can leverage
 * the metronome's timing information for synchronization.
 */

import { metronome } from './metronome.js';

// Example: Synchronize visual effects with the metronome
function createBeatSynchronizedVisualEffect() {
    if (!metronome.isRunning) {
        console.log('Metronome is not running');
        return;
    }

    // Get timing information
    const timePerBeat = metronome.getTimePerBeat();
    const currentBeatInfo = metronome.getCurrentBeatInfo();
    const timeUntilNext = metronome.getTimeUntilNextBeat();
    
    console.log(`Time per beat: ${timePerBeat}s`);
    console.log(`Current beat in bar: ${currentBeatInfo.beatInBar}`);
    console.log(`Time until next beat: ${timeUntilNext}s`);
    
    // Schedule something to happen on the next beat
    const timerId = metronome.scheduleOnNextBeat(() => {
        console.log('Visual effect triggered on beat!');
        // Add your visual effect code here
    });
    
    return timerId;
}

// Example: Check if we're currently on a beat (useful for recording/playback sync)
function checkBeatAlignment() {
    const isOnBeat = metronome.isOnBeat(0.02); // 20ms tolerance
    console.log(`Currently on beat: ${isOnBeat}`);
    return isOnBeat;
}

// Example: Calculate the absolute time for a specific beat number
function scheduleEventAtBeat(beatNumber, callback) {
    if (!metronome.isRunning) {
        console.log('Metronome must be running to schedule events');
        return null;
    }
    
    const beatTime = metronome.getTimeForBeat(beatNumber);
    const audioContext = metronome.audioContext;
    
    if (beatTime > audioContext.currentTime) {
        const delay = (beatTime - audioContext.currentTime) * 1000;
        return setTimeout(callback, delay);
    } else {
        console.log('Beat time has already passed');
        return null;
    }
}

// Example: Create a sequencer that works with the absolute timebase
class SimpleSequencer {
    constructor(pattern = [1, 0, 1, 0]) { // 1 = trigger, 0 = rest
        this.pattern = pattern;
        this.currentStep = 0;
        this.isRunning = false;
        this.scheduledEvents = [];
    }
    
    start() {
        if (this.isRunning || !metronome.isRunning) return;
        
        this.isRunning = true;
        this.currentStep = 0;
        this.scheduleNextEvents();
    }
    
    stop() {
        this.isRunning = false;
        // Clear any scheduled events
        this.scheduledEvents.forEach(id => clearTimeout(id));
        this.scheduledEvents = [];
    }
    
    scheduleNextEvents() {
        if (!this.isRunning) return;
        
        // Schedule the next 4 beats worth of events
        const currentBeatInfo = metronome.getCurrentBeatInfo();
        const startBeat = currentBeatInfo.totalBeats + 1;
        
        for (let i = 0; i < 4; i++) {
            const beatNumber = startBeat + i;
            const patternIndex = (this.currentStep + i) % this.pattern.length;
            
            if (this.pattern[patternIndex] === 1) {
                const timerId = scheduleEventAtBeat(beatNumber, () => {
                    console.log(`Sequencer trigger at beat ${beatNumber}`);
                    // Trigger your sound/action here
                });
                
                if (timerId) {
                    this.scheduledEvents.push(timerId);
                }
            }
        }
        
        this.currentStep = (this.currentStep + 4) % this.pattern.length;
        
        // Schedule the next batch of events
        const nextScheduleTime = metronome.getTimeForBeat(startBeat + 4);
        const delay = (nextScheduleTime - metronome.audioContext.currentTime) * 1000;
        
        if (delay > 0) {
            const scheduleId = setTimeout(() => this.scheduleNextEvents(), delay);
            this.scheduledEvents.push(scheduleId);
        }
    }
}

// Example usage:
// const sequencer = new SimpleSequencer([1, 0, 1, 1, 0, 1, 0, 0]);
// metronome.start();
// sequencer.start();

export {
    createBeatSynchronizedVisualEffect,
    checkBeatAlignment,
    scheduleEventAtBeat,
    SimpleSequencer
};
