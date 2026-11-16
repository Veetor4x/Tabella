// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Stand-in for the QoreChain PQC precompiles, which do not exist in local Foundry.
///         Etch this contract at 0x0A01 (pqcVerify) and 0x0A02 (pqcKeyStatus) with vm.etch.
///
///         Real ML-DSA-87 verification cannot run in the EVM, so this mock "verifies" with a
///         fixture rule: a signature is valid only if it equals keccak256(pubkey ++ message).
///         It can also be told to accept one specific (pubkey, signature, message) fixture, such as a
///         REAL ML-DSA-87 signature made by shared/tabella-crypto.ts (see LibSignature.t.sol).
///         That keeps the properties the registry relies on (a signature is bound to ONE pubkey
///         and ONE message; any change makes it false) so the replay / wrong-key / tamper
///         tests mean something. The real precompile is exercised on testnet (spike 02).
contract MockPqc {
    // slot 0 (storage lives at whichever address this is etched to)
    mapping(address => bool) public registeredAccount;
    mapping(address => uint8) public algorithm;
    // keccak256(abi.encode(keccak256(pubkey), keccak256(sig), keccak256(message))) => accepted fixture
    mapping(bytes32 => bool) public fixtureAllowed;

    /// @dev The signature the mock accepts for (pubkey, message).
    function fixtureSig(bytes memory pubkey, bytes memory message) public pure returns (bytes memory) {
        return abi.encodePacked(keccak256(abi.encodePacked(pubkey, message)));
    }

    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool)
    {
        if (fixtureAllowed[keccak256(abi.encode(keccak256(pubkey), keccak256(signature), keccak256(message)))]) {
            return true;
        }
        return keccak256(signature) == keccak256(fixtureSig(pubkey, message));
    }

    function pqcKeyStatus(address account) external view returns (bool, uint8, bytes memory) {
        return (registeredAccount[account], algorithm[account], registeredAccount[account] ? new bytes(2592) : new bytes(0));
    }

    /// @dev Test helper, call on the etched address: accept exactly this (pubkey, sig, message).
    function allowFixture(bytes calldata pubkey, bytes calldata signature, bytes calldata message) external {
        fixtureAllowed[keccak256(abi.encode(keccak256(pubkey), keccak256(signature), keccak256(message)))] = true;
    }

    /// @dev Test helper, call on the etched address.
    function setStatus(address account, bool registered, uint8 algorithmId) external {
        registeredAccount[account] = registered;
        algorithm[account] = algorithmId;
    }
}
