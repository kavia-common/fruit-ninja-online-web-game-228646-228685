import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import Game from "./components/Game";
import HomeScreen from "./components/HomeScreen";
import ResultsScreen from "./components/ResultsScreen";

const SCREEN = Object.freeze({
  HOME: "home",
  GAME: "game",
  RESULTS: "results"
});

// PUBLIC_INTERFACE
function App() {
  /** App root: theme + simple screen navigation for Solo flow (no backend calls). */
  const [theme, setTheme] = useState("dark");
  const [screen, setScreen] = useState(SCREEN.HOME);
  const [results, setResults] = useState(null);

  const debugEnabled = useMemo(() => {
    return String(process.env.REACT_APP_NODE_ENV || "").toLowerCase() === "development";
  }, []);

  // Effect to apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    /** Toggle light/dark theme. */
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const handleStartSolo = () => {
    setResults(null);
    setScreen(SCREEN.GAME);
  };

  const handleGameOver = (payload) => {
    setResults(payload);
    setScreen(SCREEN.RESULTS);
  };

  return (
    <div className="App">
      <header className="appHeader">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            FN
          </div>
          <div className="brandText">
            <div className="brandTitle">Fruit Ninja Online</div>
            <div className="brandSub">
              {debugEnabled ? "Local debug mode" : "Solo mode"}
            </div>
          </div>
        </div>

        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch theme`}>
          {theme === "light" ? "Dark" : "Light"}
        </button>
      </header>

      <main className="appMain">
        {screen === SCREEN.HOME && <HomeScreen onStartSolo={handleStartSolo} />}
        {screen === SCREEN.GAME && <Game onGameOver={handleGameOver} />}
        {screen === SCREEN.RESULTS && (
          <ResultsScreen
            results={results}
            onPlayAgain={handleStartSolo}
            onBackHome={() => setScreen(SCREEN.HOME)}
          />
        )}
      </main>

      <footer className="appFooter">
        <span className="muted">
          Backend URLs are env-driven (e.g., REACT_APP_API_BASE / REACT_APP_WS_URL) but unused in this no-backend build.
        </span>
      </footer>
    </div>
  );
}

export default App;
