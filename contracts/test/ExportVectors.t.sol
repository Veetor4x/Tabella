// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Fixtures} from "./Fixtures.sol";

/// @notice Produces shared/test-vectors/contract-vectors.json, which the TypeScript tests
///         (shared/tabella-crypto.test.ts) compare byte for byte with their own output.
///
///   regenerate:  WRITE_VECTORS=1 forge test --match-contract ExportVectors
///   normal run:  fails if the committed file no longer matches what the contract produces
contract ExportVectorsTest is Fixtures {
    struct Case {
        string name;
        uint256 letterId;
        string action;
        uint256 nonce;
        bytes32 payloadHash;
    }

    function setUp() public {
        _deployRegistryAtFixedAddress();
    }

    function _cases() internal pure returns (Case[] memory c) {
        bytes32 empty = keccak256("");
        c = new Case[](7);
        c[0] = Case("create", 1, "CREATE", 0, _createPayloadHash());
        c[1] = Case("checkin", 1, "CHECKIN", 1, empty);
        c[2] = Case("pause", 2, "PAUSE", 3, empty);
        c[3] = Case("cancel", 7, "CANCEL", 5, empty);
        c[4] = Case("big-numbers", 1 << 40, "CHECKIN", 1 << 33, empty);
        c[6] = Case("create-dated", 3, "CREATE_DATED", 0, _datedPayloadHash());
        c[5] = Case("max-numbers", type(uint256).max, "CANCEL", type(uint256).max, bytes32(type(uint256).max));
    }

    function _datedJson() internal pure returns (string memory) {
        return string.concat(
            '  "createDated": {\n',
            '    "heirs": ["', _lower(ADA), '", "', _lower(SAM), '"],\n',
            '    "releaseAt": ', vm.toString(uint256(RELEASE_AT)), ",\n",
            '    "letterCiphertext": "', vm.toString(_letterCiphertext()), '",\n',
            '    "partAEnvelope": "', vm.toString(_partA()), '",\n',
            '    "partBForPostman": "', vm.toString(_partB()), '",\n',
            '    "payloadHash": "', vm.toString(_datedPayloadHash()), '"\n',
            "  },\n"
        );
    }

    function _json() internal view returns (string memory) {
        Case[] memory cases = _cases();
        string memory out = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(EVM_CHAIN_ID), ",\n",
            '  "registry": "', _lower(REGISTRY), '",\n',
            '  "create": {\n',
            '    "heirs": ["', _lower(ADA), '", "', _lower(SAM), '"],\n',
            '    "guardianKeyHash": "', vm.toString(GUARDIAN_HASH), '",\n',
            '    "quietPeriod": ', vm.toString(uint256(QUIET)), ",\n",
            '    "warningPeriod": ', vm.toString(uint256(WARNING)), ",\n",
            '    "letterCiphertext": "', vm.toString(_letterCiphertext()), '",\n',
            '    "partAEnvelope": "', vm.toString(_partA()), '",\n',
            '    "partBForPostman": "', vm.toString(_partB()), '",\n',
            '    "payloadHash": "', vm.toString(_createPayloadHash()), '"\n',
            "  },\n",
            _datedJson(),
            '  "emptyPayloadHash": "', vm.toString(keccak256("")), '",\n',
            '  "keyHash": { "pubkey": "', vm.toString(bytes("any public key bytes")), '", "hash": "',
            vm.toString(keccak256(bytes("any public key bytes"))), '" },\n',
            '  "cases": [\n'
        );
        for (uint256 i = 0; i < cases.length; i++) {
            Case memory k = cases[i];
            // two independent encodings must agree before anything is exported
            bytes memory fromContract = reg.actionMessage(k.letterId, k.action, k.nonce, k.payloadHash);
            assertEq(fromContract, _message(k.letterId, k.action, k.nonce, k.payloadHash), k.name);
            out = string.concat(
                out,
                '    { "name": "', k.name, '", "letterId": "', vm.toString(k.letterId), '", "action": "', k.action,
                '", "nonce": "', vm.toString(k.nonce), '", "payloadHash": "', vm.toString(k.payloadHash),
                '", "message": "', vm.toString(fromContract), '" }', i + 1 < cases.length ? ",\n" : "\n"
            );
        }
        return string.concat(out, "  ]\n}\n");
    }

    function _lower(address a) internal pure returns (string memory) {
        return vm.toLowercase(vm.toString(a));
    }

    function test_ContractVectorsFileIsUpToDate() public {
        string memory path = string.concat(vm.projectRoot(), VECTORS_PATH);
        string memory fresh = _json();
        if (vm.envOr("WRITE_VECTORS", false)) {
            vm.writeFile(path, fresh);
            emit log_string("wrote contract-vectors.json");
            return;
        }
        assertEq(vm.readFile(path), fresh, "contract-vectors.json is stale: run WRITE_VECTORS=1 forge test --match-contract ExportVectors");
    }
}
