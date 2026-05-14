import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "neon",    label: "Neon Cyber",    dark: true  },
  { id: "aurora",  label: "Aurora",        dark: true  },
  { id: "sunset",  label: "Sunset Glass",  dark: true  },
  { id: "minimal", label: "Minimal Dark",  dark: true  },
  { id: "light",   label: "Light Pro",     dark: false },
];

const ALL_CLASSES = THEMES.map((t) => `theme-${t.id}`);

const ThemeContext = createContext({
  theme: "neon",
  themeId: "neon",
  isDark: true,
  setThemeId: () => {},
  toggleTheme: () => {},
});

function readStoredTheme() {
  // Migrate legacy "light"/"dark" values used by previous ThemeContext.
  const stored = localStorage.getItem("nid-theme");
  if (stored && THEMES.find((t) => t.id === stored)) return stored;
  const legacy = localStorage.getItem("theme");
  if (legacy === "dark") return "neon";
  if (legacy === "light") return "light";
  return "neon";
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(readStoredTheme);

  useEffect(() => {
    const body = document.body;
    ALL_CLASSES.forEach((c) => body.classList.remove(c));
    body.classList.add(`theme-${themeId}`);

    const meta = THEMES.find((t) => t.id === themeId);
    const isDark = meta?.dark ?? true;
    // keep tailwind dark: variants working for legacy components
    document.documentElement.classList.toggle("dark", isDark);

    localStorage.setItem("nid-theme", themeId);
    // keep legacy key in sync so anything still reading it sees a sane value
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [themeId]);

  // Legacy: toggle just flips between Neon (dark default) and Light Pro
  const toggleTheme = () => {
    setThemeId((prev) => (prev === "light" ? "neon" : "light"));
  };

  const isDark = (THEMES.find((t) => t.id === themeId)?.dark) ?? true;

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        setThemeId,
        // legacy alias used elsewhere as `theme === "dark" | "light"`
        theme: isDark ? "dark" : "light",
        isDark,
        toggleTheme,
        themes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
