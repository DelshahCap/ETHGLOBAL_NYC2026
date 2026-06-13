// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IYieldSource
/// @notice Abstraction over a yield-bearing destination for escrowed USDC.
///         Demo uses a MockYieldSource; production swaps in a real USDC vault.
interface IYieldSource {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function totalAssets() external view returns (uint256);
    function accruedYield() external view returns (uint256);
}
