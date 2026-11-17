import type { WhenId } from "./periods";

export interface Person {
  name: string;
  address: string;
}

/** What the person has typed so far. Kept on this device so a refresh does not lose the letter. */
/** A person in a "keep it a surprise" letter: how to reach them, and a private question and answer only they would know. */
export interface SurprisePerson {
  name: string;
  email: string;
  phone: string;
  question: string;
  /** typed here, used once to lock the card, and NEVER saved on this device */
  answer: string;
  /** backups only: "sister", "old friend"... shown to nobody but Alex */
  relation?: string;
}
export const emptyPerson = (): SurprisePerson => ({ name: "", email: "", phone: "", question: "", answer: "", relation: "" });

export interface Draft {
  /** "surprise" (the main way: we find them) or "invite" (they make their own card first) */
  mode?: "surprise" | "invite";
  recipient?: SurprisePerson;
  /** up to three people who can help the recipient receive it */
  backups?: SurprisePerson[];
  /** the owner's first name, optional: used to ask the questions ("Alex, who should read this one day?") */
  owner?: string;
  text: string;
  heirs: Person[];
  /** null = no guardian */
  guardian: { name: string } | null;
  when: WhenId;
  /** "quiet" (the default) opens if Alex goes quiet; "date" opens on an exact day, whether or not he checks in */
  whenMode?: "quiet" | "date";
  /** the picked day, YYYY-MM-DD (for "date") */
  releaseDay?: string;
  /** the 2-minute demo for a dated letter (hidden, with the demo timer) */
  dateDemo?: boolean;
}

export const emptyDraft = (): Draft => ({ mode: "surprise", recipient: emptyPerson(), backups: [], text: "", heirs: [{ name: "", address: "" }], guardian: null, when: "6m" });

/** A letter that has been sealed. The two cards are secrets: they stay on this device and on the printed cards. */
export interface SealedLetter {
  version: 1;
  letterId: string;
  /** the owner's first name, for "Thanks, Alex." (absent on a letter restored from its card) */
  ownerName?: string;
  txHash: string;
  createdAt: string;
  registry: string;
  heirs: { name: string; evm: string; qor: string }[];
  guardianName: string | null;
  whenLabel: string;
  quietSeconds: number;
  warningSeconds: number;
  /** a dated letter: the unix time it opens (then quietSeconds and warningSeconds are 0) */
  releaseAt?: number;
  /** "Your I'm-still-here card" */
  ownerCard: string;
  /** "Your guardian card", to hand to the guardian */
  guardianCard: string | null;
  /** a "keep it a surprise" letter: the recipient's card is NOT here (it is locked with their answers, nowhere else) */
  surprise?: { backups: number };
}

const DRAFT_KEY = "tabella.draft.v1";
const LETTERS_KEY = "tabella.letters.v1";

function read<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined; // private window / blocked storage: the app still works, it just forgets
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): Draft | undefined {
  const d = read<Draft>(DRAFT_KEY);
  if (!d || typeof d.text !== "string" || !Array.isArray(d.heirs) || d.heirs.length === 0) return undefined;
  return d;
}
/** Answers are secrets: they are never written to this device's storage. */
const withoutAnswers = (d: Draft): Draft => ({ ...d, recipient: d.recipient ? { ...d.recipient, answer: "" } : d.recipient, backups: d.backups?.map((b) => ({ ...b, answer: "" })) });
export const saveDraft = (d: Draft) => write(DRAFT_KEY, withoutAnswers(d));
export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

export const loadLetters = (): SealedLetter[] => read<SealedLetter[]>(LETTERS_KEY) ?? [];
export function saveLetter(letter: SealedLetter): boolean {
  return write(LETTERS_KEY, [...loadLetters().filter((l) => l.letterId !== letter.letterId), letter]);
}

// ------------------------------------------------------------- cards kept on this device

/** A guardian card restored on this device. */
export interface GuardianEntry {
  letterId: string;
  card: string;
  /** their name, when this is the device that sealed the letter */
  name?: string;
}
const GUARDIAN_KEY = "tabella.guardian.v1";
export const loadGuardian = (): GuardianEntry[] => read<GuardianEntry[]>(GUARDIAN_KEY) ?? [];
export function saveGuardian(e: GuardianEntry): boolean {
  return write(GUARDIAN_KEY, [...loadGuardian().filter((g) => g.letterId !== e.letterId), e]);
}
export function removeLetter(letterId: string): boolean {
  return write(LETTERS_KEY, loadLetters().filter((l) => l.letterId !== letterId));
}
