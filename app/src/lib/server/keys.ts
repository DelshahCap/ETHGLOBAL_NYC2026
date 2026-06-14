import 'server-only'
import type { Hex } from 'viem'

export type Role = 'tenant' | 'landlord' | 'contractor' | 'oracle'
export const ROLES: Role[] = ['tenant', 'landlord', 'contractor', 'oracle']

const ENV_BY_ROLE: Record<Role, string> = {
  tenant: 'TENANT_PRIVATE_KEY',
  landlord: 'LANDLORD_PRIVATE_KEY',
  contractor: 'CONTRACTOR_PRIVATE_KEY',
  oracle: 'ORACLE_PRIVATE_KEY',
}

export function keyFor(role: Role): Hex {
  const v = process.env[ENV_BY_ROLE[role]]
  if (!v) throw new Error(`Missing env ${ENV_BY_ROLE[role]} for role "${role}"`)
  return (v.startsWith('0x') ? v : `0x${v}`) as Hex
}

export function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as string[]).includes(x)
}

// Dedicated funded account used by the in-app /api/fund faucet to top up
// users' Privy wallets with test USDC (which is also gas on Arc). Kept separate
// from the role keys so it can be a low-value, demo-only account. Returns null
// when unconfigured so the faucet can report "not set up" instead of crashing.
export function faucetKey(): Hex | null {
  const v = process.env.FAUCET_PRIVATE_KEY
  if (!v) return null
  return (v.startsWith('0x') ? v : `0x${v}`) as Hex
}
