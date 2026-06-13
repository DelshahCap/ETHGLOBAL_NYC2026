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
        uint256 violationId;   // HPD ViolationID
        uint256 principal;     // USDC deposited (6 decimals)
        uint256 contractorFee; // USDC paid to contractor on Closed (6 decimals)
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
    error EscrowNotFound();
    error AlreadyFunded();
    error NotFunded();
    error AlreadySettled();
    error NothingToWithdraw();

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

    function createEscrow(
        address tenant,
        address landlord,
        address contractor,
        uint256 violationId,
        uint256 contractorFee
    ) external returns (uint256 id) {
        id = nextEscrowId++;
        escrows[id] = Escrow({
            tenant: tenant,
            landlord: landlord,
            contractor: contractor,
            violationId: violationId,
            principal: 0,
            contractorFee: contractorFee,
            status: Status.Open,
            funded: false,
            settled: false
        });
        emit EscrowCreated(id, tenant, violationId);
    }

    function fund(uint256 id, uint256 amount) external {
        Escrow storage e = escrows[id];
        if (e.tenant == address(0)) revert EscrowNotFound();
        if (e.funded) revert AlreadyFunded();
        e.principal = amount;
        e.funded = true;
        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(yieldSource), amount);
        yieldSource.deposit(amount);
        emit Funded(id, amount);
    }

    /// @notice Called by the CRE forwarder/relayer with the verified HPD status.
    function updateStatus(uint256 id, Status status) external onlyOracle {
        Escrow storage e = escrows[id];
        if (!e.funded) revert NotFunded();
        if (e.settled) revert AlreadySettled();
        e.status = status;
        if (status == Status.Closed || status == Status.Dismissed) {
            _settle(id);
        } else {
            emit StatusUpdated(id, status);
        }
    }

    function _settle(uint256 id) internal {
        Escrow storage e = escrows[id];
        // Pull principal + yield back out of the yield source.
        uint256 yield = yieldSource.accruedYield();
        uint256 total = e.principal + yield;
        yieldSource.withdraw(total);

        // Yield always goes to the tenant.
        withdrawable[e.tenant] += yield;

        if (e.status == Status.Closed) {
            // Corrected: contractor takes its fee, landlord takes the remainder.
            withdrawable[e.contractor] += e.contractorFee;
            withdrawable[e.landlord] += e.principal - e.contractorFee;
        } else if (e.status == Status.Dismissed) {
            // Dismissed: full principal to the landlord.
            withdrawable[e.landlord] += e.principal;
        }

        e.settled = true;
        emit Settled(id, e.status);
    }

    /// @notice Pull-payment: each party claims its own balance, so one blocklisted
    ///         recipient can't brick the others (Arc reverts on blocklisted transfers).
    function withdraw() external {
        uint256 amt = withdrawable[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0; // checks-effects-interactions: zero before transfer
        usdc.transfer(msg.sender, amt);
        emit Withdrawn(msg.sender, amt);
    }
}
