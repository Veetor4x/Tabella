import { REGISTRY } from "./config";
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
  surprise?: { backups: number; /** false when no email was given for the recipient */ emailed?: boolean };
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
  // a letter's number only means something on its own registry version, so the same number on two versions is two letters
  return write(LETTERS_KEY, [...loadLetters().filter((l) => !(l.letterId === letter.letterId && (l.registry || "").toLowerCase() === (letter.registry || "").toLowerCase())), letter]);
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

/** True when this device already holds a card of its own (an I'm-still-here card or a guardian card). */
export function deviceHasCard(): boolean {
  return loadLetters().some((l) => !!l.ownerCard) || loadGuardian().length > 0;
}

/**
 * An opening card made on this phone (on /join) and kept here. It is the one kind of card that can sit on a device with no sealed letter
 * attached (made but never used). Cards that belong to a sealed letter (an I'm-still-here card, a guardian card) are never offered for removal.
 */
const JOIN_KEY = "tabella.join.v1";
export function loadJoinCard(): { card: string; qor?: string } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(JOIN_KEY) ?? "null");
    return v && typeof v.card === "string" ? v : null;
  } catch {
    return null;
  }
}
/** Clears the card from this phone only. It never touches the network, and no letter is ever deleted. */
export function clearJoinCard(): boolean {
  try {
    window.localStorage.removeItem(JOIN_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Remove from this list": only for a saved letter that is NOT sealed on the current version: one from an older test version, or one that
 * never finished sealing (the caller has looked it up on every version and found it nowhere). A letter that is really sealed on the current
 * version can never be removed, here or anywhere else. This only clears the entry from this phone; it never touches the network.
 */
export function removeFromList(letter: SealedLetter, why: "older" | "unfinished"): boolean {
  const onCurrent = !!letter.registry && letter.registry.toLowerCase() === REGISTRY.toLowerCase();
  if (why === "older" && (!letter.registry || onCurrent)) return false; // not provably an older version: refuse
  return write(LETTERS_KEY, loadLetters().filter((l) => !(l.letterId === letter.letterId && (l.registry || "").toLowerCase() === (letter.registry || "").toLowerCase())));
}
