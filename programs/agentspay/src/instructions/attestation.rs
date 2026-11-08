use anchor_lang::prelude::*;

use crate::{constants::*, error::AgentsPayError, events::*, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SubmitAttestationArgs {
    pub enclave_key: Pubkey,
    pub encryption_key: [u8; 32],
    pub tee_type: u8,
    pub measurement: [u8; MEASUREMENT_LEN],
    pub evidence_hash: [u8; 32],
    pub evidence_uri: String,
    pub requested_ttl: i64,
}

#[derive(Accounts)]
#[instruction(args: SubmitAttestationArgs)]
pub struct SubmitAttestation<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(has_one = operator @ AgentsPayError::Unauthorized)]
    pub provider: Account<'info, Provider>,
    #[account(
        init,
        payer = operator,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [ATTESTATION_SEED, provider.key().as_ref(), args.enclave_key.as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveAttestation<'info> {
    pub verifier: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub provider: Account<'info, Provider>,
    #[account(mut, has_one = provider)]
    pub attestation: Account<'info, Attestation>,
    #[account(
        seeds = [MEASUREMENT_SEED, &[attestation.tee_type], &attestation.measurement[..32], &attestation.measurement[32..]],
        bump = measurement.bump
    )]
    pub measurement: Account<'info, Measurement>,
}

#[derive(Accounts)]
pub struct RevokeAttestation<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub provider: Account<'info, Provider>,
    #[account(mut, has_one = provider)]
    pub attestation: Account<'info, Attestation>,
}

pub fn handle_submit_attestation(
    ctx: Context<SubmitAttestation>,
    args: SubmitAttestationArgs,
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(!config.paused, AgentsPayError::ProtocolPaused);
    let tee = TeeType::from_u8(args.tee_type).ok_or(AgentsPayError::InvalidTeeType)?;
    if tee == TeeType::Simulated {
        require!(
            config.allow_simulated_tee,
            AgentsPayError::SimulatedTeeDisabled
        );
    }
    require!(
        args.evidence_uri.len() <= MAX_URI_LEN,
        AgentsPayError::StringTooLong
    );
    require!(
        args.requested_ttl > 0 && args.requested_ttl <= config.max_attestation_ttl,
        AgentsPayError::InvalidTtl
    );
    // The receipt key must live in the enclave; reusing the operator's host key
    // would let the operator forge receipts outside the TEE.
    require!(
        args.enclave_key != ctx.accounts.operator.key()
            && args.enclave_key != ctx.accounts.provider.payout,
        AgentsPayError::EnclaveKeyIsOperator
    );

    let now = Clock::get()?.unix_timestamp;
    let a = &mut ctx.accounts.attestation;
    a.provider = ctx.accounts.provider.key();
    a.enclave_key = args.enclave_key;
    a.encryption_key = args.encryption_key;
    a.tee_type = args.tee_type;
    a.measurement = args.measurement;
    a.evidence_hash = args.evidence_hash;
    a.evidence_uri = args.evidence_uri;
    a.requested_ttl = args.requested_ttl;
    a.submitted_at = now;
    a.verified_at = 0;
    a.expires_at = 0;
    a.approvals = Vec::new();
    a.status = AttestationStatus::Pending as u8;
    a.bump = ctx.bumps.attestation;

    emit!(AttestationSubmitted {
        attestation: a.key(),
        provider: a.provider,
        enclave_key: a.enclave_key,
        tee_type: a.tee_type,
        measurement: a.measurement,
        evidence_hash: a.evidence_hash,
    });
    Ok(())
}

/// A committee verifier vouches that it checked the evidence bundle off-chain:
/// vendor certificate chain + TCB status, `REPORTDATA` binding of the keys,
/// and that the launch measurement equals `attestation.measurement`.
/// Once `verifier_threshold` approvals land, the attestation becomes Valid and
/// the provider's active attestation.
pub fn handle_approve_attestation(ctx: Context<ApproveAttestation>) -> Result<()> {
    let config = &ctx.accounts.config;
    let verifier = ctx.accounts.verifier.key();
    require!(config.is_verifier(&verifier), AgentsPayError::NotVerifier);
    require!(
        ctx.accounts.measurement.approved,
        AgentsPayError::MeasurementNotApproved
    );

    let a = &mut ctx.accounts.attestation;
    require!(
        a.status == AttestationStatus::Pending as u8,
        AgentsPayError::AttestationNotPending
    );
    require!(
        !a.approvals.contains(&verifier),
        AgentsPayError::AlreadyApproved
    );
    a.approvals.push(verifier);

    // Only approvals from the *current* committee count (the set may rotate).
    let live = a.approvals.iter().filter(|k| config.is_verifier(k)).count();
    emit!(AttestationApproved {
        attestation: a.key(),
        verifier,
        approvals: live as u8,
    });

    if live >= config.verifier_threshold as usize {
        let now = Clock::get()?.unix_timestamp;
        let ttl = a.requested_ttl.min(config.max_attestation_ttl);
        a.status = AttestationStatus::Valid as u8;
        a.verified_at = now;
        a.expires_at = now.checked_add(ttl).ok_or(AgentsPayError::MathOverflow)?;
        ctx.accounts.provider.active_attestation = a.key();
        emit!(AttestationValidated {
            attestation: a.key(),
            provider: a.provider,
            enclave_key: a.enclave_key,
            expires_at: a.expires_at,
        });
    }
    Ok(())
}

/// Admin, any verifier, or the provider operator can revoke an attestation.
pub fn handle_revoke_attestation(ctx: Context<RevokeAttestation>, reason: u8) -> Result<()> {
    let config = &ctx.accounts.config;
    let who = ctx.accounts.authority.key();
    require!(
        who == config.admin || config.is_verifier(&who) || who == ctx.accounts.provider.operator,
        AgentsPayError::Unauthorized
    );
    let a = &mut ctx.accounts.attestation;
    a.status = AttestationStatus::Revoked as u8;
    if ctx.accounts.provider.active_attestation == a.key() {
        ctx.accounts.provider.active_attestation = Pubkey::default();
    }
    emit!(AttestationRevoked {
        attestation: a.key(),
        provider: a.provider,
        revoked_by: who,
        reason,
    });
    Ok(())
}
