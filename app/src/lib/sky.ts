/**
 * The colours of the sky, from the visitor's own clock. Pure functions: nothing here touches the page.
 * The light page is always warm pearl (these values show as about #F4F1EA once the fine grain is on top); only the clouds change colour through the day: peach in the morning, blush by day,
 * dusky rose in the evening. Night is deep ink with
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
/** The look: the light page (clouds follow the hour) or the dark page. Which one is shown comes only from the toggle or the device (see lib/theme.ts). */
export type Mode = "day" | "night";
/** What the person picks: follow the device, or force light or dark. */
export type Choice = "system" | "light" | "dark";
export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

export const PALETTE: Record<PartOfDay, Sky> = {
    morning: { top: [250, 246, 238], bot: [249, 245, 237], lit: [246, 212, 194], shade: [236, 178, 162], cloud: 1, stars: 0, night: 0 },
    afternoon: { top: [248, 245, 238], bot: [247, 244, 237], lit: [240, 205, 208], shade: [226, 170, 182], cloud: 1, stars: 0, night: 0 },
    evening: { top: [246, 242, 236], bot: [245, 241, 235], lit: [236, 198, 204], shade: [208, 154, 172], cloud: 1, stars: 0, night: 0 },
  night: { top: [8, 10, 15], bot: [16, 19, 28], lit: [72, 80, 102], shade: [36, 42, 60], cloud: 0.8, stars: 1, night: 1 },
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
      // ease the change, so it is slow at both ends; and into or out of night, hold the old look and then cross the dim middle
      // (where neither dark nor light text reads well) quickly, instead of lingering in it
      const edge = (p0 === "night") !== (p1 === "night");
      const u = edge ? Math.min(1, Math.max(0, (t - 0.32) / 0.36)) : t;
      const e = u * u * (3 - 2 * u);
      return blend(PALETTE[p0], PALETTE[p1], e);
    }
  }
  return PALETTE.afternoon;
}

export function partOfDay(hour: number): PartOfDay {
  const h = ((hour % 24) + 24) % 24;
  return h >= 5 && h < 11 ? "morning" : h >= 11 && h < 17.5 ? "afternoon" : h >= 17.5 && h < 21.5 ? "evening" : "night";
}

/** The sky for a look. The dark look is always night. The light look is never dark: its clouds shift gently with the hour (peach, blush, dusky rose), and at night hours it keeps a soft afternoon sky. */
export function skyFor(mode: Mode, hour: number): Sky {
  if (mode === "night") return PALETTE.night;
  const s = skyAtHour(hour);
  return s.night > 0.25 ? skyAtHour(14) : s;
}

export const rgb = (c: Rgb) => `${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])}`;
/** Light text goes on once the sky is darker than the point where light and dark text read equally well. */
const lum = (c: Rgb) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
export const isDark = (s: Sky) => lum(s.bot) < 0.18;
export const hex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** A saved choice. Older versions saved "auto", "day", "night" (and "light", "dark"): they still read. */
export function parseChoice(v: unknown): Choice | null {
  return v === "system" || v === "light" || v === "dark" ? v : v === "auto" ? "system" : v === "day" ? "light" : v === "night" ? "dark" : null;
}

/** Light or dark comes only from the choice, or from the device when the choice is System. */
export const resolveDark = (choice: Choice, deviceDark: boolean): boolean => choice === "dark" || (choice === "system" && deviceDark);
