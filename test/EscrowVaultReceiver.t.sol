// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {IYieldSource} from "../src/IYieldSource.sol";
import {MockYieldSource} from "../src/MockYieldSource.sol";
import {EscrowVaultReceiver} from "../src/EscrowVaultReceiver.sol";
import {IReceiver} from "../src/cre/IReceiver.sol";
import {MockUSDC} from "./EscrowVault.t.sol";

/// @dev Stand-in for the Arc forwarder: relays a report to the receiver so that
///      `msg.sender` on `onReport` is this contract (which the receiver trusts).
contract MockForwarder {
    function deliver(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReceiver(receiver).onReport(metadata, report);
    }
}

contract EscrowVaultReceiverTest is Test {
    MockUSDC usdc;
    MockYieldSource yieldSource;
    EscrowVault vault;
    MockForwarder forwarder;
    EscrowVaultReceiver receiver;

    address tenant = makeAddr("tenant");
    address landlord = makeAddr("landlord");
    address contractor = makeAddr("contractor");
    address payer = makeAddr("payer");

    uint256 constant PRINCIPAL = 1_000e6;
    uint256 constant FEE = 200e6;
    uint256 constant YIELD = 50e6;
    uint256 constant VIOLATION_ID = 123456;

    // EscrowVault.Status as uint8 (the report payload type)
    uint8 constant CLOSED = 1;
    uint8 constant DISMISSED = 2;

    function setUp() public {
        usdc = new MockUSDC();
        yieldSource = new MockYieldSource(IERC20(address(usdc)));
        // Deploy the vault with a throwaway oracle, then hand the role to the receiver.
        vault = new EscrowVault(IERC20(address(usdc)), IYieldSource(address(yieldSource)), address(this));
        yieldSource.setVault(address(vault));

        forwarder = new MockForwarder();
        receiver = new EscrowVaultReceiver(address(forwarder), address(vault));

        // The receiver becomes the vault's authorized oracle.
        vault.setOracle(address(receiver));
        assertEq(vault.oracle(), address(receiver));
    }

    // --- helpers ---

    function _createAndFund(uint256 fee) internal returns (uint256 id) {
        id = vault.createEscrow(tenant, landlord, contractor, VIOLATION_ID, fee);
        usdc.mint(payer, PRINCIPAL);
        vm.startPrank(payer);
        usdc.approve(address(vault), PRINCIPAL);
        vault.fund(id, PRINCIPAL);
        vm.stopPrank();
        usdc.mint(address(yieldSource), YIELD); // simulate pooled yield
    }

    /// @dev Deliver an (id, status) report through the forwarder, as the DON would.
    function _report(uint256 id, uint8 status) internal {
        bytes memory report = abi.encode(id, status);
        forwarder.deliver(address(receiver), "", report);
    }

    // --- tests ---

    function test_ReportClosedSettlesContractorLandlordTenant() public {
        uint256 id = _createAndFund(FEE);

        _report(id, CLOSED);

        assertEq(vault.withdrawable(contractor), FEE, "contractor = fee");
        assertEq(vault.withdrawable(landlord), PRINCIPAL - FEE, "landlord = principal - fee");
        assertEq(vault.withdrawable(tenant), YIELD, "tenant = yield");

        (,,,,,,, EscrowVault.Status status,, bool settled) = vault.escrows(id);
        assertEq(uint8(status), CLOSED, "status Closed");
        assertTrue(settled, "settled");
    }

    function test_ReportDismissedSettlesLandlordFullPrincipal() public {
        uint256 id = _createAndFund(FEE);

        _report(id, DISMISSED);

        assertEq(vault.withdrawable(landlord), PRINCIPAL, "landlord = full principal");
        assertEq(vault.withdrawable(tenant), YIELD, "tenant = yield");
        assertEq(vault.withdrawable(contractor), 0, "contractor = 0 on Dismissed");

        (,,,,,,, EscrowVault.Status status,, bool settled) = vault.escrows(id);
        assertEq(uint8(status), DISMISSED, "status Dismissed");
        assertTrue(settled, "settled");
    }

    /// @dev Only the configured forwarder may deliver a report; a direct call reverts.
    function test_OnlyForwarderCanDeliver() public {
        uint256 id = _createAndFund(FEE);
        bytes memory report = abi.encode(id, CLOSED);

        vm.expectRevert(); // ReceiverTemplate.InvalidSender
        receiver.onReport("", report);

        // and the escrow is untouched
        (,,,,,,,,, bool settled) = vault.escrows(id);
        assertFalse(settled, "not settled by rejected call");
    }
}
