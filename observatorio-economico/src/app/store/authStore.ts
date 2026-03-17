import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  role: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => void;
}

import { login as apiLogin, logout as apiLogout } from "../../services/api";

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!localStorage.getItem("access_token"),
  role: null,

  login: async (email, password) => {
    try {
      await apiLogin(email, password);
      const token = localStorage.getItem("access_token");

      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        set({
          isAuthenticated: true,
          role: payload.role || null,
        });
        return true;
      }

      return false;
    } catch {
      return false;
    }
  },

  logout: () => {
    apiLogout();
    set({ isAuthenticated: false, role: null });
  },

  checkAuth: () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ isAuthenticated: false, role: null });
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      set({
        isAuthenticated: true,
        role: payload.role || null,
      });
    } catch {
      set({ isAuthenticated: false, role: null });
    }
  },
}));
