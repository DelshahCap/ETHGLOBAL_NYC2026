import 'server-only'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, RPC_URL } from '@/lib/chain'
import { keyFor, type Role } from './keys'

export function accountFor(role: Role) {
  return privateKeyToAccount(keyFor(role))
}

export function walletFor(role: Role) {
  return createWalletClient({ account: accountFor(role), chain: arcTestnet, transport: http(RPC_URL) })
}
