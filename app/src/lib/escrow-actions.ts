import { parseEventLogs } from 'viem'
import { publicClient } from '@/lib/chain'
import { VAULT, USDC, escrowVaultAbi, erc20Abi } from '@/lib/contracts'

// Thin write layer over the EscrowVault, signed by whatever wallet the caller
// passes (a viem WalletClient backed by the connected Privy embedded wallet).
// The frontend only ever creates / funds / withdraws — it NEVER settles
// (updateStatus is the oracle/CRE path). See docs/FRONTEND_INTEGRATION_STEPS.md.

// Minimal structural type so a real viem WalletClient and a test fake both fit.
export interface WriteWallet {
  account: `0x${string}`
  // viem's writeContract is heavily generic; accept its args loosely here.
  writeContract(args: {
    address: `0x${string}`
    abi: unknown
    functionName: string
    args: readonly unknown[]
    account: `0x${string}`
  }): Promise<`0x${string}`>
}

export type CreateEscrowParams = {
  tenant: `0x${string}`
  landlord: `0x${string}`
  contractor: `0x${string}`
  violationId: string | bigint
  contractorFee: bigint
}

/** createEscrow — provisions an Open, unfunded escrow. Returns the new id (from EscrowCreated). */
export async function createEscrow(
  wallet: WriteWallet,
  p: CreateEscrowParams,
): Promise<{ hash: `0x${string}`; id: bigint | undefined }> {
  const hash = await wallet.writeContract({
    address: VAULT,
    abi: escrowVaultAbi,
    functionName: 'createEscrow',
    args: [p.tenant, p.landlord, p.contractor, BigInt(p.violationId), p.contractorFee],
    account: wallet.account,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const logs = parseEventLogs({ abi: escrowVaultAbi, eventName: 'EscrowCreated', logs: receipt.logs })
  return { hash, id: logs[0]?.args.id }
}

/** fundEscrow — approve the vault to pull USDC, wait, then fund (transferFrom). Caller must be the tenant. */
export async function fundEscrow(
  wallet: WriteWallet,
  id: bigint,
  amount: bigint,
): Promise<{ approveHash: `0x${string}`; fundHash: `0x${string}` }> {
  const approveHash = await wallet.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'approve',
    args: [VAULT, amount],
    account: wallet.account,
  })
  await publicClient.waitForTransactionReceipt({ hash: approveHash })
  const fundHash = await wallet.writeContract({
    address: VAULT,
    abi: escrowVaultAbi,
    functionName: 'fund',
    args: [id, amount],
    account: wallet.account,
  })
  await publicClient.waitForTransactionReceipt({ hash: fundHash })
  return { approveHash, fundHash }
}

/** claim — withdraw() pulls the caller's own withdrawable balance (pull-payment). */
export async function claim(wallet: WriteWallet): Promise<{ hash: `0x${string}` }> {
  const hash = await wallet.writeContract({
    address: VAULT,
    abi: escrowVaultAbi,
    functionName: 'withdraw',
    args: [],
    account: wallet.account,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return { hash }
}
