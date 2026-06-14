import { NextResponse } from 'next/server'
import { acceptBid } from '@/lib/server/bids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/bids/accept { id } — landlord accepts a contractor's bid. The
// accepted bid's contractor + fee then drive the tenant's escrow creation.
export async function POST(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string }
    if (!id) return NextResponse.json({ error: 'Bid id required' }, { status: 400 })
    return NextResponse.json(await acceptBid(id))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
