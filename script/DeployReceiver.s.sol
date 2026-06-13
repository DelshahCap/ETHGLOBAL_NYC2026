// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EscrowVaultReceiver} from "../src/EscrowVaultReceiver.sol";

interface IEscrowVaultAdmin {
    function setOracle(address oracle) external;
    function oracle() external view returns (address);
}

/// @notice Deploys EscrowVaultReceiver wired to the Arc testnet CRE forwarder, then
///         registers it as the EscrowVault oracle (caller must be the vault owner).
///         Set SIM=true to use the simulation MockKeystoneForwarder; default is the
///         production KeystoneForwarder. Override any value via FORWARDER / VAULT env.
///         Forwarder addresses from the CRE Forwarder Directory:
///         https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory
contract DeployReceiver is Script {
    // Arc testnet — chain id 5042002, chain selector "arc-testnet" (3034092155422581607).
    address constant ARC_MOCK_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1; // simulation (MockKeystoneForwarder)
    address constant ARC_KEYSTONE_FORWARDER = 0x76c9cf548b4179F8901cda1f8623568b58215E62; // production (KeystoneForwarder)

    address constant ESCROW_VAULT = 0x83B757a2DB265c185Ed837564fC3b3de3052CF3D;

    function run() external {
        bool sim = vm.envOr("SIM", false);
        address forwarder = vm.envOr("FORWARDER", sim ? ARC_MOCK_FORWARDER : ARC_KEYSTONE_FORWARDER);
        address vault = vm.envOr("VAULT", ESCROW_VAULT);

        vm.startBroadcast();
        EscrowVaultReceiver receiver = new EscrowVaultReceiver(forwarder, vault);
        // Hand the oracle role to the receiver so CRE-delivered statuses settle escrows.
        IEscrowVaultAdmin(vault).setOracle(address(receiver));
        vm.stopBroadcast();

        console2.log("Mode:             ", sim ? "MockKeystoneForwarder (sim)" : "KeystoneForwarder (prod)");
        console2.log("Forwarder:        ", forwarder);
        console2.log("EscrowVault:      ", vault);
        console2.log("EscrowVaultRecv:  ", address(receiver));
    }
}
