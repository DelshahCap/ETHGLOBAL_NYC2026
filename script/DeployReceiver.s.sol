// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EscrowVaultReceiver} from "../src/EscrowVaultReceiver.sol";

interface IEscrowVaultAdmin {
    function setOracle(address oracle) external;
    function oracle() external view returns (address);
}

/// @notice Deploys EscrowVaultReceiver wired to the Arc testnet simulation
///         MockKeystoneForwarder, registers it as the EscrowVault oracle, and asserts
///         the wiring on-chain. Broadcast with the arcDeployer keystore (the vault owner)
///         against https://rpc.testnet.arc.network.
///         Forwarder addresses from the CRE Forwarder Directory:
///         https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory
contract DeployReceiver is Script {
    // Arc testnet — chain id 5042002, chain selector "arc-testnet" (3034092155422581607).
    address constant ARC_MOCK_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1; // simulation (MockKeystoneForwarder)
    address constant ARC_KEYSTONE_FORWARDER = 0x76c9cf548b4179F8901cda1f8623568b58215E62; // production (KeystoneForwarder) — for reference

    address constant ESCROW_VAULT = 0x83B757a2DB265c185Ed837564fC3b3de3052CF3D;

    function run() external {
        vm.startBroadcast();
        EscrowVaultReceiver receiver = new EscrowVaultReceiver(ARC_MOCK_FORWARDER, ESCROW_VAULT);
        // No setExpectedWorkflowId / setExpectedAuthor: the MockForwarder supplies no
        // metadata in simulation, so only the forwarder-address check is enabled.
        IEscrowVaultAdmin(ESCROW_VAULT).setOracle(address(receiver));
        vm.stopBroadcast();

        // Read back and assert the oracle is now the receiver.
        address oracle = IEscrowVaultAdmin(ESCROW_VAULT).oracle();
        require(oracle == address(receiver), "oracle != receiver");

        console2.log("Forwarder (MockKeystone):", ARC_MOCK_FORWARDER);
        console2.log("EscrowVault:             ", ESCROW_VAULT);
        console2.log("EscrowVaultReceiver:     ", address(receiver));
        console2.log("vault.oracle():          ", oracle);
    }
}
