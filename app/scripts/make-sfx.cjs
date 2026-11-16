/**
 * Makes the soft sound effects for the intro as small WAV files (mono, 22.05 kHz), by synthesis, so they are original
 * and carry no licence: typing tick, paper rustle, fold, whoosh, pop, wax stamp, clock tick, warm chime, calendar flip.
 *   node scripts/make-sfx.cjs
 */
const fs = require("node:fs"), path = require("node:path");
const OUT = path.join(__dirname, "..", "src", "assets", "sfx");
const SR = 22050;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const env = (t, a, d) => Math.min(t / a, 1) * Math.exp(-Math.max(t - a, 0) / d);
function make(name, secs, fn) {
  const n = Math.floor(secs * SR), out = new Float32Array(n);
  seed = 7;
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  // gentle fade at the end, peak-limit to 0.7
  let peak = 0;
  for (let i = 0; i < n; i++) { const f = Math.min(1, (n - i) / (SR * 0.03)); out[i] *= f; peak = Math.max(peak, Math.abs(out[i])); }
  const g = peak ? 0.7 / peak : 1;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), buf);
}
// one-pole filters
const lp = (cut) => { let y = 0; const a = 1 - Math.exp(-2 * Math.PI * cut / SR); return (x) => (y += a * (x - y)); };
const hp = (cut) => { const l = lp(cut); return (x) => x - l(x); };

// a soft key tick: a tiny filtered click with a short woody body
{ const f = hp(1500), l = lp(5200); make("type", 0.09, (t) => l(f(rnd())) * env(t, 0.0008, 0.012) * 0.8 + Math.sin(2 * Math.PI * 190 * t) * env(t, 0.001, 0.018) * 0.3); }
// paper rustle: band-limited noise with a few crinkly bursts
{ const f = hp(1800), l = lp(7000); make("rustle", 0.7, (t) => l(f(rnd())) * (env(t, 0.03, 0.12) * 0.7 + env(Math.max(t - 0.18, 0), 0.01, 0.07) * (t > 0.18 ? 0.6 : 0) + env(Math.max(t - 0.38, 0), 0.01, 0.06) * (t > 0.38 ? 0.45 : 0))); }
// folding a sheet: two soft creases
{ const f = hp(900), l = lp(3600); make("fold", 0.6, (t) => l(f(rnd())) * (env(t, 0.01, 0.07) + (t > 0.28 ? env(t - 0.28, 0.01, 0.09) * 0.8 : 0)) * 0.8); }
// whoosh: noise whose band sweeps up then down
{ let ph = 0; make("whoosh", 0.8, (t) => { const c = 300 + 2400 * Math.sin(Math.PI * Math.min(t / 0.7, 1)) ** 2; const a = 1 - Math.exp(-2 * Math.PI * c / SR); ph += a * (rnd() - ph); return ph * Math.sin(Math.PI * Math.min(t / 0.8, 1)) ** 2 * 3; }); }
// pop: a short round blip falling in pitch
make("pop", 0.25, (t) => Math.sin(2 * Math.PI * (520 * Math.exp(-t * 11) + 210) * t) * env(t, 0.004, 0.05));
// soft wax stamp: a low thump and a muffled press
{ const l = lp(900); make("stamp", 0.5, (t) => Math.sin(2 * Math.PI * (95 * Math.exp(-t * 9) + 55) * t) * env(t, 0.004, 0.13) + l(rnd()) * env(t, 0.002, 0.04) * 0.5); }
// clock tick: a dry little click, alternating pitch would be too busy: one clean tick
{ const f = hp(2200), l = lp(6000); make("tick", 0.08, (t) => l(f(rnd())) * env(t, 0.0005, 0.008) * 0.9 + Math.sin(2 * Math.PI * 1200 * t) * env(t, 0.0005, 0.01) * 0.3); }
// calendar page: a quick papery flick
{ const f = hp(1200), l = lp(5000); make("flip", 0.3, (t) => l(f(rnd())) * env(t, 0.004, 0.06) * 0.8); }
// warm chime: three soft bell partials (A4 with a fifth above), long gentle decay
make("chime", 2.8, (t) => (Math.sin(2 * Math.PI * 440 * t) * 0.5 * env(t, 0.01, 0.9) + Math.sin(2 * Math.PI * 660 * t) * 0.32 * env(t, 0.01, 0.7) + Math.sin(2 * Math.PI * 880 * t) * 0.2 * env(t, 0.01, 0.5) + Math.sin(2 * Math.PI * 1320 * t) * 0.08 * env(t, 0.01, 0.3)));
// a tiny glint when something catches the light
make("glint", 0.9, (t) => (Math.sin(2 * Math.PI * 1760 * t) * 0.4 + Math.sin(2 * Math.PI * 2640 * t) * 0.25) * env(t, 0.005, 0.22));
// the soft low tone as the seal settles in the opener (the same pitch and shape as the app's seal tone)
make("tone", 3.5, (t) => (Math.sin(2 * Math.PI * 174.6 * t) * 0.16 + Math.sin(2 * Math.PI * 349.2 * t) * 0.025) * Math.min(t / 0.45, 1) * Math.exp(-Math.max(t - 0.45, 0) * 2.3) * 4);
console.log("sound effects written to", OUT);
