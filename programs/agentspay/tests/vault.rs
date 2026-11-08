//! Agent vaults: owner-funded budgets that an agent spends under a policy.

mod common;

use agentspay::{
    accounts as acc, instruction as ix, AgentVault, OpenSessionArgs, UpdateVaultArgs, VaultPolicy,
};
use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, InstructionData, ToAccountMetas,
};
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

struct V {
    env: Env,
    p: ProviderCtx,
    owner: Keypair,
    agent: Keypair,
    vault: Pubkey,
}

fn policy() -> VaultPolicy {
    VaultPolicy {
        max_per_session: 2_000_000,
        period_limit: 3_000_000,
        period_seconds: DAY as u32,
        min_provider_rating: 0,
        allowed_tee_mask: 0,
        expires_at: 0,
    }
}

fn setup(policy: VaultPolicy) -> V {
    let mut env = Env::new(1, 1, 0);
    let p = env.attested_provider();
    let owner = env.funded();
    let agent = env.funded();
    let usdc = env.usdc;
    let vault = vault_pda(&owner.pubkey(), &agent.pubkey(), &usdc);
    let create = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::CreateVault {
            owner: owner.pubkey(),
            mint: usdc,
            vault,
            vault_token: ata(&vault, &usdc),
            token_program: TOKEN_PROGRAM,
            associated_token_program: ATA_PROGRAM,
            system_program: SYSTEM_PROGRAM,
        }
        .to_account_metas(None),
        data: ix::CreateVault {
            agent: agent.pubkey(),
            policy,
        }
        .data(),
    };
    assert_ok(env.send(&[create], &owner, &[]));
    // Fund the vault by plain token transfer into its ATA (here: mint directly).
    env.mint_to(&usdc, &vault, 10_000_000);
    V {
        env,
        p,
        owner,
        agent,
        vault,
    }
}

fn open_from_vault(
    v: &mut V,
    salt: u64,
    deposit: u64,
) -> (litesvm::types::TransactionResult, Pubkey) {
    let usdc = v.env.usdc;
    let session = session_pda(&v.vault, &v.p.provider, salt);
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::OpenSessionFromVault {
            agent: v.agent.pubkey(),
            config: v.env.config,
            vault: v.vault,
            vault_token: ata(&v.vault, &usdc),
            provider: v.p.provider,
            attestation: v.p.attestation,
            measurement: v.p.measurement,
            mint: usdc,
            session,
            escrow: ata(&session, &usdc),
            token_program: TOKEN_PROGRAM,
            associated_token_program: ATA_PROGRAM,
            system_program: SYSTEM_PROGRAM,
        }
        .to_account_metas(None),
        data: ix::OpenSessionFromVault {
            args: OpenSessionArgs {
                salt,
                deposit,
                price_per_unit: 1_000,
                grace_period: 600,
                authorized_signer: v.agent.pubkey(),
            },
        }
        .data(),
    };
    let agent = v.agent.insecure_clone();
    (v.env.send(&[ix], &agent, &[]), session)
}

fn update(v: &mut V, args: UpdateVaultArgs) -> litesvm::types::TransactionResult {
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::UpdateVault {
            owner: v.owner.pubkey(),
            vault: v.vault,
        }
        .to_account_metas(None),
        data: ix::UpdateVault { args }.data(),
    };
    let owner = v.owner.insecure_clone();
    v.env.send(&[ix], &owner, &[])
}

#[test]
fn agent_spends_within_policy_and_refunds_return_to_vault() {
    let mut v = setup(policy());
    let usdc = v.env.usdc;
    let vault_ata = ata(&v.vault, &usdc);

    let (res, s1) = open_from_vault(&mut v, 1, 2_000_000);
    assert_ok(res);
    assert_eq!(v.env.balance(&vault_ata), 8_000_000);

    // Per-session cap.
    let (res, _) = open_from_vault(&mut v, 2, 2_000_001);
    assert_err(res, "SessionDepositTooLarge");
    // Rolling period limit: 2M already committed, 1.5M more would exceed 3M.
    let (res, _) = open_from_vault(&mut v, 3, 1_500_000);
    assert_err(res, "PeriodLimitExceeded");

    // Provider meters 500 units = 0.5 USDC, then closes cooperatively.
    let op = v.p.operator.insecure_clone();
    let enc = v.p.enclave.insecure_clone();
    let agent = v.agent.insecure_clone();
    assert_ok(
        v.env
            .settle(&op, &v.p, &s1, &usdc, &agent, 2_000_000, &enc, 500),
    );
    let close = v.env.close_session_ix(&op.pubkey(), &v.p, &s1, &usdc);
    assert_ok(v.env.send(&[close], &op, &[]));
    assert_eq!(
        v.env.balance(&vault_ata),
        9_500_000,
        "unspent deposit returned to the vault"
    );

    let vault: AgentVault = v.env.account(&v.vault);
    assert_eq!(
        vault.period_spent, 500_000,
        "refund credited back to the period"
    );
    assert_eq!(vault.lifetime_settled, 500_000);
    assert_eq!(vault.open_sessions, 0);

    // Room again in the period now that the refund came back.
    let (res, _) = open_from_vault(&mut v, 4, 2_000_000);
    assert_ok(res);

    // Agent (or owner) rates the provider through the vault.
    let fin = v.env.finalize_ix(&agent.pubkey(), &v.p, &s1, Some(80));
    assert_ok(v.env.send(&[fin], &agent, &[]));
}

#[test]
fn period_resets_after_window() {
    let mut v = setup(policy());
    let (res, _) = open_from_vault(&mut v, 1, 2_000_000);
    assert_ok(res);
    let (res, _) = open_from_vault(&mut v, 2, 1_500_000);
    assert_err(res, "PeriodLimitExceeded");
    v.env.warp(DAY + 1);
    let (res, _) = open_from_vault(&mut v, 3, 1_500_000);
    assert_ok(res);
}

#[test]
fn owner_kill_switch_and_withdraw() {
    let mut v = setup(policy());
    assert_ok(update(
        &mut v,
        UpdateVaultArgs {
            policy: None,
            frozen: Some(true),
        },
    ));
    let (res, _) = open_from_vault(&mut v, 1, 1_000);
    assert_err(res, "VaultFrozen");

    // The agent cannot unfreeze or drain.
    let usdc = v.env.usdc;
    let agent = v.agent.insecure_clone();
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::UpdateVault {
            owner: agent.pubkey(),
            vault: v.vault,
        }
        .to_account_metas(None),
        data: ix::UpdateVault {
            args: UpdateVaultArgs {
                policy: None,
                frozen: Some(false),
            },
        }
        .data(),
    };
    assert_err(v.env.send(&[ix], &agent, &[]), "Unauthorized");

    let owner = v.owner.insecure_clone();
    let dest = v.env.mint_to(&usdc, &owner.pubkey(), 0);
    let withdraw = Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::WithdrawVault {
            owner: owner.pubkey(),
            vault: v.vault,
            mint: usdc,
            vault_token: ata(&v.vault, &usdc),
            destination: dest,
            token_program: TOKEN_PROGRAM,
        }
        .to_account_metas(None),
        data: ix::WithdrawVault { amount: 10_000_000 }.data(),
    };
    assert_ok(v.env.send(&[withdraw], &owner, &[]));
    assert_eq!(v.env.balance(&dest), 10_000_000);
}

#[test]
fn vault_session_can_be_force_closed_by_owner() {
    let mut v = setup(policy());
    let usdc = v.env.usdc;
    let (res, s) = open_from_vault(&mut v, 1, 1_000_000);
    assert_ok(res);
    let owner = v.owner.insecure_clone();
    let ix = v.env.request_close_ix(&owner.pubkey(), &s, Some(v.vault));
    assert_ok(v.env.send(&[ix], &owner, &[]));
    v.env.warp(601);
    let close = v.env.close_session_ix(&owner.pubkey(), &v.p, &s, &usdc);
    assert_ok(v.env.send(&[close], &owner, &[]));
    assert_eq!(v.env.balance(&ata(&v.vault, &usdc)), 10_000_000);
}

#[test]
fn reputation_and_tee_gates() {
    // Require an average paid rating of 50+: an unrated provider is refused.
    let mut p = policy();
    p.min_provider_rating = 50;
    let mut v = setup(p);
    let (res, _) = open_from_vault(&mut v, 1, 1_000);
    assert_err(res, "ProviderRatingTooLow");

    // Only allow AMD SEV-SNP (bit 2); the provider runs Intel TDX.
    let mut p = policy();
    p.allowed_tee_mask = 1 << 2;
    assert_ok(update(
        &mut v,
        UpdateVaultArgs {
            policy: Some(p),
            frozen: None,
        },
    ));
    let (res, _) = open_from_vault(&mut v, 1, 1_000);
    assert_err(res, "TeeTypeNotAllowed");

    // Expired delegation.
    let mut p = policy();
    p.expires_at = v.env.now() - 1;
    assert_ok(update(
        &mut v,
        UpdateVaultArgs {
            policy: Some(p),
            frozen: None,
        },
    ));
    let (res, _) = open_from_vault(&mut v, 1, 1_000);
    assert_err(res, "VaultExpired");
}
