/**
 * Resend (email) and Twilio (SMS and phone calls), through their plain HTTPS APIs.
 * Keys are read from the environment here and nowhere else; nothing in this file logs a key or a contact detail.
 *
 *   BREVO_API_KEY, EMAIL_FROM                         email   (Brevo, no domain needed: EMAIL_FROM is a sender address verified in Brevo; the name shown is "Tabella").
 *                                                             When BREVO_API_KEY is set, Brevo is used; otherwise Resend.
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
      if (allowed && recipient && /only send testing emails|own email/i.test(msg)) {
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

/**
 * The same words as the plain-text email, in a quiet HTML wrapper: the Tabella wordmark in a serif with the small wax-red seal beside it.
 * The seal is a hosted picture (the app's public /seal.png), because email programs do not run SVG or fonts. Nothing else is added.
 */
export function emailHtml(text: string, appUrl = "https://tabella-veetor4x.vercel.app"): string {
  const base = appUrl.replace(/\/+$/, "");
  const link = (t: string) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#8a1c27">$1</a>');
  const paras = esc(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${link(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea"><tr><td align="center" style="padding:28px 16px">` +
    `<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">` +
    `<tr><td style="padding:0 0 18px"><img src="${base}/seal.png" width="30" height="30" alt="" style="border:0;vertical-align:middle">` +
    `<span style="font:27px Georgia,'Times New Roman',serif;color:#15171c;vertical-align:middle;margin-left:9px">Tabella</span></td></tr>` +
    `<tr><td style="font:16px/1.55 Arial,Helvetica,sans-serif;color:#15171c">${paras}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** "Tabella <a@b.co>" or "a@b.co" -> "a@b.co" (Brevo wants the plain address; the name is always "Tabella"). */
export const plainAddress = (from: string | undefined): string => {
  const s = (from ?? "").trim();
  const m = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(s);
  return (m ? m[1]! : s).trim();
};

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export function createNotifier(env: NodeJS.ProcessEnv = process.env): Notifier {
  const brevoKey = env.BREVO_API_KEY?.trim();
  const brevoFrom = plainAddress(env.EMAIL_FROM);
  const useBrevo = !!brevoKey; // with a Brevo key, Brevo sends the email; without one, Resend does
  const resendKey = env.RESEND_API_KEY?.trim();
  const resendFrom = env.RESEND_FROM?.trim();
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const smsFrom = env.TWILIO_FROM?.trim();
  const voiceFrom = env.TWILIO_VOICE_FROM?.trim() || smsFrom;
  const twilioAuth = sid && token ? `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` : undefined;

  return {
    emailProvider: useBrevo ? "brevo" : "resend",
    channels: { email: useBrevo ? !!brevoFrom : !!(resendKey && resendFrom), sms: !!(twilioAuth && smsFrom), call: !!(twilioAuth && voiceFrom) },
    async email(to, subject, text, idempotencyKey) {
      if (useBrevo) {
        // Brevo's transactional email API. It answers 201 with a messageId when it has ACCEPTED the message; anything else throws, so the caller never records a send that did not happen.
        await post(BREVO_URL, {
          method: "POST",
          headers: { "api-key": brevoKey!, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: { name: "Tabella", email: brevoFrom }, to: [{ email: to }], subject, textContent: text, htmlContent: emailHtml(text, env.APP_URL?.trim() || undefined) }),
        }, to);
        return;
      }
      await post("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ from: resendFrom, to: [to], subject, text, html: emailHtml(text, env.APP_URL?.trim() || undefined) }),
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
