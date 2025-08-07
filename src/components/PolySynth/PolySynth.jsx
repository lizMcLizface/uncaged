import React, { useLayoutEffect, useEffect, useState, useRef, useImperativeHandle } from 'react';
import PropTypes from 'prop-types';
import * as Nodes from '../../nodes';
import MonoSynth from './../MonoSynth';
import Knob from './../Knob';
import KnobGrid from './../KnobGrid';
import Module from './../Module';
import PeakMeter from './../PeakMeter';
import Oscilloscope from './../Oscilloscope';
import Spectrogram from './../Spectrogram';
import SpectrumAnalyzer from './../SpectrumAnalyzer';
import Select from './../Select';
import presetData from '../../util/presetData';
import { getNoteInfo, WAVEFORM, FILTER, REVERB, ENVELOPE_SHAPE, NOISE } from '../../util/util';
import { THEMES } from '../../styles/themes';
import { metronome } from '../../metronome';

import {
    ModuleGridContainer,
    InfoModule,
    InfoContainer,
    InfoSelect,
    PrimaryText,
    PopText,
    Tag,
    Lines,
    MicrotonalModule,
} from './PolySynth.styled';


// Arpeggiator mode SVG icons
const ARPEGGIATOR_MODES = {
    chord: 'M 12 15 L 12 35 M 20 15 L 20 35 M 28 15 L 28 35 M 36 15 L 36 35', // All notes at once (vertical lines)
    up: 'M 12 35 L 20 28 L 28 21 L 36 14 M 32 18 L 36 14 L 32 10', // Arrow going up
    down: 'M 12 14 L 20 21 L 28 28 L 36 35 M 32 31 L 36 35 L 32 39', // Arrow going down
    upDown: 'M 12 35 L 20 21 L 28 14 L 36 21 M 32 17 L 36 21 L 32 25', // Up then down pattern
    downUp: 'M 12 14 L 20 28 L 28 35 L 36 28 M 32 32 L 36 28 L 32 24', // Down then up pattern
    random: 'M 12 30 L 16 15 L 20 35 L 24 20 L 28 25 L 32 10 L 36 32' // Random zigzag pattern
};


const BASE_CLASS_NAME = 'PolySynth';

// Helper functions to convert between integer knob values and duration strings
const integerToDurationString = (intValue) => {
    const durationMap = {
        '-2': 'sixteenth',
        '-1': 'eighth',
        '0': 'quarter',
        '1': 'half',
        '2': 'whole'
    };
    return durationMap[intValue.toString()] || 'quarter';
};

const durationStringToInteger = (durationString) => {
    const integerMap = {
        'sixteenth': -2,
        'eighth': -1,
        'quarter': 0,
        'half': 1,
        'whole': 2
    };
    return integerMap[durationString] || 0;
};

const AC = new AudioContext();
const polyphony = 8;
const synthArr = Array(polyphony).fill(0).map(_ => new MonoSynth(AC));
let synthPos = 0;

let polyphonyGlobal = 8;
// let portamentoSpeedGlobal = 0;
const synthMix = new Nodes.Compressor(AC);

// Master Effects
const masterGain = new Nodes.Gain(AC);
const masterFilter = new Nodes.Filter(AC);
const masterDistortion = new Nodes.Distortion(AC);
const masterFlanger = new Nodes.Flanger(AC);
const masterChorus = new Nodes.Chorus(AC);
const masterPhaser = new Nodes.Phaser(AC);
const masterDelay = new Nodes.Delay(AC);
const masterPingPong = new Nodes.PingPongDelay(AC);
const masterReverb = new Nodes.Reverb(AC);
const vibratoLFO = new Nodes.LFO(AC);
const masterBitCrush = new Nodes.BitCrusher(AC);
const masterLimiter = new Nodes.Compressor(AC);
const masterEQ2 = new Nodes.EQ2(AC);

let portamentoSpeedGlobal = 0;

let gains = {
    gainAttack: 0,
    gainDecay: 0,
    gainSustain: 0,
    gainRelease: 0,
    gainHold: 0,
    gainHoldLevel: 0,
    envelopeAttackExponent: 2,
    envelopeDecayExponent: 2,
    envelopeReleaseExponent: 2,
    envelopeAttackShape: 'exponential',
    envelopeDecayShape: 'exponential',
    envelopeReleaseShape: 'exponential'
}
let filterEnv = {
    attack: 0,
    decay: 0,
    sustain: 0,
    release: 0
};

let pitchEnv = {
    C: 1.0,
    CSharp: 1.0,
    D: 1.0,
    DSharp: 1.0,
    E: 1.0,
    F: 1.0,
    FSharp: 1.0,
    G: 1.0,
    GSharp: 1.0,
    A: 1.0,
    ASharp: 1.0,
    B: 1.0,
    Octave: 2.0,
    AllThemPitches: 1.0
};

const PolySynth = React.forwardRef(({ className, setTheme, currentTheme }, ref) => {
    // Synth State
    const [synthActive, setSynthActive] = useState(false);
    const [octaveMod, setOctaveMod] = useState(4);
    const [currentPreset, setCurrentPreset] = useState('- INIT -');
    
    // Track if synth has been initialized to prevent multiple starts
    const synthInitialized = useRef(false);
    
    // Track active notes for programmatic control
    const activeNotes = useRef(new Map());
    const noteIdCounter = useRef(0);

    // Preset State
    const [polyphony, setPolyphony] = useState(synthArr.length);
    const [portamentoSpeed, setPortamentoSpeed] = useState(0);
    const [masterVolume, setMasterVolume] = useState(0.75);
    const [masterFilterType, setMasterFilterType] = useState('lowpass');
    const [masterFilterFreq, setMasterFilterFreq] = useState(11000);
    const [masterFilterQ, setMasterFilterQ] = useState(0);
    const [masterFilterGain, setMasterFilterGain] = useState(0);
    const [vcoType, setVcoType] = useState('sine');
    const [vcoDutyCycle, setVcoDutyCycle] = useState(0.5);
    const [subOscOctaveOffset, setSubOscOctaveOffset] = useState(0);
    const [subOscType, setSubOscType] = useState('sine');
    const [osc2Type, setOsc2Type] = useState('sine');
    const [osc2Detune, setOsc2Detune] = useState(0);
    const [osc2DutyCycle, setOsc2DutyCycle] = useState(0.5);
    const [osc2Amount, setOsc2Amount] = useState(0);
    const [osc2PhaseOffset, setOsc2PhaseOffset] = useState(0);
    const [osc2OctaveOffset, setOsc2OctaveOffset] = useState(0);
    
    // Voice Spreading and Detuning Parameters
    const [voiceCount, setVoiceCount] = useState(1);
    const [detuneSpread, setDetuneSpread] = useState(0);
    const [stereoSpread, setStereoSpread] = useState(0);
    
    const [gainAttack, setGainAttack] = useState(0);
    const [gainDecay, setGainDecay] = useState(0);
    const [gainSustain, setGainSustain] = useState(0.7);
    const [gainRelease, setGainRelease] = useState(0);
    const [gainHold, setGainHold] = useState(0);
    const [gainHoldLevel, setGainHoldLevel] = useState(0);
    const [filterType, setFilterType] = useState('lowpass');
    const [filterFreq, setFilterFreq] = useState(11000);
    const [filterQ, setFilterQ] = useState(0);
    const [filterGain, setFilterGain] = useState(0);
    const [filterAttack, setFilterAttack] = useState(0);
    const [filterDecay, setFilterDecay] = useState(0);
    const [filterRelease, setFilterRelease] = useState(0);
    const [filterEnvAmount, setFilterEnvAmount] = useState(0);
    const [distortionAmount, setDistortionAmount] = useState(0);
    const [distortionDist, setDistortionDist] = useState(0);
    const [reverbType, setReverbType] = useState('reverb1');
    const [reverbAmount, setReverbAmount] = useState(0);
    const [flangerAmount, setFlangerAmount] = useState(0);
    const [flangerDepth, setFlangerDepth] = useState(0);
    const [flangerRate, setFlangerRate] = useState(0);
    const [flangerFeedback, setFlangerFeedback] = useState(0);
    const [flangerDelay, setFlangerDelay] = useState(0);
    const [chorusAmount, setChorusAmount] = useState(0);
    const [chorusRate, setChorusRate] = useState(0.6);
    const [chorusDepth, setChorusDepth] = useState(0.002);
    const [chorusFeedback, setChorusFeedback] = useState(0);
    const [phaserAmount, setPhaserAmount] = useState(0);
    const [phaserRate, setPhaserRate] = useState(0.5);
    const [phaserDepth, setPhaserDepth] = useState(800);
    const [phaserFeedback, setPhaserFeedback] = useState(0.3);
    const [phaserFrequency, setPhaserFrequency] = useState(800);
    const [delayTime, setDelayTime] = useState(0);
    const [delayFeedback, setDelayFeedback] = useState(0);
    const [delayTone, setDelayTone] = useState(4400);
    const [delayAmount, setDelayAmount] = useState(0);
    const [pingPongDelayTime, setPingPongDelayTime] = useState(0);
    const [pingPongFeedback, setPingPongFeedback] = useState(0);
    const [pingPongTone, setPingPongTone] = useState(4400);
    const [pingPongAmount, setPingPongAmount] = useState(0);
    const [vibratoDepth, setVibratoDepth] = useState(0);
    const [vibratoRate, setVibratoRate] = useState(0);
    const [bitCrushDepth, setBitCrushDepth] = useState(8);
    const [bitCrushAmount, setBitCrushAmount] = useState(0);
    const [eqLowGain, setEqLowGain] = useState(0);
    const [eqHighGain, setEqHighGain] = useState(0);
    const [eqLowFreq, setEqLowFreq] = useState(320);
    const [eqHighFreq, setEqHighFreq] = useState(3200);

    // Master Limiter state
    const [masterLimiterThreshold, setMasterLimiterThreshold] = useState(-6);
    const [masterLimiterRatio, setMasterLimiterRatio] = useState(20);
    const [masterLimiterKnee, setMasterLimiterKnee] = useState(0);
    const [masterLimiterAttack, setMasterLimiterAttack] = useState(0.005);
    const [masterLimiterRelease, setMasterLimiterRelease] = useState(0.05);

    // Noise state
    const [noiseType, setNoiseType] = useState('white');
    const [noiseMix, setNoiseMix] = useState(0);
    const [noiseFilterEnabled, setNoiseFilterEnabled] = useState(false);
    const [noiseFilterQ, setNoiseFilterQ] = useState(1);

    // Microtonal/Pitch Adjustment State (default 1.0 = no adjustment)
    const [pitchC, setPitchC] = useState(1.0);
    const [pitchCSharp, setPitchCSharp] = useState(1.0);
    const [pitchD, setPitchD] = useState(1.0);
    const [pitchDSharp, setPitchDSharp] = useState(1.0);
    const [pitchE, setPitchE] = useState(1.0);
    const [pitchF, setPitchF] = useState(1.0);
    const [pitchFSharp, setPitchFSharp] = useState(1.0);
    const [pitchG, setPitchG] = useState(1.0);
    const [pitchGSharp, setPitchGSharp] = useState(1.0);
    const [pitchA, setPitchA] = useState(1.0);
    const [pitchASharp, setPitchASharp] = useState(1.0);
    const [pitchB, setPitchB] = useState(1.0);
    const [octaveRatio, setOctaveRatio] = useState(2.0);
    const [allThemPitches, setAllThemPitches] = useState(1.0);

    // Envelope Shape State
    const [envelopeAttackShape, setEnvelopeAttackShape] = useState('exponential');
    const [envelopeDecayShape, setEnvelopeDecayShape] = useState('exponential');
    const [envelopeReleaseShape, setEnvelopeReleaseShape] = useState('exponential');
    const [envelopeAttackExponent, setEnvelopeAttackExponent] = useState(2);
    const [envelopeDecayExponent, setEnvelopeDecayExponent] = useState(2);
    const [envelopeReleaseExponent, setEnvelopeReleaseExponent] = useState(2);

    // Filter Envelope Shape State
    const [filterEnvelopeAttackShape, setFilterEnvelopeAttackShape] = useState('exponential');
    const [filterEnvelopeDecayShape, setFilterEnvelopeDecayShape] = useState('exponential');
    const [filterEnvelopeReleaseShape, setFilterEnvelopeReleaseShape] = useState('exponential');
    const [filterEnvelopeAttackExponent, setFilterEnvelopeAttackExponent] = useState(2);
    const [filterEnvelopeDecayExponent, setFilterEnvelopeDecayExponent] = useState(2);
    const [filterEnvelopeReleaseExponent, setFilterEnvelopeReleaseExponent] = useState(2);

    // Chord Mode State
    const [chordModeCapture, setChordModeCapture] = useState(false);
    const chordModeCaptureRef = useRef(false); // Immediate access to capture state
    const [chordModeTranspose, setChordModeTranspose] = useState(false);
    const chordModeTransposeRef = useRef(false); // Immediate access to transpose state
    const [capturedChord, setCapturedChord] = useState([]);
    const capturedChordRef = useRef([]); // Immediate access to captured chord
    const chordCaptureTimeout = useRef(null);
    const isCapturing = useRef(false);

    // Arpeggiator State
    const [arpeggiatorMode, setArpeggiatorMode] = useState('chord'); // 'chord', 'up', 'down', 'random', 'upDown', 'downUp'
    const [arpeggiatorPlaying, setArpeggiatorPlaying] = useState(false);
    const arpeggiatorPlayingRef = useRef(false); // Immediate access to playing state
    const [arpeggiatorDuration, setArpeggiatorDuration] = useState(0); // Integer: -2=sixteenth, -1=eighth, 0=quarter, 1=half, 2=whole
    const [arpeggiatorRate, setArpeggiatorRate] = useState(0); // Integer: -2=sixteenth, -1=eighth, 0=quarter, 1=half, 2=whole
    const arpeggiatorTimeoutId = useRef(null);
    const arpeggiatorCurrentIndex = useRef(0);
    const arpeggiatorDirection = useRef(1); // 1 for up, -1 for down (used for upDown/downUp modes)
    const arpeggiatorCurrentChord = useRef([]); // Current chord being arpeggiated
    const transposedChord = useRef([]); // Stores the current transposed chord to persist across mode changes

    const octaveUp = () => {
        if (octaveMod < 7) {
            setOctaveMod(octaveMod + 1);
            synthArr.forEach(synth => synthNoteOff(synth));
            regularActiveNotes.current.clear(); // Clear regular note tracking
        }
    };
    const octaveDown = () => {
        if (octaveMod > 1) {
            setOctaveMod(octaveMod - 1);
            synthArr.forEach(synth => synthNoteOff(synth));
            regularActiveNotes.current.clear(); // Clear regular note tracking
        }
    };

    // Custom preset management
    const [customPresets, setCustomPresets] = useState({});
    
    // Load custom presets from localStorage on mount
    useLayoutEffect(() => {
        const savedCustomPresets = localStorage.getItem('PolySynth-CustomPresets');
        if (savedCustomPresets) {
            try {
                setCustomPresets(JSON.parse(savedCustomPresets));
            } catch (error) {
                console.error('Error loading custom presets:', error);
            }
        }
    }, []);
    
    // Function to collect current synth state into a preset object
    const getCurrentPresetState = () => {
        return {
            masterVolume,
            polyphony,
            portamentoSpeed,
            masterFilterType,
            masterFilterFreq,
            masterFilterQ,
            masterFilterGain,
            vcoType,
            vcoDutyCycle,
            subOscOctaveOffset,
            subOscType,
            osc2Type,
            osc2Detune,
            osc2DutyCycle,
            osc2Amount,
            osc2PhaseOffset,
            osc2OctaveOffset,
            voiceCount,
            detuneSpread,
            stereoSpread,
            gainAttack,
            gainDecay,
            gainSustain,
            gainRelease,
            gainHold,
            gainHoldLevel,
            filterType,
            filterFreq,
            filterQ,
            filterGain,
            filterAttack,
            filterDecay,
            filterRelease,
            filterEnvAmount,
            distortionAmount,
            distortionDist,
            reverbType,
            reverbAmount,
            flangerAmount,
            flangerDepth,
            flangerRate,
            flangerFeedback,
            flangerDelay,
            chorusAmount,
            chorusRate,
            chorusDepth,
            chorusFeedback,
            phaserAmount,
            phaserRate,
            phaserDepth,
            phaserFeedback,
            phaserFrequency,
            delayTime,
            delayFeedback,
            delayTone,
            delayAmount,
            pingPongDelayTime,
            pingPongFeedback,
            pingPongTone,
            pingPongAmount,
            vibratoDepth,
            vibratoRate,
            bitCrushDepth,
            bitCrushAmount,
            eqLowGain,
            eqHighGain,
            eqLowFreq,
            eqHighFreq,
            masterLimiterThreshold,
            masterLimiterRatio,
            masterLimiterKnee,
            masterLimiterAttack,
            masterLimiterRelease,
            noiseType,
            noiseMix,
            noiseFilterEnabled,
            noiseFilterQ,
            pitchC,
            pitchCSharp,
            pitchD,
            pitchDSharp,
            pitchE,
            pitchF,
            pitchFSharp,
            pitchG,
            pitchGSharp,
            pitchA,
            pitchASharp,
            pitchB,
            octaveRatio,
            allThemPitches,
            envelopeAttackShape,
            envelopeDecayShape,
            envelopeReleaseShape,
            envelopeAttackExponent,
            envelopeDecayExponent,
            envelopeReleaseExponent,
            filterEnvelopeAttackShape,
            filterEnvelopeDecayShape,
            filterEnvelopeReleaseShape,
            filterEnvelopeAttackExponent,
            filterEnvelopeDecayExponent,
            filterEnvelopeReleaseExponent
        };
    };
    
    // Function to save current state as a custom preset
    const saveCustomPreset = () => {
        const presetName = prompt('Enter a name for this preset:');
        if (presetName && presetName.trim()) {
            const trimmedName = presetName.trim();
            const currentState = getCurrentPresetState();
            const updatedCustomPresets = {
                ...customPresets,
                [trimmedName]: currentState
            };
            setCustomPresets(updatedCustomPresets);
            localStorage.setItem('PolySynth-CustomPresets', JSON.stringify(updatedCustomPresets));
            alert(`Preset "${trimmedName}" saved successfully!`);
        }
    };
    
    // Function to copy current preset to clipboard
    const copyPresetToClipboard = async () => {
        const currentState = getCurrentPresetState();
        const presetString = JSON.stringify(currentState, null, 4);
        try {
            await navigator.clipboard.writeText(presetString);
            alert('Current preset copied to clipboard!');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = presetString;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Current preset copied to clipboard!');
        }
    };
    
    // Function to paste and load preset from clipboard
    const pastePresetFromClipboard = async () => {
        try {
            const clipboardText = await navigator.clipboard.readText();
            const presetData = JSON.parse(clipboardText);
            
            // Apply the preset data to all state variables
            if (presetData.masterVolume !== undefined) setMasterVolume(presetData.masterVolume);
            if (presetData.polyphony !== undefined) setPolyphony(presetData.polyphony);
            if (presetData.portamentoSpeed !== undefined) setPortamentoSpeed(presetData.portamentoSpeed);
            if (presetData.masterFilterType !== undefined) setMasterFilterType(presetData.masterFilterType);
            if (presetData.masterFilterFreq !== undefined) setMasterFilterFreq(presetData.masterFilterFreq);
            if (presetData.masterFilterQ !== undefined) setMasterFilterQ(presetData.masterFilterQ);
            if (presetData.masterFilterGain !== undefined) setMasterFilterGain(presetData.masterFilterGain);
            if (presetData.vcoType !== undefined) setVcoType(presetData.vcoType);
            if (presetData.vcoDutyCycle !== undefined) setVcoDutyCycle(presetData.vcoDutyCycle);
            if (presetData.subOscOctaveOffset !== undefined) setSubOscOctaveOffset(presetData.subOscOctaveOffset);
            if (presetData.subOscType !== undefined) setSubOscType(presetData.subOscType);
            if (presetData.osc2Type !== undefined) setOsc2Type(presetData.osc2Type);
            if (presetData.osc2Detune !== undefined) setOsc2Detune(presetData.osc2Detune);
            if (presetData.osc2DutyCycle !== undefined) setOsc2DutyCycle(presetData.osc2DutyCycle);
            if (presetData.osc2Amount !== undefined) setOsc2Amount(presetData.osc2Amount);
            if (presetData.osc2PhaseOffset !== undefined) setOsc2PhaseOffset(presetData.osc2PhaseOffset);
            if (presetData.osc2OctaveOffset !== undefined) setOsc2OctaveOffset(presetData.osc2OctaveOffset);
            if (presetData.voiceCount !== undefined) setVoiceCount(presetData.voiceCount);
            if (presetData.detuneSpread !== undefined) setDetuneSpread(presetData.detuneSpread);
            if (presetData.stereoSpread !== undefined) setStereoSpread(presetData.stereoSpread);
            if (presetData.gainAttack !== undefined) setGainAttack(presetData.gainAttack);
            if (presetData.gainDecay !== undefined) setGainDecay(presetData.gainDecay);
            if (presetData.gainSustain !== undefined) setGainSustain(presetData.gainSustain);
            if (presetData.gainRelease !== undefined) setGainRelease(presetData.gainRelease);
            if (presetData.gainHold !== undefined) setGainHold(presetData.gainHold);
            if (presetData.gainHoldLevel !== undefined) setGainHoldLevel(presetData.gainHoldLevel);
            if (presetData.filterType !== undefined) setFilterType(presetData.filterType);
            if (presetData.filterFreq !== undefined) setFilterFreq(presetData.filterFreq);
            if (presetData.filterQ !== undefined) setFilterQ(presetData.filterQ);
            if (presetData.filterGain !== undefined) setFilterGain(presetData.filterGain);
            if (presetData.filterAttack !== undefined) setFilterAttack(presetData.filterAttack);
            if (presetData.filterDecay !== undefined) setFilterDecay(presetData.filterDecay);
            if (presetData.filterRelease !== undefined) setFilterRelease(presetData.filterRelease);
            if (presetData.filterEnvAmount !== undefined) setFilterEnvAmount(presetData.filterEnvAmount);
            if (presetData.distortionAmount !== undefined) setDistortionAmount(presetData.distortionAmount);
            if (presetData.distortionDist !== undefined) setDistortionDist(presetData.distortionDist);
            if (presetData.reverbType !== undefined) setReverbType(presetData.reverbType);
            if (presetData.reverbAmount !== undefined) setReverbAmount(presetData.reverbAmount);
            if (presetData.flangerAmount !== undefined) setFlangerAmount(presetData.flangerAmount);
            if (presetData.flangerDepth !== undefined) setFlangerDepth(presetData.flangerDepth);
            if (presetData.flangerRate !== undefined) setFlangerRate(presetData.flangerRate);
            if (presetData.flangerFeedback !== undefined) setFlangerFeedback(presetData.flangerFeedback);
            if (presetData.flangerDelay !== undefined) setFlangerDelay(presetData.flangerDelay);
            if (presetData.chorusAmount !== undefined) setChorusAmount(presetData.chorusAmount);
            if (presetData.chorusRate !== undefined) setChorusRate(presetData.chorusRate);
            if (presetData.chorusDepth !== undefined) setChorusDepth(presetData.chorusDepth);
            if (presetData.chorusFeedback !== undefined) setChorusFeedback(presetData.chorusFeedback);
            if (presetData.phaserAmount !== undefined) setPhaserAmount(presetData.phaserAmount);
            if (presetData.phaserRate !== undefined) setPhaserRate(presetData.phaserRate);
            if (presetData.phaserDepth !== undefined) setPhaserDepth(presetData.phaserDepth);
            if (presetData.phaserFeedback !== undefined) setPhaserFeedback(presetData.phaserFeedback);
            if (presetData.phaserFrequency !== undefined) setPhaserFrequency(presetData.phaserFrequency);
            if (presetData.delayTime !== undefined) setDelayTime(presetData.delayTime);
            if (presetData.delayFeedback !== undefined) setDelayFeedback(presetData.delayFeedback);
            if (presetData.delayTone !== undefined) setDelayTone(presetData.delayTone);
            if (presetData.delayAmount !== undefined) setDelayAmount(presetData.delayAmount);
            if (presetData.pingPongDelayTime !== undefined) setPingPongDelayTime(presetData.pingPongDelayTime);
            if (presetData.pingPongFeedback !== undefined) setPingPongFeedback(presetData.pingPongFeedback);
            if (presetData.pingPongTone !== undefined) setPingPongTone(presetData.pingPongTone);
            if (presetData.pingPongAmount !== undefined) setPingPongAmount(presetData.pingPongAmount);
            if (presetData.vibratoDepth !== undefined) setVibratoDepth(presetData.vibratoDepth);
            if (presetData.vibratoRate !== undefined) setVibratoRate(presetData.vibratoRate);
            if (presetData.bitCrushDepth !== undefined) setBitCrushDepth(presetData.bitCrushDepth);
            if (presetData.bitCrushAmount !== undefined) setBitCrushAmount(presetData.bitCrushAmount);
            if (presetData.eqLowGain !== undefined) setEqLowGain(presetData.eqLowGain);
            if (presetData.eqHighGain !== undefined) setEqHighGain(presetData.eqHighGain);
            if (presetData.eqLowFreq !== undefined) setEqLowFreq(presetData.eqLowFreq);
            if (presetData.eqHighFreq !== undefined) setEqHighFreq(presetData.eqHighFreq);
            if (presetData.masterLimiterThreshold !== undefined) setMasterLimiterThreshold(presetData.masterLimiterThreshold);
            if (presetData.masterLimiterRatio !== undefined) setMasterLimiterRatio(presetData.masterLimiterRatio);
            if (presetData.masterLimiterKnee !== undefined) setMasterLimiterKnee(presetData.masterLimiterKnee);
            if (presetData.masterLimiterAttack !== undefined) setMasterLimiterAttack(presetData.masterLimiterAttack);
            if (presetData.masterLimiterRelease !== undefined) setMasterLimiterRelease(presetData.masterLimiterRelease);
            if (presetData.noiseType !== undefined) setNoiseType(presetData.noiseType);
            if (presetData.noiseMix !== undefined) setNoiseMix(presetData.noiseMix);
            if (presetData.noiseFilterEnabled !== undefined) setNoiseFilterEnabled(presetData.noiseFilterEnabled);
            if (presetData.noiseFilterQ !== undefined) setNoiseFilterQ(presetData.noiseFilterQ);
            if (presetData.pitchC !== undefined) setPitchC(presetData.pitchC);
            if (presetData.pitchCSharp !== undefined) setPitchCSharp(presetData.pitchCSharp);
            if (presetData.pitchD !== undefined) setPitchD(presetData.pitchD);
            if (presetData.pitchDSharp !== undefined) setPitchDSharp(presetData.pitchDSharp);
            if (presetData.pitchE !== undefined) setPitchE(presetData.pitchE);
            if (presetData.pitchF !== undefined) setPitchF(presetData.pitchF);
            if (presetData.pitchFSharp !== undefined) setPitchFSharp(presetData.pitchFSharp);
            if (presetData.pitchG !== undefined) setPitchG(presetData.pitchG);
            if (presetData.pitchGSharp !== undefined) setPitchGSharp(presetData.pitchGSharp);
            if (presetData.pitchA !== undefined) setPitchA(presetData.pitchA);
            if (presetData.pitchASharp !== undefined) setPitchASharp(presetData.pitchASharp);
            if (presetData.pitchB !== undefined) setPitchB(presetData.pitchB);
            if (presetData.octaveRatio !== undefined) setOctaveRatio(presetData.octaveRatio);
            if (presetData.allThemPitches !== undefined) setAllThemPitches(presetData.allThemPitches);
            if (presetData.envelopeAttackShape !== undefined) setEnvelopeAttackShape(presetData.envelopeAttackShape);
            if (presetData.envelopeDecayShape !== undefined) setEnvelopeDecayShape(presetData.envelopeDecayShape);
            if (presetData.envelopeReleaseShape !== undefined) setEnvelopeReleaseShape(presetData.envelopeReleaseShape);
            if (presetData.envelopeAttackExponent !== undefined) setEnvelopeAttackExponent(presetData.envelopeAttackExponent);
            if (presetData.envelopeDecayExponent !== undefined) setEnvelopeDecayExponent(presetData.envelopeDecayExponent);
            if (presetData.envelopeReleaseExponent !== undefined) setEnvelopeReleaseExponent(presetData.envelopeReleaseExponent);
            if (presetData.filterEnvelopeAttackShape !== undefined) setFilterEnvelopeAttackShape(presetData.filterEnvelopeAttackShape);
            if (presetData.filterEnvelopeDecayShape !== undefined) setFilterEnvelopeDecayShape(presetData.filterEnvelopeDecayShape);
            if (presetData.filterEnvelopeReleaseShape !== undefined) setFilterEnvelopeReleaseShape(presetData.filterEnvelopeReleaseShape);
            if (presetData.filterEnvelopeAttackExponent !== undefined) setFilterEnvelopeAttackExponent(presetData.filterEnvelopeAttackExponent);
            if (presetData.filterEnvelopeDecayExponent !== undefined) setFilterEnvelopeDecayExponent(presetData.filterEnvelopeDecayExponent);
            if (presetData.filterEnvelopeReleaseExponent !== undefined) setFilterEnvelopeReleaseExponent(presetData.filterEnvelopeReleaseExponent);
            
            alert('Preset loaded from clipboard successfully!');
        } catch (error) {
            console.error('Failed to paste from clipboard:', error);
            alert('Failed to load preset from clipboard. Please ensure the clipboard contains valid preset data.');
        }
    };
    
    // Function to delete a custom preset
    const deleteCustomPreset = (presetName) => {
        if (window.confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
            const updatedCustomPresets = { ...customPresets };
            delete updatedCustomPresets[presetName];
            setCustomPresets(updatedCustomPresets);
            localStorage.setItem('PolySynth-CustomPresets', JSON.stringify(updatedCustomPresets));
            
            // If the deleted preset was currently selected, reset to INIT
            if (currentPreset === presetName) {
                setCurrentPreset('- INIT -');
            }
        }
    };

    const resetMicrotonalPitches = () => {
        setPitchC(1.0);
        setPitchCSharp(1.0);
        setPitchD(1.0);
        setPitchDSharp(1.0);
        setPitchE(1.0);
        setPitchF(1.0);
        setPitchFSharp(1.0);
        setPitchG(1.0);
        setPitchGSharp(1.0);
        setPitchA(1.0);
        setPitchASharp(1.0);
        setPitchB(1.0);
        setOctaveRatio(2.0);
        setAllThemPitches(1.0);
    };

    // Function to manually resynchronize all oscillators across all synths
    const resynchronizeAllSynths = () => {
        console.log('PolySynth: Manually triggering resynchronization of all synths');
        
        // Calculate synchronized start time for all synths
        const syncStartTime = AC.currentTime + 0.2; // 200ms delay for clean resync
        
        // Resynchronize all synth instances
        synthArr.forEach((synth, index) => {
            try {
                console.log(`Resynchronizing synth ${index + 1}/${synthArr.length}`);
                synth.resynchronizeAllOscillators(syncStartTime, false); // false indicates manual resync
            } catch (e) {
                console.error(`Failed to resynchronize synth ${index}:`, e);
            }
        });
        
        console.log(`PolySynth: Initiated resynchronization of ${synthArr.length} synths at time ${syncStartTime}`);
    };

    const resetSynthPos = () => synthPos = 0;
    const incrementSynthPos = () => synthPos = (synthPos + 1) % polyphonyGlobal;

    // Chord Mode Functions
    const startChordCapture = (currentNotes = []) => {
        console.log('Starting chord capture with current notes:', currentNotes);
        console.log('📝 Current notes detailed:', currentNotes.map(note => ({ 
            original: note, 
            parsed: parseNoteString(note) 
        })));
        isCapturing.current = true;
        
        if (currentNotes.length > 0) {
            // If notes are currently held, capture them immediately
            setCapturedChord([...currentNotes]);
            capturedChordRef.current = [...currentNotes]; // Update ref immediately
            setChordModeCapture(false);
            chordModeCaptureRef.current = false; // Update ref immediately
            isCapturing.current = false;
            console.log('Captured chord immediately:', currentNotes);
        } else {
            // Clear any existing timeout
            if (chordCaptureTimeout.current) {
                clearTimeout(chordCaptureTimeout.current);
            }
            
            console.log('Chord capture mode active - waiting for input...');
            // Don't set a timeout here - let it latch until we get actual input
        }
    };

    const handleChordCapture = (pressedNotes) => {
        if (!isCapturing.current) return false;
        
        console.log('handleChordCapture called with notes:', pressedNotes);
        console.log('📝 Pressed notes detailed:', pressedNotes.map(note => ({ 
            original: note, 
            parsed: parseNoteString(note) 
        })));
        
        // Clear any existing timeout
        if (chordCaptureTimeout.current) {
            clearTimeout(chordCaptureTimeout.current);
        }
        
        if (pressedNotes.length > 0) {
            // Set timeout to capture the chord 100ms after the last key activity
            // This gives time for the user to complete their chord input
            chordCaptureTimeout.current = setTimeout(() => {
                if (pressedNotes.length > 0) {
                    setCapturedChord([...pressedNotes]);
                    capturedChordRef.current = [...pressedNotes]; // Update ref immediately
                    isCapturing.current = false;
                    setChordModeCapture(false);
                    chordModeCaptureRef.current = false; // Update ref immediately
                    console.log('✅ Captured chord after timeout:', pressedNotes);
                } else {
                    console.log('No notes to capture, staying in capture mode');
                }
            }, 100);
        } else {
            // If no notes are pressed, don't complete the capture - stay in capture mode
            console.log('No notes pressed, staying in capture mode');
        }
        
        return true; // Indicates that the input was consumed by capture mode
    };

    const transposeChord = (rootNote) => {
        console.log('🎵 transposeChord called with rootNote:', rootNote);
        
        if (capturedChordRef.current.length === 0 || !rootNote) {
            console.log('❌ Cannot transpose - capturedChord:', capturedChordRef.current, 'rootNote:', rootNote);
            return [];
        }
        
        console.log('🎹 Original captured chord:', capturedChordRef.current);
        
        try {
            // Validate all notes in captured chord before processing
            const validNotes = capturedChordRef.current.filter(note => {
                const parsed = parseNoteString(note);
                if (!parsed) {
                    console.warn('⚠️ Invalid note format in captured chord:', note);
                    return false;
                }
                return true;
            });
            
            if (validNotes.length === 0) {
                console.error('❌ No valid notes found in captured chord');
                return [];
            }
            
            // Validate root note
            const rootParsed = parseNoteString(rootNote);
            if (!rootParsed) {
                console.error('❌ Invalid root note format:', rootNote);
                return [];
            }
            
            // Sort captured chord to find the lowest note (root)
            const sortedChord = [...validNotes].sort((a, b) => {
                const aParsed = parseNoteString(a);
                const bParsed = parseNoteString(b);
                return aParsed.freq - bParsed.freq;
            });
            
            const originalRoot = sortedChord[0];
            const originalRootParsed = parseNoteString(originalRoot);
            const originalRootFreq = originalRootParsed.freq;
            const newRootFreq = rootParsed.freq;
            const transposeRatio = newRootFreq / originalRootFreq;
            
            console.log('📊 Transposition details:');
            console.log('   Original root note:', originalRoot, '@ freq:', originalRootFreq.toFixed(2), 'Hz');
            console.log('   Target root note:', rootNote, '@ freq:', newRootFreq.toFixed(2), 'Hz');
            console.log('   Transpose ratio:', transposeRatio.toFixed(4));
            
            // Transpose all notes in the chord
            const transposedChord = validNotes.map((note, index) => {
                const parsed = parseNoteString(note);
                const originalFreq = parsed.freq;
                const newFreq = originalFreq * transposeRatio;
                
                // Convert frequency back to note name
                // Use a more robust frequency-to-note conversion that properly handles custom pitch environments
                const transposedNote = frequencyToNoteString(newFreq);
                
                console.log(`   Note ${index + 1}: ${note} (${originalFreq.toFixed(2)}Hz) → ${transposedNote} (${newFreq.toFixed(2)}Hz)`);
                
                return transposedNote;
            });
            
            console.log('✅ Final transposed chord:', transposedChord);
            return transposedChord;
        } catch (error) {
            console.error('❌ Error in transposeChord:', error);
            return [];
        }
    };

    // Arpeggiator Functions
    const getNextNoteFromChord = (chord, currentIndex, mode, direction = 1) => {
        if (!chord || chord.length === 0) return { note: null, nextIndex: 0, nextDirection: direction };

        const sortedChord = [...chord].sort((a, b) => {
            const aParsed = parseNoteString(a);
            const bParsed = parseNoteString(b);
            return aParsed.freq - bParsed.freq;
        });

        switch (mode) {
            case 'chord': // Play all notes at once
                return { notes: sortedChord, nextIndex: 0, nextDirection: direction };
            
            case 'up':
                const upIndex = currentIndex % sortedChord.length;
                return { note: sortedChord[upIndex], nextIndex: upIndex + 1, nextDirection: direction };
            
            case 'down':
                const downIndex = currentIndex % sortedChord.length;
                return { note: sortedChord[sortedChord.length - 1 - downIndex], nextIndex: downIndex + 1, nextDirection: direction };
            
            case 'random':
                const randomIndex = Math.floor(Math.random() * sortedChord.length);
                return { note: sortedChord[randomIndex], nextIndex: currentIndex + 1, nextDirection: direction };
            
            case 'upDown':
                let upDownIndex = currentIndex % (sortedChord.length * 2 - 2);
                if (upDownIndex < sortedChord.length) {
                    return { note: sortedChord[upDownIndex], nextIndex: currentIndex + 1, nextDirection: 1 };
                } else {
                    const reversedIndex = sortedChord.length - 2 - (upDownIndex - sortedChord.length);
                    return { note: sortedChord[reversedIndex], nextIndex: currentIndex + 1, nextDirection: 1 };
                }
            
            case 'downUp':
                let downUpIndex = currentIndex % (sortedChord.length * 2 - 2);
                if (downUpIndex < sortedChord.length) {
                    return { note: sortedChord[sortedChord.length - 1 - downUpIndex], nextIndex: currentIndex + 1, nextDirection: -1 };
                } else {
                    const reversedIndex = downUpIndex - sortedChord.length + 1;
                    return { note: sortedChord[reversedIndex], nextIndex: currentIndex + 1, nextDirection: -1 };
                }
            
            default:
                return { note: sortedChord[0], nextIndex: 1, nextDirection: direction };
        }
    };

    const stopArpeggiator = () => {
        console.log('🛑 Stopping arpeggiator');
        setArpeggiatorPlaying(false);
        arpeggiatorPlayingRef.current = false;
        
        if (arpeggiatorTimeoutId.current) {
            clearTimeout(arpeggiatorTimeoutId.current);
            arpeggiatorTimeoutId.current = null;
        }
        
        // Stop all programmatic notes
        stopAllNotesProgrammatic();
        
        // Reset arpeggiator state
        arpeggiatorCurrentIndex.current = 0;
        arpeggiatorDirection.current = 1;
    };

    const startArpeggiator = (chord = null) => {
        console.log('▶️ Starting arpeggiator with chord:', chord || transposedChord.current || capturedChordRef.current);
        
        if (!synthActive) activateSynth();
        
        // Use provided chord, stored transposed chord, or captured chord
        const chordToUse = chord || transposedChord.current.length > 0 ? transposedChord.current : capturedChordRef.current;
        if (!chordToUse || chordToUse.length === 0) {
            console.warn('⚠️ No chord to arpeggiate');
            return;
        }
        
        // Store the current chord being arpeggiated
        arpeggiatorCurrentChord.current = [...chordToUse];
        
        // Stop any existing arpeggiator
        stopArpeggiator();
        
        // Start the arpeggiator
        setArpeggiatorPlaying(true);
        arpeggiatorPlayingRef.current = true;
        
        // Initialize arpeggiator state
        arpeggiatorCurrentIndex.current = 0;
        arpeggiatorDirection.current = 1;
        
        // Schedule the first note on beat instead of playing immediately
        scheduleNextArpeggiatorNoteOnBeat();
    };

    const scheduleNextArpeggiatorNote = () => {
        if (!arpeggiatorPlayingRef.current) {
            console.log('🔄 Arpeggiator stopped, exiting loop');
            return;
        }
        
        const chord = arpeggiatorCurrentChord.current;
        if (!chord || chord.length === 0) {
            console.warn('⚠️ No chord in arpeggiator, stopping');
            stopArpeggiator();
            return;
        }
        
        // Get the next note(s) to play
        const result = getNextNoteFromChord(
            chord, 
            arpeggiatorCurrentIndex.current, 
            arpeggiatorMode, 
            arpeggiatorDirection.current
        );
        
        // Update state for next iteration
        arpeggiatorCurrentIndex.current = result.nextIndex;
        arpeggiatorDirection.current = result.nextDirection;
        
        // Play the note(s)
        if (result.notes) {
            // Chord mode - play all notes at once
            console.log('🎹 Playing chord:', result.notes);
            playNotesProgrammatic(result.notes, 70, getDurationInMs(integerToDurationString(arpeggiatorDuration)));
        } else if (result.note) {
            // Single note mode - allow overlapping for proper musical timing
            console.log('🎵 Playing note:', result.note);
            
            playNotesProgrammatic([result.note], 70, getDurationInMs(integerToDurationString(arpeggiatorDuration)));
        }
        
        // Schedule the next note based on rate
        try {
            metronome.initializeAudioContext();
            metronome.updateAudioContextOffset(); // Ensure audio context offset is set
            const nextNoteTime = metronome.getNextNoteTime(integerToDurationString(arpeggiatorRate));
            const currentTime = metronome.getCurrentTime();
            const delay = Math.max(0, (nextNoteTime - currentTime) * 1000); // Convert to milliseconds
            
            // If delay is very small (less than 10ms), wait and get the next proper beat timing
            const minDelay = 10; // Minimum threshold to detect timing issues
            if (delay < minDelay) {
                console.log('⏰ Delay too small (' + delay.toFixed(2) + 'ms), waiting and getting next beat...');
                
                // Wait for the small delay, then get the next proper beat timing
                setTimeout(() => {
                    try {
                        const newNextNoteTime = metronome.getNextNoteTime(integerToDurationString(arpeggiatorRate));
                        const newCurrentTime = metronome.getCurrentTime();
                        const newDelay = Math.max(0, (newNextNoteTime - newCurrentTime) * 1000);
                        
                        console.log('⏰ Next note rescheduled in', newDelay.toFixed(2), 'ms (proper beat timing)');
                        
                        arpeggiatorTimeoutId.current = setTimeout(() => {
                            scheduleNextArpeggiatorNote();
                        }, newDelay);
                    } catch (error) {
                        console.error('❌ Error rescheduling arpeggiator note:', error);
                        const fallbackDelay = getRawDurationInMs(integerToDurationString(arpeggiatorRate));
                        console.log('⏰ Using fallback timing:', fallbackDelay, 'ms');
                        arpeggiatorTimeoutId.current = setTimeout(() => {
                            scheduleNextArpeggiatorNote();
                        }, fallbackDelay);
                    }
                }, delay);
            } else {
                console.log('⏰ Next note in', delay.toFixed(2), 'ms');
                
                arpeggiatorTimeoutId.current = setTimeout(() => {
                    scheduleNextArpeggiatorNote();
                }, delay);
            }
        } catch (error) {
            console.error('❌ Error scheduling next arpeggiator note:', error);
            // Fallback to simple timing based on BPM
            const fallbackDelay = getRawDurationInMs(integerToDurationString(arpeggiatorRate));
            console.log('⏰ Using fallback timing:', fallbackDelay, 'ms');
            arpeggiatorTimeoutId.current = setTimeout(() => {
                scheduleNextArpeggiatorNote();
            }, fallbackDelay);
        }
    };

    const getRawDurationInMs = (duration) => {
        // Get BPM for timing calculations
        const bpmSlider = document.querySelector('#bpmSlider');
        const bpm = bpmSlider ? Number(bpmSlider.value) : 120;
        const msPerBeat = (60 / bpm) * 1000; // Quarter note duration in ms
        
        switch (duration) {
            case 'whole': return msPerBeat * 4;
            case 'half': return msPerBeat * 2;
            case 'quarter': return msPerBeat;
            case 'eighth': return msPerBeat / 2;
            case 'sixteenth': return msPerBeat / 4;
            default: return msPerBeat; // Default to quarter note
        }
    };

    const getDurationInMs = (duration) => {
        const noteDuration = getRawDurationInMs(duration);
        return Math.max(50, noteDuration); // Minimum 50ms duration
    };

    // Helper function to schedule next arpeggiator note on beat
    const scheduleNextArpeggiatorNoteOnBeat = () => {
        try {
            metronome.initializeAudioContext();
            metronome.updateAudioContextOffset(); // Ensure audio context offset is set
            const nextNoteTime = metronome.getNextNoteTime(integerToDurationString(arpeggiatorRate));
            const currentTime = metronome.getCurrentTime();
            const delay = Math.max(0, (nextNoteTime - currentTime) * 1000); // Convert to milliseconds
            
            // If delay is very small (less than 10ms), wait and get the next proper beat timing
            const minDelay = 10; // Minimum threshold to detect timing issues
            if (delay < minDelay) {
                console.log('⏰ Initial delay too small (' + delay.toFixed(2) + 'ms), waiting and getting next beat...');
                
                // Wait for the small delay, then get the next proper beat timing
                setTimeout(() => {
                    try {
                        const newNextNoteTime = metronome.getNextNoteTime(integerToDurationString(arpeggiatorRate));
                        const newCurrentTime = metronome.getCurrentTime();
                        const newDelay = Math.max(0, (newNextNoteTime - newCurrentTime) * 1000);
                        
                        console.log('⏰ Arpeggiator start rescheduled in', newDelay.toFixed(2), 'ms (proper beat timing)');
                        
                        arpeggiatorTimeoutId.current = setTimeout(() => {
                            scheduleNextArpeggiatorNote();
                        }, newDelay);
                    } catch (error) {
                        console.error('❌ Error rescheduling arpeggiator start:', error);
                        const fallbackDelay = getRawDurationInMs(integerToDurationString(arpeggiatorRate));
                        console.log('⏰ Using fallback timing:', fallbackDelay, 'ms');
                        arpeggiatorTimeoutId.current = setTimeout(() => {
                            scheduleNextArpeggiatorNote();
                        }, fallbackDelay);
                    }
                }, delay);
            } else {
                console.log('⏰ Next arpeggiator note scheduled in', delay.toFixed(2), 'ms');
                
                arpeggiatorTimeoutId.current = setTimeout(() => {
                    scheduleNextArpeggiatorNote();
                }, delay);
            }
        } catch (error) {
            console.error('❌ Error scheduling next arpeggiator note on beat:', error);
            // Fallback to simple timing based on BPM
            const fallbackDelay = getRawDurationInMs(integerToDurationString(arpeggiatorRate));
            console.log('⏰ Using fallback timing:', fallbackDelay, 'ms');
            arpeggiatorTimeoutId.current = setTimeout(() => {
                scheduleNextArpeggiatorNote();
            }, fallbackDelay);
        }
    };

    const toggleArpeggiator = () => {
        if (arpeggiatorPlayingRef.current) {
            stopArpeggiator();
        } else {
            startArpeggiator();
        }
    };

    // Handle transpose mode with arpeggiator
    const handleArpeggiatorTranspose = (rootNote) => {
        console.log('🔄 Transposing arpeggiator to root:', rootNote);
        
        if (capturedChordRef.current.length === 0) {
            console.warn('⚠️ No captured chord to transpose');
            return;
        }
        
        // Transpose the chord
        const newTransposedChord = transposeChord(rootNote);
        
        if (newTransposedChord && newTransposedChord.length > 0) {
            // Store the transposed chord for persistence across mode changes
            transposedChord.current = newTransposedChord;
            // If arpeggiator is already playing, update the chord and continue
            if (arpeggiatorPlayingRef.current) {
                console.log('🎵 Updating arpeggiator with transposed chord:', newTransposedChord);
                arpeggiatorCurrentChord.current = newTransposedChord;
                // Reset index to start fresh with the new chord
                arpeggiatorCurrentIndex.current = 0;
                arpeggiatorDirection.current = 1;
            } else {
                // If arpeggiator is not playing, just play the chord once according to the current mode
                console.log('� Playing transposed chord once in', arpeggiatorMode, 'mode');
                
                if (arpeggiatorMode === 'chord') {
                    // Play all notes at once - for transpose mode, don't use arpeggiator duration
                    // Instead, let notes play until key is released (handled by keyboard logic)
                    playNotesProgrammatic(newTransposedChord, 70);
                } else {
                    // For other modes, just play the first note of the sequence
                    const result = getNextNoteFromChord(newTransposedChord, 0, arpeggiatorMode, 1);
                    if (result.notes) {
                        playNotesProgrammatic(result.notes, 70);
                    } else if (result.note) {
                        playNotesProgrammatic([result.note], 70);
                    }
                }
            }
        }
    };

    // Throttled parameter update to prevent audio interruption
    const activateSynth = () => {
        setSynthActive(true);
        AC.resume();
    };

    const initSynth = () => {
        // Prevent multiple initializations
        if (synthInitialized.current) return;
        
        // Capture a single start time for all oscillators to ensure perfect phase alignment
        const startTime = AC.currentTime + 0.01; // 1ms offset for stable scheduling
        
        synthArr.forEach(synth => {
            synth.connect(synthMix.getNode());
            synth.connectVibratoToAll(vibratoLFO);
            synth.init(startTime); // Pass synchronized start time
        });

        vibratoLFO.start();

        // Compressing all synths together to avoid clipping/distortion
        synthMix.connect(masterDistortion.getNode());
        // Limiter-type settings
        synthMix.setThreshold(-6);
        synthMix.setKnee(0);
        synthMix.setRatio(20);

        masterDistortion.connect(masterFlanger.getNode());
        masterFlanger.connect(masterChorus.getNode());
        masterChorus.connect(masterPhaser.getNode());
        masterPhaser.connect(masterBitCrush.getNode());
        masterBitCrush.connect(masterDelay.getNode());
        masterDelay.connect(masterPingPong.getNode());
        masterPingPong.connect(masterReverb.getNode());
        masterReverb.connect(masterEQ2.getNode());
        masterEQ2.connect(masterFilter.getNode());
        masterFilter.connect(masterLimiter.getNode());

        masterLimiter.connect(masterGain.getNode());
        masterLimiter.setThreshold(-6);
        masterLimiter.setKnee(0);
        masterLimiter.setRatio(20);

        // Ensure master gain is always connected to destination
        try {
            masterGain.connect(AC.destination);
        } catch (e) {
            // If already connected, disconnect and reconnect
            masterGain.getNode().disconnect();
            masterGain.connect(AC.destination);
        }
        
        // Mark as initialized
        synthInitialized.current = true;
    };

    // console.log('Gain: ', gainAttack, gainDecay, gainSustain, gainRelease);

    gains = {
        gainAttack,
        gainDecay,
        gainSustain,
        gainRelease,
        gainHold,
        gainHoldLevel,
        envelopeAttackExponent,
        envelopeDecayExponent,
        envelopeReleaseExponent,
        envelopeAttackShape,
        envelopeDecayShape,
        envelopeReleaseShape
    }
    filterEnv = {
        attack: filterAttack,
        decay: filterDecay,
        release: filterRelease,
        amount: filterEnvAmount
    };

    pitchEnv = {
        C: pitchC,
        CSharp: pitchCSharp,
        D: pitchD,
        DSharp: pitchDSharp,
        E: pitchE,
        F: pitchF,
        FSharp: pitchFSharp,
        G: pitchG,
        GSharp: pitchGSharp,
        A: pitchA,
        ASharp: pitchASharp,
        B: pitchB,
        Octave: octaveRatio,
        AllThemPitches: allThemPitches
    };
    portamentoSpeedGlobal = portamentoSpeed;
    polyphonyGlobal = polyphony;

    const getGainEnv = (volume) => {
        const v = volume || 1;
        // Apply exponential scaling for more natural response
        // You can tweak the exponent (e.g., 2) for desired curve
        const exp = 1/2;
        return {
            a: gains.gainAttack * Math.pow(v, exp),
            d: gains.gainDecay * Math.pow(v, exp),
            s: gains.gainSustain * Math.pow(v, exp),
            r: gains.gainRelease * Math.pow(v, exp),
            hold: gains.gainHold * Math.pow(v, exp),
            holdLevel: gains.gainHoldLevel * Math.pow(v, exp),
            // Envelope shape parameters
            attackShape: gains.envelopeAttackShape,
            decayShape: gains.envelopeDecayShape,
            releaseShape: gains.envelopeReleaseShape,
            attackExponent: gains.envelopeAttackExponent,
            decayExponent: gains.envelopeDecayExponent,
            releaseExponent: gains.envelopeReleaseExponent
        };
    };
    const getFilterEnv = () => ({
        a: filterEnv.attack,
        d: filterEnv.decay,
        r: filterEnv.release,
        amount: filterEnv.amount,
        // Filter envelope shape parameters
        attackShape: filterEnvelopeAttackShape,
        decayShape: filterEnvelopeDecayShape,
        releaseShape: filterEnvelopeReleaseShape,
        attackExponent: filterEnvelopeAttackExponent,
        decayExponent: filterEnvelopeDecayExponent,
        releaseExponent: filterEnvelopeReleaseExponent
    });
    portamentoSpeedGlobal = portamentoSpeed;

    // Functions to pass envelope data to the synth
    const synthNoteOn = (synth, note, volume, scheduleTime = null) => {
        const gainEnv = getGainEnv(volume);
        // console.log('Gain envelope:', gainEnv);
        const filterEnv = getFilterEnv();
        const voiceId = synth.noteOn(
            note,
            {
                gainEnv,
                filterEnv,
                portamentoSpeed: polyphonyGlobal === 1 ? portamentoSpeedGlobal : 0,
                scheduleTime: scheduleTime // Pass schedule time for phase alignment
            },
        );
        return voiceId; // Return voice ID for tracking
    }
    const synthNoteOff = (synth, note = null, voiceId = null) => {
        const gainEnv = getGainEnv(1); // Use default volume of 1 for note off
        const filterEnv = getFilterEnv();
        // console.log('Sending note off to synth', synth, 'note information', note, 'voiceId', voiceId);
        synth.noteOff({ gainEnv, filterEnv }, voiceId);
    }

    // Programmatic note control functions
    const playNotesProgrammatic = (notes, volume = 50, duration = null) => {
        if (!synthActive) activateSynth();
        // console.log('Playing programmatic notes:', notes, 'Volume:', volume, 'Duration:', duration);
        
        const gainValue = volume / 100; // Convert percentage to gain value
        
        // Capture schedule time once for all simultaneous notes to ensure phase alignment
        const scheduleTime = AC.currentTime + 0.001; // 1ms offset for stable scheduling
        
        notes.forEach(noteString => {
            // Parse note string (e.g., "C4", "D#5")
            const note = parseNoteString(noteString);
            if (!note) return;
            
            // Find available synth or reuse existing one
            let targetSynth = null;
            if (!synthArr[synthPos].currentNote) {
                targetSynth = synthArr[synthPos];
                // console.log('Reusing synth at position:', synthPos);
            } else {
                const initialPos = synthPos;
                // console.log('Finding available synth, starting at position:', synthPos);
                incrementSynthPos();

                while (synthPos !== initialPos) {
                    // console.log('Checking synth at position:', synthPos);
                    if (!synthArr[synthPos].currentNote) break;
                    incrementSynthPos();
                }
                // console.log('Found available synth at position:', synthPos);
                targetSynth = synthArr[synthPos];
            }

            // Create unique ID for this note instance
            const noteId = `${noteString}_${noteIdCounter.current++}`;
            
            // Start the note with synchronized schedule time and get the voice ID
            const voiceId = synthNoteOn(targetSynth, note, gainValue, scheduleTime);
            
            // Store note info for tracking
            const noteInfo = {
                synth: targetSynth,
                noteString: noteString,
                volume: gainValue,
                noteId: noteId,
                voiceId: voiceId // Store voice ID for proper cleanup
            };
            
            activeNotes.current.set(noteId, noteInfo);
            incrementSynthPos();
            
            // If duration is specified, schedule note off
            if (duration) {
                setTimeout(() => {
                    const noteInfo = activeNotes.current.get(noteId);
                    if (noteInfo) {
                        synthNoteOff(noteInfo.synth, note, noteInfo.voiceId);
                        activeNotes.current.delete(noteId);
                    }
                }, duration);
            }
        });
    };

    const stopNotesProgrammatic = (notes) => {
        notes.forEach(noteString => {
            // Find all active notes with this note name and stop them
            const notesToStop = [];
            activeNotes.current.forEach((noteInfo, noteId) => {
                if (noteInfo.noteString === noteString) {
                    notesToStop.push(noteId);
                }
            });
            // console.log('Notes to stop: ', notes);
            // console.log('Found notes playing: ', notesToStop);
            
            notesToStop.forEach(noteId => {
                const noteInfo = activeNotes.current.get(noteId);
                if (noteInfo) {
                    synthNoteOff(noteInfo.synth, null, noteInfo.voiceId);
                    activeNotes.current.delete(noteId);
                }
            });
        });
    };

    const stopAllNotesProgrammatic = () => {
        // console.log('Stopping all programmatic notes, count:', activeNotes.current.size);
        activeNotes.current.forEach((noteInfo, noteId) => {
            synthNoteOff(noteInfo.synth, null, noteInfo.voiceId);
        });
        activeNotes.current.clear();
        
        // Also force stop all synths as a backup
        synthArr.forEach(synth => {
            if (synth.currentNote) {
                synthNoteOff(synth);
            }
        });
    };

    // Helper function to parse note strings like "C4", "D#5", "C/4", "D#/5", etc.
    const parseNoteString = (noteString) => {
        if (!noteString || typeof noteString !== 'string') {
            console.warn('⚠️ parseNoteString received invalid input:', noteString);
            return null;
        }
        
        // Normalize the note string by removing any slashes
        const normalizedNoteString = noteString.replace('/', '');
        
        const match = normalizedNoteString.match(/^([A-G]#?)(\d+)$/);
        if (!match) {
            console.warn('⚠️ parseNoteString: Invalid note format:', noteString, '(normalized:', normalizedNoteString, ')');
            return null;
        }
        
        const noteName = match[1];
        const octave = parseInt(match[2]);
        
        if (isNaN(octave) || octave < 0 || octave > 9) {
            console.warn('⚠️ parseNoteString: Invalid octave:', octave, 'for note:', noteString);
            return null;
        }
        
        // Get base frequency and apply microtonal adjustments
        // const baseFreq = {
        //     'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
        //     'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
        //     'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88
        // }[noteName];

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

        if (!baseFreq) {
            console.warn('⚠️ parseNoteString: Unknown note name:', noteName, 'for note:', noteString);
            return null;
        }
        
        // Apply microtonal pitch adjustments
        const pitchAdjustments = {
            'C': pitchEnv.C, 'C#': pitchEnv.CSharp, 'D': pitchEnv.D, 'D#': pitchEnv.DSharp,
            'E': pitchEnv.E, 'F': pitchEnv.F, 'F#': pitchEnv.FSharp, 'G': pitchEnv.G,
            'G#': pitchEnv.GSharp, 'A': pitchEnv.A, 'A#': pitchEnv.ASharp, 'B': pitchEnv.B
        };
        
        const adjustedBaseFreq = baseFreq* pitchAdjustments[noteName] * pitchEnv.AllThemPitches;
        
        // Calculate frequency using custom octave ratio instead of fixed 2.0
        const freq = adjustedBaseFreq * Math.pow(pitchEnv.Octave, octave - 4);
        // console.log(`Base frequency for ${noteName}: ${baseFreq}, Adjusted: ${adjustedBaseFreq}, Octave: ${octave}, Frequency: ${freq}`);


        // console.log(`Parsed note: ${noteString}, Frequency: ${freq}, Octave: ${octave},`, pitchAdjustments, pitchEnv);
        return {
            note: noteString,
            oct: octave,
            freq: freq
        };
    };

    // Helper function to convert frequency back to note string
    const frequencyToNoteString = (frequency) => {
        if (!frequency || frequency <= 0) {
            console.warn('⚠️ frequencyToNoteString received invalid frequency:', frequency);
            return null;
        }

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // Calculate base frequencies for each note in octave 4 using current pitch environment
        let baseFrequency = 261.63; // Default base frequency for C4
        let baseFrequencies = [baseFrequency];
        for(let i = 1; i < noteNames.length; i++) {
            baseFrequencies.push(baseFrequencies[i - 1] * Math.pow(pitchEnv.Octave, 1/12));
        }
        
        // Apply pitch adjustments to base frequencies
        const pitchAdjustments = {
            'C': pitchEnv.C, 'C#': pitchEnv.CSharp, 'D': pitchEnv.D, 'D#': pitchEnv.DSharp,
            'E': pitchEnv.E, 'F': pitchEnv.F, 'F#': pitchEnv.FSharp, 'G': pitchEnv.G,
            'G#': pitchEnv.GSharp, 'A': pitchEnv.A, 'A#': pitchEnv.ASharp, 'B': pitchEnv.B
        };
        
        const adjustedBaseFreqs = baseFrequencies.map((freq, index) => 
            freq * pitchAdjustments[noteNames[index]] * pitchEnv.AllThemPitches
        );
        
        // Find the closest note and octave
        let bestMatch = null;
        let smallestError = Infinity;
        
        // Check octaves from 0 to 9
        for (let octave = 0; octave <= 9; octave++) {
            const octaveMultiplier = Math.pow(pitchEnv.Octave, octave - 4);
            
            for (let noteIndex = 0; noteIndex < noteNames.length; noteIndex++) {
                const expectedFreq = adjustedBaseFreqs[noteIndex] * octaveMultiplier;
                const error = Math.abs(frequency - expectedFreq);
                
                if (error < smallestError) {
                    smallestError = error;
                    bestMatch = {
                        note: noteNames[noteIndex],
                        octave: octave,
                        expectedFreq: expectedFreq,
                        error: error
                    };
                }
            }
        }
        
        if (bestMatch) {
            // console.log(`Frequency ${frequency.toFixed(2)}Hz → ${bestMatch.note}${bestMatch.octave} (expected: ${bestMatch.expectedFreq.toFixed(2)}Hz, error: ${bestMatch.error.toFixed(2)}Hz)`);
            return `${bestMatch.note}${bestMatch.octave}`;
        }
        
        console.warn('⚠️ Could not find matching note for frequency:', frequency);
        return null;
    };

    // Function to stop transposed notes when key is released
    const stopTransposedNotes = () => {
        if (transposedChord.current.length > 0) {
            console.log('🛑 Stopping transposed notes:', transposedChord.current);
            stopNotesProgrammatic(transposedChord.current);
        }
    };

    // Expose the programmatic functions to parent components
    useImperativeHandle(ref, () => ({
        playNotes: playNotesProgrammatic,
        stopNotes: stopNotesProgrammatic,
        stopAllNotes: stopAllNotesProgrammatic,
        isActive: () => synthActive,
        // Expose pitch controls for IntervalPractice synchronization
        getPitchValues: () => {
            // console.log('Getting pitch values:', pitchEnv);
            return {
                pitchC: pitchEnv.C,
                pitchCSharp: pitchEnv.CSharp,
                pitchD: pitchEnv.D,
                pitchDSharp: pitchEnv.DSharp,
                pitchE: pitchEnv.E,
                pitchF: pitchEnv.F, 
                pitchFSharp: pitchEnv.FSharp,
                pitchG: pitchEnv.G,
                pitchGSharp: pitchEnv.GSharp,
                pitchA: pitchEnv.A,
                pitchASharp: pitchEnv.ASharp,
                pitchB: pitchEnv.B,
                octaveRatio: pitchEnv.Octave,
                allThemPitches: pitchEnv.AllThemPitches
            };

            // console.log('Getting pitch values:', {
            //     pitchC, pitchCSharp, pitchD, pitchDSharp, pitchE, pitchF,
            //     pitchFSharp, pitchG, pitchGSharp, pitchA, pitchASharp, pitchB,
            //     octaveRatio, allThemPitches
            // });
            return {
                pitchC, pitchCSharp, pitchD, pitchDSharp, pitchE, pitchF,
                pitchFSharp, pitchG, pitchGSharp, pitchA, pitchASharp, pitchB,
                octaveRatio, allThemPitches
            };
        },
        setPitchValues: (values) => {
            // console.log('Setting pitch values:', values, pitchEnv);
            if (values.pitchC !== undefined) setPitchC(values.pitchC);
            if (values.pitchCSharp !== undefined) setPitchCSharp(values.pitchCSharp);
            if (values.pitchD !== undefined) setPitchD(values.pitchD);
            if (values.pitchDSharp !== undefined) setPitchDSharp(values.pitchDSharp);
            if (values.pitchE !== undefined) setPitchE(values.pitchE);
            if (values.pitchF !== undefined) setPitchF(values.pitchF);
            if (values.pitchFSharp !== undefined) setPitchFSharp(values.pitchFSharp);
            if (values.pitchG !== undefined) setPitchG(values.pitchG);
            if (values.pitchGSharp !== undefined) setPitchGSharp(values.pitchGSharp);
            if (values.pitchA !== undefined) setPitchA(values.pitchA);
            if (values.pitchASharp !== undefined) setPitchASharp(values.pitchASharp);
            if (values.pitchB !== undefined) setPitchB(values.pitchB);
            if (values.octaveRatio !== undefined) setOctaveRatio(values.octaveRatio);
            if (values.allThemPitches !== undefined) setAllThemPitches(values.allThemPitches);
            return pitchEnv;
        },
        resetMicrotonalPitches: () => {
            setPitchC(1.0);
            setPitchCSharp(1.0);
            setPitchD(1.0);
            setPitchDSharp(1.0);
            setPitchE(1.0);
            setPitchF(1.0);
            setPitchFSharp(1.0);
            setPitchG(1.0);
            setPitchGSharp(1.0);
            setPitchA(1.0);
            setPitchASharp(1.0);
            setPitchB(1.0);
            setOctaveRatio(2.0);
            setAllThemPitches(1.0);
        },
        // Chord mode functions
        startChordCapture,
        handleChordCapture,
        transposeChord,
        getChordModeState: () => {
            const state = {
                capture: chordModeCaptureRef.current, // Use ref for immediate access
                transpose: chordModeTransposeRef.current, // Use ref for immediate access
                capturedChord: capturedChordRef.current, // Use ref for immediate access
                isCapturing: isCapturing.current
            };
            console.log('🔍 getChordModeState called, returning:', state);
            return state;
        },
        // Arpeggiator functions
        startArpeggiator,
        stopArpeggiator,
        toggleArpeggiator,
        handleArpeggiatorTranspose,
        stopTransposedNotes,
        setArpeggiatorMode: (mode) => setArpeggiatorMode(mode),
        setArpeggiatorDuration: (duration) => setArpeggiatorDuration(typeof duration === 'string' ? durationStringToInteger(duration) : duration),
        setArpeggiatorRate: (rate) => setArpeggiatorRate(typeof rate === 'string' ? durationStringToInteger(rate) : rate),
        getArpeggiatorState: () => ({
            mode: arpeggiatorMode,
            playing: arpeggiatorPlayingRef.current,
            duration: integerToDurationString(arpeggiatorDuration),
            rate: integerToDurationString(arpeggiatorRate),
            currentChord: arpeggiatorCurrentChord.current
        })
    }), [synthActive, pitchC, pitchCSharp, pitchD, pitchDSharp, pitchE, pitchF,
        pitchFSharp, pitchG, pitchGSharp, pitchA, pitchASharp, pitchB,
        octaveRatio, allThemPitches, chordModeCapture, chordModeTranspose, capturedChord,
        arpeggiatorMode, arpeggiatorPlaying, arpeggiatorDuration, arpeggiatorRate]);

    pitchEnv = {
        C: pitchC,
        CSharp: pitchCSharp,
        D: pitchD,      
        DSharp: pitchDSharp,
        E: pitchE,
        F: pitchF,
        FSharp: pitchFSharp,
        G: pitchG,
        GSharp: pitchGSharp,
        A: pitchA,
        ASharp: pitchASharp,
        B: pitchB,
        Octave: octaveRatio,
        AllThemPitches: allThemPitches
    };

    // Track active notes for regular (non-programmatic) note playing
    const regularActiveNotes = useRef(new Map()); // Maps note.note -> {synth, voiceId}

    // Function to delegate played notes to each of the synths
    const noteOn = (note) => {
        let targetSynth = null;
        
        if (!synthArr[synthPos].currentNote) {
            targetSynth = synthArr[synthPos];
        } else {
            const initialPos = synthPos;
            incrementSynthPos();

            while (synthPos !== initialPos) {
                if (!synthArr[synthPos].currentNote) break;
                incrementSynthPos();
            }
            targetSynth = synthArr[synthPos];
        }

        // Capture schedule time for phase alignment
        const scheduleTime = AC.currentTime + 0.001; // 1ms offset for stable scheduling
        const voiceId = synthNoteOn(targetSynth, note, undefined, scheduleTime);
        
        // Track this note for proper cleanup
        regularActiveNotes.current.set(note.note, {
            synth: targetSynth,
            voiceId: voiceId
        });

        incrementSynthPos();
    };
    
    const noteOff = (note) => {
        const noteInfo = regularActiveNotes.current.get(note.note);
        if (noteInfo) {
            synthNoteOff(noteInfo.synth, note, noteInfo.voiceId);
            regularActiveNotes.current.delete(note.note);
        } else {
            // Fallback to old method if note not found in tracking
            const targetSynths = synthArr.filter(synth => synth.currentNote === note.note);
            targetSynths.forEach(synth => synthNoteOff(synth));
        }
    };

    // Keyboard listeners
    // const keydownFunction = e => {
    //     if (e.repeat) return;
    //     if (!synthActive) activateSynth();

    //     // Additional commands
    //     switch (e.key) {
    //         case 'z': return octaveDown();
    //         case 'x': return octaveUp();
    //     };

    // const engageKeyboard = () => {
    //     window.addEventListener('keydown', keydownFunction);
    //     window.addEventListener('keyup', keyupFunction);
    // }
    // const disengageKeyboard = () => {
    //     window.removeEventListener('keydown', keydownFunction);
    //     window.removeEventListener('keyup', keyupFunction);
    // }

    // Init
    useLayoutEffect(() => {
        initSynth();
        
        // Cleanup function to prevent memory leaks
        return () => {
            // Stop arpeggiator
            stopArpeggiator();
            
            // Clear batched parameter update timers
            if (batchedParameterUpdate.current.timer) {
                clearTimeout(batchedParameterUpdate.current.timer);
            }
            
            // Stop all programmatic notes
            stopAllNotesProgrammatic();
            
            // Clear all synth timeouts and stop notes
            synthArr.forEach(synth => {
                synth.clearTimeouts();
                synth.noteStop();
                // Properly clean up each synth instance
                if (synth.destroy) {
                    synth.destroy();
                }
            });
        };
    }, []);

    // Load Preset
    useLayoutEffect(() => {
        // Try to get preset from built-in presets first, then custom presets
        const preset = presetData[currentPreset] || customPresets[currentPreset];
        
        if (!preset) {
            console.warn(`Preset "${currentPreset}" not found`);
            return;
        }
        
        synthArr.forEach(synth => synth.noteStop());

        setPolyphony(preset.polyphony);
        setMasterVolume(preset.masterVolume);
        setPortamentoSpeed(preset.portamentoSpeed);
        setMasterFilterType(preset.masterFilterType);
        setMasterFilterFreq(preset.masterFilterFreq);
        setMasterFilterQ(preset.masterFilterQ);
        setMasterFilterGain(preset.masterFilterGain);
        setGainAttack(preset.gainAttack);
        setGainDecay(preset.gainDecay);
        // setGainHoldLevel(preset.setGainHoldLevel || 0);
        // setGainHold(preset.gainHold || 0);
        setGainSustain(preset.gainSustain);
        setGainRelease(preset.gainRelease);
        setVcoType(preset.vcoType);
        setVcoDutyCycle(preset.vcoDutyCycle || 0.5);
        setSubOscOctaveOffset(preset.subOscOctaveOffset || 0);
        setSubOscType(preset.subOscType || 'sine');
        setOsc2Type(preset.osc2Type || 'sine');
        setOsc2Detune(preset.osc2Detune || 0);
        setOsc2DutyCycle(preset.osc2DutyCycle || 0.5);
        setOsc2Amount(preset.osc2Amount || 0);
        setOsc2PhaseOffset(preset.osc2PhaseOffset || 0);
        setOsc2OctaveOffset(preset.osc2OctaveOffset || 0);
        
        // Load voice spreading settings with defaults
        setVoiceCount(preset.voiceCount || 1);
        setDetuneSpread(preset.detuneSpread || 0);
        setStereoSpread(preset.stereoSpread || 0);
        
        setFilterType(preset.filterType);
        setFilterFreq(preset.filterFreq);
        setFilterQ(preset.filterQ);
        setFilterGain(preset.filterGain);
        setFilterAttack(preset.filterAttack);
        setFilterDecay(preset.filterDecay);
        setFilterRelease(preset.filterRelease);
        setFilterEnvAmount(preset.filterEnvAmount);
        setDistortionAmount(preset.distortionAmount);
        setDistortionDist(preset.distortionDist);
        setFlangerAmount(preset.flangerAmount);
        setFlangerDepth(preset.flangerDepth);
        setFlangerRate(preset.flangerRate);
        setFlangerDelay(preset.flangerDelay);
        setFlangerFeedback(preset.flangerFeedback);
        setChorusAmount(preset.chorusAmount || 0);
        setChorusRate(preset.chorusRate || 0.6);
        setChorusDepth(preset.chorusDepth || 0.002);
        setChorusFeedback(preset.chorusFeedback || 0);
        setPhaserAmount(preset.phaserAmount || 0);
        setPhaserRate(preset.phaserRate || 0.5);
        setPhaserDepth(preset.phaserDepth || 800);
        setPhaserFeedback(preset.phaserFeedback || 0.3);
        setPhaserFrequency(preset.phaserFrequency || 800);
        setDelayAmount(preset.delayAmount);
        setDelayFeedback(preset.delayFeedback);
        setDelayTime(preset.delayTime);
        setDelayTone(preset.delayTone);
        setPingPongAmount(preset.pingPongAmount);
        setPingPongDelayTime(preset.pingPongDelayTime);
        setPingPongTone(preset.pingPongTone);
        setPingPongFeedback(preset.pingPongFeedback);
        setReverbType(preset.reverbType);
        setReverbAmount(preset.reverbAmount);
        setVibratoDepth(preset.vibratoDepth);
        setVibratoRate(preset.vibratoRate);
        setBitCrushAmount(preset.bitCrushAmount);
        setBitCrushDepth(preset.bitCrushDepth);
        setEqLowGain(preset.eqLowGain);
        setEqHighGain(preset.eqHighGain);
        setEqLowFreq(preset.eqLowFreq);
        setEqHighFreq(preset.eqHighFreq);

        // Load master limiter settings with defaults
        setMasterLimiterThreshold(preset.masterLimiterThreshold || -6);
        setMasterLimiterRatio(preset.masterLimiterRatio || 20);
        setMasterLimiterKnee(preset.masterLimiterKnee || 0);
        setMasterLimiterAttack(preset.masterLimiterAttack || 0.005);
        setMasterLimiterRelease(preset.masterLimiterRelease || 0.05);

        // Load noise settings with defaults
        setNoiseType(preset.noiseType || 'white');
        setNoiseMix(preset.noiseMix || 0);
        setNoiseFilterEnabled(preset.noiseFilterEnabled || false);
        setNoiseFilterQ(preset.noiseFilterQ || 1);

        // Load envelope shape settings with defaults
        setEnvelopeAttackShape(preset.envelopeAttackShape || 'exponential');
        setEnvelopeDecayShape(preset.envelopeDecayShape || 'exponential');
        setEnvelopeReleaseShape(preset.envelopeReleaseShape || 'exponential');
        setEnvelopeAttackExponent(preset.envelopeAttackExponent || 2);
        setEnvelopeDecayExponent(preset.envelopeDecayExponent || 2);
        setEnvelopeReleaseExponent(preset.envelopeReleaseExponent || 2);

        // Load filter envelope shape settings with defaults
        setFilterEnvelopeAttackShape(preset.filterEnvelopeAttackShape || 'exponential');
        setFilterEnvelopeDecayShape(preset.filterEnvelopeDecayShape || 'exponential');
        setFilterEnvelopeReleaseShape(preset.filterEnvelopeReleaseShape || 'exponential');
        setFilterEnvelopeAttackExponent(preset.filterEnvelopeAttackExponent || 2);
        setFilterEnvelopeDecayExponent(preset.filterEnvelopeDecayExponent || 2);
        setFilterEnvelopeReleaseExponent(preset.filterEnvelopeReleaseExponent || 2);

        // Load microtonal settings with defaults
        setPitchC(preset.pitchC || 1.0);
        setPitchCSharp(preset.pitchCSharp || 1.0);
        setPitchD(preset.pitchD || 1.0);
        setPitchDSharp(preset.pitchDSharp || 1.0);
        setPitchE(preset.pitchE || 1.0);
        setPitchF(preset.pitchF || 1.0);
        setPitchFSharp(preset.pitchFSharp || 1.0);
        setPitchG(preset.pitchG || 1.0);
        setPitchGSharp(preset.pitchGSharp || 1.0);
        setPitchA(preset.pitchA || 1.0);
        setPitchASharp(preset.pitchASharp || 1.0);
        setPitchB(preset.pitchB || 1.0);
        setOctaveRatio(preset.octaveRatio || 2.0);

        resetSynthPos();
    }, [currentPreset, customPresets]);

    // Batched async parameter updates to prevent audio crackling
    const batchedParameterUpdate = useRef({
        timer: null,
        pendingUpdates: new Map()
    });

    const scheduleParameterUpdate = (key, updateFn) => {
        batchedParameterUpdate.current.pendingUpdates.set(key, updateFn);
        
        if (batchedParameterUpdate.current.timer) {
            clearTimeout(batchedParameterUpdate.current.timer);
        }
        
        batchedParameterUpdate.current.timer = setTimeout(() => {
            // Use requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                try {
                    // Ensure AudioContext is running
                    if (AC.state === 'suspended') {
                        AC.resume().catch(console.error);
                    }
                    
                    // Execute all pending updates in a single batch
                    batchedParameterUpdate.current.pendingUpdates.forEach((updateFn, key) => {
                        try {
                            updateFn();
                        } catch (e) {
                            console.warn(`Parameter update failed for ${key}:`, e);
                        }
                    });
                    
                    batchedParameterUpdate.current.pendingUpdates.clear();
                } catch (e) {
                    console.warn('Batched parameter update failed:', e);
                }
            });
        }, 8); // 8ms = ~120fps, much faster response than before
    };

    // Sync node values to the current state on change
    useLayoutEffect(() => {
        scheduleParameterUpdate('master', () => {
            if (masterGain.getGain() !== masterVolume) masterGain.setGain(masterVolume);
            if (masterFilter.getType() !== masterFilterType) masterFilter.setType(masterFilterType);
            if (masterFilter.getFreq() !== masterFilterFreq) masterFilter.setFreq(masterFilterFreq);
            if (masterFilter.getQ() !== masterFilterQ) masterFilter.setQ(masterFilterQ);
            if (masterFilter.getGain() !== masterFilterGain) masterFilter.setGain(masterFilterGain);
        });
    }, [masterVolume, masterFilterType, masterFilterFreq, masterFilterQ, masterFilterGain]);

    useLayoutEffect(() => {
        scheduleParameterUpdate('synth', () => {
            const synth1 = synthArr[0];
            if (synth1.getWaveform() !== vcoType) synthArr.forEach((synth) => synth.setWaveform(vcoType));
            if (synth1.getDutyCycle() !== vcoDutyCycle) synthArr.forEach((synth) => synth.setDutyCycle(vcoDutyCycle));
            if (synth1.getSubOscOctaveOffset() !== subOscOctaveOffset) synthArr.forEach((synth) => synth.setSubOscOctaveOffset(subOscOctaveOffset));
            if (synth1.getSubOscWaveform() !== subOscType) synthArr.forEach((synth) => synth.setSubOscWaveform(subOscType));
            if (synth1.getOsc2Waveform() !== osc2Type) synthArr.forEach((synth) => synth.setOsc2Waveform(osc2Type));
            if (synth1.getOsc2DutyCycle() !== osc2DutyCycle) synthArr.forEach((synth) => synth.setOsc2DutyCycle(osc2DutyCycle));
            if (synth1.getOsc2Detune() !== osc2Detune) {
                // Capture single schedule time for synchronized detune changes
                const scheduleTime = AC.currentTime + 0.001;
                synthArr.forEach((synth) => synth.setOsc2Detune(osc2Detune, scheduleTime));
            }
            if (synth1.getOsc2Amount() !== osc2Amount) {
                synthArr.forEach((synth) => synth.setOsc2Amount(osc2Amount));
                
                // Note: osc2 is always started during initialization with synchronized timing
                // No need to resync here as phase alignment is maintained from init
            }
            if (synth1.getOsc2PhaseOffset() !== osc2PhaseOffset) {
                // Capture single schedule time for synchronized phase offset changes
                const scheduleTime = AC.currentTime + 0.001;
                synthArr.forEach((synth) => synth.setOsc2PhaseOffset(osc2PhaseOffset, scheduleTime));
            }
            if (synth1.getOsc2OctaveOffset() !== osc2OctaveOffset) {
                synthArr.forEach((synth) => synth.setOsc2OctaveOffset(osc2OctaveOffset));
            }
            if (synth1.getFilterType() !== filterType) synthArr.forEach((synth) => synth.setFilterType(filterType));
            if (synth1.getFilterFreq() !== filterFreq) synthArr.forEach((synth) => synth.setFilterFreq(filterFreq));
            if (synth1.getFilterQ() !== filterQ) synthArr.forEach((synth) => synth.setFilterQ(filterQ));
            if (synth1.getFilterGain() !== filterGain) synthArr.forEach((synth) => synth.setFilterGain(filterGain));
        });
    }, [vcoType, vcoDutyCycle, subOscOctaveOffset, subOscType, osc2Type, osc2DutyCycle, osc2Detune, osc2Amount, osc2PhaseOffset, osc2OctaveOffset, filterType, filterFreq, filterQ, filterGain]);

    useLayoutEffect(() => {
        scheduleParameterUpdate('voices', () => {
            synthArr.forEach((synth) => {
                synth.setVoiceCount(voiceCount);
                synth.setDetuneSpread(detuneSpread);
                synth.setStereoSpread(stereoSpread);
            });
        });
    }, [voiceCount, detuneSpread, stereoSpread]);

    // Split noise updates to avoid unnecessary operations
    useLayoutEffect(() => {
        scheduleParameterUpdate('noiseType', () => {
            synthArr.forEach((synth) => {
                synth.setNoiseType(noiseType);
            });
        });
    }, [noiseType]);

    useLayoutEffect(() => {
        scheduleParameterUpdate('noiseMix', () => {
            synthArr.forEach((synth) => {
                synth.setNoiseMix(noiseMix);
            });
        });
    }, [noiseMix]);

    useLayoutEffect(() => {
        scheduleParameterUpdate('noiseFilter', () => {
            synthArr.forEach((synth) => {
                synth.setNoiseFilterEnabled(noiseFilterEnabled);
                synth.setNoiseFilterQ(noiseFilterQ);
            });
        });
    }, [noiseFilterEnabled, noiseFilterQ]);

    useLayoutEffect(() => {
        scheduleParameterUpdate('effects', () => {
            if (masterDistortion.getAmount() !== distortionAmount) masterDistortion.setAmount(distortionAmount);
            if (masterDistortion.getDistortion() !== distortionDist) masterDistortion.setDistortion(distortionDist);
            
            if (masterFlanger.getAmount() !== flangerAmount) masterFlanger.setAmount(flangerAmount);
            if (masterFlanger.getDepth() !== flangerDepth) masterFlanger.setDepth(flangerDepth);
            if (masterFlanger.getRate() !== flangerRate) masterFlanger.setRate(flangerRate);
            if (masterFlanger.getFeedback() !== flangerFeedback) masterFlanger.setFeedback(flangerFeedback);
            if (masterFlanger.getDelay() !== flangerDelay) masterFlanger.setDelay(flangerDelay);
            
            if (masterChorus.getAmount() !== chorusAmount) masterChorus.setAmount(chorusAmount);
            if (masterChorus.getRate() !== chorusRate) masterChorus.setRate(chorusRate);
            if (masterChorus.getDepth() !== chorusDepth) masterChorus.setDepth(chorusDepth);
            if (masterChorus.getFeedback() !== chorusFeedback) masterChorus.setFeedback(chorusFeedback);
            
            if (masterPhaser.getAmount() !== phaserAmount) masterPhaser.setAmount(phaserAmount);
            if (masterPhaser.getRate() !== phaserRate) masterPhaser.setRate(phaserRate);
            if (masterPhaser.getDepth() !== phaserDepth) masterPhaser.setDepth(phaserDepth);
            if (masterPhaser.getFeedback() !== phaserFeedback) masterPhaser.setFeedback(phaserFeedback);
            if (masterPhaser.getFrequency() !== phaserFrequency) masterPhaser.setFrequency(phaserFrequency);
            
            if (masterDelay.getTone() !== delayTone) masterDelay.setTone(delayTone);
            if (masterDelay.getAmount() !== delayAmount) masterDelay.setAmount(delayAmount);
            if (masterDelay.getDelayTime() !== delayTime) masterDelay.setDelayTime(delayTime);
            if (masterDelay.getFeedback() !== delayFeedback) masterDelay.setFeedback(delayFeedback);
            
            if (masterPingPong.getDelayTime() !== pingPongDelayTime) masterPingPong.setDelayTime(pingPongDelayTime);
            if (masterPingPong.getFeedback() !== pingPongFeedback) masterPingPong.setFeedback(pingPongFeedback);
            if (masterPingPong.getTone() !== pingPongTone) masterPingPong.setTone(pingPongTone);
            if (masterPingPong.getAmount() !== pingPongAmount) masterPingPong.setAmount(pingPongAmount);
            
            if (masterReverb.getAmount() !== reverbAmount) masterReverb.setAmount(reverbAmount);
            if (masterReverb.getType() !== reverbType) masterReverb.setType(reverbType);
            
            if (masterBitCrush.getBitDepth() !== bitCrushDepth) masterBitCrush.setBitDepth(bitCrushDepth);
            if (masterBitCrush.getAmount() !== bitCrushAmount) masterBitCrush.setAmount(bitCrushAmount);
            
            if (vibratoLFO.getRate() !== vibratoRate) vibratoLFO.setRate(vibratoRate);
            if (vibratoLFO.getDepth() !== vibratoDepth) vibratoLFO.setDepth(vibratoDepth);
            
            if (masterEQ2.getLowGain() !== eqLowGain) masterEQ2.setLowGain(eqLowGain);
            if (masterEQ2.getHighGain() !== eqHighGain) masterEQ2.setHighGain(eqHighGain);
            if (masterEQ2.getLowFreq() !== eqLowFreq) masterEQ2.setLowFreq(eqLowFreq);
            if (masterEQ2.getHighFreq() !== eqHighFreq) masterEQ2.setHighFreq(eqHighFreq);
            
            if (masterLimiter.getThreshold() !== masterLimiterThreshold) masterLimiter.setThreshold(masterLimiterThreshold);
            if (masterLimiter.getRatio() !== masterLimiterRatio) masterLimiter.setRatio(masterLimiterRatio);
            masterLimiter.setKnee(masterLimiterKnee);
            masterLimiter.setAttack(masterLimiterAttack);
            masterLimiter.setRelease(masterLimiterRelease);
        });
    }, [
        distortionAmount, distortionDist, reverbType, reverbAmount, 
        delayTime, delayFeedback, delayTone, delayAmount, 
        vibratoDepth, vibratoRate, bitCrushDepth, bitCrushAmount, 
        eqLowGain, eqHighGain, eqLowFreq, eqHighFreq,
        masterLimiterThreshold, masterLimiterRatio, masterLimiterKnee, masterLimiterAttack, masterLimiterRelease,
        pingPongAmount, pingPongFeedback, pingPongDelayTime, pingPongTone,
        flangerAmount, flangerDelay, flangerDepth, flangerFeedback, flangerRate,
        chorusAmount, chorusRate, chorusDepth, chorusFeedback,
        phaserAmount, phaserRate, phaserDepth, phaserFeedback, phaserFrequency
    ]);

    // Update frequencies of all playing notes when microtonal parameters change
    useLayoutEffect(() => {
        scheduleParameterUpdate('microtonal', () => {
            synthArr.forEach(synth => {
                if (synth.getCurrentNoteInfo()) {
                    synth.updateNoteFrequency(pitchEnv);
                }
            });
        });
    }, [
        pitchC, pitchCSharp, pitchD, pitchDSharp, pitchE, pitchF, pitchFSharp,
        pitchG, pitchGSharp, pitchA, pitchASharp, pitchB, octaveRatio, allThemPitches
    ]);

    // Clean up arpeggiator when chord modes change
    useEffect(() => {
        // When transpose mode is disabled, keep arpeggiator playing but clear the transposed chord reference
        // so future operations don't use the old transposed chord
        if (!chordModeTranspose) {
            console.log('� Chord transpose mode disabled, clearing transposed chord reference but keeping arpeggiator');
            // Don't stop the arpeggiator if it's playing - let it continue with current chord
            // Just clear the reference so new transpose operations start fresh
            transposedChord.current = [];
        }
    }, [chordModeTranspose]);

    useEffect(() => {
        // Stop arpeggiator when captured chord is cleared
        if (capturedChord.length === 0 && arpeggiatorPlayingRef.current) {
            console.log('🛑 Captured chord cleared, stopping arpeggiator');
            stopArpeggiator();
        }
        // Clear transposed chord when captured chord changes
        if (capturedChord.length === 0) {
            transposedChord.current = [];
        }
    }, [capturedChord]);

    // Update arpeggiator immediately when settings change
    useEffect(() => {
        if (arpeggiatorPlayingRef.current) {
            console.log('🔄 Arpeggiator mode changed, updating without stopping');
            // Just reset the index to start fresh with the new mode
            arpeggiatorCurrentIndex.current = 0;
            arpeggiatorDirection.current = 1;
            
            // Cancel the current timeout and reschedule on beat
            if (arpeggiatorTimeoutId.current) {
                clearTimeout(arpeggiatorTimeoutId.current);
                arpeggiatorTimeoutId.current = null;
            }
            
            // Schedule the next note with the new mode on beat
            scheduleNextArpeggiatorNoteOnBeat();
        }
    }, [arpeggiatorMode]);

    useEffect(() => {
        if (arpeggiatorPlayingRef.current) {
            console.log('⏰ Arpeggiator timing settings changed, updating timing');
            // Cancel the current timeout and reschedule with new timing on beat
            if (arpeggiatorTimeoutId.current) {
                clearTimeout(arpeggiatorTimeoutId.current);
                arpeggiatorTimeoutId.current = null;
            }
            
            // Schedule the next note with the new timing on beat
            scheduleNextArpeggiatorNoteOnBeat();
        }
    }, [arpeggiatorRate, arpeggiatorDuration]);

    // Needed to avoid stale hook state
    useEffect(() => {
        // engageKeyboard();
        // return disengageKeyboard;
    });

    return (
        <div className={`${BASE_CLASS_NAME} ${className}`.trim()}>
            <ModuleGridContainer>

                <Module label="VCO">
                    <KnobGrid columns={4} rows={3}>
                        <Select
                            label="Waveform"
                            options={WAVEFORM}
                            value={vcoType}
                            onUpdate={(val) => setVcoType(val)}
                        />
                        <Knob
                            label="Duty Cycle"
                            value={vcoDutyCycle}
                            modifier={1}
                            min={0.01}
                            max={0.99}
                            disabled={vcoType !== 'square_dc'}
                            onUpdate={(val) => setVcoDutyCycle(val)}
                        />
                        <Knob
                            label="Sub Osc"
                            value={subOscOctaveOffset}
                            modifier={6}
                            offset={-3}
                            decimalPlaces={0}
                            onUpdate={(val) => setSubOscOctaveOffset(Math.round(val))}
                        />
                        <Select
                            label="Sub Wave"
                            options={WAVEFORM}
                            value={subOscType}
                            onUpdate={(val) => setSubOscType(val)}
                        />
                        <Select
                            label="Osc2 Wave"
                            options={WAVEFORM}
                            value={osc2Type}
                            onUpdate={(val) => setOsc2Type(val)}
                        />
                        <Knob
                            label="Osc2 Duty"
                            value={osc2DutyCycle}
                            modifier={1}
                            min={0.01}
                            max={0.99}
                            disabled={osc2Type !== 'square_dc'}
                            onUpdate={(val) => setOsc2DutyCycle(val)}
                        />
                        <Knob
                            label="Osc2 Detune"
                            value={osc2Detune}
                            modifier={100}
                            offset={0}
                            min={-100}
                            max={100}
                            resetValue={0}
                            decimalPlaces={1}
                            disabled={osc2Type === 'off'}
                            onUpdate={(val) => setOsc2Detune(val)}
                        />
                        <Knob
                            label="Osc2 Octave"
                            value={osc2OctaveOffset}
                            modifier={6}
                            offset={-3}
                            decimalPlaces={0}
                            disabled={osc2Type === 'off'}
                            onUpdate={(val) => setOsc2OctaveOffset(Math.round(val))}
                        />
                        <Knob
                            label="Osc2 Amount"
                            value={osc2Amount}
                            modifier={1}
                            min={0}
                            max={1}
                            resetValue={0}
                            decimalPlaces={2}
                            disabled={osc2Type === 'off'}
                            onUpdate={(val) => setOsc2Amount(val)}
                        />
                        <Knob
                            label="Osc2 Phase"
                            value={osc2PhaseOffset}
                            modifier={360}
                            min={0}
                            max={360}
                            resetValue={0}
                            decimalPlaces={0}
                            disabled={osc2Type === 'off'}
                            onUpdate={(val) => setOsc2PhaseOffset(Math.round(val))}
                        />
                    </KnobGrid>
                </Module>

                <Module label="Voicing">
                    <KnobGrid columns={2} rows={3}>
                        <Knob
                            label="Polyphony"
                            value={polyphony}
                            modifier={7}
                            offset={1}
                            resetValue={8}
                            isRounded
                            onUpdate={(val) => {
                                setPolyphony(val);
                                resetSynthPos();
                            }}
                        />
                        <Knob
                            label="Portamento"
                            value={portamentoSpeed}
                            modifier={0.5}
                            onUpdate={(val) => setPortamentoSpeed(val)}
                            disabled={polyphony !== 1}
                        />
                        <Select
                            label="Type"
                            options={NOISE}
                            value={noiseType}
                            onUpdate={(val) => setNoiseType(val)}
                        />
                        <Knob
                            label="Mix"
                            value={noiseMix}
                            modifier={1}
                            min={0}
                            max={1}
                            onUpdate={(val) => setNoiseMix(val)}
                        />
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={() => setNoiseFilterEnabled(!noiseFilterEnabled)}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: `2px solid ${noiseFilterEnabled ? '#4CAF50' : '#666'}`,
                                    borderRadius: '4px',
                                    background: noiseFilterEnabled ? '#4CAF50' : '#333',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '60px',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => {
                                    if (noiseFilterEnabled) {
                                        e.target.style.background = '#45a049';
                                    } else {
                                        e.target.style.background = '#555';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    e.target.style.background = noiseFilterEnabled ? '#4CAF50' : '#333';
                                }}
                            >
                                {noiseFilterEnabled ? 'ON' : 'OFF'}
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                Filter
                            </span>
                        </div>
                        <Knob
                            label="Filter Q"
                            value={noiseFilterQ}
                            modifier={10}
                            min={0.1}
                            max={30}
                            disabled={!noiseFilterEnabled}
                            onUpdate={(val) => setNoiseFilterQ(val)}
                        />
                    </KnobGrid>
                </Module>
                

                <Module label="Gain Envelope">
                    <KnobGrid columns={2} rows={3}>
                        <Knob
                            label="Attack"
                            value={gainAttack}
                            modifier={3}
                            onUpdate={(val) => setGainAttack(val)}
                        />
                        <Knob
                            label="Decay"
                            value={gainDecay}
                            modifier={3}
                            onUpdate={(val) => setGainDecay(val)}
                        />
                        <Knob
                            label="Sustain"
                            modifier={0.7}
                            value={gainSustain}
                            onUpdate={(val) => setGainSustain(val)}
                        />
                        <Knob
                            label="Release"
                            value={gainRelease}
                            modifier={3}
                            onUpdate={(val) => setGainRelease(val)}
                        />
                        <Knob
                            label="Hold"
                            value={gainHold}
                            modifier={3}
                            onUpdate={(val) => setGainHold(val)}
                        />
                        <Knob
                            label="Hold Level"
                            value={gainHoldLevel}
                            modifier={3}
                            onUpdate={(val) => setGainHoldLevel(val)}
                        />
                    </KnobGrid>
                </Module>


                
                <Module label="Envelope Shape">
                    <KnobGrid columns={2} rows={3}>
                        <Select
                            label="Attack"
                            options={ENVELOPE_SHAPE}
                            value={envelopeAttackShape}
                            onUpdate={(val) => setEnvelopeAttackShape(val)}
                        />
                        <Select
                            label="Decay"
                            options={ENVELOPE_SHAPE}
                            value={envelopeDecayShape}
                            onUpdate={(val) => setEnvelopeDecayShape(val)}
                        />
                        <Select
                            label="Release"
                            options={ENVELOPE_SHAPE}
                            value={envelopeReleaseShape}
                            onUpdate={(val) => setEnvelopeReleaseShape(val)}
                        />
                        <Knob
                            label="Attack Exp"
                            value={envelopeAttackExponent}
                            modifier={4}
                            offset={0.1}
                            resetValue={2}
                            decimalPlaces={1}
                            onUpdate={(val) => setEnvelopeAttackExponent(val)}
                        />
                        <Knob
                            label="Decay Exp"
                            value={envelopeDecayExponent}
                            modifier={4}
                            offset={0.1}
                            resetValue={2}
                            decimalPlaces={1}
                            onUpdate={(val) => setEnvelopeDecayExponent(val)}
                        />
                        <Knob
                            label="Release Exp"
                            value={envelopeReleaseExponent}
                            modifier={4}
                            offset={0.1}
                            resetValue={2}
                            decimalPlaces={1}
                            onUpdate={(val) => setEnvelopeReleaseExponent(val)}
                        />
                    </KnobGrid>
                </Module>
                <Module label="Master Limiter">
                    <KnobGrid columns={2} rows={3}>
                        <Knob
                            label="Threshold"
                            type="B"
                            value={masterLimiterThreshold}
                            modifier={48}
                            offset={-24}
                            resetValue={-6}
                            decimalPlaces={1}
                            onUpdate={(val) => setMasterLimiterThreshold(val)}
                        />
                        <Knob
                            label="Ratio"
                            value={masterLimiterRatio}
                            modifier={19}
                            offset={1}
                            resetValue={20}
                            isRounded
                            onUpdate={(val) => setMasterLimiterRatio(val)}
                        />
                        <Knob
                            label="Knee"
                            value={masterLimiterKnee}
                            modifier={40}
                            resetValue={0}
                            decimalPlaces={1}
                            onUpdate={(val) => setMasterLimiterKnee(val)}
                        />
                        <Knob
                            label="Attack"
                            value={masterLimiterAttack}
                            scalingType="logarithmic"
                            minValue={0.0001}
                            maxValue={1}
                            resetValue={0.005}
                            decimalPlaces={4}
                            onUpdate={(val) => setMasterLimiterAttack(val)}
                        />
                        <Knob
                            label="Release"
                            value={masterLimiterRelease}
                            scalingType="logarithmic"
                            minValue={0.001}
                            maxValue={3}
                            resetValue={0.05}
                            decimalPlaces={3}
                            onUpdate={(val) => setMasterLimiterRelease(val)}
                        />
                    </KnobGrid>
                </Module>

                
                <Module label="Flanger">
                    <KnobGrid columns={2} rows={3}>
                        <Knob
                            label="Delay"
                            value={flangerDelay}
                            decimalPlaces={5}
                            modifier={0.015}
                            offset={0.005}
                            resetValue={0.01}
                            onUpdate={(val) => setFlangerDelay(val)}
                        />
                        <Knob
                            label="Depth"
                            value={flangerDepth}
                            decimalPlaces={5}
                            modifier={0.005}
                            onUpdate={(val) => setFlangerDepth(val)}
                        />
                        <Knob
                            label="Rate"
                            value={flangerRate}
                            modifier={2}
                            onUpdate={(val) => setFlangerRate(val)}
                        />
                        <Knob
                            label="Feedback"
                            value={flangerFeedback}
                            onUpdate={(val) => setFlangerFeedback(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={flangerAmount}
                            onUpdate={(val) => setFlangerAmount(val)}
                        />
                    </KnobGrid>
                </Module>

                <Module label="Phaser">
                    <KnobGrid columns={2} rows={3}>
                        <Knob
                            label="Rate"
                            value={phaserRate}
                            modifier={5}
                            resetValue={0.5}
                            decimalPlaces={2}
                            onUpdate={(val) => setPhaserRate(val)}
                        />
                        <Knob
                            label="Depth"
                            value={phaserDepth}
                            modifier={1000}
                            resetValue={800}
                            isRounded
                            onUpdate={(val) => setPhaserDepth(val)}
                        />
                        <Knob
                            label="Frequency"
                            value={phaserFrequency}
                            scalingType="logarithmic"
                            minValue={200}
                            maxValue={8000}
                            resetValue={800}
                            isRounded
                            onUpdate={(val) => setPhaserFrequency(val)}
                        />
                        <Knob
                            label="Feedback"
                            value={phaserFeedback}
                            resetValue={0.3}
                            onUpdate={(val) => setPhaserFeedback(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={phaserAmount}
                            onUpdate={(val) => setPhaserAmount(val)}
                        />
                    </KnobGrid>
                </Module>
                


                <Module label="Drive">
                    <KnobGrid columns={1} rows={2}>
                        <Knob
                            label="Distortion"
                            value={distortionDist}
                            modifier={30}
                            onUpdate={(val) => setDistortionDist(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={distortionAmount}
                            onUpdate={(val) => setDistortionAmount(val)}
                        />
                    </KnobGrid>
                </Module>

                <Module label="Crush">
                    <KnobGrid columns={1} rows={2}>
                        <Knob
                            label="Bit Depth"
                            value={bitCrushDepth}
                            modifier={14}
                            resetValue={8}
                            offset={2}
                            isRounded
                            onUpdate={(val) => setBitCrushDepth(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={bitCrushAmount}
                            onUpdate={(val) => setBitCrushAmount(val)}
                        />
                    </KnobGrid>
                </Module>
                
                <Module label="Information">
                    <KnobGrid columns={3} rows={3}>
                            <Knob
                                label="Master Vol"
                                value={masterVolume}
                                onUpdate={(val) => setMasterVolume(val)}
                            />
                        <InfoContainer style={{ marginBottom: 0 }}>
                            <PopText>Preset</PopText>
                            <InfoSelect
                                value={currentPreset}
                                onChange={(e) => {
                                    setCurrentPreset(e.target.value);
                                    e.target.blur();
                                }}
                            >
                                {/* Built-in presets */}
                                {Object.keys(presetData).map((preset) => (
                                    <option key={`Preset_${preset}`} value={preset}>{preset}</option>
                                ))}
                                {/* Custom presets */}
                                {Object.keys(customPresets).length > 0 && (
                                    <optgroup label="Custom Presets">
                                        {Object.keys(customPresets).map((preset) => (
                                            <option key={`CustomPreset_${preset}`} value={preset}>{preset}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </InfoSelect>
                        </InfoContainer>
                        <InfoContainer style={{ marginBottom: 0 }}>
                            <PopText>Theme</PopText>
                            <InfoSelect
                                value={currentTheme}
                                onChange={(e) => {
                                    setTheme(e.target.value);
                                    localStorage.setItem('PolySynth-Theme', e.target.value);
                                    e.target.blur();
                                }}
                            >
                                {Object.keys(THEMES).map(theme => (
                                    <option key={`themes_${theme}`} value={theme}>{theme}</option>
                                ))}
                            </InfoSelect>
                        </InfoContainer>
                        
                        {/* Preset Management Buttons */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={saveCustomPreset}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: '2px solid #4CAF50',
                                    borderRadius: '4px',
                                    background: '#4CAF50',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '80px',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#45a049'}
                                onMouseOut={(e) => e.target.style.background = '#4CAF50'}
                            >
                                Save
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                Custom Preset
                            </span>
                        </div>
                        
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={copyPresetToClipboard}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: '2px solid #2196F3',
                                    borderRadius: '4px',
                                    background: '#2196F3',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '80px',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#1976D2'}
                                onMouseOut={(e) => e.target.style.background = '#2196F3'}
                            >
                                Copy
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                To Clipboard
                            </span>
                        </div>
                        
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={pastePresetFromClipboard}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: '2px solid #FF9800',
                                    borderRadius: '4px',
                                    background: '#FF9800',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '80px',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#F57C00'}
                                onMouseOut={(e) => e.target.style.background = '#FF9800'}
                            >
                                Paste
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                From Clipboard
                            </span>
                        </div>
                        
                        {/* Delete Custom Preset Button - only show if current preset is custom */}
                        {customPresets[currentPreset] && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                justifyContent: 'center'
                            }}>
                                <button
                                    onClick={() => deleteCustomPreset(currentPreset)}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '11px',
                                        border: '2px solid #f44336',
                                        borderRadius: '4px',
                                        background: '#f44336',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        fontFamily: 'inherit',
                                        minWidth: '80px',
                                        fontWeight: 'bold'
                                    }}
                                    onMouseOver={(e) => e.target.style.background = '#d32f2f'}
                                    onMouseOut={(e) => e.target.style.background = '#f44336'}
                                >
                                    Delete
                                </button>
                                <span style={{ 
                                    fontSize: '10px', 
                                    color: '#999',
                                    textAlign: 'center',
                                    lineHeight: '1.2'
                                }}>
                                    Custom Preset
                                </span>
                            </div>
                        )}
                    </KnobGrid>
                </Module>




                <Module label="Filter">
                    <KnobGrid columns={4} rows={2}>
                        <Select
                            label="Type"
                            options={FILTER}
                            value={filterType}
                            onUpdate={(val) => setFilterType(val)}
                        />
                        <Knob
                            label="Cutoff"
                            value={filterFreq}
                            scalingType="logarithmic"
                            minValue={20}
                            maxValue={11020}
                            resetValue={11000}
                            isRounded
                            onUpdate={(val) => setFilterFreq(val)}
                        />
                        <Knob
                            label="Q"
                            value={filterQ}
                            modifier={20}
                            onUpdate={(val) => setFilterQ(val)}
                        />
                        <Knob
                            label="Gain"
                            type="B"
                            value={filterGain}
                            modifier={40}
                            onUpdate={(val) => setFilterGain(val)}
                        />
                        <Knob
                            label="Attack"
                            value={filterAttack}
                            modifier={3}
                            onUpdate={(val) => setFilterAttack(val)}
                        />
                        <Knob
                            label="Decay"
                            value={filterDecay}
                            modifier={3}
                            onUpdate={(val) => setFilterDecay(val)}
                        />
                        <Knob
                            label="Release"
                            value={filterRelease}
                            modifier={3}
                            onUpdate={(val) => setFilterRelease(val)}
                        />
                        <Knob
                            label="Amount"
                            type="A"
                            modifier={11000}
                            scalingType="symmetric-log"
                            isRounded
                            value={filterEnvAmount}
                            onUpdate={(val) => setFilterEnvAmount(val)}
                        />
                    </KnobGrid>
                </Module>
                
                <Module label="EQ2">
                    <KnobGrid columns={2} rows={2}>
                        <Knob
                            label="Low Gain"
                            type="B"
                            modifier={24}
                            value={eqLowGain}
                            onUpdate={(val) => setEqLowGain(val)}
                        />
                        <Knob
                            label="High Gain"
                            type="B"
                            modifier={24}
                            value={eqHighGain}
                            onUpdate={(val) => setEqHighGain(val)}
                        />
                        <Knob
                            label="Low Freq"
                            modifier={640}
                            resetValue={320}
                            isRounded
                            value={eqLowFreq}
                            onUpdate={(val) => setEqLowFreq(val)}
                        />
                        <Knob
                            label="High Freq"
                            modifier={8600}
                            resetValue={3200}
                            offset={2400}
                            isRounded
                            value={eqHighFreq}
                            onUpdate={(val) => setEqHighFreq(val)}
                        />
                    </KnobGrid>
                </Module>
                
                <Module label="Delay">
                    <KnobGrid columns={2} rows={2}>
                        <Knob
                            label="Time"
                            value={delayTime}
                            onUpdate={(val) => setDelayTime(val)}
                        />
                        <Knob
                            label="Feedback"
                            value={delayFeedback}
                            onUpdate={(val) => setDelayFeedback(val)}
                        />
                        <Knob
                            label="Tone"
                            value={delayTone}
                            modifier={11000}
                            resetValue={4400}
                            isRounded
                            onUpdate={(val) => setDelayTone(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={delayAmount}
                            onUpdate={(val) => setDelayAmount(val)}
                        />
                    </KnobGrid>
                </Module>


                <Module label="Ping Pong Delay">
                    <KnobGrid columns={2} rows={2}>
                        <Knob
                            label="Time"
                            value={pingPongDelayTime}
                            onUpdate={(val) => setPingPongDelayTime(val)}
                        />
                        <Knob
                            label="Feedback"
                            value={pingPongFeedback}
                            onUpdate={(val) => setPingPongFeedback(val)}
                        />
                        <Knob
                            label="Tone"
                            value={pingPongTone}
                            modifier={11000}
                            resetValue={4400}
                            isRounded
                            onUpdate={(val) => setPingPongTone(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={pingPongAmount}
                            onUpdate={(val) => setPingPongAmount(val)}
                        />
                    </KnobGrid>
                </Module>
                
                <Module label="Master Filter">
                    <KnobGrid columns={2} rows={2}>
                        <Select
                            label="Type"
                            options={FILTER}
                            value={masterFilterType}
                            onUpdate={(val) => setMasterFilterType(val)}
                        />
                        <Knob
                            label="Cutoff"
                            value={masterFilterFreq}
                            scalingType="logarithmic"
                            minValue={20}
                            maxValue={11020}
                            resetValue={11000}
                            isRounded
                            onUpdate={(val) => setMasterFilterFreq(val)}
                        />
                        <Knob
                            label="Q"
                            value={masterFilterQ}
                            modifier={20}
                            onUpdate={(val) => setMasterFilterQ(val)}
                        />
                        <Knob
                            label="Gain"
                            type="B"
                            value={masterFilterGain}
                            modifier={40}
                            onUpdate={(val) => setMasterFilterGain(val)}
                        />
                    </KnobGrid>
                </Module>
                

                <Module label="Chorus">
                    <KnobGrid columns={2} rows={2}>
                        <Knob
                            label="Rate"
                            value={chorusRate}
                            modifier={5}
                            resetValue={0.6}
                            decimalPlaces={2}
                            onUpdate={(val) => setChorusRate(val)}
                        />
                        <Knob
                            label="Depth"
                            value={chorusDepth}
                            modifier={0.01}
                            resetValue={0.002}
                            decimalPlaces={4}
                            onUpdate={(val) => setChorusDepth(val)}
                        />
                        <Knob
                            label="Feedback"
                            value={chorusFeedback}
                            onUpdate={(val) => setChorusFeedback(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={chorusAmount}
                            onUpdate={(val) => setChorusAmount(val)}
                        />
                    </KnobGrid>
                </Module>

                <Module label="Voices">
                    <KnobGrid columns={2} rows={2}>
                        <Knob
                            label="Voices"
                            value={voiceCount}
                            modifier={8}
                            offset={1}
                            min={1}
                            max={8}
                            resetValue={1}
                            decimalPlaces={0}
                            onUpdate={(val) => setVoiceCount(Math.round(val))}
                        />
                        <Knob
                            label="Detune Spread"
                            value={detuneSpread}
                            modifier={100}
                            min={0}
                            max={100}
                            resetValue={0}
                            decimalPlaces={1}
                            onUpdate={(val) => setDetuneSpread(val)}
                        />
                        <Knob
                            label="Stereo Spread"
                            value={stereoSpread}
                            modifier={100}
                            min={0}
                            max={100}
                            resetValue={0}
                            decimalPlaces={1}
                            onUpdate={(val) => setStereoSpread(val)}
                        />
                        </KnobGrid>
                        </Module>
                <Module label="Vibrato">
                    <KnobGrid columns={1} rows={2}>
                        <Knob
                            label="Depth"
                            value={vibratoDepth}
                            modifier={200}
                            onUpdate={(val) => setVibratoDepth(val)}
                        />
                        <Knob
                            label="Rate"
                            value={vibratoRate}
                            modifier={50}
                            onUpdate={(val) => setVibratoRate(val)}
                        />
                    </KnobGrid>
                </Module>




                <Module label="Reverb">
                    <KnobGrid columns={1} rows={2}>
                        <Select
                            label="Type"
                            options={REVERB}
                            value={reverbType}
                            onUpdate={(val) => setReverbType(val)}
                        />
                        <Knob
                            label="Dry/Wet"
                            value={reverbAmount}
                            onUpdate={(val) => setReverbAmount(val)}
                        />
                    </KnobGrid>
                </Module>


                
                {/* Arpeggiator Module */}
                <Module label="Arpeggiator">
                    <KnobGrid columns={3}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <Select
                                label="Mode"
                                options={ARPEGGIATOR_MODES}
                                value={arpeggiatorMode}
                                onUpdate={(val) => setArpeggiatorMode(val)}
                            />
                        </div>
                        
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <Knob
                                label="Rate"
                                value={arpeggiatorRate}
                                modifier={4}
                                offset={-2}
                                decimalPlaces={0}
                                onUpdate={(val) => setArpeggiatorRate(Math.round(val))}
                            />
                        </div>
                        
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <Knob
                                label="Duration"
                                value={arpeggiatorDuration}
                                modifier={4}
                                offset={-2}
                                decimalPlaces={0}
                                onUpdate={(val) => setArpeggiatorDuration(Math.round(val))}
                            />
                        </div>
                        
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={() => {
                                    if (!chordModeCapture) {
                                        // Get currently active notes from the global noteArray in index.js
                                        const currentNotes = window.noteArray ? Object.keys(window.noteArray) : [];
                                        setChordModeCapture(true);
                                        chordModeCaptureRef.current = true; // Update ref immediately
                                        startChordCapture(currentNotes);
                                    } else {
                                        // Cancel capture mode
                                        console.log('❌ Cancelling chord capture mode');
                                        setChordModeCapture(false);
                                        chordModeCaptureRef.current = false; // Update ref immediately
                                        isCapturing.current = false;
                                        if (chordCaptureTimeout.current) {
                                            clearTimeout(chordCaptureTimeout.current);
                                            chordCaptureTimeout.current = null;
                                        }
                                    }
                                }}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: `2px solid ${chordModeCapture ? '#FF6B35' : '#666'}`,
                                    borderRadius: '4px',
                                    background: chordModeCapture ? '#FF6B35' : '#333',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '60px',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => {
                                    if (chordModeCapture) {
                                        e.target.style.background = '#E55A2B';
                                    } else {
                                        e.target.style.background = '#555';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    e.target.style.background = chordModeCapture ? '#FF6B35' : '#333';
                                }}
                            >
                                {chordModeCapture ? (isCapturing.current ? 'WAITING...' : 'CANCEL') : 'CAPTURE'}
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                {capturedChord.length > 0 ? `${capturedChord.length} notes` : 'No chord'}
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={() => {
                                    const newTransposeState = !chordModeTranspose;
                                    console.log('🎛️ Transpose button clicked, current state:', chordModeTranspose);
                                    console.log('🎛️ Captured chord:', capturedChord);
                                    setChordModeTranspose(newTransposeState);
                                    chordModeTransposeRef.current = newTransposeState; // Update ref immediately
                                    console.log('🎛️ New transpose state will be:', newTransposeState);
                                }}
                                disabled={capturedChord.length === 0}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: `2px solid ${chordModeTranspose ? '#4CAF50' : '#666'}`,
                                    borderRadius: '4px',
                                    background: chordModeTranspose ? '#4CAF50' : (capturedChord.length === 0 ? '#222' : '#333'),
                                    color: capturedChord.length === 0 ? '#666' : '#fff',
                                    cursor: capturedChord.length === 0 ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '60px',
                                    fontWeight: 'bold',
                                    opacity: capturedChord.length === 0 ? 0.5 : 1
                                }}
                                onMouseOver={(e) => {
                                    if (capturedChord.length === 0) return;
                                    if (chordModeTranspose) {
                                        e.target.style.background = '#45a049';
                                    } else {
                                        e.target.style.background = '#555';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (capturedChord.length === 0) return;
                                    e.target.style.background = chordModeTranspose ? '#4CAF50' : '#333';
                                }}
                            >
                                {chordModeTranspose ? 'ON' : 'OFF'}
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                Transpose
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={toggleArpeggiator}
                                disabled={capturedChord.length === 0}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: `2px solid ${arpeggiatorPlaying ? '#4CAF50' : '#666'}`,
                                    borderRadius: '4px',
                                    background: arpeggiatorPlaying ? '#4CAF50' : (capturedChord.length === 0 ? '#222' : '#333'),
                                    color: capturedChord.length === 0 ? '#666' : '#fff',
                                    cursor: capturedChord.length === 0 ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '60px',
                                    fontWeight: 'bold',
                                    opacity: capturedChord.length === 0 ? 0.5 : 1
                                }}
                                onMouseOver={(e) => {
                                    if (capturedChord.length === 0) return;
                                    if (arpeggiatorPlaying) {
                                        e.target.style.background = '#45a049';
                                    } else {
                                        e.target.style.background = '#555';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (capturedChord.length === 0) return;
                                    e.target.style.background = arpeggiatorPlaying ? '#4CAF50' : '#333';
                                }}
                            >
                                {arpeggiatorPlaying ? 'STOP' : 'PLAY'}
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                Play/Stop
                            </span>
                        </div>
                    </KnobGrid>
                </Module>

                {/* <Lines /> */}
                <Module label="Spectrum">
                    <SpectrumAnalyzer audioCtx={AC} sourceNode={masterGain} />
                </Module>

                <MicrotonalModule label="Microtonal">
                    <KnobGrid columns={15} rows={1}>
                        <Knob
                            label="C"
                            value={pitchC}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchC(val)}
                        />
                        <Knob
                            label="C#"
                            value={pitchCSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchCSharp(val)}
                        />
                        <Knob
                            label="D"
                            value={pitchD}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchD(val)}
                        />
                        <Knob
                            label="D#"
                            value={pitchDSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchDSharp(val)}
                        />
                        <Knob
                            label="E"
                            value={pitchE}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchE(val)}
                        />
                        <Knob
                            label="F"
                            value={pitchF}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchF(val)}
                        />
                        <Knob
                            label="F#"
                            value={pitchFSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchFSharp(val)}
                        />
                        <Knob
                            label="G"
                            value={pitchG}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchG(val)}
                        />
                        <Knob
                            label="G#"
                            value={pitchGSharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchGSharp(val)}
                        />
                        <Knob
                            label="A"
                            value={pitchA}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchA(val)}
                        />
                        <Knob
                            label="A#"
                            value={pitchASharp}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchASharp(val)}
                        />
                        <Knob
                            label="B"
                            value={pitchB}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={1.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setPitchB(val)}
                        />
                        <Knob
                            label="Octave Ratio"
                            value={octaveRatio}
                            modifier={2.0}
                            offset={1.0}
                            resetValue={2.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setOctaveRatio(val)}
                        />
                        <Knob
                            label="All Them Pitches"
                            value={pitchEnv.AllThemPitches}
                            modifier={1.5}
                            offset={0.5}
                            resetValue={2.0}
                            decimalPlaces={3}
                            onUpdate={(val) => setAllThemPitches(val)}
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
                                    fontFamily: 'inherit',
                                    minWidth: '80px'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#555'}
                                onMouseOut={(e) => e.target.style.background = '#333'}
                            >
                                Reset All
                            </button>
                            <button 
                                onClick={resynchronizeAllSynths}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '11px',
                                    border: '1px solid #FF6B35',
                                    borderRadius: '4px',
                                    background: '#FF6B35',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    minWidth: '80px',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#e55a2b'}
                                onMouseOut={(e) => e.target.style.background = '#FF6B35'}
                            >
                                Resync
                            </button>
                            <span style={{ 
                                fontSize: '10px', 
                                color: '#999',
                                textAlign: 'center',
                                lineHeight: '1.2'
                            }}>
                                Oscillators
                            </span>
                        </div>
                    </KnobGrid>
                </MicrotonalModule>
                {/* <Module label="Spectrogram">
                    <Spectrogram audioCtx={AC} sourceNode={masterGain} />
                </Module> */}
                <Module label="Oscilloscope">
                    <Oscilloscope audioCtx={AC} sourceNode={masterGain} />
                </Module>



            </ModuleGridContainer>
        </div>
    );
});

PolySynth.propTypes = {
    className: PropTypes.string,
    currentTheme: PropTypes.string.isRequired,
    setTheme: PropTypes.func.isRequired,
};

PolySynth.defaultProps = {
    className: '',
};

export default PolySynth;
