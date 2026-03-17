import { create } from "zustand";

interface ThemeState {
  dark: boolean;
  toggleTheme: () => void;
  initTheme: () => void;
}

// ✅ Dark mode removido — sistema fixo em light mode
export const useThemeStore = create<ThemeState>(() => ({
  dark: false,
  toggleTheme: () => {},
  initTheme: () => {
    document.documentElement.classList.remove("dark");
  },
}));
