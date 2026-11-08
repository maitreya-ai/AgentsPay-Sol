import { PublicKey } from "@solana/web3.js";

export const AGENTSPAY_PROGRAM_ID = new PublicKey("EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT");

export const SEEDS = {
  config: "config",
  measurement: "measurement",
  provider: "provider",
  attestation: "attestation",
  session: "session",
  vault: "vault",
  offering: "offering",
  creditMint: "credit_mint",
} as const;

export enum TeeType {
  Simulated = 0,
  IntelTdx = 1,
  AmdSevSnp = 2,
  IntelSgx = 3,
  /** NVIDIA Hopper/Blackwell confidential computing (GPU evidence + CPU CVM quote). */
  NvidiaCc = 4,
  AwsNitro = 5,
}

export enum AttestationStatus {
  Pending = 0,
  Valid = 1,
  Revoked = 2,
}

export enum SessionStatus {
  Open = 0,
  Closing = 1,
  Closed = 2,
}

export const VOUCHER_MAGIC = new TextEncoder().encode("APV1");
export const VOUCHER_LEN = 52;
export const RECEIPT_MAGIC = new TextEncoder().encode("APR1");
export const RECEIPT_LEN = 84;

/** Domain separator for the TEE `REPORTDATA` key binding. */
export const REPORT_DATA_DOMAIN = "agentspay:attest:v1";

export const MEASUREMENT_LEN = 48;
export const MAX_RATING = 100;

/** HTTP headers used by the AgentsPay session protocol. */
export const HEADERS = {
  session: "x-agentspay-session",
  voucher: "x-agentspay-voucher",
  receipt: "x-agentspay-receipt",
} as const;

export const SEALED_CONTENT_TYPE = "application/agentspay-sealed+json";
export const PROTOCOL_ID = "agentspay-session-v1";
