/**
 * Sealed prompts: agents encrypt request bodies to the enclave's attested
 * X25519 key, so the provider's host OS, load balancers and logs only see
 * ciphertext. Responses are sealed back to the agent's ephemeral key.
 */
import nacl from "tweetnacl";

export interface SealedEnvelope {
  v: 1;
  /** Sender's ephemeral X25519 public key (base64). */
  epk: string;
  nonce: string;
  ct: string;
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

export interface SealResult {
  envelope: SealedEnvelope;
  /** Keep this to open the sealed response. */
  ephemeralSecret: Uint8Array;
}

export function seal(plaintext: Uint8Array | string, recipientPublicKey: Uint8Array): SealResult {
  const msg = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ct = nacl.box(msg, nonce, recipientPublicKey, eph.secretKey);
  return { envelope: { v: 1, epk: b64(eph.publicKey), nonce: b64(nonce), ct: b64(ct) }, ephemeralSecret: eph.secretKey };
}

export function open(envelope: SealedEnvelope, recipientSecretKey: Uint8Array): Uint8Array {
  const pt = nacl.box.open(unb64(envelope.ct), unb64(envelope.nonce), unb64(envelope.epk), recipientSecretKey);
  if (!pt) throw new Error("failed to open sealed envelope");
  return pt;
}

/** Enclave -> agent: seal the response to the agent's ephemeral key from the request. */
export function sealReply(plaintext: Uint8Array | string, requestEnvelope: SealedEnvelope, enclaveSecret: Uint8Array): SealedEnvelope {
  const msg = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ct = nacl.box(msg, nonce, unb64(requestEnvelope.epk), enclaveSecret);
  const enclavePublic = nacl.box.keyPair.fromSecretKey(enclaveSecret).publicKey;
  return { v: 1, epk: b64(enclavePublic), nonce: b64(nonce), ct: b64(ct) };
}

/** Agent opens the enclave's reply using the ephemeral secret it sealed the request with. */
export function openReply(reply: SealedEnvelope, ephemeralSecret: Uint8Array, expectedEnclaveKey?: Uint8Array): Uint8Array {
  if (expectedEnclaveKey && b64(expectedEnclaveKey) !== reply.epk) {
    throw new Error("reply was not sealed by the attested enclave key");
  }
  return open(reply, ephemeralSecret);
}
