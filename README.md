# Tabella
Sealed today. Opened when it matters. A quantum-safe sealed letter on QoreChain.

## Credits

- Project scaffolds from the official QoreChain kit `create-qorechain-dapp`: the `foundry` template (`contracts/`) and the `viem-wagmi` template (`app/`).
- QoreChain libraries: `@qorechain/qoreseal`, `@qorechain/pqc`, `@qorechain/evm`, `@qorechain/sdk`, `@qorechain/qorex-rainbowkit`.
- Other libraries: viem, wagmi, RainbowKit, TanStack Query, React, Vite, Foundry (forge-std).

- Fonts: Instrument Serif and Inter (SIL Open Font License 1.1), bundled with the app.
- Intro sound (the front page's narrated film):
  - **Voiceover:** generated with ElevenLabs (voice "Autumn Veil", model `eleven_v4`), saved as `app/src/assets/voice/01.mp3` to `08.mp3`.
  - **Background music:** a calm, romantic, instrumental piano bed generated with ElevenLabs (`eleven_music_v2`, a prompt for a soft lo-fi piano piece, no vocals), `app/src/assets/music/bed.mp3`. It is original generated audio, not a recording of any existing song.
  - **Clouds:** the background clouds are rendered from scratch by `tools/make-clouds.py` (procedural noise and shading, no photographs or stock images), pre-rendered to `app/src/assets/sky/*.webp`. Original, no attribution needed.
  - **Sound effects and the website's own music:** being generated with ElevenLabs (sound effects `eleven_text_to_sound_v2`, music `eleven_music_v2`); the files are credited here once they are in `app/src/assets/sfx/` and `app/src/assets/music/site.mp3`. Until then the film plays without them. No synthesised sounds are used.
  - **Licence note:** these ElevenLabs files were made on a free plan, whose terms usually require crediting ElevenLabs and do not include a commercial licence; re-generate them on a paid plan before any commercial use.
- Illustrations in the intro are drawn in code (`app/src/landing/stories.tsx`): original object-only line art (a pen and paper, two chairs, a shield, a calendar, an envelope, a horizon, a clock).

(Full list to be completed before submission.)

