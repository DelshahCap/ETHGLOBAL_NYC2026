# AI Usage Log

A running record of where AI (Claude Code, Opus 4.8) assisted on this project and
which files each session touched. Per ETHGlobal "From Scratch" rules, AI is a
directed tool: a human authors every commit, reviews every diff, and AI
attribution stays on (Co-Authored-By trailer). Prompts, specs, and planning
artifacts that directed the AI live in [specs/](specs/).

## Log

### 2026-06-13 — Repo setup
- **Directed by:** Don
- **What:** Bootstrapped the repository scaffolding for the build.
- **Files touched:**
  - `CLAUDE.md` — committed the project-context file (authored separately).
  - `AI_USAGE.md` — created this log, seeded with this session.
  - `specs/README.md` — created the specs folder and its README.
  - `.gitignore` — added Foundry + Node ignore rules.
- **Notes:** Each step landed as its own commit. `forge init` was deferred —
  Foundry is not yet installed in this environment; the contracts will be
  scaffolded in a later session.

### 2026-06-13 — Foundry setup + EscrowVault skeleton
- **Directed by:** Don
- **What:** Installed Foundry, initialized the project over the existing repo
  (preserving LICENSE/README.md/CLAUDE.md), added OpenZeppelin contracts with
  remappings, and wrote the `EscrowVault` + `IYieldSource` state/signature
  skeleton (TODO bodies, no release logic yet). `forge build` passes.
- **Files touched:** `foundry.toml`, `src/EscrowVault.sol`, `src/IYieldSource.sol`,
  `specs/escrow-vault.md`, `lib/` (forge-std, openzeppelin-contracts), `.gitmodules`.

### 2026-06-13 — Escrow logic + tests + deploy
- **Directed by:** Don (pasted exact MockYieldSource + a step-by-step impl spec).
- **What:** Implemented `MockYieldSource`, wired `createEscrow`/`fund`, and filled in
  the release logic (`updateStatus`/`_settle`/pull-payment `withdraw`) with a
  `contractorFee` split. Added a Forge test suite and a deploy script. Landed as
  three logical commits (mock + wiring → release logic → tests + deploy).
  `forge build` clean; `forge test` 6/6 green.
- **Files touched:** `src/MockYieldSource.sol`, `src/EscrowVault.sol`,
  `test/EscrowVault.t.sol`, `script/Deploy.s.sol`, `specs/escrow-vault.md`.

### 2026-06-13 — Share-based yield accounting (multi-escrow)
- **Directed by:** Don (pasted exact `IYieldSource`/`MockYieldSource` + step-by-step
  spec for the breaking change).
- **What:** Reworked the yield source to an ERC-4626-style share model so each escrow
  redeems its own principal + only its proportional share of pooled yield. One commit
  (breaking interface change). Added a multi-escrow proportional-yield test; updated
  the existing tests for the new struct/getter shape and refreshed the spec.
  `forge build` clean; `forge test` 7/7 green.
- **Files touched:** `src/IYieldSource.sol`, `src/MockYieldSource.sol`,
  `src/EscrowVault.sol`, `test/EscrowVault.t.sol`, `specs/escrow-vault.md`.

### 2026-06-13 — Multi-escrow isolation tests
- **Directed by:** Don
- **What:** Expanded the test suite to prove share-accounting properties:
  `test_MultipleEscrowsIsolatedYield` (settling one escrow never credits another's
  parties; unsettled value stays pooled; totals conserved) and
  `test_YieldProportionalToDepositTiming` (yield attributed by time-in-pool, not
  equally). Added `Parties`/`_parties`/`_credited`/`_fund` test helpers; refactored
  to keep within the EVM stack limit (no `via_ir`). `forge test` 9/9 green.
- **Files touched:** `test/EscrowVault.t.sol`.

### 2026-06-13 — Arc testnet deployment
- **Directed by:** Don (ran the keystore-signed broadcast himself — the keystore
  password prompt needs an interactive TTY, which the AI's shell lacks; AI never
  handled the key or password).
- **What:** AI prepared/validated the deploy, then verified the live wiring on-chain
  (`mock.vault() == EscrowVault`, reciprocal `yieldSource`/`oracle`/`usdc`) and
  recorded addresses in `deployments/arc-testnet.md`. Broadcast/cache artifacts left
  gitignored (not committed).
- **Files touched:** `deployments/arc-testnet.md`.

### 2026-06-13 — Integration guide + README + verified marker
- **Directed by:** Don
- **What:** Wrote `docs/INTEGRATION.md` (frontend/Privy guide for Nilesh), rewrote
  `README.md` to a concise overview, and marked EscrowVault verified in
  `deployments/arc-testnet.md`. All function signatures, the `Escrow` struct field
  order, the Status enum, and the event params in the guide were cross-checked against
  `src/EscrowVault.sol`.
- **Files touched:** `docs/INTEGRATION.md`, `README.md`, `deployments/arc-testnet.md`.

### 2026-06-13 — Doc corrections (yield source, fee revert)
- **Directed by:** Don
- **What:** Clarified that escrow yield comes from the contract's on-chain
  `IYieldSource` (MockYieldSource on testnet, ERC-4626 in production), with Privy
  providing embedded wallets only — across `README.md` and `CLAUDE.md`
  (`specs/escrow-vault.md` already stated this). Reworded the `FeeExceedsPrincipal`
  note in `docs/INTEGRATION.md` to make clear `fund()` reverts, not `createEscrow`.
  Verified the README architecture image link matches the actual file (no change).
- **Files touched:** `README.md`, `CLAUDE.md`, `docs/INTEGRATION.md`.

### 2026-06-13 — CRE HPD oracle spec
- **Directed by:** Don
- **What:** Wrote `specs/cre-oracle.md` specifying the HPD → Chainlink CRE →
  EscrowVault integration: cron TS workflow polling Socrata `wvxf-dwi5` and mapping to
  the Status enum, an `EscrowVaultReceiver` (ReceiverTemplate) decoding
  `abi.encode(uint256 id, uint8 status)` and calling `updateStatus`, the
  KeystoneForwarder delivery flow, and sim (MockForwarder) vs prod (KeystoneForwarder).
  Grounded in `src/EscrowVault.sol`, `src/IYieldSource.sol`, `deployments/arc-testnet.md`.
- **Files touched:** `specs/cre-oracle.md`.

### 2026-06-13 — EscrowVaultReceiver + CRE vendored sources
- **Directed by:** Don
- **What:** Vendored Chainlink's exact `ReceiverTemplate.sol`/`IReceiver.sol`/
  `IERC165.sol` into `src/cre/` (fetched verbatim from the canonical docs samples,
  `smartcontractkit/documentation` `public/samples/CRE/`, via `gh`). Wrote
  `src/EscrowVaultReceiver.sol` (inherits `ReceiverTemplate`, decodes
  `(uint256 id, uint8 status)` in `_processReport`, calls `vault.updateStatus`) and
  `test/EscrowVaultReceiver.t.sol` (MockForwarder delivers reports; asserts Closed and
  Dismissed settlements + forwarder-only auth). `forge test` 12/12 green.
- **AI note:** AI used WebSearch/WebFetch + `gh api` to retrieve the *exact* upstream
  sources rather than reconstructing them from memory.
- **Files touched:** `src/cre/*.sol`, `src/EscrowVaultReceiver.sol`,
  `test/EscrowVaultReceiver.t.sol`.

### 2026-06-13 — CRE HPD→EscrowVault workflow
- **Directed by:** Don
- **What:** Installed the CRE CLI (v1.20.0) + bun; scaffolded a TS workflow under
  `cre-workflow/` and implemented the HPD oracle per `specs/cre-oracle.md` (cron →
  per-escrow Socrata `wvxf-dwi5` fetch in node mode → map to Status → `runtime.report`
  → `EVMClient.writeReport` to the receiver). Added `config.json`, `project.yaml`,
  `workflow.yaml`, and `secrets.yaml` (Socrata token kept in gitignored `.env`).
- **AI note:** Rather than guess SDK syntax, AI read the installed
  `@chainlink/cre-sdk@1.11.0` type defs in `node_modules` (cron/HTTP/EVMClient/getNetwork/
  report/getSecret) and the getting-started TS snippets, and confirmed the Arc selector
  (`arc-testnet` = 3034092155422581607) from the SDK's chain-selectors registry.
  `main.ts` type-checks (`bunx tsc --noEmit`). `cre init`/simulate need a logged-in CRE
  account, so the scaffold was assembled to match `cre init`'s `hello-world-ts` output.
- **Files touched:** `cre-workflow/**` (excl. gitignored `node_modules`/`.env`).
