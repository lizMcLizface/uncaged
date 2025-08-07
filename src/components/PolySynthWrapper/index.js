import React from 'react';
import PolySynth from '../PolySynth';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemeProvider } from 'styled-components';

const PolySynthWrapper = React.forwardRef((props, ref) => {
    const { theme, setTheme, themes } = useTheme();
    
    return (
        <ThemeProvider theme={themes[theme]}>
            <PolySynth 
                currentTheme={theme}
                setTheme={setTheme}
                ref={ref}
            />
        </ThemeProvider>
    );
});

export default PolySynthWrapper;
