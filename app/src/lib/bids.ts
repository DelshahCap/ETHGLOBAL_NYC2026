// Contractor bids on a violation fix. Bids are an app-level concept (the escrow
// contract has no on-chain bidding) stored in KV. The landlord accepts one bid
// per violation; the accepted bid's contractor + fee then feed the tenant's
// createEscrow, so the contractor is paid that fee on Closed settlement.
export type BidStatus = 'pending' | 'accepted'

export type Bid = {
  id: string
  row: number // catalog violation row (stable across open/closed)
  violationId: string // the open HPD number, for display
  contractor: string // contractor wallet address
  contractorEmail?: string
  fee: string // USDC, decimal string
  status: BidStatus
  createdAt: number
}

export type NewBid = {
  row: number
  violationId: string
  contractor: string
  contractorEmail?: string
  fee: string
}

export async function fetchBids(row?: number): Promise<Bid[]> {
  const q = row != null ? `?row=${row}` : ''
  const r = await fetch(`/api/bids${q}`)
  if (!r.ok) return []
  return (await r.json()) as Bid[]
}

export async function submitBid(input: NewBid): Promise<Bid> {
  const r = await fetch('/api/bids', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not submit bid')
  return (await r.json()) as Bid
}

export async function acceptBid(id: string): Promise<Bid> {
  const r = await fetch('/api/bids/accept', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
  })
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not accept bid')
  return (await r.json()) as Bid
}

// The accepted bid for a given catalog row, if any.
export function acceptedBidFor(bids: Bid[], row: number): Bid | undefined {
  return bids.find((b) => b.row === row && b.status === 'accepted')
}
