import React, { useState, useRef } from 'react';
import './App.css';

import { ThemeProvider } from 'styled-components';
import { useTheme } from './contexts/ThemeContext';
import { GlobalStyles } from './styles/globalStyles';
import ThemeSelector from './components/ThemeSelector';
import ThemeInjector from './components/ThemeInjector';
import PolySynthWrapper from './components/PolySynthWrapper';

function App() {
  const { theme, themes } = useTheme();
  const [showPolySynth, setShowPolySynth] = useState(false);
  const [polySynthEnabled, setPolySynthEnabled] = useState(true);
  const polySynthRef = useRef(null);

  // Make polySynth globally accessible for progression triggering
  React.useEffect(() => {
    if (polySynthRef.current) {
      window.polySynthRef = polySynthRef.current;
      console.log('PolySynth reference set globally:', polySynthRef.current);
    }
    window.polySynthEnabled = polySynthEnabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polySynthEnabled]);

  // Additional effect to ensure ref is set after render
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (polySynthRef.current && !window.polySynthRef) {
        window.polySynthRef = polySynthRef.current;
        console.log('PolySynth reference set via timer:', polySynthRef.current);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Expose App functions globally for progression builder
  React.useEffect(() => {
    window.App = {
      getShowPolySynth: () => showPolySynth,
      toggleShowPolySynth: () => setShowPolySynth(!showPolySynth),
      getPolySynthEnabled: () => polySynthEnabled,
      setPolySynthEnabled: (enabled) => setPolySynthEnabled(enabled)
    };
  }, [showPolySynth, polySynthEnabled]);

  // Add escape key listener to close synth
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && showPolySynth) {
        setShowPolySynth(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPolySynth]);

  // Handle clicking outside synth to close it
  const handleSynthOverlayClick = (event) => {
    // Only close if clicking the overlay background, not the synth content
    if (event.target === event.currentTarget) {
      setShowPolySynth(false);
    }
  };

  return (
    <ThemeProvider theme={themes[theme]}>
      <GlobalStyles />
      <ThemeInjector />
      {/* Only render overlay controls, not replacing the existing content */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
        <ThemeSelector />
      </div>
      {/* Always render PolySynth overlay but control visibility */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: showPolySynth ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
          zIndex: showPolySynth ? 998 : -1,
          display: showPolySynth ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          pointerEvents: showPolySynth ? 'auto' : 'none'
        }}
        onClick={handleSynthOverlayClick}
      >
        <div style={{
          width: '90%',
          height: '90%',
          backgroundColor: '#1e1e1e',
          border: '1px solid #666',
          borderRadius: '10px',
          overflow: 'auto',
          position: 'relative'
        }}>
          <div style={{ 
            position: 'absolute', 
            top: '10px', 
            right: '10px', 
            zIndex: 999,
            color: 'white',
            fontSize: '24px',
            cursor: 'pointer',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPolySynth(false);
          }}
          >
            ×
          </div>
          <PolySynthWrapper ref={polySynthRef} />
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
