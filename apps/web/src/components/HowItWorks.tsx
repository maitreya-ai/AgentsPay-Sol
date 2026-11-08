import { Bot, KeyRound, Lock, Scale, Server, ShieldCheck, Star } from "lucide-react";

import { Code, Section } from "./ui";

const steps = [
  {
    icon: ShieldCheck,
    who: "Provider + verifiers",
    title: "Attest",
    body: (
      <>
        The gateway boots inside a confidential VM and generates a receipt key and an encryption key in memory. The hardware quote's{" "}
        <Code>REPORTDATA</Code> commits to both. An M-of-N verifier committee checks the quote and approves on-chain, against a
        governance-approved workload measurement.
      </>
    ),
  },
  {
    icon: Bot,
    who: "Agent",
    title: "Discover",
    body: "The agent lists providers with a currently valid attestation, checks that the endpoint's keys match the on-chain record, and filters by TEE type and paid reputation.",
  },
  {
    icon: KeyRound,
    who: "Agent / owner vault",
    title: "Open",
    body: "One transaction escrows a ceiling and binds the session to the provider's enclave key and an ephemeral voucher key. Vault-funded sessions enforce the owner's policy on-chain.",
  },
  {
    icon: Lock,
    who: "Agent ↔ enclave",
    title: "Meter",
    body: "Prompts are sealed to the enclave's X25519 key. Each request carries a cumulative payer voucher; each response returns a cumulative enclave receipt with a rolling transcript hash the agent recomputes.",
  },
  {
    icon: Scale,
    who: "Anyone can crank",
    title: "Settle",
    body: (
      <>
        <Code>[Ed25519(voucher), Ed25519(receipt), settle]</Code> pays <Code>min(voucher, units × price, deposit)</Code>, and only
        while the attestation and its measurement are valid. Revocation lets the payer exit immediately.
      </>
    ),
  },
  {
    icon: Star,
    who: "Payer",
    title: "Rate",
    body: "Only sessions that actually settled value can leave a 0–100 rating. Each one emits a PaidFeedback event that can be bridged to the 8004 reputation registry with a proof-of-payment link.",
  },
];

export function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="Two signatures per payment: the payer's authorization and the enclave's meter."
      lead="AgentsPay keeps the payment-channel model (escrow once, settle once) and adds a second, hardware-rooted signature to every settlement."
    >
      <ol className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {steps.map(({ icon: Icon, who, title, body }, i) => (
          <li key={title} className="relative rounded-2xl border border-ink-700/70 bg-ink-900/70 p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-mint-400/20 to-iris-500/20 text-mint-300">
                <Icon className="size-4.5" />
              </span>
              <span className="font-mono text-xs text-ink-400">
                0{i + 1} · {who}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
          </li>
        ))}
      </ol>

      <Diagram />
    </Section>
  );
}

function Diagram() {
  const box = "rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-center";
  return (
    <div className="mt-10 overflow-x-auto rounded-2xl border border-ink-800 bg-ink-950/60 p-6">
      <div className="grid min-w-[720px] grid-cols-[1fr_auto_1.3fr_auto_1fr] items-center gap-3 font-mono text-xs">
        <div className={box}>
          <Bot className="mx-auto mb-1 size-5 text-iris-300" />
          Agent
          <p className="mt-1 text-[11px] text-ink-400">voucher key · vault policy</p>
        </div>
        <Arrow label="sealed prompt + voucher" />
        <div className={`${box} border-mint-400/40`}>
          <Server className="mx-auto mb-1 size-5 text-mint-300" />
          Provider gateway in TEE
          <p className="mt-1 text-[11px] text-ink-400">TDX / SEV-SNP CVM + GPU CC · receipt key never leaves</p>
        </div>
        <Arrow label="voucher + receipt" />
        <div className={box}>
          <Scale className="mx-auto mb-1 size-5 text-iris-300" />
          AgentsPay program
          <p className="mt-1 text-[11px] text-ink-400">verifies both · checks attestation · pays</p>
        </div>
      </div>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-[11px] text-ink-400">
      <span className="whitespace-nowrap">{label}</span>
      <svg width="84" height="10" viewBox="0 0 84 10" aria-hidden="true">
        <path d="M0 5h78" stroke="currentColor" strokeDasharray="3 3" />
        <path d="M76 1l6 4-6 4" fill="none" stroke="currentColor" />
      </svg>
    </div>
  );
}
