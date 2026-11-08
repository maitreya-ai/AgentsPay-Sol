//! Ed25519 precompile introspection.
//!
//! Signature checks are delegated to the native Ed25519 precompile: the
//! transaction carries one precompile instruction per signed message, placed
//! at a fixed position relative to the AgentsPay instruction. The runtime
//! verifies every precompile signature before any instruction executes, so if
//! the transaction runs, the signatures are valid. This module only has to
//! prove that the precompile instruction verified *the bytes we expect,
//! under the key we expect*.
//!
//! To avoid the classic offset-confusion bugs, we accept exactly one layout,
//! the one produced by `solana_ed25519_program::new_ed25519_instruction`:
//!
//! ```text
//! 0      num_signatures = 1
//! 1      padding        = 0
//! 2..16  offsets (7 x u16): sig_off=48, sig_ix=u16::MAX, pk_off=16, pk_ix=u16::MAX,
//!                           msg_off=112, msg_len=N, msg_ix=u16::MAX
//! 16..48   public key
//! 48..112  signature
//! 112..    message (N bytes)
//! ```
//! `u16::MAX` instruction indices mean "this instruction", so every offset
//! points inside the precompile instruction itself.

use anchor_lang::compat::solana_instructions_sysvar::{
    load_current_index_checked, load_instruction_at_checked,
};
use anchor_lang::prelude::*;

use crate::constants::ED25519_PROGRAM_ID;
use crate::error::AgentsPayError;

pub const PUBKEY_OFFSET: usize = 16;
pub const SIGNATURE_OFFSET: usize = 48;
pub const MESSAGE_OFFSET: usize = 112;
const THIS_INSTRUCTION: u16 = u16::MAX;

/// Parse a canonical single-signature Ed25519 precompile payload.
/// Returns the signer public key and the signed message bytes.
pub fn parse_canonical(data: &[u8], expected_len: usize) -> Result<(Pubkey, &[u8])> {
    require!(
        data.len() == MESSAGE_OFFSET + expected_len,
        AgentsPayError::InvalidEd25519Instruction
    );
    require!(
        data[0] == 1 && data[1] == 0,
        AgentsPayError::InvalidEd25519Instruction
    );
    let rd = |o: usize| u16::from_le_bytes([data[o], data[o + 1]]);
    let (sig_off, sig_ix, pk_off, pk_ix, msg_off, msg_len, msg_ix) =
        (rd(2), rd(4), rd(6), rd(8), rd(10), rd(12), rd(14));
    require!(
        sig_off as usize == SIGNATURE_OFFSET
            && pk_off as usize == PUBKEY_OFFSET
            && msg_off as usize == MESSAGE_OFFSET
            && msg_len as usize == expected_len,
        AgentsPayError::InvalidEd25519Instruction
    );
    require!(
        sig_ix == THIS_INSTRUCTION && pk_ix == THIS_INSTRUCTION && msg_ix == THIS_INSTRUCTION,
        AgentsPayError::InvalidEd25519Instruction
    );
    let mut pk = [0u8; 32];
    pk.copy_from_slice(&data[PUBKEY_OFFSET..PUBKEY_OFFSET + 32]);
    Ok((Pubkey::new_from_array(pk), &data[MESSAGE_OFFSET..]))
}

/// Load the Ed25519 precompile instruction `back` positions before the
/// currently executing instruction and check it was signed by `expected_signer`.
/// Returns the verified message bytes.
pub fn load_verified_message(
    instructions_sysvar: &AccountInfo,
    back: usize,
    expected_len: usize,
    expected_signer: &Pubkey,
) -> Result<Vec<u8>> {
    let current = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(AgentsPayError::MissingEd25519Instruction))? as usize;
    require!(current >= back, AgentsPayError::MissingEd25519Instruction);
    let ix = load_instruction_at_checked(current - back, instructions_sysvar)
        .map_err(|_| error!(AgentsPayError::MissingEd25519Instruction))?;
    require!(
        ix.program_id.to_bytes() == ED25519_PROGRAM_ID.to_bytes(),
        AgentsPayError::MissingEd25519Instruction
    );
    require!(
        ix.accounts.is_empty(),
        AgentsPayError::InvalidEd25519Instruction
    );
    let (signer, message) = parse_canonical(&ix.data, expected_len)?;
    require_keys_eq!(signer, *expected_signer, AgentsPayError::SignerMismatch);
    Ok(message.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical(msg: &[u8]) -> Vec<u8> {
        let mut d = vec![0u8; MESSAGE_OFFSET + msg.len()];
        d[0] = 1;
        let w = |d: &mut Vec<u8>, o: usize, v: u16| d[o..o + 2].copy_from_slice(&v.to_le_bytes());
        w(&mut d, 2, SIGNATURE_OFFSET as u16);
        w(&mut d, 4, u16::MAX);
        w(&mut d, 6, PUBKEY_OFFSET as u16);
        w(&mut d, 8, u16::MAX);
        w(&mut d, 10, MESSAGE_OFFSET as u16);
        w(&mut d, 12, msg.len() as u16);
        w(&mut d, 14, u16::MAX);
        d[PUBKEY_OFFSET..PUBKEY_OFFSET + 32].copy_from_slice(&[5u8; 32]);
        d[MESSAGE_OFFSET..].copy_from_slice(msg);
        d
    }

    #[test]
    fn accepts_canonical_layout() {
        let d = canonical(&[1, 2, 3, 4]);
        let (pk, msg) = parse_canonical(&d, 4).unwrap();
        assert_eq!(pk, Pubkey::new_from_array([5u8; 32]));
        assert_eq!(msg, &[1, 2, 3, 4]);
    }

    #[test]
    fn rejects_cross_instruction_offsets() {
        let mut d = canonical(&[1, 2, 3, 4]);
        d[14..16].copy_from_slice(&0u16.to_le_bytes()); // message from instruction 0
        assert!(parse_canonical(&d, 4).is_err());
        let mut d = canonical(&[1, 2, 3, 4]);
        d[8..10].copy_from_slice(&1u16.to_le_bytes()); // pubkey from instruction 1
        assert!(parse_canonical(&d, 4).is_err());
    }

    #[test]
    fn rejects_multi_signature_and_bad_lengths() {
        let mut d = canonical(&[1, 2, 3, 4]);
        d[0] = 2;
        assert!(parse_canonical(&d, 4).is_err());
        let d = canonical(&[1, 2, 3, 4]);
        assert!(parse_canonical(&d, 5).is_err());
        let mut d = canonical(&[1, 2, 3, 4]);
        d[10..12].copy_from_slice(&100u16.to_le_bytes());
        assert!(parse_canonical(&d, 4).is_err());
    }
}
