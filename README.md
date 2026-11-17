<p align="left"><img src="app/public/seal.png" alt="" width="44" height="44" align="absmiddle"> <span style="font-size:34px"><b>Tabella</b></span></p>

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
  - **Sound effects:** all 17 (`app/src/assets/sfx/`) generated with ElevenLabs (`eleven_text_to_sound_v2`, calm natural-sounding prompts). No synthesised sounds are used.
  - **Still to come:** the website's own music (`app/src/assets/music/site.mp3`, `eleven_music_v2`) and six voice lines of the Surprise film (s02, s03, s04, s06, s08, s09, voice "Autumn Veil", `eleven_v4`) were blocked by ElevenLabs being busy on the free plan; until they exist the music button is hidden and those lines are silent.
  - **Licence note:** these ElevenLabs files were made on a free plan, whose terms usually require crediting ElevenLabs and do not include a commercial licence; re-generate them on a paid plan before any commercial use.
- Illustrations in the intro are drawn in code (`app/src/landing/stories.tsx`): original object-only line art (a pen and paper, two chairs, a shield, a calendar, an envelope, a horizon, a clock).

(Full list to be completed before submission.)

## Honest limits

- **QoreX browser connection.** In QoreX v0.4.2 (during the event) the wallet was not available to websites: `window.qorex` was undefined, and another wallet extension threw "Cannot redefine property: ethereum". So Tabella registers keys through its own no-wallet path. The "Use QoreX instead" option appears only if a QoreX provider is really found (`window.qorex.native` or an EIP-6963 announcement from `network.qore.qorex`), so QoreX support switches on automatically when it is available. That path is untested against a live extension. See `docs/QOREX.md`.
- This is a test-network demo. Please don't write real secrets yet.
- The protection has not had an independent security review.
- Email is the only delivery channel today; text and call reminders are not switched on.
- **Email delivery currently reaches only the project's own test address.** The sender is Resend's test sender (`onboarding@resend.dev`), which delivers only to the Resend account owner's own address, so a loved one at any other address gets nothing. Real users need a verified sending domain in Resend and `RESEND_FROM` set to an address on it. Until then, delivery to anyone else is not working.

## Reminders for whoever runs this

- **The free Render Postgres `tabella-ladder` expires on 2026-12-17.** It holds the escalation ladder's state (which emails have been sent), so the helper does not send twice after a restart. Before that date, create a new database (or move to a paid plan), put its Internal Database URL in the helper's `DATABASE_URL`, and redeploy; the old state is not copied over, so letters that are still waiting would start their ladder again.
- Without `DATABASE_URL`, the helper keeps that state in memory only, and a restart forgets it (it says so in its startup log).

## Logo

The mark is a small wax-red seal with a T, set beside the serif "Tabella" wordmark (Instrument Serif, SIL OFL 1.1). The same seal is the favicon and app icon (`app/public/seal.svg`, `favicon.svg`, and the PNG sizes, made by `tools/make-seal.py`), and appears in the site header, on printed cards and in emails. Earlier explorations of heavy cut-up type are kept in `docs/logo/` for reference; none was used.

