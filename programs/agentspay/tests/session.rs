//! Attested session lifecycle: open -> settle (voucher + enclave receipt) -> close -> rate.

mod common;

use agentspay::{Attestation, Provider, Session};
use anchor_lang::prelude::Pubkey;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const PRICE: u64 = 1_000; // 0.001 USDC per unit
const DEPOSIT: u64 = 5_000_000; // 5 USDC

struct Fixture {
    env: Env,
    p: ProviderCtx,
    payer: Keypair,
    agent_key: Keypair,
    session: Pubkey,
}

fn fixture(fee_bps: u16) -> Fixture {
    let mut env = Env::new(3, 2, fee_bps);
    let p = env.attested_provider();
    let payer = env.funded();
    let agent_key = Keypair::new();
    let usdc = env.usdc;
    env.mint_to(&usdc, &payer.pubkey(), 10_000_000);
    let (ix, session) = env.open_session_ix(
        &payer.pubkey(),
        &p,
        &usdc,
        session_args(1, DEPOSIT, PRICE, agent_key.pubkey()),
    );
    assert_ok(env.send(&[ix], &payer, &[]));
    Fixture {
        env,
        p,
        payer,
        agent_key,
        session,
    }
}

#[test]
fn attestation_requires_threshold_approvals() {
    let mut env = Env::new(3, 2, 0);
    let p = env.pending_provider(TEE_TDX, [1u8; 48]);
    let v0 = env.verifiers[0].insecure_clone();
    let v1 = env.verifiers[1].insecure_clone();

    let ix = env.approve_attestation_ix(&v0.pubkey(), &p);
    assert_ok(env.send(&[ix], &v0, &[]));
    let a: Attestation = env.account(&p.attestation);
    assert_eq!(a.status, 0, "one approval is not enough");

    // Same verifier cannot double-count.
    let ix = env.approve_attestation_ix(&v0.pubkey(), &p);
    assert_err(env.send(&[ix], &v0, &[]), "AlreadyApproved");

    // A random key is not a verifier.
    let rando = env.funded();
    let ix = env.approve_attestation_ix(&rando.pubkey(), &p);
    assert_err(env.send(&[ix], &rando, &[]), "NotVerifier");

    let ix = env.approve_attestation_ix(&v1.pubkey(), &p);
    assert_ok(env.send(&[ix], &v1, &[]));
    let a: Attestation = env.account(&p.attestation);
    assert_eq!(a.status, 1);
    assert_eq!(a.expires_at - a.verified_at, 3 * DAY);
    let prov: Provider = env.account(&p.provider);
    assert_eq!(prov.active_attestation, p.attestation);
}

#[test]
fn cannot_open_session_against_unverified_provider() {
    let mut env = Env::new(1, 1, 0);
    let p = env.pending_provider(TEE_TDX, [2u8; 48]);
    let payer = env.funded();
    let usdc = env.usdc;
    env.mint_to(&usdc, &payer.pubkey(), 1_000_000);
    let (ix, _) = env.open_session_ix(
        &payer.pubkey(),
        &p,
        &usdc,
        session_args(1, 1_000, 1, payer.pubkey()),
    );
    assert_err(env.send(&[ix], &payer, &[]), "NotActiveAttestation");
}

#[test]
fn happy_path_settle_close_and_rate() {
    let mut f = fixture(250); // 2.5% protocol fee
    let usdc = f.env.usdc;
    let payer_ata = ata(&f.payer.pubkey(), &usdc);
    assert_eq!(f.env.balance(&payer_ata), 10_000_000 - DEPOSIT);
    assert_eq!(f.env.balance(&ata(&f.session, &usdc)), DEPOSIT);

    // Enclave metered 1_200 units (= 1.2 USDC); payer pre-authorised 2 USDC.
    // Provider is paid what was *metered*, not what was authorised.
    let cranker = f.p.operator.insecure_clone();
    let enclave = f.p.enclave.insecure_clone();
    assert_ok(f.env.settle(
        &cranker,
        &f.p,
        &f.session,
        &usdc,
        &f.agent_key,
        2_000_000,
        &enclave,
        1_200,
    ));
    let payout_ata = ata(&f.p.payout.pubkey(), &usdc);
    let treasury_ata = ata(&f.env.treasury.pubkey(), &usdc);
    assert_eq!(f.env.balance(&payout_ata), 1_170_000);
    assert_eq!(f.env.balance(&treasury_ata), 30_000);

    // Next round: enclave says 3_000 units (3 USDC) but voucher only covers 2.5 USDC.
    assert_ok(f.env.settle(
        &cranker,
        &f.p,
        &f.session,
        &usdc,
        &f.agent_key,
        2_500_000,
        &enclave,
        3_000,
    ));
    let s: Session = f.env.account(&f.session);
    assert_eq!(s.settled, 2_500_000);
    assert_eq!(s.units_settled, 3_000);
    assert_eq!(s.transcript_hash, [(3_000u64 as u8); 32]);

    // Replaying an old voucher settles nothing.
    assert_err(
        f.env.settle(
            &cranker,
            &f.p,
            &f.session,
            &usdc,
            &f.agent_key,
            2_500_000,
            &enclave,
            3_000,
        ),
        "NothingToSettle",
    );

    // Provider closes cooperatively; payer gets the unspent 2.5 USDC back.
    let close = f
        .env
        .close_session_ix(&cranker.pubkey(), &f.p, &f.session, &usdc);
    assert_ok(f.env.send(&[close], &cranker, &[]));
    assert_eq!(f.env.balance(&payer_ata), 10_000_000 - 2_500_000);
    assert!(!f.env.exists(&ata(&f.session, &usdc)), "escrow closed");

    // Payer rates the provider; the rating is backed by 2.5 USDC of settled payment.
    let fin = f
        .env
        .finalize_ix(&f.payer.pubkey(), &f.p, &f.session, Some(92));
    let payer = f.payer.insecure_clone();
    assert_ok(f.env.send(&[fin], &payer, &[]));
    assert!(!f.env.exists(&f.session), "session account closed");
    let prov: Provider = f.env.account(&f.p.provider);
    assert_eq!(prov.stats.sessions_opened, 1);
    assert_eq!(prov.stats.sessions_closed, 1);
    assert_eq!(prov.stats.forced_closes, 0);
    assert_eq!(prov.stats.settlements, 2);
    assert_eq!(prov.stats.units_served, 3_000);
    assert_eq!(prov.stats.average_rating(), Some(92));
}

#[test]
fn receipt_must_come_from_the_enclave_key() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let operator = f.p.operator.insecure_clone();
    // The operator's host software tries to mint its own receipt.
    assert_err(
        f.env.settle(
            &operator,
            &f.p,
            &f.session,
            &usdc,
            &f.agent_key,
            1_000_000,
            &operator,
            1_000,
        ),
        "SignerMismatch",
    );
    // A voucher signed by anyone other than the authorized signer is rejected too.
    let enclave = f.p.enclave.insecure_clone();
    let mallory = Keypair::new();
    assert_err(
        f.env.settle(
            &operator, &f.p, &f.session, &usdc, &mallory, 1_000_000, &enclave, 1_000,
        ),
        "SignerMismatch",
    );
}

#[test]
fn messages_are_bound_to_the_session() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let operator = f.p.operator.insecure_clone();
    let enclave = f.p.enclave.insecure_clone();
    let other = Pubkey::new_unique();
    let settle = f.env.settle_ix(&operator.pubkey(), &f.p, &f.session, &usdc);

    let ixs = [
        voucher_ix(&f.agent_key, other, 1_000, 0),
        receipt_ix(&enclave, f.session, 1),
        settle.clone(),
    ];
    assert_err(f.env.send(&ixs, &operator, &[]), "VoucherSessionMismatch");

    let ixs = [
        voucher_ix(&f.agent_key, f.session, 1_000, 0),
        receipt_ix(&enclave, other, 1),
        settle.clone(),
    ];
    assert_err(f.env.send(&ixs, &operator, &[]), "ReceiptSessionMismatch");

    // Expired voucher.
    let now = f.env.now();
    let ixs = [
        voucher_ix(&f.agent_key, f.session, 1_000, now - 1),
        receipt_ix(&enclave, f.session, 1),
        settle.clone(),
    ];
    assert_err(f.env.send(&ixs, &operator, &[]), "VoucherExpired");

    // Missing precompile instructions.
    assert_err(
        f.env.send(&[settle], &operator, &[]),
        "MissingEd25519Instruction",
    );
}

#[test]
fn settlement_never_exceeds_deposit_and_receipts_cannot_regress() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let op = f.p.operator.insecure_clone();
    let enc = f.p.enclave.insecure_clone();
    assert_ok(f.env.settle(
        &op,
        &f.p,
        &f.session,
        &usdc,
        &f.agent_key,
        u64::MAX,
        &enc,
        1_000_000,
    ));
    let s: Session = f.env.account(&f.session);
    assert_eq!(s.settled, DEPOSIT, "capped at deposit");
    assert_eq!(f.env.balance(&ata(&f.session, &usdc)), 0);

    // Fresh session to test regression.
    let usdc = f.env.usdc;
    let (ix, s2) = f.env.open_session_ix(
        &f.payer.pubkey(),
        &f.p,
        &usdc,
        session_args(2, 1_000_000, PRICE, f.agent_key.pubkey()),
    );
    let payer = f.payer.insecure_clone();
    assert_ok(f.env.send(&[ix], &payer, &[]));
    assert_ok(
        f.env
            .settle(&op, &f.p, &s2, &usdc, &f.agent_key, 500_000, &enc, 300),
    );
    assert_err(
        f.env
            .settle(&op, &f.p, &s2, &usdc, &f.agent_key, 600_000, &enc, 299),
        "ReceiptRegressed",
    );
}

#[test]
fn revoked_attestation_blocks_payment_and_frees_the_payer() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let op = f.p.operator.insecure_clone();
    let enc = f.p.enclave.insecure_clone();
    assert_ok(f.env.settle(
        &op,
        &f.p,
        &f.session,
        &usdc,
        &f.agent_key,
        1_000_000,
        &enc,
        1_000,
    ));

    // A verifier discovers the TCB is out of date and revokes.
    let v = f.env.verifiers[2].insecure_clone();
    let ix = f.env.revoke_attestation_ix(&v.pubkey(), &f.p);
    assert_ok(f.env.send(&[ix], &v, &[]));

    assert_err(
        f.env.settle(
            &op,
            &f.p,
            &f.session,
            &usdc,
            &f.agent_key,
            2_000_000,
            &enc,
            2_000,
        ),
        "AttestationNotValid",
    );

    // Anyone can now close immediately; no grace period needed.
    let rando = f.env.funded();
    let close = f
        .env
        .close_session_ix(&rando.pubkey(), &f.p, &f.session, &usdc);
    assert_ok(f.env.send(&[close], &rando, &[]));
    assert_eq!(
        f.env.balance(&ata(&f.payer.pubkey(), &usdc)),
        10_000_000 - 1_000_000
    );
    let prov: Provider = f.env.account(&f.p.provider);
    assert_eq!(prov.stats.forced_closes, 1);
    assert_eq!(prov.active_attestation, Pubkey::default());
}

#[test]
fn revoking_a_measurement_invalidates_dependent_attestations() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let v = f.env.verifiers[0].insecure_clone();
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(
            &agentspay::accounts::RevokeMeasurement {
                authority: v.pubkey(),
                config: f.env.config,
                measurement: f.p.measurement,
            },
            None,
        ),
        data: anchor_lang::InstructionData::data(&agentspay::instruction::RevokeMeasurement {}),
    };
    assert_ok(f.env.send(&[ix], &v, &[]));
    let op = f.p.operator.insecure_clone();
    let enc = f.p.enclave.insecure_clone();
    assert_err(
        f.env
            .settle(&op, &f.p, &f.session, &usdc, &f.agent_key, 1_000, &enc, 1),
        "AttestationNotValid",
    );
}

#[test]
fn attestation_expiry_blocks_payment() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    f.env.warp(3 * DAY + 1);
    let op = f.p.operator.insecure_clone();
    let enc = f.p.enclave.insecure_clone();
    assert_err(
        f.env
            .settle(&op, &f.p, &f.session, &usdc, &f.agent_key, 1_000, &enc, 1),
        "AttestationNotValid",
    );
}

#[test]
fn forced_close_respects_grace_period() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let payer = f.payer.insecure_clone();
    let op = f.p.operator.insecure_clone();
    let enc = f.p.enclave.insecure_clone();

    // Only the payer side may request close.
    let ix = f.env.request_close_ix(&op.pubkey(), &f.session, None);
    assert_err(f.env.send(&[ix], &op, &[]), "Unauthorized");
    let ix = f.env.request_close_ix(&payer.pubkey(), &f.session, None);
    assert_ok(f.env.send(&[ix], &payer, &[]));

    // A stranger cannot close before the grace period ends...
    let rando = f.env.funded();
    let close = f
        .env
        .close_session_ix(&rando.pubkey(), &f.p, &f.session, &usdc);
    assert_err(f.env.send(&[close.clone()], &rando, &[]), "CloseNotAllowed");

    // ...and the provider can still collect what it is owed during grace.
    f.env.warp(600);
    assert_ok(f.env.settle(
        &op,
        &f.p,
        &f.session,
        &usdc,
        &f.agent_key,
        700_000,
        &enc,
        700,
    ));

    f.env.warp(301);
    assert_err(
        f.env.settle(
            &op,
            &f.p,
            &f.session,
            &usdc,
            &f.agent_key,
            800_000,
            &enc,
            800,
        ),
        "SessionNotSettleable",
    );
    let close = f
        .env
        .close_session_ix(&rando.pubkey(), &f.p, &f.session, &usdc);
    assert_ok(f.env.send(&[close], &rando, &[]));
    assert_eq!(
        f.env.balance(&ata(&payer.pubkey(), &usdc)),
        10_000_000 - 700_000
    );

    // Ratings need a settled session and come from the payer only.
    let fin = f
        .env
        .finalize_ix(&rando.pubkey(), &f.p, &f.session, Some(10));
    assert_err(f.env.send(&[fin], &rando, &[]), "Unauthorized");
    let fin = f
        .env
        .finalize_ix(&payer.pubkey(), &f.p, &f.session, Some(101));
    assert_err(f.env.send(&[fin], &payer, &[]), "InvalidRating");
    let fin = f
        .env
        .finalize_ix(&payer.pubkey(), &f.p, &f.session, Some(40));
    assert_ok(f.env.send(&[fin], &payer, &[]));
    let prov: Provider = f.env.account(&f.p.provider);
    assert_eq!(prov.stats.forced_closes, 1);
    assert_eq!(prov.stats.average_rating(), Some(40));
}

#[test]
fn unpaid_sessions_cannot_rate() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let op = f.p.operator.insecure_clone();
    let close = f
        .env
        .close_session_ix(&op.pubkey(), &f.p, &f.session, &usdc);
    assert_ok(f.env.send(&[close], &op, &[]));
    let payer = f.payer.insecure_clone();
    let fin = f
        .env
        .finalize_ix(&payer.pubkey(), &f.p, &f.session, Some(0));
    assert_err(f.env.send(&[fin], &payer, &[]), "NothingToRate");
    // Finalizing without a rating just reclaims rent.
    let fin = f.env.finalize_ix(&payer.pubkey(), &f.p, &f.session, None);
    assert_ok(f.env.send(&[fin], &payer, &[]));
}

#[test]
fn top_up_extends_the_ceiling() {
    let mut f = fixture(0);
    let usdc = f.env.usdc;
    let payer = f.payer.insecure_clone();
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(
            &agentspay::accounts::TopUpSession {
                funder: payer.pubkey(),
                session: f.session,
                mint: usdc,
                funder_token: ata(&payer.pubkey(), &usdc),
                escrow: ata(&f.session, &usdc),
                token_program: TOKEN_PROGRAM,
            },
            None,
        ),
        data: anchor_lang::InstructionData::data(&agentspay::instruction::TopUpSession {
            amount: 1_000_000,
        }),
    };
    assert_ok(f.env.send(&[ix], &payer, &[]));
    let s: Session = f.env.account(&f.session);
    assert_eq!(s.deposit, DEPOSIT + 1_000_000);
    let op = f.p.operator.insecure_clone();
    let enc = f.p.enclave.insecure_clone();
    assert_ok(f.env.settle(
        &op,
        &f.p,
        &f.session,
        &usdc,
        &f.agent_key,
        u64::MAX,
        &enc,
        u64::MAX / 2_000,
    ));
    let s: Session = f.env.account(&f.session);
    assert_eq!(s.settled, DEPOSIT + 1_000_000);
}

#[test]
fn simulated_tee_can_be_disabled() {
    let mut env = Env::new(1, 1, 0);
    let admin = env.admin.insecure_clone();
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(
            &agentspay::accounts::UpdateConfig {
                admin: admin.pubkey(),
                config: env.config,
            },
            None,
        ),
        data: anchor_lang::InstructionData::data(&agentspay::instruction::UpdateConfig {
            args: agentspay::UpdateConfigArgs {
                allow_simulated_tee: Some(false),
                ..Default::default()
            },
        }),
    };
    assert_ok(env.send(&[ix], &admin, &[]));

    let operator = env.funded();
    let provider = provider_pda(&operator.pubkey());
    let reg = anchor_lang::solana_program::instruction::Instruction {
        program_id: PROGRAM_ID,
        accounts: anchor_lang::ToAccountMetas::to_account_metas(
            &agentspay::accounts::RegisterProvider {
                operator: operator.pubkey(),
                config: env.config,
                provider,
                system_program: SYSTEM_PROGRAM,
            },
            None,
        ),
        data: anchor_lang::InstructionData::data(&agentspay::instruction::RegisterProvider {
            args: agentspay::RegisterProviderArgs {
                payout: operator.pubkey(),
                agent_asset: Pubkey::default(),
                endpoint: "http://localhost:8787".into(),
            },
        }),
    };
    assert_ok(env.send(&[reg], &operator, &[]));
    let enclave = Keypair::new();
    let sub = env.submit_attestation_ix(
        &operator.pubkey(),
        &provider,
        &enclave.pubkey(),
        TEE_SIMULATED,
        [0u8; 48],
    );
    assert_err(env.send(&[sub], &operator, &[]), "SimulatedTeeDisabled");

    // The enclave key may never be the operator's own key.
    let sub = env.submit_attestation_ix(
        &operator.pubkey(),
        &provider,
        &operator.pubkey(),
        TEE_TDX,
        [0u8; 48],
    );
    assert_err(env.send(&[sub], &operator, &[]), "EnclaveKeyIsOperator");
}
