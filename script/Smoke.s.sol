// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EscrowVault} from "../src/EscrowVault.sol";

/// @notice Live end-to-end smoke test on Arc: createEscrow -> fund -> simulate yield ->
///         updateStatus(Dismissed) -> withdraw. Deployer plays tenant/landlord and oracle.
contract Smoke is Script {
    function run() external {
        IERC20 usdc = IERC20(vm.envOr("USDC", address(0x3600000000000000000000000000000000000000)));
        EscrowVault vault = EscrowVault(vm.envAddress("VAULT"));
        address mock = vm.envAddress("MOCK");
        uint256 principal = 1_000000; // 1 USDC (6dp)
        uint256 yield_    = 100000;   // 0.1 USDC simulated yield
        address me = msg.sender;

        vm.startBroadcast();
        uint256 id = vault.createEscrow(me, me, me, 999999, 0);
        usdc.approve(address(vault), principal);
        vault.fund(id, principal);
        usdc.transfer(mock, yield_);
        uint256 before = usdc.balanceOf(me);
        vault.updateStatus(id, EscrowVault.Status.Dismissed);
        vault.withdraw();
        uint256 afterBal = usdc.balanceOf(me);
        vm.stopBroadcast();

        console2.log("escrow id:", id);
        console2.log("withdraw inflow (USDC 6dp):", afterBal - before);
        console2.log("expected ~ principal + yield:", principal + yield_);
    }
}
