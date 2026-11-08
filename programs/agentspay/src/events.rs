use anchor_lang::prelude::*;

#[event]
pub struct ConfigUpdated {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub verifier_count: u8,
    pub verifier_threshold: u8,
    pub protocol_fee_bps: u16,
    pub paused: bool,
}

#[event]
pub struct MeasurementSet {
    pub measurement: Pubkey,
    pub tee_type: u8,
    pub value: [u8; 48],
    pub model_hash: [u8; 32],
    pub approved: bool,
}

#[event]
pub struct ProviderRegistered {
    pub provider: Pubkey,
    pub operator: Pubkey,
    pub payout: Pubkey,
    pub agent_asset: Pubkey,
}

#[event]
pub struct ProviderUpdated {
    pub provider: Pubkey,
    pub payout: Pubkey,
    pub agent_asset: Pubkey,
}

#[event]
pub struct AttestationSubmitted {
    pub attestation: Pubkey,
    pub provider: Pubkey,
    pub enclave_key: Pubkey,
    pub tee_type: u8,
    pub measurement: [u8; 48],
    pub evidence_hash: [u8; 32],
}

#[event]
pub struct AttestationApproved {
    pub attestation: Pubkey,
    pub verifier: Pubkey,
    pub approvals: u8,
}

#[event]
pub struct AttestationValidated {
    pub attestation: Pubkey,
    pub provider: Pubkey,
    pub enclave_key: Pubkey,
    pub expires_at: i64,
}

#[event]
pub struct AttestationRevoked {
    pub attestation: Pubkey,
    pub provider: Pubkey,
    pub revoked_by: Pubkey,
    pub reason: u8,
}

#[event]
pub struct SessionOpened {
    pub session: Pubkey,
    pub payer: Pubkey,
    pub vault: Pubkey,
    pub provider: Pubkey,
    pub attestation: Pubkey,
    pub authorized_signer: Pubkey,
    pub mint: Pubkey,
    pub deposit: u64,
    pub price_per_unit: u64,
}

#[event]
pub struct SessionToppedUp {
    pub session: Pubkey,
    pub amount: u64,
    pub deposit: u64,
}

#[event]
pub struct SessionSettled {
    pub session: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub settled: u64,
    pub units: u64,
    pub transcript_hash: [u8; 32],
}

#[event]
pub struct SessionCloseRequested {
    pub session: Pubkey,
    pub requested_by: Pubkey,
    pub closes_after: i64,
}

#[event]
pub struct SessionClosed {
    pub session: Pubkey,
    pub provider: Pubkey,
    pub settled: u64,
    pub refunded: u64,
    pub forced: bool,
}

/// Payment-backed feedback. Each rating is bound to a session that actually
/// settled value through an attested enclave, so indexers can forward it to
/// the 8004 reputation registry with an unforgeable proof-of-payment link.
#[event]
pub struct PaidFeedback {
    pub session: Pubkey,
    pub provider: Pubkey,
    pub agent_asset: Pubkey,
    pub payer: Pubkey,
    pub mint: Pubkey,
    pub settled: u64,
    pub units: u64,
    pub rating: u8,
    pub transcript_hash: [u8; 32],
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct VaultUpdated {
    pub vault: Pubkey,
    pub frozen: bool,
}

#[event]
pub struct VaultWithdrawn {
    pub vault: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OfferingCreated {
    pub offering: Pubkey,
    pub provider: Pubkey,
    pub credit_mint: Pubkey,
    pub payment_mint: Pubkey,
    pub price_per_credit: u64,
    pub max_supply: u64,
    pub expires_at: i64,
}

#[event]
pub struct CreditsPurchased {
    pub offering: Pubkey,
    pub buyer: Pubkey,
    pub credits: u64,
    pub cost: u64,
}

#[event]
pub struct CreditsRedeemed {
    pub offering: Pubkey,
    pub holder: Pubkey,
    pub credits: u64,
    pub payout: u64,
    /// true = default refund to a holder, false = provider/treasury cash-out.
    pub refund: bool,
}
