# Spec — HPD → Chainlink CRE → EscrowVault oracle

How the verified NYC HPD violation status gets on-chain and drives escrow settlement.
A Chainlink CRE workflow polls the official HPD dataset off-chain, maps the outcome to
`EscrowVault.Status`, and delivers it through the Keystone forwarder to an on-chain
receiver that is registered as the vault's `oracle`.

This is the access-controlled "authorized oracle posts HPD's official status" path
from [`CLAUDE.md`](../CLAUDE.md) and [`escrow-vault.md`](escrow-vault.md). Release keys
off that posted status only — no party triggers it unilaterally.

## Target contract

| | |
|---|---|
| EscrowVault | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` |
| Network | Arc testnet, chain ID `5042002` |
| Settlement entrypoint | `updateStatus(uint256 id, Status status)` — `onlyOracle` |
| Status enum | `Open = 0`, `Closed = 1`, `Dismissed = 2` |
| Oracle role | settable by owner via `setOracle(address)`; currently the deployer stand-in |

The receiver contract (below) becomes the new `oracle` via `setOracle`, replacing the
deployer stand-in.

## Architecture

```
            ┌─────────────────────────── off-chain (CRE DON) ───────────────────────────┐
  cron ───▶ │  TS workflow                                                               │
            │   1. load tracked escrows  (id -> violationId)                             │
            │   2. GET Socrata wvxf-dwi5 by violationid                                  │
            │   3. map HPD fields -> Status enum (0/1/2)                                 │
            │   4. for each changed escrow: runtime.report(abi.encode(id, status))       │
            │   5. evmClient.writeReport(...)                                            │
            └───────────────────────────────────┬────────────────────────────────────────┘
                                                 │ signed report
                                                 ▼
        KeystoneForwarder.onReport(metadata, report)   ── Arc, prod: KeystoneForwarder
                                                 │        Arc, sim:  MockForwarder
                                                 ▼
        EscrowVaultReceiver (ReceiverTemplate).onReport
                                                 │  auth: only forwarder + expected
                                                 ▼      workflow owner/name
        EscrowVaultReceiver._processReport(metadata, report)
                                                 │  decode abi.encode(uint256 id, uint8 status)
                                                 ▼
        EscrowVault.updateStatus(id, Status(status))   ── onlyOracle == receiver
                                                 │
                                                 ▼
        _settle(...) on terminal status (Closed/Dismissed)
```

## (a) CRE TypeScript workflow — cron poll of HPD

### Data source
- NYC Open Data, HPD Housing Maintenance Code Violations, Socrata dataset **`wvxf-dwi5`**.
- SODA query by violation id:
  `https://data.cityofnewyork.us/resource/wvxf-dwi5.json?violationid=<VIOLATION_ID>`
- Relevant fields:
  - `violationstatus` — `"Open"` or `"Close"`.
  - `currentstatus` — granular HPD status text, e.g. `VIOLATION DISMISSED`,
    `VIOLATION CLOSED`, `NOV CERTIFIED ...`. Used to distinguish dismissal from cure.
- Send a Socrata **app token** (header `X-App-Token`) to avoid throttling; store it as a
  CRE secret, not in source.

### Status mapping (single source of truth)

| HPD `violationstatus` | HPD `currentstatus` contains | → `EscrowVault.Status` | uint8 |
|---|---|---|---|
| `Open` | (any) | `Open` | `0` |
| `Close` | `DISMISS` | `Dismissed` | `2` |
| `Close` | anything else (e.g. corrected/closed) | `Closed` | `1` |

Notes:
- Matching is case-insensitive; compare on upper-cased, trimmed strings.
- Treat a missing/empty Socrata result as **`Open`** (still locked) — never settle on
  absent data. Only a definitive `Close` row settles funds.
- `Open` is non-terminal: posting it is a no-op-ish update (the vault emits
  `StatusUpdated`, does not settle). The workflow should skip re-posting `Open` for an
  escrow already `Open` to save gas; always post a terminal transition.

### Tracked escrows (id → violationId)
The workflow needs the set of active escrows and their `violationId`. Options:
1. **On-chain read (preferred):** read `nextEscrowId()` and `escrows(id)` for each id;
   filter to `funded && !settled`; take `violationId`. Self-describing, no extra store.
2. Off-chain registry (config/secret) listing `{ id, violationId }` — simpler for the
   demo's single active escrow.

### Workflow sketch
```ts
// cre-workflow/hpd-oracle.ts  (illustrative — confirm API names against the CRE SDK version)
import { cre } from "@chainlink/cre-sdk"

const SOCRATA = "https://data.cityofnewyork.us/resource/wvxf-dwi5.json"

// EscrowVault.Status
const Status = { Open: 0, Closed: 1, Dismissed: 2 } as const

function mapStatus(row?: { violationstatus?: string; currentstatus?: string }): number {
  if (!row || !row.violationstatus) return Status.Open            // no data -> stay locked
  const vs = row.violationstatus.trim().toUpperCase()
  if (vs === "OPEN") return Status.Open
  const cs = (row.currentstatus ?? "").toUpperCase()
  return cs.includes("DISMISS") ? Status.Dismissed : Status.Closed
}

async function fetchViolation(httpClient, violationId: number, appToken: string) {
  const url = `${SOCRATA}?violationid=${violationId}`
  const res = await httpClient.get(url, { headers: { "X-App-Token": appToken } })
  const rows = JSON.parse(res.body) as Array<Record<string, string>>
  return rows[0] // latest/only row for that violation id
}

const onCron = async (runtime) => {
  const appToken = runtime.getSecret("SOCRATA_APP_TOKEN")
  const escrows = await loadTrackedEscrows(runtime) // [{ id, violationId, lastStatus }]

  for (const e of escrows) {
    const row = await fetchViolation(runtime.http, e.violationId, appToken)
    const status = mapStatus(row)

    // Skip if unchanged, and never overwrite a terminal status.
    if (status === e.lastStatus) continue
    if (e.lastStatus === Status.Closed || e.lastStatus === Status.Dismissed) continue

    // Report payload MUST match the receiver's decoder: abi.encode(uint256 id, uint8 status)
    const report = runtime.abiEncode(["uint256", "uint8"], [e.id, status])
    await runtime.report(report)            // hand the encoded report to the DON
  }
}

export const initWorkflow = () =>
  cre.newWorkflow().onCronTrigger({ schedule: "*/5 * * * *" }, onCron) // every 5 min
```

> Cadence: a few minutes is plenty — HPD status changes are slow. Keep the cron modest
> to stay within Socrata rate limits.

## Report encoding (the contract between off-chain and on-chain)

The workflow and the receiver MUST agree byte-for-byte:

```
report = abi.encode(uint256 id, uint8 status)
```

`status` is the `EscrowVault.Status` value (`0|1|2`). Encoding any other shape will
revert the decode in `_processReport`.

## (b) EscrowVaultReceiver (Solidity)

Inherits Chainlink's `ReceiverTemplate`, which enforces that `onReport` is called only
by the configured Keystone forwarder and only for the expected workflow owner/name,
then hands the payload to `_processReport`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "@chainlink/contracts/.../ReceiverTemplate.sol"; // confirm path/version

interface IEscrowVault {
    // Status is uint8 at the ABI boundary (Open=0, Closed=1, Dismissed=2)
    function updateStatus(uint256 id, uint8 status) external;
}

/// @notice Receives CRE reports carrying (escrowId, hpdStatus) and forwards them to the
///         EscrowVault as the authorized oracle. Registered via EscrowVault.setOracle.
contract EscrowVaultReceiver is ReceiverTemplate {
    IEscrowVault public immutable vault;

    event StatusReported(uint256 indexed id, uint8 status);

    constructor(
        address forwarder,        // Arc KeystoneForwarder (prod) or MockForwarder (sim)
        bytes32 workflowOwner,    // expected CRE workflow owner
        bytes10 workflowName,     // expected CRE workflow name
        IEscrowVault _vault
    ) ReceiverTemplate(forwarder, workflowOwner, workflowName) {
        vault = _vault;
    }

    /// @dev Called by ReceiverTemplate after forwarder + workflow auth checks pass.
    function _processReport(bytes calldata /*metadata*/, bytes calldata report) internal override {
        (uint256 id, uint8 status) = abi.decode(report, (uint256, uint8));
        vault.updateStatus(id, status);     // reverts NotOracle unless this == vault.oracle()
        emit StatusReported(id, status);
    }
}
```

Trust chain that makes this safe:
- `EscrowVault.updateStatus` is `onlyOracle`; the receiver is set as that oracle.
- `ReceiverTemplate` only lets the **expected forwarder** invoke `onReport`, and only
  for the **expected workflow owner/name** — so a third party can't push arbitrary
  statuses through the receiver.
- Net: only a report produced by *our* CRE workflow, delivered by *the* forwarder, can
  move escrow funds.

## (c) KeystoneForwarder flow

End to end, one settlement:

1. **Workflow** maps HPD → `status`, builds `report = abi.encode(id, status)`, calls
   `runtime.report(report)`.
2. **DON** reaches consensus and signs the report.
3. **`evmClient.writeReport(...)`** submits the signed report on Arc, targeting the
   forwarder.
4. **`KeystoneForwarder.onReport(metadata, report)`** verifies DON signatures, then
   calls the receiver's `onReport`.
5. **`EscrowVaultReceiver` (ReceiverTemplate) `onReport`** checks caller == forwarder
   and the workflow owner/name, then calls `_processReport`.
6. **`_processReport`** decodes `(id, status)` and calls
   **`EscrowVault.updateStatus(id, status)`**.
7. On a terminal status (`Closed`/`Dismissed`) the vault runs `_settle`, redeeming the
   escrow's shares and crediting `withdrawable[]` (yield → tenant; principal →
   contractor+landlord on Closed, landlord on Dismissed).

## (d) Simulation vs production

| | Forwarder | Use |
|---|---|---|
| **Simulation** | Arc **MockForwarder** | Local/CRE simulation: deliver a hand-built report to the receiver without a live DON. Lets us exercise `_processReport` → `updateStatus` → `_settle` deterministically. |
| **Production** | Arc **KeystoneForwarder** | Live DON-signed reports. Signature verification enforced. |

Only the `forwarder` constructor arg of `EscrowVaultReceiver` differs between the two —
the receiver logic, report shape, and vault wiring are identical. Deploy one receiver
per environment pointing at the matching forwarder.

## Deployment & wiring

1. Deploy `EscrowVaultReceiver(forwarder, workflowOwner, workflowName, vault)` with the
   env-appropriate forwarder (MockForwarder for sim, KeystoneForwarder for prod) and
   `vault = 0x83B757a2DB265c185Ed837564fC3b3de3052CF3D`.
2. As `EscrowVault.owner` (the deployer / `arcDeployer` keystore), call
   `EscrowVault.setOracle(receiver)`.
3. Verify `EscrowVault.oracle() == receiver`.
4. Register/deploy the CRE workflow with `workflowOwner`/`workflowName` matching the
   receiver's constructor args, and the Socrata app token set as a secret.
5. Update [`deployments/arc-testnet.md`](../deployments/arc-testnet.md) with the
   receiver address and the new `oracle` value.

## Trust & failure modes
- **Stale/no data → stay locked.** Map missing rows to `Open`; only a definitive
  `Close` settles. Bias is toward not releasing funds on bad data.
- **No double-settle.** `updateStatus` reverts `AlreadySettled` after a terminal status;
  the workflow also skips escrows whose `lastStatus` is terminal.
- **Idempotency.** Re-posting the same non-terminal status is harmless (emits
  `StatusUpdated`, no settle); the workflow dedupes to save gas.
- **Relayer fallback.** Because the oracle is a settable role, if the CRE→Arc write path
  isn't ready, the owner can point `setOracle` at a trusted relayer EOA/contract that
  posts the same `updateStatus` calls — same on-chain effect, weaker trust.
- **Decimals/enum drift.** The `abi.encode(uint256, uint8)` shape and the 0/1/2 enum
  values are a hard contract between workflow and receiver; changing the enum requires
  changing both.

## Simulation results

End-to-end run on Arc testnet (2026-06-14): live HPD status → CRE workflow → MockForwarder
→ `EscrowVaultReceiver` → `EscrowVault.updateStatus` → settlement. Every value below is a
real on-chain read or a real simulation log line — nothing reconstructed.

**Subject.** `violationId 18100032` (4-6 Manhattan Ave). Re-queried live before the run:
`violationstatus "Close"`, `currentstatus "VIOLATION CLOSED"` → `mapStatus` = `Closed` (1).

**Escrow** (id `1`, created+funded on Arc beforehand):
- tenant `0x1111…1111`, landlord `0x2222…2222`, contractor `0x3333…3333`
- principal `1000000` (1 USDC), contractorFee `300000` (0.3 USDC)
- yield source pool clean at run time (share price 1.0), so expected yield = 0

**Command** (run from `cre-workflow/`):
`cre workflow simulate hpd-oracle --target staging-settings --broadcast`

**Simulation log highlights:**
```
✓ Workflow compiled
2026-06-14T... [USER LOG] escrow 1 (violation 18100032) -> status 1
2026-06-14T... [USER LOG] posted status 1 for escrow 1
✓ Workflow Simulation Result: "done: posted 1/1 status update(s)"
```

**Transactions:**
| Step | Tx hash | Block |
|------|---------|-------|
| createEscrow(…, 18100032, fee) | `0x54da4bd2c65a33d2c7e5cd1f33b6713ef16a59cacc795d9a5c6370c78bea2834` | 46984162 |
| fund(1, 1000000) | `0xdfbfa7ec0fea3a60e0f6dfa6fa87c7bf5347c621f7c1ee1006d91d065599296c` | 46984591 |
| writeReport → MockForwarder → settle | `0xb1e32c18056744a838035fc87eb06b0894d90140f2929f916815faa1d43ed867` | 46985535 |

The writeReport tx (`to` = Arc MockForwarder `0x6E9E…eDc1`, status success) emitted, in one
tx: USDC redeem from the yield source to the vault, the vault's `Settled(id=1, Closed)`, and
the receiver's `StatusReported(id=1, 1)` — the full chain executed end to end.

**On-chain verification after the run** (read via `cast`, not from the log):
```
escrows(1).status   == 1   (Closed)   ✅
escrows(1).funded   == true            ✅
escrows(1).settled  == true            ✅
withdrawable(0x3333… contractor) == 300000   (= contractorFee)        ✅
withdrawable(0x2222… landlord)   == 700000   (= principal - fee)      ✅
withdrawable(0x1111… tenant)     == 0        (= yield, clean pool)    ✅
```

This matches `EscrowVault`'s Closed branch exactly (contractor = fee, landlord =
principal − fee, tenant = accrued yield). The oracle path is proven against real HPD data.

## Open questions / to confirm
- Exact CRE SDK symbols (`runtime.report`, `evmClient.writeReport`, `ReceiverTemplate`
  import path) against the pinned SDK version — names here are per the integration brief
  and should be pinned before coding.
- Whether Arc exposes canonical MockForwarder/KeystoneForwarder addresses or we deploy
  them; record both in `deployments/arc-testnet.md` once known.
- Socrata field stability: confirm `violationstatus`/`currentstatus` are the right
  columns for the dismissal-vs-cure distinction on current `wvxf-dwi5` rows.
