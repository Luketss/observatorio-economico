import { useTheme } from "../context/ThemeContext";

export function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    grid:    dark ? "#1e293b" : "#f1f5f9",
    axis:    dark ? "#334155" : "#e2e8f0",
    tick:    dark ? "#94a3b8" : "#64748b",
    tooltipStyle: {
      backgroundColor: dark ? "#0f172a" : "#ffffff",
      border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`,
      borderRadius: "12px",
      fontSize: "13px",
      color: dark ? "#f1f5f9" : "#1e293b",
    },
  };
}
