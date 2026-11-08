use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    ed25519::load_verified_message,
    error::AgentsPayError,
    events::*,
    messages::*,
    state::*,
    utils::{close_token_account, fee_for, transfer_tokens, SessionSigner},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenSessionArgs {
    /// Disambiguates concurrent sessions between the same payer and provider.
    pub salt: u64,
    pub deposit: u64,
    /// Price in token base units per metered unit (agreed off-chain via the 402 challenge).
    pub price_per_unit: u64,
    pub grace_period: u32,
    /// Key that signs vouchers (an agent's hot / ephemeral key).
    pub authorized_signer: Pubkey,
}

// ---------------------------------------------------------------------------
// open_session (wallet-funded)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(args: OpenSessionArgs)]
pub struct OpenSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
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
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program
    )]
    pub payer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Session::INIT_SPACE,
        seeds = [SESSION_SEED, payer.key().as_ref(), provider.key().as_ref(), &args.salt.to_le_bytes()],
        bump
    )]
    pub session: Box<Account<'info, Session>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = session,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub(crate) fn validate_open(
    config: &Config,
    attestation: &Attestation,
    measurement: &Measurement,
    args: &OpenSessionArgs,
    now: i64,
) -> Result<()> {
    require!(!config.paused, AgentsPayError::ProtocolPaused);
    require!(
        attestation.is_valid(measurement, now),
        AgentsPayError::AttestationNotValid
    );
    require!(args.deposit > 0, AgentsPayError::InvalidAmount);
    require!(args.price_per_unit > 0, AgentsPayError::InvalidPrice);
    require!(
        args.grace_period >= MIN_GRACE_PERIOD && args.grace_period <= MAX_GRACE_PERIOD,
        AgentsPayError::InvalidGracePeriod
    );
    require!(
        args.authorized_signer != Pubkey::default(),
        AgentsPayError::Unauthorized
    );
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn init_session(
    session: &mut Session,
    payer: Pubkey,
    vault: Pubkey,
    rent_payer: Pubkey,
    provider: &mut Provider,
    provider_key: Pubkey,
    attestation: &Attestation,
    attestation_key: Pubkey,
    mint: Pubkey,
    args: &OpenSessionArgs,
    bump: u8,
    now: i64,
) {
    session.payer = payer;
    session.vault = vault;
    session.rent_payer = rent_payer;
    session.provider = provider_key;
    session.attestation = attestation_key;
    session.enclave_key = attestation.enclave_key;
    session.authorized_signer = args.authorized_signer;
    session.mint = mint;
    session.salt = args.salt;
    session.price_per_unit = args.price_per_unit;
    session.deposit = args.deposit;
    session.settled = 0;
    session.units_settled = 0;
    session.transcript_hash = [0u8; 32];
    session.opened_at = now;
    session.close_requested_at = 0;
    session.grace_period = args.grace_period;
    session.status = SessionStatus::Open as u8;
    session.bump = bump;
    provider.stats.sessions_opened = provider.stats.sessions_opened.saturating_add(1);
}

pub(crate) fn emit_opened(session: &Session, key: Pubkey) {
    emit!(SessionOpened {
        session: key,
        payer: session.payer,
        vault: session.vault,
        provider: session.provider,
        attestation: session.attestation,
        authorized_signer: session.authorized_signer,
        mint: session.mint,
        deposit: session.deposit,
        price_per_unit: session.price_per_unit,
    });
}

pub fn handle_open_session(ctx: Context<OpenSession>, args: OpenSessionArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_open(
        &ctx.accounts.config,
        &ctx.accounts.attestation,
        &ctx.accounts.measurement,
        &args,
        now,
    )?;

    transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.payer_token,
        &ctx.accounts.mint,
        &ctx.accounts.escrow,
        ctx.accounts.payer.to_account_info(),
        args.deposit,
        None,
    )?;
    // Defends against transfer-fee style mints silently under-funding escrow.
    ctx.accounts.escrow.reload()?;
    require!(
        ctx.accounts.escrow.amount >= args.deposit,
        AgentsPayError::EscrowShortfall
    );

    let payer = ctx.accounts.payer.key();
    let provider_key = ctx.accounts.provider.key();
    let attestation_key = ctx.accounts.attestation.key();
    let mint = ctx.accounts.mint.key();
    let session_key = ctx.accounts.session.key();
    init_session(
        &mut ctx.accounts.session,
        payer,
        Pubkey::default(),
        payer,
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

// ---------------------------------------------------------------------------
// top_up_session
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct TopUpSession<'info> {
    pub funder: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub session: Box<Account<'info, Session>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = funder,
        token::token_program = token_program
    )]
    pub funder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = session,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Anyone may add funds; unspent funds always refund to `session.payer`.
pub fn handle_top_up_session(ctx: Context<TopUpSession>, amount: u64) -> Result<()> {
    require!(amount > 0, AgentsPayError::InvalidAmount);
    require!(
        ctx.accounts.session.status == SessionStatus::Open as u8,
        AgentsPayError::SessionNotOpen
    );
    transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.funder_token,
        &ctx.accounts.mint,
        &ctx.accounts.escrow,
        ctx.accounts.funder.to_account_info(),
        amount,
        None,
    )?;
    let s = &mut ctx.accounts.session;
    s.deposit = s
        .deposit
        .checked_add(amount)
        .ok_or(AgentsPayError::MathOverflow)?;
    ctx.accounts.escrow.reload()?;
    let outstanding = s.deposit - s.settled;
    require!(
        ctx.accounts.escrow.amount >= outstanding,
        AgentsPayError::EscrowShortfall
    );
    emit!(SessionToppedUp {
        session: s.key(),
        amount,
        deposit: s.deposit,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// settle
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Settle<'info> {
    /// Anyone can crank a settlement; funds only ever flow to the provider
    /// payout and the treasury, bounded by both signatures.
    #[account(mut)]
    pub cranker: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = provider, has_one = attestation, has_one = mint)]
    pub session: Box<Account<'info, Session>>,
    #[account(mut)]
    pub provider: Box<Account<'info, Provider>>,
    pub attestation: Box<Account<'info, Attestation>>,
    #[account(
        seeds = [MEASUREMENT_SEED, &[attestation.tee_type], &attestation.measurement[..32], &attestation.measurement[32..]],
        bump = measurement.bump
    )]
    pub measurement: Box<Account<'info, Measurement>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = session,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: must equal `provider.payout`.
    #[account(address = provider.payout)]
    pub payout: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = cranker,
        associated_token::mint = mint,
        associated_token::authority = payout,
        associated_token::token_program = token_program
    )]
    pub payout_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: must equal `config.treasury`.
    #[account(address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = cranker,
        associated_token::mint = mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program
    )]
    pub treasury_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: instructions sysvar (address-checked).
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Transaction layout: `[Ed25519(voucher), Ed25519(receipt), settle]`.
///
/// Pays the provider `min(voucher.cumulative_amount, receipt.cumulative_units
/// * price_per_unit, deposit) - settled`, and only while the provider's
/// hardware attestation (and its workload measurement) is valid.
pub fn handle_settle(ctx: Context<Settle>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let session_key = ctx.accounts.session.key();

    let (authorized_signer, enclave_key) = {
        let s = &ctx.accounts.session;
        let in_grace = s.status == SessionStatus::Closing as u8
            && now < s.close_requested_at.saturating_add(s.grace_period as i64);
        require!(
            s.status == SessionStatus::Open as u8 || in_grace,
            AgentsPayError::SessionNotSettleable
        );
        (s.authorized_signer, s.enclave_key)
    };
    require!(
        ctx.accounts
            .attestation
            .is_valid(&ctx.accounts.measurement, now),
        AgentsPayError::AttestationNotValid
    );

    let ix_sysvar = ctx.accounts.instructions.to_account_info();
    let voucher = Voucher::decode(&load_verified_message(
        &ix_sysvar,
        2,
        VOUCHER_LEN,
        &authorized_signer,
    )?)?;
    let receipt = UsageReceipt::decode(&load_verified_message(
        &ix_sysvar,
        1,
        RECEIPT_LEN,
        &enclave_key,
    )?)?;

    require_keys_eq!(
        voucher.session,
        session_key,
        AgentsPayError::VoucherSessionMismatch
    );
    require!(voucher.is_fresh(now), AgentsPayError::VoucherExpired);
    require_keys_eq!(
        receipt.session,
        session_key,
        AgentsPayError::ReceiptSessionMismatch
    );

    let (delta, fee, new_units) = {
        let s = &ctx.accounts.session;
        require!(
            receipt.cumulative_units >= s.units_settled,
            AgentsPayError::ReceiptRegressed
        );
        let target = settle_target(
            voucher.cumulative_amount,
            receipt.cumulative_units,
            s.price_per_unit,
            s.deposit,
        )?;
        require!(target > s.settled, AgentsPayError::NothingToSettle);
        let delta = target - s.settled;
        let fee = fee_for(delta, ctx.accounts.config.protocol_fee_bps)?;
        (delta, fee, receipt.cumulative_units - s.units_settled)
    };

    let signer = SessionSigner::new(&ctx.accounts.session);
    let seeds = signer.seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];
    let session_info = ctx.accounts.session.to_account_info();
    transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.escrow,
        &ctx.accounts.mint,
        &ctx.accounts.payout_token,
        session_info.clone(),
        delta - fee,
        Some(signer_seeds),
    )?;
    transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.escrow,
        &ctx.accounts.mint,
        &ctx.accounts.treasury_token,
        session_info,
        fee,
        Some(signer_seeds),
    )?;

    let s = &mut ctx.accounts.session;
    s.settled += delta;
    s.units_settled = receipt.cumulative_units;
    s.transcript_hash = receipt.transcript_hash;

    let stats = &mut ctx.accounts.provider.stats;
    stats.settlements = stats.settlements.saturating_add(1);
    stats.units_served = stats.units_served.saturating_add(new_units);

    emit!(SessionSettled {
        session: session_key,
        provider: s.provider,
        amount: delta,
        fee,
        settled: s.settled,
        units: s.units_settled,
        transcript_hash: s.transcript_hash,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// request_close
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct RequestClose<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub session: Box<Account<'info, Session>>,
    pub vault: Option<Box<Account<'info, AgentVault>>>,
}

/// Returns true when `who` may act for the session's payer side.
pub(crate) fn is_payer_authority(
    session: &Session,
    vault: Option<&AgentVault>,
    vault_key: Option<Pubkey>,
    who: &Pubkey,
) -> Result<bool> {
    if session.vault == Pubkey::default() {
        return Ok(*who == session.payer);
    }
    let (vault, key) = match (vault, vault_key) {
        (Some(v), Some(k)) => (v, k),
        _ => return err!(AgentsPayError::VaultMismatch),
    };
    require_keys_eq!(key, session.vault, AgentsPayError::VaultMismatch);
    Ok(*who == vault.owner || *who == vault.agent)
}

pub fn handle_request_close(ctx: Context<RequestClose>) -> Result<()> {
    let who = ctx.accounts.authority.key();
    let vault_key = ctx.accounts.vault.as_ref().map(|v| v.key());
    require!(
        is_payer_authority(
            &ctx.accounts.session,
            ctx.accounts.vault.as_deref().map(|v| &**v),
            vault_key,
            &who
        )?,
        AgentsPayError::Unauthorized
    );
    let s = &mut ctx.accounts.session;
    require!(
        s.status == SessionStatus::Open as u8,
        AgentsPayError::SessionNotOpen
    );
    let now = Clock::get()?.unix_timestamp;
    s.status = SessionStatus::Closing as u8;
    s.close_requested_at = now;
    emit!(SessionCloseRequested {
        session: s.key(),
        requested_by: who,
        closes_after: now.saturating_add(s.grace_period as i64),
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// close_session
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(mut)]
    pub closer: Signer<'info>,
    #[account(mut, has_one = provider, has_one = attestation, has_one = mint)]
    pub session: Box<Account<'info, Session>>,
    #[account(mut)]
    pub provider: Box<Account<'info, Provider>>,
    pub attestation: Box<Account<'info, Attestation>>,
    #[account(
        seeds = [MEASUREMENT_SEED, &[attestation.tee_type], &attestation.measurement[..32], &attestation.measurement[32..]],
        bump = measurement.bump
    )]
    pub measurement: Box<Account<'info, Measurement>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = session,
        associated_token::token_program = token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: must equal `session.payer` (wallet or vault PDA).
    #[account(address = session.payer)]
    pub refund_owner: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = closer,
        associated_token::mint = mint,
        associated_token::authority = refund_owner,
        associated_token::token_program = token_program
    )]
    pub refund_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: must equal `session.rent_payer`; receives escrow rent.
    #[account(mut, address = session.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault: Option<Box<Account<'info, AgentVault>>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Refunds the unspent escrow to the payer and closes the escrow.
///
/// Allowed when any of:
/// * the provider operator closes cooperatively (after its final settle),
/// * the payer requested close and the grace period elapsed (permissionless),
/// * the attestation is no longer valid; the provider cannot be paid anyway,
///   so the payer exits immediately (permissionless).
pub fn handle_close_session(ctx: Context<CloseSession>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let closer = ctx.accounts.closer.key();
    let s = &ctx.accounts.session;
    require!(
        s.status == SessionStatus::Open as u8 || s.status == SessionStatus::Closing as u8,
        AgentsPayError::SessionNotOpen
    );
    let cooperative = closer == ctx.accounts.provider.operator;
    let grace_elapsed = s.status == SessionStatus::Closing as u8
        && now >= s.close_requested_at.saturating_add(s.grace_period as i64);
    let attestation_dead = !ctx
        .accounts
        .attestation
        .is_valid(&ctx.accounts.measurement, now);
    require!(
        cooperative || grace_elapsed || attestation_dead,
        AgentsPayError::CloseNotAllowed
    );

    let refund = ctx.accounts.escrow.amount;
    let signer = SessionSigner::new(s);
    let seeds = signer.seeds();
    let signer_seeds: &[&[&[u8]]] = &[&seeds];
    let session_info = ctx.accounts.session.to_account_info();
    transfer_tokens(
        &ctx.accounts.token_program,
        &ctx.accounts.escrow,
        &ctx.accounts.mint,
        &ctx.accounts.refund_token,
        session_info.clone(),
        refund,
        Some(signer_seeds),
    )?;
    close_token_account(
        &ctx.accounts.token_program,
        &ctx.accounts.escrow,
        ctx.accounts.rent_payer.to_account_info(),
        session_info,
        signer_seeds,
    )?;

    let session_vault = ctx.accounts.session.vault;
    let opened_at = ctx.accounts.session.opened_at;
    let settled = ctx.accounts.session.settled;
    if session_vault != Pubkey::default() {
        let vault = ctx
            .accounts
            .vault
            .as_mut()
            .ok_or(AgentsPayError::VaultMismatch)?;
        require_keys_eq!(vault.key(), session_vault, AgentsPayError::VaultMismatch);
        vault.open_sessions = vault.open_sessions.saturating_sub(1);
        vault.lifetime_settled = vault.lifetime_settled.saturating_add(settled);
        // Unspent deposit only counts back toward the period it was charged to.
        if opened_at >= vault.period_start {
            vault.period_spent = vault.period_spent.saturating_sub(refund);
        }
    }

    let s = &mut ctx.accounts.session;
    s.status = SessionStatus::Closed as u8;
    let stats = &mut ctx.accounts.provider.stats;
    stats.sessions_closed = stats.sessions_closed.saturating_add(1);
    if !cooperative {
        stats.forced_closes = stats.forced_closes.saturating_add(1);
    }
    emit!(SessionClosed {
        session: s.key(),
        provider: s.provider,
        settled: s.settled,
        refunded: refund,
        forced: !cooperative,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// finalize_session (+ paid feedback)
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct FinalizeSession<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = provider, close = rent_payer)]
    pub session: Box<Account<'info, Session>>,
    #[account(mut)]
    pub provider: Box<Account<'info, Provider>>,
    /// CHECK: must equal `session.rent_payer`; receives the session rent.
    #[account(mut, address = session.rent_payer)]
    pub rent_payer: UncheckedAccount<'info>,
    pub vault: Option<Box<Account<'info, AgentVault>>>,
}

/// Closes a `Closed` session account, optionally leaving a 0..=100 rating.
/// Ratings are only accepted for sessions that settled real value through an
/// attested enclave, which makes feedback Sybil-expensive by construction.
pub fn handle_finalize_session(ctx: Context<FinalizeSession>, rating: Option<u8>) -> Result<()> {
    let who = ctx.accounts.authority.key();
    let vault_key = ctx.accounts.vault.as_ref().map(|v| v.key());
    require!(
        is_payer_authority(
            &ctx.accounts.session,
            ctx.accounts.vault.as_deref().map(|v| &**v),
            vault_key,
            &who
        )?,
        AgentsPayError::Unauthorized
    );
    let s = &ctx.accounts.session;
    require!(
        s.status == SessionStatus::Closed as u8,
        AgentsPayError::SessionNotClosed
    );
    if let Some(r) = rating {
        require!(r <= MAX_RATING, AgentsPayError::InvalidRating);
        require!(s.settled > 0, AgentsPayError::NothingToRate);
        let p = &mut ctx.accounts.provider;
        p.stats.ratings_count = p.stats.ratings_count.saturating_add(1);
        p.stats.ratings_sum = p.stats.ratings_sum.saturating_add(r as u64);
        emit!(PaidFeedback {
            session: s.key(),
            provider: s.provider,
            agent_asset: p.agent_asset,
            payer: s.payer,
            mint: s.mint,
            settled: s.settled,
            units: s.units_settled,
            rating: r,
            transcript_hash: s.transcript_hash,
        });
    }
    Ok(())
}
