import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as motion from "../src/ui/motion";

// The rule for smooth motion on phones: animate only transform and opacity.
const ANIMATABLE = new Set(["x", "y", "scale", "scaleX", "scaleY", "rotate", "rotateX", "rotateY", "opacity"]);
const STRUCTURE = new Set(["initial", "animate", "exit", "hidden", "show", "enter", "center", "whileInView"]);

/** Every property name an animation preset touches (timing settings under `transition` are not properties). */
function animatedKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "function") {
    for (const args of [[1, 2], [-1, 0], [0, 0]]) animatedKeys((value as (...a: number[]) => unknown)(...args), out);
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === "transition") continue;
      if (STRUCTURE.has(k)) animatedKeys(v, out);
      else {
        out.add(k);
        if (typeof v === "function") animatedKeys(v, out);
      }
    }
  }
  return out;
}

describe("animations only move and fade (transform + opacity)", () => {
  const presets = Object.entries(motion).filter(([name]) => !/Transition$|^EASE$|^headlineContainer$/.test(name));

  it("has presets to check", () => {
    expect(presets.length).toBeGreaterThan(12);
  });

  it.each(presets)("preset %s", (_name, preset) => {
    const keys = [...animatedKeys(preset)];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !ANIMATABLE.has(k))).toEqual([]);
  });

  it("inline animation props in components also only use transform and opacity", () => {
    const dirs = ["src", "src/ui", "src/steps", "src/landing", "src/me"];
    const bad: string[] = [];
    for (const d of dirs) {
      for (const f of readdirSync(new URL(`../${d}/`, import.meta.url)).filter((n) => n.endsWith(".tsx"))) {
        const src = readFileSync(new URL(`../${d}/${f}`, import.meta.url), "utf8");
        expect(src, `${f} must not use layout animations`).not.toMatch(/\slayout(Id)?[=\s>]/);
        for (const mm of src.matchAll(/\b(initial|animate|exit|whileTap|whileHover|whileInView)=\{\{([^}]*)\}\}/g)) {
          for (const key of mm[2]!.matchAll(/(?:^|,)\s*([A-Za-z]+)\s*:/g)) {
            if (!ANIMATABLE.has(key[1]!) && key[1] !== "transition") bad.push(`${f}: ${key[1]}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("CSS transitions only name transform or opacity", () => {
    const transitions = [...css.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)].map((mm) => mm[1]!.trim());
    expect(transitions.length).toBeGreaterThan(0);
    for (const t of transitions) expect(t, t).toMatch(/^(transform|opacity)\b/);
    expect(css).not.toMatch(/transition\s*:\s*all/);
  });

  it("CSS keyframes only change transform or opacity", () => {
    const blocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const [, name, body] of blocks) {
      const props = [...body!.matchAll(/([a-z-]+)\s*:/g)].map((mm) => mm[1]);
      expect(props.filter((p) => p !== "transform" && p !== "opacity"), `@keyframes ${name}`).toEqual([]);
    }
  });

  it("has a calm version for people who prefer reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")).toContain('reducedMotion="user"');
  });
});

describe("the seal sound", () => {
  it("is off by default", async () => {
    const { isSoundOn } = await import("../src/lib/sound");
    expect(isSoundOn()).toBe(false);
  });
});
