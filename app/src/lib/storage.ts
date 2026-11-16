import type { WhenId } from "./periods";

export interface Person {
  name: string;
  address: string;
}

/** What the person has typed so far. Kept on this device so a refresh does not lose the letter. */
export interface Draft {
  /** the owner's first name, optional: used to ask the questions ("Alex, who should read this one day?") */
  owner?: string;
  text: string;
  heirs: Person[];
  /** null = no guardian */
  guardian: { name: string } | null;
  when: WhenId;
}

export const emptyDraft = (): Draft => ({ text: "", heirs: [{ name: "", address: "" }], guardian: null, when: "6m" });

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
  /** "Your I'm-still-here card" */
  ownerCard: string;
  /** "Your guardian card", to hand to the guardian */
  guardianCard: string | null;
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
export const saveDraft = (d: Draft) => write(DRAFT_KEY, d);
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
