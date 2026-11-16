// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TabellaRegistry} from "../src/TabellaRegistry.sol";
import {MockPqc} from "./mocks/MockPqc.sol";

contract TabellaRegistryTest is Test {
    address constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address constant PQC_STATUS = 0x0000000000000000000000000000000000000a02;

    TabellaRegistry internal reg;
    MockPqc internal mock; // reference instance, only used for fixtureSig()

    address internal postman = address(0xB057);
    address internal relayer = address(0xCAFE);
    address internal ada = address(0xADA);
    address internal sam = address(0x5A);

    bytes internal ownerPk = bytes("owner-ml-dsa-87-pubkey");
    bytes internal guardianPk = bytes("guardian-ml-dsa-87-pubkey");
    bytes internal strangerPk = bytes("stranger-pubkey");

    uint64 constant QUIET = 120;
    uint64 constant WARNING = 60;
    uint256 constant T0 = 1_000_000;

    event Created(uint256 indexed letterId, bytes32 indexed ownerKeyHash, address[] heirs, uint64 quietPeriod, uint64 warningPeriod);
    event CheckedIn(uint256 indexed letterId, uint64 at);
    event Paused(uint256 indexed letterId, uint8 pausesUsed, uint64 at);
    event Cancelled(uint256 indexed letterId);
    event PartBPublished(uint256 indexed letterId);

    function setUp() public {
        mock = new MockPqc();
        vm.etch(PQC_VERIFY, address(mock).code);
        vm.etch(PQC_STATUS, address(mock).code);
        vm.warp(T0);
        reg = new TabellaRegistry(postman);
    }

    // ------------------------------------------------------------ helpers

    function _heirs() internal view returns (address[] memory h) {
        h = new address[](2);
        h[0] = ada;
        h[1] = sam;
    }

    /// Independent re-implementation of the spec'd message (NOT calling the contract).
    function _msg(uint256 id, string memory action, uint256 nonce, bytes32 payloadHash) internal view returns (bytes memory) {
        return abi.encode("TABELLA_V1", block.chainid, address(reg), id, action, nonce, payloadHash);
    }

    function _sig(bytes memory pk, bytes memory message) internal view returns (bytes memory) {
        return mock.fixtureSig(pk, message);
    }

    function _create(bytes32 guardianHash) internal returns (uint256 id) {
        return _createWith(_heirs(), guardianHash, QUIET, WARNING);
    }

    function _createWith(address[] memory heirs, bytes32 guardianHash, uint64 quiet, uint64 warn) internal returns (uint256 id) {
        bytes memory ct = bytes("ciphertext");
        bytes memory a = bytes("partA-envelope");
        bytes memory b = bytes("partB-for-postman");
        bytes32 payload = keccak256(abi.encode(heirs, guardianHash, quiet, warn, keccak256(ct), keccak256(a), keccak256(b)));
        id = reg.letterCount() + 1;
        bytes memory sig = _sig(ownerPk, _msg(id, "CREATE", 0, payload));
        vm.prank(relayer);
        reg.createLetter(heirs, guardianHash, quiet, warn, ct, a, b, ownerPk, sig);
    }

    function _act(uint256 id, string memory action) internal view returns (bytes memory pk, bytes memory sig) {
        pk = keccak256(bytes(action)) == keccak256("PAUSE") ? guardianPk : ownerPk;
        sig = _sig(pk, _msg(id, action, reg.getLetter(id).nonce, keccak256("")));
    }

    function _checkIn(uint256 id) internal {
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        vm.prank(relayer);
        reg.checkIn(id, pk, sig);
    }

    function _pause(uint256 id) internal {
        (bytes memory pk, bytes memory sig) = _act(id, "PAUSE");
        vm.prank(relayer);
        reg.guardianPause(id, pk, sig);
    }

    function _status(uint256 id) internal view returns (TabellaRegistry.Status) {
        return reg.status(id);
    }

    // ============================================================ create

    function test_CreateStoresEverything() public {
        bytes32 gh = keccak256(guardianPk);
        vm.expectEmit(true, true, false, true);
        emit Created(1, keccak256(ownerPk), _heirs(), QUIET, WARNING);
        uint256 id = _create(gh);

        assertEq(id, 1);
        assertEq(reg.letterCount(), 1);
        TabellaRegistry.Letter memory l = reg.getLetter(id);
        assertEq(l.ownerKeyHash, keccak256(ownerPk));
        assertEq(l.guardianKeyHash, gh);
        assertEq(l.heirs.length, 2);
        assertEq(l.heirs[0], ada);
        assertEq(l.heirs[1], sam);
        assertEq(l.quietPeriod, QUIET);
        assertEq(l.warningPeriod, WARNING);
        assertEq(l.lastCheckIn, T0);
        assertEq(l.nonce, 1);
        assertEq(l.pausesUsed, 0);
        assertFalse(l.cancelled);
        assertFalse(l.released);
        assertEq(l.letterCiphertext, bytes("ciphertext"));
        assertEq(l.partAEnvelope, bytes("partA-envelope"));
        assertEq(l.partBForPostman, bytes("partB-for-postman"));
        assertEq(l.partBForHeirs.length, 0);
        assertTrue(_status(id) == TabellaRegistry.Status.Active);
    }

    function test_CreateWithoutGuardianIsAllowed() public {
        uint256 id = _create(bytes32(0));
        assertEq(reg.getLetter(id).guardianKeyHash, bytes32(0));
    }

    function test_CreateIdsIncrement() public {
        assertEq(_create(0), 1);
        assertEq(_create(0), 2);
    }

    function test_CreateRejectsBadSignature() public {
        address[] memory h = _heirs();
        bytes memory bad = _sig(ownerPk, bytes("not the message"));
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "c", "a", "b", ownerPk, bad);
    }

    function test_CreateSignatureBindsEveryArgument() public {
        // sign for QUIET=120 but submit 121: the relayer cannot tweak arguments
        address[] memory h = _heirs();
        bytes memory ct = "ciphertext";
        bytes memory a = "a";
        bytes memory b = "b";
        bytes32 payload = keccak256(abi.encode(h, bytes32(0), QUIET, WARNING, keccak256(ct), keccak256(a), keccak256(b)));
        bytes memory sig = _sig(ownerPk, _msg(1, "CREATE", 0, payload));
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.createLetter(h, 0, QUIET + 1, WARNING, ct, a, b, ownerPk, sig);
    }

    function test_CreateRejectsHeirCount() public {
        address[] memory none = new address[](0);
        vm.expectRevert(TabellaRegistry.BadHeirs.selector);
        reg.createLetter(none, 0, QUIET, WARNING, "c", "a", "b", ownerPk, "");

        address[] memory four = new address[](4);
        for (uint256 i; i < 4; i++) four[i] = address(uint160(0x100 + i));
        vm.expectRevert(TabellaRegistry.BadHeirs.selector);
        reg.createLetter(four, 0, QUIET, WARNING, "c", "a", "b", ownerPk, "");
    }

    function test_CreateRejectsZeroHeir() public {
        address[] memory h = new address[](2);
        h[0] = ada;
        vm.expectRevert(TabellaRegistry.BadHeirs.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "c", "a", "b", ownerPk, "");
    }

    function test_CreateRejectsBadPeriods() public {
        address[] memory h = _heirs();
        vm.expectRevert(TabellaRegistry.BadPeriod.selector);
        reg.createLetter(h, 0, 0, WARNING, "c", "a", "b", ownerPk, "");
        vm.expectRevert(TabellaRegistry.BadPeriod.selector);
        reg.createLetter(h, 0, QUIET, 0, "c", "a", "b", ownerPk, "");
        uint64 tooLong = uint64(reg.MAX_PERIOD()) + 1;
        vm.expectRevert(TabellaRegistry.BadPeriod.selector);
        reg.createLetter(h, 0, tooLong, WARNING, "c", "a", "b", ownerPk, "");
    }

    function test_CreateRejectsEmptyAndOversizedBlobs() public {
        address[] memory h = _heirs();
        vm.expectRevert(TabellaRegistry.Empty.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "", "a", "b", ownerPk, "");
        vm.expectRevert(TabellaRegistry.Empty.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "c", "", "b", ownerPk, "");
        vm.expectRevert(TabellaRegistry.Empty.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "c", "a", "", ownerPk, "");

        bytes memory big = new bytes(reg.MAX_BYTES() + 1);
        vm.expectRevert(TabellaRegistry.TooLarge.selector);
        reg.createLetter(h, 0, QUIET, WARNING, big, "a", "b", ownerPk, "");
        vm.expectRevert(TabellaRegistry.TooLarge.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "c", big, "b", ownerPk, "");
        vm.expectRevert(TabellaRegistry.TooLarge.selector);
        reg.createLetter(h, 0, QUIET, WARNING, "c", "a", big, ownerPk, "");
    }

    function test_CreateAcceptsMaxSizedBlob() public {
        address[] memory h = _heirs();
        bytes memory max = new bytes(reg.MAX_BYTES());
        bytes32 payload = keccak256(abi.encode(h, bytes32(0), QUIET, WARNING, keccak256(max), keccak256("a"), keccak256("b")));
        bytes memory sig = _sig(ownerPk, _msg(1, "CREATE", 0, payload));
        reg.createLetter(h, 0, QUIET, WARNING, max, "a", "b", ownerPk, sig);
        assertEq(reg.getLetter(1).letterCiphertext.length, reg.MAX_BYTES());
    }

    // ========================================================= timeline

    function test_StatusTimeline_ExactBoundaries() public {
        uint256 id = _create(0);
        assertTrue(_status(id) == TabellaRegistry.Status.Active);

        vm.warp(T0 + QUIET - 1); // last second of Active
        assertTrue(_status(id) == TabellaRegistry.Status.Active);

        vm.warp(T0 + QUIET); // Warning starts exactly at lastCheckIn + quiet
        assertTrue(_status(id) == TabellaRegistry.Status.Warning);

        vm.warp(T0 + QUIET + WARNING - 1); // last second of Warning
        assertTrue(_status(id) == TabellaRegistry.Status.Warning);

        vm.warp(T0 + QUIET + WARNING); // Released exactly at lastCheckIn + quiet + warning
        assertTrue(_status(id) == TabellaRegistry.Status.Released);

        vm.warp(T0 + 100 * 365 days); // and stays Released
        assertTrue(_status(id) == TabellaRegistry.Status.Released);
    }

    function testFuzz_StatusMatchesTimestamps(uint64 quiet, uint64 warn, uint32 elapsed) public {
        quiet = uint64(bound(quiet, 1, reg.MAX_PERIOD()));
        warn = uint64(bound(warn, 1, reg.MAX_PERIOD()));
        uint256 id = _createWith(_heirs(), 0, quiet, warn);
        vm.warp(T0 + elapsed);
        TabellaRegistry.Status s = _status(id);
        if (elapsed < quiet) assertTrue(s == TabellaRegistry.Status.Active);
        else if (elapsed < uint256(quiet) + warn) assertTrue(s == TabellaRegistry.Status.Warning);
        else assertTrue(s == TabellaRegistry.Status.Released);
    }

    function test_StatusUnknownLetterReverts() public {
        vm.expectRevert(TabellaRegistry.UnknownLetter.selector);
        reg.status(1);
        vm.expectRevert(TabellaRegistry.UnknownLetter.selector);
        reg.status(0);
    }

    // ========================================================= check-in

    function test_CheckInResetsClock() public {
        uint256 id = _create(0);
        vm.warp(T0 + 100); // 20s before Warning
        vm.expectEmit(true, false, false, true);
        emit CheckedIn(id, uint64(T0 + 100));
        _checkIn(id);

        assertEq(reg.getLetter(id).lastCheckIn, T0 + 100);
        assertEq(reg.getLetter(id).nonce, 2);
        vm.warp(T0 + 100 + QUIET - 1);
        assertTrue(_status(id) == TabellaRegistry.Status.Active);
        vm.warp(T0 + 100 + QUIET);
        assertTrue(_status(id) == TabellaRegistry.Status.Warning);
    }

    function test_CheckInWorksDuringWarning() public {
        uint256 id = _create(0);
        vm.warp(T0 + QUIET + 10);
        assertTrue(_status(id) == TabellaRegistry.Status.Warning);
        _checkIn(id);
        assertTrue(_status(id) == TabellaRegistry.Status.Active);
    }

    function test_CheckInRejectedOnceReleased_EvenBeforePartBIsPublished() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        vm.warp(T0 + QUIET + WARNING);
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.checkIn(id, pk, sig);
    }

    function test_CheckInRejectedAfterCancel() public {
        uint256 id = _create(0);
        _cancel(id);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.checkIn(id, pk, sig);
    }

    function test_CheckInUnknownLetter() public {
        vm.expectRevert(TabellaRegistry.UnknownLetter.selector);
        reg.checkIn(7, ownerPk, "");
    }

    // ============================================== wrong key / bad sig

    function test_WrongKeyRejected_StrangerCannotCheckIn() public {
        uint256 id = _create(0);
        bytes memory sig = _sig(strangerPk, _msg(id, "CHECKIN", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.WrongKey.selector);
        reg.checkIn(id, strangerPk, sig);
    }

    function test_WrongKeyRejected_GuardianCannotCheckIn() public {
        uint256 id = _create(keccak256(guardianPk));
        bytes memory sig = _sig(guardianPk, _msg(id, "CHECKIN", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.WrongKey.selector);
        reg.checkIn(id, guardianPk, sig);
    }

    function test_WrongKeyRejected_OwnerCannotPause() public {
        uint256 id = _create(keccak256(guardianPk));
        bytes memory sig = _sig(ownerPk, _msg(id, "PAUSE", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.WrongKey.selector);
        reg.guardianPause(id, ownerPk, sig);
    }

    function test_WrongKeyRejected_GuardianCannotCancel() public {
        uint256 id = _create(keccak256(guardianPk));
        bytes memory sig = _sig(guardianPk, _msg(id, "CANCEL", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.WrongKey.selector);
        reg.cancel(id, guardianPk, sig);
    }

    function test_TamperedOrWrongSignatureRejected() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        sig[0] = bytes1(uint8(sig[0]) ^ 0x01); // flip one bit
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.checkIn(id, pk, sig);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.checkIn(id, pk, "");
    }

    function test_SignatureForAnotherActionRejected() public {
        // a CHECKIN signature cannot be used as a CANCEL
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.cancel(id, pk, sig);
    }

    // ============================================================ replay

    function test_ReplayRejected_SameSignatureTwice() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        reg.checkIn(id, pk, sig);
        vm.warp(T0 + 50);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector); // nonce moved on
        reg.checkIn(id, pk, sig);
        assertEq(reg.getLetter(id).lastCheckIn, T0, "replay must not reset the clock");
    }

    function test_ReplayRejected_AcrossLetters() public {
        uint256 a = _create(0);
        uint256 b = _create(0);
        (bytes memory pk, bytes memory sig) = _act(a, "CHECKIN");
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.checkIn(b, pk, sig);
    }

    function test_ReplayRejected_OtherChain() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        vm.chainId(1234);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.checkIn(id, pk, sig);
    }

    function test_ReplayRejected_OtherContract() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CHECKIN");
        TabellaRegistry other = new TabellaRegistry(postman); // same letter id would need same sig
        // different deployment: its letter 1 does not exist, so this fails as UnknownLetter,
        // and a signature made for `reg` is also bound to address(reg) in the message:
        bytes memory msgForOther = abi.encode("TABELLA_V1", block.chainid, address(other), id, "CHECKIN", uint256(1), keccak256(""));
        assertTrue(keccak256(msgForOther) != keccak256(_msg(id, "CHECKIN", 1, keccak256(""))));
        vm.expectRevert(TabellaRegistry.UnknownLetter.selector);
        other.checkIn(id, pk, sig);
    }

    function test_CreateReplayRejected() public {
        // a relayer replaying the owner's CREATE signature cannot make a second letter
        address[] memory h = _heirs();
        bytes memory ct = "ciphertext";
        bytes memory a = "partA-envelope";
        bytes memory b = "partB-for-postman";
        bytes32 payload = keccak256(abi.encode(h, bytes32(0), QUIET, WARNING, keccak256(ct), keccak256(a), keccak256(b)));
        bytes memory sig = _sig(ownerPk, _msg(1, "CREATE", 0, payload));
        reg.createLetter(h, 0, QUIET, WARNING, ct, a, b, ownerPk, sig);
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector); // next id is 2
        reg.createLetter(h, 0, QUIET, WARNING, ct, a, b, ownerPk, sig);
        assertEq(reg.letterCount(), 1);
    }

    function test_ActionMessageHelperMatchesSpec() public {
        uint256 id = _create(0);
        bytes memory fromContract = reg.actionMessage(id, "CHECKIN", 1, keccak256(""));
        assertEq(fromContract, _msg(id, "CHECKIN", 1, keccak256("")));
    }

    // ======================================================= guardian pause

    function test_GuardianPauseResetsClock() public {
        uint256 id = _create(keccak256(guardianPk));
        vm.warp(T0 + QUIET + 5); // in Warning
        vm.expectEmit(true, false, false, true);
        emit Paused(id, 1, uint64(T0 + QUIET + 5));
        _pause(id);

        TabellaRegistry.Letter memory l = reg.getLetter(id);
        assertEq(l.pausesUsed, 1);
        assertEq(l.lastCheckIn, T0 + QUIET + 5);
        assertEq(l.nonce, 2);
        assertTrue(_status(id) == TabellaRegistry.Status.Active);
    }

    function test_GuardianPauseMaxTwo() public {
        uint256 id = _create(keccak256(guardianPk));
        _pause(id);
        vm.warp(block.timestamp + 10);
        _pause(id);
        assertEq(reg.getLetter(id).pausesUsed, 2);

        vm.warp(block.timestamp + 10);
        (bytes memory pk, bytes memory sig) = _act(id, "PAUSE");
        vm.expectRevert(TabellaRegistry.PauseLimitReached.selector);
        reg.guardianPause(id, pk, sig);
        assertEq(reg.getLetter(id).pausesUsed, 2);
    }

    function test_OwnerCheckInDoesNotUsePauses() public {
        uint256 id = _create(keccak256(guardianPk));
        _pause(id);
        _pause(id);
        _checkIn(id); // owner still fine
        assertEq(reg.getLetter(id).pausesUsed, 2);
    }

    function test_GuardianPauseRejectedWithoutGuardian() public {
        uint256 id = _create(0);
        vm.expectRevert(TabellaRegistry.NoGuardian.selector);
        reg.guardianPause(id, guardianPk, "");
    }

    function test_GuardianPauseRejectedOnceReleased() public {
        uint256 id = _create(keccak256(guardianPk));
        (bytes memory pk, bytes memory sig) = _act(id, "PAUSE");
        vm.warp(T0 + QUIET + WARNING);
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.guardianPause(id, pk, sig);
    }

    function test_GuardianPauseRejectedAfterCancel() public {
        uint256 id = _create(keccak256(guardianPk));
        _cancel(id);
        (bytes memory pk, bytes memory sig) = _act(id, "PAUSE");
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.guardianPause(id, pk, sig);
    }

    function test_GuardianPauseBadSignature() public {
        uint256 id = _create(keccak256(guardianPk));
        bytes memory bad = _sig(guardianPk, bytes("nope"));
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.guardianPause(id, guardianPk, bad);
    }

    // ============================================================ cancel

    function _cancel(uint256 id) internal {
        (bytes memory pk, bytes memory sig) = _act(id, "CANCEL");
        vm.prank(relayer);
        reg.cancel(id, pk, sig);
    }

    function test_CancelInActive() public {
        uint256 id = _create(0);
        vm.expectEmit(true, false, false, false);
        emit Cancelled(id);
        _cancel(id);
        assertTrue(reg.getLetter(id).cancelled);
        assertTrue(_status(id) == TabellaRegistry.Status.Cancelled);
    }

    function test_CancelInWarning() public {
        uint256 id = _create(0);
        vm.warp(T0 + QUIET + 1);
        _cancel(id);
        assertTrue(_status(id) == TabellaRegistry.Status.Cancelled);
    }

    function test_CancelledStaysCancelledForever() public {
        uint256 id = _create(0);
        _cancel(id);
        vm.warp(T0 + 100 * 365 days);
        assertTrue(_status(id) == TabellaRegistry.Status.Cancelled);
    }

    function test_CancelRejectedAfterRelease() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CANCEL");
        vm.warp(T0 + QUIET + WARNING);
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.cancel(id, pk, sig);
    }

    function test_CancelRejectedTwice() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CANCEL");
        reg.cancel(id, pk, sig);
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.cancel(id, pk, sig);
    }

    function test_CancelRejectedAfterPartBPublished() public {
        uint256 id = _create(0);
        (bytes memory pk, bytes memory sig) = _act(id, "CANCEL");
        vm.warp(T0 + QUIET + WARNING);
        vm.prank(postman);
        reg.publishPartB(id, "B-for-heirs");
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.cancel(id, pk, sig);
    }

    function test_CancelBlocksPublishPartB() public {
        uint256 id = _create(0);
        _cancel(id);
        vm.warp(T0 + QUIET + WARNING + 1);
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.NotReleased.selector);
        reg.publishPartB(id, "B-for-heirs");
    }

    // ================================================== release by time

    function test_ReleaseByTimeWarp_AndPublishPartB() public {
        uint256 id = _create(0);

        // Postman too early: Active, then Warning
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.NotReleased.selector);
        reg.publishPartB(id, "B-for-heirs");
        vm.warp(T0 + QUIET + WARNING - 1);
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.NotReleased.selector);
        reg.publishPartB(id, "B-for-heirs");

        // Released
        vm.warp(T0 + QUIET + WARNING);
        assertTrue(_status(id) == TabellaRegistry.Status.Released);
        vm.expectEmit(true, false, false, false);
        emit PartBPublished(id);
        vm.prank(postman);
        reg.publishPartB(id, "B-for-heirs");

        TabellaRegistry.Letter memory l = reg.getLetter(id);
        assertTrue(l.released);
        assertEq(l.partBForHeirs, bytes("B-for-heirs"));
        assertTrue(_status(id) == TabellaRegistry.Status.Released);
    }

    function test_FullStory_CheckInKeepsItSealed_ThenSilence_ThenRelease() public {
        uint256 id = _create(keccak256(guardianPk));
        vm.warp(T0 + 110);
        _checkIn(id); // Alex checks in
        vm.warp(T0 + 110 + QUIET + 30); // goes quiet, now in Warning
        assertTrue(_status(id) == TabellaRegistry.Status.Warning);
        _pause(id); // Priya: "they're okay"
        assertTrue(_status(id) == TabellaRegistry.Status.Active);
        uint256 t = block.timestamp;
        vm.warp(t + QUIET + WARNING); // nobody speaks up
        assertTrue(_status(id) == TabellaRegistry.Status.Released);
        vm.prank(postman);
        reg.publishPartB(id, "B");
        assertTrue(reg.getLetter(id).released);
    }

    // =================================================== publishPartB

    function test_PublishPartB_OnlyPostman() public {
        uint256 id = _create(0);
        vm.warp(T0 + QUIET + WARNING);
        vm.prank(relayer);
        vm.expectRevert(TabellaRegistry.NotPostman.selector);
        reg.publishPartB(id, "B");
        vm.prank(ada);
        vm.expectRevert(TabellaRegistry.NotPostman.selector);
        reg.publishPartB(id, "B");
        vm.expectRevert(TabellaRegistry.NotPostman.selector); // even the contract owner (this test)
        reg.publishPartB(id, "B");
    }

    function test_PublishPartB_OnlyOnce() public {
        uint256 id = _create(0);
        vm.warp(T0 + QUIET + WARNING);
        vm.startPrank(postman);
        reg.publishPartB(id, "B1");
        vm.expectRevert(TabellaRegistry.AlreadyPublished.selector);
        reg.publishPartB(id, "B2");
        vm.stopPrank();
        assertEq(reg.getLetter(id).partBForHeirs, bytes("B1"));
    }

    function test_PublishPartB_UnknownLetter() public {
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.UnknownLetter.selector);
        reg.publishPartB(99, "B");
    }

    function test_PublishPartB_RejectsEmptyAndOversized() public {
        uint256 id = _create(0);
        vm.warp(T0 + QUIET + WARNING);
        bytes memory big = new bytes(reg.MAX_BYTES() + 1); // before expectRevert: it makes an external call
        vm.startPrank(postman);
        vm.expectRevert(TabellaRegistry.Empty.selector);
        reg.publishPartB(id, "");
        vm.expectRevert(TabellaRegistry.TooLarge.selector);
        reg.publishPartB(id, big);
        vm.stopPrank();
        assertFalse(reg.getLetter(id).released, "failed publish must not mark released");
    }

    // ===================================================== setPostman

    function test_SetPostman_OnlyContractOwner() public {
        address newPostman = address(0xB0B);
        vm.prank(relayer);
        vm.expectRevert(TabellaRegistry.NotContractOwner.selector);
        reg.setPostman(newPostman);

        reg.setPostman(newPostman); // this test contract deployed it
        assertEq(reg.postman(), newPostman);

        uint256 id = _create(0);
        vm.warp(T0 + QUIET + WARNING);
        vm.prank(postman); // old postman no longer allowed
        vm.expectRevert(TabellaRegistry.NotPostman.selector);
        reg.publishPartB(id, "B");
        vm.prank(newPostman);
        reg.publishPartB(id, "B");
    }

    function test_SetPostman_RejectsZero() public {
        vm.expectRevert(TabellaRegistry.ZeroAddress.selector);
        reg.setPostman(address(0));
        vm.expectRevert(TabellaRegistry.ZeroAddress.selector);
        new TabellaRegistry(address(0));
    }

    // ================================================== heirKeyReady

    function test_HeirKeyReady_WrapsPqcKeyStatus() public {
        (bool r0, uint8 a0) = reg.heirKeyReady(ada);
        assertFalse(r0);
        assertEq(a0, 0);

        MockPqc(PQC_STATUS).setStatus(ada, true, 2);
        (bool r1, uint8 a1) = reg.heirKeyReady(ada);
        assertTrue(r1);
        assertEq(a1, 2);

        (bool r2,) = reg.heirKeyReady(sam); // someone else is still not ready
        assertFalse(r2);
    }

    // ================================ no money anywhere (letters only)

    function test_RegistryRejectsEther() public {
        (bool ok,) = address(reg).call{value: 1 ether}("");
        assertFalse(ok);
        vm.deal(address(this), 1 ether);
        (ok,) = address(reg).call{value: 1}(abi.encodeCall(TabellaRegistry.status, (1)));
        assertFalse(ok);
        assertEq(address(reg).balance, 0);
    }
}
