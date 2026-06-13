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
