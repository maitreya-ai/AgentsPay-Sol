import type { ReactNode } from "react";

export const REPO_URL = "https://github.com/maitreya-ai/AgentsPay-Sol";
export const DOCS_URL = `${REPO_URL}/blob/main/docs`;

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-ink-800/80 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="font-mono text-xs tracking-[0.2em] text-mint-400 uppercase">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
        {lead && <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-300 sm:text-lg">{lead}</p>}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-ink-700/70 bg-ink-900/70 p-6 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}

export function Pill({ tone = "mint", children }: { tone?: "mint" | "iris" | "amber" | "rose" | "ink"; children: ReactNode }) {
  const tones = {
    mint: "border-mint-400/30 bg-mint-400/10 text-mint-300",
    iris: "border-iris-400/30 bg-iris-400/10 text-iris-300",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-400",
    rose: "border-rose-400/30 bg-rose-400/10 text-rose-400",
    ink: "border-ink-600 bg-ink-800 text-ink-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-ink-800 px-1.5 py-0.5 font-mono text-[0.85em] text-mint-300">{children}</code>;
}

export function GithubMark({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
