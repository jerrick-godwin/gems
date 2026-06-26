import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "../hooks/useTheme";

type ThemeSwitcherProps = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

export function ThemeSwitcher({ theme, setTheme }: ThemeSwitcherProps) {
  return (
    <div className="theme-switcher" role="group" aria-label="Theme preference">
      <button className={`theme-option ${theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")} aria-label="Use light theme" title="Light theme" type="button">
        <Sun size={16} />
      </button>
      <button className={`theme-option ${theme === "system" ? "active" : ""}`} onClick={() => setTheme("system")} aria-label="Use system theme" title="System theme" type="button">
        <Monitor size={16} />
      </button>
      <button className={`theme-option ${theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")} aria-label="Use dark theme" title="Dark theme" type="button">
        <Moon size={16} />
      </button>
    </div>
  );
}
