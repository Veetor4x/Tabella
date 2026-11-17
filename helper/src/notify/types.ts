/** What the escalation ladder needs from a message provider. Contact details are passed in and never logged. */
export interface Notifier {
  /** which channels can really send (the others are skipped, once, with a log line) */
  readonly channels: { email: boolean; sms: boolean; call: boolean };
  email(to: string, subject: string, text: string, idempotencyKey: string): Promise<void>;
  sms(to: string, text: string): Promise<void>;
  /** a phone call that reads `say` aloud */
  call(to: string, say: string): Promise<void>;
}

/** Which step of the ladder has been done, remembered so nothing is ever sent twice. */
export interface LadderStore {
  /** Record that a step is being done. true = we are the first (go ahead); false = it was already claimed (do nothing). */
  claim(letterId: string, step: string, at: number): Promise<boolean>;
  /** Forget a claim after a failed send, so the next pass may try again. */
  release(letterId: string, step: string): Promise<void>;
  /** step -> when (ms) it was claimed */
  steps(letterId: string): Promise<Map<string, number>>;
}
