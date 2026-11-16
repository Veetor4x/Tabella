// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Fixtures} from "./Fixtures.sol";
import {TabellaRegistry} from "../src/TabellaRegistry.sol";
import {MockPqc} from "./mocks/MockPqc.sol";

/// @notice Feeds REAL ML-DSA-87 signatures made by shared/tabella-crypto.ts (2592-byte key,
///         4627-byte signatures) through TabellaRegistry. The mock precompile is told to accept
///         exactly those fixtures, so this passes only if
///           - the message the contract builds equals the message the TS lib signed, byte for byte
///           - real-size keys / signatures survive the ABI, hashing and gas paths.
///         (That the real precompile accepts this lib's signatures was proven on testnet, spike 02.)
///         Regenerate the fixture: cd shared && npm run fixtures
contract LibSignatureTest is Fixtures {
    bytes internal pubkey;
    bytes internal createSig;
    bytes internal checkinSig;
    bytes32 internal ownerKeyHash;

    function setUp() public {
        _deployRegistryAtFixedAddress();
        string memory json = vm.readFile(string.concat(vm.projectRoot(), SIGNATURES_PATH));
        pubkey = vm.parseJsonBytes(json, ".ownerPubkey");
        createSig = vm.parseJsonBytes(json, ".createSig");
        checkinSig = vm.parseJsonBytes(json, ".checkinSig");
        ownerKeyHash = vm.parseJsonBytes32(json, ".ownerKeyHash");

        // sanity: the fixture really has the real ML-DSA-87 sizes
        assertEq(pubkey.length, 2592, "ML-DSA-87 public key size");
        assertEq(createSig.length, 4627, "ML-DSA-87 signature size");
        assertEq(checkinSig.length, 4627, "ML-DSA-87 signature size");
        assertEq(keccak256(pubkey), ownerKeyHash, "keyHash(pubkey) matches the contract's hash");

        // The mock accepts these two exact (pubkey, signature, message) triples, built independently here.
        MockPqc(PQC_VERIFY).allowFixture(pubkey, createSig, _message(1, "CREATE", 0, _createPayloadHash()));
        MockPqc(PQC_VERIFY).allowFixture(pubkey, checkinSig, _message(1, "CHECKIN", 1, keccak256("")));
    }

    function _create() internal {
        reg.createLetter(
            _heirs(), GUARDIAN_HASH, QUIET, WARNING, _letterCiphertext(), _partA(), _partB(), pubkey, createSig
        );
    }

    function test_LibSignedCreateAndCheckInPassTheContract() public {
        _create();
        TabellaRegistry.Letter memory l = reg.getLetter(1);
        assertEq(l.ownerKeyHash, ownerKeyHash);
        assertEq(l.nonce, 1);

        vm.warp(T0 + 100);
        reg.checkIn(1, pubkey, checkinSig);
        l = reg.getLetter(1);
        assertEq(l.nonce, 2);
        assertEq(l.lastCheckIn, T0 + 100);
    }

    function test_TamperedLibSignatureRejected() public {
        bytes memory bad = createSig;
        bad[1000] = bytes1(uint8(bad[1000]) ^ 0x01);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.createLetter(
            _heirs(), GUARDIAN_HASH, QUIET, WARNING, _letterCiphertext(), _partA(), _partB(), pubkey, bad
        );
    }

    function test_LibSignatureIsBoundToTheLetterAndAction() public {
        _create();
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector); // a CHECKIN signature cannot cancel
        reg.cancel(1, pubkey, checkinSig);

        vm.warp(T0 + 100);
        reg.checkIn(1, pubkey, checkinSig);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector); // and cannot be replayed (nonce moved on)
        reg.checkIn(1, pubkey, checkinSig);
    }

    function test_LibSignatureRejectedOnAnotherChain() public {
        _create();
        vm.chainId(1);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.checkIn(1, pubkey, checkinSig);
    }
}
