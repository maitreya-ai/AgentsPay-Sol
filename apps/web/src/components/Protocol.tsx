import { Check, Copy, Lock, ShieldOff, Clock, Wallet } from "lucide-react";
import { useState } from "react";

import { Card, Code, GithubMark, Pill, REPO_URL, Section } from "./ui";

const voucher = [
  ["0..4", "magic", '"APV1"'],
  ["4..36", "session", "pubkey"],
  ["36..44", "cumulative_amount", "u64 LE"],
  ["44..52", "expires_at", "i64 LE (0 = none)"],
];
const receipt = [
  ["0..4", "magic", '"APR1"'],
  ["4..36", "session", "pubkey"],
  ["36..44", "cumulative_units", "u64 LE"],
  ["44..76", "transcript_hash", "[u8; 32]"],
  ["76..84", "issued_at", "i64 LE"],
];

function Layout({ title, signer, rows, size }: { title: string; signer: string; rows: string[][]; size: number }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
        <span className="font-semibold">{title}</span>
        <Pill tone="iris">{size} bytes</Pill>
      </div>
      <table className="w-full font-mono text-xs">
        <tbody>
          {rows.map(([range, field, ty]) => (
            <tr key={field} className="border-b border-ink-800/60 last:border-0">
              <td className="px-5 py-2.5 text-ink-400">{range}</td>
              <td className="px-2 py-2.5 text-ink-100">{field}</td>
              <td className="px-5 py-2.5 text-right text-ink-300">{ty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-ink-800 px-5 py-3 text-xs text-ink-400">signed by {signer}</p>
    </Card>
  );
}

export function Protocol() {
  return (
    <Section
      id="protocol"
      eyebrow="Protocol"
      title="Fixed-length, domain-separated messages verified by the Ed25519 precompile."
      lead={
        <>
          The program accepts only the canonical single-signature precompile layout, with every offset pointing inside the precompile
          instruction itself. Magic prefixes keep vouchers, receipts, transactions and the Foundation's <Code>[0x56, 0x01]</Code> vouchers
          from ever being confused.
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Layout title="Voucher" signer="Session.authorized_signer (agent's ephemeral key)" rows={voucher} size={52} />
        <Layout title="Usage receipt" signer="Attestation.enclave_key (never leaves the TEE)" rows={receipt} size={84} />
      </div>
    </Section>
  );
}

const guarantees = [
  { icon: ShieldOff, title: "Operator can't over-bill", body: "The host OS never holds the receipt key. Payment is capped by what the attested enclave metered." },
  { icon: Wallet, title: "Payer can't under-pay", body: "The gateway requires a voucher that covers each request's maximum cost before running inference." },
  { icon: Clock, title: "No stuck funds", body: "Payer-initiated close with a grace period, a permissionless crank afterwards, and an instant exit if attestation lapses." },
  { icon: Lock, title: "Private by default", body: "Prompts are sealed to the attested X25519 key, so load balancers, logs and the host only ever see ciphertext." },
];

export function Security() {
  return (
    <Section id="security" eyebrow="Guarantees" title="Who can cheat whom? Nobody gets a free lunch.">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {guarantees.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <Icon className="size-5 text-mint-300" />
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

const commands = `git clone ${REPO_URL}.git && cd AgentsPay-Sol
bun install
anchor build && bash scripts/sync-idl.sh
cargo test -p agentspay      # 30 program tests
bun run demo                 # validator → verifier → gateway → agent`;

export function Quickstart() {
  const [copied, setCopied] = useState(false);
  return (
    <Section id="quickstart" eyebrow="Quickstart" title="Run the whole flow locally in about a minute.">
      <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-3 rounded-full bg-rose-400/70" />
            <span className="size-3 rounded-full bg-amber-400/70" />
            <span className="size-3 rounded-full bg-mint-400/70" />
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(commands).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-ink-100">
          {commands.split("\n").map((l) => (
            <div key={l}>
              <span className="text-mint-400 select-none">$ </span>
              {l.split("#")[0]}
              {l.includes("#") && <span className="text-ink-400">#{l.split("#")[1]}</span>}
            </div>
          ))}
        </pre>
      </div>
      <p className="mt-4 text-sm text-ink-400">
        Requires Rust, Solana CLI 4.x, Anchor 1.2 and Bun 1.4. The demo uses a simulated TEE; real deployments set{" "}
        <Code>allow_simulated_tee = false</Code> and run the gateway in a TDX or SEV-SNP confidential VM.
      </p>
    </Section>
  );
}

const roadmap = [
  { phase: "Now", items: ["Anchor program: attestation, sessions, vaults, credits, paid feedback", "TS SDK, gateway (simulated + TDX), verifier, agent demo"] },
  { phase: "Next", items: ["SEV-SNP and NVIDIA CC (NRAS) verifiers", "x402 `upto` / MPP `session` HTTP compatibility", "8004 bridge: PaidFeedback → giveFeedback"] },
  { phase: "Later", items: ["ZK attestation: SP1 / RISC Zero DCAP proof → Groth16 on alt_bn128", "Payment Channels interop: AgentsPay as a PDA payee", "Credit AMMs and capacity futures"] },
];

export function Roadmap() {
  return (
    <Section id="roadmap" eyebrow="Roadmap" title="From committee trust to proof-carrying attestations.">
      <div className="grid gap-5 md:grid-cols-3">
        {roadmap.map((r) => (
          <Card key={r.phase}>
            <Pill tone={r.phase === "Now" ? "mint" : r.phase === "Next" ? "iris" : "ink"}>{r.phase}</Pill>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-300">
              {r.items.map((i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-iris-400" /> {i}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="mt-14 flex flex-col items-center gap-4 rounded-3xl border border-ink-700 bg-gradient-to-br from-ink-900 to-ink-850 p-10 text-center">
        <h3 className="text-2xl font-semibold tracking-tight">Build on it, break it, ship it.</h3>
        <p className="max-w-xl text-ink-300">MIT licensed. Issues and PRs welcome, especially verifiers for new TEE families.</p>
        <a href={REPO_URL} className="inline-flex items-center gap-2 rounded-xl bg-ink-100 px-5 py-3 font-medium text-ink-950 transition hover:bg-white">
          <GithubMark /> Star on GitHub
        </a>
      </div>
    </Section>
  );
}
