import { ArrowRight, BookOpen, Check, ShieldCheck } from "lucide-react";

import { DOCS_URL, GithubMark, Pill, REPO_URL } from "./ui";

const links = [
  ["Problem", "#problem"],
  ["How it works", "#how"],
  ["Modules", "#modules"],
  ["Simulator", "#simulator"],
  ["Protocol", "#protocol"],
  ["Roadmap", "#roadmap"],
] as const;

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/75 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Logo />
          AgentsPay
        </a>
        <div className="hidden items-center gap-7 text-sm text-ink-300 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="transition hover:text-ink-100">
              {label}
            </a>
          ))}
        </div>
        <a
          href={REPO_URL}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-ink-100 transition hover:border-ink-600 hover:bg-ink-800"
        >
          <GithubMark /> <span className="hidden sm:inline">GitHub</span>
        </a>
      </nav>
    </header>
  );
}

export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cf5c8" />
          <stop offset="1" stopColor="#8a5cff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lg)" />
      <path d="M9 21.5 15.2 9.5h1.6L23 21.5M11.6 17h8.8" stroke="#07080c" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-iris-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -left-20 h-72 w-72 rounded-full bg-mint-500/10 blur-[100px]" />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pt-20 pb-24 sm:px-6 sm:pt-28 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <Pill>
            <ShieldCheck className="size-3.5" /> open source · Solana · MIT
          </Pill>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            AI agents should pay for compute <span className="text-gradient">only when the hardware proves it.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            AgentsPay is a Solana program and toolkit for metered agent payments, gated by hardware attestation. An agent escrows a
            ceiling once and streams signed vouchers. The provider gets paid only for usage that its{" "}
            <em className="text-ink-100 not-italic">attested enclave</em> signed for, and only while that attestation is valid.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href={`${REPO_URL}#quickstart`}
              className="inline-flex items-center gap-2 rounded-xl bg-mint-400 px-5 py-3 font-medium text-ink-950 transition hover:bg-mint-300"
            >
              Run the demo <ArrowRight className="size-4" />
            </a>
            <a
              href={`${DOCS_URL}/architecture.md`}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/80 px-5 py-3 font-medium transition hover:border-ink-600"
            >
              <BookOpen className="size-4" /> Architecture
            </a>
          </div>
        </div>

        <SessionCard />
      </div>
    </section>
  );
}

function Row({ k, v, tone = "text-ink-100" }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-ink-400">{k}</span>
      <span className={`truncate ${tone}`}>{v}</span>
    </div>
  );
}

function SessionCard() {
  return (
    <div className="glow rounded-2xl border border-ink-700 bg-ink-900/90 font-mono text-[13px] backdrop-blur">
      <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
        <span className="text-ink-300">session · aqxL…88KF</span>
        <Pill>OPEN</Pill>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <p className="mb-1 text-[11px] tracking-widest text-iris-300 uppercase">attestation</p>
          <Row k="tee" v="Intel TDX + H100 CC" />
          <Row k="measurement" v="a3f1…9c2e ✓ approved" tone="text-mint-300" />
          <Row k="committee" v="2 / 3 verifiers" />
        </div>
        <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-3">
          <p className="mb-1 text-[11px] tracking-widest text-iris-300 uppercase">voucher · payer</p>
          <Row k="cumulative" v="2.500000 USDC" />
          <p className="mt-2 mb-1 text-[11px] tracking-widest text-iris-300 uppercase">receipt · enclave</p>
          <Row k="units" v="3,000 tokens" />
          <Row k="transcript" v="sha256 9f04…e1b7" />
        </div>
        <div className="rounded-xl bg-mint-400/10 p-3 text-mint-300">
          <div className="flex items-center gap-2">
            <Check className="size-4" /> settle = min(2.50, 3,000 × 0.001, 5.00)
          </div>
          <div className="mt-1 pl-6 text-ink-300">→ 2.50 USDC in one transaction</div>
        </div>
      </div>
    </div>
  );
}
