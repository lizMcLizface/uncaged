import React, { useRef, useEffect, useState } from 'react';
import { ComponentContainer, Canvas, Label } from './Oscilloscope.styled';

const BASE_CLASS_NAME = 'Oscilloscope';

const Oscilloscope = ({ audioCtx, sourceNode, className = '' }) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const triggerStateRef = useRef({
        previousSample: 128, // Previous sample for edge detection
        triggerThreshold: 135, // Threshold for triggering (slightly above center)
        hysteresis: 5, // Hysteresis to prevent noise triggering
        enabled: true,
        currentState: 0, // -1: below hysteresis, 0: in hysteresis, 1: above threshold
        lastStateChange: 0, // Previous state when it last changed
        stateHistory: [] // Track recent state changes for transition detection
    });

    useEffect(() => {
        if (!audioCtx || !sourceNode) return;

        // Create analyser node
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = Math.pow(2, 14); // 4096 points for better frequency resolution
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Connect source to analyser
        sourceNode.connect(analyser);
        analyserRef.current = { analyser, dataArray, bufferLength };

        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        
        // Set canvas size to match its displayed size
        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
                canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
            }
        };

        // Initial resize - use setTimeout to ensure DOM is fully laid out
        setTimeout(resizeCanvas, 0);
        
        // Set up ResizeObserver to handle canvas size changes
        const resizeObserver = new ResizeObserver(resizeCanvas);
        resizeObserver.observe(canvas);
        
        window.addEventListener('resize', resizeCanvas);

        const draw = () => {
            if (!analyserRef.current) return;
            
            const { analyser, dataArray, bufferLength } = analyserRef.current;
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            // Get waveform data
            analyser.getByteTimeDomainData(dataArray);

            // Find trigger point
            let triggerIndex = -1;
            const triggerState = triggerStateRef.current;
            
            if (triggerState.enabled) {
                const lowerThreshold = triggerState.triggerThreshold - triggerState.hysteresis;
                const upperThreshold = triggerState.triggerThreshold;
                const allTriggers = []; // Collect all trigger points
                
                // Reset state tracking for this buffer
                let currentState = triggerState.currentState;
                const stateHistory = [];
                
                // Track state changes through the waveform
                for (let i = 0; i < bufferLength; i++) {
                    const currentSample = dataArray[i];
                    let newState;
                    
                    // Determine current state based on sample value
                    if (currentSample < lowerThreshold) {
                        newState = -1; // Below hysteresis
                    } else if (currentSample >= upperThreshold) {
                        newState = 1;  // Above threshold
                    } else {
                        newState = 0;  // In hysteresis zone
                    }
                    
                    // Check if state changed
                    if (newState !== currentState) {
                        // Update state history
                        stateHistory.push({
                            fromState: currentState,
                            toState: newState,
                            index: i,
                            value: currentSample
                        });
                        
                        // Check for valid trigger sequence: -1 -> 0 -> 1 (rising edge through hysteresis)
                        if (stateHistory.length >= 2) {
                            const recent = stateHistory.slice(-2);
                            
                            // Look for the pattern: below -> hysteresis -> above
                            if (recent[0].fromState === -1 && recent[0].toState === 0 &&
                                recent[1].fromState === 0 && recent[1].toState === 1) {
                                allTriggers.push({
                                    index: recent[1].index,
                                    value: recent[1].value
                                });
                            }
                        }
                        
                        // Update current state
                        currentState = newState;
                    }
                }
                
                // Find the trigger closest to the middle of the buffer
                if (allTriggers.length > 0) {
                    const bufferMiddle = bufferLength / 2;
                    let closestTrigger = allTriggers[0];
                    let smallestDistance = Math.abs(closestTrigger.index - bufferMiddle);
                    
                    for (let i = 1; i < allTriggers.length; i++) {
                        const distance = Math.abs(allTriggers[i].index - bufferMiddle);
                        if (distance < smallestDistance) {
                            smallestDistance = distance;
                            closestTrigger = allTriggers[i];
                        }
                    }
                    
                    triggerIndex = closestTrigger.index;
                    // console.log(`Found ${allTriggers.length} triggers, using closest to middle at index:`, triggerIndex, 'Value:', closestTrigger.value);
                }
                
                // Update the persistent state for next frame
                triggerState.currentState = currentState;
            }
            // console.log('Trigger index:', triggerIndex);

            // Debug: Log the first few waveform values to see if we're getting data
            // if (Math.random() < 0.01) { // Log occasionally
            //     const maxVal = Math.max(...dataArray);
            //     const minVal = Math.min(...dataArray);
            //     console.log('Waveform range:', minVal, 'to', maxVal, 'Trigger at:', triggerIndex);
            //     console.log('Trigger state:', triggerState.currentState);
            // }

            // Clear canvas with dark background
            canvasCtx.fillStyle = 'rgba(10, 10, 15, 0.9)';
            canvasCtx.fillRect(0, 0, width, height);

            // Set up waveform drawing
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = '#00ff88'; // Green oscilloscope-style color
            canvasCtx.beginPath();

            // Calculate display parameters
            const displaySamples = bufferLength/2; // Adjust samples shown based on width
            let startIndex = 0;
            
            if (triggerIndex !== -1) {
                // Position trigger point at 1/4 of the screen (so we can see what happens before the trigger)
                startIndex = Math.max(0, triggerIndex - Math.floor(displaySamples / 4));
            }
            
            const sliceWidth = width / displaySamples;
            let x = 0;
            let hasSignal = false;
            let maxAmplitude = 0;

            for (let i = 0; i < displaySamples; i++) {
                const dataIndex = (startIndex + i) % bufferLength;
                const v = dataArray[dataIndex] / 128.0; // Convert to 0-2 range
                const y = (v * height) / 2;
                
                // Calculate amplitude for signal detection
                const amplitude = Math.abs(v - 1.0);
                maxAmplitude = Math.max(maxAmplitude, amplitude);

                // Check if there's actual signal (not just silence)
                if (amplitude > 0.02) {
                    hasSignal = true;
                }

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.stroke();

            // Update active state
            setIsActive(hasSignal);

            // Draw grid lines for reference
            canvasCtx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
            canvasCtx.lineWidth = 1;
            canvasCtx.setLineDash([2, 4]);

            // Horizontal center line
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, height / 2);
            canvasCtx.lineTo(width, height / 2);
            canvasCtx.stroke();

            // Draw trigger level indicator if triggered
            if (triggerIndex !== -1) {
                const triggerY = ((triggerState.triggerThreshold / 128.0) * height) / 2;
                canvasCtx.strokeStyle = 'rgba(255, 255, 0, 0.6)'; // Yellow trigger line
                canvasCtx.lineWidth = 1;
                canvasCtx.setLineDash([4, 2]);
                canvasCtx.beginPath();
                canvasCtx.moveTo(0, triggerY);
                canvasCtx.lineTo(width, triggerY);
                canvasCtx.stroke();
                
                // Draw trigger point indicator
                canvasCtx.fillStyle = 'rgba(255, 255, 0, 0.8)';
                canvasCtx.fillRect(width / 4 - 2, triggerY - 2, 4, 4);
            }

            // Horizontal quarter lines for amplitude reference
            canvasCtx.strokeStyle = 'rgba(100, 100, 100, 0.1)';
            canvasCtx.setLineDash([2, 4]);
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, height / 4);
            canvasCtx.lineTo(width, height / 4);
            canvasCtx.moveTo(0, (3 * height) / 4);
            canvasCtx.lineTo(width, (3 * height) / 4);
            canvasCtx.stroke();

            // Vertical time lines
            canvasCtx.beginPath();
            canvasCtx.moveTo(width / 4, 0);
            canvasCtx.lineTo(width / 4, height);
            canvasCtx.moveTo(width / 2, 0);
            canvasCtx.lineTo(width / 2, height);
            canvasCtx.moveTo((3 * width) / 4, 0);
            canvasCtx.lineTo((3 * width) / 4, height);
            canvasCtx.stroke();

            canvasCtx.setLineDash([]);

            animationRef.current = requestAnimationFrame(draw);
        };

        // Start animation
        draw();

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            window.removeEventListener('resize', resizeCanvas);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (analyserRef.current?.analyser) {
                try {
                    sourceNode.disconnect(analyserRef.current.analyser);
                } catch (e) {
                    // Node might already be disconnected
                }
            }
        };
    }, [audioCtx, sourceNode]);

    return (
        <ComponentContainer className={`${BASE_CLASS_NAME} ${className}`.trim()}>
            <Label>Oscilloscope {isActive ? '●' : '○'}</Label>
            <Canvas ref={canvasRef} />
        </ComponentContainer>
    );
};

export default Oscilloscope;
