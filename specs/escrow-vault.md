# Spec — EscrowVault

Holds a tenant's rent in USDC while an NYC HPD housing-code violation is open, and
releases it only when an authorized oracle posts HPD's official status on-chain.
Yield earned while funds are locked always goes to the tenant.

Chain: Arc (Circle's USDC-native L1, EVM-compatible). USDC is treated as a plain
ERC-20 with 6 decimals.

## Status enum
`Status { Open, Closed, Dismissed }` mirrors the HPD `currentstatus` field from the
NYC Open Data Housing Maintenance Code Violations dataset (`wvxf-dwi5`):
- **Open** — violation active; funds stay locked.
- **Closed** (corrected) — terminal; principal releases to **contractor + landlord**.
- **Dismissed** — terminal; principal releases to **landlord**.
- Accrued **yield → tenant** in every release path.

## Oracle = CRE forwarder
`updateStatus` is gated by `onlyOracle`. The oracle is Chainlink CRE, which reads the
HPD API off-chain, runs consensus, and writes the verified status on-chain. The role
is a settable, access-controlled address (`setOracle`) so a trusted relayer can stand
in if the CRE→Arc write path isn't ready for the demo. No party can trigger release
unilaterally — release keys off the official posted status only.

## Yield source
Escrowed USDC is deposited into an `IYieldSource` (a yield-bearing destination).
The demo uses a `MockYieldSource`; production swaps in a real on-Arc USDC vault. On
settlement the vault pulls `principal + accruedYield` back out before crediting
recipients.

## Pull-payment withdrawals
Settlement credits per-account `withdrawable[]` balances rather than pushing transfers.
Each party calls `withdraw()` to claim its own balance. This isolates failure: USDC on
Arc reverts on transfers to blocklisted addresses, so a push model could let one
blocklisted recipient brick settlement for everyone. Pull-payment contains that to the
affected account.

## Lifecycle
1. `createEscrow(tenant, landlord, contractor, violationId)` → record, status `Open`.
2. `fund(id, amount)` → `transferFrom` USDC, deposit to yield source, mark funded.
3. `updateStatus(id, status)` (oracle) → record status; if terminal, `_settle`.
4. `_settle(id)` → withdraw principal + yield from yield source, credit `withdrawable[]`.
5. `withdraw()` → each recipient pulls its balance.

## Status: skeleton only
Current code is state + signatures; the release logic (`createEscrow`, `fund`,
`updateStatus`, `_settle`, `withdraw`) is stubbed with `TODO`/`revert` and not yet
implemented.
