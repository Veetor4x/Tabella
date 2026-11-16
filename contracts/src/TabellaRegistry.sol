// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @dev QoreChain PQC precompiles (active on testnet qorechain-diana, NOT on mainnet).
interface IQorePQC {
    /// @notice ML-DSA-87 signature check. Never reverts on a bad signature, it returns false.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey);
}

/// @title TabellaRegistry
/// @notice A sealed letter that opens only if its owner goes quiet. The contract stores the
///         encrypted letter and the two key halves (Part A for heirs, Part B for the Postman),
///         and decides *when* the letter may be opened. It never touches money.
///
/// Every owner / guardian action carries that person's ML-DSA-87 public key and a signature.
/// The contract checks keccak256(pubkey) == the stored key hash, then pqcVerify(pubkey, sig, message).
/// A relayer can therefore submit the transaction (and pay gas) but cannot forge or alter an action.
///
/// Signed message (bytes handed to pqcVerify; build it exactly like this off-chain):
///   abi.encode("TABELLA_V1", block.chainid, address(this), letterId, action, nonce, keccak256(payload))
///   ABI types: (string, uint256, address, uint256, string, uint256, bytes32)
///   action  : "CREATE" | "CHECKIN" | "PAUSE" | "CANCEL"
///   nonce   : the letter's current nonce; it is incremented after every successful action
///             (CREATE signs nonce 0 for the id it is about to get, and leaves the letter at nonce 1)
///   payload : CHECKIN / PAUSE / CANCEL -> empty bytes
///             CREATE -> abi.encode(heirs, guardianKeyHash, quietPeriod, warningPeriod,
///                                  keccak256(letterCiphertext), keccak256(partAEnvelope),
///                                  keccak256(partBForPostman))
///
/// Time: timestamps only, never block numbers.
///   Active   : now <  lastCheckIn + quietPeriod
///   Warning  : now <  lastCheckIn + quietPeriod + warningPeriod
///   Released : otherwise
contract TabellaRegistry {
    // ---------------------------------------------------------------- types

    enum Status {
        Active,
        Warning,
        Released,
        Cancelled
    }

    struct Letter {
        bytes32 ownerKeyHash; // keccak256 of the owner's ML-DSA-87 public key (0 = letter does not exist)
        bytes32 guardianKeyHash; // 0 = no guardian
        address[] heirs; // QoreChain 0x addresses, 1 to 3
        uint64 quietPeriod; // seconds
        uint64 warningPeriod; // seconds
        uint64 lastCheckIn; // timestamp
        uint64 nonce; // replay protection, +1 after each signed action
        uint8 pausesUsed; // guardian pauses so far, max MAX_PAUSES
        bool cancelled;
        bool released; // set once, when the Postman publishes Part B
        bytes letterCiphertext; // AES-256-GCM, short text letters only
        bytes partAEnvelope; // QoreSeal envelope: Part A sealed to the heirs
        bytes partBForPostman; // QoreSeal envelope: Part B sealed to the Postman
        bytes partBForHeirs; // QoreSeal envelope: Part B sealed to the heirs, set on release
    }

    // ------------------------------------------------------------ constants

    IQorePQC internal constant PQC = IQorePQC(0x0000000000000000000000000000000000000a01);
    IQorePQC internal constant PQC_STATUS = IQorePQC(0x0000000000000000000000000000000000000a02);

    string internal constant DOMAIN = "TABELLA_V1";
    string internal constant ACTION_CREATE = "CREATE";
    string internal constant ACTION_CHECKIN = "CHECKIN";
    string internal constant ACTION_PAUSE = "PAUSE";
    string internal constant ACTION_CANCEL = "CANCEL";

    uint8 public constant MAX_PAUSES = 2;
    uint256 public constant MAX_HEIRS = 3;
    uint64 public constant MAX_PERIOD = 3650 days; // sanity cap, also rules out overflow
    uint256 public constant MAX_BYTES = 8192; // cap for every stored blob

    // ---------------------------------------------------------------- state

    address public immutable owner; // contract owner (deployer): may set the Postman
    address public postman; // the only address allowed to publish Part B
    uint256 public letterCount;

    mapping(uint256 => Letter) internal letters;

    // --------------------------------------------------------------- events

    event Created(
        uint256 indexed letterId, bytes32 indexed ownerKeyHash, address[] heirs, uint64 quietPeriod, uint64 warningPeriod
    );
    event CheckedIn(uint256 indexed letterId, uint64 at);
    event Paused(uint256 indexed letterId, uint8 pausesUsed, uint64 at);
    event Cancelled(uint256 indexed letterId);
    event PartBPublished(uint256 indexed letterId);
    event PostmanSet(address indexed postman);

    // --------------------------------------------------------------- errors

    error NotContractOwner();
    error NotPostman();
    error UnknownLetter();
    error BadHeirs();
    error BadPeriod();
    error TooLarge();
    error Empty();
    error WrongKey();
    error NoGuardian();
    error InvalidSignature();
    error NotOpen(); // action needs status Active or Warning
    error NotReleased();
    error AlreadyPublished();
    error PauseLimitReached();
    error ZeroAddress();

    // ---------------------------------------------------------- constructor

    constructor(address postman_) {
        if (postman_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        postman = postman_;
        emit PostmanSet(postman_);
    }

    // ---------------------------------------------------------------- admin

    function setPostman(address postman_) external {
        if (msg.sender != owner) revert NotContractOwner();
        if (postman_ == address(0)) revert ZeroAddress();
        postman = postman_;
        emit PostmanSet(postman_);
    }

    // -------------------------------------------------------------- letters

    /// @notice Create a letter. Anyone may submit it (a relayer pays gas); the owner's signature
    ///         binds every argument. The new letter's id is `letterCount + 1`.
    function createLetter(
        address[] calldata heirs,
        bytes32 guardianKeyHash,
        uint64 quietPeriod,
        uint64 warningPeriod,
        bytes calldata letterCiphertext,
        bytes calldata partAEnvelope,
        bytes calldata partBForPostman,
        bytes calldata ownerPubkey,
        bytes calldata sig
    ) external returns (uint256 letterId) {
        // --- checks: input validation
        if (heirs.length == 0 || heirs.length > MAX_HEIRS) revert BadHeirs();
        for (uint256 i = 0; i < heirs.length; i++) {
            if (heirs[i] == address(0)) revert BadHeirs();
        }
        if (quietPeriod == 0 || warningPeriod == 0 || quietPeriod > MAX_PERIOD || warningPeriod > MAX_PERIOD) {
            revert BadPeriod();
        }
        _checkBlob(letterCiphertext);
        _checkBlob(partAEnvelope);
        _checkBlob(partBForPostman);

        // --- checks: signature (nonce is 0 for a letter that does not exist yet)
        letterId = letterCount + 1;
        bytes32 payloadHash = keccak256(
            abi.encode(
                heirs,
                guardianKeyHash,
                quietPeriod,
                warningPeriod,
                keccak256(letterCiphertext),
                keccak256(partAEnvelope),
                keccak256(partBForPostman)
            )
        );
        bytes memory message = _message(letterId, ACTION_CREATE, 0, payloadHash);
        if (!PQC.pqcVerify(ownerPubkey, sig, message)) revert InvalidSignature();

        // --- effects
        letterCount = letterId;
        bytes32 ownerKeyHash = keccak256(ownerPubkey);
        Letter storage l = letters[letterId];
        l.ownerKeyHash = ownerKeyHash;
        l.guardianKeyHash = guardianKeyHash;
        l.heirs = heirs;
        l.quietPeriod = quietPeriod;
        l.warningPeriod = warningPeriod;
        l.lastCheckIn = uint64(block.timestamp);
        l.nonce = 1;
        l.letterCiphertext = letterCiphertext;
        l.partAEnvelope = partAEnvelope;
        l.partBForPostman = partBForPostman;

        emit Created(letterId, ownerKeyHash, heirs, quietPeriod, warningPeriod);
    }

    /// @notice "I'm still here." Resets the clock. Works while Active and while in Warning.
    function checkIn(uint256 letterId, bytes calldata ownerPubkey, bytes calldata sig) external {
        Letter storage l = _open(letterId);
        _authorize(l, letterId, ACTION_CHECKIN, l.ownerKeyHash, ownerPubkey, sig);
        l.nonce++;
        l.lastCheckIn = uint64(block.timestamp);
        emit CheckedIn(letterId, uint64(block.timestamp));
    }

    /// @notice The guardian says "they're okay". Resets the clock, at most MAX_PAUSES times,
    ///         and only before the letter is Released.
    function guardianPause(uint256 letterId, bytes calldata guardianPubkey, bytes calldata sig) external {
        Letter storage l = _open(letterId);
        if (l.guardianKeyHash == bytes32(0)) revert NoGuardian();
        if (l.pausesUsed >= MAX_PAUSES) revert PauseLimitReached();
        _authorize(l, letterId, ACTION_PAUSE, l.guardianKeyHash, guardianPubkey, sig);
        l.nonce++;
        l.pausesUsed++;
        l.lastCheckIn = uint64(block.timestamp);
        emit Paused(letterId, l.pausesUsed, uint64(block.timestamp));
    }

    /// @notice The owner withdraws the letter. Only before it is Released.
    function cancel(uint256 letterId, bytes calldata ownerPubkey, bytes calldata sig) external {
        Letter storage l = _open(letterId);
        _authorize(l, letterId, ACTION_CANCEL, l.ownerKeyHash, ownerPubkey, sig);
        l.nonce++;
        l.cancelled = true;
        emit Cancelled(letterId);
    }

    /// @notice The Postman hands Part B (re-sealed to the heirs) over once the letter is Released.
    function publishPartB(uint256 letterId, bytes calldata envelope) external {
        if (msg.sender != postman) revert NotPostman();
        Letter storage l = letters[letterId];
        if (l.ownerKeyHash == bytes32(0)) revert UnknownLetter();
        if (_status(l) != Status.Released) revert NotReleased();
        if (l.released) revert AlreadyPublished();
        _checkBlob(envelope);

        l.released = true;
        l.partBForHeirs = envelope;
        emit PartBPublished(letterId);
    }

    // ---------------------------------------------------------------- views

    function status(uint256 letterId) external view returns (Status) {
        Letter storage l = letters[letterId];
        if (l.ownerKeyHash == bytes32(0)) revert UnknownLetter();
        return _status(l);
    }

    /// @notice Whether `account` has a registered post-quantum key (wraps pqcKeyStatus).
    ///         Drives the "quantum-safe ✓" badge. `algorithmId` is returned so the app can
    ///         check which kind of key it is.
    function heirKeyReady(address account) external view returns (bool registered, uint8 algorithmId) {
        (registered, algorithmId,) = PQC_STATUS.pqcKeyStatus(account);
    }

    function getLetter(uint256 letterId) external view returns (Letter memory) {
        Letter storage l = letters[letterId];
        if (l.ownerKeyHash == bytes32(0)) revert UnknownLetter();
        return l;
    }

    /// @notice The exact bytes a signer must sign (see the contract header). The app's
    ///         shared crypto lib re-implements this off-chain and is tested against it.
    function actionMessage(uint256 letterId, string calldata action, uint256 nonce, bytes32 payloadHash)
        external
        view
        returns (bytes memory)
    {
        return _message(letterId, action, nonce, payloadHash);
    }

    // ------------------------------------------------------------- internal

    function _status(Letter storage l) internal view returns (Status) {
        if (l.cancelled) return Status.Cancelled;
        // Timestamps are the design (the brief forbids block numbers). Second-level validator
        // drift is irrelevant for periods measured in minutes to years.
        // forge-lint: disable-start(block-timestamp)
        uint256 quietEnds = uint256(l.lastCheckIn) + l.quietPeriod;
        if (block.timestamp < quietEnds) return Status.Active;
        if (block.timestamp < quietEnds + l.warningPeriod) return Status.Warning;
        return Status.Released;
        // forge-lint: disable-end(block-timestamp)
    }

    /// @dev Load a letter that exists and is still Active or Warning.
    function _open(uint256 letterId) internal view returns (Letter storage l) {
        l = letters[letterId];
        if (l.ownerKeyHash == bytes32(0)) revert UnknownLetter();
        Status s = _status(l);
        if (s != Status.Active && s != Status.Warning) revert NotOpen();
    }

    /// @dev key hash must match, then the signature must verify over the replay-safe message.
    function _authorize(
        Letter storage l,
        uint256 letterId,
        string memory action,
        bytes32 expectedKeyHash,
        bytes calldata pubkey,
        bytes calldata sig
    ) internal view {
        if (keccak256(pubkey) != expectedKeyHash) revert WrongKey();
        bytes memory message = _message(letterId, action, l.nonce, keccak256(""));
        if (!PQC.pqcVerify(pubkey, sig, message)) revert InvalidSignature();
    }

    function _message(uint256 letterId, string memory action, uint256 nonce, bytes32 payloadHash)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(DOMAIN, block.chainid, address(this), letterId, action, nonce, payloadHash);
    }

    function _checkBlob(bytes calldata b) internal pure {
        if (b.length == 0) revert Empty();
        if (b.length > MAX_BYTES) revert TooLarge();
    }
}
