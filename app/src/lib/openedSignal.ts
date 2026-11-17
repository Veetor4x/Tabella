/**
 * "A letter was opened somewhere": the little envelope on the front page's cloud lifts off and floats away.
 * The opening can happen on another page, so it is also remembered for the next time the front page is shown.
 */
const KEY = "tabella.opened.v1";
export const OPENED_EVENT = "tabella:opened";

export function announceOpened(): void {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* fine */
  }
  window.dispatchEvent(new Event(OPENED_EVENT));
}

/** True once for a recent opening (within a day), then forgotten. */
export function takeOpened(): boolean {
  try {
    const t = Number(window.localStorage.getItem(KEY));
    window.localStorage.removeItem(KEY);
    return t > 0 && Date.now() - t < 86_400_000;
  } catch {
    return false;
  }
}
