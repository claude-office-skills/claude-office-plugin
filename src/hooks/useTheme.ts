import { useState, useEffect, useCallback } from "react";

export type Theme = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "claude-excel-theme";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(theme: Theme) {
  const resolved: ResolvedTheme = theme === "auto" ? getSystemTheme() : theme;
  document.documentElement.dataset.theme = resolved;
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "auto" || stored === "light" || stored === "dark")
      return stored;
  } catch (_) {}
  return "auto";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {}
    setThemeState(next);
    applyTheme(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const order: Theme[] = ["dark", "auto", "light"];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (_) {}
      applyTheme(next);
      return next;
    });
  }, []);

  // Apply on mount
  useEffect(() => {
    applyTheme(theme);
  }, []);

  // Listen for system preference changes in auto mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      setThemeState((current) => {
        if (current === "auto") applyTheme("auto");
        return current;
      });
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === "auto" ? getSystemTheme() : theme;

  return { theme, resolvedTheme, setTheme, cycleTheme };
}
