// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./cre/ReceiverTemplate.sol";

/// @dev `status` is uint8 here, which is the ABI encoding of EscrowVault.Status
///      (Open=0, Closed=1, Dismissed=2). The selector of `updateStatus(uint256,uint8)`
///      therefore matches `updateStatus(uint256,Status)` on the vault.
interface IEscrowVault {
    function updateStatus(uint256 id, uint8 status) external;
}

/// @title EscrowVaultReceiver
/// @notice Chainlink CRE consumer contract for the HPD oracle. Receives DON-delivered
///         reports of the form abi.encode(uint256 id, uint8 status) via the Keystone
///         forwarder and posts the status to the EscrowVault as its authorized oracle.
///         Register with EscrowVault.setOracle(address(this)). See specs/cre-oracle.md.
contract EscrowVaultReceiver is ReceiverTemplate {
    IEscrowVault public immutable vault;

    event StatusReported(uint256 indexed id, uint8 status);

    /// @param forwarder The Chainlink forwarder (Arc KeystoneForwarder in prod,
    ///                  MockForwarder in simulation) — only it may call onReport.
    /// @param _vault    The EscrowVault this receiver posts statuses to.
    constructor(address forwarder, address _vault) ReceiverTemplate(forwarder) {
        vault = IEscrowVault(_vault);
    }

    /// @inheritdoc ReceiverTemplate
    /// @dev Called by ReceiverTemplate.onReport after the forwarder/workflow checks.
    function _processReport(bytes calldata report) internal override {
        (uint256 id, uint8 status) = abi.decode(report, (uint256, uint8));
        vault.updateStatus(id, status);
        emit StatusReported(id, status);
    }
}
