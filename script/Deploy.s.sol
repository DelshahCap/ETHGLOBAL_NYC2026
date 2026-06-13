// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IYieldSource} from "../src/IYieldSource.sol";
import {MockYieldSource} from "../src/MockYieldSource.sol";
import {EscrowVault} from "../src/EscrowVault.sol";

/// @notice Deploys MockYieldSource + EscrowVault and wires them together.
///         USDC defaults to the Arc USDC predeploy; override via env for other chains.
///         ORACLE defaults to the broadcasting deployer (stand-in until CRE is wired).
contract Deploy is Script {
    // USDC on Arc (USDC-native L1, 6 decimals).
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address usdc = vm.envOr("USDC", ARC_USDC);
        address oracle = vm.envOr("ORACLE", msg.sender);

        vm.startBroadcast();

        MockYieldSource yieldSource = new MockYieldSource(IERC20(usdc));
        EscrowVault vault = new EscrowVault(IERC20(usdc), IYieldSource(address(yieldSource)), oracle);
        yieldSource.setVault(address(vault));

        vm.stopBroadcast();

        console2.log("USDC:         ", usdc);
        console2.log("Oracle:       ", oracle);
        console2.log("MockYieldSrc: ", address(yieldSource));
        console2.log("EscrowVault:  ", address(vault));
    }
}
