/** Sharing a message: WhatsApp, email, copy, or the phone's own share sheet. Only ever carries what the caller passes in. */
export interface ShareContent {
  subject: string;
  text: string;
  /** a link added after the text, if any */
  url?: string;
}

const full = (c: ShareContent) => (c.url ? `${c.text}\n\n${c.url}` : c.text);
export const whatsappLink = (c: ShareContent) => `https://wa.me/?text=${encodeURIComponent(full(c))}`;
export const emailLink = (c: ShareContent) => `mailto:?subject=${encodeURIComponent(c.subject)}&body=${encodeURIComponent(full(c))}`;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement("textarea");
      t.value = text;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";
export async function nativeShare(c: ShareContent): Promise<void> {
  try {
    await navigator.share({ title: c.subject, text: c.text, url: c.url });
  } catch {
    /* closed without sharing */
  }
}

/** The invite link: where Mia goes to make her opening card. It carries a first name at most, never anything secret. */
export function inviteLink(ownerName: string, origin = typeof window === "undefined" ? "" : window.location.origin): string {
  const name = ownerName.trim().slice(0, 30);
  return `${origin}/join${name ? `?from=${encodeURIComponent(name)}` : ""}`;
}
