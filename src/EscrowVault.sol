// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IYieldSource} from "./IYieldSource.sol";

/// @title EscrowVault
/// @notice Holds rent in USDC while an NYC HPD violation is open. Releases only on an
///         oracle-posted HPD status. Yield accrued while locked goes to the tenant.
///         Chain: Arc (USDC-native). USDC handled via its ERC-20 interface (6 decimals).
contract EscrowVault {
    enum Status { Open, Closed, Dismissed } // mirrors HPD currentstatus outcomes

    struct Escrow {
        address tenant;
        address landlord;
        address contractor;
        uint256 violationId; // HPD ViolationID
        uint256 principal;   // USDC deposited (6 decimals)
        Status  status;
        bool    funded;
        bool    settled;
    }

    IERC20 public immutable usdc;     // 0x3600...0000 on Arc (6 decimals)
    IYieldSource public yieldSource;
    address public owner;             // admin/config
    address public oracle;            // CRE forwarder (or relayer) authorized to post status

    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) public escrows;
    mapping(address => uint256) public withdrawable; // pull-payment balances

    event EscrowCreated(uint256 indexed id, address indexed tenant, uint256 violationId);
    event Funded(uint256 indexed id, uint256 amount);
    event StatusUpdated(uint256 indexed id, Status status);
    event Settled(uint256 indexed id, Status status);
    event Withdrawn(address indexed account, uint256 amount);
    event OracleUpdated(address indexed oracle);
    event YieldSourceUpdated(address indexed yieldSource);

    error NotOwner();
    error NotOracle();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyOracle() { if (msg.sender != oracle) revert NotOracle(); _; }

    constructor(IERC20 _usdc, IYieldSource _yieldSource, address _oracle) {
        usdc = _usdc;
        yieldSource = _yieldSource;
        oracle = _oracle;
        owner = msg.sender;
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setYieldSource(IYieldSource _yieldSource) external onlyOwner {
        yieldSource = _yieldSource;
        emit YieldSourceUpdated(address(_yieldSource));
    }

    function createEscrow(address tenant, address landlord, address contractor, uint256 violationId)
        external returns (uint256 id)
    {
        revert("TODO: createEscrow"); // create record, status Open, emit EscrowCreated
    }

    function fund(uint256 id, uint256 amount) external {
        revert("TODO: fund"); // transferFrom USDC (6dp), deposit to yieldSource, mark funded
    }

    /// @notice Called by the CRE forwarder/relayer with the verified HPD status.
    function updateStatus(uint256 id, Status status) external onlyOracle {
        revert("TODO: updateStatus"); // record status; if terminal, _settle
    }

    function _settle(uint256 id) internal {
        // TODO: pull principal+yield from yieldSource; credit withdrawable[]:
        //       yield -> tenant always; Closed -> contractor + landlord; Dismissed -> landlord
    }

    /// @notice Pull-payment: each party claims its own balance, so one blocklisted
    ///         recipient can't brick the others (Arc reverts on blocklisted transfers).
    function withdraw() external {
        revert("TODO: withdraw"); // zero withdrawable[msg.sender], usdc.transfer, emit Withdrawn
    }
}
