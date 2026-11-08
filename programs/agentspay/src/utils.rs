use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{constants::*, error::AgentsPayError, state::Session};

pub fn transfer_tokens<'info>(
    token_program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: AccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let accounts = TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority,
    };
    let ctx = CpiContext::new(token_program.key(), accounts);
    let ctx = match signer_seeds {
        Some(s) => ctx.with_signer(s),
        None => ctx,
    };
    token_interface::transfer_checked(ctx, amount, mint.decimals)
}

pub fn close_token_account<'info>(
    token_program: &Interface<'info, TokenInterface>,
    account: &InterfaceAccount<'info, TokenAccount>,
    destination: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let accounts = CloseAccount {
        account: account.to_account_info(),
        destination,
        authority,
    };
    token_interface::close_account(
        CpiContext::new(token_program.key(), accounts).with_signer(signer_seeds),
    )
}

/// Seeds for signing as a session PDA: [b"session", payer, provider, salt, bump].
pub struct SessionSigner {
    payer: [u8; 32],
    provider: [u8; 32],
    salt: [u8; 8],
    bump: [u8; 1],
}

impl SessionSigner {
    pub fn new(s: &Session) -> Self {
        Self {
            payer: s.payer.to_bytes(),
            provider: s.provider.to_bytes(),
            salt: s.salt.to_le_bytes(),
            bump: [s.bump],
        }
    }

    pub fn seeds(&self) -> [&[u8]; 5] {
        [
            SESSION_SEED,
            &self.payer,
            &self.provider,
            &self.salt,
            &self.bump,
        ]
    }
}

pub fn fee_for(amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(AgentsPayError::MathOverflow)?
        / BPS_DENOMINATOR as u128;
    u64::try_from(fee).map_err(|_| error!(AgentsPayError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_rounds_down() {
        assert_eq!(fee_for(10_000, 250).unwrap(), 250);
        assert_eq!(fee_for(39, 250).unwrap(), 0);
        assert_eq!(fee_for(u64::MAX, 1_000).unwrap(), u64::MAX / 10);
    }
}
