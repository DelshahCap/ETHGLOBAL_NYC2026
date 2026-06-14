import { NextResponse } from 'next/server'
import { getProfile, setProfile, listProfiles } from '@/lib/server/profiles'
import { isUserRole } from '@/lib/profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reads/writes the self-declared role for a Privy-authenticated user.
//
// DEMO SCOPE: the POST trusts the client-supplied userId and is unauthenticated,
// matching the other demo routes (/api/violation, /api/roles). In production this
// must verify the Privy access token server-side (verifyAuthToken) and derive the
// userId from it instead of the request body — see docs/app for the hardening note.

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  try {
    if (params.get('all')) return NextResponse.json(await listProfiles())
    const userId = params.get('userId')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    return NextResponse.json(await getProfile(userId))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string; role?: string; email?: string; wallet?: string }
    if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (!isUserRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    const saved = await setProfile({ userId: body.userId, role: body.role, email: body.email, wallet: body.wallet })
    return NextResponse.json(saved)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
