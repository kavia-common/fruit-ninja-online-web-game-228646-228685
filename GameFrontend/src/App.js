import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import Game from "./components/Game";
import HomeScreen from "./components/HomeScreen";
import MultiplayerScreen from "./components/MultiplayerScreen";
import ResultsScreen from "./components/ResultsScreen";
import { runHealthCheck } from "./api/health";

const SCREEN = Object.freeze({
  HOME: "home",
  SOLO: "solo",
  MULTIPLAYER: "multiplayer",
  RESULTS: "results"
});

// PUBLIC_INTERFACE
function App() {
  /** App root: theme + simple screen navigation for Solo and Multiplayer placeholder flows (no backend calls). */
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

  // Best-effort backend reachability check (non-blocking, no UI changes).
  // This is a stub integration point for future Home/Results indicators.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await runHealthCheck();
        if (cancelled) return;

        // Keep logs dev-only; no UI changes for now.
        const isDev = String(process.env.REACT_APP_NODE_ENV || "").toLowerCase() === "development";
        if (isDev) {
          // eslint-disable-next-line no-console
          console.log("[healthCheck]", result);
        }
      } catch (e) {
        // Swallow errors to avoid impacting screens; offline-first behavior.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    /** Toggle light/dark theme. */
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const handleGoHome = () => {
    setScreen(SCREEN.HOME);
  };

  const handleStartSolo = () => {
    setResults(null);
    setScreen(SCREEN.SOLO);
  };

  const handleOpenMultiplayer = () => {
    setResults(null);
    setScreen(SCREEN.MULTIPLAYER);
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
            <div className="brandSub">{debugEnabled ? "Local debug mode" : "Offline-first UI flow"}</div>
          </div>
        </div>

        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch theme`}>
          {theme === "light" ? "Dark" : "Light"}
        </button>
      </header>

      <main className="appMain">
        {screen === SCREEN.HOME && (
          <HomeScreen onStartSolo={handleStartSolo} onStartMultiplayer={handleOpenMultiplayer} />
        )}

        {screen === SCREEN.SOLO && <Game onGameOver={handleGameOver} onExit={handleGoHome} />}

        {screen === SCREEN.MULTIPLAYER && <MultiplayerScreen onBackHome={handleGoHome} />}

        {screen === SCREEN.RESULTS && (
          <ResultsScreen results={results} onPlayAgain={handleStartSolo} onBackHome={handleGoHome} />
        )}
      </main>

      <footer className="appFooter">
        <span className="muted">
          Backend URLs are env-driven (e.g., REACT_APP_API_BASE / REACT_APP_WS_URL). Multiplayer screen is a placeholder
          until services are connected.
        </span>
      </footer>
    </div>
  );
}

export default App;
