use anchor_lang::prelude::*;

use crate::{constants::*, error::AgentsPayError, events::*, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub treasury: Pubkey,
    pub verifiers: Vec<Pubkey>,
    pub verifier_threshold: u8,
    pub protocol_fee_bps: u16,
    pub max_attestation_ttl: i64,
    pub allow_simulated_tee: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateConfigArgs {
    pub new_admin: Option<Pubkey>,
    pub treasury: Option<Pubkey>,
    pub verifiers: Option<Vec<Pubkey>>,
    pub verifier_threshold: Option<u8>,
    pub protocol_fee_bps: Option<u16>,
    pub max_attestation_ttl: Option<i64>,
    pub allow_simulated_tee: Option<bool>,
    pub paused: Option<bool>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MeasurementArgs {
    pub tee_type: u8,
    pub value: [u8; MEASUREMENT_LEN],
    pub model_hash: [u8; 32],
    pub label: String,
}

/// Only the program's upgrade authority can initialize, so nobody can
/// front-run the deployer and seize the admin role.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ AgentsPayError::Unauthorized)]
    pub program: Program<'info, crate::program::Agentspay>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ AgentsPayError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AgentsPayError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(args: MeasurementArgs)]
pub struct ApproveMeasurement<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ AgentsPayError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Measurement::INIT_SPACE,
        seeds = [MEASUREMENT_SEED, &[args.tee_type], &args.value[..32], &args.value[32..]],
        bump
    )]
    pub measurement: Account<'info, Measurement>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeMeasurement<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub measurement: Account<'info, Measurement>,
}

fn validate_verifiers(verifiers: &[Pubkey], threshold: u8) -> Result<()> {
    require!(
        !verifiers.is_empty() && verifiers.len() <= MAX_VERIFIERS,
        AgentsPayError::InvalidVerifierSet
    );
    for (i, v) in verifiers.iter().enumerate() {
        require!(*v != Pubkey::default(), AgentsPayError::InvalidVerifierSet);
        require!(
            !verifiers[..i].contains(v),
            AgentsPayError::InvalidVerifierSet
        );
    }
    require!(
        threshold >= 1 && threshold as usize <= verifiers.len(),
        AgentsPayError::InvalidThreshold
    );
    Ok(())
}

fn validate_ttl(ttl: i64) -> Result<()> {
    require!(
        ttl > 0 && ttl <= ABSOLUTE_MAX_ATTESTATION_TTL,
        AgentsPayError::InvalidTtl
    );
    Ok(())
}

fn emit_config(c: &Config) {
    emit!(ConfigUpdated {
        admin: c.admin,
        treasury: c.treasury,
        verifier_count: c.verifiers.len() as u8,
        verifier_threshold: c.verifier_threshold,
        protocol_fee_bps: c.protocol_fee_bps,
        paused: c.paused,
    });
}

pub fn handle_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    validate_verifiers(&args.verifiers, args.verifier_threshold)?;
    validate_ttl(args.max_attestation_ttl)?;
    require!(
        args.protocol_fee_bps <= MAX_FEE_BPS,
        AgentsPayError::FeeTooHigh
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = args.treasury;
    config.verifiers = args.verifiers;
    config.verifier_threshold = args.verifier_threshold;
    config.protocol_fee_bps = args.protocol_fee_bps;
    config.max_attestation_ttl = args.max_attestation_ttl;
    config.allow_simulated_tee = args.allow_simulated_tee;
    config.paused = false;
    config.bump = ctx.bumps.config;
    emit_config(config);
    Ok(())
}

pub fn handle_update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    if let Some(admin) = args.new_admin {
        config.admin = admin;
    }
    if let Some(treasury) = args.treasury {
        config.treasury = treasury;
    }
    if let Some(verifiers) = args.verifiers {
        config.verifiers = verifiers;
    }
    if let Some(threshold) = args.verifier_threshold {
        config.verifier_threshold = threshold;
    }
    validate_verifiers(&config.verifiers, config.verifier_threshold)?;
    if let Some(fee) = args.protocol_fee_bps {
        require!(fee <= MAX_FEE_BPS, AgentsPayError::FeeTooHigh);
        config.protocol_fee_bps = fee;
    }
    if let Some(ttl) = args.max_attestation_ttl {
        validate_ttl(ttl)?;
        config.max_attestation_ttl = ttl;
    }
    if let Some(sim) = args.allow_simulated_tee {
        config.allow_simulated_tee = sim;
    }
    if let Some(paused) = args.paused {
        config.paused = paused;
    }
    emit_config(config);
    Ok(())
}

pub fn handle_approve_measurement(
    ctx: Context<ApproveMeasurement>,
    args: MeasurementArgs,
) -> Result<()> {
    require!(
        TeeType::from_u8(args.tee_type).is_some(),
        AgentsPayError::InvalidTeeType
    );
    require!(
        args.label.len() <= MAX_LABEL_LEN,
        AgentsPayError::StringTooLong
    );
    let m = &mut ctx.accounts.measurement;
    m.tee_type = args.tee_type;
    m.value = args.value;
    m.model_hash = args.model_hash;
    m.label = args.label;
    m.approved = true;
    m.updated_at = Clock::get()?.unix_timestamp;
    m.bump = ctx.bumps.measurement;
    emit!(MeasurementSet {
        measurement: m.key(),
        tee_type: m.tee_type,
        value: m.value,
        model_hash: m.model_hash,
        approved: true,
    });
    Ok(())
}

/// Revocation is deliberately cheaper than approval: the admin *or any single
/// verifier* can pull a vulnerable workload, which instantly invalidates every
/// attestation (and therefore every settlement) that depends on it.
pub fn handle_revoke_measurement(ctx: Context<RevokeMeasurement>) -> Result<()> {
    let config = &ctx.accounts.config;
    let who = ctx.accounts.authority.key();
    require!(
        who == config.admin || config.is_verifier(&who),
        AgentsPayError::Unauthorized
    );
    let m = &mut ctx.accounts.measurement;
    m.approved = false;
    m.updated_at = Clock::get()?.unix_timestamp;
    emit!(MeasurementSet {
        measurement: m.key(),
        tee_type: m.tee_type,
        value: m.value,
        model_hash: m.model_hash,
        approved: false,
    });
    Ok(())
}
