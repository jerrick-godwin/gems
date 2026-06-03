import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

function getStoredTheme(storageKey: string): ThemePreference {
  if (typeof window === "undefined") return "system";
  const storedTheme = window.localStorage.getItem(storageKey);
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
}

export function useTheme(storageKey: string) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(storageKey));

  useEffect(() => {
    window.localStorage.setItem(storageKey, theme);

    const applyTheme = (nextTheme: "light" | "dark") => {
      document.documentElement.dataset.theme = nextTheme;
    };

    if (theme === "light" || theme === "dark") {
      applyTheme(theme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(mediaQuery.matches ? "dark" : "light");

    const listener = (event: MediaQueryListEvent) => applyTheme(event.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", listener);

    return () => mediaQuery.removeEventListener("change", listener);
  }, [storageKey, theme]);

  return [theme, setTheme] as const;
}
