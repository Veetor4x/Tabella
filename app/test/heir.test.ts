import { describe, expect, it } from "vitest";
import { extractAddress, parseAddress } from "../src/lib/addr";
import { accountFromSeed, identityFromCard, newCard } from "../src/lib/heir";
import { heirStateOf } from "../src/lib/registry";
import { inviteLink, emailLink, whatsappLink } from "../src/lib/share";
import { sheetLines } from "../src/landing/stories";
import { cardDecode, cardEncode } from "../../shared/tabella-crypto";

describe("the opening card is the whole identity", () => {
  it("the same card always gives the same account and opening key, a different card a different one", async () => {
    const card = newCard();
    const a = await identityFromCard(card);
    const b = await identityFromCard(` ${card.slice(0, 12)}\n${card.slice(12)} `); // spaces and line breaks are ignored
    expect(b.qor).toBe(a.qor);
    expect(b.evm).toBe(a.evm);
    expect(Buffer.from(b.keys.mlkemPublicKey).equals(Buffer.from(a.keys.mlkemPublicKey))).toBe(true);
    const c = await identityFromCard(newCard());
    expect(c.qor).not.toBe(a.qor);
    expect(parseAddress(a.qor).ok && parseAddress(a.evm).ok).toBe(true);
    expect(parseAddress(a.qor)).toMatchObject({ ok: true, evm: a.evm });
  });
  it("the account is separate from the opening keys: the seed itself is never the account's input", async () => {
    const seed = cardDecode(newCard());
    const acc = await accountFromSeed(seed);
    expect(acc.cosmos).toMatch(/^qor1/);
    expect(cardEncode(seed)).toMatch(/^tbl1_/);
  });
  it("a mistyped code is refused with a kind sentence", async () => {
    const card = newCard();
    const typo = card.slice(0, 20) + (card[20] === "A" ? "B" : "A") + card.slice(21);
    await expect(identityFromCard(typo)).rejects.toThrow(/typo|doesn't belong/);
    await expect(identityFromCard("hello")).rejects.toThrow(/Tabella card/);
    await expect(identityFromCard(card.slice(0, 30))).rejects.toThrow(/too short|character that doesn.t belong/);
  });
});

describe("what a loved one is allowed to see", () => {
  it("sealed (and the warning time) shows only 'sealed'", () => {
    expect(heirStateOf(0, false, 0)).toBe("sealed");
    expect(heirStateOf(1, false, 0)).toBe("sealed");
  });
  it("released but not yet delivered is 'on its way'; delivered is 'ready'; withdrawn is its own", () => {
    expect(heirStateOf(2, false, 0)).toBe("on-its-way");
    expect(heirStateOf(2, true, 2000)).toBe("ready");
    expect(heirStateOf(3, false, 0)).toBe("withdrawn");
    expect(heirStateOf(2, true, 0)).toBe("on-its-way"); // flagged but no envelope: not openable
  });
});

describe("the invite link and the message with an address", () => {
  it("is a plain link to /join, carrying at most a first name", () => {
    expect(inviteLink("Alex", "https://tabella.example")).toBe("https://tabella.example/join?from=Alex");
    expect(inviteLink("  ", "https://tabella.example")).toBe("https://tabella.example/join");
    expect(inviteLink("A".repeat(80), "https://x")).toHaveLength("https://x/join?from=".length + 30);
    expect(inviteLink("Alex", "https://x")).not.toMatch(/tbl1_|0x|qor1|seed|card=/i);
  });
  it("opens WhatsApp and email with the text and the link", () => {
    const c = { subject: "Hi", text: "Please join", url: "https://x/join?from=Alex" };
    expect(whatsappLink(c)).toBe(`https://wa.me/?text=${encodeURIComponent("Please join\n\nhttps://x/join?from=Alex")}`);
    expect(emailLink(c)).toContain("mailto:?subject=Hi&body=");
  });
  it("pulls the address out of a pasted message, and leaves a plain address alone", async () => {
    const id = await identityFromCard(newCard());
    expect(extractAddress(id.qor)).toBe(id.qor);
    expect(extractAddress(`Hi Alex, my opening card is ready. Here is my address:\n\n${id.qor}`)).toBe(id.qor);
    expect(extractAddress(`please use ${id.evm} thanks`)).toBe(id.evm);
    expect(extractAddress("no address here")).toBe("no address here");
  });
});

describe("the sheet in the opening scene", () => {
  it("breaks a letter into short lines and cuts a long one with an ellipsis", () => {
    const lines = sheetLines("Dear Mia and Leo,\n\n" + "word ".repeat(200));
    expect(lines.length).toBe(12);
    expect(lines.every((l) => l.length <= 36)).toBe(true);
    expect(lines.at(-1)!.endsWith("…")).toBe(true);
    expect(sheetLines("Short note.")).toEqual(["Short note."]);
  });
});
