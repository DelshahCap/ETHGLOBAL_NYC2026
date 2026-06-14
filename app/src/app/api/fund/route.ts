import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { publicClient } from '@/lib/chain'
import { USDC, erc20Abi } from '@/lib/contracts'
import { faucetWallet } from '@/lib/server/wallets'
import { faucetKey } from '@/lib/server/keys'
import { toMicro } from '@/lib/usdc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-app faucet: transfers test USDC from the funded FAUCET_PRIVATE_KEY account
// to a user's Privy wallet so they can pay gas (USDC is the gas token on Arc)
// and fund an escrow. Demo-only and unauthenticated like the other tx routes —
// capped per request to limit drain. FIXME: add an auth check before public use.
const DEFAULT_USDC = '5'
const MAX_USDC = 25

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { to?: string; amount?: string | number }
  if (!b.to || !isAddress(b.to)) {
    return NextResponse.json({ error: 'A valid recipient address is required' }, { status: 400 })
  }
  let amount: bigint
  try {
    amount = toMicro(String(b.amount ?? DEFAULT_USDC))
  } catch {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }
  if (amount <= 0n) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
  if (amount > toMicro(String(MAX_USDC))) {
    return NextResponse.json({ error: `Max ${MAX_USDC} USDC per request` }, { status: 400 })
  }
  if (!faucetKey()) {
    return NextResponse.json({ error: 'Faucet not configured — set FAUCET_PRIVATE_KEY' }, { status: 503 })
  }
  try {
    const wallet = faucetWallet()
    const hash = await wallet.writeContract({
      address: USDC, abi: erc20Abi, functionName: 'transfer', args: [b.to as `0x${string}`, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    return NextResponse.json({ hash })
  } catch (e) {
    const err = e as { shortMessage?: string; message?: string }
    return NextResponse.json({ error: err.shortMessage ?? err.message ?? 'Faucet transfer failed' }, { status: 400 })
  }
}
