import 'server-only'
import { getKv } from './kv'
import type { Bid, NewBid } from '@/lib/bids'

// All bids in one KV record (demo scale). Accepting a bid flips it to 'accepted'
// and resets any other bid on the SAME violation row back to 'pending', so each
// violation has at most one accepted contractor.
const KEY = 'bids:all'

export async function listBids(): Promise<Bid[]> {
  return (await (await getKv()).get<Bid[]>(KEY)) ?? []
}

async function save(bids: Bid[]): Promise<void> {
  await (await getKv()).set(KEY, bids)
}

export async function addBid(input: NewBid): Promise<Bid> {
  const bids = await listBids()
  const bid: Bid = {
    ...input,
    contractor: input.contractor,
    id: globalThis.crypto.randomUUID(),
    status: 'pending',
    createdAt: Date.now(),
  }
  bids.push(bid)
  await save(bids)
  return bid
}

export async function acceptBid(id: string): Promise<Bid> {
  const bids = await listBids()
  const target = bids.find((b) => b.id === id)
  if (!target) throw new Error('Bid not found')
  for (const b of bids) {
    if (b.row === target.row) b.status = b.id === id ? 'accepted' : 'pending'
  }
  await save(bids)
  return target
}
