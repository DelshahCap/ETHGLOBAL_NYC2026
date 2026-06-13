# NYC HPD Violation Tenant Protection <!-- temporary name — rename once finalized -->

> On-chain rent escrow that holds rent in USDC while a NYC HPD housing violation is
> open, releases it only on the **verified official HPD status**, and pays the yield
> earned while locked to the **tenant**.

Built for **ETHGlobal New York 2026** by the team at [Delshah Capital](https://www.delshah.com/).

![Architecture](./hpd_rent_escrow_privy_yield_architecture.png)

## What it is

In NYC, landlords must fix conditions flagged by **HPD** (Housing Preservation &
Development). A tenant's usual options are to keep paying and hope, or withhold and
risk eviction. This gives a third option: the tenant pays rent **into an on-chain
escrow** while an HPD violation is open. The funds are real and committed but locked —
the landlord gets them only once the violation is officially resolved, turning "please
fix my apartment" into a funded incentive. While locked, the escrowed USDC earns yield,
and that **yield goes to the tenant**.

Release keys off HPD's official status reported on-chain by an oracle — no party can
pull the funds unilaterally:

- `Closed` (corrected) → principal to **contractor + landlord** (contractor takes a fee)
- `Dismissed` → principal to **landlord**
- **yield → tenant**, in every path

## Stack

| Layer | Choice |
|---|---|
| Settlement chain | **Arc** (Circle's USDC-native L1); USDC is the gas token |
| Currency | **USDC** (6 decimals) |
| Oracle | **Chainlink CRE** reads HPD status off-chain, posts it on-chain |
| Data source | **NYC Open Data** — HPD Housing Maintenance Code Violations (`wvxf-dwi5`) |
| Wallets + yield | **Privy** (embedded wallets + Earn) |
| Contracts | Solidity 0.8.24, **Foundry** |

## Deployed contracts — Arc testnet (chain `5042002`)

| Contract | Address |
|---|---|
| **EscrowVault** (verified ✅) | [`0x83B757a2DB265c185Ed837564fC3b3de3052CF3D`](https://testnet.arcscan.app/address/0x83B757a2DB265c185Ed837564fC3b3de3052CF3D?tab=contract) |
| MockYieldSource | [`0xB61090E2e397Cd7bda07be495A0554a7b6780736`](https://testnet.arcscan.app/address/0xB61090E2e397Cd7bda07be495A0554a7b6780736) |
| USDC (Arc predeploy) | `0x3600000000000000000000000000000000000000` |

Full record: [`deployments/arc-testnet.md`](deployments/arc-testnet.md).

## Repo layout

```
src/           # contracts: EscrowVault, IYieldSource, MockYieldSource (share-based)
test/          # Foundry tests (forge test)
script/        # forge scripts: Deploy.s.sol, Smoke.s.sol
scripts/       # smoke.sh — cast-based live smoke test (runs on the Arc node)
deployments/   # per-network deployment records
docs/          # INTEGRATION.md (frontend/Privy guide)
specs/         # prompts, specs, planning artifacts that directed the AI
lib/           # forge-std, openzeppelin-contracts (git submodules)
```

## Build & test

```bash
forge build
forge test            # unit tests (share accounting, multi-escrow isolation, etc.)
forge test -vvv       # with traces
```

### Live smoke test (Arc testnet)

Arc's blocklist precompile can't run in forge's local EVM, so the end-to-end smoke
test uses `cast` to send transactions on the node:

```bash
./scripts/smoke.sh    # createEscrow → approve+fund → simulate yield → Dismissed → withdraw
```

It prompts for the `arcDeployer` keystore password and never reads a key from a file or
env.

## Frontend integration

See **[docs/INTEGRATION.md](docs/INTEGRATION.md)** — network details, addresses, the
full function/event reference (signatures and `Escrow` struct field order verified
against the contract), viem + cast examples, and Privy notes.

## Team

| Area | Owner |
|---|---|
| Arc contracts, Chainlink CRE, NYC Open Data | **Don** |
| Frontend, Privy wallets + Earn | **Nilesh** |

## AI usage

Per ETHGlobal "From Scratch" rules, AI-assisted work is attributed: prompts and specs
live in [`specs/`](specs/), a running log is in [`AI_USAGE.md`](AI_USAGE.md), and the
commit history is incremental and human-authored.
