import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Per-session metering state, keyed by session address.
 *
 * Every voucher acceptance is a single linearizable transition per session
 * (see `withLock`) that durably persists both the accepted cumulative amount
 * and the full signed voucher *before* the resource is delivered, so the
 * provider can always settle what it served.
 */
export interface SessionLedger {
  session: string;
  authorizedSigner: string;
  mint: string;
  pricePerUnit: string;
  deposit: string;
  /** Highest voucher amount accepted. */
  acceptedCumulative: string;
  /** serializeSigned(voucher) for `acceptedCumulative`. */
  voucher: string | null;
  /** Enclave-metered units so far. */
  units: string;
  transcript: string; // hex
  /** serializeSigned(receipt) for `units`. */
  receipt: string | null;
  settled: string;
  closed: boolean;
  updatedAt: number;
}

export class Ledger {
  #data: Record<string, SessionLedger>;
  #locks = new Map<string, Promise<unknown>>();

  constructor(private readonly path: string) {
    this.#data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  }

  get(session: string): SessionLedger | undefined {
    return this.#data[session];
  }

  all(): SessionLedger[] {
    return Object.values(this.#data);
  }

  put(entry: SessionLedger) {
    entry.updatedAt = Date.now();
    this.#data[entry.session] = entry;
    this.flush();
  }

  private flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#data, null, 2));
    renameSync(tmp, this.path);
  }

  /** Serialise all work on one session. */
  async withLock<T>(session: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.#locks.get(session) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const chained = prev.then(() => next);
    this.#locks.set(session, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.#locks.get(session) === chained) this.#locks.delete(session);
    }
  }
}
