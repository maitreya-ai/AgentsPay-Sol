import { describe, expect, it } from "bun:test";

import { simulate, type SimInput } from "./settle";

const base: SimInput = {
  deposit: 5_000_000,
  pricePerUnit: 1_000,
  unitsMetered: 1_200,
  voucherAuthorized: 2_000_000,
  alreadySettled: 0,
  feeBps: 250,
  attestation: "valid",
  phase: "open",
};

describe("simulate (mirrors the on-chain rule)", () => {
  it("pays what the enclave metered, minus fee", () => {
    const o = simulate(base);
    expect(o.allowed).toBe(true);
    expect(o.binding).toBe("metered");
    expect(o.provider).toBe(1_170_000);
    expect(o.fee).toBe(30_000);
    expect(o.refund).toBe(3_800_000);
  });

  it("is capped by the voucher and the deposit", () => {
    expect(simulate({ ...base, unitsMetered: 3_000, voucherAuthorized: 2_500_000 }).binding).toBe("voucher");
    expect(simulate({ ...base, unitsMetered: 1e9, voucherAuthorized: 1e12 }).target).toBe(5_000_000);
  });

  it("refuses payment without a valid attestation and frees the payer", () => {
    const o = simulate({ ...base, attestation: "revoked" });
    expect(o.allowed).toBe(false);
    expect(o.provider).toBe(0);
    expect(o.payerCanExitNow).toBe(true);
  });

  it("refuses after grace and when nothing is owed", () => {
    expect(simulate({ ...base, phase: "grace-elapsed" }).allowed).toBe(false);
    expect(simulate({ ...base, alreadySettled: 1_200_000 }).allowed).toBe(false);
  });
});
