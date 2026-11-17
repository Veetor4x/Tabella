/**
 * Is a QoreX wallet really available to this page? Only then does /join offer "Use QoreX instead". We look in the two places a wallet can
 * announce itself: window.qorex.native, and an EIP-6963 announcement from rdns network.qore.qorex. We never touch window.ethereum (other
 * wallet extensions fight over it, and one of them throws "Cannot redefine property: ethereum").
 */
export const QOREX_RDNS = "network.qore.qorex";

type Native = NonNullable<Window["qorex"]>["native"];
let announced: unknown = null;

/** The QoreX native API, from either place (or undefined). */
export function qorexNative(): Native | undefined {
  const w = typeof window === "undefined" ? undefined : window;
  const direct = w?.qorex?.native;
  if (direct) return direct;
  const p = announced as { native?: Native } | null;
  return p?.native ?? (p && typeof (p as { enable?: unknown }).enable === "function" ? (p as unknown as Native) : undefined);
}

/** Resolves true as soon as a QoreX provider is found, or false after `wait` ms of silence. Quiet: it never throws and never shows anything. */
export function detectQoreX(wait = 800): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (qorexNative()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(v);
    };
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<{ info?: { rdns?: string }; provider?: unknown }>).detail;
      if (d?.info?.rdns === QOREX_RDNS && d.provider) {
        announced = d.provider;
        finish(!!qorexNative());
      }
    };
    try {
      window.addEventListener("eip6963:announceProvider", onAnnounce);
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    } catch {
      return finish(false);
    }
    timer = setTimeout(() => finish(!!qorexNative()), wait);
  });
}
