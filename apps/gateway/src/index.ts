/**
 * AgentsPay reference provider gateway.
 *
 *   GET  /.well-known/agentspay   -> payment challenge (prices, enclave keys, attestation)
 *   GET  /evidence/:hash          -> attestation evidence bundle (what verifiers check)
 *   POST /v1/chat/completions     -> OpenAI-compatible, paid per token via session vouchers
 *   POST /agentspay/close         -> cooperative close: final settle + refund in one tx
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  AgentsPayClient,
  AttestationStatus,
  canonicalEvidenceBytes,
  decodeVoucher,
  deserializeSigned,
  evidenceHash,
  HEADERS,
  nextTranscriptHash,
  PROTOCOL_ID,
  SEALED_CONTENT_TYPE,
  serializeSigned,
  SessionStatus,
  settleTarget,
  verifySignedMessage,
  wwwAuthenticate,
  type Challenge,
  type SealedEnvelope,
} from "@agentspay/sdk";
import { loadOrCreateKeypair } from "@agentspay/sdk/node";

import { GATEWAY_VERSION, loadConfig } from "./config.js";
import { SimulatedEnclave } from "./enclave/simulated.js";
import { TdxEnclave } from "./enclave/tdx.js";
import type { Enclave } from "./enclave/types.js";
import { runInference, type ChatRequest } from "./inference.js";
import { Ledger, type SessionLedger } from "./ledger.js";

const cfg = loadConfig();
const log = (...a: unknown[]) => console.log(`[gateway ${new Date().toISOString()}]`, ...a);
// Public RPCs rate-limit (429). A failed background poll must never take the gateway down.
process.on("unhandledRejection", (e) => log("unhandled rejection", String(e).slice(0, 300)));

const connection = new Connection(cfg.rpcUrl, "confirmed");
const operator = loadOrCreateKeypair(cfg.operatorKeypair);
const client = AgentsPayClient.fromKeypair(connection, operator, { programId: cfg.programId });
const ledger = new Ledger(cfg.ledgerPath);
const payout = cfg.payout ? new PublicKey(cfg.payout) : operator.publicKey;
const providerPda = client.pdas.provider(operator.publicKey);

const enclave: Enclave =
  cfg.tee === "tdx"
    ? new TdxEnclave()
    : new SimulatedEnclave({ version: GATEWAY_VERSION, backend: cfg.backend, model: cfg.upstreamModel });

let attestationPda: PublicKey | null = null;
let attested = false;

// ---------------------------------------------------------------------------
// Boot: register provider, publish evidence, submit attestation
// ---------------------------------------------------------------------------

async function boot() {
  if (cfg.network === "localnet" && (await connection.getBalance(operator.publicKey)) < LAMPORTS_PER_SOL) {
    await connection.confirmTransaction(await connection.requestAirdrop(operator.publicKey, 5 * LAMPORTS_PER_SOL));
  }
  if (!(await client.fetchProvider(providerPda))) {
    await client.registerProvider({ payout, endpoint: cfg.publicUrl });
    log("registered provider", providerPda.toBase58());
  } else {
    await client.updateProvider({ endpoint: cfg.publicUrl, payout });
  }

  const evidence = await enclave.evidence(providerPda);
  const hash = evidenceHash(evidence);
  const hashHex = Buffer.from(hash).toString("hex");
  mkdirSync(cfg.evidenceDir, { recursive: true });
  writeFileSync(join(cfg.evidenceDir, `${hashHex}.json`), canonicalEvidenceBytes(evidence));

  const { attestation } = await client.submitAttestation({
    enclaveKey: enclave.enclaveKey,
    encryptionKey: enclave.encryptionKey,
    teeType: enclave.teeType,
    measurement: enclave.measurement,
    evidenceHash: hash,
    evidenceUri: `${cfg.publicUrl}/evidence/${hashHex}`,
    requestedTtl: cfg.attestationTtl,
  });
  attestationPda = attestation;
  log("attestation submitted", attestation.toBase58(), "enclave key", enclave.enclaveKey.toBase58());
  log("waiting for verifier committee ...");
}

async function refreshAttestation() {
  if (!attestationPda) return;
  const a = await client.fetchAttestation(attestationPda);
  const was = attested;
  attested = !!a && a.status === AttestationStatus.Valid && a.expiresAt.toNumber() > Date.now() / 1000;
  if (attested && !was) log("attestation VALID until", new Date(a!.expiresAt.toNumber() * 1000).toISOString());
  if (!attested && was) log("attestation no longer valid; refusing paid requests");
}

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

function challenge(): Challenge {
  return {
    protocol: PROTOCOL_ID,
    network: cfg.network,
    programId: cfg.programId.toBase58(),
    provider: providerPda.toBase58(),
    payout: payout.toBase58(),
    attestation: attestationPda?.toBase58() ?? "",
    enclaveKey: enclave.enclaveKey.toBase58(),
    encryptionKey: Buffer.from(enclave.encryptionKey).toString("base64"),
    teeType: enclave.teeType,
    measurement: Buffer.from(enclave.measurement).toString("hex"),
    accepts: [
      {
        mint: cfg.mint.toBase58(),
        decimals: cfg.mintDecimals,
        pricePerUnit: cfg.pricePerUnit.toString(),
        unit: cfg.unit,
        minDeposit: cfg.minDeposit.toString(),
      },
    ],
    gracePeriodSeconds: cfg.gracePeriod,
    maxUnitsPerRequest: cfg.maxUnitsPerRequest,
    description: `AgentsPay gateway ${GATEWAY_VERSION} (${cfg.backend}:${cfg.upstreamModel})`,
  };
}

function paymentRequired(c: Context, reason: string, extra: Record<string, unknown> = {}) {
  const ch = challenge();
  c.header("www-authenticate", wwwAuthenticate(ch));
  return c.json({ error: "payment_required", reason, challenge: ch, ...extra }, 402);
}

// ---------------------------------------------------------------------------
// Session admission
// ---------------------------------------------------------------------------

async function admitSession(sessionAddr: string): Promise<SessionLedger | string> {
  const existing = ledger.get(sessionAddr);
  if (existing) return existing.closed ? "session closed" : existing;

  const s = await client.fetchSession(new PublicKey(sessionAddr));
  if (!s) return "session not found on-chain";
  if (!s.provider.equals(providerPda)) return "session is for another provider";
  if (!s.enclaveKey.equals(enclave.enclaveKey)) return "session is bound to a different enclave key";
  if (s.status !== SessionStatus.Open) return "session not open";
  if (!s.mint.equals(cfg.mint)) return "mint not accepted";
  if (BigInt(s.pricePerUnit.toString()) < cfg.pricePerUnit) return "price below provider rate";
  if (BigInt(s.deposit.toString()) < cfg.minDeposit) return "deposit below minimum";
  if (s.gracePeriod < cfg.gracePeriod) return "grace period too short";

  const entry: SessionLedger = {
    session: sessionAddr,
    authorizedSigner: s.authorizedSigner.toBase58(),
    mint: s.mint.toBase58(),
    pricePerUnit: s.pricePerUnit.toString(),
    deposit: s.deposit.toString(),
    acceptedCumulative: "0",
    voucher: null,
    units: "0",
    transcript: Buffer.alloc(32).toString("hex"),
    receipt: null,
    settled: s.settled.toString(),
    closed: false,
    updatedAt: Date.now(),
  };
  ledger.put(entry);
  log("admitted session", sessionAddr);
  return entry;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = new Hono();

app.get("/healthz", (c) => c.json({ ok: true, attested }));
app.get("/.well-known/agentspay", (c) => c.json(challenge()));
app.get("/evidence/:hash", (c) => {
  const hash = c.req.param("hash");
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: "bad hash" }, 400);
  const p = join(cfg.evidenceDir, `${hash}.json`);
  if (!existsSync(p)) return c.json({ error: "not found" }, 404);
  return c.body(readFileSync(p, "utf8"), 200, { "content-type": "application/json" });
});

app.post("/v1/chat/completions", async (c) => {
  if (!attested) return c.json({ error: "provider attestation not valid yet" }, 503);
  const sessionAddr = c.req.header(HEADERS.session);
  const voucherHeader = c.req.header(HEADERS.voucher);
  if (!sessionAddr || !voucherHeader) return paymentRequired(c, "open a session and send a voucher");

  const admitted = await admitSession(sessionAddr);
  if (typeof admitted === "string") return paymentRequired(c, admitted);

  // Decode the body first (outside the lock); sealed bodies are opened inside the enclave.
  const raw = new Uint8Array(await c.req.arrayBuffer());
  let sealedReq: SealedEnvelope | null = null;
  let chat: ChatRequest;
  try {
    if ((c.req.header("content-type") ?? "").startsWith(SEALED_CONTENT_TYPE)) {
      sealedReq = JSON.parse(new TextDecoder().decode(raw)) as SealedEnvelope;
      chat = JSON.parse(new TextDecoder().decode(enclave.openSealed(sealedReq))) as ChatRequest;
    } else {
      chat = JSON.parse(new TextDecoder().decode(raw)) as ChatRequest;
    }
  } catch {
    return c.json({ error: "invalid request body" }, 400);
  }
  if (!Array.isArray(chat.messages)) return c.json({ error: "messages required" }, 400);
  const maxUnits = Math.min(chat.max_tokens ?? cfg.maxUnitsPerRequest, cfg.maxUnitsPerRequest);

  return ledger.withLock(sessionAddr, async () => {
    const entry = ledger.get(sessionAddr)!;
    if (entry.closed) return paymentRequired(c, "session closed");
    const price = BigInt(entry.pricePerUnit);

    // --- voucher admission (single linearizable transition) -------------
    let signed;
    try {
      signed = deserializeSigned(voucherHeader);
    } catch {
      return paymentRequired(c, "malformed voucher");
    }
    if (!verifySignedMessage(signed, new PublicKey(entry.authorizedSigner))) {
      return paymentRequired(c, "voucher signature invalid or wrong signer");
    }
    let voucher;
    try {
      voucher = decodeVoucher(signed.message);
    } catch {
      return paymentRequired(c, "malformed voucher payload");
    }
    if (voucher.session.toBase58() !== sessionAddr) return paymentRequired(c, "voucher for another session");
    const nowS = BigInt(Math.floor(Date.now() / 1000));
    if (voucher.expiresAt !== 0n && voucher.expiresAt < nowS + 300n) {
      return paymentRequired(c, "voucher expires too soon to settle");
    }
    const required = (BigInt(entry.units) + BigInt(maxUnits)) * price;
    if (voucher.cumulativeAmount < required || voucher.cumulativeAmount < BigInt(entry.acceptedCumulative)) {
      return paymentRequired(c, "voucher does not cover this request", { required: required.toString() });
    }
    if (required > BigInt(entry.deposit)) {
      return paymentRequired(c, "deposit exhausted; top up or open a new session", { required: required.toString() });
    }
    entry.acceptedCumulative = voucher.cumulativeAmount.toString();
    entry.voucher = voucherHeader;
    ledger.put(entry);

    // --- inference inside the trusted boundary ---------------------------
    let result;
    try {
      result = await runInference(cfg, chat, maxUnits);
    } catch (e) {
      return c.json({ error: "inference failed", detail: String(e) }, 502);
    }
    const units = BigInt(Math.min(result.promptTokens + result.completionTokens, maxUnits));
    const responseBody = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      choices: [{ index: 0, message: { role: "assistant", content: result.content }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
      },
    };
    const responseText = JSON.stringify(responseBody);

    // --- enclave-signed cumulative receipt --------------------------------
    const cumulativeUnits = BigInt(entry.units) + units;
    const transcript = nextTranscriptHash(Buffer.from(entry.transcript, "hex"), raw, responseText);
    const receipt = enclave.signReceipt({
      session: new PublicKey(sessionAddr),
      cumulativeUnits,
      transcriptHash: transcript,
      issuedAt: nowS,
    });
    entry.units = cumulativeUnits.toString();
    entry.transcript = Buffer.from(transcript).toString("hex");
    entry.receipt = serializeSigned(receipt);
    ledger.put(entry);

    c.header(HEADERS.receipt, entry.receipt);
    c.header("x-agentspay-units", units.toString());
    c.header("x-agentspay-cost", (units * price).toString());
    if (sealedReq) {
      return c.json(enclave.sealReply(responseText, sealedReq), 200, { "content-type": SEALED_CONTENT_TYPE });
    }
    return c.body(responseText, 200, { "content-type": "application/json" });
  });
});

app.post("/agentspay/close", async (c) => {
  const { session } = (await c.req.json().catch(() => ({}))) as { session?: string };
  if (!session || !ledger.get(session)) return c.json({ error: "unknown session" }, 404);
  try {
    const result = await ledger.withLock(session, () => settleSession(session, true));
    return c.json(result);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

async function settleSession(sessionAddr: string, close: boolean) {
  const entry = ledger.get(sessionAddr)!;
  const s = await client.fetchSession(new PublicKey(sessionAddr));
  if (!s) {
    entry.closed = true;
    ledger.put(entry);
    return { session: sessionAddr, settled: entry.settled, closed: true, note: "already finalized" };
  }
  if (s.status === SessionStatus.Closed || !client.isSettleable(s, Math.floor(Date.now() / 1000))) {
    entry.closed = s.status === SessionStatus.Closed;
    entry.settled = s.settled.toString();
    ledger.put(entry);
    return { session: sessionAddr, settled: entry.settled, closed: entry.closed, note: "not settleable" };
  }
  const onchainSettled = BigInt(s.settled.toString());
  let pending = 0n;
  let final: { voucher: ReturnType<typeof deserializeSigned>; receipt: ReturnType<typeof deserializeSigned> } | undefined;
  if (entry.voucher && entry.receipt) {
    const voucher = deserializeSigned(entry.voucher);
    const receipt = deserializeSigned(entry.receipt);
    const target = settleTarget(
      decodeVoucher(voucher.message).cumulativeAmount,
      BigInt(entry.units),
      BigInt(entry.pricePerUnit),
      BigInt(s.deposit.toString()),
    );
    pending = target - onchainSettled;
    if (pending > 0n) final = { voucher, receipt };
  }

  let signature: string | null = null;
  if (close && s.status !== SessionStatus.Closed) {
    signature = await client.settleAndClose(new PublicKey(sessionAddr), final);
    entry.closed = true;
  } else if (final && pending >= cfg.settleMinAmount) {
    signature = await client.settle(new PublicKey(sessionAddr), final.voucher, final.receipt);
  }
  if (final && signature) entry.settled = (onchainSettled + pending).toString();
  ledger.put(entry);
  if (signature) log(close ? "settled+closed" : "settled", sessionAddr, `+${pending}`, signature);
  return { session: sessionAddr, settled: entry.settled, units: entry.units, closed: entry.closed, signature };
}

async function settlementTick() {
  await refreshAttestation().catch((e) => log("attestation refresh failed", String(e)));
  for (const entry of ledger.all()) {
    if (entry.closed || !entry.voucher || !entry.receipt) continue;
    await ledger
      .withLock(entry.session, () => settleSession(entry.session, false))
      .catch((e) => log("settle failed", entry.session, String(e).slice(0, 300)));
  }
}

// ---------------------------------------------------------------------------

await boot();
// idleTimeout: settle+close waits for on-chain confirmation, which can exceed Bun's 10s default.
Bun.serve({ fetch: app.fetch, port: cfg.port, idleTimeout: 120 });
log(`listening on ${cfg.publicUrl} (tee=${cfg.tee}, backend=${cfg.backend}, price=${cfg.pricePerUnit}/${cfg.unit})`);
setInterval(
  () => void refreshAttestation().catch((e) => log("attestation refresh failed", String(e).slice(0, 200))),
  cfg.attestationPollMs,
);
setInterval(() => void settlementTick(), cfg.settleEveryMs);
