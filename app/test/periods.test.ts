import { describe, expect, it } from "vitest";
import { WARNING_DAYS, WHEN_OPTIONS, whenById } from "../src/lib/periods";

const DAY = 86_400;

describe("when it should open", () => {
  it("offers 3, 6 and 12 months with a 14-day countdown, and a hidden 2-minute demo", () => {
    const visible = WHEN_OPTIONS.filter((o) => !o.hidden).map((o) => [o.label, o.quiet / DAY, o.warning / DAY]);
    expect(visible).toEqual([
      ["3 months", 90, WARNING_DAYS],
      ["6 months", 180, WARNING_DAYS],
      ["12 months", 365, WARNING_DAYS],
    ]);
    const demo = WHEN_OPTIONS.filter((o) => o.hidden);
    expect(demo).toHaveLength(1);
    expect(demo[0]).toMatchObject({ id: "demo", quiet: 120, warning: 60 });
  });

  it("never exceeds the contract's limit of 3650 days, and a period is never zero", () => {
    for (const o of WHEN_OPTIONS) {
      expect(o.quiet).toBeGreaterThan(0);
      expect(o.warning).toBeGreaterThan(0);
      expect(o.quiet).toBeLessThanOrEqual(3650 * DAY);
      expect(o.warning).toBeLessThanOrEqual(3650 * DAY);
    }
  });

  it("falls back to 6 months for an unknown id", () => {
    expect(whenById("nonsense" as never).id).toBe("6m");
  });
});
