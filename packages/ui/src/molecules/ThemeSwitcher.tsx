import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "../hooks/useTheme";

type ThemeSwitcherProps = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

export function ThemeSwitcher({ theme, setTheme }: ThemeSwitcherProps) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--panel-strong)", padding: 4, borderRadius: "var(--radius-full)", border: "1px solid var(--line)" }}>
      <button onClick={() => setTheme("light")} style={{ background: theme === "light" ? "var(--emerald-subtle)" : "transparent", color: theme === "light" ? "var(--emerald)" : "var(--muted)", border: "none", borderRadius: "50%", padding: 6, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Light theme">
        <Sun size={16} />
      </button>
      <button onClick={() => setTheme("system")} style={{ background: theme === "system" ? "var(--emerald-subtle)" : "transparent", color: theme === "system" ? "var(--emerald)" : "var(--muted)", border: "none", borderRadius: "50%", padding: 6, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="System theme">
        <Monitor size={16} />
      </button>
      <button onClick={() => setTheme("dark")} style={{ background: theme === "dark" ? "var(--emerald-subtle)" : "transparent", color: theme === "dark" ? "var(--emerald)" : "var(--muted)", border: "none", borderRadius: "50%", padding: 6, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Dark theme">
        <Moon size={16} />
      </button>
    </div>
  );
}
