/**
 * Example agent.
 *
 *  1. Discover providers on-chain that hold a *currently valid* hardware attestation.
 *  2. Fetch the provider's challenge and check its keys match the on-chain attestation
 *     (proves the HTTP endpoint is the attested enclave, not just the operator's host).
 *  3. Owner funds an AgentVault with a policy; the agent opens a session from it
 *     using an ephemeral voucher key (owner never signs per-request).
 *  4. Send sealed prompts; pay with cumulative vouchers; verify every enclave receipt.
 *  5. Cooperative close (provider settles once, refunds the rest), then rate the provider.
 */
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  AgentsPayClient,
  decodeReceipt,
  deserializeSigned,
  encodeVoucher,
  HEADERS,
  nextTranscriptHash,
  openReply,
  seal,
  SEALED_CONTENT_TYPE,
  serializeSigned,
  signMessage,
  TeeType,
  verifySignedMessage,
  ZERO_HASH,
  type Challenge,
  type SealedEnvelope,
} from "@agentspay/sdk";
import { loadOrCreateKeypair, readDeployment, stateDir } from "@agentspay/sdk/node";

const dep = readDeployment();
if (!dep) throw new Error("run `pnpm bootstrap` first");
const connection = new Connection(dep.rpcUrl, "confirmed");
const programId = new PublicKey(dep.programId);
const usdc = new PublicKey(dep.usdcMint);
const owner = loadOrCreateKeypair(resolve(stateDir(), "agent-owner.json"));
const agent = loadOrCreateKeypair(resolve(stateDir(), "agent.json"));
const ownerClient = AgentsPayClient.fromKeypair(connection, owner, { programId });
const agentClient = AgentsPayClient.fromKeypair(connection, agent, { programId });

const fmt = (base: bigint) => `${(Number(base) / 1e6).toFixed(6)} USDC`;
const step = (s: string) => console.log(`\n\x1b[1m▶ ${s}\x1b[0m`);
const balance = async (pk: PublicKey) => {
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(usdc, pk, true))).amount;
  } catch {
    return 0n;
  }
};

// 1. Discover ------------------------------------------------------------------
step("Discovering attested providers on-chain");
let providers = await agentClient.listProviders({ onlyAttested: true });
for (let i = 0; providers.length === 0 && i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  providers = await agentClient.listProviders({ onlyAttested: true });
}
if (!providers.length) throw new Error("no attested providers found (is the gateway + verifier running?)");
const chosen = providers[0];
const att = chosen.attestation!;
console.log(`  ${providers.length} attested provider(s); using ${chosen.address.toBase58()}`);
console.log(`  endpoint ${chosen.account.endpoint}`);
console.log(`  TEE ${TeeType[att.teeType]}, enclave key ${att.enclaveKey.toBase58()}`);
console.log(`  attestation valid until ${new Date(att.expiresAt.toNumber() * 1000).toISOString()}`);

// 2. Challenge must match chain -------------------------------------------------------
step("Checking the endpoint's challenge against the on-chain attestation");
const challenge = (await (await fetch(`${chosen.account.endpoint}/.well-known/agentspay`)).json()) as Challenge;
if (challenge.enclaveKey !== att.enclaveKey.toBase58()) throw new Error("endpoint enclave key != attested key");
if (Buffer.from(challenge.encryptionKey, "base64").toString("hex") !== Buffer.from(att.encryptionKey).toString("hex")) {
  throw new Error("endpoint encryption key != attested key");
}
const offer = challenge.accepts.find((a) => a.mint === usdc.toBase58());
if (!offer) throw new Error("provider does not accept our mint");
const price = BigInt(offer.pricePerUnit);
console.log(`  keys match ✔  price ${offer.pricePerUnit} base units / ${offer.unit}`);

// 3. Vault + session --------------------------------------------------------------
step("Owner funds an AgentVault; agent opens a session under its policy");
await connection.confirmTransaction(await connection.requestAirdrop(agent.publicKey, 2e9));
const vault = ownerClient.pdas.vault(owner.publicKey, agent.publicKey, usdc);
if (!(await ownerClient.fetchVault(vault))) {
  await ownerClient.createVault(agent.publicKey, usdc, {
    maxPerSession: 5_000_000n, // ≤ 5 USDC per session
    periodLimit: 20_000_000n, // ≤ 20 USDC per day
    periodSeconds: 86_400,
  });
}
const { createTransferInstruction } = await import("@solana/spl-token");
await ownerClient.sendIxs([
  createTransferInstruction(
    getAssociatedTokenAddressSync(usdc, owner.publicKey),
    getAssociatedTokenAddressSync(usdc, vault, true),
    owner.publicKey,
    10_000_000n,
  ),
]);
console.log(`  vault ${vault.toBase58()} balance ${fmt(await balance(vault))}`);

const sessionKey = Keypair.generate(); // ephemeral voucher signer, never touches funds
const deposit = 2_000_000n; // 2 USDC ceiling
const { session } = await agentClient.openSessionFromVault({
  vault,
  provider: chosen.address,
  mint: usdc,
  deposit,
  pricePerUnit: price,
  gracePeriod: challenge.gracePeriodSeconds,
  authorizedSigner: sessionKey.publicKey,
});
console.log(`  session ${session.toBase58()} escrowed ${fmt(deposit)}`);

// 4. Paid, sealed requests ----------------------------------------------------------
step("Sending sealed prompts, paying per token with cumulative vouchers");
const encKey = new Uint8Array(Buffer.from(challenge.encryptionKey, "base64"));
let units = 0n;
let transcript: Uint8Array = ZERO_HASH;
const prompts = [
  "Summarise why attestation-gated payments matter for AI agents.",
  "What happens to my deposit if the provider's TEE is revoked?",
  "Give me one sentence on tokenized GPU-hours.",
];
for (const prompt of prompts) {
  const body = JSON.stringify({ model: "any", messages: [{ role: "user", content: prompt }], max_tokens: 256 });
  const { envelope, ephemeralSecret } = seal(body, encKey);
  const sealedBody = JSON.stringify(envelope);
  // Authorise enough for everything so far + this request's maximum.
  const cumulative = (units + 256n) * price;
  const voucher = signMessage(encodeVoucher({ session, cumulativeAmount: cumulative, expiresAt: 0n }), sessionKey);

  const res = await fetch(`${chosen.account.endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": SEALED_CONTENT_TYPE,
      [HEADERS.session]: session.toBase58(),
      [HEADERS.voucher]: serializeSigned(voucher),
    },
    body: sealedBody,
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
  const reply = (await res.json()) as SealedEnvelope;
  const responseText = new TextDecoder().decode(openReply(reply, ephemeralSecret, encKey));
  const completion = JSON.parse(responseText);

  // Verify the enclave receipt: right key, right session, and our own transcript.
  const receipt = deserializeSigned(res.headers.get(HEADERS.receipt)!);
  if (!verifySignedMessage(receipt, att.enclaveKey)) throw new Error("receipt not signed by the attested enclave");
  const r = decodeReceipt(receipt.message);
  if (!r.session.equals(session)) throw new Error("receipt for another session");
  transcript = nextTranscriptHash(transcript, new TextEncoder().encode(sealedBody), responseText);
  if (Buffer.from(transcript).toString("hex") !== Buffer.from(r.transcriptHash).toString("hex")) {
    throw new Error("transcript mismatch: enclave metered something we did not see");
  }
  const used = r.cumulativeUnits - units;
  units = r.cumulativeUnits;
  console.log(`  ↳ "${completion.choices[0].message.content.slice(0, 70)}…"`);
  console.log(`    ${used} tokens, cumulative ${units} → owes ${fmt(units * price)} (receipt ✔ transcript ✔)`);
}

// 5. Close + rate ---------------------------------------------------------------
step("Cooperative close: provider settles once, escrow remainder returns to the vault");
const before = await balance(vault);
const closeRes = await fetch(`${chosen.account.endpoint}/agentspay/close`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ session: session.toBase58() }),
});
const closed = (await closeRes.json()) as { signature?: string; settled?: string; error?: string };
if (!closeRes.ok) throw new Error(`close failed: ${closed.error}`);
console.log(`  settled ${fmt(BigInt(closed.settled ?? "0"))} in one tx ${closed.signature}`);
console.log(`  vault refunded ${fmt((await balance(vault)) - before)}`);

step("Rating the provider with payment-backed feedback");
await agentClient.finalizeSession(session, 95);
const view = await agentClient.providerView(chosen.address);
console.log(`  provider stats: settlements=${view!.account.stats.settlements} units=${view!.account.stats.unitsServed} avgRating=${view!.averageRating}`);
console.log(`\n\x1b[32m✔ demo complete\x1b[0m`);
