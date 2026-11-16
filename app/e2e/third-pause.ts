/**
 * Builds a THIRD guardian pause request (the app's own button is switched off once both are used, so the test sends
 * this one by hand to check that the network itself refuses). Prints the request body as JSON; it sends nothing.
 *   cd helper && npx tsx ../app/e2e/third-pause.ts <letterId> <guardianCard>
 */
import { createPublicClient, http, parseAbi, toHex } from "viem";
import { EMPTY_PAYLOAD_HASH, EVM_CHAIN_ID, actionMessage, cardDecode, signAction, signingKeysFromSeed } from "../../shared/tabella-crypto.ts";

const [id, card] = process.argv.slice(2);
const REGISTRY = "0xC0808aF18e2283dFE4d026315a462349561fFd1c";
const client = createPublicClient({ transport: http("https://evm-testnet.qore.host") });
const l = await client.readContract({ address: REGISTRY, abi: parseAbi(["struct Letter { bytes32 ownerKeyHash; bytes32 guardianKeyHash; address[] heirs; uint64 quietPeriod; uint64 warningPeriod; uint64 lastCheckIn; uint64 nonce; uint8 pausesUsed; bool cancelled; bool released; bytes letterCiphertext; bytes partAEnvelope; bytes partBForPostman; bytes partBForHeirs; }", "function getLetter(uint256) view returns (Letter)"]), functionName: "getLetter", args: [BigInt(id!)] });
const seed = cardDecode(card!);
const keys = signingKeysFromSeed(seed);
const sig = signAction(seed, actionMessage({ chainId: EVM_CHAIN_ID, registry: REGISTRY, letterId: BigInt(id!), action: "PAUSE", nonce: l.nonce, payloadHash: EMPTY_PAYLOAD_HASH }));
console.log(JSON.stringify({ pausesUsed: l.pausesUsed, body: { fn: "guardianPause", args: { letterId: id }, pubkey: toHex(keys.publicKey), sig: toHex(sig) } }));
