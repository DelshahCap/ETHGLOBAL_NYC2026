'use client'
import { useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom } from 'viem'
import { arcTestnet } from '@/lib/chain'
import type { WriteWallet } from '@/lib/escrow-actions'

// Adapts the connected Privy embedded wallet into a viem WalletClient the
// escrow-actions layer can sign with. useWallets() returns Ethereum wallets only.
export function useEscrowWallet() {
  const { wallets } = useWallets()
  const wallet = wallets[0]
  const address = wallet?.address as `0x${string}` | undefined

  async function getWriteWallet(): Promise<WriteWallet> {
    if (!wallet || !address) throw new Error('No wallet connected')
    const provider = await wallet.getEthereumProvider()
    const client = createWalletClient({ account: address, chain: arcTestnet, transport: custom(provider) })
    return client as unknown as WriteWallet
  }

  return { address, ready: !!wallet, getWriteWallet }
}
