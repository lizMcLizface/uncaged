import logo from './logo.svg';
import './App.css';


import { useState } from 'react';
import { ThemeProvider } from 'styled-components';
import { THEMES } from './styles/themes';

const getTheme = () => {
    const storedTheme = localStorage.getItem('PolySynth-Theme');
    if (!THEMES[storedTheme]) {
        localStorage.removeItem('PolySynth-Theme');
        return 'Dark';
    }
    return 'Dark';
};



function App() {
  const [theme, setTheme] = useState(getTheme());

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload. React is stupid. JS is
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
