/**
 * The ONLY contract functions /relay will ever encode. Anything else (publishPartB, setPostman, ...)
 * is rejected before it gets near the chain. A test checks these selectors against the compiled contract.
 */
import { parseAbi } from "viem";

const errors = [
  "error NotContractOwner()",
  "error NotPostman()",
  "error UnknownLetter()",
  "error BadHeirs()",
  "error BadPeriod()",
  "error BadDate()",
  "error DatedLetter()",
  "error TooLarge()",
  "error Empty()",
  "error WrongKey()",
  "error NoGuardian()",
  "error InvalidSignature()",
  "error NotOpen()",
  "error NotReleased()",
  "error AlreadyPublished()",
  "error PauseLimitReached()",
  "error ZeroAddress()",
] as const;

export const registryAbi = parseAbi([
  "function createLetter(address[] heirs, bytes32 guardianKeyHash, uint64 quietPeriod, uint64 warningPeriod, bytes letterCiphertext, bytes partAEnvelope, bytes partBForPostman, bytes ownerPubkey, bytes sig) returns (uint256 letterId)",
  "function createDatedLetter(address[] heirs, uint64 releaseAt, bytes letterCiphertext, bytes partAEnvelope, bytes partBForPostman, bytes ownerPubkey, bytes sig) returns (uint256 letterId)",
  "function checkIn(uint256 letterId, bytes ownerPubkey, bytes sig)",
  "function guardianPause(uint256 letterId, bytes guardianPubkey, bytes sig)",
  "function cancel(uint256 letterId, bytes ownerPubkey, bytes sig)",
  // errors, so a revert can be named for the caller
  ...errors,
]);

export const RELAYED_FUNCTIONS = ["createLetter", "createDatedLetter", "checkIn", "guardianPause", "cancel"] as const;
export type RelayedFunction = (typeof RELAYED_FUNCTIONS)[number];

/**
 * What the Postman uses: the reads it needs plus publishPartB. It is a SEPARATE ABI on purpose, so the
 * public /relay (which only knows `registryAbi`) can never encode a publishPartB call.
 */
export const postmanAbi = parseAbi([
  "struct Letter { bytes32 ownerKeyHash; bytes32 guardianKeyHash; address[] heirs; uint64 quietPeriod; uint64 warningPeriod; uint64 releaseAt; uint64 lastCheckIn; uint64 nonce; uint8 pausesUsed; bool cancelled; bool released; bytes letterCiphertext; bytes partAEnvelope; bytes partBForPostman; bytes partBForHeirs; }",
  "function letterCount() view returns (uint256)",
  "function status(uint256 letterId) view returns (uint8)",
  "function getLetter(uint256 letterId) view returns (Letter)",
  "function publishPartB(uint256 letterId, bytes envelope)",
  ...errors,
]);

/** TabellaRegistry.Status */
export const STATUS = { Active: 0, Warning: 1, Released: 2, Cancelled: 3 } as const;
