/** Node-only helpers (filesystem keypairs + local deployment state). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

/** Repo-local state directory (gitignored). Override with AGENTSPAY_HOME. */
export function stateDir(): string {
  return resolve(process.env.AGENTSPAY_HOME ?? resolve(process.cwd(), ".agentspay"));
}

export function loadKeypair(path: string): Keypair {
  const p = path.startsWith("~") ? path.replace("~", process.env.HOME ?? "") : path;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

export function loadOrCreateKeypair(path: string): Keypair {
  if (existsSync(path)) return loadKeypair(path);
  const kp = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

export interface LocalDeployment {
  rpcUrl: string;
  programId: string;
  usdcMint: string;
  usdcDecimals: number;
  treasury: string;
  verifiers: string[];
}

export function readDeployment(): LocalDeployment | null {
  const p = resolve(stateDir(), "deployment.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as LocalDeployment) : null;
}

export function writeDeployment(d: LocalDeployment) {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(resolve(stateDir(), "deployment.json"), JSON.stringify(d, null, 2));
}
