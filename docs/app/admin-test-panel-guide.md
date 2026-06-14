# Admin Test Panel — Usage & Test Guide

The admin panel (`/admin`) is an internal dev/operator console for the HPD Rent
Escrow vault on **Arc testnet**. It lets you drive the full escrow lifecycle,
edit the mock HPD violation, call read functions, watch live events, and validate
the real Privy embedded-wallet path — all against the deployed `EscrowVault`.

There is also a read-only **tenant view** (`/tenant`) that renders what a tenant
would see.

> ⚠️ **Internal tool, no auth.** The transaction API (`/api/tx/[action]`) signs with
> server-held role keys and has **no authentication** (there is a `FIXME` in the
> code). Safe for local/demo use only — gate it before any public deploy.

---

## 1. Concepts

### Chain
| | |
|---|---|
| Network | Arc Testnet (Circle's USDC-native L1) |
| Chain ID | `5042002` |
| Gas token | **USDC** (6 decimals) — not ETH |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |

### Deployed contracts (`src/lib/contracts.ts`)
| Contract | Address |
|---|---|
| `EscrowVault` (VAULT) | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` |
| Yield source (MockYieldSource) | `0xB61090E2e397Cd7bda07be495A0554a7b6780736` |
| USDC | `0x3600000000000000000000000000000000000000` |

### The four roles
The panel holds one signing key per party (`*_PRIVATE_KEY` in `.env.local`) and
signs each action as the role it requires.

| Role | Responsibility |
|---|---|
| **tenant** | Funds the escrow with rent; receives **accrued yield** in every release path |
| **landlord** | Receives rent when the violation is **Dismissed** (shares on **Closed**) |
| **contractor** | Receives funds when the violation is **Closed (corrected)** |
| **oracle** | The **only** account allowed to post HPD status on-chain (`updateStatus` is `onlyOracle`) |

### Violation status → release logic
Status is an on-chain enum: `Open = 0`, `Closed = 1`, `Dismissed = 2`.

| Status | Meaning | Release |
|---|---|---|
| **Open** | Violation active | Funds stay **locked** |
| **Closed** | Corrected | → **contractor + landlord** |
| **Dismissed** | Withdrawn by HPD | → **landlord** |
| *(any terminal)* | | **accrued yield → tenant** |

No party can release funds unilaterally; release only follows an oracle-posted
terminal status.

---

## 2. Setup

```bash
cd app
cp .env.local.example .env.local     # then fill in the keys (see below)
npm install
npm run dev                          # http://localhost:3000/admin
```

### `.env.local`
```bash
# Four server-only signing keys. NEVER prefix with NEXT_PUBLIC.
TENANT_PRIVATE_KEY=0x...
LANDLORD_PRIVATE_KEY=0x...
CONTRACTOR_PRIVATE_KEY=0x...
ORACLE_PRIVATE_KEY=0x...

# Optional — enables the Privy real-wallet panel
NEXT_PUBLIC_PRIVY_APP_ID=

# Optional — Vercel KV. Omit locally to use the in-memory store fallback.
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

### Two levels of testing

**Render / read-only (no funded keys needed).** Any four valid 32-byte hex keys
work. The repo currently ships `.env.local` with the public **Anvil** keys:

| Role | Address |
|---|---|
| tenant | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| landlord | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| contractor | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| oracle | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

With these, the panel renders, `/api/roles` returns addresses, the StatusBar reads
live vault state, and balances show (0 for these accounts). **Transactions fail**
— the accounts aren't funded on Arc.

**Full lifecycle (funded keys required).** Replace the four keys with funded Arc
testnet accounts. Because **gas is paid in USDC**, every account needs some USDC,
and the **tenant** needs enough to also cover the rent it funds. Get USDC from the
Circle faucet (linked in the Role panel).

---

## 3. The panels

The admin page (`/admin`) renders these sections top to bottom.

### 3.1 StatusBar
Live vault snapshot, polled every 5s. Shows chain id, a link to the vault on the
explorer, the on-chain `oracle` and `owner` addresses, `nextEscrowId`, and the
yield pool (`totalAssets / totalShares`). A read failure surfaces inline in red.

*Verifies:* RPC connectivity and that the vault is reachable/deployed.

### 3.2 RolePanel
Table of the four roles: address, **USDC (gas)** balance, and **withdrawable**
amount, polled every 5s. A zero gas balance is highlighted red. Includes a link to
the Circle faucet.

*Verifies:* each role's funding state and any pending withdrawable balance.

### 3.3 LifecycleRunner — the main flow
Inputs: `id`, `amount` (default `1`), `fee` (default `0`), `violationId`
(default `999999`), `yield` (default `0.1`). All USDC amounts are entered as
decimals and converted to 6-dp micro-USDC before sending. A scrolling log shows
`✓`/`✗` per action; **"↻ read escrow"** loads the on-chain escrow struct into a
detail table.

The buttons map to the lifecycle in order:

| Button | Action | Signs as | Notes |
|---|---|---|---|
| **1. createEscrow** | `createEscrow(tenant, landlord, contractor, violationId, fee)` | landlord | On success the returned escrow **id auto-fills** the `id` field |
| **2. fund** | `approve(VAULT, amount)` → `fund(id, amount)` | tenant | Two txs; rent is locked |
| **3. yield** | `transfer(YIELD_SOURCE, yield)` | landlord | Simulates yield accrual into the pool |
| **4a. Closed** | `updateStatus(id, 1)` | oracle | Terminal → contractor + landlord |
| **4b. Dismissed** | `updateStatus(id, 2)` | oracle | Terminal → landlord |
| **5a/5b/5c. withdraw** | `withdraw()` | tenant / landlord / contractor | Each party pulls its share + (tenant) yield |

### 3.4 ViolationEditor
Edits the **mock HPD violation** stored in the shared store (Vercel KV, or the
in-memory fallback locally). Fields: violationId, date, address, description,
status, and an escrow id. Prefilled from `/api/violation` on load.
- **Save store only** — persists the violation (what the tenant view reads).
- **Save store + post status on-chain** — also fires the oracle-signed
  `updateStatus` when an escrow id is set and the status is terminal (non-Open).

*This is the stand-in for the Chainlink CRE oracle posting HPD's official status.*

### 3.5 FunctionTester
Generic **read-any** caller. Pick a vault view function
(`nextEscrowId`, `oracle`, `owner`, `usdc`, `yieldSource`, `withdrawable`,
`escrows`), supply comma-separated args (numbers → `BigInt`, else passed as
strings/addresses), and see the raw JSON result. Read-only by design — writes go
through the LifecycleRunner so they sign with the correct role.

### 3.6 EventLog
Live tail of all `EscrowVault` events via viem `watchContractEvent` (polling over
HTTP), newest first, capped at 50 lines. Run a lifecycle action and the
corresponding event (`EscrowCreated`, `Funded`, `StatusUpdated`, `Settled`, …)
appears within a few seconds.

### 3.7 PrivyPanel (optional)
Shown only when `NEXT_PUBLIC_PRIVY_APP_ID` is set; otherwise a disabled note. Logs
in with Privy, provisions a real **embedded wallet**, shows its USDC + withdrawable
balance, and can call `withdraw()` signed by that wallet (via a viem custom
transport over the Privy provider). This validates the real partner-owned wallet
path end-to-end, separate from the server-key flow.

---

## 4. Tenant view (`/tenant`)
Read-only. Enter an escrow id. Shows:
- the mock **HPD violation** (from the shared store),
- the live **on-chain escrow**: status, locked rent, and yield accruing to the
  tenant (claimable once settled),
- a "demo date" if the clock is set.

Use it side-by-side with the admin panel to confirm the tenant sees state changes
the operator makes.

---

## 5. Recommended manual test — the happy path

With **funded** keys and the dev server running, open `/admin` and click in order:

1. **createEscrow** → log shows `✓` and an `id`; the `id` field auto-fills. Confirm
   `EscrowCreated` in the Event Log.
2. **fund** (amount `1`) → two `✓` lines (approve + fund). RolePanel: tenant USDC
   drops ~1; vault holds the principal.
3. **yield** (`0.1`) → StatusBar pool `totalAssets` rises by ~0.1.
4. **4b. Dismissed** → `✓`; Event Log shows `StatusUpdated` then `Settled`.
5. **↻ read escrow** → table shows `status = 2 (Dismissed)`, `settled = true`.
6. **5a. withdraw tenant** then **5b. withdraw landlord**.

**Expected result** (1 USDC principal, 0.1 yield, Dismissed):
- tenant withdrawable ≈ **0.1 USDC** (the yield),
- landlord withdrawable ≈ **1.0 USDC** (the rent),
- contractor ≈ 0.

Try the **Closed** path (4a) on a fresh escrow to see contractor + landlord split.

Cross-check `/tenant` at the same escrow id: it should mirror the status, locked
amount, and tenant yield.

---

## 6. Automated tests

### Unit tests — Vitest (`npm test`)
6 tests across 2 files; no chain or server required (the store uses its in-memory
fallback).

**`src/lib/usdc.test.ts`** — 6-decimal USDC helpers:
- `toMicro` parses decimals → micro-USDC bigint (`'1'`→`1_000_000n`,
  `'1.1'`→`1_100_000n`, `'0.000001'`→`1n`).
- `fromMicro` is the inverse (`1_100_000n`→`'1.1'`; round-trips).
- `formatUsdc` renders a label (`1_100_000n`→`'1.1 USDC'`).

**`src/lib/server/store.test.ts`** — shared store (in-memory fallback):
- returns `null` before any violation is set,
- round-trips a violation through `setViolation`/`getViolation`,
- round-trips the demo clock through `setClock`/`getClock`.

### Smoke test — Playwright (`npm run e2e`)
`tests/admin.spec.ts` auto-starts the dev server and checks that the rendered UI
is wired up (uses `getByRole('heading', …)` for precise matches):
- **admin panel renders its sections** — `Admin / Test Panel`, `Lifecycle runner`,
  `Mock violation (shared store)`, `Live events` all visible.
- **tenant view renders** — `Your apartment` visible.

> The admin smoke needs `/api/roles` to succeed (so the LifecycleRunner mounts),
> which requires the four key env vars set — the Anvil throwaway keys are enough.

### Full verification sweep
```bash
npm run typecheck && npm test && npm run build
```
Expected: typecheck clean, 6 unit tests pass, production build succeeds (8 routes:
`/`, `/admin`, `/tenant`, and the `api/*` routes).

---

## 7. Quick command reference

```bash
npm run dev        # dev server at :3000  (/admin, /tenant)
npm run e2e        # Playwright smoke (manages its own server)
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit tests
npm run build      # production build
curl -s http://localhost:3000/api/roles   # sanity-check the 4 role addresses (server running)
```

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| RolePanel: "Loading roles… (set the 4 key env vars)" | `/api/roles` 500'd — one of the 4 `*_PRIVATE_KEY` vars is missing/invalid in `.env.local`. |
| Lifecycle buttons log `✗ … insufficient funds` | Accounts not funded with USDC on Arc (gas is USDC). Fund via the faucet. |
| StatusBar shows "read error" | RPC unreachable or vault address wrong. |
| Privy panel says "disabled" | `NEXT_PUBLIC_PRIVY_APP_ID` not set — expected unless testing the real-wallet path. |
| Violation resets after server restart | No KV configured; the in-memory store is per-process. Set `KV_REST_API_*` to persist. |
