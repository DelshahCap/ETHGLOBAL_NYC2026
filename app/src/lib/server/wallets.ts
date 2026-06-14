import 'server-only'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, RPC_URL } from '@/lib/chain'
import { keyFor, faucetKey, type Role } from './keys'

export function accountFor(role: Role) {
  return privateKeyToAccount(keyFor(role))
}

export function walletFor(role: Role) {
  return createWalletClient({ account: accountFor(role), chain: arcTestnet, transport: http(RPC_URL) })
}

// Wallet client for the demo faucet account. Throws if FAUCET_PRIVATE_KEY is
// unset so the route can return a clear "not configured" response.
export function faucetWallet() {
  const key = faucetKey()
  if (!key) throw new Error('FAUCET_PRIVATE_KEY not set')
  return createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnet, transport: http(RPC_URL) })
}
