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
Escrowed USDC is deposited into an `IYieldSource`, a **share-based (ERC-4626-shape)**
yield vault. On `fund`, the vault deposits the escrow's USDC and records the `shares`
minted for it. On settlement the vault redeems exactly those shares, recovering the
escrow's principal plus only its own proportional slice of the pooled yield. The demo
uses a `MockYieldSource` (yield simulated by sending extra USDC into the pool, which
lifts share value); production drops in any real ERC-4626 USDC vault.

## Pull-payment withdrawals
Settlement credits per-account `withdrawable[]` balances rather than pushing transfers.
Each party calls `withdraw()` to claim its own balance. This isolates failure: USDC on
Arc reverts on transfers to blocklisted addresses, so a push model could let one
blocklisted recipient brick settlement for everyone. Pull-payment contains that to the
affected account.

## Lifecycle
1. `createEscrow(tenant, landlord, contractor, violationId, contractorFee)` → record,
   status `Open`. `contractorFee` is the USDC paid to the contractor on a `Closed`
   outcome; the landlord receives `principal - contractorFee`.
2. `fund(id, amount)` → `transferFrom` USDC, deposit to the yield source, store the
   minted `shares` on the escrow, mark funded. Reverts if `contractorFee > amount`.
3. `updateStatus(id, status)` (oracle) → record status; if terminal, `_settle`.
4. `_settle(id)` → redeem the escrow's `shares` for `assets`; split into principal `p`
   (clamped to `assets`) and yield `y = assets - p`; credit `withdrawable[]`.
5. `withdraw()` → each recipient pulls its balance.

## Yield accounting — multi-escrow correct
Yield is attributed **per escrow via shares**. Each escrow's deposit mints shares in
the pooled yield source; settlement redeems exactly that escrow's shares, so it
recovers its own principal plus only its proportional slice of pooled yield. Many
escrows can be funded and settled concurrently with correct, independent accounting —
no single-active-escrow assumption. Settlement follows checks-effects-interactions:
`settled` is set before the external `redeem` call. The `MockYieldSource` has no
ERC-4626 inflation-attack guard and is demo-only; a production ERC-4626 vault should.
