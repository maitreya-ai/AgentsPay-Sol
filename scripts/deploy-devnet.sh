#!/usr/bin/env bash
# Deploy AgentsPay to devnet and bootstrap it.
#   - upgrade authority + admin = your Solana CLI wallet (ADMIN_KEYPAIR to override)
#   - needs ~6 devnet SOL during deploy (buffer is refunded; ~2.9 SOL stays as program rent)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RPC="${RPC_URL:-https://api.devnet.solana.com}"
ADMIN="${ADMIN_KEYPAIR:-$HOME/.config/solana/id.json}"
PROGRAM_KEYPAIR="target/deploy/agentspay-keypair.json"

[ -f "$PROGRAM_KEYPAIR" ] || { echo "missing $PROGRAM_KEYPAIR" >&2; exit 1; }
echo "▶ wallet $(solana address -k "$ADMIN"), balance $(solana balance -k "$ADMIN" -u "$RPC")"

echo "▶ building"
anchor build >/dev/null
bash scripts/sync-idl.sh

echo "▶ deploying $(solana address -k "$PROGRAM_KEYPAIR")"
solana program deploy target/deploy/agentspay.so \
  --program-id "$PROGRAM_KEYPAIR" \
  --upgrade-authority "$ADMIN" \
  --keypair "$ADMIN" \
  -u "$RPC" \
  --with-compute-unit-price 50000 --use-rpc \
  --max-sign-attempts 30

echo "▶ bootstrapping config"
RPC_URL="$RPC" ADMIN_KEYPAIR="$ADMIN" bun scripts/bootstrap.ts
