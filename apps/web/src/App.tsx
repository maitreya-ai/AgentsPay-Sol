import { Hero, Logo, Nav } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Modules } from "./components/Modules";
import { Problem } from "./components/Problem";
import { Protocol, Quickstart, Roadmap, Security } from "./components/Protocol";
import { Simulator } from "./components/Simulator";
import { DOCS_URL, REPO_URL } from "./components/ui";

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Modules />
        <Simulator />
        <Protocol />
        <Security />
        <Quickstart />
        <Roadmap />
      </main>
      <footer className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-10 text-sm text-ink-400 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo className="size-5" /> AgentsPay · MIT License · research prototype, unaudited
          </div>
          <div className="flex flex-wrap gap-6">
            <a className="hover:text-ink-100" href={`${DOCS_URL}/project-overview.md`}>
              Overview
            </a>
            <a className="hover:text-ink-100" href={`${DOCS_URL}/architecture.md`}>
              Architecture
            </a>
            <a className="hover:text-ink-100" href={REPO_URL}>
              Source
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
