import { useCallback, useEffect, useRef, useState } from "react";
import { readLetter, type LetterView } from "../lib/registry";

/** A letter, read from the network now and then, so the ring and the status stay true. */
export function useLetter(id: string, every = 10_000) {
  const [view, setView] = useState<LetterView | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const v = await readLetter(BigInt(id));
      if (alive.current) {
        setView(v);
        setFailed(false);
      }
      return v;
    } catch {
      if (alive.current) setFailed(true);
      return null;
    }
  }, [id]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => !document.hidden && void refresh(), every);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh, every]);
  return { view, failed, refresh };
}

/** Re-renders every second, so a countdown counts. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => !document.hidden && setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** A tiny router for the pages under /me: moves without reloading. */
export function useRoute() {
  const [path, setPath] = useState(() => (typeof window === "undefined" ? "/me" : window.location.pathname.replace(/\/+$/, "") || "/"));
  useEffect(() => {
    const f = () => setPath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  const go = (to: string) => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  };
  return { path, go };
}
