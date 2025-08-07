import React, { useRef, useEffect, useState } from 'react';
import { ComponentContainer, Canvas, Label, FrequencyLabels, AmplitudeLabels } from './SpectrumAnalyzer.styled';

const BASE_CLASS_NAME = 'SpectrumAnalyzer';

const SpectrumAnalyzer = ({ audioCtx, sourceNode, className = '' }) => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const analyserRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const [peakFrequency, setPeakFrequency] = useState(0);

    useEffect(() => {
        if (!audioCtx || !sourceNode) return;

        // Create analyser node
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = Math.pow(2, 15); // 4096 points for better frequency resolution
        analyser.smoothingTimeConstant = 0.5; // Higher smoothing for cleaner line plot
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

        // Frequency range for display (20Hz to 8kHz)
        const minFreq = 20;
        const maxFreq = 8000;
        const nyquist = audioCtx.sampleRate / 2;

        // Convert frequency to logarithmic position
        const freqToX = (freq, width) => {
            const logMin = Math.log10(minFreq);
            const logMax = Math.log10(maxFreq);
            const logFreq = Math.log10(Math.max(freq, minFreq));
            return ((logFreq - logMin) / (logMax - logMin)) * width;
        };

        // Convert bin index to frequency
        const binToFreq = (bin) => {
            return (bin * nyquist) / bufferLength;
        };

        const draw = () => {
            if (!analyserRef.current) return;
            
            const { analyser, dataArray, bufferLength } = analyserRef.current;
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            // Get frequency data
            analyser.getByteFrequencyData(dataArray);

            // Find peak frequency for activity indicator
            let maxAmplitude = 0;
            let peakBin = 0;
            let hasSignal = false;

            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] > maxAmplitude) {
                    maxAmplitude = dataArray[i];
                    peakBin = i;
                }
                if (dataArray[i] > 30) { // Threshold for activity detection
                    hasSignal = true;
                }
            }

            const currentPeakFreq = binToFreq(peakBin);
            setPeakFrequency(currentPeakFreq);
            setIsActive(hasSignal);

            // Clear canvas with dark background
            canvasCtx.fillStyle = 'rgba(5, 5, 15, 1)';
            canvasCtx.fillRect(0, 0, width, height);

            // Draw grid lines
            canvasCtx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
            canvasCtx.lineWidth = 1;
            canvasCtx.setLineDash([2, 4]);

            // Frequency grid lines (logarithmic)
            const freqMarkers = [50, 100, 200, 500, 1000, 2000, 4000, 8000];
            canvasCtx.beginPath();
            freqMarkers.forEach(freq => {
                if (freq >= minFreq && freq <= maxFreq) {
                    const x = freqToX(freq, width);
                    canvasCtx.moveTo(x, 0);
                    canvasCtx.lineTo(x, height);
                }
            });
            canvasCtx.stroke();

            // Amplitude grid lines
            canvasCtx.beginPath();
            for (let i = 1; i < 4; i++) {
                const y = (height * i) / 4;
                canvasCtx.moveTo(0, y);
                canvasCtx.lineTo(width, y);
            }
            canvasCtx.stroke();

            canvasCtx.setLineDash([]);

            // Draw spectrum line
            canvasCtx.strokeStyle = '#00ff88';
            canvasCtx.lineWidth = 2;
            canvasCtx.beginPath();

            let firstPoint = true;
            
            // Sample the frequency data logarithmically for better resolution at lower frequencies
            const numPoints = Math.min(width, 400); // Limit points for performance
            
            for (let i = 0; i < numPoints; i++) {
                const progress = i / (numPoints - 1);
                
                // Calculate frequency for this point (logarithmic distribution)
                const logMin = Math.log10(minFreq);
                const logMax = Math.log10(maxFreq);
                const logFreq = logMin + progress * (logMax - logMin);
                const freq = Math.pow(10, logFreq);
                
                // Find corresponding bin
                const bin = Math.round((freq * bufferLength) / nyquist);
                
                if (bin >= 0 && bin < bufferLength) {
                    const amplitude = dataArray[bin];
                    const x = progress * width;
                    const y = height - (amplitude / 255) * height;
                    
                    if (firstPoint) {
                        canvasCtx.moveTo(x, y);
                        firstPoint = false;
                    } else {
                        canvasCtx.lineTo(x, y);
                    }
                }
            }

            canvasCtx.stroke();

            // Draw peak frequency indicator
            if (hasSignal && currentPeakFreq >= minFreq && currentPeakFreq <= maxFreq) {
                const peakX = freqToX(currentPeakFreq, width);
                const peakBinAmplitude = dataArray[peakBin];
                const peakY = height - (peakBinAmplitude / 255) * height;

                // Peak line
                canvasCtx.strokeStyle = '#ff4444';
                canvasCtx.lineWidth = 1;
                canvasCtx.setLineDash([3, 3]);
                canvasCtx.beginPath();
                canvasCtx.moveTo(peakX, 0);
                canvasCtx.lineTo(peakX, height);
                canvasCtx.stroke();

                // Peak dot
                canvasCtx.fillStyle = '#ff4444';
                canvasCtx.beginPath();
                canvasCtx.arc(peakX, peakY, 3, 0, 2 * Math.PI);
                canvasCtx.fill();

                canvasCtx.setLineDash([]);
            }

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

    const formatFrequency = (freq) => {
        if (freq < 1000) {
            return `${freq.toFixed(0)}Hz`;
        } else {
            return `${(freq / 1000).toFixed(1)}kHz`;
        }
    };

    return (
        <ComponentContainer className={`${BASE_CLASS_NAME} ${className}`.trim()}>
            <Label>
                Spectrum {isActive ? '●' : '○'}
                {isActive && peakFrequency > 20 && (
                    <span style={{ marginLeft: '8px', color: '#ff4444' }}>
                        Peak: {formatFrequency(peakFrequency)}
                    </span>
                )}
            </Label>
            <FrequencyLabels>
                <span>0dB</span>
                <span>-20dB</span>
                <span>-40dB</span>
                <span>-60dB</span>
                <span>-80dB</span>
                <span>-100dB</span>
                <span>-120dB</span>
                <span>-∞</span>
            </FrequencyLabels>
            <AmplitudeLabels>
                <span>50Hz</span>
                <span>100Hz</span>
                <span>200Hz</span>
                <span>500Hz</span>
                <span>1kHz</span>
                <span>2kHz</span>
                <span>4kHz</span>
                <span>8kHz</span>
            </AmplitudeLabels>
            <Canvas ref={canvasRef} />
        </ComponentContainer>
    );
};

export default SpectrumAnalyzer;
