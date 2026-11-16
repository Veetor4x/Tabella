#!/usr/bin/env python3
"""
Puts the sound back into the intro recording. A browser video has no sound, so intro.cjs writes down the moment every
voice line (and the opening tone) started; this lays the same recorded files on a timeline at those moments and joins
them to the video.
  python3 e2e/mix-intro-audio.py <video.webm> <play-times.json> <out.mp4>
"""
import json, subprocess, sys, pathlib

video, times, out = sys.argv[1:4]
t = json.load(open(times))
voice = pathlib.Path(__file__).resolve().parent.parent / "src" / "assets" / "voice"
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).decode())
inputs, filters, labels = [], [], []
n = 0
seen = set()
# the first play of each line is the silent "unlock" at the tap; the one that counts is the last
last = {}
for p in t["plays"]:
    last[p["line"]] = p
for line, p in sorted(last.items()):
    f = voice / f"{line:02d}.mp3"
    if not f.exists():
        continue
    seen.add(line)
    ms = max(0, int(p["at"] - t["videoStartMs"]))
    inputs += ["-i", str(f)]
    filters.append(f"[{n + 1}:a]aresample=44100,adelay={ms}|{ms},volume=1.0[a{n}]")
    labels.append(f"[a{n}]")
    n += 1
# the soft low tone as the seal settles in the opener (same pitch and shape as the app's tone), 3.0 s after the intro opens
tone_ms = max(0, int(t["introOpenedMs"] + 3000 - t["videoStartMs"]))
filters.append(
    "aevalsrc=exprs='(0.16*sin(2*PI*174.6*t)+0.025*sin(2*PI*349.2*t))*min(t/0.45\\,1)*exp(-max(t-0.45\\,0)*2.3)':d=3.5:s=44100,"
    f"lowpass=f=700,adelay={tone_ms}|{tone_ms}[tone]"
)
labels.append("[tone]")
filters.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0:duration=longest,apad,atrim=0:{dur:.2f}[mix]")
cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", video, *inputs, "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[mix]",
       "-vf", "fps=30", "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out]
subprocess.check_call(cmd)
print(f"wrote {out} with voice lines {sorted(seen)} and the opening tone")
