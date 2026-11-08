/**
 * Localnet bootstrap: keys, a 6-decimals "USDC" mint, protocol config, and an
 * approved measurement for the reference gateway (simulated TEE).
 *
 *   pnpm localnet   # in one terminal (solana-test-validator with the program)
 *   pnpm bootstrap  # once
 */
import { resolve } from "node:path";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { AgentsPayClient, gatewaySimulatedMeasurement, TeeType } from "@agentspay/sdk";
import { loadOrCreateKeypair, readDeployment, stateDir, writeDeployment } from "@agentspay/sdk/node";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const programId = new PublicKey(process.env.PROGRAM_ID ?? "EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT");
const dir = stateDir();
const connection = new Connection(rpcUrl, "confirmed");

const admin = loadOrCreateKeypair(resolve(dir, "admin.json"));
const treasury = loadOrCreateKeypair(resolve(dir, "treasury.json"));
const verifier = loadOrCreateKeypair(resolve(dir, "verifier-0.json"));
const operator = loadOrCreateKeypair(resolve(dir, "operator.json"));
const agentOwner = loadOrCreateKeypair(resolve(dir, "agent-owner.json"));

async function airdrop(pk: PublicKey, sol: number) {
  if ((await connection.getBalance(pk)) >= sol * LAMPORTS_PER_SOL) return;
  const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

for (const k of [admin, verifier, operator, agentOwner]) await airdrop(k.publicKey, 10);

const existing = readDeployment();
let usdcMint: PublicKey;
if (existing && (await connection.getAccountInfo(new PublicKey(existing.usdcMint)))) {
  usdcMint = new PublicKey(existing.usdcMint);
} else {
  usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
  console.log("created test USDC mint", usdcMint.toBase58());
}

const ownerAta = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, agentOwner.publicKey);
await mintTo(connection, admin, usdcMint, ownerAta.address, admin, 1_000_000_000n); // 1,000 USDC

const client = AgentsPayClient.fromKeypair(connection, admin, { programId });
if (!(await connection.getAccountInfo(client.pdas.config()))) {
  await client.initialize({
    treasury: treasury.publicKey,
    verifiers: [verifier.publicKey],
    verifierThreshold: 1,
    protocolFeeBps: 100, // 1%
    maxAttestationTtl: 7 * 24 * 3600,
    allowSimulatedTee: true,
  });
  console.log("initialized config", client.pdas.config().toBase58());
}

// Governance approves the reference gateway build (echo backend) for the simulated TEE.
const backend = process.env.MODEL_BACKEND ?? "echo";
const model = process.env.UPSTREAM_MODEL ?? (backend === "echo" ? "echo-1" : "llama3.1:8b");
const measurement = gatewaySimulatedMeasurement({ version: "0.1.0", backend, model });
await client.approveMeasurement({
  teeType: TeeType.Simulated,
  value: measurement,
  modelHash: new Uint8Array(32),
  label: `agentspay-gateway 0.1.0 ${backend}:${model}`.slice(0, 64),
});
console.log("approved measurement", Buffer.from(measurement).toString("hex").slice(0, 24) + "…");

writeDeployment({
  rpcUrl,
  programId: programId.toBase58(),
  usdcMint: usdcMint.toBase58(),
  usdcDecimals: 6,
  treasury: treasury.publicKey.toBase58(),
  verifiers: [verifier.publicKey.toBase58()],
});
console.log(`wrote ${resolve(dir, "deployment.json")}`);
console.log(`agent owner ${agentOwner.publicKey.toBase58()} funded with 1,000 test USDC`);
