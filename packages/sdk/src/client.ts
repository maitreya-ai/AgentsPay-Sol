import { AnchorProvider, BN, Program, type IdlAccounts, type Wallet } from "@anchor-lang/core";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type Commitment,
  type TransactionSignature,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { AttestationStatus, SessionStatus } from "./constants.js";
import idlJson from "./idl/agentspay.json" with { type: "json" };
import type { Agentspay } from "./idl/agentspay.js";
import { ed25519Instruction, type SignedMessage } from "./messages.js";
import { ata, Pdas } from "./pda.js";

export type ConfigAccount = IdlAccounts<Agentspay>["config"];
export type ProviderAccount = IdlAccounts<Agentspay>["provider"];
export type AttestationAccount = IdlAccounts<Agentspay>["attestation"];
export type MeasurementAccount = IdlAccounts<Agentspay>["measurement"];
export type SessionAccount = IdlAccounts<Agentspay>["session"];
export type VaultAccount = IdlAccounts<Agentspay>["agentVault"];
export type OfferingAccount = IdlAccounts<Agentspay>["offering"];

export const INSTRUCTIONS_SYSVAR = new PublicKey("Sysvar1nstructions1111111111111111111111111");
export const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/** Minimal wallet adapter around a Keypair (works in Node and browsers). */
export class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else tx.partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}

const bn = (v: bigint | number) => new BN(v.toString());
const bytes = (u: Uint8Array) => Array.from(u);

export interface ProviderView {
  address: PublicKey;
  account: ProviderAccount;
  attestation: AttestationAccount | null;
  measurement: MeasurementAccount | null;
  attested: boolean;
  averageRating: number | null;
}

export interface OpenSessionParams {
  provider: PublicKey;
  mint: PublicKey;
  deposit: bigint;
  pricePerUnit: bigint;
  authorizedSigner: PublicKey;
  gracePeriod?: number;
  salt?: bigint;
  tokenProgram?: PublicKey;
}

export interface VaultPolicyParams {
  maxPerSession: bigint;
  periodLimit: bigint;
  periodSeconds: number;
  minProviderRating?: number;
  allowedTeeMask?: number;
  expiresAt?: bigint;
}

/**
 * High-level client for the AgentsPay program. Every method sends with the
 * client wallet as fee payer; extra signers are passed explicitly.
 */
export class AgentsPayClient {
  readonly program: Program<Agentspay>;
  readonly pdas: Pdas;
  readonly provider: AnchorProvider;

  constructor(
    readonly connection: Connection,
    readonly wallet: Wallet,
    opts: { programId?: PublicKey; commitment?: Commitment } = {},
  ) {
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: opts.commitment ?? "confirmed",
      preflightCommitment: opts.commitment ?? "confirmed",
    });
    const idl = { ...(idlJson as Agentspay), address: (opts.programId ?? new PublicKey(idlJson.address)).toBase58() };
    this.program = new Program<Agentspay>(idl as Agentspay, this.provider);
    this.pdas = new Pdas(this.program.programId);
  }

  static fromKeypair(connection: Connection, keypair: Keypair, opts?: { programId?: PublicKey }) {
    return new AgentsPayClient(connection, new KeypairWallet(keypair), opts);
  }

  get me(): PublicKey {
    return this.wallet.publicKey;
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async now(): Promise<number> {
    const slot = await this.connection.getSlot("confirmed");
    return (await this.connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  }

  fetchConfig() {
    return this.program.account.config.fetch(this.pdas.config());
  }
  fetchProvider(address: PublicKey) {
    return this.program.account.provider.fetchNullable(address);
  }
  fetchAttestation(address: PublicKey) {
    return this.program.account.attestation.fetchNullable(address);
  }
  fetchMeasurement(address: PublicKey) {
    return this.program.account.measurement.fetchNullable(address);
  }
  fetchSession(address: PublicKey) {
    return this.program.account.session.fetchNullable(address);
  }
  fetchVault(address: PublicKey) {
    return this.program.account.agentVault.fetchNullable(address);
  }
  fetchOffering(address: PublicKey) {
    return this.program.account.offering.fetchNullable(address);
  }

  measurementFor(att: AttestationAccount): PublicKey {
    return this.pdas.measurement(att.teeType, Uint8Array.from(att.measurement));
  }

  /** ProgramData account of the (upgradeable) AgentsPay program. */
  programDataAddress(): PublicKey {
    return PublicKey.findProgramAddressSync([this.program.programId.toBuffer()], BPF_LOADER_UPGRADEABLE)[0];
  }

  /** Mirrors `Attestation::is_valid` on-chain. */
  static isAttestationValid(att: AttestationAccount | null, m: MeasurementAccount | null, now: number): boolean {
    if (!att || !m) return false;
    return (
      att.status === AttestationStatus.Valid &&
      now < att.expiresAt.toNumber() &&
      m.approved &&
      m.teeType === att.teeType &&
      Buffer.from(m.value).equals(Buffer.from(att.measurement))
    );
  }

  async providerView(address: PublicKey, now?: number): Promise<ProviderView | null> {
    const account = await this.fetchProvider(address);
    if (!account) return null;
    return this.toView(address, account, now ?? (await this.now()));
  }

  private async toView(address: PublicKey, account: ProviderAccount, now: number): Promise<ProviderView> {
    let attestation: AttestationAccount | null = null;
    let measurement: MeasurementAccount | null = null;
    if (!account.activeAttestation.equals(PublicKey.default)) {
      attestation = await this.fetchAttestation(account.activeAttestation);
      if (attestation) measurement = await this.fetchMeasurement(this.measurementFor(attestation));
    }
    const count = account.stats.ratingsCount.toNumber();
    return {
      address,
      account,
      attestation,
      measurement,
      attested: AgentsPayClient.isAttestationValid(attestation, measurement, now),
      averageRating: count ? account.stats.ratingsSum.toNumber() / count : null,
    };
  }

  /** Discover providers, optionally only those with a currently valid attestation. */
  async listProviders(filter: { onlyAttested?: boolean; minRating?: number; teeTypes?: number[] } = {}) {
    const now = await this.now();
    const all = await this.program.account.provider.all();
    const views = await Promise.all(all.map((p) => this.toView(p.publicKey, p.account, now)));
    return views.filter(
      (v) =>
        (!filter.onlyAttested || v.attested) &&
        (filter.minRating === undefined || (v.averageRating ?? 0) >= filter.minRating) &&
        (!filter.teeTypes || (v.attestation && filter.teeTypes.includes(v.attestation.teeType))),
    );
  }

  async pendingAttestations() {
    const all = await this.program.account.attestation.all();
    return all.filter((a) => a.account.status === AttestationStatus.Pending);
  }

  // ---------------------------------------------------------------------
  // Governance
  // ---------------------------------------------------------------------

  initialize(args: {
    treasury: PublicKey;
    verifiers: PublicKey[];
    verifierThreshold: number;
    protocolFeeBps: number;
    maxAttestationTtl: number;
    allowSimulatedTee: boolean;
  }) {
    return this.program.methods
      .initialize({
        treasury: args.treasury,
        verifiers: args.verifiers,
        verifierThreshold: args.verifierThreshold,
        protocolFeeBps: args.protocolFeeBps,
        maxAttestationTtl: bn(args.maxAttestationTtl),
        allowSimulatedTee: args.allowSimulatedTee,
      })
      // Only the program's upgrade authority may initialize (prevents front-running).
      .accountsPartial({
        admin: this.me,
        config: this.pdas.config(),
        program: this.program.programId,
        programData: this.programDataAddress(),
      })
      .rpc();
  }

  approveMeasurement(args: { teeType: number; value: Uint8Array; modelHash: Uint8Array; label: string }) {
    return this.program.methods
      .approveMeasurement({
        teeType: args.teeType,
        value: bytes(args.value),
        modelHash: bytes(args.modelHash),
        label: args.label,
      })
      .accountsPartial({
        admin: this.me,
        config: this.pdas.config(),
        measurement: this.pdas.measurement(args.teeType, args.value),
      })
      .rpc();
  }

  revokeMeasurement(measurement: PublicKey) {
    return this.program.methods
      .revokeMeasurement()
      .accountsPartial({ authority: this.me, config: this.pdas.config(), measurement })
      .rpc();
  }

  // ---------------------------------------------------------------------
  // Providers & attestation
  // ---------------------------------------------------------------------

  async registerProvider(args: { payout: PublicKey; endpoint: string; agentAsset?: PublicKey }) {
    const provider = this.pdas.provider(this.me);
    const sig = await this.program.methods
      .registerProvider({
        payout: args.payout,
        agentAsset: args.agentAsset ?? PublicKey.default,
        endpoint: args.endpoint,
      })
      .accountsPartial({ operator: this.me, config: this.pdas.config(), provider })
      .rpc();
    return { signature: sig, provider };
  }

  updateProvider(args: { payout?: PublicKey; endpoint?: string; agentAsset?: PublicKey }) {
    return this.program.methods
      .updateProvider({
        payout: args.payout ?? null,
        agentAsset: args.agentAsset ?? null,
        endpoint: args.endpoint ?? null,
      })
      .accountsPartial({ operator: this.me, provider: this.pdas.provider(this.me) })
      .rpc();
  }

  async submitAttestation(args: {
    enclaveKey: PublicKey;
    encryptionKey: Uint8Array;
    teeType: number;
    measurement: Uint8Array;
    evidenceHash: Uint8Array;
    evidenceUri: string;
    requestedTtl: number;
  }) {
    const provider = this.pdas.provider(this.me);
    const attestation = this.pdas.attestation(provider, args.enclaveKey);
    const signature = await this.program.methods
      .submitAttestation({
        enclaveKey: args.enclaveKey,
        encryptionKey: bytes(args.encryptionKey),
        teeType: args.teeType,
        measurement: bytes(args.measurement),
        evidenceHash: bytes(args.evidenceHash),
        evidenceUri: args.evidenceUri,
        requestedTtl: bn(args.requestedTtl),
      })
      .accountsPartial({ operator: this.me, config: this.pdas.config(), provider, attestation })
      .rpc();
    return { signature, attestation };
  }

  async approveAttestation(attestation: PublicKey) {
    const att = await this.program.account.attestation.fetch(attestation);
    return this.program.methods
      .approveAttestation()
      .accountsPartial({
        verifier: this.me,
        config: this.pdas.config(),
        provider: att.provider,
        attestation,
        measurement: this.measurementFor(att),
      })
      .rpc();
  }

  async revokeAttestation(attestation: PublicKey, reason = 0) {
    const att = await this.program.account.attestation.fetch(attestation);
    return this.program.methods
      .revokeAttestation(reason)
      .accountsPartial({ authority: this.me, config: this.pdas.config(), provider: att.provider, attestation })
      .rpc();
  }

  // ---------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------

  private async activeAttestationAccounts(providerAddr: PublicKey) {
    const provider = await this.program.account.provider.fetch(providerAddr);
    if (provider.activeAttestation.equals(PublicKey.default)) throw new Error("provider has no active attestation");
    const att = await this.program.account.attestation.fetch(provider.activeAttestation);
    return { provider, attestation: provider.activeAttestation, measurement: this.measurementFor(att) };
  }

  async openSession(p: OpenSessionParams) {
    const salt = p.salt ?? BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const tokenProgram = p.tokenProgram ?? TOKEN_PROGRAM_ID;
    const { attestation, measurement } = await this.activeAttestationAccounts(p.provider);
    const session = this.pdas.session(this.me, p.provider, salt);
    const signature = await this.program.methods
      .openSession({
        salt: bn(salt),
        deposit: bn(p.deposit),
        pricePerUnit: bn(p.pricePerUnit),
        gracePeriod: p.gracePeriod ?? 900,
        authorizedSigner: p.authorizedSigner,
      })
      .accountsPartial({
        payer: this.me,
        config: this.pdas.config(),
        provider: p.provider,
        attestation,
        measurement,
        mint: p.mint,
        payerToken: ata(this.me, p.mint, tokenProgram),
        session,
        escrow: ata(session, p.mint, tokenProgram),
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { signature, session, salt };
  }

  async openSessionFromVault(p: OpenSessionParams & { vault: PublicKey }) {
    const salt = p.salt ?? BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const tokenProgram = p.tokenProgram ?? TOKEN_PROGRAM_ID;
    const { attestation, measurement } = await this.activeAttestationAccounts(p.provider);
    const session = this.pdas.session(p.vault, p.provider, salt);
    const signature = await this.program.methods
      .openSessionFromVault({
        salt: bn(salt),
        deposit: bn(p.deposit),
        pricePerUnit: bn(p.pricePerUnit),
        gracePeriod: p.gracePeriod ?? 900,
        authorizedSigner: p.authorizedSigner,
      })
      .accountsPartial({
        agent: this.me,
        config: this.pdas.config(),
        vault: p.vault,
        vaultToken: ata(p.vault, p.mint, tokenProgram),
        provider: p.provider,
        attestation,
        measurement,
        mint: p.mint,
        session,
        escrow: ata(session, p.mint, tokenProgram),
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { signature, session, salt };
  }

  /** Build the settle instructions: `[Ed25519(voucher), Ed25519(receipt), settle]`. */
  async settleInstructions(sessionAddr: PublicKey, voucher: SignedMessage, receipt: SignedMessage, tokenProgram = TOKEN_PROGRAM_ID) {
    const s = await this.program.account.session.fetch(sessionAddr);
    const provider = await this.program.account.provider.fetch(s.provider);
    const att = await this.program.account.attestation.fetch(s.attestation);
    const config = await this.fetchConfig();
    const settleIx = await this.program.methods
      .settle()
      .accountsPartial({
        cranker: this.me,
        config: this.pdas.config(),
        session: sessionAddr,
        provider: s.provider,
        attestation: s.attestation,
        measurement: this.measurementFor(att),
        mint: s.mint,
        escrow: ata(sessionAddr, s.mint, tokenProgram),
        payout: provider.payout,
        payoutToken: ata(provider.payout, s.mint, tokenProgram),
        treasury: config.treasury,
        treasuryToken: ata(config.treasury, s.mint, tokenProgram),
        instructions: INSTRUCTIONS_SYSVAR,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return [ed25519Instruction(voucher), ed25519Instruction(receipt), settleIx];
  }

  async closeSessionInstruction(sessionAddr: PublicKey, tokenProgram = TOKEN_PROGRAM_ID) {
    const s = await this.program.account.session.fetch(sessionAddr);
    const att = await this.program.account.attestation.fetch(s.attestation);
    return this.program.methods
      .closeSession()
      .accountsPartial({
        closer: this.me,
        session: sessionAddr,
        provider: s.provider,
        attestation: s.attestation,
        measurement: this.measurementFor(att),
        mint: s.mint,
        escrow: ata(sessionAddr, s.mint, tokenProgram),
        refundOwner: s.payer,
        refundToken: ata(s.payer, s.mint, tokenProgram),
        rentPayer: s.rentPayer,
        vault: s.vault.equals(PublicKey.default) ? null : s.vault,
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  async settle(sessionAddr: PublicKey, voucher: SignedMessage, receipt: SignedMessage): Promise<TransactionSignature> {
    const ixs = await this.settleInstructions(sessionAddr, voucher, receipt);
    return this.sendIxs([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ...ixs]);
  }

  /** Provider-side cooperative close, optionally settling a final voucher/receipt pair first. */
  async settleAndClose(sessionAddr: PublicKey, final?: { voucher: SignedMessage; receipt: SignedMessage }) {
    const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })];
    if (final) ixs.push(...(await this.settleInstructions(sessionAddr, final.voucher, final.receipt)));
    ixs.push(await this.closeSessionInstruction(sessionAddr));
    return this.sendIxs(ixs);
  }

  async closeSession(sessionAddr: PublicKey) {
    return this.sendIxs([await this.closeSessionInstruction(sessionAddr)]);
  }

  async requestClose(sessionAddr: PublicKey) {
    const s = await this.program.account.session.fetch(sessionAddr);
    return this.program.methods
      .requestClose()
      .accountsPartial({
        authority: this.me,
        session: sessionAddr,
        vault: s.vault.equals(PublicKey.default) ? null : s.vault,
      })
      .rpc();
  }

  async finalizeSession(sessionAddr: PublicKey, rating?: number) {
    const s = await this.program.account.session.fetch(sessionAddr);
    return this.program.methods
      .finalizeSession(rating ?? null)
      .accountsPartial({
        authority: this.me,
        session: sessionAddr,
        provider: s.provider,
        rentPayer: s.rentPayer,
        vault: s.vault.equals(PublicKey.default) ? null : s.vault,
      })
      .rpc();
  }

  isSettleable(s: SessionAccount, now: number) {
    return (
      s.status === SessionStatus.Open ||
      (s.status === SessionStatus.Closing && now < s.closeRequestedAt.toNumber() + s.gracePeriod)
    );
  }

  // ---------------------------------------------------------------------
  // Vaults
  // ---------------------------------------------------------------------

  async createVault(agent: PublicKey, mint: PublicKey, policy: VaultPolicyParams, tokenProgram = TOKEN_PROGRAM_ID) {
    const vault = this.pdas.vault(this.me, agent, mint);
    const signature = await this.program.methods
      .createVault(agent, this.policyArgs(policy))
      .accountsPartial({
        owner: this.me,
        mint,
        vault,
        vaultToken: ata(vault, mint, tokenProgram),
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { signature, vault, vaultToken: ata(vault, mint, tokenProgram) };
  }

  updateVault(vault: PublicKey, args: { policy?: VaultPolicyParams; frozen?: boolean }) {
    return this.program.methods
      .updateVault({ policy: args.policy ? this.policyArgs(args.policy) : null, frozen: args.frozen ?? null })
      .accountsPartial({ owner: this.me, vault })
      .rpc();
  }

  async withdrawVault(vault: PublicKey, amount: bigint, destination: PublicKey, tokenProgram = TOKEN_PROGRAM_ID) {
    const v = await this.program.account.agentVault.fetch(vault);
    return this.program.methods
      .withdrawVault(bn(amount))
      .accountsPartial({
        owner: this.me,
        vault,
        mint: v.mint,
        vaultToken: ata(vault, v.mint, tokenProgram),
        destination,
        tokenProgram,
      })
      .rpc();
  }

  private policyArgs(p: VaultPolicyParams) {
    return {
      maxPerSession: bn(p.maxPerSession),
      periodLimit: bn(p.periodLimit),
      periodSeconds: p.periodSeconds,
      minProviderRating: p.minProviderRating ?? 0,
      allowedTeeMask: p.allowedTeeMask ?? 0,
      expiresAt: bn(p.expiresAt ?? 0n),
    };
  }

  // ---------------------------------------------------------------------
  // Compute credits
  // ---------------------------------------------------------------------

  async createOffering(args: {
    paymentMint: PublicKey;
    pricePerCredit: bigint;
    maxSupply: bigint;
    expiresAt: number;
    unit: string;
  }) {
    const provider = this.pdas.provider(this.me);
    const p = await this.program.account.provider.fetch(provider);
    const offering = this.pdas.offering(provider, BigInt(p.offeringCount.toString()));
    const creditMint = this.pdas.creditMint(offering);
    const signature = await this.program.methods
      .createOffering({
        pricePerCredit: bn(args.pricePerCredit),
        maxSupply: bn(args.maxSupply),
        expiresAt: bn(args.expiresAt),
        unit: args.unit,
      })
      .accountsPartial({
        operator: this.me,
        config: this.pdas.config(),
        provider,
        offering,
        creditMint,
        paymentMint: args.paymentMint,
        offeringEscrow: ata(offering, args.paymentMint),
        creditTokenProgram: TOKEN_PROGRAM_ID,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { signature, offering, creditMint };
  }

  async buyCredits(offeringAddr: PublicKey, credits: bigint) {
    const o = await this.program.account.offering.fetch(offeringAddr);
    const { attestation, measurement } = await this.activeAttestationAccounts(o.provider);
    return this.program.methods
      .buyCredits(bn(credits))
      .accountsPartial({
        buyer: this.me,
        config: this.pdas.config(),
        offering: offeringAddr,
        provider: o.provider,
        attestation,
        measurement,
        creditMint: o.creditMint,
        buyerCredits: ata(this.me, o.creditMint),
        paymentMint: o.paymentMint,
        buyerPayment: ata(this.me, o.paymentMint),
        offeringEscrow: ata(offeringAddr, o.paymentMint),
        creditTokenProgram: TOKEN_PROGRAM_ID,
        paymentTokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  private async redeemAccounts(offeringAddr: PublicKey) {
    const o = await this.program.account.offering.fetch(offeringAddr);
    const p = await this.program.account.provider.fetch(o.provider);
    let attestation: PublicKey | null = null;
    let measurement: PublicKey | null = null;
    if (!p.activeAttestation.equals(PublicKey.default)) {
      const att = await this.program.account.attestation.fetch(p.activeAttestation);
      attestation = p.activeAttestation;
      measurement = this.measurementFor(att);
    }
    return {
      holder: this.me,
      config: this.pdas.config(),
      offering: offeringAddr,
      provider: o.provider,
      attestation,
      measurement,
      creditMint: o.creditMint,
      holderCredits: ata(this.me, o.creditMint),
      paymentMint: o.paymentMint,
      offeringEscrow: ata(offeringAddr, o.paymentMint),
      holderPayment: ata(this.me, o.paymentMint),
      creditTokenProgram: TOKEN_PROGRAM_ID,
      paymentTokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  }

  async cashOutCredits(offeringAddr: PublicKey, credits: bigint) {
    return this.program.methods
      .cashOutCredits(bn(credits))
      .accountsPartial(await this.redeemAccounts(offeringAddr))
      .rpc();
  }

  async refundCredits(offeringAddr: PublicKey, credits: bigint) {
    return this.program.methods
      .refundCredits(bn(credits))
      .accountsPartial(await this.redeemAccounts(offeringAddr))
      .rpc();
  }

  // ---------------------------------------------------------------------

  async sendIxs(ixs: Parameters<Transaction["add"]>[0][], signers: Keypair[] = []): Promise<TransactionSignature> {
    const tx = new Transaction().add(...ixs);
    return this.provider.sendAndConfirm(tx, signers);
  }
}
