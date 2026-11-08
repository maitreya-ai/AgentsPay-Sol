/**
 * AgentsPay attestation verifier (one member of the M-of-N committee).
 *
 * Watches for pending attestations, fetches their evidence bundle, verifies
 * the hardware quote and key binding off-chain, and co-signs on-chain with
 * `approve_attestation`. It also re-checks valid attestations and revokes any
 * whose evidence disappears or stops verifying (e.g. TCB recall).
 *
 * Roadmap: replace committee trust with a ZK proof of quote verification
 * (SP1 / RISC Zero DCAP guest -> Groth16 verified on-chain via alt_bn128).
 */
import { resolve } from "node:path";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { AgentsPayClient, AttestationStatus } from "@agentspay/sdk";
import { isLocalRpc, loadOrCreateKeypair, readDeployment, stateDir } from "@agentspay/sdk/node";

import { fetchEvidence, shortKey, verifyEvidence } from "./verify.js";

const dep = readDeployment();
const rpcUrl = process.env.RPC_URL ?? dep?.rpcUrl ?? "http://127.0.0.1:8899";
const programId = new PublicKey(process.env.PROGRAM_ID ?? dep?.programId ?? "EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT");
const keyPath = process.env.VERIFIER_KEYPAIR ?? resolve(stateDir(), "verifier-0.json");
const pollMs = Number(process.env.POLL_MS ?? 3_000);
const opts = {
  allowSimulated: (process.env.ALLOW_SIMULATED ?? "true") === "true",
  dcapVerifyCmd: process.env.DCAP_VERIFY_CMD,
};

const log = (...a: unknown[]) => console.log(`[verifier ${new Date().toISOString()}]`, ...a);
process.on("unhandledRejection", (e) => log("unhandled rejection", String(e).slice(0, 300)));
const connection = new Connection(rpcUrl, "confirmed");
const verifier = loadOrCreateKeypair(keyPath);
const client = AgentsPayClient.fromKeypair(connection, verifier, { programId });
const rejected = new Map<string, string>();

async function tick() {
  const config = await client.fetchConfig();
  if (!config.verifiers.some((v) => v.equals(verifier.publicKey))) {
    log(`${verifier.publicKey.toBase58()} is not in the verifier committee; idling`);
    return;
  }

  for (const { publicKey, account } of await client.pendingAttestations()) {
    if (account.approvals.some((a) => a.equals(verifier.publicKey))) continue;
    try {
      const bundle = await fetchEvidence(account.evidenceUri);
      const verdict = await verifyEvidence(account, bundle, opts);
      if (!verdict.ok) {
        if (rejected.get(publicKey.toBase58()) !== verdict.reason) log("REJECT", shortKey(publicKey), verdict.reason);
        rejected.set(publicKey.toBase58(), verdict.reason);
        continue;
      }
      const measurement = await client.fetchMeasurement(client.measurementFor(account));
      if (!measurement?.approved) {
        log("SKIP", shortKey(publicKey), "measurement not approved by governance");
        continue;
      }
      const sig = await client.approveAttestation(publicKey);
      log("APPROVED", publicKey.toBase58(), "provider", shortKey(account.provider), sig);
    } catch (e) {
      log("error verifying", shortKey(publicKey), String(e).slice(0, 300));
    }
  }
}

async function recheckValid() {
  const all = await client.program.account.attestation.all();
  for (const { publicKey, account } of all) {
    if (account.status !== AttestationStatus.Valid) continue;
    try {
      const bundle = await fetchEvidence(account.evidenceUri);
      const verdict = await verifyEvidence(account, bundle, opts);
      if (!verdict.ok) {
        log("REVOKING", publicKey.toBase58(), verdict.reason);
        await client.revokeAttestation(publicKey, 2);
      }
    } catch (e) {
      // Evidence temporarily unreachable is not grounds for revocation on its own.
      log("recheck failed", shortKey(publicKey), String(e).slice(0, 200));
    }
  }
}

if (isLocalRpc(rpcUrl) && (await connection.getBalance(verifier.publicKey)) < LAMPORTS_PER_SOL / 10) {
  await connection.confirmTransaction(await connection.requestAirdrop(verifier.publicKey, LAMPORTS_PER_SOL));
}
log(`verifier ${verifier.publicKey.toBase58()} watching ${programId.toBase58()} on ${rpcUrl}`);
log(`policy: simulated=${opts.allowSimulated} dcap=${opts.dcapVerifyCmd ?? "(none)"}`);
let n = 0;
for (;;) {
  await tick().catch((e) => log("tick failed", String(e).slice(0, 300)));
  if (++n % 20 === 0) await recheckValid().catch(() => undefined);
  await new Promise((r) => setTimeout(r, pollMs));
}
