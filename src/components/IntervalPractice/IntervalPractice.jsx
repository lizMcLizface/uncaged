import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Knob from '../Knob';
import KnobGrid from '../KnobGrid';
import Module from '../Module';
import Select from '../Select';
import { noteToMidi, noteToName } from '../../midi';

import {
    IntervalGridContainer,
    IntervalCell,
    IntervalHeaderCell,
    IntervalGuessButton,
    IntervalControlsContainer,
    IntervalMainContent,
    IntervalContainer,
    IntervalTitle,
    IntervalInstructions,
    GuessSection,
    GuessButtonsContainer,
    GuessActionsContainer,
    SelectedDisplay,
    StatusDisplay,
    GuessDisplay,
    ActionButton,
    IntervalGuideContainer,
    GuideSection,
    GuideTitle,
    GuideText,
    GuideKeyboard,
    GuideList,
    GuideCode
} from './IntervalPractice.styled';
// Import MicrotonalModule from PolySynth
import { MicrotonalModule } from '../PolySynth/PolySynth.styled';
import { intervalToSemitones, midiToNote } from '../../intervals';


let practiceSettingsGlobal = {
    tries: 3,
    relistens: 2,
    infiniteRelistens: false,
    noteDuration: 0.5,     // Duration of each note in seconds
    noteDelay: 0.3,        // Delay between notes in seconds
    noteCount: 2,          // Number of notes to play (1=root only, 2=root+interval, 3=root+interval+root)
    volume: 50,            // Volume percentage
    simultaneousPlay: false, // Play notes simultaneously vs sequentially
    allowDuplicates: false,   // Allow duplicate notes
    baseOctave: 4,             // Base octave (1-6, default 4)
    preselectRoot: false       // Automatically preselect the root note in guesses
}

const BASE_CLASS_NAME = 'IntervalPractice';

const IntervalPractice = ({ className }) => {
    // Define chromatic scale notes and intervals for the 12x12 grid
    const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const intervals = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4/d5', 'P5', 'm6', 'M6', 'm7', 'M7'];

    // State for practice configuration
    const [practiceSettings, setPracticeSettings] = useState({
        tries: 3,
        relistens: 2,
        infiniteRelistens: false,
        noteDuration: 0.5,     // Duration of each note in seconds
        noteDelay: 0.3,        // Delay between notes in seconds
        noteCount: 2,          // Number of notes to play (1=root only, 2=root+interval, 3=root+interval+root)
        volume: 50,            // Volume percentage
        simultaneousPlay: false, // Play notes simultaneously vs sequentially
        allowDuplicates: false,   // Allow duplicate notes
        baseOctave: 4,             // Base octave (1-6, default 4)
        preselectRoot: false       // Automatically preselect the root note in guesses
    });

    // State for selected intervals - default to all C intervals
    const [selectedIntervals, setSelectedIntervals] = useState(new Set([
        'C-P1', 'C-m2', 'C-M2', 'C-m3', 'C-M3', 'C-P4', 
        'C-A4/d5', 'C-P5', 'C-m6', 'C-M6', 'C-m7', 'C-M7'
    ]));
    
    // State for guess buttons
    const [guessStates, setGuessStates] = useState(
        chromaticNotes.reduce((acc, note) => ({ ...acc, [note]: 0 }), {})
    );

    // State for practice status
    const [practiceStatus, setPracticeStatus] = useState({
        current: null,
        tries: 0,
        relistens: 0,
        stats: { correct: 0, total: 0 }
    });

    // Individual practice state variables
    const [currentPracticeInterval, setCurrentPracticeInterval] = useState(null);
    const [currentRootNote, setCurrentRootNote] = useState(null);
    const [practiceTriesRemaining, setPracticeTriesRemaining] = useState(0);
    const [practiceRelistensRemaining, setPracticeRelistensRemaining] = useState(0);
    const [practiceStats, setPracticeStats] = useState({ correct: 0, total: 0 });

    // Status message state
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '', visible: false });

    practiceSettingsGlobal = {
        tries: practiceSettings.tries,
        relistens: practiceSettings.relistens,
        infiniteRelistens: practiceSettings.infiniteRelistens,
        noteDuration: practiceSettings.noteDuration,
        noteDelay: practiceSettings.noteDelay,
        noteCount: practiceSettings.noteCount,
        volume: practiceSettings.volume,
        simultaneousPlay: practiceSettings.simultaneousPlay,
        allowDuplicates: practiceSettings.allowDuplicates,
        baseOctave: practiceSettings.baseOctave,
        preselectRoot: practiceSettings.preselectRoot
    }

    // Get PolySynth reference for microtonal controls
    const getPolySynthRef = () => {
        // Access the global PolySynth reference from index.js
        if (window.polySynthRef) {
            return window.polySynthRef;
        }
        return null;
    };

    // Get current pitch values from PolySynth
    const getPitchValues = () => {
        const polySynth = getPolySynthRef();
        if (polySynth && polySynth.getPitchValues) {
            return polySynth.getPitchValues();
        }
        return {
            pitchC: 1.0,
            pitchCSharp: 1.0,
            pitchD: 1.0,
            pitchDSharp: 1.0,
            pitchE: 1.0,
            pitchF: 1.0,
            pitchFSharp: 1.0,
            pitchG: 1.0,
            pitchGSharp: 1.0,
            pitchA: 1.0,
            pitchASharp: 1.0,
            pitchB: 1.0,
            octaveRatio: 2.0,
            allThemPitches: 1.0
        };
    };

    const [pitchValues, setPitchValues] = useState(getPitchValues());

    // Sync with PolySynth state periodically
    useEffect(() => {
        const syncInterval = setInterval(() => {
            const polySynth = getPolySynthRef();
            if (polySynth && polySynth.getPitchValues) {
                const currentValues = polySynth.getPitchValues();
                // console.log('Syncing pitch values:', currentValues);
                setPitchValues(currentValues);
            }
        }, 100); // Sync every 100ms

        return () => clearInterval(syncInterval);
    }, []);

    // Keyboard input handling for interval practice
    useEffect(() => {
        // Map number row keys to chromatic notes (1-9, 0, -, =)
        const keyToNoteMap = {
            '1': 'C',
            '2': 'C#',
            '3': 'D',
            '4': 'D#',
            '5': 'E',
            '6': 'F',
            '7': 'F#',
            '8': 'G',
            '9': 'G#',
            '0': 'A',
            '-': 'A#',
            '=': 'B'
        };

        const handleKeyDown = (event) => {
            // Only handle keyboard input if the IntervalTab is currently visible
            const intervalTab = document.getElementById('IntervalTab');
            if (!intervalTab || intervalTab.style.display === 'none') {
                return; // Don't handle keyboard shortcuts if not on interval practice page
            }

            // Prevent default behavior to avoid interfering with other inputs
            const targetTagName = event.target.tagName.toLowerCase();
            if (targetTagName === 'input' || targetTagName === 'textarea' || targetTagName === 'select') {
                return; // Don't handle keyboard shortcuts when user is typing in input fields
            }

            const key = event.key;
            
            // Handle number row keys (1-9, 0, -, =) for note selection
            if (keyToNoteMap[key]) {
                event.preventDefault();
                const note = keyToNoteMap[key];
                cycleGuessButtonState(note);
                return;
            }

            // Handle Backspace to clear guess
            if (key === 'Backspace') {
                event.preventDefault();
                clearGuess();
                return;
            }

            // Handle Enter to submit guess
            if (key === 'Enter') {
                event.preventDefault();
                submitGuess();
                return;
            }

            // Handle Spacebar to replay current interval
            if (key === ' ') {
                event.preventDefault();
                replayCurrentInterval();
                return;
            }

            // Handle Tab to play new random interval
            if (key === 'Tab') {
                event.preventDefault();
                playRandomInterval();
                return;
            }
        };

        // Add event listener when component mounts
        document.addEventListener('keydown', handleKeyDown);

        // Clean up event listener when component unmounts
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentPracticeInterval, practiceTriesRemaining, practiceRelistensRemaining, practiceStats, guessStates, currentRootNote]); // Include dependencies that submitGuess uses

    // Status message helper functions
    const showStatus = (text, type = 'info', duration = 3000) => {
        setStatusMessage({ text, type, visible: true });
        
        // Auto-hide after duration
        setTimeout(() => {
            setStatusMessage(prev => ({ ...prev, visible: false }));
        }, duration);
    };

    const hideStatus = () => {
        setStatusMessage(prev => ({ ...prev, visible: false }));
    };

    // Update pitch value and sync with PolySynth
    const updatePitchValue = (pitchName, value) => {
        // console.log(`Updating ${pitchName} to ${value}`);
        // console.log(`Current pitch values before update:`, pitchValues);
        const polySynth = getPolySynthRef();
        if (polySynth && polySynth.setPitchValues) {
            // Update PolySynth's state
            polySynth.setPitchValues({ [pitchName]: value });
        }
        
        // Update local state for immediate UI feedback
        setPitchValues(prev => ({
            ...prev,
            [pitchName]: value
        }));

    };

    // Reset microtonal pitches to default values
    const resetMicrotonalPitches = () => {
        const polySynth = getPolySynthRef();
        if (polySynth && polySynth.resetMicrotonalPitches) {
            // Reset PolySynth's pitch values
            polySynth.resetMicrotonalPitches();
        }
        
        // Reset local state
        setPitchValues({
            pitchC: 1.0,
            pitchCSharp: 1.0,
            pitchD: 1.0,
            pitchDSharp: 1.0,
            pitchE: 1.0,
            pitchF: 1.0,
            pitchFSharp: 1.0,
            pitchG: 1.0,
            pitchGSharp: 1.0,
            pitchA: 1.0,
            pitchASharp: 1.0,
            pitchB: 1.0,
            octaveRatio: 2.0,
            allThemPitches: 1.0
        });
    };

    // Toggle interval cell selection
    const toggleIntervalCell = (note, interval) => {
        const key = `${note}-${interval}`;
        const newSelected = new Set(selectedIntervals);
        
        if (newSelected.has(key)) {
            newSelected.delete(key);
        } else {
            newSelected.add(key);
        }
        
        setSelectedIntervals(newSelected);
    };

    // Toggle entire row
    const toggleRow = (rowIndex) => {
        const note = chromaticNotes[rowIndex];
        const rowCells = intervals.map(interval => `${note}-${interval}`);
        const allSelected = rowCells.every(key => selectedIntervals.has(key));
        
        const newSelected = new Set(selectedIntervals);
        
        if (allSelected) {
            // Deselect all in row
            rowCells.forEach(key => newSelected.delete(key));
        } else {
            // Select all unselected in row
            rowCells.forEach(key => {
                if (!selectedIntervals.has(key)) {
                    newSelected.add(key);
                }
            });
        }
        
        setSelectedIntervals(newSelected);
    };

    // Toggle entire column
    const toggleColumn = (colIndex) => {
        const interval = intervals[colIndex];
        const columnCells = chromaticNotes.map(note => `${note}-${interval}`);
        const allSelected = columnCells.every(key => selectedIntervals.has(key));
        
        const newSelected = new Set(selectedIntervals);
        
        if (allSelected) {
            // Deselect all in column
            columnCells.forEach(key => newSelected.delete(key));
        } else {
            // Select all unselected in column
            columnCells.forEach(key => {
                if (!selectedIntervals.has(key)) {
                    newSelected.add(key);
                }
            });
        }
        
        setSelectedIntervals(newSelected);
    };

    // Cycle guess button state
    const cycleGuessButtonState = (note) => {
        setGuessStates(prev => ({
            ...prev,
            [note]: (prev[note] + 1) % 3
        }));
    };

    // Clear all guess selections
    const clearGuess = () => {
        if (practiceSettingsGlobal.preselectRoot && currentRootNote) {
            // Keep root note preselected if option is enabled
            setGuessStates(prev => ({
                ...chromaticNotes.reduce((acc, note) => ({ ...acc, [note]: 0 }), {}),
                [currentRootNote]: 1
            }));
        } else {
            // Clear everything
            setGuessStates(chromaticNotes.reduce((acc, note) => ({ ...acc, [note]: 0 }), {}));
        }
    };

    // Select/Clear all intervals
    const selectAllIntervals = () => {
        const allKeys = chromaticNotes.flatMap(note => 
            intervals.map(interval => `${note}-${interval}`)
        );
        setSelectedIntervals(new Set(allKeys));
    };

    const clearAllIntervals = () => {
        setSelectedIntervals(new Set());
    };

    // Play random interval
    const playRandomInterval = () => {
        if (selectedIntervals.size === 0) {
            showStatus('Please select some intervals first!', 'error', 3000);
            return;
        }


        const selectedArray = Array.from(selectedIntervals);
        // const randomKey = selectedArray[Math.floor(Math.random() * selectedArray.length)];
        // let [rootNote, interval] = randomKey.split('-');

        // Initialize practice session
        // const newInterval = { rootNote, interval };
        const newTries = practiceSettingsGlobal.tries;
        const newRelistens = practiceSettingsGlobal.infiniteRelistens ? Infinity : practiceSettingsGlobal.relistens;
        
        setPracticeTriesRemaining(newTries);
        setPracticeRelistensRemaining(newRelistens);

        setPracticeStatus({
            current: null,
            tries: newTries,
            relistens: newRelistens,
            stats: practiceStats
        });

        // console.log(`Playing interval: ${rootNote} + ${interval}`);
        // alert(`Playing: ${rootNote} + ${interval}`);
        // if (interval === 'A4/d5') {
            // interval = 'A4'; // Normalize to A4 for playback
        // }
        
        const polySynth = getPolySynthRef();
        let notesArray = [];
        let rootNoteMidi = 0;
        let firstRootNote = null; // Track the first root note for preselection
        
        for(let n = 0; n < practiceSettingsGlobal.noteCount; n++) {        
            const randomKey = selectedArray[Math.floor(Math.random() * selectedArray.length)];
            let [rootNote, interval] = randomKey.split('-');
            if (interval === 'A4/d5') {
                interval = 'A4'; // Normalize to A4 for playback
            }
            if(n == 0){
                firstRootNote = rootNote; // Store the first root note
                rootNoteMidi = noteToMidi(rootNote + '/' + practiceSettingsGlobal.baseOctave) + 12;
                notesArray.push(noteToName(rootNoteMidi));
                if (practiceSettingsGlobal.noteCount === 1) {
                    // If only root note, skip interval calculation
                    continue;
                }
                let semitoneInterval = intervalToSemitones(interval);
                let targetNoteMidi = rootNoteMidi + semitoneInterval;
                notesArray.push(noteToName(targetNoteMidi));
                console.log(`Playing root note: ${notesArray[0]} and interval: ${notesArray[1]}`);
            }else if (n!= practiceSettingsGlobal.noteCount - 1) {
                let semitoneInterval = intervalToSemitones(interval);
                let targetNoteMidi = rootNoteMidi + semitoneInterval;
                notesArray.push(noteToName(targetNoteMidi));
            }
        }
        console.log(practiceSettingsGlobal);
        
        // let uniqueNotes = notesArray; // Ensure unique notes
        if (!practiceSettingsGlobal.allowDuplicates) {
            let uniqueNotes = [...new Set(notesArray)]; // Ensure unique notes
            console.log(`Unique notes for playback: ${uniqueNotes.join(', ')}`);
            notesArray = uniqueNotes;
        }
        setCurrentPracticeInterval(notesArray);
        setCurrentRootNote(firstRootNote);

        // Preselect root note if option is enabled
        if (practiceSettingsGlobal.preselectRoot && firstRootNote) {
            setGuessStates(prev => ({
                ...chromaticNotes.reduce((acc, note) => ({ ...acc, [note]: 0 }), {}),
                [firstRootNote]: 1
            }));
        } else {
            // Clear guess states if preselect is disabled
            clearGuess();
        }


        // if(practiceSettingsGlobal.noteCount == 1) {
        //     // Play root note only
        //     let rootNoteMidi = noteToMidi(rootNote + '/' + practiceSettingsGlobal.baseOctave) + 12;
        //     notesArray.push(noteToName(rootNoteMidi));
        // } else {
        //     let semitoneInterval = intervalToSemitones(interval);
        //     let rootNoteMidi = noteToMidi(rootNote + '/' + practiceSettingsGlobal.baseOctave) + 12;
        //     let targetNoteMidi = rootNoteMidi + semitoneInterval;
        //     notesArray = [noteToName(rootNoteMidi), noteToName(targetNoteMidi)];
        // }

        for(let i = 0; i < notesArray.length; i++) {
            notesArray[i] = notesArray[i].replace('/', '');
        }

        console.log(`Playing notes: ${notesArray.join(', ')}`);
        console.log(polySynth);

        const duration = practiceSettingsGlobal.noteDuration * 1000; // Convert to milliseconds
        const delay = practiceSettingsGlobal.noteDelay * 1000;
        const volume = practiceSettingsGlobal.volume;

        if (practiceSettingsGlobal.simultaneousPlay) {
            polySynth.playNotes(notesArray, volume, duration);
        } else {
            // Play notes sequentially

            // Play each note with delay
            notesArray.forEach((note, index) => {
                setTimeout(() => {
                    // console.log(`Playing note: ${note} at index ${index}, delay: ${index * delay}ms. Volume: ${volume}, Duration: ${duration}ms`);
                    polySynth.playNotes([note], volume, duration);
                }, index * (delay + duration));
            });
        }

    };

    // Replay current interval
    const replayCurrentInterval = () => {
        if (!currentPracticeInterval) {
            showStatus('No interval is currently being practiced. Click "Play Random Interval" first!', 'error', 3000);
            return;
        }

        if (practiceRelistensRemaining <= 0) {
            showStatus('No relistens remaining for this interval!', 'error', 3000);
            return;
        }

        if (practiceRelistensRemaining !== Infinity) {
            const newRelistens = practiceRelistensRemaining - 1;
            setPracticeRelistensRemaining(newRelistens);
            setPracticeStatus(prev => ({
                ...prev,
                relistens: newRelistens
            }));
        }

        let notesArray = currentPracticeInterval;
        console.log(`Replaying interval: ${notesArray.join(' + ')}`);

        // // Use the same playback logic as playRandomInterval
        // let semitoneInterval = intervalToSemitones(interval);
        const polySynth = getPolySynthRef();
        // let rootNoteMidi = noteToMidi(rootNote + '/' + practiceSettingsGlobal.baseOctave) + 12;
        // let targetNoteMidi = rootNoteMidi + semitoneInterval;
        // let notesArray = [noteToName(rootNoteMidi), noteToName(targetNoteMidi)];

        for(let i = 0; i < notesArray.length; i++) {
            notesArray[i] = notesArray[i].replace('/', '');
        }

        const duration = practiceSettingsGlobal.noteDuration * 1000; // Convert to milliseconds
        const delay = practiceSettingsGlobal.noteDelay * 1000;
        const volume = practiceSettingsGlobal.volume;
        if (practiceSettingsGlobal.simultaneousPlay) {
            polySynth.playNotes(notesArray, volume, duration);
        } else {
            // Play notes sequentially

            // Play each note with delay
            notesArray.forEach((note, index) => {
                setTimeout(() => {
                    // console.log(`Playing note: ${note} at index ${index}, delay: ${index * delay}ms. Volume: ${volume}, Duration: ${duration}ms`);
                    polySynth.playNotes([note], volume, duration);
                }, index * (delay + duration));
            });
        }
    };

    // Skip to next interval
    const skipToNextInterval = () => {
        if (!currentPracticeInterval) {
            showStatus('No interval is currently being practiced. Click "Play Random Interval" first!', 'error', 3000);
            return;
        }

        setPracticeStats(prev => ({ ...prev, total: prev.total + 1 }));
        showStatus('Skipped to next interval', 'info', 2000);
        playRandomInterval();
    };

    // Submit guess
    const submitGuess = () => {
        if (!currentPracticeInterval) {
            showStatus('No interval is currently being practiced!', 'error', 3000);
            return;
        }

        if (practiceTriesRemaining <= 0) {
            showStatus('No tries remaining for this interval!', 'error', 3000);
            return;
        }

        // Get the current guess
        const guessedNotes = [];
        Object.entries(guessStates).forEach(([note, state]) => {
            for (let i = 0; i < state; i++) {
                guessedNotes.push(note);
            }
        });

        if (guessedNotes.length === 0) {
            showStatus('Please select at least one note for your guess!', 'error', 3000);
            return;
        }

        // Calculate correct answer (simplified)
        const noteArray = currentPracticeInterval;
        let correctAnswer = [];
        noteArray.forEach(note => {
            correctAnswer.push(note.replace(/[0-9]/g, ''));
        });
        // const correctAnswer = calculateIntervalNotes(rootNote, interval);
        const isCorrect = arraysEqual(guessedNotes.sort(), correctAnswer.sort());

        const newTries = practiceTriesRemaining - 1;
        setPracticeTriesRemaining(newTries);
        console.log(`Tries remaining: ${newTries}`);
        console.log(`Guessed notes: ${guessedNotes.join(', ')}`);
        console.log(`Correct answer: ${correctAnswer.join(', ')}`);

        let newStats;
        if (isCorrect) {
            newStats = { correct: practiceStats.correct + 1, total: practiceStats.total + 1 };
            setPracticeStats(newStats);
            showStatus(`🎉 Correct! The notes were: ${correctAnswer.join(', ')}`, 'success', 3000);
            clearGuess();
            setTimeout(() => playRandomInterval(), 1000);
        } else {
            if (newTries > 0) {
                showStatus(`❌ Incorrect. ${newTries} tries remaining. Try again!`, 'error', 3000);
                clearGuess();
                newStats = practiceStats; // Keep current stats for ongoing interval
            } else {
                newStats = { correct: practiceStats.correct, total: practiceStats.total + 1 };
                setPracticeStats(newStats);
                showStatus(`💔 Out of tries! The correct answer was: ${correctAnswer.join(', ')}`, 'error', 4000);
                clearGuess();
                setTimeout(() => playRandomInterval(), 1000);
            }
        }

        setPracticeStatus({
            current: currentPracticeInterval,
            tries: newTries,
            relistens: practiceRelistensRemaining,
            stats: newStats
        });
    };

    // Helper functions
    const calculateIntervalNotes = (rootNote, interval) => {
        const chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootIndex = chromaticNotes.indexOf(rootNote);
        
        const intervalSemitones = {
            'P1': 0, 'm2': 1, 'M2': 2, 'm3': 3, 'M3': 4, 'P4': 5,
            'A4/d5': 6, 'P5': 7, 'm6': 8, 'M6': 9, 'm7': 10, 'M7': 11
        };
        
        const semitones = intervalSemitones[interval];
        if (semitones === undefined) return [rootNote];
        
        const targetIndex = (rootIndex + semitones) % 12;
        const targetNote = chromaticNotes[targetIndex];
        
        if (interval === 'P1') {
            return [rootNote, rootNote];
        }
        
        return [rootNote, targetNote];
    };

    const arraysEqual = (arr1, arr2) => {
        if (arr1.length !== arr2.length) return false;
        return arr1.every((val, index) => val === arr2[index]);
    };

    // Get current guess display
    const getCurrentGuess = () => {
        const selectedNotes = [];
        Object.entries(guessStates).forEach(([note, state]) => {
            if (state === 1) {
                selectedNotes.push(note);
            } else if (state === 2) {
                selectedNotes.push(note + ' (×2)');
            }
        });
        
        return selectedNotes.length === 0 ? 'No notes selected' : selectedNotes.join(', ');
    };

    return (
        <IntervalContainer className={`${BASE_CLASS_NAME} ${className}`.trim()}>
            {/* <IntervalTitle>Interval Listening Practice</IntervalTitle>
            <IntervalInstructions>
                Select root notes (rows) and intervals (columns) to practice. Click a cell to toggle it on/off.
                <br />
                <strong>Keyboard shortcuts:</strong> Number row (1-9,0,-,=) = C-B notes, Backspace = clear guess, Enter = submit guess, Space = replay, Tab = new interval
            </IntervalInstructions> */}

            <IntervalMainContent>
                {/* Interval Selection Grid */}
                <Module label="Interval Selection">
                    <IntervalGridContainer>
                        {/* Corner cell */}
                        <IntervalHeaderCell />
                        
                        {/* Column headers */}
                        {intervals.map((interval, colIndex) => (
                            <IntervalHeaderCell 
                                key={interval} 
                                clickable
                                onClick={() => toggleColumn(colIndex)}
                            >
                                {interval}
                            </IntervalHeaderCell>
                        ))}
                        
                        {/* Rows */}
                        {chromaticNotes.map((note, rowIndex) => (
                            <React.Fragment key={note}>
                                {/* Row header */}
                                <IntervalHeaderCell 
                                    clickable
                                    onClick={() => toggleRow(rowIndex)}
                                >
                                    {note}
                                </IntervalHeaderCell>
                                
                                {/* Interval cells */}
                                {intervals.map((interval, colIndex) => {
                                    const key = `${note}-${interval}`;
                                    const isSelected = selectedIntervals.has(key);
                                    
                                    return (
                                        <IntervalCell
                                            key={key}
                                            selected={isSelected}
                                            onClick={() => toggleIntervalCell(note, interval)}
                                        >
                                        </IntervalCell>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </IntervalGridContainer>
                </Module>

                {/* Practice Configuration */}
                <Module label="Practice Settings">
                    <KnobGrid columns={3} rows={5}>
                        <Knob
                            label="Tries"
                            value={practiceSettings.tries}
                            modifier={11}
                            offset={1}
                            resetValue={3}
                            isRounded
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, tries: val }))}
                        />
                        <Knob
                            label="Relistens"
                            value={practiceSettings.relistens}
                            modifier={6}
                            offset={0}
                            resetValue={2}
                            isRounded
                            disabled={practiceSettings.infiniteRelistens}
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, relistens: val }))}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Infinite</label>
                            <input
                                type="checkbox"
                                checked={practiceSettings.infiniteRelistens}
                                onChange={(e) => setPracticeSettings(prev => ({ 
                                    ...prev, 
                                    infiniteRelistens: e.target.checked 
                                }))}
                                style={{ width: '16px', height: '16px' }}
                            />
                        </div>
                        
                        <Knob
                            label="Note Duration (s)"
                            value={practiceSettings.noteDuration}
                            modifier={2.0}
                            offset={0.1}
                            resetValue={0.5}
                            decimalPlaces={1}
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, noteDuration: val }))}
                        />
                        <Knob
                            label="Note Delay (s)"
                            value={practiceSettings.noteDelay}
                            modifier={1.0}
                            offset={0.0}
                            resetValue={0.3}
                            decimalPlaces={1}
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, noteDelay: val }))}
                        />
                        <Knob
                            label="Volume (%)"
                            value={practiceSettings.volume}
                            modifier={100}
                            offset={0}
                            resetValue={50}
                            isRounded
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, volume: val }))}
                        />
                        
                        <Knob
                            label="Note Count"
                            value={practiceSettings.noteCount}
                            modifier={2}
                            offset={1}
                            resetValue={2}
                            isRounded
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, noteCount: val }))}
                        />
                        <Knob
                            label="Base Octave"
                            value={practiceSettings.baseOctave}
                            modifier={5}
                            offset={1}
                            resetValue={4}
                            isRounded
                            onUpdate={(val) => setPracticeSettings(prev => ({ ...prev, baseOctave: val }))}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Simultaneous</label>
                            <input
                                type="checkbox"
                                checked={practiceSettings.simultaneousPlay}
                                onChange={(e) => setPracticeSettings(prev => ({ 
                                    ...prev, 
                                    simultaneousPlay: e.target.checked 
                                }))}
                                style={{ width: '16px', height: '16px' }}
                            />
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Root First</label>
                            <input
                                type="checkbox"
                                checked={practiceSettings.rootFirst}
                                disabled={practiceSettings.simultaneousPlay}
                                onChange={(e) => setPracticeSettings(prev => ({ 
                                    ...prev, 
                                    rootFirst: e.target.checked 
                                }))}
                                style={{ width: '16px', height: '16px', opacity: practiceSettings.simultaneousPlay ? 0.5 : 1 }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Allow Duplicates</label>
                            <input
                                type="checkbox"
                                checked={practiceSettings.allowDuplicates}
                                onChange={(e) => setPracticeSettings(prev => ({ 
                                    ...prev, 
                                    allowDuplicates: e.target.checked 
                                }))}
                                style={{ width: '16px', height: '16px', opacity: practiceSettings.simultaneousPlay ? 0.5 : 1 }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Preselect Root</label>
                            <input
                                type="checkbox"
                                checked={practiceSettings.preselectRoot}
                                onChange={(e) => setPracticeSettings(prev => ({ 
                                    ...prev, 
                                    preselectRoot: e.target.checked 
                                }))}
                                style={{ width: '16px', height: '16px' }}
                            />
                        </div>
                    </KnobGrid>
                </Module>

            {/* Guess Section */}
            <GuessSection>
                <Module label="Make Your Guess">
                    <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '12px', color: '#666' }}>
                        <div style={{ marginBottom: '8px' }}>
                            <strong>Listen carefully and select the notes you hear!</strong>
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                            Click notes to cycle colors: <span style={{color: '#666'}}>Gray (off)</span> → <span style={{color: '#4CAF50'}}>Green (1×)</span> → <span style={{color: '#2196F3'}}>Blue (2×)</span> → Gray
                        </div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>
                            <strong>Quick Keys:</strong> 1=C, 2=C#, 3=D, 4=D#, 5=E, 6=F, 7=F#, 8=G, 9=G#, 0=A, -=A#, ==B
                            <br />
                            <strong>Actions:</strong> Backspace=Clear | Enter=Submit | Space=Replay | Tab=New Interval
                        </div>
                    </div>
                    
                    <GuessButtonsContainer>
                        {chromaticNotes.map(note => (
                            <IntervalGuessButton
                                key={note}
                                state={guessStates[note]}
                                onClick={() => cycleGuessButtonState(note)}
                            >
                                {note}
                            </IntervalGuessButton>
                        ))}
                    </GuessButtonsContainer>
                    
                    <GuessActionsContainer>
                        <ActionButton primary onClick={submitGuess}>✓ Submit Guess</ActionButton>
                        <ActionButton onClick={clearGuess}>✗ Clear Guess</ActionButton>
                    </GuessActionsContainer>
                    
                    <GuessDisplay>
                        <strong>Your guess:</strong> {getCurrentGuess()}
                    </GuessDisplay>
                </Module>
            <IntervalControlsContainer>
                <ActionButton onClick={selectAllIntervals}>Select All</ActionButton>
                <ActionButton onClick={clearAllIntervals}>Clear All</ActionButton>
                <ActionButton primary onClick={playRandomInterval}>Play Random Interval</ActionButton>
                <ActionButton onClick={replayCurrentInterval}>🔊 Replay</ActionButton>
                <ActionButton onClick={skipToNextInterval}>⏭️ Skip</ActionButton>
            </IntervalControlsContainer>
            
            {/* Status Displays */}
            <SelectedDisplay>
                <strong>Selected Intervals ({selectedIntervals.size}):</strong><br />

            </SelectedDisplay>

            {/* Practice Status Display */}
            {statusMessage.visible && (
                <StatusDisplay status={statusMessage.type} visible={statusMessage.visible}>
                    {statusMessage.text}
                </StatusDisplay>
            )}

            {/* Practice Progress Display */}
            {(currentPracticeInterval || practiceStats.total > 0) && (
                <StatusDisplay status="info" visible={true}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span>
                            <strong>Status:</strong> {currentPracticeInterval ? 
                                // `Playing ${currentPracticeInterval.map(note => note.replace(/[0-9]/g, '')).join(' + ')}` : 
                                `No Hints\t`: 
                                'Ready for next interval'}
                        </span>
                        <span>
                            <strong>Score:</strong> {practiceStats.correct}/{practiceStats.total} 
                            {practiceStats.total > 0 && ` (${Math.round((practiceStats.correct / practiceStats.total) * 100)}%)`}
                        </span>
                    </div>
                    {currentPracticeInterval && (
                        <div style={{ marginTop: '5px', fontSize: '11px', opacity: 0.8 }}>
                            <strong>Tries:</strong> {practiceTriesRemaining} remaining | 
                            <strong> Relistens:</strong> {practiceRelistensRemaining === Infinity ? '∞' : practiceRelistensRemaining} remaining
                        </div>
                    )}
                </StatusDisplay>
            )}
            </GuessSection>
                {/* User Guide */}
                <IntervalGuideContainer>
                    <GuideSection>
                        <GuideTitle>🎵 How to Use Interval Practice</GuideTitle>
                        <GuideText>
                            This tool helps you train your ear to recognize musical intervals through listening exercises.
                        </GuideText>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>📋 Step-by-Step Guide</GuideTitle>
                        <GuideList>
                            <li><strong>1. Select Intervals:</strong> Click cells in the grid to choose which intervals to practice</li>
                            <li><strong>2. Configure Settings:</strong> Adjust tries, volume, note duration, etc.</li>
                            <li><strong>3. Start Practice:</strong> Click "Play Random Interval" to begin</li>
                            <li><strong>4. Make Guess:</strong> Click notes you think you heard</li>
                            <li><strong>5. Submit:</strong> Press "Submit Guess" or <GuideCode>Enter</GuideCode></li>
                        </GuideList>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>🎹 Piano Keyboard Input</GuideTitle>
                        <GuideText>Use your computer keyboard to play notes:</GuideText>
                        <GuideKeyboard>
White Keys (Home Row):
A S D F G H J K L ; '
C D E F G A B C D E F

Black Keys (Row Above):
W E   T Y U   O P
C# D#  F# G# A#  C# D#
                        </GuideKeyboard>
                        <GuideList>
                            <li><GuideCode>Z</GuideCode> / <GuideCode>X</GuideCode> - Change octave down/up</li>
                            <li><GuideCode>Shift</GuideCode> - Transpose octave up/down</li>
                            <li><GuideCode>Alt</GuideCode> - Transpose 2 octaves up/down</li>
                        </GuideList>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>🎯 Interval Selection Grid</GuideTitle>
                        <GuideList>
                            <li><strong>Rows:</strong> Root notes (C through B)</li>
                            <li><strong>Columns:</strong> Interval types (P1=unison, M2=major 2nd, etc.)</li>
                            <li><strong>Click cell:</strong> Toggle interval on/off</li>
                            <li><strong>Click row/column header:</strong> Select/deselect entire row/column</li>
                            <li><strong>Green cells:</strong> Selected for practice</li>
                        </GuideList>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>⚙️ Practice Settings</GuideTitle>
                        <GuideList>
                            <li><strong>Tries:</strong> How many guesses per interval</li>
                            <li><strong>Relistens:</strong> How many times you can replay</li>
                            <li><strong>Note Duration:</strong> How long each note plays</li>
                            <li><strong>Note Delay:</strong> Gap between sequential notes</li>
                            <li><strong>Volume:</strong> Playback volume (0-100%)</li>
                            <li><strong>Note Count:</strong> Number of notes to play</li>
                            <li><strong>Base Octave:</strong> Starting octave (1-6)</li>
                            <li><strong>Simultaneous:</strong> Play notes together vs. in sequence</li>
                            <li><strong>Allow Duplicates:</strong> Permit repeated notes</li>
                            <li><strong>Preselect Root:</strong> Auto-select root note in guesses</li>
                        </GuideList>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>🎮 Guess Controls</GuideTitle>
                        <GuideText>
                            Click note buttons to build your guess. Buttons cycle through:
                        </GuideText>
                        <GuideList>
                            <li><strong>Gray:</strong> Note not selected</li>
                            <li><strong>Green:</strong> Note selected once</li>
                            <li><strong>Blue:</strong> Note selected twice (for duplicates)</li>
                        </GuideList>
                        <GuideText><strong>Keyboard Shortcuts for Guessing:</strong></GuideText>
                        <GuideList>
                            <li><GuideCode>1-9, 0, -, =</GuideCode> - Select notes C through B</li>
                            <li><GuideCode>Backspace</GuideCode> - Clear all selections</li>
                            <li><GuideCode>Enter</GuideCode> - Submit your guess</li>
                            <li><GuideCode>Space</GuideCode> - Replay current interval</li>
                            <li><GuideCode>Tab</GuideCode> - Play new random interval</li>
                        </GuideList>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>🎨 Microtonal Controls</GuideTitle>
                        <GuideText>
                            Adjust individual note pitches for microtonal exploration:
                        </GuideText>
                        <GuideList>
                            <li><strong>Individual Knobs:</strong> Fine-tune each note's pitch</li>
                            <li><strong>Octave Ratio:</strong> Change the octave size (default 2.0)</li>
                            <li><strong>All Them Pitches:</strong> Global pitch multiplier</li>
                            <li><strong>Reset All:</strong> Return to standard 12-tone equal temperament</li>
                        </GuideList>
                    </GuideSection>

                    <GuideSection>
                        <GuideTitle>💡 Tips for Success</GuideTitle>
                        <GuideList>
                            <li>Start with simple intervals (unison, octave, perfect fifth)</li>
                            <li>Practice one root note at a time initially</li>
                            <li>Use "Simultaneous" mode for harmonic intervals</li>
                            <li>Use sequential mode to hear melodic motion</li>
                            <li>Increase tries/relistens while learning</li>
                            <li>Track your accuracy percentage to monitor progress</li>
                        </GuideList>
                    </GuideSection>
                </IntervalGuideContainer>
            {/* Control Buttons */}

                {/* Microtonal Pitch Control */}
                <MicrotonalModule label="Microtonal">
                    <KnobGrid columns={15} rows={1}>
                        <Knob
                            label="C"
                            value={pitchValues.pitchC}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchC', val)}
                        />
                        <Knob
                            label="C#"
                            value={pitchValues.pitchCSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchCSharp', val)}
                        />
                        <Knob
                            label="D"
                            value={pitchValues.pitchD}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchD', val)}
                        />
                        <Knob
                            label="D#"
                            value={pitchValues.pitchDSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchDSharp', val)}
                        />
                        <Knob
                            label="E"
                            value={pitchValues.pitchE}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchE', val)}
                        />
                        <Knob
                            label="F"
                            value={pitchValues.pitchF}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchF', val)}
                        />
                        <Knob
                            label="F#"
                            value={pitchValues.pitchFSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchFSharp', val)}
                        />
                        <Knob
                            label="G"
                            value={pitchValues.pitchG}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchG', val)}
                        />
                        <Knob
                            label="G#"
                            value={pitchValues.pitchGSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchGSharp', val)}
                        />
                        <Knob
                            label="A"
                            value={pitchValues.pitchA}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchA', val)}
                        />
                        <Knob
                            label="A#"
                            value={pitchValues.pitchASharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchASharp', val)}
                        />
                        <Knob
                            label="B"
                            value={pitchValues.pitchB}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('pitchB', val)}
                        />
                        <Knob
                            label="Octave Ratio"
                            value={pitchValues.octaveRatio}
                            modifier={2.0}
                            offset={1.0}
                            resetValue={2.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('octaveRatio', val)}
                        />
                        <Knob
                            label="All Them Pitches"
                            value={pitchValues.allThemPitches}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => updatePitchValue('allThemPitches', val)}
                        />
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            <button 
                                onClick={resetMicrotonalPitches}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: '1px solid #666',
                                    borderRadius: '4px',
                                    background: '#333',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#555'}
                                onMouseOut={(e) => e.target.style.background = '#333'}
                            >
                                Reset All
                            </button>
                        </div>
                    </KnobGrid>
                </MicrotonalModule>

            </IntervalMainContent>

        </IntervalContainer>
    );
};

IntervalPractice.propTypes = {
    className: PropTypes.string,
};

IntervalPractice.defaultProps = {
    className: '',
};

export default IntervalPractice;
