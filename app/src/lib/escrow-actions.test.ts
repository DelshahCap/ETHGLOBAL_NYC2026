import { describe, it, expect, vi } from 'vitest'

// Mock the shared chain client so the action layer's receipt-waits resolve
// without touching a network. parseEventLogs over [] yields no id.
vi.mock('@/lib/chain', () => ({
  publicClient: { waitForTransactionReceipt: vi.fn(async () => ({ logs: [] })) },
}))

import { createEscrow, fundEscrow, claim } from '@/lib/escrow-actions'
import { VAULT, USDC } from '@/lib/contracts'
import { publicClient } from '@/lib/chain'

function makeWallet() {
  const calls: Array<Record<string, unknown>> = []
  let n = 0
  return {
    calls,
    account: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    writeContract: vi.fn(async (args: Record<string, unknown>) => {
      calls.push(args)
      return `0x${(++n).toString(16).padStart(64, '0')}` as `0x${string}`
    }),
  }
}

const TENANT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const LANDLORD = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const
const CONTRACTOR = '0xcccccccccccccccccccccccccccccccccccccccc' as const

describe('escrow-actions write layer', () => {
  it('fundEscrow approves the vault, waits, then funds — in that order', async () => {
    const w = makeWallet()
    await fundEscrow(w, 5n, 1_000_000n)

    expect(w.calls).toHaveLength(2)
    expect(w.calls[0]).toMatchObject({ address: USDC, functionName: 'approve', args: [VAULT, 1_000_000n] })
    expect(w.calls[1]).toMatchObject({ address: VAULT, functionName: 'fund', args: [5n, 1_000_000n] })
    // each write is awaited to a receipt before the demo proceeds
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(2)
  })

  it('createEscrow encodes the 5 args (violationId coerced to BigInt)', async () => {
    const w = makeWallet()
    await createEscrow(w, { tenant: TENANT, landlord: LANDLORD, contractor: CONTRACTOR, violationId: '18100032', contractorFee: 300_000n })

    expect(w.calls[0]).toMatchObject({
      address: VAULT,
      functionName: 'createEscrow',
      args: [TENANT, LANDLORD, CONTRACTOR, 18100032n, 300_000n],
    })
  })

  it('claim calls withdraw() with no args', async () => {
    const w = makeWallet()
    await claim(w)
    expect(w.calls[0]).toMatchObject({ address: VAULT, functionName: 'withdraw', args: [] })
  })
})
