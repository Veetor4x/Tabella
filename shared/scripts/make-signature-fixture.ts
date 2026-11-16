import { readFileSync, writeFileSync } from "node:fs";
import { buildSignatureFixture, type ContractVectors } from "./signature-fixture";

const dir = new URL("../test-vectors/", import.meta.url);
const vectors = JSON.parse(readFileSync(new URL("contract-vectors.json", dir), "utf8")) as ContractVectors;
writeFileSync(new URL("lib-signatures.json", dir), buildSignatureFixture(vectors));
console.log("wrote shared/test-vectors/lib-signatures.json");
