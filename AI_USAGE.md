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
