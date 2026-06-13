#!/usr/bin/env bash
set -euo pipefail

RPC="https://rpc.testnet.arc.network"
VAULT="0x83B757a2DB265c185Ed837564fC3b3de3052CF3D"
MOCK="0xB61090E2e397Cd7bda07be495A0554a7b6780736"
USDC="0x3600000000000000000000000000000000000000"
ME="0x49D056d8B39F32bc8bbfC58bd4f5cfd7f3a8627F"
PRINCIPAL=1000000   # 1 USDC (6dp)
YIELD=100000        # 0.1 USDC (6dp)

read -rsp "arcDeployer keystore password: " PW; echo
send() { cast send --rpc-url "$RPC" --account arcDeployer --password "$PW" "$@" >/dev/null; }
get()  { cast call --rpc-url "$RPC" "$@"; }

ID=$(get "$VAULT" "nextEscrowId()(uint256)")
echo "-> creating escrow id=$ID"
send "$VAULT" "createEscrow(address,address,address,uint256,uint256)" "$ME" "$ME" "$ME" 999999 0
echo "-> approving + funding $PRINCIPAL"
send "$USDC"  "approve(address,uint256)" "$VAULT" "$PRINCIPAL"
send "$VAULT" "fund(uint256,uint256)" "$ID" "$PRINCIPAL"
echo "-> simulating $YIELD yield into the pool"
send "$USDC"  "transfer(address,uint256)" "$MOCK" "$YIELD"
echo "-> oracle posts Dismissed"
send "$VAULT" "updateStatus(uint256,uint8)" "$ID" 2
echo "withdrawable[me] = $(get "$VAULT" "withdrawable(address)(uint256)" "$ME")  (expect 1100000)"
echo "-> withdrawing"
send "$VAULT" "withdraw()"
echo "withdrawable[me] after = $(get "$VAULT" "withdrawable(address)(uint256)" "$ME")  (expect 0)"
echo "smoke test complete"
