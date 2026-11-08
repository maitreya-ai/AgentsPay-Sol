#!/usr/bin/env bash
# One-shot end-to-end demo on localnet:
# validator -> bootstrap -> verifier -> gateway (simulated TEE) -> agent.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STATE="$ROOT/.agentspay"
mkdir -p "$STATE"
rm -f "$STATE/deployment.json" "$STATE/gateway-ledger.json"

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

echo "▶ starting solana-test-validator (logs: .agentspay/validator.log)"
bash scripts/localnet.sh > "$STATE/validator.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 60); do
  solana cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1 && break
  sleep 1
done

echo "▶ bootstrapping protocol config, test USDC, measurement"
bun scripts/bootstrap.ts

echo "▶ starting verifier (logs: .agentspay/verifier.log)"
bun apps/verifier/src/index.ts > "$STATE/verifier.log" 2>&1 &
pids+=($!)

echo "▶ starting gateway with simulated TEE (logs: .agentspay/gateway.log)"
SETTLE_EVERY_MS=5000 bun apps/gateway/src/index.ts > "$STATE/gateway.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8787/healthz | grep -q '"attested":true' && break
  sleep 1
done

echo "▶ running agent"
bun examples/agent-demo/src/index.ts

echo
echo "── gateway log (tail) ──"; tail -n 8 "$STATE/gateway.log"
echo "── verifier log (tail) ──"; tail -n 5 "$STATE/verifier.log"
