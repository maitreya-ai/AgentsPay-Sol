//! Shared LiteSVM harness for AgentsPay integration tests.
#![allow(dead_code)]

use agentspay::{
    accounts as acc, instruction as ix, InitializeArgs, MeasurementArgs, OpenSessionArgs,
    RegisterProviderArgs, SubmitAttestationArgs, UsageReceipt, Voucher,
};
use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::instruction::Instruction,
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use litesvm::{types::TransactionResult, LiteSVM};
use litesvm_token::{
    get_spl_account, spl_token::state::Account as SplAccount, CreateAssociatedTokenAccount,
    CreateMint, MintTo,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

pub const PROGRAM_ID: Pubkey = agentspay::ID;
pub const TOKEN_PROGRAM: Pubkey =
    anchor_lang::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ATA_PROGRAM: Pubkey =
    anchor_lang::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const SYSTEM_PROGRAM: Pubkey = anchor_lang::system_program::ID;
pub const IX_SYSVAR: Pubkey = agentspay::INSTRUCTIONS_SYSVAR_ID;

pub const TEE_SIMULATED: u8 = 0;
pub const TEE_TDX: u8 = 1;
pub const DAY: i64 = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// PDAs
// ---------------------------------------------------------------------------

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &PROGRAM_ID).0
}
pub fn config_pda() -> Pubkey {
    pda(&[b"config"])
}
pub fn measurement_pda(tee: u8, value: &[u8; 48]) -> Pubkey {
    pda(&[b"measurement", &[tee], &value[..32], &value[32..]])
}
pub fn provider_pda(operator: &Pubkey) -> Pubkey {
    pda(&[b"provider", operator.as_ref()])
}
pub fn attestation_pda(provider: &Pubkey, enclave: &Pubkey) -> Pubkey {
    pda(&[b"attestation", provider.as_ref(), enclave.as_ref()])
}
pub fn session_pda(payer: &Pubkey, provider: &Pubkey, salt: u64) -> Pubkey {
    pda(&[
        b"session",
        payer.as_ref(),
        provider.as_ref(),
        &salt.to_le_bytes(),
    ])
}
pub fn vault_pda(owner: &Pubkey, agent: &Pubkey, mint: &Pubkey) -> Pubkey {
    pda(&[b"vault", owner.as_ref(), agent.as_ref(), mint.as_ref()])
}
pub fn offering_pda(provider: &Pubkey, id: u64) -> Pubkey {
    pda(&[b"offering", provider.as_ref(), &id.to_le_bytes()])
}
pub fn credit_mint_pda(offering: &Pubkey) -> Pubkey {
    pda(&[b"credit_mint", offering.as_ref()])
}
pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()],
        &ATA_PROGRAM,
    )
    .0
}

// ---------------------------------------------------------------------------
// Signed messages
// ---------------------------------------------------------------------------

pub fn ed25519_ix(signer: &Keypair, message: &[u8]) -> Instruction {
    let sig: [u8; 64] = signer.sign_message(message).into();
    solana_ed25519_program::new_ed25519_instruction_with_signature(
        message,
        &sig,
        &signer.pubkey().to_bytes(),
    )
}

pub fn voucher_ix(
    signer: &Keypair,
    session: Pubkey,
    cumulative: u64,
    expires_at: i64,
) -> Instruction {
    let v = Voucher {
        session,
        cumulative_amount: cumulative,
        expires_at,
    };
    ed25519_ix(signer, &v.encode())
}

pub fn receipt_ix(enclave: &Keypair, session: Pubkey, units: u64) -> Instruction {
    let r = UsageReceipt {
        session,
        cumulative_units: units,
        transcript_hash: [units as u8; 32],
        issued_at: 0,
    };
    ed25519_ix(enclave, &r.encode())
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

pub fn assert_ok(res: TransactionResult) {
    if let Err(e) = res {
        panic!(
            "transaction failed: {:?}\n{}",
            e.err,
            e.meta.logs.join("\n")
        );
    }
}

/// Asserts failure and that the logs mention `needle` (e.g. an Anchor error name).
pub fn assert_err(res: TransactionResult, needle: &str) {
    match res {
        Ok(meta) => panic!(
            "expected failure containing {needle:?}, got success:\n{}",
            meta.logs.join("\n")
        ),
        Err(e) => {
            let logs = e.meta.logs.join("\n");
            let haystack = format!("{logs}\n{:?}", e.err);
            assert!(
                haystack.contains(needle),
                "expected error containing {needle:?}, got {:?}\n{logs}",
                e.err
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

pub struct ProviderCtx {
    pub operator: Keypair,
    pub payout: Keypair,
    pub enclave: Keypair,
    pub provider: Pubkey,
    pub attestation: Pubkey,
    pub measurement: Pubkey,
    pub tee: u8,
    pub value: [u8; 48],
}

pub struct Env {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub treasury: Keypair,
    pub verifiers: Vec<Keypair>,
    pub usdc: Pubkey,
    pub config: Pubkey,
}

impl Env {
    /// Fresh SVM with the program deployed, a 6-decimals "USDC" mint, and an
    /// initialised config with `verifier_count` verifiers.
    pub fn new(verifier_count: usize, threshold: u8, fee_bps: u16) -> Self {
        let mut svm = LiteSVM::new();
        let so = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/deploy/agentspay.so"
        ))
        .expect("build the program first: `anchor build`");
        svm.add_program(PROGRAM_ID, &so).unwrap();

        let admin = Keypair::new();
        set_upgrade_authority(&mut svm, &admin.pubkey());
        let treasury = Keypair::new();
        svm.airdrop(&admin.pubkey(), 100_000_000_000).unwrap();
        let verifiers: Vec<Keypair> = (0..verifier_count).map(|_| Keypair::new()).collect();
        for v in &verifiers {
            svm.airdrop(&v.pubkey(), 1_000_000_000).unwrap();
        }
        let usdc = CreateMint::new(&mut svm, &admin)
            .decimals(6)
            .send()
            .unwrap();

        let mut env = Env {
            svm,
            admin,
            treasury,
            verifiers,
            usdc,
            config: config_pda(),
        };
        let args = InitializeArgs {
            treasury: env.treasury.pubkey(),
            verifiers: env.verifiers.iter().map(|k| k.pubkey()).collect(),
            verifier_threshold: threshold,
            protocol_fee_bps: fee_bps,
            max_attestation_ttl: 7 * DAY,
            allow_simulated_tee: true,
        };
        let ix = initialize_ix(&env.admin.pubkey(), args);
        let admin = env.admin.insecure_clone();
        assert_ok(env.send(&[ix], &admin, &[]));
        env
    }

    pub fn send(
        &mut self,
        ixs: &[Instruction],
        payer: &Keypair,
        extra: &[&Keypair],
    ) -> TransactionResult {
        self.svm.expire_blockhash();
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra);
        let tx = Transaction::new_signed_with_payer(
            ixs,
            Some(&payer.pubkey()),
            &signers,
            self.svm.latest_blockhash(),
        );
        self.svm.send_transaction(tx)
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn warp(&mut self, secs: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp += secs;
        clock.slot += (secs.max(1) as u64) * 2;
        self.svm.set_sysvar(&clock);
    }

    pub fn funded(&mut self) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
        k
    }

    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        get_spl_account::<SplAccount>(&self.svm, token_account)
            .map(|a| a.amount)
            .unwrap_or(0)
    }

    pub fn exists(&self, address: &Pubkey) -> bool {
        self.svm
            .get_account(address)
            .map(|a| a.lamports > 0)
            .unwrap_or(false)
    }

    pub fn account<T: AccountDeserialize>(&self, address: &Pubkey) -> T {
        let a = self.svm.get_account(address).expect("account missing");
        T::try_deserialize(&mut a.data.as_slice()).expect("deserialize")
    }

    /// Mint `amount` of `mint` (admin is authority) into `owner`'s ATA.
    pub fn mint_to(&mut self, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Pubkey {
        let a = ata(owner, mint);
        if !self.exists(&a) {
            CreateAssociatedTokenAccount::new(&mut self.svm, &self.admin, mint)
                .owner(owner)
                .send()
                .unwrap();
        }
        if amount > 0 {
            MintTo::new(&mut self.svm, &self.admin, mint, &a, amount)
                .send()
                .unwrap();
        }
        a
    }

    pub fn approve_measurement_ix(&self, tee: u8, value: [u8; 48]) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::ApproveMeasurement {
                admin: self.admin.pubkey(),
                config: self.config,
                measurement: measurement_pda(tee, &value),
                system_program: SYSTEM_PROGRAM,
            }
            .to_account_metas(None),
            data: ix::ApproveMeasurement {
                args: MeasurementArgs {
                    tee_type: tee,
                    value,
                    model_hash: [7u8; 32],
                    label: "agentspay-gateway v0.1 / llama-3.1-8b".into(),
                },
            }
            .data(),
        }
    }

    pub fn approve_attestation_ix(&self, verifier: &Pubkey, p: &ProviderCtx) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::ApproveAttestation {
                verifier: *verifier,
                config: self.config,
                provider: p.provider,
                attestation: p.attestation,
                measurement: p.measurement,
            }
            .to_account_metas(None),
            data: ix::ApproveAttestation {}.data(),
        }
    }

    pub fn submit_attestation_ix(
        &self,
        operator: &Pubkey,
        provider: &Pubkey,
        enclave: &Pubkey,
        tee: u8,
        value: [u8; 48],
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::SubmitAttestation {
                operator: *operator,
                config: self.config,
                provider: *provider,
                attestation: attestation_pda(provider, enclave),
                system_program: SYSTEM_PROGRAM,
            }
            .to_account_metas(None),
            data: ix::SubmitAttestation {
                args: SubmitAttestationArgs {
                    enclave_key: *enclave,
                    encryption_key: [9u8; 32],
                    tee_type: tee,
                    measurement: value,
                    evidence_hash: [1u8; 32],
                    evidence_uri: "ipfs://bafy-evidence".into(),
                    requested_ttl: 3 * DAY,
                },
            }
            .data(),
        }
    }

    /// Registers a provider, approves its measurement, submits an attestation
    /// and collects `threshold` verifier approvals so it is Valid.
    pub fn attested_provider(&mut self) -> ProviderCtx {
        let p = self.pending_provider(TEE_TDX, [42u8; 48]);
        let threshold = self
            .account::<agentspay::Config>(&self.config)
            .verifier_threshold as usize;
        for i in 0..threshold {
            let v = self.verifiers[i].insecure_clone();
            let ix = self.approve_attestation_ix(&v.pubkey(), &p);
            assert_ok(self.send(&[ix], &v, &[]));
        }
        p
    }

    /// Registers a provider and submits (but does not approve) an attestation.
    pub fn pending_provider(&mut self, tee: u8, value: [u8; 48]) -> ProviderCtx {
        let operator = self.funded();
        let payout = Keypair::new();
        let enclave = Keypair::new();
        let provider = provider_pda(&operator.pubkey());
        let measurement = measurement_pda(tee, &value);

        let admin = self.admin.insecure_clone();
        if !self.exists(&measurement) {
            let m = self.approve_measurement_ix(tee, value);
            assert_ok(self.send(&[m], &admin, &[]));
        }

        let reg = Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::RegisterProvider {
                operator: operator.pubkey(),
                config: self.config,
                provider,
                system_program: SYSTEM_PROGRAM,
            }
            .to_account_metas(None),
            data: ix::RegisterProvider {
                args: RegisterProviderArgs {
                    payout: payout.pubkey(),
                    agent_asset: Pubkey::new_unique(),
                    endpoint: "https://gpu-1.example.com/v1".into(),
                },
            }
            .data(),
        };
        let sub = self.submit_attestation_ix(
            &operator.pubkey(),
            &provider,
            &enclave.pubkey(),
            tee,
            value,
        );
        assert_ok(self.send(&[reg, sub], &operator, &[]));

        ProviderCtx {
            attestation: attestation_pda(&provider, &enclave.pubkey()),
            operator,
            payout,
            enclave,
            provider,
            measurement,
            tee,
            value,
        }
    }

    pub fn open_session_ix(
        &self,
        payer: &Pubkey,
        p: &ProviderCtx,
        mint: &Pubkey,
        args: OpenSessionArgs,
    ) -> (Instruction, Pubkey) {
        let session = session_pda(payer, &p.provider, args.salt);
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::OpenSession {
                payer: *payer,
                config: self.config,
                provider: p.provider,
                attestation: p.attestation,
                measurement: p.measurement,
                mint: *mint,
                payer_token: ata(payer, mint),
                session,
                escrow: ata(&session, mint),
                token_program: TOKEN_PROGRAM,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM_PROGRAM,
            }
            .to_account_metas(None),
            data: ix::OpenSession { args }.data(),
        };
        (ix, session)
    }

    pub fn settle_ix(
        &self,
        cranker: &Pubkey,
        p: &ProviderCtx,
        session: &Pubkey,
        mint: &Pubkey,
    ) -> Instruction {
        let s: agentspay::Session = self.account(session);
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::Settle {
                cranker: *cranker,
                config: self.config,
                session: *session,
                provider: p.provider,
                attestation: s.attestation,
                measurement: p.measurement,
                mint: *mint,
                escrow: ata(session, mint),
                payout: p.payout.pubkey(),
                payout_token: ata(&p.payout.pubkey(), mint),
                treasury: self.treasury.pubkey(),
                treasury_token: ata(&self.treasury.pubkey(), mint),
                instructions: IX_SYSVAR,
                token_program: TOKEN_PROGRAM,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM_PROGRAM,
            }
            .to_account_metas(None),
            data: ix::Settle {}.data(),
        }
    }

    /// `[voucher, receipt, settle]` signed by the given voucher signer and enclave key.
    #[allow(clippy::too_many_arguments)]
    pub fn settle(
        &mut self,
        cranker: &Keypair,
        p: &ProviderCtx,
        session: &Pubkey,
        mint: &Pubkey,
        voucher_signer: &Keypair,
        cumulative: u64,
        receipt_signer: &Keypair,
        units: u64,
    ) -> TransactionResult {
        let ixs = [
            voucher_ix(voucher_signer, *session, cumulative, 0),
            receipt_ix(receipt_signer, *session, units),
            self.settle_ix(&cranker.pubkey(), p, session, mint),
        ];
        self.send(&ixs, cranker, &[])
    }

    pub fn request_close_ix(
        &self,
        authority: &Pubkey,
        session: &Pubkey,
        vault: Option<Pubkey>,
    ) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::RequestClose {
                authority: *authority,
                session: *session,
                vault,
            }
            .to_account_metas(None),
            data: ix::RequestClose {}.data(),
        }
    }

    pub fn close_session_ix(
        &self,
        closer: &Pubkey,
        p: &ProviderCtx,
        session: &Pubkey,
        mint: &Pubkey,
    ) -> Instruction {
        let s: agentspay::Session = self.account(session);
        let vault = if s.vault == Pubkey::default() {
            None
        } else {
            Some(s.vault)
        };
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::CloseSession {
                closer: *closer,
                session: *session,
                provider: p.provider,
                attestation: s.attestation,
                measurement: p.measurement,
                mint: *mint,
                escrow: ata(session, mint),
                refund_owner: s.payer,
                refund_token: ata(&s.payer, mint),
                rent_payer: s.rent_payer,
                vault,
                token_program: TOKEN_PROGRAM,
                associated_token_program: ATA_PROGRAM,
                system_program: SYSTEM_PROGRAM,
            }
            .to_account_metas(None),
            data: ix::CloseSession {}.data(),
        }
    }

    pub fn finalize_ix(
        &self,
        authority: &Pubkey,
        p: &ProviderCtx,
        session: &Pubkey,
        rating: Option<u8>,
    ) -> Instruction {
        let s: agentspay::Session = self.account(session);
        let vault = if s.vault == Pubkey::default() {
            None
        } else {
            Some(s.vault)
        };
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::FinalizeSession {
                authority: *authority,
                session: *session,
                provider: p.provider,
                rent_payer: s.rent_payer,
                vault,
            }
            .to_account_metas(None),
            data: ix::FinalizeSession { rating }.data(),
        }
    }

    pub fn revoke_attestation_ix(&self, authority: &Pubkey, p: &ProviderCtx) -> Instruction {
        Instruction {
            program_id: PROGRAM_ID,
            accounts: acc::RevokeAttestation {
                authority: *authority,
                config: self.config,
                provider: p.provider,
                attestation: p.attestation,
            }
            .to_account_metas(None),
            data: ix::RevokeAttestation { reason: 1 }.data(),
        }
    }
}

pub const BPF_LOADER_UPGRADEABLE: Pubkey =
    anchor_lang::pubkey!("BPFLoaderUpgradeab1e11111111111111111111111");

pub fn programdata_address() -> Pubkey {
    Pubkey::find_program_address(&[PROGRAM_ID.as_ref()], &BPF_LOADER_UPGRADEABLE).0
}

/// LiteSVM deploys with no upgrade authority; set one, as `solana program deploy` would.
/// ProgramData metadata: u32 tag (3) | u64 slot | Option<Pubkey> (1 + 32).
pub fn set_upgrade_authority(svm: &mut LiteSVM, authority: &Pubkey) {
    let addr = programdata_address();
    let mut acct = svm.get_account(&addr).expect("programdata");
    acct.data[12] = 1;
    acct.data[13..45].copy_from_slice(authority.as_ref());
    svm.set_account(addr, acct).unwrap();
}

pub fn initialize_ix(admin: &Pubkey, args: InitializeArgs) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: acc::Initialize {
            admin: *admin,
            config: config_pda(),
            program: PROGRAM_ID,
            program_data: programdata_address(),
            system_program: SYSTEM_PROGRAM,
        }
        .to_account_metas(None),
        data: ix::Initialize { args }.data(),
    }
}

pub fn session_args(salt: u64, deposit: u64, price: u64, signer: Pubkey) -> OpenSessionArgs {
    OpenSessionArgs {
        salt,
        deposit,
        price_per_unit: price,
        grace_period: 900,
        authorized_signer: signer,
    }
}
