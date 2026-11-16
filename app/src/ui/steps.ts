export const STEPS = [
  { emoji: "💌", title: "Write" },
  { emoji: "👨‍👩‍👧", title: "Who should open it?" },
  { emoji: "🛡️", title: "A guardian" },
  { emoji: "⏳", title: "When should it open?" },
  { emoji: "🔏", title: "Seal it" },
] as const;

/** "Mia", "Mia and Leo", "Mia, Leo and Sofia" */
export function joinNames(names: string[]): string {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}
