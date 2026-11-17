/**
 * Auto, Day or Night for the whole site. Auto (the default) follows the visitor's own clock; the choice is remembered.
 * The page colours come from lib/sky.ts. They change by a slow blend, never a jump (and at once for people who ask for less motion).
 */
import { hex, isDark, parseMode, rgb, skyFor, type Mode, type Sky } from "./sky";

export type Theme = "light" | "dark";
export type { Mode };
const KEY = "tabella.theme.v1"; // older versions stored "light" or "dark" here; both still read
const listeners = new Set<() => void>();
let mode: Mode = "auto";
let shown: Sky | null = null;
let raf = 0;

/** The hour on the visitor's clock (a number: 13.5 is half past one). A test can set window.__tabellaHour to look at another time. */
export function clockHour(): number {
  const w = typeof window === "undefined" ? undefined : (window as unknown as { __tabellaHour?: number });
  if (w && typeof w.__tabellaHour === "number") return w.__tabellaHour;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

export function storedMode(): Mode {
  try {
    return parseMode(window.localStorage.getItem(KEY)) ?? "auto";
  } catch {
    return "auto";
  }
}
export const currentMode = (): Mode => mode;
export const currentTheme = (): Theme => (typeof document === "undefined" ? "light" : document.documentElement.dataset.theme === "dark" ? "dark" : "light");

const calm = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function paint(s: Sky) {
  shown = s;
  const el = document.documentElement;
  const set = (k: string, v: string) => el.style.setProperty(k, v);
  set("--sky-top", rgb(s.top));
  set("--sky-bot", rgb(s.bot));
  set("--cloud-lit", rgb(s.lit));
  set("--cloud-shade", rgb(s.shade));
  set("--cloud", s.cloud.toFixed(3));
  set("--stars", s.stars.toFixed(3));
  set("--pearl", hex(s.bot));
  const t = isDark(s) ? "dark" : "light";
  if (el.dataset.theme !== t) {
    el.dataset.theme = t;
    listeners.forEach((f) => f());
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hex(s.top));
}

/** Blend from what is shown to the sky for the current mode and time. */
function glide(): void {
  if (typeof document === "undefined") return;
  const target = skyFor(mode, clockHour());
  cancelAnimationFrame(raf);
  if (!shown || calm()) return paint(target);
  const from = shown;
  const t0 = performance.now();
  const D = 1400;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / D);
    const e = k * k * (3 - 2 * k);
    paint({
      top: from.top.map((v, i) => v + (target.top[i]! - v) * e) as Sky["top"],
      bot: from.bot.map((v, i) => v + (target.bot[i]! - v) * e) as Sky["bot"],
      lit: from.lit.map((v, i) => v + (target.lit[i]! - v) * e) as Sky["lit"],
      shade: from.shade.map((v, i) => v + (target.shade[i]! - v) * e) as Sky["shade"],
      cloud: from.cloud + (target.cloud - from.cloud) * e,
      stars: from.stars + (target.stars - from.stars) * e,
      night: from.night + (target.night - from.night) * e,
    });
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** The person's choice: applied now and remembered. */
export function setMode(m: Mode): void {
  mode = m;
  try {
    window.localStorage.setItem(KEY, m);
  } catch {
    /* fine: it just will not be remembered */
  }
  glide();
  listeners.forEach((f) => f());
}

/** Called once at start: apply the saved mode, then keep the sky in step with the clock (not while the tab is hidden). */
export function initTheme(): void {
  mode = storedMode();
  shown = null;
  glide();
  const tick = () => {
    if (!document.hidden && mode !== "night") glide();
  };
  setInterval(tick, 60_000);
  document.addEventListener("visibilitychange", () => {
    document.documentElement.toggleAttribute("data-hidden", document.hidden);
    if (!document.hidden) tick();
  });
}

export const subscribeTheme = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
