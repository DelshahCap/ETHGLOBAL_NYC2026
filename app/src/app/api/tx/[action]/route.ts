import { NextResponse } from 'next/server'
import { parseEventLogs } from 'viem'
import { publicClient } from '@/lib/chain'
import { VAULT, USDC, YIELD_SOURCE, escrowVaultAbi, erc20Abi } from '@/lib/contracts'
import { walletFor } from '@/lib/server/wallets'
import { isRole, type Role } from '@/lib/server/keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = Record<string, unknown>

function roleFrom(b: Body, fallback: Role): Role {
  return isRole(b.role) ? b.role : fallback
}

// NOTE: internal dev/admin tool — no auth. This signs txs with server-held
// role keys. FIXME: add a shared-secret / auth check before any public deploy.
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params
  const b = (await req.json().catch(() => ({}))) as Body
  try {
    switch (action) {
      case 'createEscrow': {
        const wallet = walletFor(roleFrom(b, 'oracle'))
        const hash = await wallet.writeContract({
          address: VAULT, abi: escrowVaultAbi, functionName: 'createEscrow',
          args: [b.tenant as `0x${string}`, b.landlord as `0x${string}`, b.contractor as `0x${string}`,
                 BigInt(b.violationId as string), BigInt(b.contractorFee as string)],
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const logs = parseEventLogs({ abi: escrowVaultAbi, eventName: 'EscrowCreated', logs: receipt.logs })
        const id = logs[0]?.args.id?.toString() ?? null
        return NextResponse.json({ hash, id })
      }
      case 'fund': {
        const wallet = walletFor(roleFrom(b, 'tenant'))
        const id = BigInt(b.id as string)
        const amount = BigInt(b.amount as string)
        const approveHash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [VAULT, amount] })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        const fundHash = await wallet.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'fund', args: [id, amount] })
        await publicClient.waitForTransactionReceipt({ hash: fundHash })
        return NextResponse.json({ approveHash, fundHash })
      }
      case 'simulateYield': {
        const wallet = walletFor(roleFrom(b, 'landlord'))
        const amount = BigInt(b.amount as string)
        const hash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'transfer', args: [YIELD_SOURCE, amount] })
        await publicClient.waitForTransactionReceipt({ hash })
        return NextResponse.json({ hash })
      }
      case 'updateStatus': {
        const wallet = walletFor('oracle') // forced: updateStatus is onlyOracle
        const status = Number(b.status)
        if (!Number.isInteger(status) || status < 0 || status > 2) {
          return NextResponse.json({ error: 'status must be 0 (Open), 1 (Closed), or 2 (Dismissed)' }, { status: 400 })
        }
        const hash = await wallet.writeContract({
          address: VAULT, abi: escrowVaultAbi, functionName: 'updateStatus',
          args: [BigInt(b.id as string), status],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        return NextResponse.json({ hash })
      }
      case 'withdraw': {
        const wallet = walletFor(roleFrom(b, 'landlord'))
        const hash = await wallet.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: 'withdraw', args: [] })
        await publicClient.waitForTransactionReceipt({ hash })
        return NextResponse.json({ hash })
      }
      default:
        return NextResponse.json({ error: `unknown action "${action}"` }, { status: 404 })
    }
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; message?: string }
    return NextResponse.json({ error: err.shortMessage ?? err.message ?? 'tx failed' }, { status: 400 })
  }
}
