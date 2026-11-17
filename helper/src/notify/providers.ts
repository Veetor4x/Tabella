/**
 * Resend (email) and Twilio (SMS and phone calls), through their plain HTTPS APIs.
 * Keys are read from the environment here and nowhere else; nothing in this file logs a key or a contact detail.
 *
 *   RESEND_API_KEY, RESEND_FROM                       email   (RESEND_FROM like  Tabella <letters@your-verified-domain>)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN             SMS and calls
 *   TWILIO_FROM (SMS sender), TWILIO_VOICE_FROM       (calls; defaults to TWILIO_FROM)
 * A channel without its variables is simply off, and its steps wait (EMAIL ONLY FOR NOW: with no TWILIO_* variables the
 * ladder is email-only; adding the Twilio keys later switches texts and calls on, with no code change).
 */
import type { Notifier } from "./types.js";

/** A provider said no. `reason` is the provider's own error name and a short message with every address and number removed. */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(`provider answered HTTP ${status}${reason ? ` (${reason})` : ""}`);
    this.name = "ProviderError";
  }
  /** a 4xx other than "slow down" will not fix itself in seconds: wait a long time before trying again */
  get hopeless(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429 && this.status !== 408;
  }
}

/** Provider error bodies can echo the recipient or the account's address: keep only the error's name and a scrubbed message. */
export function scrub(text: string): string {
  return text
    .replace(/[^\s<>"',;()]+@[^\s<>"',;()]+/g, "<email>")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "<number>")
    .replace(/https?:\/\/\S+/g, "<link>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function post(url: string, init: RequestInit, recipient?: string): Promise<void> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    let reason = "";
    try {
      const j = (await res.json()) as { name?: unknown; message?: unknown; code?: unknown; error?: unknown };
      const name = typeof j.name === "string" ? j.name : typeof j.code === "string" ? j.code : "";
      const msg = typeof j.message === "string" ? j.message : typeof j.error === "string" ? j.error : "";
      reason = scrub(`${name}${name && msg ? ": " : ""}${msg}`);
      // "you can only send testing emails to your own address (x@y)": say whether that address is the recipient, never what it is
      const allowed = /([^\s<>"',;()]+)@([^\s<>"',;()]+?)[).]*(?:[\s,;]|$)/.exec(msg);
      if (allowed && recipient) {
        const same = `${allowed[1]}@${allowed[2]}`.toLowerCase() === recipient.toLowerCase();
        reason += same ? " [the address Resend allows is the recipient]" : ` [the address Resend allows differs from the recipient: it is on ${allowed[2]!.toLowerCase()}]`;
      }
    } catch {
      /* not JSON */
    }
    throw new ProviderError(res.status, reason);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function createNotifier(env: NodeJS.ProcessEnv = process.env): Notifier {
  const resendKey = env.RESEND_API_KEY?.trim();
  const resendFrom = env.RESEND_FROM?.trim();
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const smsFrom = env.TWILIO_FROM?.trim();
  const voiceFrom = env.TWILIO_VOICE_FROM?.trim() || smsFrom;
  const twilioAuth = sid && token ? `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` : undefined;

  return {
    channels: { email: !!(resendKey && resendFrom), sms: !!(twilioAuth && smsFrom), call: !!(twilioAuth && voiceFrom) },
    async email(to, subject, text, idempotencyKey) {
      await post("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ from: resendFrom, to: [to], subject, text }),
      }, to);
    },
    async sms(to, text) {
      await post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { authorization: twilioAuth!, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: smsFrom!, Body: text }),
      });
    },
    async call(to, say) {
      await post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
        method: "POST",
        headers: { authorization: twilioAuth!, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: voiceFrom!, Twiml: `<Response><Pause length="1"/><Say voice="Polly.Joanna">${esc(say)}</Say><Pause length="1"/><Say voice="Polly.Joanna">${esc(say)}</Say></Response>` }),
      });
    },
  };
}

/** Nothing leaves the machine: it only remembers what it would have sent (for tests and the dry-run test run). */
export function createDryRunNotifier(channels: Notifier["channels"] = { email: true, sms: true, call: true }): Notifier & { sent: { kind: "email" | "sms" | "call"; to: string; text: string; subject?: string }[] } {
  const sent: { kind: "email" | "sms" | "call"; to: string; text: string; subject?: string }[] = [];
  return {
    sent,
    channels,
    async email(to, subject, text) {
      sent.push({ kind: "email", to, subject, text });
    },
    async sms(to, text) {
      sent.push({ kind: "sms", to, text });
    },
    async call(to, text) {
      sent.push({ kind: "call", to, text });
    },
  };
}
