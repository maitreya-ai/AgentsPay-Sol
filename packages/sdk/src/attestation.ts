/**
 * Attestation evidence: key binding, evidence bundles and the simulated TEE.
 *
 * A provider's enclave generates two keys inside the TEE:
 *   - an Ed25519 *enclave key* that signs usage receipts, and
 *   - an X25519 *encryption key* that agents seal prompts to.
 * The hardware quote's REPORTDATA commits to both (and to the provider PDA)
 * via `reportData()`, so a verifier can prove the keys never left the enclave.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { sha384 } from "@noble/hashes/sha512";
import nacl from "tweetnacl";

import { REPORT_DATA_DOMAIN, TeeType } from "./constants.js";

export function reportData(
  provider: PublicKey,
  enclaveKey: PublicKey,
  encryptionKey: Uint8Array,
): Uint8Array {
  const domain = new TextEncoder().encode(REPORT_DATA_DOMAIN);
  const buf = new Uint8Array(domain.length + 96);
  buf.set(domain, 0);
  buf.set(provider.toBytes(), domain.length);
  buf.set(enclaveKey.toBytes(), domain.length + 32);
  buf.set(encryptionKey, domain.length + 64);
  return sha256(buf);
}

/** Portable evidence bundle that `evidence_uri` points at and `evidence_hash` commits to. */
export interface EvidenceBundle {
  version: 1;
  teeType: TeeType;
  provider: string;
  enclaveKey: string;
  encryptionKey: string; // hex
  /** 48-byte workload measurement, hex. */
  measurement: string;
  /** 32-byte REPORTDATA binding (first half of the 64-byte field), hex. */
  reportData: string;
  /** Raw vendor quote / attestation document, base64. */
  quote: string;
  /** Optional NVIDIA GPU evidence (base64 JSON) for TeeType.NvidiaCc. */
  gpuEvidence?: string;
  /** Free-form: image digest, model manifest, build provenance. */
  workload?: Record<string, string>;
}

export function canonicalEvidenceBytes(bundle: EvidenceBundle): Uint8Array {
  const sorted = Object.fromEntries(Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b)));
  return new TextEncoder().encode(JSON.stringify(sorted));
}

export function evidenceHash(bundle: EvidenceBundle): Uint8Array {
  return sha256(canonicalEvidenceBytes(bundle));
}

/**
 * TDX workload measurement used by AgentsPay:
 *   SHA-384(MRTD || RTMR0 || RTMR1 || RTMR2 || RTMR3)
 * so a single 48-byte value pins firmware, kernel, cmdline and the app layer.
 */
export function tdxWorkloadMeasurement(mrtd: Uint8Array, rtmrs: Uint8Array[]): Uint8Array {
  if (mrtd.length !== 48 || rtmrs.length !== 4 || rtmrs.some((r) => r.length !== 48)) {
    throw new Error("expected 48-byte MRTD and four 48-byte RTMRs");
  }
  const buf = new Uint8Array(48 * 5);
  buf.set(mrtd, 0);
  rtmrs.forEach((r, i) => buf.set(r, 48 * (i + 1)));
  return sha384(buf);
}

/** Measurement for the simulated TEE: SHA-384 of a workload descriptor string. */
export function simulatedMeasurement(descriptor: string): Uint8Array {
  return sha384(new TextEncoder().encode(descriptor));
}

// ---------------------------------------------------------------------------
// Simulated TEE (development only)
// ---------------------------------------------------------------------------
// The "simulated vendor" root key is public and deterministic. It stands in
// for Intel/AMD/NVIDIA certificate chains so the full verifier pipeline can be
// exercised without TEE hardware (localnet and the devnet demo). It proves
// nothing about real hardware: production deployments must set
// `allow_simulated_tee = false`.

const SIM_VENDOR_SEED = sha256(new TextEncoder().encode("agentspay:simulated-tee-vendor:v1"));
export const SIMULATED_VENDOR = nacl.sign.keyPair.fromSeed(SIM_VENDOR_SEED);

export interface SimulatedQuote {
  kind: "agentspay-simulated-quote-v1";
  measurement: string; // hex
  reportData: string; // hex (64 bytes: 32 binding + 32 zero)
  signature: string; // base64, by SIMULATED_VENDOR over measurement||reportData
}

export function makeSimulatedQuote(measurement: Uint8Array, binding: Uint8Array): SimulatedQuote {
  const rd = new Uint8Array(64);
  rd.set(binding, 0);
  const msg = new Uint8Array(48 + 64);
  msg.set(measurement, 0);
  msg.set(rd, 48);
  return {
    kind: "agentspay-simulated-quote-v1",
    measurement: Buffer.from(measurement).toString("hex"),
    reportData: Buffer.from(rd).toString("hex"),
    signature: Buffer.from(nacl.sign.detached(msg, SIMULATED_VENDOR.secretKey)).toString("base64"),
  };
}

export function verifySimulatedQuote(q: SimulatedQuote): { measurement: Uint8Array; reportData: Uint8Array } {
  if (q.kind !== "agentspay-simulated-quote-v1") throw new Error("not a simulated quote");
  const measurement = new Uint8Array(Buffer.from(q.measurement, "hex"));
  const rd = new Uint8Array(Buffer.from(q.reportData, "hex"));
  if (measurement.length !== 48 || rd.length !== 64) throw new Error("bad simulated quote lengths");
  const msg = new Uint8Array(112);
  msg.set(measurement, 0);
  msg.set(rd, 48);
  const ok = nacl.sign.detached.verify(msg, new Uint8Array(Buffer.from(q.signature, "base64")), SIMULATED_VENDOR.publicKey);
  if (!ok) throw new Error("simulated vendor signature invalid");
  return { measurement, reportData: rd };
}

// ---------------------------------------------------------------------------
// Intel TDX quote (v4) field extraction
// ---------------------------------------------------------------------------
// Header (48 B) followed by the TD report body (584 B). Offsets are relative
// to the start of the quote. Signature/certificate-chain verification is NOT
// done here; see apps/verifier for the DCAP verification hook.

export const TDX_QUOTE = {
  headerLen: 48,
  mrtd: 48 + 136,
  rtmr0: 48 + 328,
  reportData: 48 + 520,
  bodyEnd: 48 + 584,
} as const;

export function parseTdxQuote(quote: Uint8Array) {
  if (quote.length < TDX_QUOTE.bodyEnd) throw new Error("TDX quote too short");
  const version = quote[0] | (quote[1] << 8);
  const teeType = new DataView(quote.buffer, quote.byteOffset).getUint32(4, true);
  if (version !== 4 && version !== 5) throw new Error(`unsupported TDX quote version ${version}`);
  if (teeType !== 0x81) throw new Error("quote is not a TDX quote");
  const mrtd = quote.slice(TDX_QUOTE.mrtd, TDX_QUOTE.mrtd + 48);
  const rtmrs = [0, 1, 2, 3].map((i) => quote.slice(TDX_QUOTE.rtmr0 + 48 * i, TDX_QUOTE.rtmr0 + 48 * (i + 1)));
  const reportData = quote.slice(TDX_QUOTE.reportData, TDX_QUOTE.reportData + 64);
  return { version, mrtd, rtmrs, reportData, workloadMeasurement: tdxWorkloadMeasurement(mrtd, rtmrs) };
}

/** Measurement of the reference gateway when running in the simulated TEE. */
export function gatewaySimulatedMeasurement(opts: { version: string; backend: string; model: string }): Uint8Array {
  return simulatedMeasurement(`agentspay-gateway:${opts.version}|backend=${opts.backend}|model=${opts.model}`);
}
