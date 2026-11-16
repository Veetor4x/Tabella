// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TabellaRegistry} from "../src/TabellaRegistry.sol";
import {MockPqc} from "./mocks/MockPqc.sol";

/// @notice Fixed inputs shared by ExportVectors.t.sol and LibSignature.t.sol, and mirrored by
///         shared/tabella-crypto.test.ts. Changing any value changes the vector files.
abstract contract Fixtures is Test {
    address constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address constant PQC_STATUS = 0x0000000000000000000000000000000000000a02;

    /// Registry address used in every vector (deployCodeTo puts it here).
    address constant REGISTRY = address(uint160(0x1111111111111111111111111111111111111111));
    uint256 constant EVM_CHAIN_ID = 9800;
    uint256 constant T0 = 1_000_000;
    address constant POSTMAN = address(0xB057);

    address constant ADA = address(uint160(0xada00));
    address constant SAM = address(uint160(0x5a00));
    uint64 constant QUIET = 120;
    uint64 constant WARNING = 60;
    bytes32 constant GUARDIAN_HASH = keccak256("fixture guardian key");

    string constant VECTORS_PATH = "/../shared/test-vectors/contract-vectors.json";
    string constant SIGNATURES_PATH = "/../shared/test-vectors/lib-signatures.json";

    TabellaRegistry internal reg;

    function _deployRegistryAtFixedAddress() internal {
        vm.chainId(EVM_CHAIN_ID);
        vm.warp(T0);
        vm.etch(PQC_VERIFY, address(new MockPqc()).code);
        vm.etch(PQC_STATUS, address(new MockPqc()).code);
        deployCodeTo("TabellaRegistry.sol:TabellaRegistry", abi.encode(POSTMAN), REGISTRY);
        reg = TabellaRegistry(REGISTRY);
    }

    function _heirs() internal pure returns (address[] memory h) {
        h = new address[](2);
        h[0] = ADA;
        h[1] = SAM;
    }

    function _letterCiphertext() internal pure returns (bytes memory) {
        return bytes("fixture-letter-ciphertext");
    }

    function _partA() internal pure returns (bytes memory) {
        return bytes("fixture-part-A-envelope");
    }

    function _partB() internal pure returns (bytes memory) {
        return bytes("fixture-part-B-for-postman");
    }

    /// Payload hash of CREATE, computed independently of the contract.
    function _createPayloadHash() internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                _heirs(),
                GUARDIAN_HASH,
                QUIET,
                WARNING,
                keccak256(_letterCiphertext()),
                keccak256(_partA()),
                keccak256(_partB())
            )
        );
    }

    /// The signed message, computed independently of the contract (spec section 6).
    function _message(uint256 letterId, string memory action, uint256 nonce, bytes32 payloadHash)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode("TABELLA_V1", EVM_CHAIN_ID, REGISTRY, letterId, action, nonce, payloadHash);
    }
}
