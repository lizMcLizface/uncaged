import React, { createContext, useContext, useState, useEffect } from 'react';
import { THEMES } from '../styles/themes';
import { themeSync } from '../util/themeSync';

const ThemeContext = createContext();

const getTheme = () => {
    const storedTheme = localStorage.getItem('PolySynth-Theme');
    
    if (!storedTheme || !THEMES[storedTheme]) {
        localStorage.setItem('PolySynth-Theme', 'Dark');
        return 'Dark';
    }
    return storedTheme;
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(getTheme());

    useEffect(() => {
        // Update themeSync when theme changes
        themeSync.updateTheme(theme);
        
        // Listen for theme changes from other parts of the app
        const unsubscribe = themeSync.addListener((newTheme) => {
            if (newTheme !== theme) {
                setTheme(newTheme);
            }
        });

        return unsubscribe;
    }, [theme]);

    const updateTheme = (newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('PolySynth-Theme', newTheme);
        themeSync.updateTheme(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: updateTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;
