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

    struct Parties {
        address tenant;
        address landlord;
        address contractor;
    }

    /// @dev Distinct tenant/landlord/contractor addresses derived from a label.
    function _parties(string memory label) internal returns (Parties memory) {
        return Parties({
            tenant: makeAddr(string.concat(label, "-tenant")),
            landlord: makeAddr(string.concat(label, "-landlord")),
            contractor: makeAddr(string.concat(label, "-contractor"))
        });
    }

    /// @dev Total withdrawable credited to an escrow's three parties.
    function _credited(Parties memory p) internal view returns (uint256) {
        return vault.withdrawable(p.tenant) + vault.withdrawable(p.landlord) + vault.withdrawable(p.contractor);
    }

    /// @dev Fund an existing escrow with an arbitrary principal from the payer.
    function _fund(uint256 id, uint256 amount) internal {
        usdc.mint(payer, amount);
        vm.startPrank(payer);
        usdc.approve(address(vault), amount);
        vault.fund(id, amount);
        vm.stopPrank();
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

    /// @dev Two escrows funded together, settled one at a time: settling A must not
    ///      touch B's parties, and B's value stays in the pool until B settles.
    function test_MultipleEscrowsIsolatedYield() public {
        uint256 dust = 2; // integer-division tolerance (micro-USDC)
        Parties memory a = _parties("iso-a");
        Parties memory b = _parties("iso-b");
        uint256 pA = 1_000e6;
        uint256 feeA = 200e6;
        uint256 pB = 4_000e6;
        uint256 Y = 500e6; // pooled yield accrued while both are locked

        uint256 idA = vault.createEscrow(a.tenant, a.landlord, a.contractor, VIOLATION_ID, feeA);
        uint256 idB = vault.createEscrow(b.tenant, b.landlord, b.contractor, VIOLATION_ID + 1, 0);
        _fund(idA, pA);
        _fund(idB, pB);

        // Yield accrues across the pool; both funded at par, so split is by principal.
        _simulateYield(Y);
        uint256 expectedYieldA = Y * pA / (pA + pB);
        uint256 expectedYieldB = Y * pB / (pA + pB);

        // --- Settle A (Closed) ---
        vm.prank(oracle);
        vault.updateStatus(idA, EscrowVault.Status.Closed);

        assertEq(vault.withdrawable(a.contractor), feeA, "A contractor = fee");
        assertEq(vault.withdrawable(a.landlord), pA - feeA, "A landlord = principal - fee");
        assertApproxEqAbs(vault.withdrawable(a.tenant), expectedYieldA, dust, "A tenant = A's yield");

        // B's parties untouched; B's value still sitting in the pool.
        assertEq(vault.withdrawable(b.tenant), 0, "B tenant still zero");
        assertEq(vault.withdrawable(b.landlord), 0, "B landlord still zero");
        assertEq(vault.withdrawable(b.contractor), 0, "B contractor still zero");
        assertApproxEqAbs(yieldSource.totalAssets(), pB + expectedYieldB, dust, "B value remains pooled");

        // --- Settle B (Dismissed) ---
        vm.prank(oracle);
        vault.updateStatus(idB, EscrowVault.Status.Dismissed);

        assertEq(vault.withdrawable(b.landlord), pB, "B landlord = principal");
        assertApproxEqAbs(vault.withdrawable(b.tenant), expectedYieldB, dust, "B tenant = B's yield");

        // Isolation: settling B never altered A's credited balances.
        assertEq(vault.withdrawable(a.contractor), feeA, "A contractor unchanged");
        assertEq(vault.withdrawable(a.landlord), pA - feeA, "A landlord unchanged");
        assertEq(vault.withdrawable(b.contractor), 0, "B contractor never paid (Dismissed)");

        // Total credited across all parties ≈ total deposited + total yield.
        assertApproxEqAbs(_credited(a) + _credited(b), pA + pB + Y, dust, "credited ~= deposits + yield");
    }

    /// @dev Yield is attributed by time-in-pool, not equally: A is alone for the first
    ///      tranche of yield, so it captures all of it; B (joining later) earns nothing
    ///      from yield that accrued before it deposited.
    function test_YieldProportionalToDepositTiming() public {
        uint256 dust = 2;
        Parties memory a = _parties("time-a");
        Parties memory b = _parties("time-b");
        uint256 pA = 1_000e6;
        uint256 pB = 2_000e6;
        uint256 Y1 = 1_000e6; // accrues while ONLY A is in the pool
        uint256 Y2 = 800e6; // accrues after B joins

        uint256 idA = vault.createEscrow(a.tenant, a.landlord, a.contractor, VIOLATION_ID, 0);
        uint256 idB = vault.createEscrow(b.tenant, b.landlord, b.contractor, VIOLATION_ID + 1, 0);

        // A joins, early yield accrues while A is alone.
        _fund(idA, pA);
        _simulateYield(Y1);

        // B joins at the lifted share price (so B buys fewer shares per USDC),
        // then more yield accrues with both present.
        _fund(idB, pB);
        _simulateYield(Y2);

        // Expected: A = all of Y1 + A's time-weighted share of Y2; B = only its share of Y2.
        // With pA=1000, Y1=1000 (price 2.0), pB=2000 -> B mints 1000 shares; both hold
        // 1000 shares when Y2 accrues, so Y2 splits 50/50.
        uint256 expectedYieldA = Y1 + Y2 / 2;
        uint256 expectedYieldB = Y2 / 2;

        vm.prank(oracle);
        vault.updateStatus(idA, EscrowVault.Status.Dismissed);
        vm.prank(oracle);
        vault.updateStatus(idB, EscrowVault.Status.Dismissed);

        assertEq(vault.withdrawable(a.landlord), pA, "A landlord = principal");
        assertEq(vault.withdrawable(b.landlord), pB, "B landlord = principal");
        assertApproxEqAbs(vault.withdrawable(a.tenant), expectedYieldA, dust, "A captured early + shared yield");
        assertApproxEqAbs(vault.withdrawable(b.tenant), expectedYieldB, dust, "B earned only post-join yield");

        // B got NONE of the early yield: its yield is strictly below Y1 despite a
        // larger principal -> proves time-in-pool, not principal-share-of-total, drives it.
        assertLt(vault.withdrawable(b.tenant), Y1, "B excluded from pre-join yield");
        assertGt(vault.withdrawable(a.tenant), vault.withdrawable(b.tenant), "earlier depositor earns more");
    }
}
