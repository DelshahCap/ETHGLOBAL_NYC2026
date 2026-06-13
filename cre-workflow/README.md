# cre-workflow — HPD → EscrowVault oracle

Chainlink CRE TypeScript workflow that polls NYC HPD violation status and posts it to
the `EscrowVaultReceiver` on Arc, which forwards it to `EscrowVault.updateStatus`.
Implements [`specs/cre-oracle.md`](../specs/cre-oracle.md).

```
cre-workflow/
├── project.yaml          # RPC targets (arc-testnet)
├── secrets.yaml          # logical secret ids -> env var names (no values)
├── .env.example          # copy to .env (gitignored) and fill in
└── hpd-oracle/
    ├── main.ts           # the workflow
    ├── config.json       # schedule, escrows, consumerAddress, chainSelector, gasLimit
    ├── workflow.yaml      # artifacts (main.ts / config.json / secrets.yaml)
    ├── package.json       # @chainlink/cre-sdk@1.11.0, viem
    └── tsconfig.json
```

## What it does (per cron schedule)

1. For each `{ id, violationId }` in `config.json`, GET
   `…/wvxf-dwi5.json?violationid=<violationId>&$select=violationstatus,currentstatus`
   with the Socrata app token (sent as `X-App-Token`).
2. Map → `EscrowVault.Status`: `Open`→Open(0); `Close`+`currentstatus` contains
   `DISMISS`→Dismissed(2); else→Closed(1). Missing data → Open (stay locked).
   The fetch + JSON parse + mapping run **in node mode** (`runInNodeMode` +
   `consensusIdenticalAggregation`) so the DON reaches consensus on the mapped status.
3. **Skip `Open`** (nothing to settle). Otherwise `abi.encode(uint256 id, uint8 status)`
   (viem), `runtime.report({ encoderName:"evm", signingAlgo:"ecdsa", hashingAlgo:"keccak256" })`,
   and `EVMClient.writeReport` to `consumerAddress` (the `EscrowVaultReceiver`).

The payload shape matches `EscrowVaultReceiver._processReport` exactly:
`abi.decode(report, (uint256, uint8))`.

## Config

`hpd-oracle/config.json`:
- `consumerAddress` — set to the deployed **`EscrowVaultReceiver`** (placeholder
  `0x000…000` until it's deployed and registered via `EscrowVault.setOracle`).
- `chainSelector` — `"arc-testnet"` (chain-selector **name** for `getNetwork`; resolves
  to selector `3034092155422581607`, chain id `5042002`).
- `escrows` — the `{ id, violationId }` pairs to track (the example is a placeholder).
- `gasLimit` — gas for the `writeReport` → `updateStatus` call.

## Secrets

The Socrata token is a **CRE secret**, never committed. `secrets.yaml` maps the logical
id `SOCRATA_APP_TOKEN` to the env var of the same name; put the real value in `.env`
(gitignored). Copy `.env.example` → `.env` to set it up.

## Run

```bash
cd hpd-oracle
bun install        # installs @chainlink/cre-sdk + runs `bunx cre-setup`
cd ..
cre login          # required for simulate/deploy (CRE account)
cre workflow simulate hpd-oracle --target staging-settings
```

> Note: this project was authored against the installed `@chainlink/cre-sdk@1.11.0`
> type definitions and the CRE getting-started docs; `main.ts` type-checks with
> `bunx tsc --noEmit`. `cre init` and `cre workflow simulate/deploy` require a
> logged-in CRE account, so the scaffold here was assembled to match `cre init`'s
> output (built-in `hello-world-ts` template structure) rather than run through it.
