/**
 * The colours of the sky, from the visitor's own clock. Pure functions: nothing here touches the page.
 * Morning is warm cream and peach, afternoon is pearl and blush, evening is dusky rose, night is deep ink with
 * moonlit grey clouds and a few faint stars. Between two moments the colours blend, so nothing ever jumps.
 */
export type Rgb = [number, number, number];
export interface Sky {
  top: Rgb;
  bot: Rgb;
  lit: Rgb;
  shade: Rgb;
  /** how strongly the clouds show (0 to 1) */
  cloud: number;
  /** how many stars show (0 to 1) */
  stars: number;
  /** 0 = day, 1 = night: decides the light or dark text colours */
  night: number;
}
export type Mode = "auto" | "day" | "night";
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

export const PALETTE: Record<PartOfDay, Sky> = {
  morning: { top: [247, 230, 214], bot: [252, 241, 231], lit: [255, 247, 240], shade: [243, 199, 177], cloud: 0.9, stars: 0, night: 0 },
  afternoon: { top: [237, 240, 244], bot: [246, 242, 239], lit: [255, 255, 255], shade: [241, 202, 207], cloud: 0.9, stars: 0, night: 0 },
  evening: { top: [221, 189, 199], bot: [238, 213, 210], lit: [250, 226, 221], shade: [188, 132, 151], cloud: 0.95, stars: 0, night: 0 },
  night: { top: [7, 9, 14], bot: [16, 19, 28], lit: [104, 114, 136], shade: [36, 42, 58], cloud: 0.55, stars: 1, night: 1 },
};

/** Where in the day each look is at its fullest (hours on the clock, 0 to 24). */
const STOPS: [number, PartOfDay][] = [
  [0, "night"],
  [5, "night"],
  [7.5, "morning"],
  [10.5, "morning"],
  [12.5, "afternoon"],
  [16.5, "afternoon"],
  [18.5, "evening"],
  [20.5, "evening"],
  [22.5, "night"],
  [24, "night"],
];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function blend(a: Sky, b: Sky, t: number): Sky {
  return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), lit: mix(a.lit, b.lit, t), shade: mix(a.shade, b.shade, t), cloud: lerp(a.cloud, b.cloud, t), stars: lerp(a.stars, b.stars, t), night: lerp(a.night, b.night, t) };
}

/** The sky at a time of day (hour as a number, so 13.5 is half past one). */
export function skyAtHour(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [h0, p0] = STOPS[i]!;
    const [h1, p1] = STOPS[i + 1]!;
    if (h >= h0 && h <= h1) {
      const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
      const e = t * t * (3 - 2 * t); // ease the change, so it is slow at both ends
      return blend(PALETTE[p0], PALETTE[p1], e);
    }
  }
  return PALETTE.afternoon;
}

export function partOfDay(hour: number): PartOfDay {
  const h = ((hour % 24) + 24) % 24;
  return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17.5 ? "afternoon" : h >= 17.5 && h < 21.5 ? "evening" : "night";
}

/** What the sky is for a chosen mode: Auto follows the clock, Day never goes dark, Night is always night. */
export function skyFor(mode: Mode, hour: number): Sky {
  if (mode === "night") return PALETTE.night;
  const s = skyAtHour(hour);
  if (mode === "day" && s.night > 0.25) return skyAtHour(14); // a day look at night: a pearl afternoon
  return s;
}

export const rgb = (c: Rgb) => `${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])}`;
export const isDark = (s: Sky) => s.night > 0.5;
export const hex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function parseMode(v: unknown): Mode | null {
  return v === "auto" || v === "day" || v === "night" ? v : v === "light" ? "day" : v === "dark" ? "night" : null;
}
