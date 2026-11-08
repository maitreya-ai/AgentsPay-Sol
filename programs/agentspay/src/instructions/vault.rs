use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    error::AgentsPayError,
    events::*,
    instructions::session::{emit_opened, init_session, validate_open, OpenSessionArgs},
    state::*,
    utils::transfer_tokens,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VaultPolicy {
    pub max_per_session: u64,
    pub period_limit: u64,
    pub period_seconds: u32,
    pub min_provider_rating: u8,
    pub allowed_tee_mask: u16,
    pub expires_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateVaultArgs {
    pub policy: Option<VaultPolicy>,
    pub frozen: Option<bool>,
}

fn apply_policy(v: &mut AgentVault, p: &VaultPolicy) -> Result<()> {
    require!(
        p.min_provider_rating <= MAX_RATING,
        AgentsPayError::InvalidRating
    );
    v.max_per_session = p.max_per_session;
    v.period_limit = p.period_limit;
    v.period_seconds = p.period_seconds;
    v.min_provider_rating = p.min_provider_rating;
    v.allowed_tee_mask = p.allowed_tee_mask;
    v.expires_at = p.expires_at;
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(agent: Pubkey)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = owner,
        space = 8 + AgentVault::INIT_SPACE,
        seeds = [VAULT_SEED, owner.key().as_ref(), agent.as_ref(), mint.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, AgentVault>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vault(
    ctx: Context<CreateVault>,
    agent: Pubkey,
    policy: VaultPolicy,
) -> Result<()> {
    require!(agent != Pubkey::default(), AgentsPayError::Unauthorized);
    let v = &mut ctx.accounts.vault;
    v.owner = ctx.accounts.owner.key();
    v.agent = agent;
    v.mint = ctx.accounts.mint.key();
    apply_policy(v, &policy)?;
    v.period_start = Clock::get()?.unix_timestamp;
    v.period_spent = 0;
    v.frozen = false;
    v.open_sessions = 0;
    v.lifetime_settled = 0;
    v.bump = ctx.bumps.vault;
    emit!(VaultCreated {
        vault: v.key(),
        owner: v.owner,
        agent: v.agent,
        mint: v.mint,
    });
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct UpdateVault<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner @ AgentsPayError::Unauthorized)]
    pub vault: Box<Account<'info, AgentVault>>,
}

/// Owner can change the policy or flip the kill-switch at any time.
pub fn handle_update_vault(ctx: Context<UpdateVault>, args: UpdateVaultArgs) -> Result<()> {
    let v = &mut ctx.accounts.vault;
    if let Some(policy) = args.policy {
        apply_policy(v, &policy)?;
    }
    if let Some(frozen) = args.frozen {
        v.frozen = frozen;
    }
    emit!(VaultUpdated {
        vault: v.key(),
        frozen: v.frozen,
    });
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct WithdrawVault<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner @ AgentsPayError::Unauthorized, has_one = mint)]
    pub vault: Box<Account<'info, AgentVault>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw_vault(ctx: Context<WithdrawVault>, amount: u64) -> Result<()> {
    require!(amount > 0, AgentsPayError::InvalidAmount);
    let v = &ctx.accounts.vault;
    let bump = [v.bump];
    let seeds: &[&[u8]] = &[
        VAULT_SEED,
        v.owner.as_ref(),
        v.agent.as_ref(),
        v.mint.as_ref(),
        &bump,
    ];
    transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.vault_token,
        &ctx.accounts.mint,
        &ctx.accounts.destination,
        ctx.accounts.vault.to_account_info(),
        amount,
        Some(&[seeds]),
    )?;
    emit!(VaultWithdrawn {
        vault: ctx.accounts.vault.key(),
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// open_session_from_vault
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(args: OpenSessionArgs)]
pub struct OpenSessionFromVault<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = agent @ AgentsPayError::Unauthorized, has_one = mint)]
    pub vault: Box<Account<'info, AgentVault>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(
        has_one = provider,
        constraint = attestation.key() == provider.active_attestation @ AgentsPayError::NotActiveAttestation
    )]
    pub attestation: Box<Account<'info, Attestation>>,
    #[account(
        seeds = [MEASUREMENT_SEED, &[attestation.tee_type], &attestation.measurement[..32], &attestation.measurement[32..]],
        bump = measurement.bump
    )]
    pub measurement: Box<Account<'info, Measurement>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = agent,
        space = 8 + Session::INIT_SPACE,
        seeds = [SESSION_SEED, vault.key().as_ref(), provider.key().as_ref(), &args.salt.to_le_bytes()],
        bump
    )]
    pub session: Box<Account<'info, Session>>,
    #[account(
        init_if_needed,
        payer = agent,
        associated_token::mint = mint,
        associated_token::authority = session,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Enforce the owner's spending policy for a new vault-funded session.
pub(crate) fn enforce_policy(
    v: &mut AgentVault,
    deposit: u64,
    provider: &Provider,
    attestation: &Attestation,
    now: i64,
) -> Result<()> {
    require!(!v.frozen, AgentsPayError::VaultFrozen);
    require!(
        v.expires_at == 0 || now < v.expires_at,
        AgentsPayError::VaultExpired
    );
    require!(
        deposit <= v.max_per_session,
        AgentsPayError::SessionDepositTooLarge
    );
    if v.period_seconds > 0 {
        if now >= v.period_start.saturating_add(v.period_seconds as i64) {
            v.period_start = now;
            v.period_spent = 0;
        }
        let spent = v
            .period_spent
            .checked_add(deposit)
            .ok_or(AgentsPayError::MathOverflow)?;
        require!(spent <= v.period_limit, AgentsPayError::PeriodLimitExceeded);
        v.period_spent = spent;
    }
    if v.allowed_tee_mask != 0 {
        require!(
            v.allowed_tee_mask & (1u16 << attestation.tee_type) != 0,
            AgentsPayError::TeeTypeNotAllowed
        );
    }
    if v.min_provider_rating > 0 {
        let avg = provider.stats.average_rating().unwrap_or(0);
        require!(
            avg >= v.min_provider_rating as u64,
            AgentsPayError::ProviderRatingTooLow
        );
    }
    Ok(())
}

pub fn handle_open_session_from_vault(
    ctx: Context<OpenSessionFromVault>,
    args: OpenSessionArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_open(
        &ctx.accounts.config,
        &ctx.accounts.attestation,
        &ctx.accounts.measurement,
        &args,
        now,
    )?;
    enforce_policy(
        &mut ctx.accounts.vault,
        args.deposit,
        &ctx.accounts.provider,
        &ctx.accounts.attestation,
        now,
    )?;

    {
        let v = &ctx.accounts.vault;
        let bump = [v.bump];
        let seeds: &[&[u8]] = &[
            VAULT_SEED,
            v.owner.as_ref(),
            v.agent.as_ref(),
            v.mint.as_ref(),
            &bump,
        ];
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_token,
            &ctx.accounts.mint,
            &ctx.accounts.escrow,
            ctx.accounts.vault.to_account_info(),
            args.deposit,
            Some(&[seeds]),
        )?;
    }
    ctx.accounts.escrow.reload()?;
    require!(
        ctx.accounts.escrow.amount >= args.deposit,
        AgentsPayError::EscrowShortfall
    );

    let vault_key = ctx.accounts.vault.key();
    ctx.accounts.vault.open_sessions = ctx.accounts.vault.open_sessions.saturating_add(1);
    let agent = ctx.accounts.agent.key();
    let provider_key = ctx.accounts.provider.key();
    let attestation_key = ctx.accounts.attestation.key();
    let mint = ctx.accounts.mint.key();
    let session_key = ctx.accounts.session.key();
    init_session(
        &mut ctx.accounts.session,
        vault_key,
        vault_key,
        agent,
        &mut ctx.accounts.provider,
        provider_key,
        &ctx.accounts.attestation,
        attestation_key,
        mint,
        &args,
        ctx.bumps.session,
        now,
    );
    emit_opened(&ctx.accounts.session, session_key);
    Ok(())
}
