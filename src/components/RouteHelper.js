import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const RouteHelper = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const routes = [
    { path: '/', name: 'Synthesizer (Default)', tabId: 'PolySynthTab' },
    { path: '/scales', name: 'Scales', tabId: 'ScaleSelectorTab' },
    { path: '/chords', name: 'Chords', tabId: 'ChordSelectorTab' },
    { path: '/progressions', name: 'Progressions', tabId: 'ProgressionTab' },
    { path: '/fretboard', name: 'Fretboard', tabId: 'fretNotTab' },
    { path: '/crossreference', name: 'Cross Reference', tabId: 'CrossreferenceTab' },
    { path: '/intervals', name: 'Interval Practice', tabId: 'IntervalTab' },
    { path: '/about', name: 'About', tabId: 'Starting' },
    { path: '/mode', name: 'Mode Settings', tabId: 'Mode' },
    { path: '/root', name: 'Root Settings', tabId: 'root' },
    { path: '/progression-settings', name: 'Progression Settings', tabId: 'Progression' },
    { path: '/chord-settings', name: 'Chord Settings', tabId: 'Chord' },
    { path: '/general', name: 'General Settings', tabId: 'General' },
    { path: '/synth', name: 'Synth Settings', tabId: 'Synth' },
    { path: '/octave', name: 'Octave Settings', tabId: 'Octave' }
  ];

  const handleRouteClick = (path) => {
    navigate(path);
  };

  const copyCurrentUrl = () => {
    const fullUrl = window.location.origin + location.pathname;
    navigator.clipboard.writeText(fullUrl).then(() => {
      alert('URL copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('URL copied to clipboard!');
    });
  };

  const containerStyle = {
    position: 'fixed',
    top: '60px',
    right: '20px',
    background: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '15px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 10001,
    maxWidth: '300px',
    fontSize: '12px'
  };

  const buttonStyle = {
    display: 'block',
    width: '100%',
    padding: '4px 8px',
    margin: '2px 0',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#f8f9fa',
    cursor: 'pointer',
    fontSize: '11px',
    textAlign: 'left'
  };

  const currentRouteStyle = {
    ...buttonStyle,
    background: '#007bff',
    color: 'white',
    fontWeight: 'bold'
  };

  const copyButtonStyle = {
    ...buttonStyle,
    background: '#28a745',
    color: 'white',
    textAlign: 'center',
    marginTop: '10px'
  };

  return (
    <div style={containerStyle}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Direct Tab Links</h4>
      <p style={{ margin: '0 0 10px 0', fontSize: '10px', color: '#666' }}>
        Current: {location.pathname}
      </p>
      
      {routes.map((route) => (
        <button
          key={route.path}
          style={location.pathname === route.path ? currentRouteStyle : buttonStyle}
          onClick={() => handleRouteClick(route.path)}
          onMouseEnter={(e) => {
            if (location.pathname !== route.path) {
              e.target.style.background = '#e9ecef';
            }
          }}
          onMouseLeave={(e) => {
            if (location.pathname !== route.path) {
              e.target.style.background = '#f8f9fa';
            }
          }}
        >
          {route.name}
        </button>
      ))}
      
      <button
        style={copyButtonStyle}
        onClick={copyCurrentUrl}
        onMouseEnter={(e) => e.target.style.background = '#218838'}
        onMouseLeave={(e) => e.target.style.background = '#28a745'}
      >
        📋 Copy Current URL
      </button>
    </div>
  );
};

export default RouteHelper;
