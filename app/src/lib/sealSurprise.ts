/**
 * Sealing a "keep it a surprise" letter, in the browser.
 *
 *   1. a new opening card for the recipient is made here, funded by the helper (/fund) and registered on the network
 *      (the same no-wallet path as /join, done on Alex's behalf);
 *   2. the card is locked separately with each person's answer (Argon2id + AES-GCM) and the locked copies, with
 *      the questions, go into the letter's public data;
 *   3. every contact detail is sealed to the Postman's key together with Part B;
 *   4. the plain card is dropped: it exists only in this function's memory and is never stored.
 */
import { KDF_DEFAULT, MAX_BACKUPS, maxLetterBytesFor, packContainer, sealPostmanPackage, type Manifest, type PostmanPackage } from "../../../shared/surprise";
import {
  EVM_CHAIN_ID,
  actionMessage,
  cardDecode,
  createPayloadHash,
  encryptLetter,
  keyHash,
  makeContentKey,
  newSeed,
  sealPartA,
  signAction,
  signingKeysFromSeed,
  splitKey,
  cardEncode,
} from "../../../shared/tabella-crypto";
import { REGISTRY } from "./config";
import { becomeReady, type JoinProgress } from "./heir";
import { HelperError, SealProblem, relay, warmUp } from "./helper";
import { lockSeed } from "./locks";
import { ZERO_HASH, buildCreateBody, hexToU8, nextLetterId } from "./seal";
import type { SealedLetter, SurprisePerson } from "./storage";

export type SurpriseProgress = "postman" | "card" | "lock" | "wrap" | "send";

export interface SurpriseInput {
  text: string;
  ownerName: string;
  recipient: SurprisePerson;
  backups: SurprisePerson[];
  guardianName: string | null;
  quiet: number;
  warning: number;
  whenLabel: string;
  /** the 2-minute demo timer: the Postman then runs its ladder in minutes instead of days */
  demo: boolean;
  onCard?: (p: JoinProgress) => void;
}

const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[^\s@<>"',;]{2,24}$/;
export const cleanPhone = (s: string) => s.replace(/[\s()-]/g, "");
export const isEmail = (s: string) => EMAIL.test(s.trim());
export const isPhone = (s: string) => /^\+[1-9]\d{6,14}$/.test(cleanPhone(s));

/** A short, kind sentence for the first thing wrong, or null when the person is complete. */
export function personProblem(p: SurprisePerson, kind: "recipient" | "backup"): string | null {
  if (!p.name.trim()) return "Add a first name.";
  if (!isEmail(p.email)) return "That email address doesn't look right.";
  if (p.phone.trim() && !isPhone(p.phone)) return "That phone number needs its country code, like +44 7700 900123, or leave it empty.";
  if (kind === "backup" && !(p.relation ?? "").trim()) return "Say who they are to them (a sister, an old friend...).";
  if (p.question.trim().length < 8) return "Write a question only they could answer.";
  if (p.answer.trim().length < 3) return "Add the answer.";
  return null;
}

const person = (p: SurprisePerson, lock: Manifest["recipient"]["lock"]) => ({ name: p.name.trim(), question: p.question.trim(), lock });

export async function sealSurprise(input: SurpriseInput, onProgress: (p: SurpriseProgress) => void = () => {}): Promise<SealedLetter> {
  const { recipient, backups } = input;
  if (backups.length > MAX_BACKUPS) throw new SealProblem("Up to three backup people, please.");
  for (const [i, p] of [recipient, ...backups].entries()) if (personProblem(p, i === 0 ? "recipient" : "backup")) throw new SealProblem("Please check everyone's details.");

  // 1. The Postman (wakes the helper), and the recipient's new opening card.
  onProgress("postman");
  const health = await warmUp();
  const postmanPublic = hexToU8(health.postman!.mlkemPublicKey);

  onProgress("card");
  const cardSeed = newSeed();
  const card = cardEncode(cardSeed); // kept in this function only
  const id = await becomeReady(card, (p) => input.onCard?.(p));
  const cardKeys = signingKeysFromSeed(cardDecode(card));

  // 2. Lock the card with each person's answer (about a second each).
  onProgress("lock");
  const locked = await Promise.all([lockSeed(cardSeed, recipient.answer, KDF_DEFAULT), ...backups.map((b) => lockSeed(cardSeed, b.answer, KDF_DEFAULT))]);
  const manifest: Manifest = {
    v: 1,
    kdf: KDF_DEFAULT,
    recipient: person(recipient, locked[0]!),
    backups: backups.map((b, i) => ({ ...person(b, locked[i + 1]!), relation: (b.relation ?? "").trim() })),
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest)).length;
  if (new TextEncoder().encode(input.text).length > maxLetterBytesFor(manifestBytes) - 28) throw new SealProblem("That letter is a little too long for a surprise letter (the questions take some room). Please shorten it.");

  // 3. Lock the letter, split the key, seal Part A to the recipient's card and Part B (with the contacts) to the Postman.
  onProgress("wrap");
  const ownerSeed = newSeed();
  const guardianSeed = input.guardianName ? newSeed() : undefined;
  const owner = signingKeysFromSeed(ownerSeed);
  const guardianKeyHash = guardianSeed ? keyHash(signingKeysFromSeed(guardianSeed).publicKey) : ZERO_HASH;
  const K = makeContentKey();
  const letterCiphertext = packContainer(manifest, await encryptLetter(K, input.text));
  const { A, B } = splitKey(K);
  const partAEnvelope = sealPartA(A, [id.keys.mlkemPublicKey]);
  const pkg: PostmanPackage = {
    v: 1,
    mode: input.demo ? "demo" : "real",
    owner: input.ownerName.trim() || "Someone who cares about you",
    cardKeyHash: keyHash(cardKeys.publicKey),
    recipient: { name: recipient.name.trim(), email: recipient.email.trim(), phone: cleanPhone(recipient.phone) },
    backups: backups.map((b) => ({ name: b.name.trim(), relation: (b.relation ?? "").trim(), email: b.email.trim(), phone: cleanPhone(b.phone) })),
  };
  const partBForPostman = sealPostmanPackage(B, pkg, postmanPublic);

  // 4. Sign and send (the same as an ordinary letter).
  onProgress("send");
  const payload = { heirs: [id.evm], guardianKeyHash, quietPeriod: input.quiet, warningPeriod: input.warning, letterCiphertext, partAEnvelope, partBForPostman };
  const payloadHash = createPayloadHash(payload);
  let txHash = "";
  let letterId = 0n;
  for (let attempt = 0; ; attempt++) {
    letterId = await nextLetterId();
    const sig = signAction(ownerSeed, actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId, action: "CREATE", nonce: 0, payloadHash }));
    try {
      ({ txHash } = await relay(buildCreateBody({ ...payload, ownerPublicKey: owner.publicKey, sig })));
      break;
    } catch (e) {
      const raced = e instanceof HelperError && e.code === "would_revert" && e.reason === "InvalidSignature";
      if (!raced || attempt >= 2) throw e;
    }
  }

  return {
    version: 1,
    letterId: letterId.toString(),
    ownerName: input.ownerName.trim() || undefined,
    txHash,
    createdAt: new Date().toISOString(),
    registry: REGISTRY,
    heirs: [{ name: recipient.name.trim(), evm: id.evm, qor: id.qor }],
    guardianName: input.guardianName,
    whenLabel: input.whenLabel,
    quietSeconds: input.quiet,
    warningSeconds: input.warning,
    ownerCard: cardEncode(ownerSeed),
    guardianCard: guardianSeed ? cardEncode(guardianSeed) : null,
    surprise: { backups: backups.length },
  };
}
