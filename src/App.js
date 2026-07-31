import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import './App.css';

import { ThemeProvider } from 'styled-components';
import { useTheme } from './contexts/ThemeContext';
import { GlobalStyles } from './styles/globalStyles';
import ThemeSelector from './components/ThemeSelector';
import ThemeInjector from './components/ThemeInjector';
import PolySynthWrapper from './components/PolySynthWrapper';

function App() {
  const { theme, themes } = useTheme();
  const [polySynthEnabled, setPolySynthEnabled] = useState(true);
  const [synthTabContainer, setSynthTabContainer] = useState(null);
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
      getPolySynthEnabled: () => polySynthEnabled,
      setPolySynthEnabled: (enabled) => setPolySynthEnabled(enabled)
    };
  }, [polySynthEnabled]);

  // The Synthesizer tab's content container is built by the vanilla-JS
  // fretboard UI (frets.js), which may not exist yet on first render - poll
  // until it does, then portal the synth into it so it lives inside that
  // tab instead of as a popup, while staying mounted continuously (audio
  // state/refs aren't lost when switching tabs, since the tab system only
  // toggles display, never unmounts).
  React.useEffect(() => {
    let cancelled = false;
    const findContainer = () => {
      const el = document.getElementById('synthesizerTabContent');
      if (el) {
        if (!cancelled) setSynthTabContainer(el);
      } else if (!cancelled) {
        setTimeout(findContainer, 100);
      }
    };
    findContainer();
    return () => { cancelled = true; };
  }, []);

  return (
    <ThemeProvider theme={themes[theme]}>
      <GlobalStyles />
      <ThemeInjector />
      {/* Only render overlay controls, not replacing the existing content */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
        <ThemeSelector />
      </div>
      {synthTabContainer && createPortal(
        <PolySynthWrapper ref={polySynthRef} />,
        synthTabContainer
      )}
    </ThemeProvider>
  );
}

export default App;
