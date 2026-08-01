import { render } from '@testing-library/react';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';

// PolySynthWrapper pulls in PolySynth.jsx, which constructs a real
// AudioContext as a module-level side effect (no Web Audio API in jsdom),
// and metronome.js, which throws in jsdom on import (see run-app skill).
// App only portals PolySynthWrapper into a DOM node that this test's jsdom
// document never contains, so it never actually renders here - mock it out
// rather than dragging the whole synth/audio stack into a smoke test that
// isn't testing it.
jest.mock('./components/PolySynthWrapper', () => {
  const React = require('react');
  return React.forwardRef((props, ref) => null);
});

test('renders without crashing', () => {
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
});
