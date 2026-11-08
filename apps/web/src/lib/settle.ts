/**
 * Client-side mirror of the on-chain settlement rule (programs/agentspay/src/instructions/session.rs).
 * All amounts are token base units (micro-USDC for a 6-decimals stablecoin).
 */
export type AttestationState = "valid" | "revoked" | "expired" | "measurement-revoked";
export type SessionPhase = "open" | "closing-in-grace" | "grace-elapsed";

export interface SimInput {
  deposit: number;
  pricePerUnit: number;
  unitsMetered: number;
  voucherAuthorized: number;
  alreadySettled: number;
  feeBps: number;
  attestation: AttestationState;
  phase: SessionPhase;
}

export type Binding = "metered" | "voucher" | "deposit";

export interface SimOutput {
  allowed: boolean;
  reason: string;
  target: number;
  binding: Binding;
  delta: number;
  provider: number;
  fee: number;
  /** What the payer gets back if the session closes right after this settlement. */
  refund: number;
  payerCanExitNow: boolean;
}

export function simulate(i: SimInput): SimOutput {
  const metered = i.unitsMetered * i.pricePerUnit;
  let target = Math.min(i.voucherAuthorized, metered, i.deposit);
  const binding: Binding =
    target === metered ? "metered" : target === i.voucherAuthorized ? "voucher" : "deposit";
  target = Math.max(0, Math.floor(target));

  const attestationOk = i.attestation === "valid";
  const phaseOk = i.phase !== "grace-elapsed";
  const delta = target - i.alreadySettled;

  let allowed = true;
  let reason = "Settles: both signatures check out and the attestation is valid.";
  if (!attestationOk) {
    allowed = false;
    reason = {
      revoked: "AttestationNotValid: a verifier revoked the hardware attestation.",
      expired: "AttestationNotValid: the attestation expired; the provider must re-attest.",
      "measurement-revoked": "AttestationNotValid: governance revoked the workload measurement (e.g. a CVE).",
    }[i.attestation as Exclude<AttestationState, "valid">];
  } else if (!phaseOk) {
    allowed = false;
    reason = "SessionNotSettleable: the payer requested close and the grace period elapsed.";
  } else if (delta <= 0) {
    allowed = false;
    reason = "NothingToSettle: nothing new is owed beyond what was already settled.";
  }

  const paid = allowed ? delta : 0;
  const fee = Math.floor((paid * i.feeBps) / 10_000);
  const settledAfter = i.alreadySettled + paid;
  return {
    allowed,
    reason,
    target,
    binding,
    delta: paid,
    provider: paid - fee,
    fee,
    refund: Math.max(0, i.deposit - settledAfter),
    payerCanExitNow: !attestationOk || i.phase === "grace-elapsed",
  };
}

export const fmtUsdc = (base: number) =>
  (base / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
