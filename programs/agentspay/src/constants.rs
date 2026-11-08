use anchor_lang::prelude::*;

// ---------------------------------------------------------------------------
// PDA seeds
// ---------------------------------------------------------------------------
pub const CONFIG_SEED: &[u8] = b"config";
pub const MEASUREMENT_SEED: &[u8] = b"measurement";
pub const PROVIDER_SEED: &[u8] = b"provider";
pub const ATTESTATION_SEED: &[u8] = b"attestation";
pub const SESSION_SEED: &[u8] = b"session";
pub const VAULT_SEED: &[u8] = b"vault";
pub const OFFERING_SEED: &[u8] = b"offering";
pub const CREDIT_MINT_SEED: &[u8] = b"credit_mint";

// ---------------------------------------------------------------------------
// Well-known program / sysvar ids
// ---------------------------------------------------------------------------
pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");
pub const INSTRUCTIONS_SYSVAR_ID: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");

// ---------------------------------------------------------------------------
// Protocol limits
// ---------------------------------------------------------------------------
/// Maximum number of attestation verifiers in the committee.
pub const MAX_VERIFIERS: usize = 8;
/// Protocol fee can never exceed 10%.
pub const MAX_FEE_BPS: u16 = 1_000;
pub const BPS_DENOMINATOR: u64 = 10_000;

pub const MAX_ENDPOINT_LEN: usize = 128;
pub const MAX_URI_LEN: usize = 128;
pub const MAX_LABEL_LEN: usize = 64;
pub const MAX_UNIT_LEN: usize = 32;

/// Length of a TEE launch measurement (MRTD / MRENCLAVE padded / SEV-SNP MEASUREMENT = SHA-384).
pub const MEASUREMENT_LEN: usize = 48;

/// Grace period bounds for forced session closes (seconds).
pub const MIN_GRACE_PERIOD: u32 = 60;
pub const MAX_GRACE_PERIOD: u32 = 7 * 24 * 60 * 60;

/// Upper bound on any attestation lifetime regardless of config (30 days).
pub const ABSOLUTE_MAX_ATTESTATION_TTL: i64 = 30 * 24 * 60 * 60;

/// Ratings are 0..=100 (matches ERC-8004 / 8004-solana feedback scale).
pub const MAX_RATING: u8 = 100;
