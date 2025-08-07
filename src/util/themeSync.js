// Theme synchronization utility
// This helps sync themes between different React roots and non-React parts of the app

class ThemeSync {
    constructor() {
        this.listeners = [];
        this.currentTheme = 'Dark';
        
        // Listen for storage changes to sync between tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'PolySynth-Theme' && e.newValue) {
                this.updateTheme(e.newValue);
            }
        });
    }

    addListener(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }

    updateTheme(newTheme) {
        this.currentTheme = newTheme;
        this.listeners.forEach(callback => callback(newTheme));
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

export const themeSync = new ThemeSync();
