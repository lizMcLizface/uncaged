import { useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const ThemeInjector = () => {
    const { theme, themes } = useTheme();

    useEffect(() => {
        const currentTheme = themes[theme];
        const root = document.documentElement;

        // Set CSS custom properties on :root for use throughout the site
        root.style.setProperty('--theme-background', currentTheme.background);
        root.style.setProperty('--theme-lite', currentTheme.lite);
        root.style.setProperty('--theme-mid', currentTheme.mid);
        root.style.setProperty('--theme-strong', currentTheme.strong);
        root.style.setProperty('--theme-pop', currentTheme.pop);

        // Optional: Apply theme to body element directly
        document.body.style.backgroundColor = currentTheme.background;
        document.body.style.color = currentTheme.strong;

        // Apply theme to existing tab elements if they exist
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.style.background = currentTheme.background;
            tab.style.color = currentTheme.strong;
            tab.style.borderColor = currentTheme.mid;
        });

        const tabLinks = document.querySelectorAll('.tablinks');
        tabLinks.forEach(link => {
            link.style.backgroundColor = currentTheme.background;
            link.style.color = currentTheme.strong;
            link.style.borderColor = currentTheme.mid;
        });

        const tabContent = document.querySelectorAll('.tabcontent');
        tabContent.forEach(content => {
            content.style.backgroundColor = currentTheme.background;
            content.style.color = currentTheme.strong;
        });

        // Theme any inputs, buttons, and other elements
        const inputs = document.querySelectorAll('input, select, textarea, button:not([class*="Knob"]):not([class*="Select"])');
        inputs.forEach(input => {
            if (!input.closest('.PolySynth')) { // Don't override PolySynth component styles
                input.style.backgroundColor = currentTheme.background;
                input.style.color = currentTheme.strong;
                input.style.borderColor = currentTheme.mid;
            }
        });

    }, [theme, themes]);

    return null; // This component doesn't render anything
};

export default ThemeInjector;
