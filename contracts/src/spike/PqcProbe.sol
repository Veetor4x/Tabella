// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @dev QoreChain PQC precompiles (active on testnet qorechain-diana, not on mainnet).
interface IQorePQC {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey);
}

/// @title PqcProbe
/// @notice Spike contract for Tabella risky-part test #2: proves an ML-DSA-87
///         signature made off-chain (in the browser) verifies in Solidity.
contract PqcProbe {
    IQorePQC internal constant PQC_VERIFY = IQorePQC(0x0000000000000000000000000000000000000a01);
    IQorePQC internal constant PQC_STATUS = IQorePQC(0x0000000000000000000000000000000000000a02);

    event Acted(address indexed sender, bytes32 indexed pubkeyHash, bytes32 messageHash);

    error InvalidSignature();

    /// @notice Read-only signature check.
    function check(bytes calldata pubkey, bytes calldata sig, bytes calldata message) external view returns (bool) {
        return PQC_VERIFY.pqcVerify(pubkey, sig, message);
    }

    /// @notice State-changing: reverts unless the signature is valid.
    function act(bytes calldata pubkey, bytes calldata sig, bytes calldata message) external {
        if (!PQC_VERIFY.pqcVerify(pubkey, sig, message)) revert InvalidSignature();
        emit Acted(msg.sender, keccak256(pubkey), keccak256(message));
    }

    /// @notice Whether `account` has a registered PQC key (wraps pqcKeyStatus).
    function keyStatus(address account) external view returns (bool registered, uint8 algorithmId, bytes memory pubkey) {
        return PQC_STATUS.pqcKeyStatus(account);
    }
}
