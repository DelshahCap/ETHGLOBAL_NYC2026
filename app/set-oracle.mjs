// One-off admin action: point EscrowVault.oracle at the owner key itself so the
// relayer (the same key) can settle via /api/tx/updateStatus. NOT committed.
// Run from app/:  OWNER_PRIVATE_KEY=0xDON_KEY node set-oracle.mjs
import { createWalletClient, createPublicClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})
const VAULT = '0x83B757a2DB265c185Ed837564fC3b3de3052CF3D'
const abi = [
  { type: 'function', name: 'setOracle', stateMutability: 'nonpayable', inputs: [{ name: 'oracle', type: 'address' }], outputs: [] },
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
]

let key = process.env.OWNER_PRIVATE_KEY
if (!key) { console.error('Set OWNER_PRIVATE_KEY=0x... (Don’s deploy/owner key)'); process.exit(1) }
if (!key.startsWith('0x')) key = '0x' + key
const account = privateKeyToAccount(key)

const pub = createPublicClient({ chain: arc, transport: http() })
const owner = await pub.readContract({ address: VAULT, abi, functionName: 'owner' })
console.log('signer        :', account.address)
console.log('vault.owner() :', owner)
if (owner.toLowerCase() !== account.address.toLowerCase()) {
  console.error('ABORT: this key is not the vault owner — setOracle would revert NotOwner().')
  process.exit(1)
}

const wallet = createWalletClient({ account, chain: arc, transport: http() })
const hash = await wallet.writeContract({ address: VAULT, abi, functionName: 'setOracle', args: [account.address] })
console.log('setOracle tx  :', hash)
await pub.waitForTransactionReceipt({ hash })
const oracle = await pub.readContract({ address: VAULT, abi, functionName: 'oracle' })
console.log('new oracle    :', oracle, oracle.toLowerCase() === account.address.toLowerCase() ? '✓ now = your key' : '✗ unexpected')
console.log('\nNext: set ORACLE_PRIVATE_KEY = this same key in Vercel (and app/.env.local).')
