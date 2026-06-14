import 'server-only'
import { getKv } from './kv'
import { isUserRole, type Profile } from '@/lib/profile'

// One KV record per Privy user id (a DID like did:privy:...). Uses the same
// getKv() that backs violation/clock state, so it inherits the in-memory
// fallback when KV_REST_API_* env is absent (local dev / tests).
const keyFor = (userId: string) => `profile:${userId}`

export async function getProfile(userId: string): Promise<Profile | null> {
  return (await getKv()).get<Profile>(keyFor(userId))
}

export async function setProfile(p: Profile): Promise<Profile> {
  if (!p.userId) throw new Error('Missing userId')
  if (!isUserRole(p.role)) throw new Error('Invalid role')
  const clean: Profile = { userId: p.userId, role: p.role, ...(p.email ? { email: p.email } : {}) }
  await (await getKv()).set(keyFor(p.userId), clean)
  return clean
}
