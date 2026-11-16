/**
 * The ONLY contract functions /relay will ever encode. Anything else (publishPartB, setPostman, ...)
 * is rejected before it gets near the chain. A test checks these selectors against the compiled contract.
 */
import { parseAbi } from "viem";

export const registryAbi = parseAbi([
  "function createLetter(address[] heirs, bytes32 guardianKeyHash, uint64 quietPeriod, uint64 warningPeriod, bytes letterCiphertext, bytes partAEnvelope, bytes partBForPostman, bytes ownerPubkey, bytes sig) returns (uint256 letterId)",
  "function checkIn(uint256 letterId, bytes ownerPubkey, bytes sig)",
  "function guardianPause(uint256 letterId, bytes guardianPubkey, bytes sig)",
  "function cancel(uint256 letterId, bytes ownerPubkey, bytes sig)",
  // errors, so a revert can be named for the caller
  "error NotContractOwner()",
  "error NotPostman()",
  "error UnknownLetter()",
  "error BadHeirs()",
  "error BadPeriod()",
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
]);

export const RELAYED_FUNCTIONS = ["createLetter", "checkIn", "guardianPause", "cancel"] as const;
export type RelayedFunction = (typeof RELAYED_FUNCTIONS)[number];
