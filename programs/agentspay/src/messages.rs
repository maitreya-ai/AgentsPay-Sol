//! Off-chain signed messages.
//!
//! Both messages are fixed-length, little-endian, and start with a 4-byte
//! magic that domain-separates them from transactions, off-chain messages,
//! and the Solana Foundation payment-channel voucher (`[0x56, 0x01]`), so a
//! key can never be tricked into signing one kind of message as another.
//!
//! ```text
//! Voucher  (52 B, signed by Session.authorized_signer)
//!   0..4    magic  "APV1"
//!   4..36   session pubkey
//!   36..44  cumulative_amount  u64 LE   (max total the payer authorises)
//!   44..52  expires_at         i64 LE   (unix seconds, 0 = no expiry)
//!
//! UsageReceipt (84 B, signed by Attestation.enclave_key inside the TEE)
//!   0..4    magic  "APR1"
//!   4..36   session pubkey
//!   36..44  cumulative_units   u64 LE   (metered units served so far)
//!   44..76  transcript_hash    [u8;32]  (rolling hash of request/response digests)
//!   76..84  issued_at          i64 LE   (enclave clock, informational)
//! ```

use anchor_lang::prelude::*;

use crate::error::AgentsPayError;

pub const VOUCHER_MAGIC: [u8; 4] = *b"APV1";
pub const VOUCHER_LEN: usize = 52;
pub const RECEIPT_MAGIC: [u8; 4] = *b"APR1";
pub const RECEIPT_LEN: usize = 84;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Voucher {
    pub session: Pubkey,
    pub cumulative_amount: u64,
    pub expires_at: i64,
}

impl Voucher {
    pub fn encode(&self) -> [u8; VOUCHER_LEN] {
        let mut out = [0u8; VOUCHER_LEN];
        out[0..4].copy_from_slice(&VOUCHER_MAGIC);
        out[4..36].copy_from_slice(self.session.as_ref());
        out[36..44].copy_from_slice(&self.cumulative_amount.to_le_bytes());
        out[44..52].copy_from_slice(&self.expires_at.to_le_bytes());
        out
    }

    pub fn decode(bytes: &[u8]) -> Result<Self> {
        require!(bytes.len() == VOUCHER_LEN, AgentsPayError::InvalidMessage);
        require!(bytes[0..4] == VOUCHER_MAGIC, AgentsPayError::InvalidMessage);
        Ok(Self {
            session: read_pubkey(&bytes[4..36]),
            cumulative_amount: read_u64(&bytes[36..44]),
            expires_at: read_i64(&bytes[44..52]),
        })
    }

    pub fn is_fresh(&self, now: i64) -> bool {
        self.expires_at == 0 || now < self.expires_at
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UsageReceipt {
    pub session: Pubkey,
    pub cumulative_units: u64,
    pub transcript_hash: [u8; 32],
    pub issued_at: i64,
}

impl UsageReceipt {
    pub fn encode(&self) -> [u8; RECEIPT_LEN] {
        let mut out = [0u8; RECEIPT_LEN];
        out[0..4].copy_from_slice(&RECEIPT_MAGIC);
        out[4..36].copy_from_slice(self.session.as_ref());
        out[36..44].copy_from_slice(&self.cumulative_units.to_le_bytes());
        out[44..76].copy_from_slice(&self.transcript_hash);
        out[76..84].copy_from_slice(&self.issued_at.to_le_bytes());
        out
    }

    pub fn decode(bytes: &[u8]) -> Result<Self> {
        require!(bytes.len() == RECEIPT_LEN, AgentsPayError::InvalidMessage);
        require!(bytes[0..4] == RECEIPT_MAGIC, AgentsPayError::InvalidMessage);
        let mut transcript_hash = [0u8; 32];
        transcript_hash.copy_from_slice(&bytes[44..76]);
        Ok(Self {
            session: read_pubkey(&bytes[4..36]),
            cumulative_units: read_u64(&bytes[36..44]),
            transcript_hash,
            issued_at: read_i64(&bytes[76..84]),
        })
    }
}

fn read_pubkey(b: &[u8]) -> Pubkey {
    let mut a = [0u8; 32];
    a.copy_from_slice(b);
    Pubkey::new_from_array(a)
}

fn read_u64(b: &[u8]) -> u64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(b);
    u64::from_le_bytes(a)
}

fn read_i64(b: &[u8]) -> i64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(b);
    i64::from_le_bytes(a)
}

/// Amount the provider may collect given the latest voucher and receipt:
/// the smallest of what the payer authorised, what the enclave metered,
/// and what is escrowed.
pub fn settle_target(
    voucher_cumulative: u64,
    receipt_units: u64,
    price_per_unit: u64,
    deposit: u64,
) -> Result<u64> {
    let metered = receipt_units
        .checked_mul(price_per_unit)
        .ok_or(AgentsPayError::MathOverflow)?;
    Ok(voucher_cumulative.min(metered).min(deposit))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voucher_roundtrip() {
        let v = Voucher {
            session: Pubkey::new_from_array([7u8; 32]),
            cumulative_amount: 1_234_567,
            expires_at: 1_900_000_000,
        };
        let bytes = v.encode();
        assert_eq!(bytes.len(), VOUCHER_LEN);
        assert_eq!(&bytes[0..4], b"APV1");
        assert_eq!(Voucher::decode(&bytes).unwrap(), v);
    }

    #[test]
    fn receipt_roundtrip() {
        let r = UsageReceipt {
            session: Pubkey::new_from_array([9u8; 32]),
            cumulative_units: 42,
            transcript_hash: [3u8; 32],
            issued_at: -5,
        };
        let bytes = r.encode();
        assert_eq!(bytes.len(), RECEIPT_LEN);
        assert_eq!(UsageReceipt::decode(&bytes).unwrap(), r);
    }

    #[test]
    fn rejects_wrong_magic_and_length() {
        let v = Voucher {
            session: Pubkey::default(),
            cumulative_amount: 1,
            expires_at: 0,
        };
        let mut bytes = v.encode();
        bytes[0] = b'X';
        assert!(Voucher::decode(&bytes).is_err());
        assert!(Voucher::decode(&bytes[..51]).is_err());
        // A receipt is never accepted as a voucher and vice versa.
        let r = UsageReceipt {
            session: Pubkey::default(),
            cumulative_units: 1,
            transcript_hash: [0; 32],
            issued_at: 0,
        };
        assert!(Voucher::decode(&r.encode()).is_err());
        assert!(UsageReceipt::decode(&v.encode()).is_err());
    }

    #[test]
    fn settle_target_takes_minimum() {
        assert_eq!(settle_target(100, 5, 10, 1_000).unwrap(), 50); // metered binds
        assert_eq!(settle_target(30, 5, 10, 1_000).unwrap(), 30); // voucher binds
        assert_eq!(settle_target(500, 50, 10, 200).unwrap(), 200); // deposit binds
        assert!(settle_target(1, u64::MAX, 2, 1).is_err());
    }

    #[test]
    fn freshness() {
        let mut v = Voucher {
            session: Pubkey::default(),
            cumulative_amount: 1,
            expires_at: 0,
        };
        assert!(v.is_fresh(i64::MAX));
        v.expires_at = 100;
        assert!(v.is_fresh(99));
        assert!(!v.is_fresh(100));
    }
}
