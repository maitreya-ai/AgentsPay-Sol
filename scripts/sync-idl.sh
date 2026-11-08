#!/usr/bin/env bash
# Copy the Anchor-generated IDL + TS types into the SDK.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cp "$ROOT/target/idl/agentspay.json" "$ROOT/packages/sdk/src/idl/agentspay.json"
cp "$ROOT/target/types/agentspay.ts" "$ROOT/packages/sdk/src/idl/agentspay.ts"
echo "IDL synced to packages/sdk/src/idl"
