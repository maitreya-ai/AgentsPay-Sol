import { Coins, Gauge, Layers, ShieldCheck, Star, Wallet } from "lucide-react";

import { Card, Pill, Section } from "./ui";

const modules = [
  {
    icon: ShieldCheck,
    name: "Attestation registry",
    pitch: "Binds an enclave-held key to an approved workload, verified by an M-of-N committee.",
    ixs: ["approve_measurement", "submit_attestation", "approve_attestation", "revoke_attestation", "revoke_measurement"],
    points: ["Revocation needs 1 signer, approval needs M", "Revoking a measurement kills every dependent attestation", "TTL-bounded; ZK verifier is pluggable"],
  },
  {
    icon: Gauge,
    name: "Attested sessions",
    pitch: "Payment channels whose settlement needs the payer's voucher and the enclave's receipt.",
    ixs: ["open_session", "top_up_session", "settle", "request_close", "close_session"],
    points: ["Operator can't over-bill: receipts come from the TEE", "Payer can't under-pay: vouchers prepay each request", "Invalid attestation means instant payer exit"],
  },
  {
    icon: Wallet,
    name: "Agent vaults",
    pitch: "Owner-funded budgets that agents spend under an on-chain policy, with no per-request owner signature.",
    ixs: ["create_vault", "open_session_from_vault", "update_vault", "withdraw_vault"],
    points: ["Per-session cap and rolling period limit", "Minimum paid-rating and allowed-TEE gates", "Kill switch and expiry; refunds return to the vault"],
  },
  {
    icon: Coins,
    name: "Compute credits",
    pitch: "Tokenized GPU capacity: SPL credits fully backed by payments held in escrow.",
    ixs: ["create_offering", "buy_credits", "cash_out_credits", "refund_credits"],
    points: ["escrow == supply × price, always", "Only sold while the provider is attested", "Holders refund at par if the provider defaults"],
  },
  {
    icon: Star,
    name: "Paid feedback",
    pitch: "Reputation that costs real settlement to produce, ready to bridge to 8004.",
    ixs: ["finalize_session"],
    points: ["Only settled sessions can rate", "One rating per session, from the payer side", "PaidFeedback event carries settled value + transcript"],
  },
  {
    icon: Layers,
    name: "Off-chain toolkit",
    pitch: "Everything around the program, in TypeScript on Bun.",
    ixs: ["@agentspay/sdk", "gateway", "verifier", "agent-demo", "web"],
    points: ["OpenAI-compatible gateway with sealed prompts", "Verifier with simulated + TDX paths", "One-command localnet demo"],
  },
];

export function Modules() {
  return (
    <Section
      id="modules"
      eyebrow="What's in the box"
      title="Five on-chain modules, one Anchor program."
      lead="23 instructions, 31 Rust tests (unit + LiteSVM integration). Each module addresses one gap from the problem section."
    >
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ icon: Icon, name, pitch, ixs, points }) => (
          <Card key={name} className="flex flex-col">
            <Icon className="size-6 text-mint-300" />
            <h3 className="mt-4 text-lg font-semibold">{name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">{pitch}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-ink-300">
              {points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-mint-400" /> {p}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
              {ixs.map((ix) => (
                <Pill key={ix} tone="ink">
                  {ix}
                </Pill>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}
