import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "bun:test";

import {
  AGENTSPAY_PROGRAM_ID,
  decodeReceipt,
  decodeVoucher,
  deserializeSigned,
  ed25519Instruction,
  encodeReceipt,
  encodeVoucher,
  makeSimulatedQuote,
  nextTranscriptHash,
  open,
  openReply,
  Pdas,
  reportData,
  seal,
  sealReply,
  serializeSigned,
  settleTarget,
  signVoucher,
  simulatedMeasurement,
  verifySignedMessage,
  verifySimulatedQuote,
  ZERO_HASH,
} from "../src/index.js";
import nacl from "tweetnacl";

describe("messages", () => {
  const session = new PublicKey(new Uint8Array(32).fill(7));

  it("encodes vouchers exactly like the Rust program", () => {
    const bytes = encodeVoucher({ session, cumulativeAmount: 1_234_567n, expiresAt: 1_900_000_000n });
    expect(bytes.length).toBe(52);
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe("APV1");
    // u64 LE of 1_234_567 = 0x12D687
    expect(Array.from(bytes.subarray(36, 40))).toEqual([0x87, 0xd6, 0x12, 0x00]);
    expect(decodeVoucher(bytes)).toEqual({ session, cumulativeAmount: 1_234_567n, expiresAt: 1_900_000_000n });
  });

  it("round-trips receipts and rejects cross-type decoding", () => {
    const r = { session, cumulativeUnits: 42n, transcriptHash: new Uint8Array(32).fill(3), issuedAt: -5n };
    const bytes = encodeReceipt(r);
    expect(bytes.length).toBe(84);
    expect(decodeReceipt(bytes)).toEqual(r);
    expect(() => decodeVoucher(bytes)).toThrow();
    expect(() => decodeReceipt(encodeVoucher({ session, cumulativeAmount: 1n, expiresAt: 0n }))).toThrow();
  });

  it("signs, serializes and verifies", () => {
    const kp = Keypair.generate();
    const signed = signVoucher({ session, cumulativeAmount: 10n, expiresAt: 0n }, kp);
    const wire = serializeSigned(signed);
    const back = deserializeSigned(wire);
    expect(verifySignedMessage(back, kp.publicKey)).toBe(true);
    expect(verifySignedMessage(back, Keypair.generate().publicKey)).toBe(false);
    back.message[10] ^= 1;
    expect(verifySignedMessage(back)).toBe(false);
  });

  it("builds the canonical Ed25519 precompile layout", () => {
    const kp = Keypair.generate();
    const ix = ed25519Instruction(signVoucher({ session, cumulativeAmount: 1n, expiresAt: 0n }, kp));
    const d = ix.data;
    expect(d.length).toBe(112 + 52);
    expect(d[0]).toBe(1);
    const u16 = (o: number) => d.readUInt16LE(o);
    expect([u16(2), u16(4), u16(6), u16(8), u16(10), u16(12), u16(14)]).toEqual([48, 0xffff, 16, 0xffff, 112, 52, 0xffff]);
  });

  it("matches the on-chain settle rule", () => {
    expect(settleTarget(100n, 5n, 10n, 1_000n)).toBe(50n);
    expect(settleTarget(30n, 5n, 10n, 1_000n)).toBe(30n);
    expect(settleTarget(500n, 50n, 10n, 200n)).toBe(200n);
  });

  it("chains transcript hashes deterministically", () => {
    const a = nextTranscriptHash(ZERO_HASH, "req", "resp");
    const b = nextTranscriptHash(ZERO_HASH, "req", "resp");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(nextTranscriptHash(a, "req", "resp")).equals(Buffer.from(a))).toBe(false);
  });
});

describe("pdas", () => {
  it("derives deterministic addresses", () => {
    const p = new Pdas(AGENTSPAY_PROGRAM_ID);
    const op = new PublicKey(new Uint8Array(32).fill(1));
    expect(p.provider(op).equals(p.provider(op))).toBe(true);
    expect(p.session(op, op, 1n).equals(p.session(op, op, 2n))).toBe(false);
    expect(() => p.measurement(1, new Uint8Array(47))).toThrow();
  });
});

describe("attestation + sealing", () => {
  it("binds keys into report data and verifies simulated quotes", () => {
    const provider = Keypair.generate().publicKey;
    const enclave = Keypair.generate().publicKey;
    const enc = nacl.box.keyPair().publicKey;
    const rd = reportData(provider, enclave, enc);
    const m = simulatedMeasurement("agentspay-gateway:0.1.0|echo");
    const q = makeSimulatedQuote(m, rd);
    const out = verifySimulatedQuote(q);
    expect(Buffer.from(out.reportData.subarray(0, 32)).equals(Buffer.from(rd))).toBe(true);
    expect(() => verifySimulatedQuote({ ...q, measurement: "00".repeat(48) })).toThrow();
  });

  it("seals prompts to the enclave and replies back", () => {
    const enclave = nacl.box.keyPair();
    const { envelope, ephemeralSecret } = seal('{"prompt":"secret"}', enclave.publicKey);
    expect(new TextDecoder().decode(open(envelope, enclave.secretKey))).toBe('{"prompt":"secret"}');
    const reply = sealReply("answer", envelope, enclave.secretKey);
    expect(new TextDecoder().decode(openReply(reply, ephemeralSecret, enclave.publicKey))).toBe("answer");
    expect(() => openReply(reply, ephemeralSecret, nacl.box.keyPair().publicKey)).toThrow();
  });
});
