import { describe, expect, it } from "vitest";
import { deliveryLine } from "../src/me/MePage";
import type { SealedLetter } from "../src/lib/storage";

const letter = (over: Partial<SealedLetter> = {}): SealedLetter => ({ version: 1, letterId: "20", txHash: "0x", createdAt: "", registry: "0x", heirs: [{ name: "Mia", evm: "0x", qor: "q" }], guardianName: null, whenLabel: "", quietSeconds: 120, warningSeconds: 60, ownerCard: "c", guardianCard: null, surprise: { backups: 0, emailed: true }, ...over });

describe("the line under the ring, after release", () => {
  it("before release it is still the promise", () => {
    expect(deliveryLine(letter())).toBe("Delivery ready: we'll email Mia when it opens");
    expect(deliveryLine(letter(), false, "sent")).toBe("Delivery ready: we'll email Mia when it opens");
  });
  it("after release it says what really happened to the email", () => {
    expect(deliveryLine(letter(), true, "sent")).toBe("Email sent to Mia");
    expect(deliveryLine(letter(), true, "sending")).toBe("Sending… we'll keep trying");
    expect(deliveryLine(letter(), true, "waiting")).toBe("Sending… we'll keep trying");
    expect(deliveryLine(letter(), true, null)).toBe("Sending… we'll keep trying"); // the helper cannot say right now
    expect(deliveryLine(letter(), true, "failed")).toBe("Couldn't email Mia yet");
  });
  it("'opened' only when the recipient's own card said so", () => {
    expect(deliveryLine(letter(), true, "opened")).toBe("Mia opened the letter");
    expect(deliveryLine(letter(), true, "sent")).not.toMatch(/opened/);
  });
  it("a letter with no recipient email, and an invite-style letter, keep their own lines", () => {
    expect(deliveryLine(letter({ surprise: { backups: 0, emailed: false } }), true, "none")).toBe("Add an email so we can reach them");
    expect(deliveryLine(letter({ surprise: undefined }), true, "sent")).toBe("Delivery ready: they'll open it with the card or link you gave them");
  });
});
