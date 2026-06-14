// Client-safe user-role model for Privy-authenticated people.
//
// NOTE: this is deliberately separate from src/lib/server/keys.ts `Role`
// ('tenant'|'landlord'|'contractor'|'oracle'), which names the four FIXED demo
// signing accounts held server-side. This `UserRole` is the self-declared role a
// real person picks at sign-up and is stored against their Privy identity.
export type UserRole = 'tenant' | 'landlord' | 'contractor'

export const USER_ROLES: UserRole[] = ['tenant', 'landlord', 'contractor']

export const ROLE_LABELS: Record<UserRole, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  contractor: 'Contractor',
}

export const ROLE_BLURB: Record<UserRole, string> = {
  tenant: 'I rent an apartment and pay rent into escrow while a violation is open.',
  landlord: 'I own the building and receive rent once the violation clears.',
  contractor: 'I correct violations and get paid on a verified fix.',
}

export function isUserRole(x: unknown): x is UserRole {
  return typeof x === 'string' && (USER_ROLES as string[]).includes(x)
}

export type Profile = { userId: string; role: UserRole; email?: string }

/* ---------- client helpers (talk to /api/profile) ---------- */

// Returns the stored profile for a Privy user id, or null if none exists yet
// (i.e. authenticated but hasn't picked a role — treat as needing sign-up step).
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const r = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`)
  if (!r.ok) return null
  return (await r.json()) as Profile | null
}

export async function saveProfile(p: Profile): Promise<Profile> {
  const r = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(p),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Could not save your profile')
  }
  return (await r.json()) as Profile
}
