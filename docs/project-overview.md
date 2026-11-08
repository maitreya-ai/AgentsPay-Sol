# Project overview

> **AgentsPay**: attestation-gated, metered payments for AI agents on Solana.
> Pay for compute only when the hardware proves it.

This document explains *why* AgentsPay exists: the landscape it builds on, the gaps it closes, who it is for, and what is and isn't in scope. For *how* it works, see [architecture.md](./architecture.md).

---

## 1. Context: Solana is where agents pay

By late 2026, Solana has become the default settlement layer for machine-to-machine payments:

| Signal | Figure | Source |
| --- | --- | --- |
| Stablecoin supply on Solana | **$17.3B** | solana.com |
| Solana share of x402 agent payments | **76%** (other trackers report 49–90% depending on window and metric) | solana.com, Artemis, SolanaFloor |
| x402 transactions since launch | **180M+** | Solana Foundation webinar recap, Aug 2026 |
| Agents at Agent Registry launch | **9,000+** (launched Mar 3, 2026) | madeonsol, PANews |

Three recent primitives define the stack:

1. **Payment Channels** (live on mainnet since Sep 2026, [`solana-foundation/payment-channels`](https://github.com/solana-foundation/payment-channels), audited by Cantina). An agent escrows a spending ceiling once, signs off-chain *cumulative* Ed25519 vouchers as it consumes, and the merchant settles once. It backs x402 `upto` (one metered request) and MPP `session` (streamed requests) on pay.sh.
2. **Agent Registry** ([ERC-8004 on Solana](https://github.com/QuantuLabs/8004-solana)). On-chain identity (Metaplex Core assets) and reputation (feedback events, ATOM scoring) for agents.
3. **The Foundation's AI thesis** ("Solana x AI: The Democratization Layer", Oct 2, 2026). It names what the Foundation wants to exist:
   - **tokenized GPU-hours**: compute traded on open markets instead of bilateral cloud contracts;
   - **TEE-attested private inference**: an enclave generates a key, publishes its public key with a hardware attestation on-chain, and users encrypt prompts to it;
   - **contracts that pay a provider only when a valid hardware attestation exists.**

## 2. The problem

The rails let an agent pay **cheaply**. Nothing yet lets it pay **verifiably**.

| # | Gap | Why it matters |
| --- | --- | --- |
| G1 | **Settlement is blind to delivery.** A payment-channel voucher proves the payer authorised *up to* an amount. Nothing proves the service was delivered, or by which code and hardware. | For metered inference the merchant's own server does the metering. A dishonest operator can over-count tokens, swap the model, or log prompts, and still settle every voucher. |
| G2 | **No primitive gates payment on attestation.** TEEs (Intel TDX, AMD SEV-SNP, NVIDIA H100/B200 CC) can prove which code runs. No Solana program ties that proof to money. | The Foundation's "pay only when a valid hardware attestation exists" has no implementation. Every provider invents its own trust story. |
| G3 | **On-chain quote verification is hard.** TDX/SGX DCAP quotes use ECDSA P-256 chains plus collateral; SEV-SNP and NVIDIA use P-384, which has no Solana precompile. Automata's Solana DCAP programs are localnet-only. | A practical design needs a pluggable verifier: a committee today, ZK proofs tomorrow. |
| G4 | **Reputation isn't backed by payments.** 8004 feedback is open to anyone and Sybil-resisted with heuristics. The ERC-8004 *validation* module, where TEE attestations would live, is archived on Solana. | Agents choosing providers can't tell paid, verified experience from noise. |
| G5 | **Agents hold spending power without guardrails.** Owners either sign every channel open (no autonomy) or hand the agent a hot wallet (no limits). | One prompt injection can drain a budget. Owners need policy: caps, rolling limits, TEE and reputation requirements, a kill switch. |
| G6 | **GPU capacity is not a liquid asset.** Pre-paid compute is a bilateral IOU with no default protection. | "Tokenized GPU-hours" needs fully collateralised, transferable claims with a refund path if the provider stops being attested. |

## 3. The solution in one paragraph

AgentsPay is an Anchor program plus a TypeScript toolkit (Bun). A provider's gateway runs inside a confidential VM and generates a **receipt key** and an **encryption key** in memory, binding both into the hardware quote's `REPORTDATA`. An **M-of-N verifier committee** checks the quote off-chain against a **governance-approved workload measurement** and approves on-chain. Agents open **attested sessions**, payment channels whose settlement needs **two** Ed25519 signatures: the payer's cumulative **voucher** and the enclave's cumulative **usage receipt**. The program pays `min(voucher, units × price, deposit)`, and only while the attestation and its measurement are valid. Revocation frees the payer instantly. **Agent vaults** let owners delegate budgets under on-chain policy. **Compute credits** tokenize capacity with 1:1 escrow and default refunds. **Paid feedback** lets only sessions that settled value leave ratings, emitted for the 8004 registry.

## 4. How each gap is closed

| Gap | AgentsPay component | Mechanism |
| --- | --- | --- |
| G1 | Attested sessions | Settlement requires an enclave-signed receipt. The receipt key never leaves the TEE, so the host operator cannot forge usage. The rolling transcript hash lets the agent audit what was metered. |
| G2 | Attestation registry + `settle` gate | `settle` checks `Attestation::is_valid` (committee-approved, unexpired, not revoked, measurement still approved) inside the same instruction that moves funds. |
| G3 | Pluggable verifier | The program records approvals from a configurable committee. The verifier service already handles the simulated TEE and TDX (parsing plus an external DCAP hook). A ZK verifier (SP1/RISC Zero → Groth16 on `alt_bn128`) can replace the committee without changing session logic. |
| G4 | Paid feedback | `finalize_session(rating)` only accepts ratings from the payer side of a session with `settled > 0`, and emits `PaidFeedback` with the settled amount and transcript hash. |
| G5 | Agent vaults | Per-session cap, rolling period limit, minimum paid rating, allowed TEE families, expiry and freeze. Agents open sessions with ephemeral voucher keys; refunds flow back to the vault. |
| G6 | Compute credits | 0-decimal SPL credits minted only against an attested provider, with `escrow == supply × price` at all times. Credits are spent in attested sessions, and holders refund at par after expiry or loss of attestation. |

## 5. Who it is for

- **Agent developers** who want their agents to buy inference and tools from providers they can verify, without per-request owner signatures.
- **GPU and inference providers** who want to sell "private, verifiable inference" with a credible proof and get paid with one transaction per session.
- **Wallets and agent platforms** that need policy-bounded delegation for autonomous agents.
- **Solana ecosystem builders** working on x402 / MPP, 8004 reputation, DePIN compute and confidential computing.

## 6. Scope

**In scope (v0.1, this repo)**

- Anchor program (23 instructions, 30 Rust tests, 21 of them LiteSVM integration tests).
- TypeScript SDK: PDAs, message codecs, sealed prompts, evidence helpers and a typed client.
- Reference gateway: OpenAI-compatible, sealed prompts, voucher admission, enclave receipts, a settlement worker. Simulated and Intel TDX (configfs-tsm) enclaves.
- Verifier service: simulated + TDX evidence checks, an external DCAP hook, a re-check and revoke loop.
- Agent demo and a one-command localnet demo.
- Project website (Vite + React + Tailwind) with a live settlement simulator.

**Out of scope for now / roadmap**

- On-chain or ZK verification of vendor quotes (committee only today).
- SEV-SNP, NVIDIA CC (NRAS) and AWS Nitro verifiers.
- Wire compatibility with x402 `upto` / MPP `session` (the protocol is modelled on them but not identical).
- 8004 bridge service (events are emitted; the relayer is not written yet).
- Interop with the Foundation's Payment Channels program as an attested PDA payee.
- A security audit. **This code is unaudited. Do not use it with real funds.**

## 7. Status

| Area | Status |
| --- | --- |
| Program | Feature-complete for v0.1; all tests pass on LiteSVM. Not deployed to devnet or mainnet. |
| SDK / gateway / verifier / demo | Working end to end on `solana-test-validator` with the simulated TEE. |
| TDX path | Implemented (quote generation via configfs-tsm, parsing, measurement derivation); not yet exercised on real hardware. |
| Website | Builds; static, deployable to any host. |

## 8. Sources

- Solana Foundation, *Payment Channels: 1 Million Payments Per Second* (solana.com/news, Sep 2026)
- Solana Foundation, *Payments on Solana: September 2026 in Five Stories*
- `solana-foundation/payment-channels` README and ADRs 001–003 (state machine, HTTP protocol, instructions)
- Solana Foundation, *Solana x AI: The Democratization Layer* (Oct 2, 2026)
- `QuantuLabs/8004-solana` README (identity + reputation; validation module archived)
- Agent Registry launch coverage: PANews, KuCoin, RootData (Mar 3, 2026)
- x402 share: CoinTurk (Artemis data), SolanaFloor, madeonsol
- `automata-network/automata-dcap-attestation` (DCAP on EVM; Solana programs localnet-only)
