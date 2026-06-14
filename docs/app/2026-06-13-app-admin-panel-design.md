# Design — `app/` scaffold, admin/test panel, read-only tenant view

**Date:** 2026-06-13
**Owner:** Nilesh (frontend + Privy)
**Status:** Approved, ready for implementation plan

## Context

The contracts (`EscrowVault`, `MockYieldSource`) are deployed and verified on Arc
testnet (chain `5042002`). This design covers the **first frontend slice**: a new,
isolated `app/` directory containing a Next.js app whose first job is an
**admin/test panel** that exercises every function and workflow in
[`docs/INTEGRATION.md`](../INTEGRATION.md), plus a **read-only tenant view** to
prove the shared-data design end-to-end. The public homepage and the full
tenant/landlord/contractor portals are **out of scope** here and will get their own
specs later.

The existing Foundry/contract code is **not touched**. All new work lives under
`app/`.

## Goals

- A self-contained, hostable Next.js app in `app/`, live on Vercel tonight, with a
  PWA shell so it can be saved to a phone homescreen and demoed from a button.
- An admin/test panel that can drive the full escrow lifecycle and call every
  contract function from INTEGRATION.md.
- A shared, persistent mock-violation + demo-clock store that the admin **writes**
  and the tenant view (and future portals) **read**.
- A minimal read-only tenant view that consumes both the shared store and on-chain
  state.

## Non-goals (future specs)

- Public marketing homepage.
- Action-capable tenant/landlord/contractor portals.
- Real Chainlink CRE → Arc oracle write path (a relayer/configured key stands in).
- Pooled multi-escrow yield accounting (one active escrow for the demo).

## Stack decisions (settled during brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + Tailwind** | First-class Privy + viem; Vercel-native hosting; API routes give a server side for the oracle key and NYC proxy without a separate backend. |
| Hosting | **Vercel**, project rooted at `app/` | Push-to-deploy, automatic HTTPS (required for Privy and PWA install). |
| Signing | **Hybrid** | Primary: server-signed configured test keys for fast exhaustive testing. Secondary: minimal Privy path to validate the real embedded-wallet flow. |
| NYC data | **Fully mocked now**, via a shared store | Admin sets violation details + status; chain `status` drives money. Real HPD fetch deferred to a later portal spec. |
| Shared store | **Vercel KV (Upstash Redis)** | Persists writes across requests/portals and redeploys; in-memory fallback for local dev. |
| Scope | **Scaffold + admin panel + read-only tenant view** | Shippable tonight; proves the shared-store design. |

## Architecture

Three layers inside `app/`:

1. **Client UI** (`/admin`, `/tenant`) — reads chain state directly via a viem
   *public* client. Holds **no private keys**. Posts privileged actions to API
   routes.
2. **API routes** (server) — hold all secrets and perform privileged work:
   - `/api/tx/*` — server-side signing with the configured **test keys**, one
     route (or one parameterized route) per action: `createEscrow`, `fund`
     (approve→wait→fund), `withdraw`, `updateStatus`, `simulateYield`. Accepts
     `{ role, params }`; signs with that role's server-held key.
   - `/api/violation` — `GET`/`PUT` the shared mock violation record.
   - `/api/clock` — `GET`/`PUT` the demo date.
3. **Shared store** — Vercel KV. Carries the **human-readable violation details**
   (violationId, address, description, status, date) and the demo clock. The
   **chain remains the source of truth for money** (status → settlement →
   `withdrawable`). The admin sets the store record and the matching on-chain
   `updateStatus` in one action, so they never drift.

### Directory shape (proposed)

```
app/
  package.json, next.config.*, tailwind.config.*, tsconfig.json
  .env.local.example            # documents required env vars
  public/
    manifest.json, icons/       # PWA shell
  src/
    lib/
      chain.ts                  # Arc chain config (id 5042002, RPC)
      contracts.ts              # addresses + ABIs (EscrowVault, ERC20, MockYieldSource)
      clients.ts                # viem public client; server wallet clients per role
      usdc.ts                   # 6-decimal parse/format helpers
      kv.ts                     # Vercel KV wrapper + in-memory dev fallback
      roles.ts                  # role -> address map, balance reads
    app/
      layout.tsx                # Privy provider + PWA registration
      admin/page.tsx            # the test panel
      tenant/page.tsx           # read-only tenant view
      api/
        tx/[action]/route.ts    # server-signed actions
        violation/route.ts
        clock/route.ts
```

## Signing paths (the hybrid)

- **Primary — server-signed test keys.** Four funded testnet private keys
  (tenant, landlord, contractor, oracle) live in Vercel env vars and are used only
  inside `/api/tx/*`. The UI never sees them. "Act as X" → POST → server signs.
- **Secondary — Privy real path.** A Privy login slot connects an embedded wallet,
  shows its address + USDC balance, and can fire **one real client-signed action**
  (`fund` or `withdraw`) to validate the actual onboarding flow. Intentionally
  minimal in this slice.

## Admin panel — contents

1. **Status bar** — chainId guard (`5042002`), contract addresses, live
   `oracle()`/`owner()` readouts, the four role addresses with **USDC balances**
   (USDC is gas on Arc) + faucet links, and the **demo clock** (set date).
2. **Lifecycle runner** — clickable steps for the happy path:
   `createEscrow` → `approve`+`fund` (enforces the two-step wait) → `simulateYield`
   (MockYieldSource) → post status as oracle (`Open`/`Closed`/`Dismissed`) →
   `withdraw` per party. With a **live escrow-state table** showing all 10 struct
   fields and `withdrawable(addr)` per party, auto-refreshing.
3. **Mock violation editor** — violationId, address, description, status, date →
   writes the shared store **and** offers the matching on-chain `updateStatus` in
   one action.
4. **Generic function tester** — call **any** read/write from INTEGRATION.md with
   raw args, covering the long tail (`setOracle`, `setYieldSource`, `usdc()`,
   `nextEscrowId()`, `escrows(id)`, `yieldSource()`, etc.) so "test all functions"
   is literally true.
5. **Live event log** — streams `EscrowCreated`, `Funded`, `StatusUpdated`,
   `Settled`, `Withdrawn`.

## Read-only tenant view

`/tenant` resolves a tenant address (query param or Privy-connected) and renders the
shared mock violation plus the on-chain escrow for that tenant: violation status,
USDC locked, yield accruing to the tenant, and `withdrawable` balance. **No
actions.** Its sole purpose here is to prove the shared-store + chain-read path
end-to-end.

## Data flow (example: Fund)

```
admin UI  --POST /api/tx/fund {role: "tenant", id, amount}-->  server
server:   walletClient(tenantKey).approve(vault, amount)  -> waitForReceipt
          walletClient(tenantKey).fund(id, amount)         -> waitForReceipt
server  --{ approveHash, fundHash }-->  admin UI
admin UI: public client refreshes escrows(id) + withdrawable(*) and shows event log
```

## Error handling (Arc/USDC gotchas baked in)

- **6 decimals everywhere** via a single `usdc.ts` (`parseUnits/formatUnits` with 6).
- **Two-step fund**: enforce `approve` → wait for receipt → `fund`; never fire
  `fund` before the approve confirms.
- **Known reverts** surfaced clearly: `FeeExceedsPrincipal()`,
  `NothingToWithdraw()`.
- **Gas = USDC**: pre-check each role's USDC balance before a tx; show the faucet
  link when low.
- **Network guard**: refuse/raise if not chain `5042002`.
- **Role authority**: only the oracle route may post status; only owner may
  `setOracle`/`setYieldSource` — surface authorization errors plainly.

## PWA + hosting

- Vercel project rooted at `app/`; automatic HTTPS.
- `public/manifest.json` + icons + a service worker → installable to a phone
  homescreen, demoable from a button. Additive: the app works as a normal site
  first.
- Env vars: four role private keys, RPC URL, Privy app id, Vercel KV credentials.
  Documented in `.env.local.example`.

## Testing

The admin panel **is** the integration test harness for the contracts. For the app
code itself, light hackathon-appropriate coverage:

- Type-check pass (`tsc --noEmit`).
- Unit tests on `usdc.ts` (6-decimal round-trips) and the `/api/violation` route
  (read-after-write against the in-memory fallback).
- One Playwright smoke that loads `/admin` and confirms it renders without errors.

## Open items deferred to the plan

- MockYieldSource "simulate yield" function name/signature — confirm against the
  contract/`scripts/smoke.sh` when wiring `/api/tx/simulateYield`.
- Exact ABI sourcing: read from `out/EscrowVault.sol/*.json` after `forge build`,
  or copy from the verified explorer ABI.
