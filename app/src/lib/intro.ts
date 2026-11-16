/** Remembers whether this visitor has been asked about the intro, and what they said. */
const KEY = "tabella.intro.v1";
export type IntroChoice = "yes" | "skip";

export function getIntroChoice(): IntroChoice | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "yes" || v === "skip" ? v : null;
  } catch {
    return "skip"; // storage blocked: do not nag on every visit
  }
}
export function setIntroChoice(v: IntroChoice): void {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    /* fine: it just will not be remembered */
  }
}
