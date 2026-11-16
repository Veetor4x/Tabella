#!/usr/bin/env python3
"""
Puts the sound back into the intro recording. A browser video has no sound, so intro.cjs writes down the moment every
voice line, sound effect and the music started (and the music ducking); this lays the same recorded files on a timeline
at those moments, ducks the music under the voice, and joins the result to the video.
  python3 e2e/mix-intro-audio.py <video.webm> <play-times.json> <out.mp4>
"""
import json, subprocess, sys, pathlib
import numpy as np

SR = 44100
video, times, out = sys.argv[1:4]
t = json.load(open(times))
root = pathlib.Path(__file__).resolve().parent.parent / "src" / "assets"
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).decode())
N = int(dur * SR) + SR
t0 = t["videoStartMs"]
at = lambda ms: max(0, int((ms - t0) / 1000 * SR))

def decode(path, loop_to=None):
    raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"])
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if loop_to:
        a = np.tile(a, int(np.ceil(loop_to / len(a))))[:loop_to]
    return a

def put(track, clip, start, gain=1.0):
    if start >= len(track):
        return
    end = min(len(track), start + len(clip))
    track[start:end] += clip[: end - start] * gain

voice = np.zeros(N, dtype=np.float32)
sfx = np.zeros(N, dtype=np.float32)
music = np.zeros(N, dtype=np.float32)
cache = {}
LEVEL = {"type": 0.32, "rustle": 0.4, "fold": 0.4, "whoosh": 0.32, "pop": 0.5, "stamp": 0.55, "tick": 0.3, "flip": 0.35, "chime": 0.5, "glint": 0.28, "tone": 0.55}
MUSIC_LEVEL, MUSIC_DUCKED = 0.22, 0.08

# voice: the last play of each line is the one that counts (the first is the silent "unlock" at the tap)
last = {}
for p in t["plays"]:
    last[p["line"]] = p
intervals = []
for line, p in sorted(last.items()):
    f = root / "voice" / f"{line:02d}.mp3"
    if not f.exists():
        continue
    clip = decode(f)
    s = at(p["at"])
    put(voice, clip, s)
    intervals.append((s, s + len(clip)))

# sound effects, from the log the page kept
for e in t.get("audio", []):
    if e["kind"] == "sfx":
        f = root / "sfx" / f"{e['name']}.wav"
        if not f.exists():
            continue
        cache.setdefault(e["name"], decode(f))
        put(sfx, cache[e["name"]], at(e["at"]), LEVEL.get(e["name"], 0.4) * e.get("gain", 1.0))

# music: starts where the log says, loops, fades in, ducks under the voice
mus_files = sorted((root / "music").glob("*.mp3")) if (root / "music").exists() else []
starts = [e for e in t.get("audio", []) if e["kind"] == "music"]
if mus_files and starts:
    s0 = at(starts[0]["at"])
    clip = decode(mus_files[0], loop_to=max(1, N - s0))
    music[s0:s0 + len(clip)] = clip
    env = np.full(N, MUSIC_LEVEL, dtype=np.float32)
    env[:s0] = 0
    ramp = int(1.2 * SR)
    env[s0:s0 + ramp] = np.linspace(0, MUSIC_LEVEL, min(ramp, N - s0))[: min(ramp, N - s0)]
    for a, b in intervals:  # duck during each spoken line, with a short ease either side
        e0, e1 = max(0, a - int(0.15 * SR)), min(N, b + int(0.45 * SR))
        env[e0:e1] = np.minimum(env[e0:e1], MUSIC_DUCKED)
    # smooth the steps so ducking is gentle, not a click
    k = int(0.3 * SR)
    env = np.convolve(env, np.ones(k, dtype=np.float32) / k, mode="same")
    music *= env

mix = voice * 1.0 + sfx + music
peak = float(np.max(np.abs(mix)) or 1)
if peak > 0.95:
    mix *= 0.95 / peak
wav = pathlib.Path(out).with_suffix(".mix.wav")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", str(wav)], input=(np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes(), check=True)
subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", video, "-i", str(wav), "-map", "0:v", "-map", "1:a", "-vf", "fps=30", "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
                       "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out])
wav.unlink()
n_sfx = sum(1 for e in t.get("audio", []) if e["kind"] == "sfx")
print(f"wrote {out}: voice lines {sorted(last)}, {n_sfx} sound effects, music {'yes' if (mus_files and starts) else 'no'}")
