export const designTokens = {
  color: {
    emerald: "#00f5a0",
    emeraldDark: "#00d2ff",
    emeraldLight: "#6ee7b7",
    graphite: "#f8fafc",
    graphiteLight: "#e2e8f0",
    gold: "#00d2ff",
    goldLight: "#38bdf8",
    sage: "#94a3b8",
    sageMuted: "#64748b",
    line: "rgba(255, 255, 255, 0.1)",
    lineSoft: "rgba(255, 255, 255, 0.05)",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceDim: "rgba(255, 255, 255, 0.02)",
    background: "#09090b",
    danger: "#f87171",
    dangerSoft: "rgba(248, 113, 113, 0.15)",
    mint: "rgba(0, 210, 255, 0.15)"
  },
  radius: {
    control: 8,
    card: 12,
    full: 9999
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32
  },
  shadow: {
    soft: "0 10px 28px rgba(19, 41, 35, 0.06)",
    medium: "0 18px 52px rgba(19, 41, 35, 0.09)",
    strong: "0 24px 72px rgba(19, 41, 35, 0.14)"
  }
};

export { useOutsideClick, useTheme, type ThemePreference } from "./hooks";
export { ThemeSwitcher } from "./molecules";
