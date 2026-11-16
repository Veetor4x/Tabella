import { existsSync, readFileSync } from "node:fs";
import { toFunctionSelector, type Abi, type AbiFunction } from "viem";
import { describe, expect, it } from "vitest";
import { RELAYED_FUNCTIONS, registryAbi } from "../src/abi.js";

// Needs `cd contracts && forge build` first; skipped on a machine that has not built the contract.
const artifactPath = new URL("../../contracts/out/TabellaRegistry.sol/TabellaRegistry.json", import.meta.url);
const built = existsSync(artifactPath);

describe("helper ABI matches the compiled TabellaRegistry", () => {
  it.skipIf(!built)("has the same selectors for the four relayed functions", () => {
    const real = JSON.parse(readFileSync(artifactPath, "utf8")).abi as Abi;
    for (const name of RELAYED_FUNCTIONS) {
      const ours = registryAbi.find((i) => i.type === "function" && i.name === name) as AbiFunction;
      const theirs = real.find((i) => i.type === "function" && i.name === name) as AbiFunction;
      expect(theirs, `${name} exists in the contract`).toBeDefined();
      expect(toFunctionSelector(ours), name).toBe(toFunctionSelector(theirs));
    }
  });

  it.skipIf(!built)("knows every custom error the contract can raise", () => {
    const real = JSON.parse(readFileSync(artifactPath, "utf8")).abi as Abi;
    const theirs = real.filter((i) => i.type === "error").map((i) => (i as { name: string }).name);
    const ours = registryAbi.filter((i) => i.type === "error").map((i) => (i as { name: string }).name);
    expect(ours.sort()).toEqual(theirs.sort());
  });

  it("relays exactly four functions", () => {
    expect([...RELAYED_FUNCTIONS]).toEqual(["createLetter", "checkIn", "guardianPause", "cancel"]);
    const fnNames = registryAbi.filter((i) => i.type === "function").map((i) => (i as { name: string }).name);
    expect(fnNames.sort()).toEqual([...RELAYED_FUNCTIONS].sort());
  });
});
