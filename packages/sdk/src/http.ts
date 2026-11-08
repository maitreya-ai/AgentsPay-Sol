/**
 * HTTP side of the session protocol.
 *
 *   1. Agent calls a paid endpoint without a session -> 402 + `Challenge`
 *      (also advertised at GET /.well-known/agentspay).
 *   2. Agent checks the challenge against chain state (provider PDA, active
 *      attestation, enclave + encryption keys) and opens a session on-chain.
 *   3. Each request carries `x-agentspay-session` and a cumulative voucher in
 *      `x-agentspay-voucher`. The enclave answers with a cumulative usage
 *      receipt in `x-agentspay-receipt`.
 *   4. The provider settles on-chain with the latest voucher + receipt pair.
 */
import { PROTOCOL_ID, TeeType } from "./constants.js";

export interface Challenge {
  protocol: typeof PROTOCOL_ID;
  network: "mainnet-beta" | "devnet" | "testnet" | "localnet";
  programId: string;
  provider: string;
  payout: string;
  attestation: string;
  enclaveKey: string;
  /** X25519 key for sealed prompts, base64. */
  encryptionKey: string;
  teeType: TeeType;
  measurement: string;
  /** Accepted SPL mints with prices. */
  accepts: Array<{
    mint: string;
    decimals: number;
    pricePerUnit: string;
    unit: string;
    minDeposit: string;
  }>;
  gracePeriodSeconds: number;
  /** Max units a single request may consume (vouchers must cover it in advance). */
  maxUnitsPerRequest: number;
  description?: string;
}

/** Also expose an MPP/x402-style `WWW-Authenticate` header for generic payment-aware clients. */
export function wwwAuthenticate(c: Challenge): string {
  const request = Buffer.from(JSON.stringify(c)).toString("base64url");
  return `Payment method="solana", intent="${PROTOCOL_ID}", request="${request}"`;
}

export function parseWwwAuthenticate(header: string): Challenge | null {
  const m = /request="([^"]+)"/.exec(header);
  if (!m) return null;
  return JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as Challenge;
}

export interface ReceiptEnvelope {
  units: string;
  cumulativeUnits: string;
  cost: string;
  receipt: string; // serializeSigned(receipt)
}
