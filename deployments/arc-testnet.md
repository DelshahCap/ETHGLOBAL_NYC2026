# Deployment — Arc testnet

| Field            | Value |
|------------------|-------|
| Network          | Arc testnet |
| Chain ID         | `5042002` |
| RPC              | `https://rpc.testnet.arc.network` |
| Deployer / owner | `0x49D056d8B39F32bc8bbfC58bd4f5cfd7f3a8627F` (keystore account `arcDeployer`) |
| Deployed at      | 2026-06-13, block `46884274` |
| Script           | `script/Deploy.s.sol:Deploy` |

## Contracts

| Contract        | Address |
|-----------------|---------|
| MockYieldSource | `0xB61090E2e397Cd7bda07be495A0554a7b6780736` |
| EscrowVault     | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` |

## Verification

- **EscrowVault — verified ✅** (source verified on the explorer, exact match, 2026-06-13):
  https://testnet.arcscan.app/address/0x83B757a2DB265c185Ed837564fC3b3de3052CF3D?tab=contract

## CRE oracle — Arc testnet

Chain selector (from the `@chainlink/cre-sdk` chain-selectors registry):

| Field | Value |
|-------|-------|
| Chain selector name | `arc-testnet` |
| Chain selector (numeric) | `3034092155422581607` |
| CRE CLI support | Arc testnet supported from CLI `v1.0.7+` |

CRE forwarders ([Forwarder Directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory)):

| Forwarder | Address | Use |
|-----------|---------|-----|
| MockKeystoneForwarder (simulation) | [`0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1`](https://testnet.arcscan.app/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1) | `cre workflow simulate --broadcast` |
| KeystoneForwarder (production) | [`0x76c9cf548b4179F8901cda1f8623568b58215E62`](https://testnet.arcscan.app/address/0x76c9cf548b4179F8901cda1f8623568b58215E62) | deployed workflows |

`EscrowVaultReceiver` takes one of these as its `forwarder` constructor arg
([`script/DeployReceiver.s.sol`](../script/DeployReceiver.s.sol)). After deploy, the
receiver is registered via `EscrowVault.setOracle`, and the CRE workflow's `config.json`
`consumerAddress` is set to the receiver.

### EscrowVaultReceiver — deployed (2026-06-13, block `46934843`)

| Field | Value |
|-------|-------|
| EscrowVaultReceiver | `0x92447cDB9c8598CACCCD71709e0f9095490Ae00f` |
| Forwarder | `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` (Arc MockKeystoneForwarder, simulation) |
| Vault | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` |
| Deployer | `0x49D056d8B39F32bc8bbfC58bd4f5cfd7f3a8627F` (keystore `arcDeployer`) |
| Script | `script/DeployReceiver.s.sol:DeployReceiver` |

Deployed with the simulation MockKeystoneForwarder; `setExpectedAuthor` /
`setExpectedWorkflowId` left unset (zero) since the MockForwarder supplies no metadata.

| Step | Tx hash |
|------|---------|
| Deploy EscrowVaultReceiver | `0x5528be8018b6b19d973c0543cca69610443d5f9770787b79f083a2a99652ed21` |
| `EscrowVault.setOracle(receiver)` | `0x554322e482d9db44d76f2d9437d95816522a08fe15db760607df7ba50ba5c237` |

Total paid: `0.0363404825` USDC (1,690,255 gas @ 21.5 gwei).

Wiring verification (read on-chain after deploy):

```
vault.oracle()                == 0x92447cDB9c8598CACCCD71709e0f9095490Ae00f  (receiver)         ✅
receiver.vault()              == 0x83B757a2DB265c185Ed837564fC3b3de3052CF3D  (EscrowVault)      ✅
receiver.getForwarderAddress() == 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1  (Mock forwarder)  ✅
receiver.getExpectedAuthor()  == 0x0  (unset)                                                    ✅
receiver.getExpectedWorkflowId() == 0x0  (unset)                                                 ✅
```

> Next: set the CRE workflow's `cre-workflow/hpd-oracle/config.json` `consumerAddress`
> to `0x92447cDB9c8598CACCCD71709e0f9095490Ae00f`.

## Configuration

| Param                 | Value | Notes |
|-----------------------|-------|-------|
| `EscrowVault.usdc`    | `0x3600000000000000000000000000000000000000` | Arc USDC predeploy (gas token, 6 decimals) |
| `EscrowVault.oracle`  | `0x49D056d8B39F32bc8bbfC58bd4f5cfd7f3a8627F` | Deployer stands in until Chainlink CRE forwarder is wired (`setOracle`) |
| `EscrowVault.owner`   | `0x49D056d8B39F32bc8bbfC58bd4f5cfd7f3a8627F` | Deployer |
| `MockYieldSource.vault` | `0x83B757a2DB265c185Ed837564fC3b3de3052CF3D` | Set via `setVault` in the deploy script |

## Deploy transactions

| Step | Tx hash |
|------|---------|
| Deploy MockYieldSource | `0xdd5286ec0abc75ec95d18617a27b64e0485920f58b4835d2def0594049f033f2` |
| `MockYieldSource.setVault` | `0xd3acaea4aacb89b6d87a66788254bc409b6bf5aacbd0801016a5435f61b4307a` |
| Deploy EscrowVault | `0x2169b3c4399aaee9b05f680bd4ac0f67ec2d004f646ef982ac17ab5478d7423f` |

Total paid: `0.04782967703137399` USDC (2,390,551 gas @ ~20.0 gwei).

## Wiring verification (read on-chain)

```
mock.vault()         == 0x83B757a2DB265c185Ed837564fC3b3de3052CF3D  (EscrowVault)   ✅
vault.yieldSource()  == 0xB61090E2e397Cd7bda07be495A0554a7b6780736  (MockYieldSource) ✅
vault.oracle()       == 0x49D056d8B39F32bc8bbfC58bd4f5cfd7f3a8627F  (deployer)      ✅
vault.usdc()         == 0x3600000000000000000000000000000000000000  (Arc USDC)      ✅
```

## Notes
- Broadcast/cache artifacts (`broadcast/`, `cache/`) are gitignored — they hold
  sensitive run data and are intentionally **not** committed.
- `MockYieldSource` is a demo yield source (no ERC-4626 inflation-attack guard);
  swap in a real on-Arc ERC-4626 USDC vault for production.
