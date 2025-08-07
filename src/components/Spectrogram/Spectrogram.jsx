import React, { useRef, useEffect, useState } from 'react';
import { ComponentContainer, Canvas, Label, FrequencyLabels } from './Spectrogram.styled';

const BASE_CLASS_NAME = 'Spectrogram';

const Spectrogram = ({ audioCtx, sourceNode, className = '' }) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const spectrogramDataRef = useRef([]); // Store historical spectrogram data
    const [isActive, setIsActive] = useState(false);
    const [peakFrequency, setPeakFrequency] = useState(0);

    useEffect(() => {
        if (!audioCtx || !sourceNode) return;

        // Create analyser node
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;
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
                
                // Clear the canvas after resize
                canvasCtx.fillStyle = 'rgba(5, 5, 10, 1)';
                canvasCtx.fillRect(0, 0, rect.width, rect.height);
                
                // Reset spectrogram data on resize to prevent artifacts
                spectrogramDataRef.current = [];
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

            // Skip drawing if canvas dimensions are invalid
            if (width <= 0 || height <= 0) {
                animationRef.current = requestAnimationFrame(draw);
                return;
            }

            // Get frequency data
            analyser.getByteFrequencyData(dataArray);

            // Debug: Log the first few frequency values to see if we're getting data
            // if (Math.random() < 0.01) { // Log occasionally
                // console.log('Spectrogram data sample:', dataArray.slice(0, 10));
                // console.log('Max value:', Math.max(...dataArray));
            // }

            // Check if there's signal
            const maxValue = Math.max(...dataArray);
            const hasSignal = maxValue > 15;
            setIsActive(hasSignal);

            // Find peak frequency
            let peakIndex = 0;
            let peakValue = 0;
            for (let i = 1; i < bufferLength; i++) { // Start from 1 to avoid DC component
                if (dataArray[i] > peakValue) {
                    peakValue = dataArray[i];
                    peakIndex = i;
                }
            }
            const freq = (peakIndex * audioCtx.sampleRate) / (2 * bufferLength);
            if (hasSignal && freq > 20) {
                setPeakFrequency(freq);
            }

            // Time-based scrolling that maintains history
            const spectrogramData = spectrogramDataRef.current;
            const maxColumns = Math.floor(width / 4); // 4 pixels per column
            
            // Add new frequency data as a column
            const newColumn = [];
            const maxFreqIndex = Math.floor((8000 * bufferLength * 2) / audioCtx.sampleRate);
            const processedLength = Math.min(bufferLength, maxFreqIndex);
            
            for (let i = 1; i < processedLength; i++) {
                const intensity = dataArray[i] / 255.0;
                const frequency = (i * audioCtx.sampleRate) / (2 * bufferLength);
                newColumn.push({ intensity, frequency });
            }
            
            // Add new column and remove old ones to maintain scroll effect
            spectrogramData.push(newColumn);
            if (spectrogramData.length > maxColumns) {
                spectrogramData.shift(); // Remove oldest column
            }
            
            // Clear canvas
            canvasCtx.fillStyle = 'rgba(5, 5, 10, 1)';
            canvasCtx.fillRect(0, 0, width, height);
            
            // Draw all columns from left to right (oldest to newest)
            spectrogramData.forEach((column, columnIndex) => {
                const x = columnIndex * 4; // 4 pixels per column
                
                column.forEach(({ intensity, frequency }) => {
                    if (intensity > 0.01) { // Only draw if there's meaningful data
                        // Use a better logarithmic scale that uses more of the display height
                        // Map 20Hz to 8kHz across the full height
                        const minFreq = 20;
                        const maxFreq = 8000;
                        const logFreq = (Math.log(Math.max(frequency, minFreq)) - Math.log(minFreq)) / 
                                       (Math.log(maxFreq) - Math.log(minFreq));
                        const y = height - (logFreq * height);
                        
                        // Color mapping: blue (low) -> cyan (mid-low) -> green (mid) -> yellow (mid-high) -> red (high)
                        let r, g, b;
                        if (intensity < 0.25) {
                            // Blue to cyan
                            r = 0;
                            g = Math.floor(intensity * 4 * 150);
                            b = 255;
                        } else if (intensity < 0.5) {
                            // Cyan to green
                            r = 0;
                            g = 255;
                            b = Math.floor((0.5 - intensity) * 4 * 255);
                        } else if (intensity < 0.75) {
                            // Green to yellow
                            r = Math.floor((intensity - 0.5) * 4 * 255);
                            g = 255;
                            b = 0;
                        } else {
                            // Yellow to red
                            r = 255;
                            g = Math.floor((1 - intensity) * 4 * 255);
                            b = 0;
                        }
                        
                        canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(intensity * 0.9 + 0.1, 1.0)})`;
                        
                        // Draw a small rectangle for each frequency bin
                        if (y >= 0 && y <= height) {
                            canvasCtx.fillRect(x, y - 2, 4, 4);
                        }
                    }
                });
            });

            // Draw frequency scale lines
            canvasCtx.strokeStyle = 'rgba(150, 150, 150, 0.15)';
            canvasCtx.lineWidth = 1;
            canvasCtx.setLineDash([1, 3]);

            const frequencies = [50, 100, 200, 500, 1000, 2000, 4000];
            const minFreq = 20;
            const maxFreq = 8000;
            
            frequencies.forEach(freq => {
                if (freq >= minFreq && freq <= maxFreq) {
                    const logFreq = (Math.log(freq) - Math.log(minFreq)) / (Math.log(maxFreq) - Math.log(minFreq));
                    const y = height - (logFreq * height);
                    
                    if (y > 0 && y < height) {
                        canvasCtx.beginPath();
                        canvasCtx.moveTo(0, y);
                        canvasCtx.lineTo(width, y);
                        canvasCtx.stroke();
                    }
                }
            });

            canvasCtx.setLineDash([]);

            animationRef.current = requestAnimationFrame(draw);
        };

        // Wait a frame to ensure canvas is properly sized before starting animation
        const startAnimation = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                draw();
            } else {
                // If canvas isn't sized yet, try again next frame
                requestAnimationFrame(startAnimation);
            }
        };

        requestAnimationFrame(startAnimation);

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

    const formatFrequency = (freq) => {
        if (freq < 1000) {
            return `${freq.toFixed(0)}Hz`;
        } else {
            return `${(freq / 1000).toFixed(1)}kHz`;
        }
    };

    return (
        <ComponentContainer className={`${BASE_CLASS_NAME} ${className}`.trim()}>
            <Label>Spectrogram {isActive ? '●' : '○'}</Label>
            <FrequencyLabels>
                4kHz<br/>
                2kHz<br/>
                1kHz<br/>
                500Hz<br/>
                200Hz<br/>
                100Hz<br/>
                50Hz<br/>
                {isActive && peakFrequency > 20 && (
                    <div style={{ color: '#00ff88', fontWeight: 'bold', marginTop: '4px' }}>
                        Peak: {formatFrequency(peakFrequency)}
                    </div>
                )}
            </FrequencyLabels>
            <Canvas ref={canvasRef} />
        </ComponentContainer>
    );
};

export default Spectrogram;
