import { NextResponse } from 'next/server'
import { ROLES } from '@/lib/server/keys'
import { accountFor } from '@/lib/server/wallets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const out = Object.fromEntries(ROLES.map((r) => [r, accountFor(r).address]))
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
