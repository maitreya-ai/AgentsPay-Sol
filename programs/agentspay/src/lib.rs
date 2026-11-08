//! # AgentsPay
//!
//! Attestation-gated, metered payments for AI agents on Solana.
//!
//! * **Attestation registry**: providers bind an enclave-generated key to a
//!   governance-approved workload measurement; a verifier committee (M-of-N,
//!   ZK verifier pluggable later) validates the hardware evidence.
//! * **Attested sessions**: payment channels whose settlement needs *two*
//!   Ed25519 signatures, the payer's cumulative voucher and the enclave's
//!   cumulative usage receipt, and only pays while the attestation is valid.
//! * **Agent vaults**: owner-funded budgets with per-session caps, rolling
//!   limits, TEE/rating requirements and a kill-switch.
//! * **Compute credits**: fully collateralised SPL tokens for provider
//!   capacity ("tokenized GPU-hours") with a default refund path.
//! * **Paid feedback**: ratings only from sessions that settled real value,
//!   emitted for the 8004 agent registry.

#![allow(unexpected_cfgs)]
#![allow(clippy::result_large_err)]

pub mod constants;
pub mod ed25519;
pub mod error;
pub mod events;
pub mod instructions;
pub mod messages;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use messages::*;
pub use state::*;

declare_id!("EZsX7kN4Zb555Aaov2v9MBUC543JVmL5P6cQGAytUkdT");

#[program]
pub mod agentspay {
    use super::*;

    // ----- governance ------------------------------------------------------

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        instructions::admin::handle_initialize(ctx, args)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        instructions::admin::handle_update_config(ctx, args)
    }

    pub fn approve_measurement(
        ctx: Context<ApproveMeasurement>,
        args: MeasurementArgs,
    ) -> Result<()> {
        instructions::admin::handle_approve_measurement(ctx, args)
    }

    pub fn revoke_measurement(ctx: Context<RevokeMeasurement>) -> Result<()> {
        instructions::admin::handle_revoke_measurement(ctx)
    }

    // ----- providers & attestation -------------------------------------------

    pub fn register_provider(
        ctx: Context<RegisterProvider>,
        args: RegisterProviderArgs,
    ) -> Result<()> {
        instructions::provider::handle_register_provider(ctx, args)
    }

    pub fn update_provider(ctx: Context<UpdateProvider>, args: UpdateProviderArgs) -> Result<()> {
        instructions::provider::handle_update_provider(ctx, args)
    }

    pub fn submit_attestation(
        ctx: Context<SubmitAttestation>,
        args: SubmitAttestationArgs,
    ) -> Result<()> {
        instructions::attestation::handle_submit_attestation(ctx, args)
    }

    pub fn approve_attestation(ctx: Context<ApproveAttestation>) -> Result<()> {
        instructions::attestation::handle_approve_attestation(ctx)
    }

    pub fn revoke_attestation(ctx: Context<RevokeAttestation>, reason: u8) -> Result<()> {
        instructions::attestation::handle_revoke_attestation(ctx, reason)
    }

    // ----- attested sessions -------------------------------------------------

    pub fn open_session(ctx: Context<OpenSession>, args: OpenSessionArgs) -> Result<()> {
        instructions::session::handle_open_session(ctx, args)
    }

    pub fn top_up_session(ctx: Context<TopUpSession>, amount: u64) -> Result<()> {
        instructions::session::handle_top_up_session(ctx, amount)
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        instructions::session::handle_settle(ctx)
    }

    pub fn request_close(ctx: Context<RequestClose>) -> Result<()> {
        instructions::session::handle_request_close(ctx)
    }

    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        instructions::session::handle_close_session(ctx)
    }

    pub fn finalize_session(ctx: Context<FinalizeSession>, rating: Option<u8>) -> Result<()> {
        instructions::session::handle_finalize_session(ctx, rating)
    }

    // ----- agent vaults ------------------------------------------------------

    pub fn create_vault(
        ctx: Context<CreateVault>,
        agent: Pubkey,
        policy: VaultPolicy,
    ) -> Result<()> {
        instructions::vault::handle_create_vault(ctx, agent, policy)
    }

    pub fn update_vault(ctx: Context<UpdateVault>, args: UpdateVaultArgs) -> Result<()> {
        instructions::vault::handle_update_vault(ctx, args)
    }

    pub fn withdraw_vault(ctx: Context<WithdrawVault>, amount: u64) -> Result<()> {
        instructions::vault::handle_withdraw_vault(ctx, amount)
    }

    pub fn open_session_from_vault(
        ctx: Context<OpenSessionFromVault>,
        args: OpenSessionArgs,
    ) -> Result<()> {
        instructions::vault::handle_open_session_from_vault(ctx, args)
    }

    // ----- compute credits ---------------------------------------------------

    pub fn create_offering(ctx: Context<CreateOffering>, args: CreateOfferingArgs) -> Result<()> {
        instructions::credits::handle_create_offering(ctx, args)
    }

    pub fn buy_credits(ctx: Context<BuyCredits>, credits: u64) -> Result<()> {
        instructions::credits::handle_buy_credits(ctx, credits)
    }

    pub fn cash_out_credits(ctx: Context<RedeemCredits>, credits: u64) -> Result<()> {
        instructions::credits::handle_cash_out_credits(ctx, credits)
    }

    pub fn refund_credits(ctx: Context<RedeemCredits>, credits: u64) -> Result<()> {
        instructions::credits::handle_refund_credits(ctx, credits)
    }
}
