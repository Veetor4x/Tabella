/**
 * System, Light or Dark for the whole site. System (the default) follows the device's own light/dark setting and updates live when the device
 * switches; Light and Dark are fixed. The choice is remembered. Light vs dark comes from nothing else (not the clock). Within the light page the
 * clouds still shift gently with the hour. The page colours come from lib/sky.ts and change by a slow blend (at once for reduced motion).
 */
import { hex, isDark, parseChoice, resolveDark, rgb, skyFor, type Choice, type Sky } from "./sky";

export type Theme = "light" | "dark";
export type { Choice };
const KEY = "tabella.theme.v1"; // "system", "light" or "dark" (older versions saved "auto", "day", "night" here; they still read)
const listeners = new Set<() => void>();
let choice: Choice = "system";
let shown: Sky | null = null;
let raf = 0;

/** The hour on the visitor's clock (a number: 13.5 is half past one). Only the light page's clouds use it. A test can set window.__tabellaHour. */
export function clockHour(): number {
  const w = typeof window === "undefined" ? undefined : (window as unknown as { __tabellaHour?: number });
  if (w && typeof w.__tabellaHour === "number") return w.__tabellaHour;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const deviceQuery = () => (typeof window === "undefined" ? undefined : window.matchMedia?.("(prefers-color-scheme: dark)"));
/** Is the device set to dark right now? */
export const deviceDark = (): boolean => !!deviceQuery()?.matches;

export function storedChoice(): Choice {
  try {
    return parseChoice(window.localStorage.getItem(KEY)) ?? "system";
  } catch {
    return "system";
  }
}
export const currentChoice = (): Choice => choice;
export const currentTheme = (): Theme => (typeof document === "undefined" ? "light" : document.documentElement.dataset.theme === "dark" ? "dark" : "light");

const calm = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function paint(s: Sky) {
  shown = s;
  const el = document.documentElement;
  const set = (k: string, v: string) => el.style.setProperty(k, v);
  set("--sky-top", rgb(s.top));
  set("--sky-bot", rgb(s.bot));
  // the light sky takes the pinker of the two colours; the dark sky keeps an even mix, as before
  const k = isDark(s) ? 0.5 : 0.8;
  set("--cloud-tint", rgb([0, 1, 2].map((i) => s.lit[i]! * (1 - k) + s.shade[i]! * k) as Sky["lit"]));
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

/** Blend from what is shown to the sky for the current choice (and device setting, and hour). */
function glide(): void {
  if (typeof document === "undefined") return;
  const target = skyFor(resolveDark(choice, deviceDark()) ? "night" : "day", clockHour());
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
export function setChoice(c: Choice): void {
  choice = c;
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    /* fine: it just will not be remembered */
  }
  glide();
  listeners.forEach((f) => f());
}

/** Called once at start: apply the saved choice, follow the device live while it is System, and let the light clouds drift through the hours. */
export function initTheme(): void {
  choice = storedChoice();
  shown = null;
  glide();
  const q = deviceQuery();
  const onDevice = () => {
    if (choice === "system") glide(); // the device switched: so does the page, at once
  };
  if (q?.addEventListener) q.addEventListener("change", onDevice);
  else (q as unknown as { addListener?: (f: () => void) => void } | undefined)?.addListener?.(onDevice);
  setInterval(() => {
    if (!document.hidden && !resolveDark(choice, deviceDark())) glide(); // only the light clouds change with the hour
  }, 60_000);
  document.addEventListener("visibilitychange", () => {
    document.documentElement.toggleAttribute("data-hidden", document.hidden);
    if (!document.hidden) glide();
  });
}

export const subscribeTheme = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
