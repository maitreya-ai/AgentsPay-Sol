//! Tokenized compute credits ("GPU-hours").

mod common;

use agentspay::{accounts as acc, instruction as ix, CreateOfferingArgs, Offering};
use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, InstructionData, ToAccountMetas,
};
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const PRICE_PER_CREDIT: u64 = 2_500; // 0.0025 USDC per H100-second (= $9/GPU-hour)

struct C {
    env: Env,
    p: ProviderCtx,
    offering: Pubkey,
    credit_mint: Pubkey,
}

fn setup() -> C {
    let mut env = Env::new(1, 1, 0);
    let p = env.attested_provider();
    let usdc = env.usdc;
    let offering = offering_pda(&p.provider, 0);
    let credit_mint = credit_mint_pda(&offering);
    let expires_at = env.now() + 30 * DAY;
    let create = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::CreateOffering {
            operator: p.operator.pubkey(),
            config: env.config,
            provider: p.provider,
            offering,
            credit_mint,
            payment_mint: usdc,
            offering_escrow: ata(&offering, &usdc),
            credit_token_program: TOKEN_PROGRAM,
            payment_token_program: TOKEN_PROGRAM,
            associated_token_program: ATA_PROGRAM,
            system_program: SYSTEM_PROGRAM,
        }
        .to_account_metas(None),
        data: ix::CreateOffering {
            args: CreateOfferingArgs {
                price_per_credit: PRICE_PER_CREDIT,
                max_supply: 3_600 * 100, // 100 GPU-hours of capacity
                expires_at,
                unit: "h100-gpu-second".into(),
            },
        }
        .data(),
    };
    let op = p.operator.insecure_clone();
    assert_ok(env.send(&[create], &op, &[]));
    C {
        env,
        p,
        offering,
        credit_mint,
    }
}

fn buy(c: &mut C, buyer: &Keypair, credits: u64) -> litesvm::types::TransactionResult {
    let usdc = c.env.usdc;
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::BuyCredits {
            buyer: buyer.pubkey(),
            config: c.env.config,
            offering: c.offering,
            provider: c.p.provider,
            attestation: c.p.attestation,
            measurement: c.p.measurement,
            credit_mint: c.credit_mint,
            buyer_credits: ata(&buyer.pubkey(), &c.credit_mint),
            payment_mint: usdc,
            buyer_payment: ata(&buyer.pubkey(), &usdc),
            offering_escrow: ata(&c.offering, &usdc),
            credit_token_program: TOKEN_PROGRAM,
            payment_token_program: TOKEN_PROGRAM,
            associated_token_program: ATA_PROGRAM,
            system_program: SYSTEM_PROGRAM,
        }
        .to_account_metas(None),
        data: ix::BuyCredits { credits }.data(),
    };
    c.env.send(&[ix], buyer, &[])
}

fn redeem(
    c: &mut C,
    holder: &Keypair,
    credits: u64,
    refund: bool,
    with_attestation: bool,
) -> litesvm::types::TransactionResult {
    let usdc = c.env.usdc;
    let accounts = acc::RedeemCredits {
        holder: holder.pubkey(),
        config: c.env.config,
        offering: c.offering,
        provider: c.p.provider,
        attestation: with_attestation.then_some(c.p.attestation),
        measurement: with_attestation.then_some(c.p.measurement),
        credit_mint: c.credit_mint,
        holder_credits: ata(&holder.pubkey(), &c.credit_mint),
        payment_mint: usdc,
        offering_escrow: ata(&c.offering, &usdc),
        holder_payment: ata(&holder.pubkey(), &usdc),
        credit_token_program: TOKEN_PROGRAM,
        payment_token_program: TOKEN_PROGRAM,
        associated_token_program: ATA_PROGRAM,
        system_program: SYSTEM_PROGRAM,
    }
    .to_account_metas(None);
    let data = if refund {
        ix::RefundCredits { credits }.data()
    } else {
        ix::CashOutCredits { credits }.data()
    };
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    };
    c.env.send(&[ix], holder, &[])
}

#[test]
fn credits_are_fully_collateralised_and_spent_in_attested_sessions() {
    let mut c = setup();
    let usdc = c.env.usdc;
    let buyer = c.env.funded();
    c.env.mint_to(&usdc, &buyer.pubkey(), 100_000_000);

    // Buy 1 GPU-hour of H100 seconds.
    assert_ok(buy(&mut c, &buyer, 3_600));
    assert_eq!(c.env.balance(&ata(&buyer.pubkey(), &c.credit_mint)), 3_600);
    assert_eq!(
        c.env.balance(&ata(&c.offering, &usdc)),
        3_600 * PRICE_PER_CREDIT
    );

    // Supply cap.
    assert_err(buy(&mut c, &buyer, 3_600 * 100), "OfferingSoldOut");

    // Spend credits in an attested session denominated in the credit mint.
    let agent_key = Keypair::new();
    let credit_mint = c.credit_mint;
    let (open, session) = c.env.open_session_ix(
        &buyer.pubkey(),
        &c.p,
        &credit_mint,
        session_args(7, 3_600, 1, agent_key.pubkey()),
    );
    assert_ok(c.env.send(&[open], &buyer, &[]));
    let op = c.p.operator.insecure_clone();
    let enc = c.p.enclave.insecure_clone();
    assert_ok(c.env.settle(
        &op,
        &c.p,
        &session,
        &credit_mint,
        &agent_key,
        3_600,
        &enc,
        1_200,
    ));
    let payout = c.p.payout.insecure_clone();
    assert_eq!(c.env.balance(&ata(&payout.pubkey(), &credit_mint)), 1_200);

    // Holders cannot cash out; only the provider payout / treasury can.
    assert_err(
        redeem(&mut c, &buyer, 100, false, false),
        "NotCashOutAuthority",
    );
    // While the attestation is valid, holders cannot refund either.
    assert_err(redeem(&mut c, &buyer, 100, true, true), "RefundNotAllowed");

    // Provider converts earned credits into USDC at par.
    c.env.svm.airdrop(&payout.pubkey(), 1_000_000_000).unwrap();
    assert_ok(redeem(&mut c, &payout, 1_200, false, false));
    assert_eq!(
        c.env.balance(&ata(&payout.pubkey(), &usdc)),
        1_200 * PRICE_PER_CREDIT
    );

    // Invariant: escrow == outstanding credits * price.
    let close = c
        .env
        .close_session_ix(&op.pubkey(), &c.p, &session, &credit_mint);
    assert_ok(c.env.send(&[close], &op, &[]));
    let outstanding = c.env.balance(&ata(&buyer.pubkey(), &c.credit_mint));
    assert_eq!(outstanding, 2_400);
    assert_eq!(
        c.env.balance(&ata(&c.offering, &usdc)),
        outstanding * PRICE_PER_CREDIT
    );
    let o: Offering = c.env.account(&c.offering);
    assert_eq!(o.minted, 3_600);
}

#[test]
fn holders_refund_when_provider_defaults() {
    let mut c = setup();
    let usdc = c.env.usdc;
    let buyer = c.env.funded();
    c.env.mint_to(&usdc, &buyer.pubkey(), 100_000_000);
    assert_ok(buy(&mut c, &buyer, 1_000));

    let v = c.env.verifiers[0].insecure_clone();
    let revoke = c.env.revoke_attestation_ix(&v.pubkey(), &c.p);
    assert_ok(c.env.send(&[revoke], &v, &[]));

    // No more sales against a provider without a valid attestation.
    assert_err(buy(&mut c, &buyer, 1), "NotActiveAttestation");

    // Holders exit at par.
    assert_ok(redeem(&mut c, &buyer, 1_000, true, false));
    assert_eq!(c.env.balance(&ata(&buyer.pubkey(), &usdc)), 100_000_000);
    assert_eq!(c.env.balance(&ata(&c.offering, &usdc)), 0);
}

#[test]
fn holders_refund_after_offering_expiry() {
    let mut c = setup();
    let usdc = c.env.usdc;
    let buyer = c.env.funded();
    c.env.mint_to(&usdc, &buyer.pubkey(), 10_000_000);
    assert_ok(buy(&mut c, &buyer, 400));
    c.env.warp(30 * DAY + 1);
    assert_err(buy(&mut c, &buyer, 1), "AttestationNotValid");
    assert_ok(redeem(&mut c, &buyer, 400, true, true));
    assert_eq!(c.env.balance(&ata(&buyer.pubkey(), &usdc)), 10_000_000);
}
