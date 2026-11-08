use anchor_lang::prelude::*;

use crate::constants::*;

/// Trusted execution environment families the protocol understands.
///
/// The on-chain program never parses vendor quotes itself; it records which
/// family produced the evidence so verifiers, vault policies and clients can
/// reason about it. `Simulated` exists for local development only and is
/// rejected unless `Config::allow_simulated_tee` is set.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum TeeType {
    Simulated = 0,
    IntelTdx = 1,
    AmdSevSnp = 2,
    IntelSgx = 3,
    /// NVIDIA Hopper/Blackwell confidential computing (GPU evidence bundled with a CPU CVM quote).
    NvidiaCc = 4,
    AwsNitro = 5,
}

impl TeeType {
    pub fn from_u8(v: u8) -> Option<Self> {
        Some(match v {
            0 => Self::Simulated,
            1 => Self::IntelTdx,
            2 => Self::AmdSevSnp,
            3 => Self::IntelSgx,
            4 => Self::NvidiaCc,
            5 => Self::AwsNitro,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum AttestationStatus {
    Pending = 0,
    Valid = 1,
    Revoked = 2,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum SessionStatus {
    Open = 0,
    Closing = 1,
    Closed = 2,
}

/// Global protocol configuration (singleton PDA).
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Wallet that owns protocol-fee token accounts.
    pub treasury: Pubkey,
    /// Attestation verifier committee.
    #[max_len(MAX_VERIFIERS)]
    pub verifiers: Vec<Pubkey>,
    /// Approvals required to mark an attestation valid.
    pub verifier_threshold: u8,
    pub protocol_fee_bps: u16,
    /// Upper bound on attestation lifetime (seconds).
    pub max_attestation_ttl: i64,
    /// Allow `TeeType::Simulated` (localnet / devnet only).
    pub allow_simulated_tee: bool,
    /// Blocks new sessions / credit sales. Exits always stay open.
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    pub fn is_verifier(&self, key: &Pubkey) -> bool {
        self.verifiers.iter().any(|v| v == key)
    }
}

/// Governance-approved workload measurement: a reproducible build of the
/// inference server + model weights that providers are allowed to run.
/// Revoking a measurement instantly invalidates every attestation that
/// carries it (e.g. after a CVE or TCB recall).
#[account]
#[derive(InitSpace)]
pub struct Measurement {
    pub tee_type: u8,
    pub value: [u8; MEASUREMENT_LEN],
    /// SHA-256 of the model weights / manifest served by this workload.
    pub model_hash: [u8; 32],
    #[max_len(MAX_LABEL_LEN)]
    pub label: String,
    pub approved: bool,
    pub updated_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default, InitSpace, PartialEq, Eq)]
pub struct ProviderStats {
    pub sessions_opened: u64,
    pub sessions_closed: u64,
    /// Sessions closed without provider cooperation (grace expiry or invalid attestation).
    pub forced_closes: u64,
    pub settlements: u64,
    pub units_served: u64,
    /// Ratings are only accepted from payers whose sessions actually settled payment.
    pub ratings_count: u64,
    pub ratings_sum: u64,
}

impl ProviderStats {
    /// Average paid-feedback rating (0..=100), `None` when unrated.
    pub fn average_rating(&self) -> Option<u64> {
        if self.ratings_count == 0 {
            None
        } else {
            Some(self.ratings_sum / self.ratings_count)
        }
    }
}

/// A compute provider (GPU operator) offering attested inference.
#[account]
#[derive(InitSpace)]
pub struct Provider {
    pub operator: Pubkey,
    /// Wallet receiving settlements.
    pub payout: Pubkey,
    /// Optional 8004 / Metaplex Core agent asset representing this provider's identity.
    pub agent_asset: Pubkey,
    #[max_len(MAX_ENDPOINT_LEN)]
    pub endpoint: String,
    /// Most recently validated attestation (default pubkey when none).
    pub active_attestation: Pubkey,
    pub offering_count: u64,
    pub created_at: i64,
    pub stats: ProviderStats,
    pub bump: u8,
}

/// Hardware attestation binding an enclave-held key to an approved workload.
///
/// The TEE quote's `REPORTDATA` must commit to
/// `sha256("agentspay:attest:v1" || provider || enclave_key || encryption_key)`
/// so the verifiers can prove the keys were generated inside the enclave.
#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub provider: Pubkey,
    /// Ed25519 key that never leaves the enclave; signs usage receipts.
    pub enclave_key: Pubkey,
    /// X25519 key for sealing prompts to the enclave (private inference).
    pub encryption_key: [u8; 32],
    pub tee_type: u8,
    pub measurement: [u8; MEASUREMENT_LEN],
    /// SHA-256 of the raw evidence bundle (quote + GPU report + collateral).
    pub evidence_hash: [u8; 32],
    #[max_len(MAX_URI_LEN)]
    pub evidence_uri: String,
    pub requested_ttl: i64,
    pub submitted_at: i64,
    pub verified_at: i64,
    pub expires_at: i64,
    #[max_len(MAX_VERIFIERS)]
    pub approvals: Vec<Pubkey>,
    pub status: u8,
    pub bump: u8,
}

impl Attestation {
    /// Valid = approved by the committee, not revoked, not expired, and its
    /// workload measurement is still approved.
    pub fn is_valid(&self, measurement: &Measurement, now: i64) -> bool {
        self.status == AttestationStatus::Valid as u8
            && now < self.expires_at
            && measurement.approved
            && measurement.tee_type == self.tee_type
            && measurement.value == self.measurement
    }
}

/// An attestation-gated metered payment session (a unidirectional payment
/// channel whose settlement additionally requires an enclave-signed receipt).
#[account]
#[derive(InitSpace)]
pub struct Session {
    /// Refund owner: the payer wallet, or the `AgentVault` PDA for vault-funded sessions.
    pub payer: Pubkey,
    /// `AgentVault` PDA when vault-funded, default otherwise.
    pub vault: Pubkey,
    /// Account that paid rent; receives it back on finalize.
    pub rent_payer: Pubkey,
    pub provider: Pubkey,
    pub attestation: Pubkey,
    /// Snapshot of `attestation.enclave_key` (receipt signer).
    pub enclave_key: Pubkey,
    /// Voucher signer (usually an agent's ephemeral session key).
    pub authorized_signer: Pubkey,
    pub mint: Pubkey,
    pub salt: u64,
    pub price_per_unit: u64,
    pub deposit: u64,
    /// Cumulative amount paid out (gross, including protocol fee).
    pub settled: u64,
    pub units_settled: u64,
    /// Last enclave transcript hash committed on-chain (audit trail).
    pub transcript_hash: [u8; 32],
    pub opened_at: i64,
    pub close_requested_at: i64,
    pub grace_period: u32,
    pub status: u8,
    pub bump: u8,
}

/// Owner-funded budget an agent can spend from under a policy, without the
/// owner signing every session. The owner can freeze or drain it at any time.
#[account]
#[derive(InitSpace)]
pub struct AgentVault {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub max_per_session: u64,
    /// Max deposits per rolling period; ignored when `period_seconds == 0`.
    pub period_limit: u64,
    pub period_seconds: u32,
    pub period_start: i64,
    pub period_spent: u64,
    /// Minimum paid-feedback average (0 disables the check).
    pub min_provider_rating: u8,
    /// Bit i set = `TeeType` i allowed. 0 = any non-simulated type allowed by config.
    pub allowed_tee_mask: u16,
    /// Unix timestamp after which the agent can no longer open sessions (0 = never).
    pub expires_at: i64,
    pub frozen: bool,
    pub open_sessions: u32,
    pub lifetime_settled: u64,
    pub bump: u8,
}

/// Tokenized compute capacity ("GPU-hours"): an SPL mint whose supply is
/// fully collateralised by buyer payments held in escrow. Credits are spent
/// in attested sessions; the provider converts credits it earned back into
/// the payment token, and holders can refund if the provider defaults.
#[account]
#[derive(InitSpace)]
pub struct Offering {
    pub provider: Pubkey,
    pub id: u64,
    pub credit_mint: Pubkey,
    pub payment_mint: Pubkey,
    /// Payment-token base units per credit (credits have 0 decimals).
    pub price_per_credit: u64,
    pub max_supply: u64,
    pub minted: u64,
    pub expires_at: i64,
    /// Human-readable unit, e.g. "h100-gpu-second" or "1k-tokens:llama-3.1-70b".
    #[max_len(MAX_UNIT_LEN)]
    pub unit: String,
    pub bump: u8,
    pub mint_bump: u8,
}
