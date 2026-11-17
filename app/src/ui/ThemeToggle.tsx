import { useSyncExternalStore } from "react";
import { currentMode, setMode, subscribeTheme, type Mode } from "../lib/theme";
import { IconMoon, IconSun } from "./icons";

const OPTIONS: { id: Mode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
];

/** A small glass pill with three choices: Auto (follows the visitor's clock, the default), Day and Night. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribeTheme, currentMode, () => "auto" as Mode);
  const at = OPTIONS.findIndex((o) => o.id === mode);
  const pick = (i: number) => setMode(OPTIONS[(i + OPTIONS.length) % OPTIONS.length]!.id);
  return (
    <div className="theme-toggle glass" role="radiogroup" aria-label="Light or dark: Auto follows your clock">
      <span className="tt-thumb" style={{ transform: `translate3d(calc(var(--tt-w) * ${Math.max(0, at)}), 0, 0)` }} aria-hidden="true" />
      {OPTIONS.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-label={o.label}
          className="tt-opt"
          aria-checked={mode === o.id}
          tabIndex={mode === o.id ? 0 : -1}
          onClick={() => pick(i)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), pick(i + 1));
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), pick(i - 1));
          }}
        >
          {o.id === "day" ? <IconSun size={14} /> : o.id === "night" ? <IconMoon size={14} /> : null}
          <span className={o.id === "auto" ? "" : "tt-lbl"}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
