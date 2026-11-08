#!/usr/bin/env bash
# Run the verifier, a gateway (simulated TEE) and the agent demo against devnet.
# Requires a prior `bash scripts/deploy-devnet.sh` (writes .agentspay/deployment.json).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STATE="$ROOT/.agentspay"
grep -q '"network": "devnet"' "$STATE/deployment.json" || { echo "run scripts/deploy-devnet.sh first" >&2; exit 1; }

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

echo "▶ verifier (logs: .agentspay/verifier.log)"
POLL_MS=8000 bun apps/verifier/src/index.ts > "$STATE/verifier.log" 2>&1 &
pids+=($!)

echo "▶ gateway, simulated TEE (logs: .agentspay/gateway.log)"
ATTESTATION_POLL_MS=10000 SETTLE_EVERY_MS=60000 bun apps/gateway/src/index.ts > "$STATE/gateway.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 120); do
  curl -sf http://127.0.0.1:8787/healthz | grep -q '"attested":true' && break
  sleep 2
done

echo "▶ agent"
bun examples/agent-demo/src/index.ts

echo; echo "── gateway log (tail) ──"; tail -n 6 "$STATE/gateway.log"
echo "── verifier log (tail) ──"; tail -n 3 "$STATE/verifier.log"
