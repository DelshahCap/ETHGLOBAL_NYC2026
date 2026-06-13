# CLAUDE.md — Project Context

## What this is
On-chain rent escrow tied to NYC HPD housing-code violations. While a violation
is open on a tenant's apartment, rent (USDC) is paid into an on-chain escrow
vault instead of to the landlord. Funds unlock only on a verified change in
HPD's official violation status. Yield earned while locked goes to the tenant.

ETHGlobal NY 2026 — Classic "From Scratch" track. All work begins after event
start; commit history must show incremental, human-directed progress.

## Release logic
- Source of truth: NYC Open Data HPD Housing Maintenance Code Violations dataset
  (`wvxf-dwi5`, Socrata SODA API).
- An authorized oracle posts HPD's official status on-chain. Release keys off
  that official status only — no party can trigger release unilaterally.
- closed (corrected) -> contractor + landlord
- dismissed         -> landlord
- accrued yield      -> tenant, in every release path
- Funds stay locked while the violation is open.

## Stack
- Settlement: Arc (Circle's USDC-native L1). EVM-compatible; USDC is the gas
  token, not ETH. Use Foundry. Testnet only; fund via Circle faucet.
- Currency: USDC.
- Oracle: Chainlink CRE reads the HPD API off-chain, runs consensus, writes
  status on-chain. Make the contract's oracle a settable, access-controlled
  role so a relayer can stand in if a CRE->Arc write path isn't ready in time.
- Wallets + yield: Privy + Privy Earn (partner-owned).

## Team scope
- Don: Arc contracts (escrow vault, yield position, release logic), Chainlink
  CRE integration, NYC Open Data connection.
- Nilesh: frontend, Privy wallets + Earn.

## Open decisions
- Funds custody: locked funds in the escrow contract (contract integrates an
  on-Arc yield source) vs. a Privy-managed wallet. Default to contract-custody
  for trustlessness.
- Pooled vs per-escrow yield accounting: for the demo, one active escrow; note
  pooling (ERC-4626 shares) as future work.

## Working rules
- Commit incrementally, one logical change per commit, clear messages.
- Keep AI attribution ON (Co-Authored-By trailer). Human is the commit author.
- Log AI usage in AI_USAGE.md; keep all prompts/specs/planning in specs/.
- Ask before edits; human reviews every diff.