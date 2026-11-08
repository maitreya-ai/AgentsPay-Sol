use anchor_lang::prelude::*;

#[error_code]
pub enum AgentsPayError {
    // --- authority / config -------------------------------------------------
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Verifier set is empty, too large, or contains duplicates")]
    InvalidVerifierSet,
    #[msg("Verifier threshold must be between 1 and the number of verifiers")]
    InvalidThreshold,
    #[msg("Protocol fee exceeds the maximum")]
    FeeTooHigh,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("String exceeds maximum length")]
    StringTooLong,

    // --- attestation ---------------------------------------------------------
    #[msg("Unknown TEE type")]
    InvalidTeeType,
    #[msg("Simulated TEE attestations are disabled on this deployment")]
    SimulatedTeeDisabled,
    #[msg("Workload measurement is not approved")]
    MeasurementNotApproved,
    #[msg("Attestation is not pending")]
    AttestationNotPending,
    #[msg("Attestation is not valid (revoked, expired, or measurement revoked)")]
    AttestationNotValid,
    #[msg("Verifier already approved this attestation")]
    AlreadyApproved,
    #[msg("Signer is not a registered verifier")]
    NotVerifier,
    #[msg("Invalid attestation time-to-live")]
    InvalidTtl,
    #[msg("Attestation is not the provider's active attestation")]
    NotActiveAttestation,
    #[msg("Enclave key must differ from the operator key")]
    EnclaveKeyIsOperator,

    // --- sessions ------------------------------------------------------------
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Price per unit must be greater than zero")]
    InvalidPrice,
    #[msg("Grace period out of bounds")]
    InvalidGracePeriod,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Session is not open")]
    SessionNotOpen,
    #[msg("Session is not closed")]
    SessionNotClosed,
    #[msg("Session can no longer be settled (grace period elapsed)")]
    SessionNotSettleable,
    #[msg("Session cannot be closed yet")]
    CloseNotAllowed,
    #[msg("Escrow balance is lower than the recorded deposit")]
    EscrowShortfall,

    // --- signed messages -----------------------------------------------------
    #[msg("Expected Ed25519 precompile instruction is missing")]
    MissingEd25519Instruction,
    #[msg("Ed25519 precompile instruction is not in canonical single-signature form")]
    InvalidEd25519Instruction,
    #[msg("Signed message was signed by an unexpected key")]
    SignerMismatch,
    #[msg("Signed message is malformed")]
    InvalidMessage,
    #[msg("Voucher targets a different session")]
    VoucherSessionMismatch,
    #[msg("Voucher has expired")]
    VoucherExpired,
    #[msg("Usage receipt targets a different session")]
    ReceiptSessionMismatch,
    #[msg("Usage receipt units went backwards")]
    ReceiptRegressed,
    #[msg("Nothing to settle")]
    NothingToSettle,

    // --- vaults ----------------------------------------------------------------
    #[msg("Vault is frozen by its owner")]
    VaultFrozen,
    #[msg("Vault policy has expired")]
    VaultExpired,
    #[msg("Session deposit exceeds the vault's per-session cap")]
    SessionDepositTooLarge,
    #[msg("Vault spending limit for the current period would be exceeded")]
    PeriodLimitExceeded,
    #[msg("Provider rating is below the vault's minimum")]
    ProviderRatingTooLow,
    #[msg("Provider's TEE type is not allowed by the vault policy")]
    TeeTypeNotAllowed,
    #[msg("Vault account missing or does not match the session")]
    VaultMismatch,

    // --- credits -------------------------------------------------------------
    #[msg("Offering has expired")]
    OfferingExpired,
    #[msg("Offering supply cap reached")]
    OfferingSoldOut,
    #[msg(
        "Credits can only be refunded after expiry or when the provider has no valid attestation"
    )]
    RefundNotAllowed,
    #[msg("Only the provider payout wallet or the treasury can cash out credits")]
    NotCashOutAuthority,

    // --- reputation ----------------------------------------------------------
    #[msg("Rating must be between 0 and 100")]
    InvalidRating,
    #[msg("Only sessions with settled payment can be rated")]
    NothingToRate,
}
