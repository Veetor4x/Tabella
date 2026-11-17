/**
 * Resend (email) and Twilio (SMS and phone calls), through their plain HTTPS APIs.
 * Keys are read from the environment here and nowhere else; nothing in this file logs a key or a contact detail.
 *
 *   RESEND_API_KEY, RESEND_FROM                       email   (RESEND_FROM like  Tabella <letters@your-verified-domain>)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN             SMS and calls
 *   TWILIO_FROM (SMS sender), TWILIO_VOICE_FROM       (calls; defaults to TWILIO_FROM)
 * A channel without its variables is simply off: its steps are skipped (once, with a log line).
 */
import type { Notifier } from "./types.js";

async function post(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    // status code only: provider error bodies can echo the recipient
    throw new Error(`provider answered HTTP ${res.status}`);
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
      });
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
export function createDryRunNotifier(): Notifier & { sent: { kind: "email" | "sms" | "call"; to: string; text: string; subject?: string }[] } {
  const sent: { kind: "email" | "sms" | "call"; to: string; text: string; subject?: string }[] = [];
  return {
    sent,
    channels: { email: true, sms: true, call: true },
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
