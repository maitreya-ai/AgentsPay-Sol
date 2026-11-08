import type { PublicKey } from "@solana/web3.js";
import type { EvidenceBundle, SealedEnvelope, SignedMessage, TeeType, UsageReceipt } from "@agentspay/sdk";

/**
 * Everything that must live inside the trusted boundary.
 *
 * In production the whole gateway process runs inside a confidential VM
 * (Intel TDX / AMD SEV-SNP, with an NVIDIA H100/B200 in CC mode for the
 * model), so "enclave" means that VM: keys are generated at boot in memory,
 * never written to disk, and bound to the hardware quote via REPORTDATA.
 */
export interface Enclave {
  readonly teeType: TeeType;
  /** Ed25519 key that signs usage receipts. */
  readonly enclaveKey: PublicKey;
  /** X25519 public key agents seal prompts to. */
  readonly encryptionKey: Uint8Array;
  /** 48-byte workload measurement this enclave reports. */
  readonly measurement: Uint8Array;
  /** Produce a fresh evidence bundle binding the keys to `provider`. */
  evidence(provider: PublicKey): Promise<EvidenceBundle>;
  signReceipt(r: UsageReceipt): SignedMessage;
  openSealed(envelope: SealedEnvelope): Uint8Array;
  sealReply(plaintext: Uint8Array | string, request: SealedEnvelope): SealedEnvelope;
}
