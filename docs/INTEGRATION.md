# Frontend Integration Guide — EscrowVault on Arc

For Nilesh (frontend + Privy). This covers everything the UI needs to read escrow
state, fund an escrow, and let parties withdraw. All signatures, the `Escrow` struct
field order, and the events below are taken directly from
[`src/EscrowVault.sol`](../src/EscrowVault.sol).

## Network

| | |
|---|---|
| Chain | Arc testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| Faucet (USDC + gas) | https://faucet.circle.com |

USDC **is the gas token** on Arc, so the faucet that funds USDC also funds gas.

## Deployed & verified contracts

| Contract | Address | |
|---|---|---|
| **EscrowVault** (verified ✅) | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` | [explorer ↗](https://testnet.arcscan.app/address/0x83B757a2DB265c185Ed837564fC3b3de3052CF3D?tab=contract) |
| MockYieldSource | `0xB61090E2e397Cd7bda07be495A0554a7b6780736` | [explorer ↗](https://testnet.arcscan.app/address/0xB61090E2e397Cd7bda07be495A0554a7b6780736) |
| USDC (Arc predeploy) | `0x3600000000000000000000000000000000000000` | 6 decimals, **and it's the gas token** |

## Critical facts the frontend MUST respect

- **USDC has 6 decimals.** `1 USDC = 1_000_000`. Every amount in this contract is
  micro-USDC. Use `parseUnits(x, 6)` / `formatUnits(x, 6)` — never 18.
- **Funding is TWO steps.** First `USDC.approve(vault, amount)`, then
  `vault.fund(id, amount)`. `fund` does a `transferFrom`, so without the approve it
  **reverts**. Wait for the approve tx to confirm before calling `fund`.
- **The caller of `fund` is the payer.** `fund` pulls USDC from `msg.sender`, so the
  tenant's wallet must send the `fund` transaction (and hold the USDC + a little extra
  for gas).
- **Status enum:** `Open = 0`, `Closed = 1`, `Dismissed = 2`.
- **`updateStatus` is `onlyOracle`** — that's the backend relayer / Chainlink CRE
  forwarder, **NOT** a frontend action. The UI never calls it. The UI reacts to it by
  watching the `StatusUpdated` / `Settled` events.
- **Pull-payment withdrawals.** Settlement credits each party's `withdrawable(address)`
  balance; it does not push funds. The UI shows `withdrawable(myAddress)` and a
  **Withdraw** button that calls `withdraw()` (claims the caller's own balance only).
- **Every wallet needs USDC for gas.** Because USDC is gas on Arc, Privy embedded
  wallets can't transact on zero balance — surface a "fund your wallet" step in
  onboarding (faucet link above).

## Function reference

### Reads (view)

| Function | Returns |
|---|---|
| `nextEscrowId()` | `uint256` — next id to be assigned; current count of escrows created |
| `escrows(uint256 id)` | the full `Escrow` struct tuple (see field order below) |
| `withdrawable(address account)` | `uint256` — micro-USDC claimable by `account` |
| `usdc()` | `address` — the USDC token (`0x3600…0000`) |
| `yieldSource()` | `address` — the yield source (MockYieldSource) |
| `oracle()` | `address` — the authorized status poster (backend) |
| `owner()` | `address` — admin/config |

**`escrows(id)` returns these fields, in this exact order** (all value types, so the
auto-generated getter returns all of them):

| # | Field | Type | Notes |
|---|---|---|---|
| 0 | `tenant` | `address` | receives the yield |
| 1 | `landlord` | `address` | receives principal (or principal − fee on Closed) |
| 2 | `contractor` | `address` | receives `contractorFee` on Closed only |
| 3 | `violationId` | `uint256` | HPD ViolationID |
| 4 | `principal` | `uint256` | USDC funded (micro-USDC); `0` until funded |
| 5 | `shares` | `uint256` | yield-source shares minted for this escrow |
| 6 | `contractorFee` | `uint256` | USDC paid to contractor on Closed (micro-USDC) |
| 7 | `status` | `uint8` | enum: 0 Open, 1 Closed, 2 Dismissed |
| 8 | `funded` | `bool` | true once `fund` succeeded |
| 9 | `settled` | `bool` | true once settled (terminal status reached) |

### Writes (frontend)

| Function | Signature | Who |
|---|---|---|
| Create | `createEscrow(address tenant, address landlord, address contractor, uint256 violationId, uint256 contractorFee) → uint256 id` | setup (returns the new id; also emitted in `EscrowCreated`) |
| Fund | `fund(uint256 id, uint256 amount)` | tenant (after `approve`) |
| Withdraw | `withdraw()` | each party, claims own `withdrawable` balance |

> `createEscrow` only records the escrow (status `Open`, `funded`/`settled` =
> `false`) and stores `contractorFee` without validating it. The fee-vs-principal
> check happens later in **`fund`**: if `contractorFee > amount`, `fund` reverts with
> `FeeExceedsPrincipal()`. So a too-high fee surfaces at funding time, not at creation.

### Writes (admin / backend only — NOT the UI)

| Function | Signature | Guard |
|---|---|---|
| Post status | `updateStatus(uint256 id, uint8 status)` | `onlyOracle` |
| Set oracle | `setOracle(address oracle)` | `onlyOwner` |
| Set yield source | `setYieldSource(address yieldSource)` | `onlyOwner` |

### Events (subscribe to these)

| Event | Params |
|---|---|
| `EscrowCreated` | `uint256 indexed id, address indexed tenant, uint256 violationId` |
| `Funded` | `uint256 indexed id, uint256 amount` |
| `StatusUpdated` | `uint256 indexed id, uint8 status` — emitted only when status set to `Open` (non-terminal) |
| `Settled` | `uint256 indexed id, uint8 status` — emitted on `Closed`/`Dismissed` settlement |
| `Withdrawn` | `address indexed account, uint256 amount` |

> Note: a terminal `updateStatus` (Closed/Dismissed) emits **`Settled`**, not
> `StatusUpdated`. Watch `Settled` to know when funds become withdrawable.
> (Admin events `OracleUpdated` / `YieldSourceUpdated` also exist; the UI can ignore them.)

## ABI

Grab the ABI either way:
- From the **verified contract** on the explorer — open the EscrowVault address, **ABI**
  tab, copy.
- From the build output: run `forge build`, then read
  `out/EscrowVault.sol/EscrowVault.json` (the `abi` field).

## Examples

Amounts are 6-decimal micro-USDC throughout. `escrowVaultAbi` / `erc20Abi` are the
ABIs from the section above.

### 1) Read an escrow's state (viem)

```ts
import { createPublicClient, http } from 'viem'

const VAULT = '0x83B757a2DB265c185Ed837564fC3b3de3052CF3D'
const client = createPublicClient({ transport: http('https://rpc.testnet.arc.network') })

const [
  tenant, landlord, contractor, violationId,
  principal, shares, contractorFee, status, funded, settled,
] = await client.readContract({
  address: VAULT, abi: escrowVaultAbi, functionName: 'escrows', args: [id],
})
// status: 0 = Open, 1 = Closed, 2 = Dismissed

const claimable = await client.readContract({
  address: VAULT, abi: escrowVaultAbi, functionName: 'withdrawable', args: [myAddress],
})
```

### 2) Approve + fund (viem)

```ts
import { parseUnits } from 'viem'

const USDC = '0x3600000000000000000000000000000000000000'
const VAULT = '0x83B757a2DB265c185Ed837564fC3b3de3052CF3D'
const amount = parseUnits('1', 6) // 1 USDC = 1_000_000n

// step 1: approve, and WAIT for it to confirm
const approveHash = await wallet.writeContract({
  address: USDC, abi: erc20Abi, functionName: 'approve', args: [VAULT, amount],
})
await client.waitForTransactionReceipt({ hash: approveHash })

// step 2: fund (tenant's wallet must send this)
await wallet.writeContract({
  address: VAULT, abi: escrowVaultAbi, functionName: 'fund', args: [id, amount],
})
```

### 3) Withdraw (viem)

```ts
// claims msg.sender's own withdrawable balance; reverts NothingToWithdraw() if zero
await wallet.writeContract({
  address: VAULT, abi: escrowVaultAbi, functionName: 'withdraw', args: [],
})
```

### 4) Watch the Settled event (viem)

```ts
const unwatch = client.watchContractEvent({
  address: VAULT, abi: escrowVaultAbi, eventName: 'Settled',
  onLogs: (logs) => {
    for (const log of logs) {
      const { id, status } = log.args // status: 1 Closed, 2 Dismissed
      // funds are now withdrawable -> refresh withdrawable(address) for each party
    }
  },
})
```

### cast equivalents (approve / fund / withdraw)

```bash
RPC=https://rpc.testnet.arc.network
USDC=0x3600000000000000000000000000000000000000
VAULT=0x83B757a2DB265c185Ed837564fC3b3de3052CF3D
ID=0
AMOUNT=1000000   # 1 USDC (6dp)

# approve
cast send "$USDC"  "approve(address,uint256)" "$VAULT" "$AMOUNT" \
  --rpc-url "$RPC" --account <yourAccount>

# fund (after approve confirms)
cast send "$VAULT" "fund(uint256,uint256)" "$ID" "$AMOUNT" \
  --rpc-url "$RPC" --account <yourAccount>

# withdraw
cast send "$VAULT" "withdraw()" \
  --rpc-url "$RPC" --account <yourAccount>
```

See [`scripts/smoke.sh`](../scripts/smoke.sh) for a full cast-based end-to-end run.

## Privy notes

- Tenant, landlord, and contractor each get a **Privy embedded wallet**.
- The **tenant** funds the escrow: `approve` then `fund` from the tenant's wallet.
- Each party **withdraws their own** balance via `withdraw()` (pull-payment); show them
  `withdrawable(theirAddress)`.
- The frontend reads escrow state via **RPC reads + event subscriptions** (above). It
  never calls `updateStatus` — the **oracle role stays on the backend** (Chainlink CRE
  forwarder / relayer).
- Because USDC is the gas token, fund each embedded wallet with a little USDC during
  onboarding or no transaction (including `withdraw`) will go through.
