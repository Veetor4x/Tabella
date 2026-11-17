import { useSyncExternalStore } from "react";
import { currentTheme, setTheme, subscribeTheme } from "../lib/theme";
import { IconMoon, IconSun } from "./icons";

/** A small glass pill with a thin sun and moon: the lit one is the mode you are in. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as const);
  const dark = theme === "dark";
  return (
    <button type="button" className="theme-toggle glass" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={() => setTheme(dark ? "light" : "dark")}>
      <span className="tt-thumb" style={{ transform: dark ? "translate3d(26px, 0, 0)" : "translate3d(0, 0, 0)" }} aria-hidden="true" />
      <span className={`tt-ico ${dark ? "" : "on"}`} aria-hidden="true">
        <IconSun size={16} />
      </span>
      <span className={`tt-ico ${dark ? "on" : ""}`} aria-hidden="true">
        <IconMoon size={16} />
      </span>
    </button>
  );
}
