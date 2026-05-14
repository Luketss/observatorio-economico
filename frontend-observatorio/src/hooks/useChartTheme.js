import { useTheme } from "../context/ThemeContext";

// Per-theme palette so existing recharts code picks up the active visual style.
const PALETTES = {
  neon: {
    grid: "rgba(120, 145, 255, 0.10)",
    axis: "rgba(120, 145, 255, 0.18)",
    tick: "#7c87b3",
    bg: "#0d1123",
    border: "rgba(120, 145, 255, 0.22)",
    text: "#eef0ff",
  },
  aurora: {
    grid: "rgba(180, 150, 255, 0.10)",
    axis: "rgba(180, 150, 255, 0.20)",
    tick: "#9a8fc4",
    bg: "#161232",
    border: "rgba(180, 150, 255, 0.24)",
    text: "#f1ecff",
  },
  sunset: {
    grid: "rgba(255, 180, 140, 0.10)",
    axis: "rgba(255, 180, 140, 0.20)",
    tick: "#c4a294",
    bg: "#28161c",
    border: "rgba(255, 180, 140, 0.22)",
    text: "#fff2e8",
  },
  minimal: {
    grid: "rgba(255,255,255,0.06)",
    axis: "rgba(255,255,255,0.12)",
    tick: "#8a8a93",
    bg: "#111114",
    border: "rgba(255,255,255,0.12)",
    text: "#f4f4f5",
  },
  light: {
    grid: "#f1f5f9",
    axis: "#e2e8f0",
    tick: "#64748b",
    bg: "#ffffff",
    border: "#e2e8f0",
    text: "#1e293b",
  },
};

export function useChartTheme() {
  const { themeId } = useTheme();
  const p = PALETTES[themeId] || PALETTES.neon;
  return {
    grid: p.grid,
    axis: p.axis,
    tick: p.tick,
    tooltipStyle: {
      backgroundColor: p.bg,
      border: `1px solid ${p.border}`,
      borderRadius: "12px",
      fontSize: "13px",
      color: p.text,
    },
  };
}
