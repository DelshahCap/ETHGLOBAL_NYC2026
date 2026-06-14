import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { listBids, addBid } from '@/lib/server/bids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/bids[?row=N] — list all bids, or just those for one violation row.
export async function GET(req: Request) {
  const row = new URL(req.url).searchParams.get('row')
  try {
    const all = await listBids()
    return NextResponse.json(row != null ? all.filter((b) => String(b.row) === row) : all)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/bids — a contractor proposes a fee to fix a violation.
export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => ({}))) as {
      row?: number; violationId?: string; contractor?: string; contractorEmail?: string; fee?: string | number
    }
    if (typeof b.row !== 'number') return NextResponse.json({ error: 'row required' }, { status: 400 })
    if (!b.violationId) return NextResponse.json({ error: 'violationId required' }, { status: 400 })
    if (!b.contractor || !isAddress(b.contractor)) return NextResponse.json({ error: 'A valid contractor wallet is required' }, { status: 400 })
    if (b.fee == null || !(Number(b.fee) > 0)) return NextResponse.json({ error: 'A positive fee is required' }, { status: 400 })
    const bid = await addBid({
      row: b.row,
      violationId: String(b.violationId),
      contractor: b.contractor,
      contractorEmail: b.contractorEmail,
      fee: String(b.fee),
    })
    return NextResponse.json(bid)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
