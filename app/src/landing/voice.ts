/**
 * The pre-recorded voiceover: one audio file per line, in src/assets/voice/01.mp3 ... 08.mp3.
 * A line whose file is missing simply plays silently (its caption still shows). No browser voice is ever used.
 */
import { primeAudio } from "../lib/sound";

const files = import.meta.glob<string>("../assets/voice/*.mp3", { eager: true, query: "?url", import: "default" });
const srcOf = (line: number) => files[`../assets/voice/${String(line + 1).padStart(2, "0")}.mp3`];
const els = new Map<number, HTMLAudioElement>();

/** The audio element for a line (created on first use), or null when that line has no recording. */
export function voiceAudio(line: number): HTMLAudioElement | null {
  const src = srcOf(line);
  if (!src || typeof document === "undefined") return null;
  let a = els.get(line);
  if (!a) {
    a = document.createElement("audio");
    a.preload = "auto";
    a.src = src;
    a.dataset.voice = String(line + 1);
    a.style.display = "none";
    document.body.appendChild(a);
    els.set(line, a);
  }
  return a;
}

export const hasVoice = (line: number) => !!srcOf(line);

/** Browsers only let sound start after a tap. Call this from the tap: it wakes the audio engine and every line. */
export function unlockVoice(lines = 8): void {
  primeAudio();
  for (let i = 0; i < lines; i++) {
    const a = voiceAudio(i);
    if (!a || !a.paused) continue;
    a.muted = true;
    void a.play().then(
      () => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      },
      () => {
        a.muted = false;
      },
    );
  }
}

export function stopVoice(): void {
  els.forEach((a) => {
    a.pause();
    a.currentTime = 0;
  });
}
export const allVoice = () => [...els.values()];

/** Start loading the recordings early, so the first line is ready the moment someone says yes. */
export function preloadVoice(lines = 8): void {
  for (let i = 0; i < lines; i++) voiceAudio(i);
}
