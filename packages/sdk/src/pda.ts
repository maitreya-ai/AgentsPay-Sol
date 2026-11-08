import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { AGENTSPAY_PROGRAM_ID, SEEDS } from "./constants.js";

const enc = (s: string) => Buffer.from(s, "utf8");
const u64le = (v: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
};

export class Pdas {
  constructor(readonly programId: PublicKey = AGENTSPAY_PROGRAM_ID) {}

  private find(seeds: (Buffer | Uint8Array)[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }

  config(): PublicKey {
    return this.find([enc(SEEDS.config)]);
  }

  measurement(teeType: number, value: Uint8Array): PublicKey {
    if (value.length !== 48) throw new Error("measurement must be 48 bytes");
    return this.find([
      enc(SEEDS.measurement),
      Uint8Array.of(teeType),
      value.subarray(0, 32),
      value.subarray(32, 48),
    ]);
  }

  provider(operator: PublicKey): PublicKey {
    return this.find([enc(SEEDS.provider), operator.toBuffer()]);
  }

  attestation(provider: PublicKey, enclaveKey: PublicKey): PublicKey {
    return this.find([enc(SEEDS.attestation), provider.toBuffer(), enclaveKey.toBuffer()]);
  }

  /** `payer` is the wallet for direct sessions, or the vault PDA for vault-funded ones. */
  session(payer: PublicKey, provider: PublicKey, salt: bigint | number): PublicKey {
    return this.find([enc(SEEDS.session), payer.toBuffer(), provider.toBuffer(), u64le(salt)]);
  }

  vault(owner: PublicKey, agent: PublicKey, mint: PublicKey): PublicKey {
    return this.find([enc(SEEDS.vault), owner.toBuffer(), agent.toBuffer(), mint.toBuffer()]);
  }

  offering(provider: PublicKey, id: bigint | number): PublicKey {
    return this.find([enc(SEEDS.offering), provider.toBuffer(), u64le(id)]);
  }

  creditMint(offering: PublicKey): PublicKey {
    return this.find([enc(SEEDS.creditMint), offering.toBuffer()]);
  }
}

export function ata(owner: PublicKey, mint: PublicKey, tokenProgram = TOKEN_PROGRAM_ID): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}
