import logo from './logo.svg';
import './App.css';

import { ThemeProvider } from 'styled-components';
import { useTheme } from './contexts/ThemeContext';
import { GlobalStyles } from './styles/globalStyles';
import ThemeSelector from './components/ThemeSelector';
import ThemeInjector from './components/ThemeInjector';

function App() {
  const { theme, themes } = useTheme();

  return (
    <ThemeProvider theme={themes[theme]}>
      <GlobalStyles />
      <ThemeInjector />
      <div className="App">
        <header className="App-header">
          <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 1000 }}>
            <ThemeSelector />
          </div>
        </header>
      </div>
    </ThemeProvider>
  );
}

export default App;
