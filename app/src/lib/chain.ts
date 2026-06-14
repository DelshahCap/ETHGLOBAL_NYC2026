import { createPublicClient, defineChain, http } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 }, // USDC is the gas token
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
  testnet: true,
})

export const RPC_URL = 'https://rpc.testnet.arc.network'
export const EXPLORER = 'https://testnet.arcscan.app'
export const FAUCET = 'https://faucet.circle.com'

// Shared by client and server reads.
export const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
