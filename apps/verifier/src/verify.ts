import { spawn } from "node:child_process";
import { PublicKey } from "@solana/web3.js";
import {
  evidenceHash,
  parseTdxQuote,
  reportData,
  TeeType,
  verifySimulatedQuote,
  type AttestationAccount,
  type EvidenceBundle,
  type SimulatedQuote,
} from "@agentspay/sdk";

export interface VerifyOptions {
  allowSimulated: boolean;
  /**
   * External DCAP verifier for Intel TDX/SGX quotes. Receives the raw quote
   * on stdin and must exit 0 only when the signature chain, TCB status and
   * collateral (PCK certs, TCB info, QE identity, CRLs) all check out.
   * e.g. `dcap-qvl verify -` or a wrapper around Intel's QVL.
   */
  dcapVerifyCmd?: string;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");
const fail = (reason: string): Verdict => ({ ok: false, reason });

async function runQuoteVerifier(cmd: string, quote: Uint8Array): Promise<Verdict> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolve(fail(`quote verifier failed to start: ${e.message}`)));
    child.on("close", (code) => resolve(code === 0 ? { ok: true } : fail(`quote verifier rejected (exit ${code}): ${err.slice(0, 200)}`)));
    child.stdin.end(Buffer.from(quote));
  });
}

/**
 * Checks an evidence bundle against the on-chain attestation record.
 *
 * Common to every TEE:
 *   1. sha256(canonical bundle) == attestation.evidence_hash
 *   2. bundle keys / measurement / tee type == on-chain record
 *   3. REPORTDATA[0..32] == sha256(domain | provider | enclave_key | encryption_key)
 * Then a TEE-specific hardware check.
 */
export async function verifyEvidence(
  att: AttestationAccount,
  bundle: EvidenceBundle,
  opts: VerifyOptions,
): Promise<Verdict> {
  if (hex(evidenceHash(bundle)) !== hex(Uint8Array.from(att.evidenceHash))) return fail("evidence hash mismatch");
  if (bundle.teeType !== att.teeType) return fail("tee type mismatch");
  if (bundle.provider !== att.provider.toBase58()) return fail("provider mismatch");
  if (bundle.enclaveKey !== att.enclaveKey.toBase58()) return fail("enclave key mismatch");
  if (bundle.encryptionKey !== hex(Uint8Array.from(att.encryptionKey))) return fail("encryption key mismatch");
  if (bundle.measurement !== hex(Uint8Array.from(att.measurement))) return fail("measurement mismatch");

  const binding = reportData(att.provider, att.enclaveKey, Uint8Array.from(att.encryptionKey));
  if (bundle.reportData !== hex(binding)) return fail("report data does not bind the enclave keys");

  const quote = new Uint8Array(Buffer.from(bundle.quote, "base64"));

  switch (bundle.teeType) {
    case TeeType.Simulated: {
      if (!opts.allowSimulated) return fail("simulated TEE not accepted by this verifier");
      let q: SimulatedQuote;
      try {
        q = JSON.parse(Buffer.from(quote).toString("utf8")) as SimulatedQuote;
        const out = verifySimulatedQuote(q);
        if (hex(out.measurement) !== bundle.measurement) return fail("quote measurement mismatch");
        if (hex(out.reportData.subarray(0, 32)) !== hex(binding)) return fail("quote report data mismatch");
        if (out.reportData.subarray(32).some((b) => b !== 0)) return fail("report data tail must be zero");
      } catch (e) {
        return fail(`simulated quote invalid: ${(e as Error).message}`);
      }
      return { ok: true };
    }

    case TeeType.IntelTdx: {
      let parsed;
      try {
        parsed = parseTdxQuote(quote);
      } catch (e) {
        return fail(`tdx quote unparseable: ${(e as Error).message}`);
      }
      if (hex(parsed.workloadMeasurement) !== bundle.measurement) return fail("TDX workload measurement mismatch");
      if (hex(parsed.reportData.subarray(0, 32)) !== hex(binding)) return fail("TDX REPORTDATA does not bind keys");
      if (!opts.dcapVerifyCmd) return fail("no DCAP verifier configured (set DCAP_VERIFY_CMD)");
      return runQuoteVerifier(opts.dcapVerifyCmd, quote);
    }

    case TeeType.AmdSevSnp:
    case TeeType.NvidiaCc:
    case TeeType.IntelSgx:
    case TeeType.AwsNitro:
      // Roadmap: SEV-SNP (VCEK chain via AMD KDS), NVIDIA CC (NRAS / nvtrust
      // GPU evidence, nonce = report data), Nitro (COSE doc + AWS root).
      return fail(`tee type ${TeeType[bundle.teeType]} not yet supported by this verifier`);
    default:
      return fail("unknown tee type");
  }
}

export async function fetchEvidence(uri: string, timeoutMs = 10_000): Promise<EvidenceBundle> {
  const u = new URL(uri);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`unsupported evidence uri scheme ${u.protocol}`);
  const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`evidence fetch ${res.status}`);
  const text = await res.text();
  if (text.length > 512 * 1024) throw new Error("evidence bundle too large");
  return JSON.parse(text) as EvidenceBundle;
}

export const shortKey = (k: PublicKey) => `${k.toBase58().slice(0, 6)}…`;
