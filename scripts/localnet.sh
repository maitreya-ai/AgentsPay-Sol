#!/usr/bin/env bash
# Start a local validator with the AgentsPay program preloaded.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SO="$ROOT/target/deploy/agentspay.so"
PROGRAM_ID="EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT"
[ -f "$SO" ] || { echo "missing $SO, run: anchor build" >&2; exit 1; }
mkdir -p "$ROOT/.agentspay"
exec solana-test-validator \
  --reset --quiet \
  --ledger "$ROOT/.agentspay/ledger" \
  --rpc-port "${RPC_PORT:-8899}" \
  --bpf-program "$PROGRAM_ID" "$SO"
