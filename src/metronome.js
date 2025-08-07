import $ from 'jquery';

const animations = document.querySelectorAll('[data-animation');

function reset(){    
    var el = document.getElementsByClassName('metronome');
    Array.from(el).forEach((e) =>{
      e.style.animationName = 'none';
      void(e.offsetHeight); /* trigger reflow */
      e.style.animationName = null; 
    })
}

$('#metronomeCheckBox').on('change', function (e) {
    if($('#metronomeCheckBox')[0].checked){
        document.querySelector('#metronomeContainer').style.visibility = 'visible';
        document.querySelector('#metronomeContainer').style.opacity = '1';
    } else {
        document.querySelector('#metronomeContainer').style.visibility = 'hidden';
        document.querySelector('#metronomeContainer').style.opacity = '0';
    }
});

// $('#metronomeModeSelect').on('change', function (e) {
// 	if($('#metronomeModeSelect').val() == '0'){
// 		$('.metronome01')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome02')[0].style.setProperty('--box-shadow-color', '#c8e020')
// 		$('.metronome03')[0].style.setProperty('--box-shadow-color', '#90d743')
// 		$('.metronome04')[0].style.setProperty('--box-shadow-color', '#5ec962')
// 		$('.metronome05')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome06')[0].style.setProperty('--box-shadow-color', '#20a486')
// 		$('.metronome07')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome08')[0].style.setProperty('--box-shadow-color', '#287c8e')
// 		$('.metronome09')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome10')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome11')[0].style.setProperty('--box-shadow-color', '#443983')
// 		$('.metronome12')[0].style.setProperty('--box-shadow-color', '#481f70')
// 		$('.metronome13')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome14')[0].style.setProperty('--box-shadow-color', '#481f70')
// 		$('.metronome15')[0].style.setProperty('--box-shadow-color', '#443983')
// 		$('.metronome16')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome17')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome18')[0].style.setProperty('--box-shadow-color', '#287c8e')
// 		$('.metronome19')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome20')[0].style.setProperty('--box-shadow-color', '#20a486')
// 		$('.metronome21')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome22')[0].style.setProperty('--box-shadow-color', '#5ec962')
// 		$('.metronome23')[0].style.setProperty('--box-shadow-color', '#90d743')
// 		$('.metronome24')[0].style.setProperty('--box-shadow-color', '#c8e020')
// 	}
// 	if($('#metronomeModeSelect').val() == '1'){
// 		$('.metronome01')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome02')[0].style.setProperty('--box-shadow-color', '#90d743')
// 		$('.metronome03')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome04')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome05')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome06')[0].style.setProperty('--box-shadow-color', '#443983')
// 		$('.metronome07')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome08')[0].style.setProperty('--box-shadow-color', '#443983')
// 		$('.metronome09')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome10')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome11')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome12')[0].style.setProperty('--box-shadow-color', '#90d743')
// 		$('.metronome13')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome14')[0].style.setProperty('--box-shadow-color', '#90d743')
// 		$('.metronome15')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome16')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome17')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome18')[0].style.setProperty('--box-shadow-color', '#443983')
// 		$('.metronome19')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome20')[0].style.setProperty('--box-shadow-color', '#443983')
// 		$('.metronome21')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome22')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome23')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome24')[0].style.setProperty('--box-shadow-color', '#90d743')
// 	}
// 	if($('#metronomeModeSelect').val() == '2'){
// 		$('.metronome01')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome02')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome03')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome04')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome05')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome06')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome07')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome08')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome09')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome10')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome11')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome12')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome13')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome14')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome15')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome16')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome17')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome18')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome19')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome20')[0].style.setProperty('--box-shadow-color', '#35b779')
// 		$('.metronome21')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome22')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome23')[0].style.setProperty('--box-shadow-color', '#31688e')
// 		$('.metronome24')[0].style.setProperty('--box-shadow-color', '#35b779')
// 	}
// 	if($('#metronomeModeSelect').val() == '3'){
// 		$('.metronome01')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome02')[0].style.setProperty('--box-shadow-color', '#5ec962')
// 		$('.metronome03')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome04')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome05')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome06')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome07')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome08')[0].style.setProperty('--box-shadow-color', '#5cc863')
// 		$('.metronome09')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome10')[0].style.setProperty('--box-shadow-color', '#5cc863')
// 		$('.metronome11')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome12')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome13')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome14')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome15')[0].style.setProperty('--box-shadow-color', '#21908d')
// 		$('.metronome16')[0].style.setProperty('--box-shadow-color', '#5ec962')
// 		$('.metronome17')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome18')[0].style.setProperty('--box-shadow-color', '#5ec962')
// 		$('.metronome19')[0].style.setProperty('--box-shadow-color', '#21908d')
// 		$('.metronome20')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome21')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome22')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome23')[0].style.setProperty('--box-shadow-color', '#21908d')
// 		$('.metronome24')[0].style.setProperty('--box-shadow-color', '#5cc863')
// 	}
// 	if($('#metronomeModeSelect').val() == '4'){
// 		$('.metronome01')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome02')[0].style.setProperty('--box-shadow-color', '#addc30')
// 		$('.metronome03')[0].style.setProperty('--box-shadow-color', '#5ec962')
// 		$('.metronome04')[0].style.setProperty('--box-shadow-color', '#28ae80')
// 		$('.metronome05')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome06')[0].style.setProperty('--box-shadow-color', '#2c728e')
// 		$('.metronome07')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome08')[0].style.setProperty('--box-shadow-color', '#472d7b')
// 		$('.metronome09')[0].style.setProperty('--box-shadow-color', '#440154')
// 		$('.metronome10')[0].style.setProperty('--box-shadow-color', '#472d7b')
// 		$('.metronome11')[0].style.setProperty('--box-shadow-color', '#3b528b')
// 		$('.metronome12')[0].style.setProperty('--box-shadow-color', '#2c728e')
// 		$('.metronome13')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome14')[0].style.setProperty('--box-shadow-color', '#28ae80')
// 		$('.metronome15')[0].style.setProperty('--box-shadow-color', '#5cc863')
// 		$('.metronome16')[0].style.setProperty('--box-shadow-color', '#addc30')
// 		$('.metronome17')[0].style.setProperty('--box-shadow-color', '#fde725')
// 		$('.metronome18')[0].style.setProperty('--box-shadow-color', '#addc30')
// 		$('.metronome19')[0].style.setProperty('--box-shadow-color', '#5cc863')
// 		$('.metronome20')[0].style.setProperty('--box-shadow-color', '#28ae80')
// 		$('.metronome21')[0].style.setProperty('--box-shadow-color', '#21918c')
// 		$('.metronome22')[0].style.setProperty('--box-shadow-color', '#28ae80')
// 		$('.metronome23')[0].style.setProperty('--box-shadow-color', '#5cc863')
// 		$('.metronome24')[0].style.setProperty('--box-shadow-color', '#aadc32')
// 	}
// });

class Metronome
{
    /**
     * Metronome class with absolute timebase approach
     * 
     * This metronome uses an absolute time reference instead of relative timing.
     * Key concepts:
     * - referenceTime: The absolute time when the metronome started or tempo changed
     * - timePerBeat: Duration of each beat in seconds (60 / BPM)
     * - totalBeatsPlayed: Number of beats played since reference time
     * 
     * With these values, any beat's absolute time can be calculated as:
     * beatTime = referenceTime + (beatNumber * timePerBeat)
     * 
     * This approach provides:
     * - More robust timing that doesn't drift
     * - Easy synchronization with external components
     * - Ability to query timing information at any point
     * - Support for tempo changes without losing timing accuracy
     */

    constructor(tempo = 120)
    {
        this.audioContext = null;
        this.notesInQueue = [];         // notes that have been put into the web audio and may or may not have been played yet {note, time}
        this.currentBeatInBar = 0;
        this.currentNoteInBeat = 0;
        this.beatsPerBar = 4;
        this.tempo = tempo;
        this.lookahead = 25;          // How frequently to call scheduling function (in milliseconds)
        this.scheduleAheadTime = 0.1;   // How far ahead to schedule audio (sec)
        
        // Absolute timebase properties using performance.now()
        this.referenceTime = 0.0;      // Reference time when metronome timeline started (performance.now() time)
        this.timePerBeat = 60.0 / tempo; // Time per beat in seconds
        this.totalBeatsPlayed = 0;     // Total number of beats played since reference time
        this.audioContextStartTime = null; // Offset between performance.now() and audioContext.currentTime
        
        // Initialize reference time immediately using performance.now()
        this.initializeReferenceTime();
        
        this.isRunning = false;
        this.intervalID = null;
    }

    // Set reference time and reset timebase
    setReferenceTime(time = null)
    {
        this.referenceTime = time || (performance.now() / 1000); // Convert ms to seconds
        this.totalBeatsPlayed = 0;
        this.currentBeatInBar = 0;
        this.currentNoteInBeat = 0;
        console.log('Setting reference time to:', this.referenceTime);
    }

    // Initialize absolute reference time (called once on construction)
    initializeReferenceTime(time = null)
    {
        if (this.referenceTime === 0.0) {
            this.setReferenceTime(time);
            console.log('Initialize reference time to:', this.referenceTime);
        }
    }

    // Force reset the reference time (use sparingly, only when you want to break sync)
    forceResetReferenceTime(time = null)
    {
        this.setReferenceTime(time);
        console.log("Force resetting reference time to:", this.referenceTime);
    }

    // Get current performance-based time in seconds
    getCurrentTime()
    {
        return performance.now() / 1000;
    }

    initializeAudioContext(){
        if (!this.audioContext || this.audioContextStartTime === null) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.updateAudioContextOffset();
            this.setTempo(this.tempo); // Ensure tempo is set after audio context initialization
        }
    }

    // Convert performance time to audio context time
    performanceTimeToAudioTime(performanceTime)
    {
        if (!this.audioContext || this.audioContextStartTime === null) {            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.updateAudioContextOffset();
        }
        if (!this.audioContext || this.audioContextStartTime === null) {
            console.warn('Audio context not initialized or start time not set');
            return 0;
        }
        return performanceTime - this.audioContextStartTime;
    }

    // Update the audio context offset when audio context starts
    updateAudioContextOffset()
    {
        if (this.audioContext && this.audioContextStartTime === null) {
            this.audioContextStartTime = this.getCurrentTime() - this.audioContext.currentTime;
            console.log('Audio context offset set to:', this.audioContextStartTime);
        }
    }

    // Update tempo and recalculate timebase
    setTempo(newTempo)
    {
        if (this.tempo === newTempo) return;
        
        // If running, calculate current position to maintain sync
        if (this.isRunning && this.referenceTime > 0) {
            const currentTime = this.getCurrentTime();
            const elapsedTime = currentTime - this.referenceTime;
            // Keep the same reference time, just update the beat calculations
            this.totalBeatsPlayed = Math.floor(elapsedTime / this.timePerBeat);
        }
        
        this.tempo = newTempo;
        this.timePerBeat = 60.0 / newTempo;
    }

    // Get the absolute time for a specific beat number
    getTimeForBeat(beatNumber)
    {
        return this.referenceTime + (beatNumber * this.timePerBeat);
    }

    // Get the next beat time after the current time
    getNextBeatTime()
    {
        const currentTime = this.getCurrentTime();
        const elapsedTime = currentTime - this.referenceTime;
        const nextBeatNumber = Math.floor(elapsedTime / this.timePerBeat) + 1;
        
        return this.getTimeForBeat(nextBeatNumber);
    }

    // Get the next half note time after the current time
    getNextHalfNoteTime(alignToNextBeat = false)
    {
        const currentTime = this.getCurrentTime();
        const elapsedTime = currentTime - this.referenceTime;
        const timePerHalfNote = this.timePerBeat * 2; // Half note is 2 quarter notes
        
        if (alignToNextBeat) {
            // Align to the next quarter note beat first
            const nextBeatNumber = Math.floor(elapsedTime / this.timePerBeat) + 1;
            const nextBeatTime = this.getTimeForBeat(nextBeatNumber);
            
            // Find the next half note aligned beat from that point
            const beatsFromReference = nextBeatNumber;
            const nextHalfNoteBeat = Math.ceil(beatsFromReference / 2) * 2;
            return this.getTimeForBeat(nextHalfNoteBeat);
        } else {
            // Direct half note grid calculation
            const nextHalfNoteNumber = Math.floor(elapsedTime / timePerHalfNote) + 1;
            return this.referenceTime + (nextHalfNoteNumber * timePerHalfNote);
        }
    }

    // Get the next whole note time after the current time
    getNextWholeNoteTime(alignToNextBeat = false)
    {
        const currentTime = this.getCurrentTime();
        const elapsedTime = currentTime - this.referenceTime;
        const timePerWholeNote = this.timePerBeat * 4; // Whole note is 4 quarter notes
        
        if (alignToNextBeat) {
            // Align to the next quarter note beat first
            const nextBeatNumber = Math.floor(elapsedTime / this.timePerBeat) + 1;
            const nextBeatTime = this.getTimeForBeat(nextBeatNumber);
            
            // Find the next whole note aligned beat from that point
            const beatsFromReference = nextBeatNumber;
            const nextWholeNoteBeat = Math.ceil(beatsFromReference / 4) * 4;
            return this.getTimeForBeat(nextWholeNoteBeat);
        } else {
            // Direct whole note grid calculation
            const nextWholeNoteNumber = Math.floor(elapsedTime / timePerWholeNote) + 1;
            return this.referenceTime + (nextWholeNoteNumber * timePerWholeNote);
        }
    }

    // Get the next eighth note time after the current time
    getNextEighthNoteTime(alignToNextBeat = false)
    {
        console.log('getNextEighthNoteTime called with alignToNextBeat:', alignToNextBeat);
        const currentTime = this.getCurrentTime();
        const elapsedTime = currentTime - this.referenceTime;
        const timePerEighthNote = this.timePerBeat / 2; // Eighth note is half a quarter note
        
        if (alignToNextBeat) {
            // Align to the next quarter note beat first
            const nextBeatNumber = Math.floor(elapsedTime / this.timePerBeat) + 1;
            return this.getTimeForBeat(nextBeatNumber);
        } else {
            // Direct eighth note grid calculation
            const nextEighthNoteNumber = Math.floor(elapsedTime / timePerEighthNote) + 1;
            let nextBeat =  this.referenceTime + (nextEighthNoteNumber * timePerEighthNote);
            console.log('Next Eighth Note Time:', nextBeat, 'Reference Time:', this.referenceTime, 'Eighth Note Number:', nextEighthNoteNumber);
            return nextBeat;
        }
    }

    // Get the next sixteenth note time after the current time
    getNextSixteenthNoteTime(alignToNextBeat = false)
    {
        const currentTime = this.getCurrentTime();
        const elapsedTime = currentTime - this.referenceTime;
        const timePerSixteenthNote = this.timePerBeat / 4; // Sixteenth note is quarter of a quarter note
        
        if (alignToNextBeat) {
            // Align to the next quarter note beat first
            const nextBeatNumber = Math.floor(elapsedTime / this.timePerBeat) + 1;
            return this.getTimeForBeat(nextBeatNumber);
        } else {
            // Direct sixteenth note grid calculation
            const nextSixteenthNoteNumber = Math.floor(elapsedTime / timePerSixteenthNote) + 1;
            return this.referenceTime + (nextSixteenthNoteNumber * timePerSixteenthNote);
        }
    }

    // Generic function to get next time for any note duration
    getNextNoteTime(noteDuration, alignToNextBeat = false)
    {
        switch (noteDuration) {
            case 'whole':
                return this.getNextWholeNoteTime(alignToNextBeat);
            case 'half':
                return this.getNextHalfNoteTime(alignToNextBeat);
            case 'quarter':
                return this.getNextBeatTime(); // alignToNextBeat doesn't apply for quarter notes
            case 'eighth':
                return this.getNextEighthNoteTime(alignToNextBeat);
            case 'sixteenth':
                return this.getNextSixteenthNoteTime(alignToNextBeat);
            default:
                throw new Error(`Unknown note duration: ${noteDuration}`);
        }
    }

    // Get current note position information for any note duration
    getCurrentNoteInfo(noteDuration = 'quarter')
    {
        const currentTime = this.getCurrentTime();
        const elapsedTime = currentTime - this.referenceTime;
        
        switch (noteDuration) {
            case 'whole': {
                const timePerWholeNote = this.timePerBeat * 4;
                const totalWholeNotes = Math.floor(elapsedTime / timePerWholeNote);
                const wholeNoteInBar = totalWholeNotes % (this.beatsPerBar / 4);
                return {
                    totalNotes: totalWholeNotes,
                    noteInBar: wholeNoteInBar,
                    nextNoteTime: this.getNextWholeNoteTime()
                };
            }
            case 'half': {
                const timePerHalfNote = this.timePerBeat * 2;
                const totalHalfNotes = Math.floor(elapsedTime / timePerHalfNote);
                const halfNoteInBar = totalHalfNotes % (this.beatsPerBar / 2);
                return {
                    totalNotes: totalHalfNotes,
                    noteInBar: halfNoteInBar,
                    nextNoteTime: this.getNextHalfNoteTime()
                };
            }
            case 'quarter': {
                const totalBeats = Math.floor(elapsedTime / this.timePerBeat);
                const beatInBar = totalBeats % this.beatsPerBar;
                return {
                    totalNotes: totalBeats,
                    noteInBar: beatInBar,
                    nextNoteTime: this.getNextBeatTime()
                };
            }
            case 'eighth': {
                const timePerEighthNote = this.timePerBeat / 2;
                const totalEighthNotes = Math.floor(elapsedTime / timePerEighthNote);
                const eighthNoteInBar = totalEighthNotes % (this.beatsPerBar * 2);
                return {
                    totalNotes: totalEighthNotes,
                    noteInBar: eighthNoteInBar,
                    nextNoteTime: this.getNextEighthNoteTime()
                };
            }
            case 'sixteenth': {
                const timePerSixteenthNote = this.timePerBeat / 4;
                const totalSixteenthNotes = Math.floor(elapsedTime / timePerSixteenthNote);
                const sixteenthNoteInBar = totalSixteenthNotes % (this.beatsPerBar * 4);
                return {
                    totalNotes: totalSixteenthNotes,
                    noteInBar: sixteenthNoteInBar,
                    nextNoteTime: this.getNextSixteenthNoteTime()
                };
            }
            default:
                throw new Error(`Unknown note duration: ${noteDuration}`);
        }
    }

    // Get the absolute time for a specific note number of any duration
    getTimeForNote(noteNumber, noteDuration = 'quarter')
    {
        switch (noteDuration) {
            case 'whole':
                return this.referenceTime + (noteNumber * this.timePerBeat * 4);
            case 'half':
                return this.referenceTime + (noteNumber * this.timePerBeat * 2);
            case 'quarter':
                return this.getTimeForBeat(noteNumber);
            case 'eighth':
                return this.referenceTime + (noteNumber * this.timePerBeat / 2);
            case 'sixteenth':
                return this.referenceTime + (noteNumber * this.timePerBeat / 4);
            default:
                throw new Error(`Unknown note duration: ${noteDuration}`);
        }
    }

    scheduleNote(beatNumber, noteNumber, time)
    {
        // console.log(`Scheduling note: beat ${beatNumber}, note ${noteNumber}, time ${time}`);
        // push the note on the queue, even if we're not playing.
        this.notesInQueue.push({ note: beatNumber, time: time });
    
        // create an oscillator
        const osc = this.audioContext.createOscillator();
        const envelope = this.audioContext.createGain();
        
        osc.frequency.value = 800;
        if ((beatNumber % this.beatsPerBar == 0) && noteNumber == 0) 
            osc.frequency.value = 800;
        else if (noteNumber != 0)
            osc.frequency.value = 800;
        else
            osc.frequency.value=800;
        envelope.gain.value = 1;
        
        // Get volume control value
        const volumeControl = document.querySelector('#volume-control');
        const volume = volumeControl ? volumeControl.value : 0.5;
        
        envelope.gain.exponentialRampToValueAtTime(volume, time + 0.001);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.02);


        osc.connect(envelope);
        envelope.connect(this.audioContext.destination);

                

        osc.start(time);
        osc.stop(time + 0.03);
    }


    scheduler()
    {
        if (!this.audioContext) return;
        
        const currentTime = this.getCurrentTime();
        const lookAheadTime = currentTime + this.scheduleAheadTime;
        
        // Get the next beat time using the existing getNextNoteTime method
        const nextBeatTime = this.getNextNoteTime('quarter');
        const nextBeatTimeAudio = this.performanceTimeToAudioTime(nextBeatTime);
        
        // console.log(`Current time: ${currentTime}, Next beat time: ${nextBeatTimeAudio}`);
        
        // Calculate which beats need to be scheduled within the lookahead window
        const elapsedTime = currentTime - this.referenceTime;
        const lookAheadElapsedTime = lookAheadTime - this.referenceTime;
        
        const currentBeatNumber = Math.floor(elapsedTime / this.timePerBeat);
        const lookAheadBeatNumber = Math.floor(lookAheadElapsedTime / this.timePerBeat);
        
        // Schedule any beats in the lookahead window that haven't been scheduled yet
        for (let beatNumber = Math.max(this.totalBeatsPlayed, currentBeatNumber); beatNumber <= lookAheadBeatNumber; beatNumber++) {
            // Use getTimeForBeat which is the underlying method that getNextNoteTime uses
            const beatTimePerformance = this.getTimeForBeat(beatNumber);
            const beatTimeAudio = this.performanceTimeToAudioTime(beatTimePerformance);
            const beatInBar = beatNumber % this.beatsPerBar;
            
            // Only schedule if the beat time is in the future (in audio context time)
            if (beatTimeAudio >= this.audioContext.currentTime) {
                if(beatTimeAudio - this.performanceTimeToAudioTime(this.referenceTime) < 0.1)
                    continue;
                console.log('Scheduling beat at ', beatTimeAudio)
                this.scheduleNote(beatInBar, 0, beatTimeAudio);
            }
        }
        
        // Update the total beats scheduled
        this.totalBeatsPlayed = Math.max(this.totalBeatsPlayed, lookAheadBeatNumber + 1);
        
        // Update current beat in bar for external reference using getCurrentNoteInfo
        const currentNoteInfo = this.getCurrentNoteInfo('quarter');
        this.currentBeatInBar = currentNoteInfo.noteInBar;
    }

    start()
    {
        console.log("Starting metronome at tempo:", this.tempo);
        if (this.isRunning) return;

        if (this.audioContext == null)
        {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        this.isRunning = true;
        
        // Update the audio context offset when starting
        this.updateAudioContextOffset();

        this.intervalID = setInterval(() => this.scheduler(), this.lookahead);
    }

    stop()
    {
        console.log("Stopping metronome");
        this.isRunning = false;

        clearInterval(this.intervalID);
    }

}

/**
 * SYNCHRONIZATION FIX NOTES:
 * 
 * The original issue was that the metronome would reset its reference time
 * whenever start() was called, including after tempo changes. This meant
 * the first beat after starting would be aligned to the button press time
 * rather than the absolute time reference.
 * 
 * SOLUTION:
 * 1. Added initializeReferenceTime() - only sets reference time if it's not already set
 * 2. Modified setTempo() - no longer resets reference time, maintains sync
 * 3. Updated BPM slider handler - changes tempo without stopping/restarting
 * 4. Improved scheduler() - uses absolute time calculations for beat scheduling
 * 
 * This ensures that beats are always aligned to the original absolute timeline,
 * providing consistent synchronization regardless of when start/stop/tempo changes occur.
 */

// Create and export metronome instance
const bpmSlider = document.querySelector('#bpmSlider');
const initialBPM = bpmSlider ? Number(bpmSlider.value) : 120;
export const metronome = new Metronome(initialBPM);


var el = document.getElementsByClassName('metronome');
Array.from(el).forEach((e) =>{
e.style.animationDuration = 60/initialBPM*2 + 's';
//   e.style.animationName = 'none';
void(e.offsetHeight); /* trigger reflow */
//   e.style.animationName = null; 
})


// Export the reset function for external use
export { reset };

bpmSlider.addEventListener('input', function() {
    var bpm = Number(this.value)
    document.getElementById("bpmText").innerHTML = bpm;

    var el = document.getElementsByClassName('metronome');
    Array.from(el).forEach((e) =>{
        e.style.animationDuration = 60/bpm*2 + 's';
    //   e.style.animationName = 'none';
      void(e.offsetHeight); /* trigger reflow */
    //   e.style.animationName = null; 
    })

    var isRunning = metronome.isRunning;
    metronome.forceResetReferenceTime();
    
    // Update tempo without stopping/restarting to maintain synchronization
    metronome.setTempo(bpm);
    
    // Only reset visual animations, not the metronome timing
    reset();

    // animations.forEach(animation => {
    //     const running = getComputedStyle(animation).getPropertyValue("--animps") || 'running';
    //     animation.style.setProperty('--animdur', 1 / bpm);
    //   })

    // console.log(bpm)
    // attackTime = Number(this.value);
});

// $('#metronomeModeSelect').on('change', function (e) {
//     var currentValue = $(this).val();

//     metronome.stop();
//     reset()
//     // metronome.tempo = bpm;
//     metronome.start();
//     metronome.currentBeatInBar = 0;
//     metronome.currentNoteInBeat = 0;
// });

// $('#metronomeLengthSelect').on('change', function (e) {
//     var currentValue = $(this).val();

//     // metronome.stop();
//     // reset()
//     // metronome.tempo = bpm;
//     // metronome.start();

//     if(currentValue == '8'){
//         metronome.beatsPerBar = -1
//         metronome.currentBeatInBar = 0;
//         metronome.currentNoteInBeat = 0;
//     }else{
//         metronome.beatsPerBar = Number(currentValue) + 1
//         if(metronome.currentBeatInBar > metronome.beatsPerBar)
//             metronome.currentBeatInBar = metronome.beatsPerBar - 1;
//         // metronome.currentBeatInBar = 0;
//         // metronome.currentNoteInBeat = 0;

//     }
//     // metronome.currentBeatInBar = 0;
//     // metronome.currentNoteInBeat = 0;
// });

$('#metronomeSoundCheckBox').on('change', function (e) {
    if($('#metronomeSoundCheckBox')[0].checked){
        // reset()
        metronome.setTempo(Number(bpmSlider.value));
        // Force reset reference time when explicitly starting the sound
        // metronome.forceResetReferenceTime();
        metronome.start();
    }else{
        metronome.stop();
    }
});


metronome.initializeReferenceTime();

/*
USAGE EXAMPLES FOR NEW NOTE DURATION FUNCTIONS:

// Get next time for different note durations
const nextQuarterTime = metronome.getNextBeatTime();
const nextHalfTime = metronome.getNextHalfNoteTime();
const nextWholeTime = metronome.getNextWholeNoteTime();
const nextEighthTime = metronome.getNextEighthNoteTime();
const nextSixteenthTime = metronome.getNextSixteenthNoteTime();

// Use alignToNextBeat parameter for longer/shorter notes
const nextHalfAligned = metronome.getNextHalfNoteTime(true);  // Aligns to next quarter beat first
const nextEighthDirect = metronome.getNextEighthNoteTime(false); // Direct eighth note grid

// Generic function usage
const nextTime = metronome.getNextNoteTime('eighth', false);

// Get current position info
const quarterInfo = metronome.getCurrentNoteInfo('quarter');
// Returns: { totalNotes, noteInBar, nextNoteTime }

const eighthInfo = metronome.getCurrentNoteInfo('eighth');
// For 4/4 time: noteInBar will be 0-7 (8 eighth notes per bar)

// Get absolute time for specific note numbers
const beat10Time = metronome.getTimeForNote(10, 'quarter');
const eighth5Time = metronome.getTimeForNote(5, 'eighth');
*/