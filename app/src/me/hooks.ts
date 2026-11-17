import { useCallback, useEffect, useRef, useState } from "react";
import { readLetter, type LetterView } from "../lib/registry";
import { resolveLetter, type Resolved } from "../lib/resolve";
import type { SealedLetter } from "../lib/storage";

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

/**
 * A saved letter, looked up on the registry version it was sealed on. While the answer is "unreachable" it keeps trying (every 20 seconds),
 * so "we couldn't look" never just sits there. When the letter is on the current version, the view keeps counting and refreshing.
 */
export function useResolvedLetter(saved: SealedLetter, every = 10_000) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [tries, setTries] = useState(0);
  const alive = useRef(true);
  const key = `${saved.registry}|${saved.letterId}|${saved.ownerCard}`;
  const retry = useCallback(() => {
    setResolved(null);
    setTries((n) => n + 1);
  }, []);
  useEffect(() => {
    alive.current = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    void resolveLetter(saved).then((r) => {
      if (!alive.current) return;
      setResolved(r);
      if (r.kind === "unreachable") t = setTimeout(() => alive.current && retry(), 20_000);
    });
    return () => {
      alive.current = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tries]);
  const refresh = useCallback(async () => {
    try {
      const v = await readLetter(BigInt(saved.letterId));
      if (alive.current) setResolved({ kind: "current", view: v });
      return v;
    } catch {
      return null;
    }
  }, [saved.letterId]);
  // a letter on the current version keeps its view fresh
  useEffect(() => {
    if (resolved?.kind !== "current") return;
    const t = setInterval(() => !document.hidden && void refresh(), every);
    return () => clearInterval(t);
  }, [resolved?.kind, refresh, every]);
  return { resolved, view: resolved && (resolved.kind === "current" || resolved.kind === "older") ? resolved.view : null, refresh, retry };
}
