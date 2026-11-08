use anchor_lang::prelude::*;

use crate::{constants::*, error::AgentsPayError, events::*, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterProviderArgs {
    pub payout: Pubkey,
    pub agent_asset: Pubkey,
    pub endpoint: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateProviderArgs {
    pub payout: Option<Pubkey>,
    pub agent_asset: Option<Pubkey>,
    pub endpoint: Option<String>,
}

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = operator,
        space = 8 + Provider::INIT_SPACE,
        seeds = [PROVIDER_SEED, operator.key().as_ref()],
        bump
    )]
    pub provider: Account<'info, Provider>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProvider<'info> {
    pub operator: Signer<'info>,
    #[account(mut, has_one = operator @ AgentsPayError::Unauthorized)]
    pub provider: Account<'info, Provider>,
}

pub fn handle_register_provider(
    ctx: Context<RegisterProvider>,
    args: RegisterProviderArgs,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, AgentsPayError::ProtocolPaused);
    require!(
        args.endpoint.len() <= MAX_ENDPOINT_LEN,
        AgentsPayError::StringTooLong
    );
    let p = &mut ctx.accounts.provider;
    p.operator = ctx.accounts.operator.key();
    p.payout = args.payout;
    p.agent_asset = args.agent_asset;
    p.endpoint = args.endpoint;
    p.active_attestation = Pubkey::default();
    p.offering_count = 0;
    p.created_at = Clock::get()?.unix_timestamp;
    p.stats = ProviderStats::default();
    p.bump = ctx.bumps.provider;
    emit!(ProviderRegistered {
        provider: p.key(),
        operator: p.operator,
        payout: p.payout,
        agent_asset: p.agent_asset,
    });
    Ok(())
}

pub fn handle_update_provider(
    ctx: Context<UpdateProvider>,
    args: UpdateProviderArgs,
) -> Result<()> {
    let p = &mut ctx.accounts.provider;
    if let Some(payout) = args.payout {
        p.payout = payout;
    }
    if let Some(asset) = args.agent_asset {
        p.agent_asset = asset;
    }
    if let Some(endpoint) = args.endpoint {
        require!(
            endpoint.len() <= MAX_ENDPOINT_LEN,
            AgentsPayError::StringTooLong
        );
        p.endpoint = endpoint;
    }
    emit!(ProviderUpdated {
        provider: p.key(),
        payout: p.payout,
        agent_asset: p.agent_asset,
    });
    Ok(())
}
