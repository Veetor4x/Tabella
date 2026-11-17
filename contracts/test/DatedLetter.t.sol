// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TabellaRegistry} from "../src/TabellaRegistry.sol";
import {MockPqc} from "./mocks/MockPqc.sol";

/// @notice Dated letters: they open at exactly their date, whether or not anyone checks in, and can be cancelled before it.
contract DatedLetterTest is Test {
    address constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address constant PQC_STATUS = 0x0000000000000000000000000000000000000a02;

    TabellaRegistry internal reg;
    MockPqc internal mock;
    address internal postman = address(0xB057);
    address internal relayer = address(0xCAFE);
    address internal ada = address(0xADA);
    address internal sam = address(0x5A);
    bytes internal ownerPk = bytes("owner-ml-dsa-87-pubkey");
    bytes internal strangerPk = bytes("stranger-pubkey");
    uint256 constant T0 = 1_000_000;
    uint64 constant DEMO = 120; // "in 2 minutes"

    event CreatedDated(uint256 indexed letterId, bytes32 indexed ownerKeyHash, address[] heirs, uint64 releaseAt);
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

    function _msg(uint256 id, string memory action, uint256 nonce, bytes32 payloadHash) internal view returns (bytes memory) {
        return abi.encode("TABELLA_V1", block.chainid, address(reg), id, action, nonce, payloadHash);
    }

    function _sig(bytes memory pk, bytes memory message) internal view returns (bytes memory) {
        return mock.fixtureSig(pk, message);
    }

    function _datedPayload(address[] memory heirs, uint64 releaseAt, bytes memory ct, bytes memory a, bytes memory b) internal pure returns (bytes32) {
        return keccak256(abi.encode(heirs, releaseAt, keccak256(ct), keccak256(a), keccak256(b)));
    }

    function _createDated(uint64 releaseAt) internal returns (uint256 id) {
        return _createDatedWith(_heirs(), releaseAt, "CREATE_DATED", ownerPk);
    }

    function _createDatedWith(address[] memory heirs, uint64 releaseAt, string memory action, bytes memory signer) internal returns (uint256 id) {
        bytes memory ct = bytes("ciphertext");
        bytes memory a = bytes("partA-envelope");
        bytes memory b = bytes("partB-for-postman");
        id = reg.letterCount() + 1;
        bytes memory sig = _sig(signer, _msg(id, action, 0, _datedPayload(heirs, releaseAt, ct, a, b)));
        vm.prank(relayer);
        reg.createDatedLetter(heirs, releaseAt, ct, a, b, ownerPk, sig);
    }

    function _act(uint256 id, string memory action) internal view returns (bytes memory sig) {
        sig = _sig(ownerPk, _msg(id, action, reg.getLetter(id).nonce, keccak256("")));
    }

    function _publish(uint256 id) internal {
        vm.prank(postman);
        reg.publishPartB(id, bytes("partB-for-heirs"));
    }

    // -------------------------------------------------------------- create

    function test_createsADatedLetterWithTheRightFields() public {
        uint64 when_ = uint64(T0 + 90 days);
        vm.expectEmit(true, true, false, true);
        emit CreatedDated(1, keccak256(ownerPk), _heirs(), when_);
        uint256 id = _createDated(when_);
        assertEq(id, 1);
        TabellaRegistry.Letter memory l = reg.getLetter(id);
        assertEq(l.releaseAt, when_);
        assertEq(l.quietPeriod, 0);
        assertEq(l.warningPeriod, 0);
        assertEq(l.guardianKeyHash, bytes32(0));
        assertEq(l.ownerKeyHash, keccak256(ownerPk));
        assertEq(l.heirs.length, 2);
        assertEq(l.nonce, 1);
        assertFalse(l.released);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Active));
    }

    function test_theDemoOptionOpensInTwoMinutes() public {
        uint256 id = _createDated(uint64(T0 + DEMO));
        vm.warp(T0 + DEMO - 1);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Active));
        vm.warp(T0 + DEMO);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Released));
    }

    function test_anOrdinaryLetterIsUnchangedAndHasNoDate() public {
        address[] memory heirs = _heirs();
        bytes memory ct = bytes("ct");
        bytes memory a = bytes("a");
        bytes memory b = bytes("b");
        bytes32 payload = keccak256(abi.encode(heirs, bytes32(0), uint64(120), uint64(60), keccak256(ct), keccak256(a), keccak256(b)));
        bytes memory sig = _sig(ownerPk, _msg(1, "CREATE", 0, payload));
        reg.createLetter(heirs, bytes32(0), 120, 60, ct, a, b, ownerPk, sig);
        assertEq(reg.getLetter(1).releaseAt, 0);
        // its clock still works the old way: Active, Warning, Released
        vm.warp(T0 + 119);
        assertEq(uint8(reg.status(1)), uint8(TabellaRegistry.Status.Active));
        vm.warp(T0 + 120);
        assertEq(uint8(reg.status(1)), uint8(TabellaRegistry.Status.Warning));
        vm.warp(T0 + 180);
        assertEq(uint8(reg.status(1)), uint8(TabellaRegistry.Status.Released));
    }

    // --------------------------------------------- opens exactly at the date

    function test_isActiveUntilTheLastSecondBeforeTheDate_thenReleasedExactlyAtIt() public {
        uint64 when_ = uint64(T0 + 365 days);
        uint256 id = _createDated(when_);
        vm.warp(T0 + 1);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Active));
        vm.warp(when_ - 1);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Active));
        vm.warp(when_);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Released));
        vm.warp(when_ + 10 * 365 days);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Released));
    }

    function test_thereIsNoWarningTimeForADatedLetter() public {
        uint64 when_ = uint64(T0 + 1000);
        uint256 id = _createDated(when_);
        for (uint256 t = T0; t < when_; t += 97) {
            vm.warp(t);
            assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Active), "never Warning");
        }
    }

    function test_theMailmanCannotPublishBeforeTheDate_butCanFromTheDate() public {
        uint64 when_ = uint64(T0 + 30 days);
        uint256 id = _createDated(when_);
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.NotReleased.selector);
        reg.publishPartB(id, bytes("early"));
        vm.warp(when_ - 1);
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.NotReleased.selector);
        reg.publishPartB(id, bytes("one second early"));
        vm.warp(when_);
        vm.expectEmit(true, false, false, false);
        emit PartBPublished(id);
        _publish(id);
        assertTrue(reg.getLetter(id).released);
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.AlreadyPublished.selector);
        reg.publishPartB(id, bytes("again"));
    }

    function test_onlyThePostmanPublishes() public {
        uint256 id = _createDated(uint64(T0 + 10));
        vm.warp(T0 + 10);
        vm.prank(relayer);
        vm.expectRevert(TabellaRegistry.NotPostman.selector);
        reg.publishPartB(id, bytes("x"));
    }

    // ------------------------------------- check-ins and pauses do not apply

    function test_checkInIsRefusedForADatedLetter() public {
        uint256 id = _createDated(uint64(T0 + 30 days));
        bytes memory sig = _act(id, "CHECKIN");
        vm.expectRevert(TabellaRegistry.DatedLetter.selector);
        reg.checkIn(id, ownerPk, sig);
        // and nothing moved: the date is the date
        assertEq(reg.getLetter(id).nonce, 1);
        assertEq(reg.getLetter(id).releaseAt, T0 + 30 days);
    }

    function test_guardianPauseIsRefusedForADatedLetter() public {
        uint256 id = _createDated(uint64(T0 + 30 days));
        bytes memory sig = _sig(bytes("guardian-ml-dsa-87-pubkey"), _msg(id, "PAUSE", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.DatedLetter.selector);
        reg.guardianPause(id, bytes("guardian-ml-dsa-87-pubkey"), sig);
    }

    function test_afterTheDateCheckInAndPauseAreNotOpenEither() public {
        uint64 when_ = uint64(T0 + 100);
        uint256 id = _createDated(when_);
        vm.warp(when_);
        bytes memory sig = _act(id, "CHECKIN");
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.checkIn(id, ownerPk, sig);
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.guardianPause(id, ownerPk, sig);
    }

    function test_theDateIsTheDateEvenIfTheOwnerNeverChecksIn_orTriesTo() public {
        uint64 when_ = uint64(T0 + 500);
        uint256 id = _createDated(when_);
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(T0 + 50 + i * 80);
            bytes memory sig = _act(id, "CHECKIN");
            vm.expectRevert(TabellaRegistry.DatedLetter.selector);
            reg.checkIn(id, ownerPk, sig);
        }
        vm.warp(when_);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Released));
    }

    // ---------------------------------------------------------------- cancel

    function test_theOwnerCanCancelBeforeTheDate() public {
        uint64 when_ = uint64(T0 + 365 days);
        uint256 id = _createDated(when_);
        vm.warp(when_ - 1);
        bytes memory sig = _act(id, "CANCEL");
        vm.expectEmit(true, false, false, false);
        emit Cancelled(id);
        reg.cancel(id, ownerPk, sig);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Cancelled));
        assertEq(reg.getLetter(id).nonce, 2);
        // it stays cancelled when the date passes, and nothing can be published
        vm.warp(when_ + 1 days);
        assertEq(uint8(reg.status(id)), uint8(TabellaRegistry.Status.Cancelled));
        vm.prank(postman);
        vm.expectRevert(TabellaRegistry.NotReleased.selector);
        reg.publishPartB(id, bytes("x"));
    }

    function test_cancelNeedsTheOwnersSignature() public {
        uint256 id = _createDated(uint64(T0 + 365 days));
        bytes memory strangerSig = _sig(strangerPk, _msg(id, "CANCEL", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.WrongKey.selector);
        reg.cancel(id, strangerPk, strangerSig);
        bytes memory wrongAction = _sig(ownerPk, _msg(id, "CHECKIN", 1, keccak256("")));
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.cancel(id, ownerPk, wrongAction);
    }

    function test_cancelIsTooLateOnceTheDateHasCome() public {
        uint64 when_ = uint64(T0 + 100);
        uint256 id = _createDated(when_);
        vm.warp(when_);
        bytes memory sig = _act(id, "CANCEL");
        vm.expectRevert(TabellaRegistry.NotOpen.selector);
        reg.cancel(id, ownerPk, sig);
    }

    // ------------------------------------------------------ creation checks

    function test_theDateMustBeInTheFuture() public {
        vm.expectRevert(TabellaRegistry.BadDate.selector);
        this.createDatedRaw(uint64(T0));
        vm.expectRevert(TabellaRegistry.BadDate.selector);
        this.createDatedRaw(uint64(T0 - 1));
        vm.expectRevert(TabellaRegistry.BadDate.selector);
        this.createDatedRaw(0);
        // one second ahead is the smallest allowed
        this.createDatedRaw(uint64(T0 + 1));
    }

    function test_theDateIsAtMostFiftyYearsAhead() public {
        assertEq(reg.MAX_DATED_AHEAD(), 18_263 days); // 50 calendar years, leap days included
        assertGe(reg.MAX_DATED_AHEAD(), 50 * 365 days + 12 days);
        this.createDatedRaw(uint64(T0 + 18_263 days)); // the limit itself: fine
        vm.expectRevert(TabellaRegistry.BadDate.selector);
        this.createDatedRaw(uint64(T0 + 18_263 days + 1));
        vm.expectRevert(TabellaRegistry.BadDate.selector);
        this.createDatedRaw(type(uint64).max);
    }

    /// external so vm.expectRevert can wrap the whole signed call
    function createDatedRaw(uint64 releaseAt) external returns (uint256) {
        return _createDated(releaseAt);
    }

    function test_heirsAreChecked() public {
        address[] memory none = new address[](0);
        vm.expectRevert(TabellaRegistry.BadHeirs.selector);
        this.createWithHeirs(none);
        address[] memory four = new address[](4);
        for (uint256 i = 0; i < 4; i++) four[i] = address(uint160(0x100 + i));
        vm.expectRevert(TabellaRegistry.BadHeirs.selector);
        this.createWithHeirs(four);
        address[] memory zero = new address[](1);
        vm.expectRevert(TabellaRegistry.BadHeirs.selector);
        this.createWithHeirs(zero);
        address[] memory three = new address[](3);
        for (uint256 i = 0; i < 3; i++) three[i] = address(uint160(0x200 + i));
        this.createWithHeirs(three);
    }

    function createWithHeirs(address[] memory heirs) external returns (uint256) {
        return _createDatedWith(heirs, uint64(T0 + 1 days), "CREATE_DATED", ownerPk);
    }

    function test_blobsAreChecked() public {
        address[] memory heirs = _heirs();
        bytes memory big = new bytes(8193);
        bytes memory ok = bytes("x");
        vm.expectRevert(TabellaRegistry.Empty.selector);
        reg.createDatedLetter(heirs, uint64(T0 + 10), "", ok, ok, ownerPk, ok);
        vm.expectRevert(TabellaRegistry.Empty.selector);
        reg.createDatedLetter(heirs, uint64(T0 + 10), ok, "", ok, ownerPk, ok);
        vm.expectRevert(TabellaRegistry.TooLarge.selector);
        reg.createDatedLetter(heirs, uint64(T0 + 10), ok, ok, big, ownerPk, ok);
    }

    function test_aSignatureForTheOrdinaryCreateCannotCreateADatedLetter() public {
        address[] memory heirs = _heirs();
        uint64 when_ = uint64(T0 + 1 days);
        bytes memory ct = bytes("ciphertext");
        bytes memory a = bytes("partA-envelope");
        bytes memory b = bytes("partB-for-postman");
        bytes memory wrong = _sig(ownerPk, _msg(1, "CREATE", 0, _datedPayload(heirs, when_, ct, a, b)));
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.createDatedLetter(heirs, when_, ct, a, b, ownerPk, wrong);
    }

    function test_theSignatureBindsTheDate() public {
        address[] memory heirs = _heirs();
        bytes memory ct = bytes("ciphertext");
        bytes memory a = bytes("partA-envelope");
        bytes memory b = bytes("partB-for-postman");
        bytes memory sig = _sig(ownerPk, _msg(1, "CREATE_DATED", 0, _datedPayload(heirs, uint64(T0 + 1 days), ct, a, b)));
        // a relayer swapping in a different date breaks the signature
        vm.expectRevert(TabellaRegistry.InvalidSignature.selector);
        reg.createDatedLetter(heirs, uint64(T0 + 2 days), ct, a, b, ownerPk, sig);
    }

    function test_idsKeepCountingAcrossBothKinds() public {
        assertEq(_createDated(uint64(T0 + 10)), 1);
        assertEq(_createDated(uint64(T0 + 20)), 2);
        assertEq(reg.letterCount(), 2);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_opensExactlyAtTheDate(uint64 ahead, uint64 probe) public {
        ahead = uint64(bound(ahead, 1, 18_263 days));
        uint64 when_ = uint64(T0 + ahead);
        uint256 id = _createDated(when_);
        probe = uint64(bound(probe, 0, 60 * 365 days));
        vm.warp(T0 + probe);
        TabellaRegistry.Status expected = T0 + probe < when_ ? TabellaRegistry.Status.Active : TabellaRegistry.Status.Released;
        assertEq(uint8(reg.status(id)), uint8(expected));
    }
}
