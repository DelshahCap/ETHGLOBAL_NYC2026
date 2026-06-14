import { NextResponse } from 'next/server'
import { getParties } from '@/lib/server/profiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// { landlord?, contractor? } — the wallet addresses the tenant's escrow should
// name, resolved from the latest landlord/contractor sign-ups.
export async function GET() {
  try {
    return NextResponse.json(await getParties())
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
