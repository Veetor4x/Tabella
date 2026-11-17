# QoreX browser connection: what we found

**Finding (QoreX test #3, QoreX Chrome extension v0.4.2, unlocked, during the event).** On the Tabella page `window.qorex` was `undefined`
(checked in the console), so a website could not reach the wallet. Another wallet extension in the same browser also threw
`Cannot redefine property: ethereum`, which is the usual symptom of two extensions both trying to own `window.ethereum`.

**What Tabella does about it.**
- Tabella never depends on a wallet. A loved one's opening keys are registered through Tabella's own no-wallet path (the helper pays the fee).
  That is the default and the only path most people will ever see.
- "Use QoreX instead" on `/join` is detection-based. It appears only when a QoreX provider is actually found: `window.qorex.native`, or an EIP-6963
  announcement with rdns `network.qore.qorex` (see `app/src/lib/qorex.ts`). With none, nothing is shown, quietly.
- Tabella does not read or write `window.ethereum` at all, so it cannot cause or worsen the "Cannot redefine property: ethereum" clash.
- When a future QoreX version exposes itself to websites, the option switches on by itself; no release of Tabella is needed.

**Not proven.** The QoreX signing path (`registerWithQoreX`) has only been exercised against the SDK types and the test page at `/#spike`, never with a
live QoreX extension reachable from a website, because none was available in v0.4.2. Treat it as untested until it can be run.
