import 'server-only'
import { getKv } from './kv'
import { isUserRole, type Profile, type UserRole } from '@/lib/profile'

// One KV record per Privy user id (a DID like did:privy:...). Uses the same
// getKv() that backs violation/clock state, so it inherits the in-memory
// fallback when KV_REST_API_* env is absent (local dev / tests).
//
// NOTE: the in-memory fallback is per-process and does NOT survive across
// serverless invocations or redeploys — provision Vercel KV in production or
// profiles won't persist between requests.
const keyFor = (userId: string) => `profile:${userId}`

// KV has no key-scan in our wrapper, so we keep an explicit index of user ids
// to support listing all profiles for the admin panel.
const INDEX_KEY = 'profile:index'

export async function getProfile(userId: string): Promise<Profile | null> {
  return (await getKv()).get<Profile>(keyFor(userId))
}

export async function setProfile(p: Profile): Promise<Profile> {
  if (!p.userId) throw new Error('Missing userId')
  if (!isUserRole(p.role)) throw new Error('Invalid role')
  const clean: Profile = {
    userId: p.userId,
    role: p.role,
    ...(p.email ? { email: p.email } : {}),
    ...(p.wallet ? { wallet: p.wallet } : {}),
  }
  const kv = await getKv()
  await kv.set(keyFor(p.userId), clean)
  const idx = (await kv.get<string[]>(INDEX_KEY)) ?? []
  if (!idx.includes(p.userId)) {
    idx.push(p.userId)
    await kv.set(INDEX_KEY, idx)
  }
  return clean
}

export async function listProfiles(): Promise<Profile[]> {
  const kv = await getKv()
  const idx = (await kv.get<string[]>(INDEX_KEY)) ?? []
  const rows = await Promise.all(idx.map((id) => kv.get<Profile>(keyFor(id))))
  return rows.filter((p): p is Profile => !!p)
}

// Resolves the escrow counterparties for the tenant's create flow from real
// sign-ups: the most recent landlord and contractor (by index order) that have a
// wallet. Lets the demo self-wire instead of relying on NEXT_PUBLIC_DEMO_* env.
export async function getParties(): Promise<{ landlord?: string; contractor?: string }> {
  const all = await listProfiles()
  const latestWallet = (role: UserRole) => {
    const matches = all.filter((p) => p.role === role && p.wallet)
    return matches.length ? matches[matches.length - 1].wallet : undefined
  }
  return { landlord: latestWallet('landlord'), contractor: latestWallet('contractor') }
}
