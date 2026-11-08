//! Tokenized compute ("GPU-hours").
//!
//! An `Offering` mints 0-decimal SPL credits against a provider's attested
//! capacity. Every credit in circulation is backed 1:1 by `price_per_credit`
//! payment tokens sitting in the offering escrow, so the invariant
//! `escrow_balance == credit_supply * price_per_credit` holds at all times:
//!
//! * `buy_credits`   pay -> escrow, mint credits (only while attestation valid)
//! * credits trade freely (any DEX / OTC) and are spent in attested sessions
//!   whose `mint` is the credit mint, so they reach the provider only through
//!   enclave-metered settlement
//! * `cash_out_credits` provider payout / treasury burns earned credits -> payment
//! * `refund_credits`   any holder burns credits -> payment, once the offering
//!   expired or the provider no longer has a valid attestation (default)

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Burn, Mint, MintTo, TokenAccount, TokenInterface},
};

use crate::{constants::*, error::AgentsPayError, events::*, state::*, utils::transfer_tokens};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateOfferingArgs {
    pub price_per_credit: u64,
    pub max_supply: u64,
    pub expires_at: i64,
    pub unit: String,
}

#[derive(Accounts)]
pub struct CreateOffering<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = operator @ AgentsPayError::Unauthorized)]
    pub provider: Box<Account<'info, Provider>>,
    #[account(
        init,
        payer = operator,
        space = 8 + Offering::INIT_SPACE,
        seeds = [OFFERING_SEED, provider.key().as_ref(), &provider.offering_count.to_le_bytes()],
        bump
    )]
    pub offering: Box<Account<'info, Offering>>,
    #[account(
        init,
        payer = operator,
        seeds = [CREDIT_MINT_SEED, offering.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = offering,
        mint::token_program = credit_token_program
    )]
    pub credit_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = operator,
        associated_token::mint = payment_mint,
        associated_token::authority = offering,
        associated_token::token_program = payment_token_program
    )]
    pub offering_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub credit_token_program: Interface<'info, TokenInterface>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_offering(
    ctx: Context<CreateOffering>,
    args: CreateOfferingArgs,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AgentsPayError::ProtocolPaused);
    require!(args.price_per_credit > 0, AgentsPayError::InvalidPrice);
    require!(args.max_supply > 0, AgentsPayError::InvalidAmount);
    require!(
        args.unit.len() <= MAX_UNIT_LEN,
        AgentsPayError::StringTooLong
    );
    let now = Clock::get()?.unix_timestamp;
    require!(args.expires_at > now, AgentsPayError::OfferingExpired);
    // Worst-case escrow must fit in u64.
    args.price_per_credit
        .checked_mul(args.max_supply)
        .ok_or(AgentsPayError::MathOverflow)?;

    let provider = &mut ctx.accounts.provider;
    let o = &mut ctx.accounts.offering;
    o.provider = provider.key();
    o.id = provider.offering_count;
    o.credit_mint = ctx.accounts.credit_mint.key();
    o.payment_mint = ctx.accounts.payment_mint.key();
    o.price_per_credit = args.price_per_credit;
    o.max_supply = args.max_supply;
    o.minted = 0;
    o.expires_at = args.expires_at;
    o.unit = args.unit;
    o.bump = ctx.bumps.offering;
    o.mint_bump = ctx.bumps.credit_mint;
    provider.offering_count = provider
        .offering_count
        .checked_add(1)
        .ok_or(AgentsPayError::MathOverflow)?;

    emit!(OfferingCreated {
        offering: o.key(),
        provider: o.provider,
        credit_mint: o.credit_mint,
        payment_mint: o.payment_mint,
        price_per_credit: o.price_per_credit,
        max_supply: o.max_supply,
        expires_at: o.expires_at,
    });
    Ok(())
}

// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct BuyCredits<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = provider, has_one = credit_mint, has_one = payment_mint)]
    pub offering: Box<Account<'info, Offering>>,
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
    #[account(mut, mint::token_program = credit_token_program)]
    pub credit_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = credit_mint,
        associated_token::authority = buyer,
        associated_token::token_program = credit_token_program
    )]
    pub buyer_credits: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
        token::token_program = payment_token_program
    )]
    pub buyer_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = offering,
        associated_token::token_program = payment_token_program
    )]
    pub offering_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub credit_token_program: Interface<'info, TokenInterface>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy_credits(ctx: Context<BuyCredits>, credits: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, AgentsPayError::ProtocolPaused);
    require!(credits > 0, AgentsPayError::InvalidAmount);
    require!(
        ctx.accounts
            .attestation
            .is_valid(&ctx.accounts.measurement, now),
        AgentsPayError::AttestationNotValid
    );
    let o = &ctx.accounts.offering;
    require!(now < o.expires_at, AgentsPayError::OfferingExpired);
    let minted = o
        .minted
        .checked_add(credits)
        .ok_or(AgentsPayError::MathOverflow)?;
    require!(minted <= o.max_supply, AgentsPayError::OfferingSoldOut);
    let cost = credits
        .checked_mul(o.price_per_credit)
        .ok_or(AgentsPayError::MathOverflow)?;

    transfer_tokens(
        &ctx.accounts.payment_token_program,
        &ctx.accounts.buyer_payment,
        &ctx.accounts.payment_mint,
        &ctx.accounts.offering_escrow,
        ctx.accounts.buyer.to_account_info(),
        cost,
        None,
    )?;

    let id = o.id.to_le_bytes();
    let bump = [o.bump];
    let seeds: &[&[u8]] = &[OFFERING_SEED, o.provider.as_ref(), &id, &bump];
    token_interface::mint_to(
        CpiContext::new(
            ctx.accounts.credit_token_program.key(),
            MintTo {
                mint: ctx.accounts.credit_mint.to_account_info(),
                to: ctx.accounts.buyer_credits.to_account_info(),
                authority: ctx.accounts.offering.to_account_info(),
            },
        )
        .with_signer(&[seeds]),
        credits,
    )?;

    ctx.accounts.offering.minted = minted;
    emit!(CreditsPurchased {
        offering: ctx.accounts.offering.key(),
        buyer: ctx.accounts.buyer.key(),
        credits,
        cost,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// cash_out_credits / refund_credits share one account layout
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct RedeemCredits<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(has_one = provider, has_one = credit_mint, has_one = payment_mint)]
    pub offering: Box<Account<'info, Offering>>,
    pub provider: Box<Account<'info, Provider>>,
    /// Required by `refund_credits` when the provider has an active attestation.
    pub attestation: Option<Box<Account<'info, Attestation>>>,
    pub measurement: Option<Box<Account<'info, Measurement>>>,
    #[account(mut, mint::token_program = credit_token_program)]
    pub credit_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = credit_mint,
        token::authority = holder,
        token::token_program = credit_token_program
    )]
    pub holder_credits: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mint::token_program = payment_token_program)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = offering,
        associated_token::token_program = payment_token_program
    )]
    pub offering_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = holder,
        associated_token::mint = payment_mint,
        associated_token::authority = holder,
        associated_token::token_program = payment_token_program
    )]
    pub holder_payment: Box<InterfaceAccount<'info, TokenAccount>>,
    pub credit_token_program: Interface<'info, TokenInterface>,
    pub payment_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

fn burn_and_pay(ctx: &Context<RedeemCredits>, credits: u64) -> Result<u64> {
    require!(credits > 0, AgentsPayError::InvalidAmount);
    let o = &ctx.accounts.offering;
    let payout = credits
        .checked_mul(o.price_per_credit)
        .ok_or(AgentsPayError::MathOverflow)?;

    token_interface::burn(
        CpiContext::new(
            ctx.accounts.credit_token_program.key(),
            Burn {
                mint: ctx.accounts.credit_mint.to_account_info(),
                from: ctx.accounts.holder_credits.to_account_info(),
                authority: ctx.accounts.holder.to_account_info(),
            },
        ),
        credits,
    )?;

    let id = o.id.to_le_bytes();
    let bump = [o.bump];
    let seeds: &[&[u8]] = &[OFFERING_SEED, o.provider.as_ref(), &id, &bump];
    transfer_tokens(
        &ctx.accounts.payment_token_program,
        &ctx.accounts.offering_escrow,
        &ctx.accounts.payment_mint,
        &ctx.accounts.holder_payment,
        ctx.accounts.offering.to_account_info(),
        payout,
        Some(&[seeds]),
    )?;
    Ok(payout)
}

/// Provider payout wallet (or treasury, for credit-denominated fees) converts
/// credits earned through attested settlement back into the payment token.
pub fn handle_cash_out_credits(ctx: Context<RedeemCredits>, credits: u64) -> Result<()> {
    let who = ctx.accounts.holder.key();
    require!(
        who == ctx.accounts.provider.payout || who == ctx.accounts.config.treasury,
        AgentsPayError::NotCashOutAuthority
    );
    let payout = burn_and_pay(&ctx, credits)?;
    emit!(CreditsRedeemed {
        offering: ctx.accounts.offering.key(),
        holder: who,
        credits,
        payout,
        refund: false,
    });
    Ok(())
}

/// Any holder can exit at par when the provider defaults: the offering has
/// expired, or the provider no longer has a valid hardware attestation.
pub fn handle_refund_credits(ctx: Context<RedeemCredits>, credits: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let provider = &ctx.accounts.provider;
    let expired = now >= ctx.accounts.offering.expires_at;
    let defaulted = if provider.active_attestation == Pubkey::default() {
        true
    } else {
        let a = ctx
            .accounts
            .attestation
            .as_ref()
            .ok_or(AgentsPayError::NotActiveAttestation)?;
        require_keys_eq!(
            a.key(),
            provider.active_attestation,
            AgentsPayError::NotActiveAttestation
        );
        let m = ctx
            .accounts
            .measurement
            .as_ref()
            .ok_or(AgentsPayError::MeasurementNotApproved)?;
        let (expected, _) = Pubkey::find_program_address(
            &[
                MEASUREMENT_SEED,
                &[a.tee_type],
                &a.measurement[..32],
                &a.measurement[32..],
            ],
            &crate::ID,
        );
        require_keys_eq!(m.key(), expected, AgentsPayError::MeasurementNotApproved);
        !a.is_valid(m, now)
    };
    require!(expired || defaulted, AgentsPayError::RefundNotAllowed);

    let payout = burn_and_pay(&ctx, credits)?;
    emit!(CreditsRedeemed {
        offering: ctx.accounts.offering.key(),
        holder: ctx.accounts.holder.key(),
        credits,
        payout,
        refund: true,
    });
    Ok(())
}
