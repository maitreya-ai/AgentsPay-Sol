import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  gatewaySimulatedMeasurement,
  makeSimulatedQuote,
  open,
  reportData,
  sealReply,
  signReceipt,
  TeeType,
  type EvidenceBundle,
  type SealedEnvelope,
  type UsageReceipt,
} from "@agentspay/sdk";

import type { Enclave } from "./types.js";

/**
 * Development-only TEE. Keys are in-process; the "quote" is signed by the
 * public simulated-vendor key. Mainnet configs reject `TeeType.Simulated`.
 */
export class SimulatedEnclave implements Enclave {
  readonly teeType = TeeType.Simulated;
  readonly measurement: Uint8Array;
  readonly #signer = Keypair.generate();
  readonly #box = nacl.box.keyPair();

  constructor(workload: { version: string; backend: string; model: string }) {
    this.measurement = gatewaySimulatedMeasurement(workload);
  }

  get enclaveKey(): PublicKey {
    return this.#signer.publicKey;
  }

  get encryptionKey(): Uint8Array {
    return this.#box.publicKey;
  }

  async evidence(provider: PublicKey): Promise<EvidenceBundle> {
    const binding = reportData(provider, this.enclaveKey, this.encryptionKey);
    const quote = makeSimulatedQuote(this.measurement, binding);
    return {
      version: 1,
      teeType: this.teeType,
      provider: provider.toBase58(),
      enclaveKey: this.enclaveKey.toBase58(),
      encryptionKey: Buffer.from(this.encryptionKey).toString("hex"),
      measurement: Buffer.from(this.measurement).toString("hex"),
      reportData: Buffer.from(binding).toString("hex"),
      quote: Buffer.from(JSON.stringify(quote)).toString("base64"),
      workload: { kind: "simulated", note: "development only" },
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
