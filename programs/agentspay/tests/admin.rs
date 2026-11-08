//! Governance: initialization is restricted to the program's upgrade authority.

mod common;

use agentspay::InitializeArgs;
use common::*;
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

#[test]
fn only_upgrade_authority_can_initialize() {
    let mut svm = LiteSVM::new();
    let so = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/agentspay.so")).unwrap();
    svm.add_program(PROGRAM_ID, &so).unwrap();
    let deployer = Keypair::new();
    let attacker = Keypair::new();
    set_upgrade_authority(&mut svm, &deployer.pubkey());
    for k in [&deployer, &attacker] {
        svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    }
    let args = |treasury| InitializeArgs {
        treasury,
        verifiers: vec![Keypair::new().pubkey()],
        verifier_threshold: 1,
        protocol_fee_bps: 0,
        max_attestation_ttl: DAY,
        allow_simulated_tee: false,
    };

    // A front-runner who is not the upgrade authority is rejected.
    let ix = initialize_ix(&attacker.pubkey(), args(attacker.pubkey()));
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&attacker.pubkey()), &[&attacker], svm.latest_blockhash());
    assert_err(svm.send_transaction(tx), "Unauthorized");

    let ix = initialize_ix(&deployer.pubkey(), args(deployer.pubkey()));
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&deployer.pubkey()), &[&deployer], svm.latest_blockhash());
    assert_ok(svm.send_transaction(tx));
}
