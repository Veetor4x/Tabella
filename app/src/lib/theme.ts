/**
 * Light or dark for the whole site. The choice is remembered; until someone makes one, it follows the phone's setting
 * (and keeps following it if that changes).
 */
export type Theme = "light" | "dark";
const KEY = "tabella.theme.v1";
const listeners = new Set<() => void>();

export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
export function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}
export const currentTheme = (): Theme => (typeof document === "undefined" ? "light" : ((document.documentElement.dataset.theme as Theme | undefined) ?? storedTheme() ?? systemTheme()));

const COLOR: Record<Theme, string> = { light: "#f4f3ef", dark: "#0c0e13" };
export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLOR[t]);
  listeners.forEach((f) => f());
}

/** The person's choice: applied now and remembered. */
export function setTheme(t: Theme): void {
  try {
    window.localStorage.setItem(KEY, t);
  } catch {
    /* fine: it just will not be remembered */
  }
  applyTheme(t);
}

/** Called once at start: apply the saved or system theme, and follow the phone while no choice has been made. */
export function initTheme(): void {
  applyTheme(storedTheme() ?? systemTheme());
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!storedTheme()) applyTheme(systemTheme());
    });
  } catch {
    /* old browsers: no live following */
  }
}

export const subscribeTheme = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
