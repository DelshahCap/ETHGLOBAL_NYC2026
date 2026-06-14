import { publicClient } from '@/lib/chain'
import {
  VAULT,
  USDC,
  YIELD_SOURCE,
  escrowVaultAbi,
  erc20Abi,
  mockYieldSourceAbi,
  NUM_TO_STATUS,
} from '@/lib/contracts'

export type EscrowView = {
  id: number
  tenant: `0x${string}`
  landlord: `0x${string}`
  contractor: `0x${string}`
  violationId: bigint
  principal: bigint
  shares: bigint
  contractorFee: bigint
  status: number
  statusName: string
  funded: boolean
  settled: boolean
}

export async function readConfig() {
  const [oracle, owner, usdc, yieldSource, nextId] = await Promise.all([
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'oracle' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'owner' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'usdc' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'yieldSource' }),
    publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'nextEscrowId' }),
  ])
  return { oracle, owner, usdc, yieldSource, nextEscrowId: Number(nextId) }
}

export async function readEscrow(id: number): Promise<EscrowView> {
  // The `escrows` ABI has 10 separate named outputs.
  // viem v2 returns a readonly positional tuple (not a named-property object)
  // when outputs aren't uniformly wrapped in a struct. Use index destructuring.
  const r = await publicClient.readContract({
    address: VAULT,
    abi: escrowVaultAbi,
    functionName: 'escrows',
    args: [BigInt(id)],
  })
  const [
    tenant,
    landlord,
    contractor,
    violationId,
    principal,
    shares,
    contractorFee,
    status,
    funded,
    settled,
  ] = r
  // `status` is inferred as `number` from uint8; safe to use as NUM_TO_STATUS index.
  return {
    id,
    tenant,
    landlord,
    contractor,
    violationId,
    principal,
    shares,
    contractorFee,
    status,
    statusName: NUM_TO_STATUS[status] ?? String(status),
    funded,
    settled,
  }
}

export async function readWithdrawable(account: `0x${string}`) {
  return publicClient.readContract({
    address: VAULT,
    abi: escrowVaultAbi,
    functionName: 'withdrawable',
    args: [account],
  })
}

export async function readUsdcBalance(account: `0x${string}`) {
  return publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  })
}

export async function readYieldInfo() {
  const [totalAssets, totalShares] = await Promise.all([
    publicClient.readContract({
      address: YIELD_SOURCE,
      abi: mockYieldSourceAbi,
      functionName: 'totalAssets',
    }),
    publicClient.readContract({
      address: YIELD_SOURCE,
      abi: mockYieldSourceAbi,
      functionName: 'totalShares',
    }),
  ])
  return { totalAssets, totalShares }
}
