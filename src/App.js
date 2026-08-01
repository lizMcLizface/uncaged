import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import './App.css';

import { ThemeProvider } from 'styled-components';
import { useTheme } from './contexts/ThemeContext';
import { GlobalStyles } from './styles/globalStyles';
import ThemeSelector from './components/ThemeSelector';
import ThemeInjector from './components/ThemeInjector';
import PolySynthWrapper from './components/PolySynthWrapper';
import { registerChannel, setChannelEnabled } from './audio/dispatch';

function App() {
  const { theme, themes } = useTheme();
  const [polySynthEnabled, setPolySynthEnabled] = useState(true);
  const [synthTabContainer, setSynthTabContainer] = useState(null);
  const polySynthRef = useRef(null);

  // Make polySynth globally accessible for progression triggering. Keyed on
  // synthTabContainer (not just mount) because polySynthRef.current only
  // becomes non-null once the portal below actually renders
  // PolySynthWrapper, which happens on a later render than App's own mount -
  // a plain mount-time effect can run before that and find the ref still
  // null, permanently leaving window.polySynthRef unset.
  React.useEffect(() => {
    if (polySynthRef.current) {
      window.polySynthRef = polySynthRef.current;
      console.log('PolySynth reference set globally:', polySynthRef.current);
      // The 'synth' channel, for the playback-only entry points (keyboard,
      // mouse, programmatic click-to-play) migrated off window.polySynthRef
      // in Phase 2b - see src/audio/dispatch.js. window.polySynthRef stays
      // set above for the progression-sequencer-control and microtonal call
      // sites not yet migrated.
      registerChannel('synth', polySynthRef.current);
    }
    window.polySynthEnabled = polySynthEnabled;
    setChannelEnabled('synth', polySynthEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polySynthEnabled, synthTabContainer]);

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
