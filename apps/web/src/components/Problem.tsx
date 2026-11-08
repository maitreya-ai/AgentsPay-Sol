import { BadgeCheck, CircleAlert, Cpu, Network, Receipt } from "lucide-react";

import { Card, Pill, Section } from "./ui";

const stats = [
  { value: "$17.3B", label: "stablecoin supply on Solana" },
  { value: "76%", label: "Solana share of x402 agent payments" },
  { value: "9,000+", label: "agents at Agent Registry launch" },
  { value: "1 open + 1 settle", label: "per session with Payment Channels" },
];

const pillars = [
  {
    icon: Receipt,
    title: "Payment Channels",
    status: "shipped Sep 2026",
    have: "Escrow a ceiling once, meter off-chain with Ed25519 cumulative vouchers, settle once.",
    gap: "Settlement only checks the payer's voucher. Nothing proves the service was delivered, or by which code and hardware.",
  },
  {
    icon: Network,
    title: "Agent Registry (8004)",
    status: "launched Mar 3, 2026",
    have: "On-chain identity and reputation for agents on Metaplex Core assets.",
    gap: "Anyone can post feedback, so reviews aren't tied to real payments. The validation module, where TEE attestations would live, is archived.",
  },
  {
    icon: Cpu,
    title: "The Foundation's AI wish list",
    status: "Oct 2, 2026",
    have: "Tokenized GPU-hours, TEE-attested private inference, contracts that pay only when a valid hardware attestation exists.",
    gap: "No on-chain primitive ties payment, metering and attestation together, so each provider builds a bespoke trust story.",
  },
];

export function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The problem"
      title="Agents can pay per call on Solana. They can't yet check what they paid for."
      lead="The payment rails exist and are fast. What's missing is the link between money and proof: that an attested enclave did the work, that it was metered honestly, and that the payer's prompts stayed private."
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-800 bg-ink-800 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-ink-900 p-6">
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-sm text-ink-400">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-400">Figures as published by the Solana Foundation and ecosystem trackers in 2026.</p>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {pillars.map(({ icon: Icon, title, status, have, gap }) => (
          <Card key={title} className="flex flex-col">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-ink-800 text-mint-300">
                <Icon className="size-5" />
              </span>
              <Pill tone="ink">{status}</Pill>
            </div>
            <h3 className="mt-5 text-lg font-semibold">{title}</h3>
            <p className="mt-3 flex gap-2 text-sm leading-relaxed text-ink-300">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-mint-400" /> {have}
            </p>
            <p className="mt-3 flex gap-2 text-sm leading-relaxed text-ink-300">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" /> {gap}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
