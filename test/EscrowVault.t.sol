// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {IYieldSource} from "../src/IYieldSource.sol";
import {MockYieldSource} from "../src/MockYieldSource.sol";

/// @dev Minimal 6-decimal USDC stand-in for tests.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract EscrowVaultTest is Test {
    MockUSDC usdc;
    MockYieldSource yieldSource;
    EscrowVault vault;

    address oracle = makeAddr("oracle");
    address tenant = makeAddr("tenant");
    address landlord = makeAddr("landlord");
    address contractor = makeAddr("contractor");
    address payer = makeAddr("payer"); // funds the escrow (e.g. tenant's rent payment)

    uint256 constant PRINCIPAL = 2_000e6; // 2,000 USDC (6 decimals)
    uint256 constant FEE = 500e6; // contractor fee on Closed
    uint256 constant YIELD = 30e6; // simulated yield
    uint256 constant VIOLATION_ID = 123456;

    function setUp() public {
        usdc = new MockUSDC();
        yieldSource = new MockYieldSource(IERC20(address(usdc)));
        vault = new EscrowVault(IERC20(address(usdc)), IYieldSource(address(yieldSource)), oracle);
        yieldSource.setVault(address(vault));
    }

    // --- helpers ---

    function _createAndFund(uint256 fee) internal returns (uint256 id) {
        id = vault.createEscrow(tenant, landlord, contractor, VIOLATION_ID, fee);
        usdc.mint(payer, PRINCIPAL);
        vm.startPrank(payer);
        usdc.approve(address(vault), PRINCIPAL);
        vault.fund(id, PRINCIPAL);
        vm.stopPrank();
    }

    function _simulateYield(uint256 amount) internal {
        // Extra USDC sitting in the yield source surfaces as accrued yield.
        usdc.mint(address(yieldSource), amount);
    }

    // --- tests ---

    function test_FundDepositsToYieldSource() public {
        uint256 id = _createAndFund(FEE);

        assertEq(usdc.balanceOf(address(yieldSource)), PRINCIPAL, "yield source holds principal");
        assertEq(yieldSource.totalShares(), PRINCIPAL, "shares minted 1:1 on first deposit");
        (,,,, uint256 principal,,,, bool funded, bool settled) = vault.escrows(id);
        assertEq(principal, PRINCIPAL);
        assertTrue(funded);
        assertFalse(settled);
    }

    function test_ClosedPaysContractorLandlordAndYieldToTenant() public {
        uint256 id = _createAndFund(FEE);
        _simulateYield(YIELD);

        vm.prank(oracle);
        vault.updateStatus(id, EscrowVault.Status.Closed);

        assertEq(vault.withdrawable(contractor), FEE, "contractor gets fee");
        assertEq(vault.withdrawable(landlord), PRINCIPAL - FEE, "landlord gets remainder");
        assertEq(vault.withdrawable(tenant), YIELD, "tenant gets yield");
    }

    function test_DismissedPaysLandlordAndYieldToTenant() public {
        uint256 id = _createAndFund(FEE);
        _simulateYield(YIELD);

        vm.prank(oracle);
        vault.updateStatus(id, EscrowVault.Status.Dismissed);

        assertEq(vault.withdrawable(landlord), PRINCIPAL, "landlord gets full principal");
        assertEq(vault.withdrawable(tenant), YIELD, "tenant gets yield");
        assertEq(vault.withdrawable(contractor), 0, "contractor gets nothing");
    }

    function test_OnlyOracleCanUpdateStatus() public {
        uint256 id = _createAndFund(FEE);

        vm.expectRevert(EscrowVault.NotOracle.selector);
        vm.prank(landlord);
        vault.updateStatus(id, EscrowVault.Status.Closed);
    }

    function test_OpenDoesNotSettle() public {
        uint256 id = _createAndFund(FEE);
        _simulateYield(YIELD);

        vm.prank(oracle);
        vault.updateStatus(id, EscrowVault.Status.Open);

        (,,,,,,,, bool funded, bool settled) = vault.escrows(id);
        assertTrue(funded);
        assertFalse(settled, "not settled while Open");
        assertEq(vault.withdrawable(tenant), 0);
        assertEq(vault.withdrawable(landlord), 0);
        // funds remain in the yield source
        assertEq(usdc.balanceOf(address(yieldSource)), PRINCIPAL + YIELD);
    }

    function test_WithdrawTransfersAndZeroesBalance() public {
        uint256 id = _createAndFund(FEE);
        _simulateYield(YIELD);

        vm.prank(oracle);
        vault.updateStatus(id, EscrowVault.Status.Dismissed);

        uint256 owed = vault.withdrawable(landlord);
        assertEq(owed, PRINCIPAL);

        vm.prank(landlord);
        vault.withdraw();

        assertEq(usdc.balanceOf(landlord), PRINCIPAL, "landlord received USDC");
        assertEq(vault.withdrawable(landlord), 0, "balance zeroed");

        // second withdraw reverts — nothing left
        vm.expectRevert(EscrowVault.NothingToWithdraw.selector);
        vm.prank(landlord);
        vault.withdraw();
    }

    /// @dev The point of share-based accounting: two concurrent escrows each redeem
    ///      their own principal + only their proportional slice of pooled yield.
    function test_MultiEscrowProportionalYield() public {
        address tenantA = makeAddr("tenantA");
        address landlordA = makeAddr("landlordA");
        address tenantB = makeAddr("tenantB");
        address landlordB = makeAddr("landlordB");

        uint256 pA = 1_000e6; // escrow A principal (25% of pool)
        uint256 pB = 3_000e6; // escrow B principal (75% of pool)
        uint256 pooledYield = 400e6;

        uint256 idA = vault.createEscrow(tenantA, landlordA, contractor, VIOLATION_ID, 0);
        uint256 idB = vault.createEscrow(tenantB, landlordB, contractor, VIOLATION_ID + 1, 0);

        usdc.mint(payer, pA + pB);
        vm.startPrank(payer);
        usdc.approve(address(vault), pA + pB);
        vault.fund(idA, pA);
        vault.fund(idB, pB);
        vm.stopPrank();

        // Yield accrues across the whole pool while both escrows are locked.
        _simulateYield(pooledYield);

        vm.prank(oracle);
        vault.updateStatus(idA, EscrowVault.Status.Dismissed);
        vm.prank(oracle);
        vault.updateStatus(idB, EscrowVault.Status.Dismissed);

        // Each landlord recovers full principal.
        assertEq(vault.withdrawable(landlordA), pA, "landlord A principal");
        assertEq(vault.withdrawable(landlordB), pB, "landlord B principal");

        // Yield split proportionally to principal: A 25%, B 75%.
        assertEq(vault.withdrawable(tenantA), pooledYield * pA / (pA + pB), "tenant A yield = 25%");
        assertEq(vault.withdrawable(tenantB), pooledYield * pB / (pA + pB), "tenant B yield = 75%");

        // No yield stranded across the two settlements.
        assertEq(
            vault.withdrawable(tenantA) + vault.withdrawable(tenantB),
            pooledYield,
            "all pooled yield distributed"
        );
    }
}
