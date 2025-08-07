import React from 'react';
import styled from 'styled-components';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeSelectorContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const Label = styled.label`
    color: ${({ theme }) => theme.strong};
    font-size: 14px;
    font-weight: 500;
`;

const Select = styled.select`
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid ${({ theme }) => theme.mid};
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.strong};
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
    outline: none;
    
    &:hover {
        border-color: ${({ theme }) => theme.pop};
    }
    
    &:focus {
        border-color: ${({ theme }) => theme.pop};
        box-shadow: 0 0 0 2px ${({ theme }) => theme.pop}33;
    }
    
    option {
        background: ${({ theme }) => theme.background};
        color: ${({ theme }) => theme.strong};
        padding: 4px;
    }
`;

const ThemeSelector = ({ showLabel = true, className = '' }) => {
    const { theme, setTheme, themes } = useTheme();

    return (
        <ThemeSelectorContainer className={className}>
            {showLabel && <Label>Theme:</Label>}
            <Select 
                value={theme} 
                onChange={(e) => setTheme(e.target.value)}
                title="Select Theme"
            >
                {Object.keys(themes).map((themeName) => (
                    <option key={themeName} value={themeName}>
                        {themeName}
                    </option>
                ))}
            </Select>
        </ThemeSelectorContainer>
    );
};

export default ThemeSelector;
