/**
 * Bootstrap a deployment: keys, a 6-decimals test USDC mint, protocol config,
 * and an approved measurement for the reference gateway (simulated TEE).
 *
 *   Localnet: bun run localnet  (terminal 1)  then  bun run bootstrap
 *   Devnet:   RPC_URL=https://api.devnet.solana.com ADMIN_KEYPAIR=~/.config/solana/id.json bun run bootstrap
 *
 * `initialize` only succeeds when ADMIN_KEYPAIR is the program's upgrade authority.
 * On devnet, helper keys are funded by transfer from the admin (no faucet).
 */
import { resolve } from "node:path";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Keypair,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { AgentsPayClient, gatewaySimulatedMeasurement, TeeType } from "@agentspay/sdk";
import {
  isLocalRpc,
  loadKeypair,
  loadOrCreateKeypair,
  readDeployment,
  stateDir,
  writeDeployment,
  type LocalDeployment,
} from "@agentspay/sdk/node";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const local = isLocalRpc(rpcUrl);
const network = local ? "localnet" : rpcUrl.includes("devnet") ? "devnet" : rpcUrl.includes("testnet") ? "testnet" : "mainnet-beta";
if (network === "mainnet-beta") throw new Error("bootstrap is for localnet/devnet only");

const programId = new PublicKey(process.env.PROGRAM_ID ?? "EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT");
const dir = stateDir();
const connection = new Connection(rpcUrl, "confirmed");

const admin = process.env.ADMIN_KEYPAIR ? loadKeypair(process.env.ADMIN_KEYPAIR) : loadOrCreateKeypair(resolve(dir, "admin.json"));
const treasury = loadOrCreateKeypair(resolve(dir, "treasury.json"));
const verifier = loadOrCreateKeypair(resolve(dir, "verifier-0.json"));
const operator = loadOrCreateKeypair(resolve(dir, "operator.json"));
const agentOwner = loadOrCreateKeypair(resolve(dir, "agent-owner.json"));

console.log(`network ${network} (${rpcUrl}), admin ${admin.publicKey.toBase58()}`);

async function fund(k: Keypair, sol: number) {
  const want = Math.round(sol * LAMPORTS_PER_SOL);
  const have = await connection.getBalance(k.publicKey);
  if (have >= want) return;
  if (local) {
    await connection.confirmTransaction(await connection.requestAirdrop(k.publicKey, want - have), "confirmed");
  } else {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k.publicKey, lamports: want - have }),
    );
    await sendAndConfirmTransaction(connection, tx, [admin]);
  }
}

if (local) await fund(admin, 10);
// Devnet budgets are small on purpose: enough for rent + fees of the demo.
const budget = local ? { verifier: 10, operator: 10, owner: 10 } : { verifier: 0.05, operator: 0.2, owner: 0.3 };
await fund(verifier, budget.verifier);
await fund(operator, budget.operator);
await fund(agentOwner, budget.owner);

const existing = readDeployment();
let usdcMint: PublicKey;
if (existing?.network === network && (await connection.getAccountInfo(new PublicKey(existing.usdcMint)))) {
  usdcMint = new PublicKey(existing.usdcMint);
} else {
  usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
  console.log("created test USDC mint", usdcMint.toBase58());
}

const ownerAta = await getOrCreateAssociatedTokenAccount(connection, admin, usdcMint, agentOwner.publicKey);
await mintTo(connection, admin, usdcMint, ownerAta.address, admin, 1_000_000_000n); // 1,000 test USDC

const client = AgentsPayClient.fromKeypair(connection, admin, { programId });
if (!(await connection.getAccountInfo(client.pdas.config()))) {
  await client.initialize({
    treasury: treasury.publicKey,
    verifiers: [verifier.publicKey],
    verifierThreshold: 1,
    protocolFeeBps: 100, // 1%
    maxAttestationTtl: 7 * 24 * 3600,
    allowSimulatedTee: true, // localnet/devnet only
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

const deployment: LocalDeployment = {
  network,
  rpcUrl,
  programId: programId.toBase58(),
  usdcMint: usdcMint.toBase58(),
  usdcDecimals: 6,
  treasury: treasury.publicKey.toBase58(),
  verifiers: [verifier.publicKey.toBase58()],
};
writeDeployment(deployment);
if (!local) {
  // Public addresses only; safe to commit.
  const path = resolve(import.meta.dir, "..", "deployments", `${network}.json`);
  writeDeployment({ ...deployment, rpcUrl: `https://api.${network}.solana.com` }, path);
  console.log(`wrote ${path}`);
}
console.log(`wrote ${resolve(dir, "deployment.json")}`);
console.log(`agent owner ${agentOwner.publicKey.toBase58()} funded with 1,000 test USDC`);
