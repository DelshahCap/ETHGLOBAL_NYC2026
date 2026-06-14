# Frontend ↔ Backend Integration — Step by Step (for Nilesh)

How the Next.js + Privy frontend connects to the on-chain EscrowVault backend, end to
end. Every signature, field order, and event below is taken from
[`src/EscrowVault.sol`](../src/EscrowVault.sol) — the verified contract on Arc testnet.

This complements [`docs/INTEGRATION.md`](./INTEGRATION.md): that doc is the reference
(network, addresses, ABI, gotchas); this is the **sequence** — what the UI does at each
step of one escrow's life.

---

## The one thing to understand first: who does what

There are two actors, and the frontend is only one of them.

| Actor | What it does | Who runs it |
|---|---|---|
| **Frontend** (you) | Create escrow, fund it, read state, let parties withdraw | The UI / user wallets via Privy |
| **Oracle backend** (Don) | Watches live HPD status → CRE → forwarder → `updateStatus` → settle | Runs off-chain, no UI involvement |

**The frontend never calls `updateStatus`.** Settlement is triggered by the CRE oracle
when the real HPD violation closes. The UI's job is to *create/fund*, *observe* the
resulting `Settled` event, and *let people withdraw*. If you find yourself wiring a
"settle" button, stop — that's the backend's job.

---

## Connection basics

| | |
|---|---|
| Chain | Arc testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| USDC | `0x3600000000000000000000000000000000000000` — **6 decimals, and it's the gas token** |
| **EscrowVault** | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` |

Two rules that will bite if ignored:
- **USDC is 6 decimals.** `1 USDC = 1_000_000`. Use `parseUnits(x, 6)` / `formatUnits(x, 6)`, never 18.
- **USDC is the gas token on Arc.** A wallet needs USDC to pay gas. The Circle faucet (https://faucet.circle.com) funds both.

### viem clients with Privy

```ts
import { createPublicClient, http, custom, createWalletClient } from "viem"

const arc = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const

// Reads (no wallet needed)
export const publicClient = createPublicClient({ chain: arc, transport: http() })

// Writes — wallet comes from Privy's embedded/connected wallet provider
// const provider = await wallet.getEthereumProvider()  // Privy
export const walletClient = createWalletClient({ chain: arc, transport: custom(provider) })
```

---

## Minimal ABI the frontend needs

```ts
export const escrowVaultAbi = [
  // --- writes the UI makes ---
  { type: "function", name: "createEscrow", stateMutability: "nonpayable",
    inputs: [
      { name: "tenant", type: "address" },
      { name: "landlord", type: "address" },
      { name: "contractor", type: "address" },
      { name: "violationId", type: "uint256" },
      { name: "contractorFee", type: "uint256" },
    ], outputs: [{ name: "id", type: "uint256" }] },
  { type: "function", name: "fund", stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [], outputs: [] },

  // --- reads ---
  { type: "function", name: "nextEscrowId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "escrows", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "tenant", type: "address" },
      { name: "landlord", type: "address" },
      { name: "contractor", type: "address" },
      { name: "violationId", type: "uint256" },
      { name: "principal", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "contractorFee", type: "uint256" },
      { name: "status", type: "uint8" },     // 0 Open, 1 Closed, 2 Dismissed
      { name: "funded", type: "bool" },
      { name: "settled", type: "bool" },
    ] },
  { type: "function", name: "withdrawable", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },

  // --- events to watch ---
  { type: "event", name: "EscrowCreated",
    inputs: [{ name: "id", type: "uint256", indexed: true }, { name: "tenant", type: "address", indexed: true }, { name: "violationId", type: "uint256", indexed: false }] },
  { type: "event", name: "Funded",
    inputs: [{ name: "id", type: "uint256", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "Settled",
    inputs: [{ name: "id", type: "uint256", indexed: true }, { name: "status", type: "uint8", indexed: false }] },
  { type: "event", name: "Withdrawn",
    inputs: [{ name: "account", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
] as const

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const

export const VAULT = "0x83B757a2DB265c185Ed837564fC3b3de3052CF3D" as const
export const USDC  = "0x3600000000000000000000000000000000000000" as const
```

---

## Step 1 — Create an escrow

The UI collects the three parties, the HPD `violationId` the escrow tracks, and the
contractor fee, then calls `createEscrow`. The new id is `nextEscrowId` *before* the
call (ids start at 0 and increment).

```ts
// read the id this escrow will get, BEFORE creating
const id = await publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: "nextEscrowId" })

const hash = await walletClient.writeContract({
  address: VAULT, abi: escrowVaultAbi, functionName: "createEscrow",
  args: [tenant, landlord, contractor, BigInt(violationId), parseUnits(feeStr, 6)],
  account,
})
await publicClient.waitForTransactionReceipt({ hash })
// escrow `id` now exists with status Open, funded=false
```

> `violationId` is the real HPD ViolationID this escrow tracks (e.g. `18100032`). It is
> **baked into the escrow** and is what the oracle backend polls. The id you create here
> must match the one configured on the backend, or the oracle will watch a different
> violation. Coordinate this value with Don.

## Step 2 — Fund the escrow (TWO transactions)

Funding pulls USDC from the caller, so **the tenant's wallet must send these** and hold
the USDC. It's `approve` then `fund` — `fund` does a `transferFrom`, so it reverts
without the approve confirming first.

```ts
const amount = parseUnits(principalStr, 6)

// 2a) approve the vault to pull USDC
const approveHash = await walletClient.writeContract({
  address: USDC, abi: ERC20_ABI, functionName: "approve", args: [VAULT, amount], account,
})
await publicClient.waitForTransactionReceipt({ hash: approveHash }) // WAIT before funding

// 2b) fund
const fundHash = await walletClient.writeContract({
  address: VAULT, abi: escrowVaultAbi, functionName: "fund", args: [id, amount], account,
})
await publicClient.waitForTransactionReceipt({ hash: fundHash })
// escrow is now funded=true, status still Open — money locked, earning yield
```

Guard the UI against `contractorFee > amount` — the contract reverts `FeeExceedsPrincipal`.

## Step 3 — Show live escrow state (read + poll)

Read `escrows(id)` to render the card. The returned tuple is in struct order (see ABI).
While `funded && !settled && status == 0`, the escrow is locked and waiting on HPD.

```ts
const e = await publicClient.readContract({ address: VAULT, abi: escrowVaultAbi, functionName: "escrows", args: [id] })
const [tenant, landlord, contractor, violationId, principal, shares, contractorFee, status, funded, settled] = e
// status: 0 Open (locked) | 1 Closed | 2 Dismissed
```

## Step 4 — React to settlement (this is where the backend hands off to you)

You do **nothing** to cause settlement. When the real HPD violation closes, the oracle
backend posts the status and the vault settles, emitting `Settled(id, status)`. The UI
just watches for it (or polls `escrows(id).settled`).

```ts
publicClient.watchContractEvent({
  address: VAULT, abi: escrowVaultAbi, eventName: "Settled",
  onLogs: (logs) => {
    for (const log of logs) {
      const { id, status } = log.args  // status 1 Closed | 2 Dismissed
      refreshEscrow(id) // re-read escrows(id) + the three withdrawable balances
    }
  },
})
```

How the funds split on settle (so the UI can show the right amounts):
- **Yield** (always) → tenant.
- **Closed (1):** contractor gets `contractorFee`, landlord gets `principal − fee`.
- **Dismissed (2):** landlord gets the full `principal`. Contractor gets 0.

## Step 5 — Withdraw (pull-payment)

Settlement does **not** push USDC out — it credits a per-address `withdrawable` balance.
Each party claims their own by calling `withdraw()` from their own wallet. Show a "Claim"
button gated on `withdrawable(myAddress) > 0`.

```ts
const claimable = await publicClient.readContract({
  address: VAULT, abi: escrowVaultAbi, functionName: "withdrawable", args: [myAddress],
})
if (claimable > 0n) {
  const hash = await walletClient.writeContract({ address: VAULT, abi: escrowVaultAbi, functionName: "withdraw", args: [], account: myAddress })
  await publicClient.waitForTransactionReceipt({ hash })
}
```

`withdraw()` reverts `NothingToWithdraw` if the balance is 0 — gate the button on the read.

---

## Full lifecycle at a glance

```
UI: createEscrow(tenant, landlord, contractor, violationId, fee)   → EscrowCreated
UI: USDC.approve(vault, amount)  →  vault.fund(id, amount)          → Funded   (locked, Open)
          … escrow sits locked, earning yield, while HPD violation is open …
BACKEND (no UI): live HPD = Closed → CRE → forwarder → updateStatus → settle → Settled(id, 1)
UI: watch Settled → re-read escrows(id) + withdrawable balances
UI: each party calls withdraw()                                    → Withdrawn
```

## Sanity-check values from the verified end-to-end run

For escrow id 1 (violationId `18100032`, principal 1 USDC, fee 0.3 USDC), the oracle
settled it Closed. After settlement the reads were:

```
escrows(1).status  == 1 (Closed),  funded == true,  settled == true
withdrawable(contractor) == 300000   (0.3 USDC = the fee)
withdrawable(landlord)   == 700000   (0.7 USDC = principal − fee)
withdrawable(tenant)     == 0        (no yield in a clean pool)
```

Settling tx: `0xb1e32c18056744a838035fc87eb06b0894d90140f2929f916815faa1d43ed867`.
If the UI reads these same numbers for escrow 1, your contract wiring is correct.

## Common reverts (so the UI can message them)

| Revert | Cause |
|---|---|
| `FeeExceedsPrincipal` | `contractorFee` > funding amount |
| `AlreadyFunded` | calling `fund` twice on one escrow |
| `NotFunded` | (backend) settle attempted before funding |
| `AlreadySettled` | escrow already settled |
| `NothingToWithdraw` | `withdraw()` with a 0 balance |
| ERC-20 transfer revert on `fund` | `approve` didn't confirm first, or insufficient USDC |
