// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Share-based yield vault (minimal ERC-4626 shape): many escrows pool USDC
///         and each redeems its principal + proportional yield. Production drops in any
///         ERC-4626 vault; demo uses MockYieldSource.
interface IYieldSource {
    function deposit(uint256 assets) external returns (uint256 shares);
    function redeem(uint256 shares) external returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function totalAssets() external view returns (uint256);
}
