/** "Mia", "Mia and Leo", "Mia, Leo and Sofia" */
export function joinNames(names: string[]): string {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

export const STEP_COUNT = 5;

/** Words in the letter, for the "Letter · 214 words" pill. */
export const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
