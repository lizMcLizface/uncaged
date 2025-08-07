import logo from './logo.svg';
import './App.css';

import { ThemeProvider } from 'styled-components';
import { useTheme } from './contexts/ThemeContext';

function App() {
  const { theme, themes } = useTheme();

  return (
    <ThemeProvider theme={themes[theme]}>
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
    </ThemeProvider>
  );
}

export default App;
