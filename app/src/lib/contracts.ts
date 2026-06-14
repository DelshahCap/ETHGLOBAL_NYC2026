export const VAULT = '0x83B757a2DB265c185Ed837564fC3b3de3052CF3D' as const
export const YIELD_SOURCE = '0xB61090E2e397Cd7bda07be495A0554a7b6780736' as const
export const USDC = '0x3600000000000000000000000000000000000000' as const

export type StatusName = 'Open' | 'Closed' | 'Dismissed'
export const STATUS_TO_NUM: Record<StatusName, number> = { Open: 0, Closed: 1, Dismissed: 2 }
export const NUM_TO_STATUS: StatusName[] = ['Open', 'Closed', 'Dismissed']

export const escrowVaultAbi = [
  { type: 'function', name: 'nextEscrowId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'yieldSource', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'withdrawable', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'escrows', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'tenant', type: 'address' }, { name: 'landlord', type: 'address' },
      { name: 'contractor', type: 'address' }, { name: 'violationId', type: 'uint256' },
      { name: 'principal', type: 'uint256' }, { name: 'shares', type: 'uint256' },
      { name: 'contractorFee', type: 'uint256' }, { name: 'status', type: 'uint8' },
      { name: 'funded', type: 'bool' }, { name: 'settled', type: 'bool' },
    ],
  },
  {
    type: 'function', name: 'createEscrow', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tenant', type: 'address' }, { name: 'landlord', type: 'address' },
      { name: 'contractor', type: 'address' }, { name: 'violationId', type: 'uint256' },
      { name: 'contractorFee', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  { type: 'function', name: 'fund', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'updateStatus', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'status', type: 'uint8' }], outputs: [] },
  { type: 'function', name: 'setOracle', stateMutability: 'nonpayable', inputs: [{ name: 'oracle', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setYieldSource', stateMutability: 'nonpayable', inputs: [{ name: 'yieldSource', type: 'address' }], outputs: [] },
  { type: 'event', name: 'EscrowCreated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'tenant', type: 'address', indexed: true }, { name: 'violationId', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Funded', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'StatusUpdated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'status', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'Settled', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'status', type: 'uint8', indexed: false }] },
  { type: 'event', name: 'Withdrawn', inputs: [{ name: 'account', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
] as const

export const erc20Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export const mockYieldSourceAbi = [
  { type: 'function', name: 'totalAssets', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalShares', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const
