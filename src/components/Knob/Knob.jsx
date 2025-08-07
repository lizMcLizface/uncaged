import React, { useState, useLayoutEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { clamp } from '../../util/util';
import {
    ComponentContainer,
    Label,
    KnobContainer,
    KnobSvg,
    KnobDial,
    BackgroundMeter,
    ActiveMeter,
} from './Knob.styled';

const BASE_CLASS_NAME = 'Knob';
const maxRotation = 132;
const typeInfo = {
    A: {
        path: 'M20,76 A 40 40 0 1 1 80 76',
        dashLength: 184,
        offset: 132,
    },
    B: {
        path: 'M50.01,10 A 40 40 0 1 1 50 10',
        dashLength: 251.5,
        offset: 0,
    },
};

let currentY = 0;

const Knob = ({
    disabled,
    isRounded,
    decimalPlaces,
    label,
    modifier,
    offset,
    onUpdate,
    type,
    resetValue,
    value,
    scalingType,
    minValue,
    maxValue,
}) => {
    const getValueFromKnobRotation = useCallback((knobRotation) => {
        const val = (type === 'A')
            ? ((knobRotation + maxRotation) / (maxRotation * 2))
            : (knobRotation / maxRotation);

        let output;
        
        switch (scalingType) {
            case 'logarithmic': {
                // Single-direction logarithmic scaling (for frequency parameters)
                const min = minValue || offset;
                const max = maxValue || (modifier + offset);
                const logMin = Math.log(min);
                const logMax = Math.log(max);
                output = Math.exp(logMin + val * (logMax - logMin));
                break;
            }
            case 'symmetric-log': {
                // Double symmetric logarithmic scaling (for detune parameters)
                const range = maxValue || modifier;
                
                // Simple symmetric scaling around center (0.5)
                if (val === 0.5) {
                    output = 0; // Exact center is 0
                } else if (val > 0.5) {
                    // Positive side: 0.5 to 1.0 maps to 0 to +range
                    const normalizedVal = (val - 0.5) * 2; // 0 to 1
                    // Simple exponential curve: x^2 gives more precision near center
                    output = range * Math.pow(normalizedVal, 2);
                } else {
                    // Negative side: 0.0 to 0.5 maps to -range to 0
                    const normalizedVal = (0.5 - val) * 2; // 0 to 1
                    // Simple exponential curve: x^2 gives more precision near center
                    output = -range * Math.pow(normalizedVal, 2);
                }
                output += offset;
                break;
            }
            default: // linear
                output = val * modifier + offset;
                break;
        }

        return isRounded ? Math.round(output) : output;
    }, [type, scalingType, minValue, maxValue, modifier, offset, isRounded]);
    const getKnobRotationFromValue = useCallback((value) => {
        let val;
        
        switch (scalingType) {
            case 'logarithmic': {
                // Single-direction logarithmic scaling (for frequency parameters)
                const min = minValue || offset;
                const max = maxValue || (modifier + offset);
                const logMin = Math.log(min);
                const logMax = Math.log(max);
                val = (Math.log(value) - logMin) / (logMax - logMin);
                break;
            }
            case 'symmetric-log': {
                // Double symmetric logarithmic scaling (for detune parameters)
                const range = maxValue || modifier;
                const adjustedValue = value - offset;
                
                if (adjustedValue === 0) {
                    val = 0.5; // Exact center
                } else if (adjustedValue > 0) {
                    // Positive side: inverse of output = range * normalizedVal^2
                    // So: normalizedVal = sqrt(adjustedValue / range)
                    const normalizedVal = Math.sqrt(Math.min(adjustedValue / range, 1));
                    val = 0.5 + normalizedVal * 0.5;
                } else {
                    // Negative side: inverse of output = -range * normalizedVal^2
                    // So: normalizedVal = sqrt(-adjustedValue / range)
                    const normalizedVal = Math.sqrt(Math.min(-adjustedValue / range, 1));
                    val = 0.5 - normalizedVal * 0.5;
                }
                break;
            }
            default: // linear
                val = (value - offset) / modifier;
                break;
        }
        
        return (type === 'A')
            ? (val * 2 * maxRotation) - maxRotation
            : val * maxRotation;
    }, [type, scalingType, minValue, maxValue, modifier, offset]);

    const [rotation, setRotation] = useState(getKnobRotationFromValue(value));
    const rotationRef = useRef(rotation);
    const valueRef = useRef(value);

    const handleUpdate = (mouseY) => {
        const newRotation = clamp(rotationRef.current - (mouseY - currentY), -maxRotation, maxRotation);
        const newValue = getValueFromKnobRotation(newRotation);

        rotationRef.current = newRotation;
        setRotation(newRotation);

        if (newValue !== valueRef.current) {
            valueRef.current = newValue;
            onUpdate(newValue);
        }
    };

    const handleMouseMove = (e) => {
        e.preventDefault();
        
        // Add sensitivity modifiers - hold Shift for fine control, Ctrl for coarse control
        let sensitivity = 1;
        if (e.shiftKey) sensitivity = 0.1; // Fine control
        if (e.ctrlKey) sensitivity = 3; // Coarse control
        
        const deltaY = (e.clientY - currentY) * sensitivity;
        handleUpdate(currentY + deltaY);
        currentY = e.clientY;
    }
    
    const handleMouseUp = (e) => {
        e.preventDefault();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = ''; // Re-enable text selection
        document.body.style.cursor = ''; // Reset cursor
        currentY = 0;
    }
    
    const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Prevent text selection while dragging
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize'; // Show vertical resize cursor
        
        currentY = e.clientY;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }

    const handleReset = () => onUpdate(resetValue);

    const getDashOffset = (rotation, type) => (
        typeInfo[type].dashLength - (184 / (maxRotation * 2)) * (rotation + typeInfo[type].offset)
    );

    useLayoutEffect(() => {
        if (value !== valueRef.current) {
            const newRotation = getKnobRotationFromValue(value);

            setRotation(newRotation);
            rotationRef.current = newRotation;
            valueRef.current = value;
        }
    }, [value, getKnobRotationFromValue])

    return (
        <ComponentContainer className={`${BASE_CLASS_NAME}`} disabled={disabled}>
            <KnobContainer
                className={`${BASE_CLASS_NAME}__container`}
                onMouseDown={handleMouseDown}
                onDoubleClick={handleReset}
                disabled={disabled}
            >
                <KnobSvg className={`${BASE_CLASS_NAME}__svg`} viewBox="0 0 100 100">
                    <BackgroundMeter d="M20,76 A 40 40 0 1 1 80 76" />
                    <ActiveMeter
                        d={typeInfo[type].path}
                        strokeDasharray={typeInfo[type].dashLength}
                        style={{ strokeDashoffset: getDashOffset(rotation, type) }}
                        disabled={disabled}
                    />
                </KnobSvg>
                <KnobDial
                    className={`${BASE_CLASS_NAME}__dial`}
                    style={{ transform: `translate(-50%,-50%) rotate(${rotation}deg)` }}
                    disabled={disabled}
                />
            </KnobContainer>
            <Label disabled={disabled}>
                <div className="label-text">{label}</div>
                <div className="value-text">
                    {Math.round(getValueFromKnobRotation(rotation) * (10 ** decimalPlaces)) / (10 ** decimalPlaces)}
                </div>
            </Label>
        </ComponentContainer>
    );
};

Knob.propTypes = {
    disabled: PropTypes.bool,
    isRounded: PropTypes.bool,
    decimalPlaces: PropTypes.number,
    label: PropTypes.string.isRequired,
    // Defines the multiplier/max for the knob
    modifier: PropTypes.number,
    // Defines the offset/starting point of the knob
    offset: PropTypes.number,
    onUpdate: PropTypes.func,
    // Defines if it is a one way or two way knob
    type: PropTypes.oneOf(['A', 'B']),
    resetValue: PropTypes.number,
    value: PropTypes.number,
    // Defines the scaling behavior: 'linear', 'logarithmic', 'symmetric-log'
    scalingType: PropTypes.oneOf(['linear', 'logarithmic', 'symmetric-log']),
    // Minimum value for logarithmic scaling (overrides offset for min)
    minValue: PropTypes.number,
    // Maximum value for scaling (overrides modifier+offset for max)
    maxValue: PropTypes.number,
};

Knob.defaultProps = {
    disabled: false,
    isRounded: false,
    decimalPlaces: 2,
    modifier: 1,
    offset: 0,
    onUpdate: () => {},
    type: 'A',
    resetValue: 0,
    value: 0,
    scalingType: 'linear',
    minValue: null,
    maxValue: null,
};

export default Knob;
