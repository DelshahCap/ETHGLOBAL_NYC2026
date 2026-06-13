// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IYieldSource} from "./IYieldSource.sol";
/// @notice Demo share-based yield source. Pools USDC; yield is simulated by sending
///         extra USDC here, which lifts share value. Not for mainnet (no inflation-attack
///         guard). Shares round down (standard 4626 direction); dust stays in the pool.
contract MockYieldSource is IYieldSource {
    IERC20 public immutable usdc;
    address public owner;
    address public vault;
    uint256 public totalShares;
    error NotOwner();
    error NotVault();
    constructor(IERC20 _usdc) { usdc = _usdc; owner = msg.sender; }
    function setVault(address _vault) external { if (msg.sender != owner) revert NotOwner(); vault = _vault; }
    modifier onlyVault() { if (msg.sender != vault) revert NotVault(); _; }
    function deposit(uint256 assets) external onlyVault returns (uint256 shares) {
        uint256 supply = totalShares;
        uint256 bal = usdc.balanceOf(address(this)); // pool BEFORE this deposit
        shares = (supply == 0 || bal == 0) ? assets : (assets * supply) / bal;
        totalShares = supply + shares;
        usdc.transferFrom(msg.sender, address(this), assets);
    }
    function redeem(uint256 shares) external onlyVault returns (uint256 assets) {
        uint256 supply = totalShares;
        assets = (shares * usdc.balanceOf(address(this))) / supply;
        totalShares = supply - shares;
        usdc.transfer(msg.sender, assets);
    }
    function convertToAssets(uint256 shares) external view returns (uint256) {
        uint256 supply = totalShares;
        return supply == 0 ? 0 : (shares * usdc.balanceOf(address(this))) / supply;
    }
    function totalAssets() external view returns (uint256) { return usdc.balanceOf(address(this)); }
}
