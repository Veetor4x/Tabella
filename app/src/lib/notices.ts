/** Gentle notices: a short line that slides in, stacks under the others and goes by itself ("Thanks, Alex. Your letter stays sealed."). */
export interface Toast {
  id: number;
  text: string;
}
const EMPTY: Toast[] = [];
let list: Toast[] = EMPTY;
let n = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function dismiss(id: number): void {
  list = list.filter((t) => t.id !== id);
  emit();
}
export function notify(text: string, ms = 6500): number {
  const id = ++n;
  list = [{ id, text }, ...list].slice(0, 4);
  emit();
  if (typeof window !== "undefined") setTimeout(() => dismiss(id), ms);
  return id;
}
export const getToasts = () => list;
export const serverToasts = () => EMPTY;
export const subscribeToasts = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
