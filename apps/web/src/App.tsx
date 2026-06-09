import { useEffect, useMemo, useState } from "react";
import { Check, Settings, X } from "lucide-react";

type TinkerTheme = "graphite" | "porcelain" | "nocturne";

type ThemeOption = {
  id: TinkerTheme;
  label: string;
  meta: string;
  source: string;
};

const THEME_STORAGE_KEY = "tinker-theme";
const ARTBOARD = { width: 1440, height: 900 };

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "graphite",
    label: "Graphite",
    meta: "dark pro tool · Helvetica + JetBrains Mono · indigo",
    source: "/reference-designs/graphite.html",
  },
  {
    id: "porcelain",
    label: "Porcelain",
    meta: "light editorial · Instrument Sans + Plex Mono · ink blue",
    source: "/reference-designs/porcelain.html",
  },
  {
    id: "nocturne",
    label: "Nocturne",
    meta: "blue-black · Space Grotesk + Plex Mono · accent via Tweaks",
    source: "/reference-designs/nocturne.html",
  },
];

export function App() {
  const [theme, setTheme] = useState<TinkerTheme>(readInitialTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scale, setScale] = useState(() => getScale());

  const activeTheme = useMemo(
    () => THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0],
    [theme],
  );

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    function onResize() {
      setScale(getScale());
    }

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <main className={`reference-shell theme-${theme}`} aria-label="Tinker editor">
      <section className="reference-viewport" aria-label="Reference design preview">
        <div
          className="reference-stage"
          style={{
            height: ARTBOARD.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            width: ARTBOARD.width,
          }}
        >
          <iframe
            className="reference-frame"
            src={activeTheme.source}
            title={`${activeTheme.label} reference design`}
          />

          <button
            className="settings-trigger"
            type="button"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Settings size={18} />
          </button>

          {settingsOpen ? (
            <SettingsPanel
              activeTheme={theme}
              onClose={() => setSettingsOpen(false)}
              onThemeChange={setTheme}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SettingsPanel({
  activeTheme,
  onClose,
  onThemeChange,
}: {
  activeTheme: TinkerTheme;
  onClose: () => void;
  onThemeChange: (theme: TinkerTheme) => void;
}) {
  return (
    <section className="settings-panel" aria-label="Settings panel">
      <div className="settings-panel-header">
        <div>
          <h2>Settings</h2>
          <p>Theme</p>
        </div>
        <button className="settings-close" type="button" aria-label="Close settings" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className="theme-list" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            className={activeTheme === option.id ? "active" : undefined}
            key={option.id}
            type="button"
            aria-pressed={activeTheme === option.id}
            onClick={() => onThemeChange(option.id)}
          >
            <span className={`theme-swatch ${option.id}`} aria-hidden="true" />
            <span>
              <strong>{option.label}</strong>
              <small>{option.meta}</small>
            </span>
            {activeTheme === option.id ? <Check size={15} /> : <span aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  );
}

function readInitialTheme(): TinkerTheme {
  if (typeof window === "undefined") {
    return "graphite";
  }

  const urlTheme = new URL(window.location.href).searchParams.get("theme");
  if (isTheme(urlTheme)) {
    return urlTheme;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(storedTheme) ? storedTheme : "graphite";
}

function isTheme(value: string | null): value is TinkerTheme {
  return THEME_OPTIONS.some((option) => option.id === value);
}

function getScale() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.min(window.innerWidth / ARTBOARD.width, window.innerHeight / ARTBOARD.height);
}
