/**
 * Off-chain signed messages. Byte layouts mirror `programs/agentspay/src/messages.rs`.
 *
 *   Voucher      (52 B): "APV1" | session(32) | cumulative_amount u64 LE | expires_at i64 LE
 *   UsageReceipt (84 B): "APR1" | session(32) | cumulative_units u64 LE | transcript_hash(32) | issued_at i64 LE
 */
import { Ed25519Program, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import nacl from "tweetnacl";

import { RECEIPT_LEN, RECEIPT_MAGIC, VOUCHER_LEN, VOUCHER_MAGIC } from "./constants.js";

export interface Voucher {
  session: PublicKey;
  /** Maximum total (base units) the payer authorises for this session so far. */
  cumulativeAmount: bigint;
  /** Unix seconds; 0n = no expiry. */
  expiresAt: bigint;
}

export interface UsageReceipt {
  session: PublicKey;
  /** Metered units served so far (e.g. tokens). */
  cumulativeUnits: bigint;
  /** Rolling hash over request/response digests: an audit trail the payer can recompute. */
  transcriptHash: Uint8Array;
  issuedAt: bigint;
}

export interface SignedMessage {
  signer: PublicKey;
  signature: Uint8Array;
  message: Uint8Array;
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function eq(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function encodeVoucher(v: Voucher): Uint8Array {
  const out = new Uint8Array(VOUCHER_LEN);
  out.set(VOUCHER_MAGIC, 0);
  out.set(v.session.toBytes(), 4);
  const dv = view(out);
  dv.setBigUint64(36, v.cumulativeAmount, true);
  dv.setBigInt64(44, v.expiresAt, true);
  return out;
}

export function decodeVoucher(bytes: Uint8Array): Voucher {
  if (bytes.length !== VOUCHER_LEN || !eq(bytes.subarray(0, 4), VOUCHER_MAGIC)) {
    throw new Error("invalid voucher bytes");
  }
  const dv = view(bytes);
  return {
    session: new PublicKey(bytes.subarray(4, 36)),
    cumulativeAmount: dv.getBigUint64(36, true),
    expiresAt: dv.getBigInt64(44, true),
  };
}

export function encodeReceipt(r: UsageReceipt): Uint8Array {
  if (r.transcriptHash.length !== 32) throw new Error("transcriptHash must be 32 bytes");
  const out = new Uint8Array(RECEIPT_LEN);
  out.set(RECEIPT_MAGIC, 0);
  out.set(r.session.toBytes(), 4);
  const dv = view(out);
  dv.setBigUint64(36, r.cumulativeUnits, true);
  out.set(r.transcriptHash, 44);
  dv.setBigInt64(76, r.issuedAt, true);
  return out;
}

export function decodeReceipt(bytes: Uint8Array): UsageReceipt {
  if (bytes.length !== RECEIPT_LEN || !eq(bytes.subarray(0, 4), RECEIPT_MAGIC)) {
    throw new Error("invalid receipt bytes");
  }
  const dv = view(bytes);
  return {
    session: new PublicKey(bytes.subarray(4, 36)),
    cumulativeUnits: dv.getBigUint64(36, true),
    transcriptHash: bytes.slice(44, 76),
    issuedAt: dv.getBigInt64(76, true),
  };
}

export function signMessage(message: Uint8Array, signer: Keypair): SignedMessage {
  return {
    signer: signer.publicKey,
    signature: nacl.sign.detached(message, signer.secretKey),
    message,
  };
}

export function verifySignedMessage(m: SignedMessage, expectedSigner?: PublicKey): boolean {
  if (expectedSigner && !m.signer.equals(expectedSigner)) return false;
  return nacl.sign.detached.verify(m.message, m.signature, m.signer.toBytes());
}

export const signVoucher = (v: Voucher, signer: Keypair) => signMessage(encodeVoucher(v), signer);
export const signReceipt = (r: UsageReceipt, signer: Keypair) => signMessage(encodeReceipt(r), signer);

/** Compact wire form for HTTP headers: base64url(signer(32) | signature(64) | message). */
export function serializeSigned(m: SignedMessage): string {
  const buf = new Uint8Array(96 + m.message.length);
  buf.set(m.signer.toBytes(), 0);
  buf.set(m.signature, 32);
  buf.set(m.message, 96);
  return Buffer.from(buf).toString("base64url");
}

export function deserializeSigned(s: string): SignedMessage {
  const buf = new Uint8Array(Buffer.from(s, "base64url"));
  if (buf.length < 96) throw new Error("signed message too short");
  return {
    signer: new PublicKey(buf.subarray(0, 32)),
    signature: buf.slice(32, 96),
    message: buf.slice(96),
  };
}

/** Ed25519 precompile instruction in the canonical layout the program accepts. */
export function ed25519Instruction(m: SignedMessage): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: m.signer.toBytes(),
    message: m.message,
    signature: m.signature,
  });
}

/** Mirror of the on-chain settlement rule. */
export function settleTarget(
  voucherCumulative: bigint,
  receiptUnits: bigint,
  pricePerUnit: bigint,
  deposit: bigint,
): bigint {
  const metered = receiptUnits * pricePerUnit;
  let t = voucherCumulative < metered ? voucherCumulative : metered;
  if (deposit < t) t = deposit;
  return t;
}

/** transcript' = sha256(transcript | sha256(request) | sha256(response)) */
export function nextTranscriptHash(
  prev: Uint8Array,
  request: Uint8Array | string,
  response: Uint8Array | string,
): Uint8Array {
  const b = (x: Uint8Array | string) => (typeof x === "string" ? new TextEncoder().encode(x) : x);
  const buf = new Uint8Array(96);
  buf.set(prev, 0);
  buf.set(sha256(b(request)), 32);
  buf.set(sha256(b(response)), 64);
  return sha256(buf);
}

export const ZERO_HASH = new Uint8Array(32);
