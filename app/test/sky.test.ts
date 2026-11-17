import { describe, expect, it } from "vitest";
import { PALETTE, isDark, partOfDay, skyAtHour, skyFor, parseMode, hex } from "../src/lib/sky";

describe("the sky follows the clock", () => {
  it("names the part of the day", () => {
    expect(partOfDay(8)).toBe("morning");
    expect(partOfDay(14)).toBe("afternoon");
    expect(partOfDay(19)).toBe("evening");
    expect(partOfDay(23.5)).toBe("night");
    expect(partOfDay(3)).toBe("night");
  });
  it("is at its fullest look at the middle of each part", () => {
    expect(skyAtHour(9).top).toEqual(PALETTE.morning.top);
    expect(skyAtHour(14).top).toEqual(PALETTE.afternoon.top);
    expect(skyAtHour(19.5).top).toEqual(PALETTE.evening.top);
    expect(skyAtHour(1).top).toEqual(PALETTE.night.top);
  });
  it("blends between two looks: never a jump", () => {
    let prev = skyAtHour(0);
    for (let h = 0.05; h <= 24; h += 0.05) {
      const s = skyAtHour(h);
      for (let i = 0; i < 3; i++) expect(Math.abs(s.top[i]! - prev.top[i]!)).toBeLessThan(30);
      expect(Math.abs(s.night - prev.night)).toBeLessThan(0.3);
      prev = s;
    }
  });
  it("is light by day and dark at night, with stars only at night", () => {
    expect(isDark(skyAtHour(14))).toBe(false);
    expect(isDark(skyAtHour(8))).toBe(false);
    expect(isDark(skyAtHour(19))).toBe(false);
    expect(isDark(skyAtHour(23))).toBe(true);
    expect(skyAtHour(14).stars).toBe(0);
    expect(skyAtHour(23.5).stars).toBe(1);
  });
  it("Auto follows the clock, Day never goes dark, Night is always night", () => {
    expect(skyFor("auto", 23)).toEqual(skyAtHour(23));
    expect(isDark(skyFor("day", 23))).toBe(false);
    expect(skyFor("day", 9)).toEqual(skyAtHour(9));
    expect(isDark(skyFor("night", 13))).toBe(true);
  });
  it("reads saved choices, including the older light and dark", () => {
    expect(parseMode("auto")).toBe("auto");
    expect(parseMode("light")).toBe("day");
    expect(parseMode("dark")).toBe("night");
    expect(parseMode("blue")).toBeNull();
  });
  it("keeps the text readable on every sky, crossing the dim middle of dusk and dawn quickly", () => {
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
    };
    const contrast = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    let dim = 0; // hours spent where the plain text colour reads below 4.5:1
    for (let h = 0; h < 24; h += 0.02) {
      const s = skyAtHour(h);
      const ink = isDark(s) ? [238, 240, 246] : [21, 23, 28];
      const soft = isDark(s) ? [180, 186, 199] : [80, 85, 95];
      const worst = Math.min(...[s.top, s.bot].map((bg) => contrast(ink, bg)));
      const worstSoft = Math.min(...[s.top, s.bot].map((bg) => contrast(soft, bg)));
      if (worst < 4.5 || worstSoft < 3) dim += 0.02;
      else expect(worstSoft, `${h.toFixed(2)}h`).toBeGreaterThan(3);
    }
    expect(dim, `hours in the dim middle`).toBeLessThan(0.6); // both crossings together
    // and in the middle of every part of the day the text is comfortable
    for (const h of [3, 9, 14, 19.5, 23.5]) {
      const s = skyAtHour(h);
      const ink = isDark(s) ? [238, 240, 246] : [21, 23, 28];
      const soft = isDark(s) ? [180, 186, 199] : [80, 85, 95];
      for (const bg of [s.top, s.bot]) {
        expect(contrast(ink, bg)).toBeGreaterThan(8);
        expect(contrast(soft, bg), `${h}h soft text on ${hex(bg)}`).toBeGreaterThan(4.5);
      }
    }
  });
});
