import { useCallback, useEffect } from "react";

export type ThemeMode = "system" | "light" | "dark";

/** Shared localStorage key — matches useUserSettings and sync.ts SETTINGS_KEY. */
const SETTINGS_KEY = "app:settings:v1";

function writeThemeToStorage(mode: ThemeMode): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, theme: mode }));
  } catch { /* ignore */ }
}

/** The product is locked to the clay & cream light palette. OS dark mode is ignored. */
export function applyTheme(_mode?: ThemeMode): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", "light");
  root.style.colorScheme = "light";
  writeThemeToStorage("light");
}

export function useDarkMode(): {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
} {
  useEffect(() => {
    applyTheme("light");
  }, []);

  const setMode = useCallback((_m: ThemeMode) => {
    applyTheme("light");
  }, []);

  return { mode: "light", setMode, isDark: false };
}
