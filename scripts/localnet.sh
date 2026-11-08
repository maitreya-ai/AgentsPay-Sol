#!/usr/bin/env bash
# Start a local validator with the AgentsPay program preloaded as an
# upgradeable program whose upgrade authority is the local admin key
# (required by `initialize`).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SO="$ROOT/target/deploy/agentspay.so"
PROGRAM_ID="EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT"
STATE="$ROOT/.agentspay"
ADMIN="${ADMIN_KEYPAIR:-$STATE/admin.json}"
[ -f "$SO" ] || { echo "missing $SO, run: anchor build" >&2; exit 1; }
mkdir -p "$STATE"
[ -f "$ADMIN" ] || solana-keygen new --no-bip39-passphrase --silent -o "$ADMIN" >/dev/null
exec solana-test-validator \
  --reset --quiet \
  --ledger "$STATE/ledger" \
  --rpc-port "${RPC_PORT:-8899}" \
  --upgradeable-program "$PROGRAM_ID" "$SO" "$ADMIN"
