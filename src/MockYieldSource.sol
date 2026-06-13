// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IYieldSource} from "./IYieldSource.sol";

/// @notice Demo yield source: holds USDC, simulates yield via extra USDC sent in.
contract MockYieldSource is IYieldSource {
    IERC20 public immutable usdc;
    address public owner;
    address public vault;
    uint256 public principal;
    error NotOwner();
    error NotVault();
    constructor(IERC20 _usdc) { usdc = _usdc; owner = msg.sender; }
    function setVault(address _vault) external { if (msg.sender != owner) revert NotOwner(); vault = _vault; }
    modifier onlyVault() { if (msg.sender != vault) revert NotVault(); _; }
    function deposit(uint256 amount) external onlyVault { usdc.transferFrom(msg.sender, address(this), amount); principal += amount; }
    function withdraw(uint256 amount) external onlyVault { principal = principal >= amount ? principal - amount : 0; usdc.transfer(msg.sender, amount); }
    function totalAssets() external view returns (uint256) { return usdc.balanceOf(address(this)); }
    function accruedYield() external view returns (uint256) { uint256 b = usdc.balanceOf(address(this)); return b > principal ? b - principal : 0; }
}
