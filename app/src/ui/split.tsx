import { createContext, useSyncExternalStore, type ReactNode } from "react";

/** From this width up the site uses its desktop layouts (two columns). Below it, nothing changes. Keep in step with the 1024px blocks in styles.css. */
export const WIDE_QUERY = "(min-width: 1024px)";

const subscribe = (cb: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const snapshot = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(WIDE_QUERY).matches;

/** True on a desktop-width screen. (Always false where matchMedia does not exist, such as the unit tests.) */
export function useWide(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** The write flow's progress (the big number and the pills). On a desktop it is drawn in the left column of each step; on a phone it stays null and App draws it above the screen as before. */
export const AsideContext = createContext<ReactNode>(null);

/** The left column of a two-column page: the heading and the words that explain it. On a phone this is just a plain block, so nothing moves. */
export function SplitIntro({ children }: { children: ReactNode }) {
  return <div className="split-intro">{children}</div>;
}

/** The right column: the form, the list, the buttons. */
export function SplitBody({ children }: { children: ReactNode }) {
  return <div className="split-body">{children}</div>;
}
