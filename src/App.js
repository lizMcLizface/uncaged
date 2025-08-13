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
  const [polySynthEnabled, setPolySynthEnabled] = useState(false);
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

  return (
    <ThemeProvider theme={themes[theme]}>
      <GlobalStyles />
      <ThemeInjector />
      {/* Only render overlay controls, not replacing the existing content */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
        <ThemeSelector />
      </div>
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1000 }}>
        <button
          onClick={() => setShowPolySynth(!showPolySynth)}
          style={{
            padding: '10px 15px',
            backgroundColor: showPolySynth ? '#4CAF50' : '#333',
            color: 'white',
            border: '1px solid #666',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'background-color 0.3s'
          }}
        >
          {showPolySynth ? 'Hide' : 'Show'} Synth
        </button>
        {showPolySynth && (
          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', color: 'white', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={polySynthEnabled}
                onChange={(e) => setPolySynthEnabled(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Enable Chord Triggering
            </label>
          </div>
        )}
      </div>
      {/* Always render PolySynth, but control visibility */}
      <div style={{
        position: 'fixed',
        top: '80px',
        left: '20px',
        right: '20px',
        bottom: '20px',
        backgroundColor: '#1e1e1e',
        border: '1px solid #666',
        borderRadius: '10px',
        zIndex: 999,
        overflow: 'auto',
        display: showPolySynth ? 'block' : 'none'
      }}>
        <PolySynthWrapper ref={polySynthRef} />
      </div>
    </ThemeProvider>
  );
}

export default App;
