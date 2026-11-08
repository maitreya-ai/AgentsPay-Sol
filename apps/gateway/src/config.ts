import { resolve } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { readDeployment, stateDir } from "@agentspay/sdk/node";

const env = (k: string, d?: string) => process.env[k] ?? d;

export const GATEWAY_VERSION = "0.1.0";

export function loadConfig() {
  const dep = readDeployment();
  const port = Number(env("PORT", "8787"));
  const mint = env("ACCEPT_MINT", dep?.usdcMint);
  if (!mint) throw new Error("ACCEPT_MINT not set and no .agentspay/deployment.json (run `bun run bootstrap`)");
  const backend = env("MODEL_BACKEND", "echo") as "echo" | "openai";
  return {
    rpcUrl: env("RPC_URL", dep?.rpcUrl ?? "http://127.0.0.1:8899")!,
    network: env("NETWORK", dep?.network ?? "localnet") as "localnet" | "devnet" | "mainnet-beta" | "testnet",
    programId: new PublicKey(env("PROGRAM_ID", dep?.programId ?? "EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT")!),
    operatorKeypair: env("OPERATOR_KEYPAIR", resolve(stateDir(), "operator.json"))!,
    payout: env("PAYOUT"),
    port,
    publicUrl: env("PUBLIC_URL", `http://127.0.0.1:${port}`)!,
    tee: env("TEE", "simulated") as "simulated" | "tdx",
    mint: new PublicKey(mint),
    mintDecimals: Number(env("ACCEPT_MINT_DECIMALS", String(dep?.usdcDecimals ?? 6))),
    /** Base units per unit; default 20 = $20 per 1M tokens with a 6-decimals stablecoin. */
    pricePerUnit: BigInt(env("PRICE_PER_UNIT", "20")!),
    unit: env("UNIT", "token")!,
    maxUnitsPerRequest: Number(env("MAX_UNITS_PER_REQUEST", "4096")),
    minDeposit: BigInt(env("MIN_DEPOSIT", "100000")!),
    gracePeriod: Number(env("GRACE_PERIOD", "900")),
    attestationTtl: Number(env("ATTESTATION_TTL", String(24 * 3600))),
    settleEveryMs: Number(env("SETTLE_EVERY_MS", "15000")),
    settleMinAmount: BigInt(env("SETTLE_MIN_AMOUNT", "1")!),
    backend,
    upstreamUrl: env("UPSTREAM_URL", "http://127.0.0.1:11434"),
    upstreamModel: env("UPSTREAM_MODEL", backend === "echo" ? "echo-1" : "llama3.1:8b")!,
    upstreamApiKey: env("UPSTREAM_API_KEY"),
    ledgerPath: env("LEDGER_PATH", resolve(stateDir(), "gateway-ledger.json"))!,
    evidenceDir: env("EVIDENCE_DIR", resolve(stateDir(), "evidence"))!,
  };
}

export type GatewayConfig = ReturnType<typeof loadConfig>;
