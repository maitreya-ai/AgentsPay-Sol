import { randomUUID } from "node:crypto";
import { mkdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  open,
  parseTdxQuote,
  reportData,
  sealReply,
  signReceipt,
  TeeType,
  type EvidenceBundle,
  type SealedEnvelope,
  type UsageReceipt,
} from "@agentspay/sdk";

import type { Enclave } from "./types.js";

/** Linux configfs-tsm interface (kernel >= 6.7), available inside TDX guests. */
const TSM_REPORT_DIR = process.env.TSM_REPORT_DIR ?? "/sys/kernel/config/tsm/report";

export async function tdxQuote(reportData64: Uint8Array): Promise<Uint8Array> {
  if (reportData64.length !== 64) throw new Error("REPORTDATA must be 64 bytes");
  const dir = join(TSM_REPORT_DIR, `agentspay-${randomUUID()}`);
  await mkdir(dir);
  try {
    await writeFile(join(dir, "inblob"), reportData64);
    return new Uint8Array(await readFile(join(dir, "outblob")));
  } finally {
    await rmdir(dir).catch(() => undefined);
  }
}

/**
 * Intel TDX confidential VM. Keys are generated in guest memory at boot.
 * The workload measurement is derived from the quote itself
 * (SHA-384 of MRTD | RTMR0..3), so it can only be what the hardware measured.
 *
 * For GPU inference, pair this with NVIDIA CC mode and attach the GPU
 * evidence (nvtrust / NRAS token) in `gpuEvidence` (TeeType.NvidiaCc).
 */
export class TdxEnclave implements Enclave {
  readonly teeType = TeeType.IntelTdx;
  readonly #signer = Keypair.generate();
  readonly #box = nacl.box.keyPair();
  #measurement: Uint8Array | null = null;

  get enclaveKey(): PublicKey {
    return this.#signer.publicKey;
  }
  get encryptionKey(): Uint8Array {
    return this.#box.publicKey;
  }
  get measurement(): Uint8Array {
    if (!this.#measurement) throw new Error("call evidence() first");
    return this.#measurement;
  }

  async evidence(provider: PublicKey): Promise<EvidenceBundle> {
    const binding = reportData(provider, this.enclaveKey, this.encryptionKey);
    const rd = new Uint8Array(64);
    rd.set(binding, 0);
    const quote = await tdxQuote(rd);
    const parsed = parseTdxQuote(quote);
    this.#measurement = parsed.workloadMeasurement;
    return {
      version: 1,
      teeType: this.teeType,
      provider: provider.toBase58(),
      enclaveKey: this.enclaveKey.toBase58(),
      encryptionKey: Buffer.from(this.encryptionKey).toString("hex"),
      measurement: Buffer.from(parsed.workloadMeasurement).toString("hex"),
      reportData: Buffer.from(binding).toString("hex"),
      quote: Buffer.from(quote).toString("base64"),
      workload: {
        mrtd: Buffer.from(parsed.mrtd).toString("hex"),
        rtmr3: Buffer.from(parsed.rtmrs[3]).toString("hex"),
      },
    };
  }

  signReceipt(r: UsageReceipt) {
    return signReceipt(r, this.#signer);
  }
  openSealed(envelope: SealedEnvelope) {
    return open(envelope, this.#box.secretKey);
  }
  sealReply(plaintext: Uint8Array | string, request: SealedEnvelope) {
    return sealReply(plaintext, request, this.#box.secretKey);
  }
}
