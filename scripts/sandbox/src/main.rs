//! Actual LOCAL NEAR Sandbox checks, not public testnet or mocked settlement.
//! Keys are generated in memory. Never print a signer/secret or accept public RPC.

#[cfg(not(target_os = "linux"))]
compile_error!("Run this harness in the approved Linux Sandbox environment");

use near_api::types::{TxExecutionStatus, transaction::result::ExecutionFinalResult};
use near_api::{
    Account, AccountId, Chain, Contract, NearGas, NearToken, NetworkConfig, PublicKey, Reference,
    Signer, Transaction,
};
use near_sandbox::Sandbox;
use serde_json::{Value, json};
use std::{
    error::Error,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

type TestResult<T> = Result<T, Box<dyn Error>>;

mod agency_cases;
mod fault_cases;
mod maximum_cases;
mod outcome_cases;
mod project_cases;
mod runtime_cases;
mod scoped_diagnostic;
mod scoped_key_cases;
mod workflow_cases;

struct Actor {
    id: AccountId,
    signer: Arc<Signer>,
    public_key: PublicKey,
}

async fn actor(sandbox: &Sandbox, name: &str) -> TestResult<Actor> {
    funded_actor(sandbox, name, NearToken::from_near(100)).await
}

async fn funded_actor(
    sandbox: &Sandbox,
    name: &str,
    initial_balance: NearToken,
) -> TestResult<Actor> {
    let id: AccountId = name.parse()?;
    let secret = near_api::signer::generate_secret_key()?;
    let public_key = secret.public_key();
    // near-sandbox uses AccountId v3; near-api0.8.7 uses v2. Convert via
    // validated text at the development boundary, not via a dependency downgrade.
    sandbox
        .create_account(id.as_str().parse()?)
        .initial_balance(initial_balance)
        .public_key(public_key.to_string())
        .send()
        .await?;
    Ok(Actor {
        id,
        signer: Signer::from_secret_key(secret)?,
        public_key,
    })
}

struct Harness {
    sandbox: Sandbox,
    network: NetworkConfig,
    contract: Contract,
    operator: Actor,
    agent: Actor,
    publisher: Actor,
    evidence: Vec<Value>,
    expires_at_ns: u64,
}

impl Harness {
    async fn new() -> TestResult<Self> {
        Self::with_artifact(false).await
    }

    async fn with_artifact(callback_fault: bool) -> TestResult<Self> {
        Self::configured_artifact(callback_fault, false).await
    }

    async fn configured_artifact(callback_fault: bool, maximum: bool) -> TestResult<Self> {
        let sandbox = Sandbox::start_sandbox_with_version("2.14.0").await?;
        if !sandbox.rpc_addr.starts_with("http://127.0.0.1:") {
            return Err("Sandbox is not loopback-only".into());
        }
        let network =
            NetworkConfig::from_rpc_url("runlatch-local-sandbox", sandbox.rpc_addr.parse()?);
        let name = |initial: char, ordinary: &str| {
            if maximum {
                format!("{}.sandbox", initial.to_string().repeat(56))
            } else {
                ordinary.to_string()
            }
        };
        // Maximum mode pre-funds64 schema2 capsules (~168 NEAR of LOCAL storage),
        // so100 LOCAL NEAR is no longer enough. Not public/testnet/user funding.
        let operator = funded_actor(
            &sandbox,
            &name('o', "operator.sandbox"),
            NearToken::from_near(if maximum { 250 } else { 100 }),
        )
        .await?;
        let agent = actor(&sandbox, &name('a', "agent.sandbox")).await?;
        let publisher = actor(&sandbox, &name('p', "publisher.sandbox")).await?;
        let deployment = actor(&sandbox, &name('c', "contract.sandbox")).await?;
        let artifacts = PathBuf::from(std::env::var_os("HOME").ok_or("Linux HOME unavailable")?)
            .join(".cache/runlatch-artifacts");
        let wasm = artifacts
            .join(if callback_fault {
                "callback-fault"
            } else {
                "production"
            })
            .join("runlatch_contract.wasm");
        let bytes = std::fs::read(wasm)?;
        if callback_fault {
            let normal = std::fs::read(artifacts.join("production/runlatch_contract.wasm"))?;
            if bytes == normal {
                return Err("Fault artifact must differ from normal WASM".into());
            }
        }
        let artifact_hash = near_api::CryptoHash::hash(&bytes).to_string();
        let result = Contract::deploy(deployment.id.clone())
            .use_code(bytes)
            .with_init_call("init", json!({"operator_id":operator.id}))?
            .with_signer(deployment.signer)
            .wait_until(TxExecutionStatus::Final)
            .send_to(&network)
            .await?;
        let result = result.into_full().ok_or("Deployment returned pending")?;
        if !result.is_success() {
            return Err(format!("LOCAL deployment failed: {:?}", result.failures()).into());
        }
        let expires_at_ns =
            u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos())?
                .checked_add(3_600_000_000_000)
                .ok_or("Expiry overflow")?;
        let mut harness = Self {
            sandbox,
            network,
            contract: Contract(deployment.id),
            operator,
            agent,
            publisher,
            evidence: vec![
                json!({"case":"deploy_local","source":"LOCAL_NEAR_SANDBOX","artifact_hash_base58":artifact_hash,
                "build_kind":if callback_fault { "LOCAL_CALLBACK_STARVATION_FAULT_NOT_FOR_DEPLOYMENT" } else { "DEFAULT_CONTRACT_BUILD" },
                "transaction_id":result.outcome().transaction_hash.to_string(),"gas_burnt":result.total_gas_burnt.as_gas().to_string()}),
            ],
            expires_at_ns,
        };
        if maximum {
            return Ok(harness);
        }
        let credit = harness.view("get_storage_requirements", json!({})).await?;
        let publisher_id = harness.publisher.id.clone();
        let registered = harness.call("register_provider", json!({"provider_id":"search","publisher_id":publisher_id,"recipient_id":publisher_id}),
            &harness.operator, parse_amount(&credit["provider_credit"])?, "register_provider").await?;
        harness.remember("register_provider", &registered);
        Ok(harness)
    }

    async fn view(&self, method: &str, args: Value) -> TestResult<Value> {
        Ok(self
            .contract
            .call_function(method, args)
            .read_only::<Value>()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data)
    }

    async fn call(
        &self,
        method: &str,
        args: Value,
        sender: &Actor,
        deposit: u128,
        label: &str,
    ) -> TestResult<ExecutionFinalResult> {
        let result = self
            .send(method, args, sender, deposit, NearGas::from_tgas(100))
            .await
            .map_err(|error| format!("{label} LOCAL call transport/signing failure: {error}"))?;
        if !result.is_success() {
            return Err(format!("{label} failed on LOCAL node: {:?}", result.failures()).into());
        }
        Ok(result)
    }

    // Only this harness chooses test gas. Contract purchase arguments cannot.
    async fn send(
        &self,
        method: &str,
        args: Value,
        sender: &Actor,
        deposit: u128,
        gas: NearGas,
    ) -> TestResult<ExecutionFinalResult> {
        let result = self
            .contract
            .call_function(method, args)
            .transaction()
            .gas(gas)
            .deposit(NearToken::from_yoctonear(deposit))
            .with_signer(sender.id.clone(), sender.signer.clone())
            .wait_until(TxExecutionStatus::Final)
            .send_to(&self.network)
            .await?
            .into_full()
            .ok_or("Call returned pending despite FINAL")?;
        Ok(result)
    }

    fn remember(&mut self, label: &str, result: &ExecutionFinalResult) {
        self.evidence.push(json!({"case":label,"source":"LOCAL_NEAR_SANDBOX","transaction_id":result.outcome().transaction_hash.to_string(),
            "gas_burnt":result.total_gas_burnt.as_gas().to_string(),"receipt_count":result.receipt_outcomes().len(),
            "receipt_failure_count":result.receipt_failures().len(),
            "receipts":result.receipt_outcomes().iter().map(|r|json!({"receipt_id":r.transaction_hash.to_string(),
                "block_hash":r.block_hash.to_string(),"executor_id":r.executor_id.to_string(),
                "gas_burnt":r.gas_burnt.as_gas().to_string(),"succeeded":r.is_success()})).collect::<Vec<_>>()}));
    }

    async fn inspect_actions(
        &mut self,
        label: &str,
        result: &ExecutionFinalResult,
        expected_transfer: Option<(&AccountId, u128)>,
        expected_callback: Option<&str>,
    ) -> TestResult<()> {
        let mut transfers = Vec::new();
        let mut callbacks = Vec::new();
        for outcome in result.receipt_outcomes() {
            let receipt = Transaction::receipt(outcome.transaction_hash)
                .fetch_from(&self.network)
                .await?;
            let receipt = serde_json::to_value(receipt)?;
            if receipt["predecessor_id"] != self.contract.0.as_str() {
                continue;
            }
            if let Some(actions) = receipt["receipt"]["Action"]["actions"].as_array() {
                for action in actions {
                    if let Some(transfer) = action.get("Transfer") {
                        transfers.push((
                            receipt["receiver_id"]
                                .as_str()
                                .ok_or("Missing receipt receiver")?
                                .to_string(),
                            parse_amount(&transfer["deposit"])?,
                        ));
                    }
                    if let Some(call) = action.get("FunctionCall") {
                        let method = call["method_name"]
                            .as_str()
                            .ok_or("Missing callback method")?;
                        if method.starts_with("resolve_") {
                            assert_eq!(receipt["receiver_id"], self.contract.0.as_str());
                            assert_eq!(
                                receipt["receipt"]["Action"]["input_data_ids"]
                                    .as_array()
                                    .ok_or("Missing callback data")?
                                    .len(),
                                1
                            );
                            // Gas in ActionView is a decimal string, unlike counts.
                            let assigned = parse_amount(&call["gas"])?;
                            assert_eq!(assigned, 25_000_000_000_000);
                            assert!(u128::from(outcome.gas_burnt.as_gas()) < assigned);
                            assert!(
                                outcome.is_success(),
                                "Healthy callback must actually succeed"
                            );
                            callbacks.push(json!({"method":method,"receipt_id":outcome.transaction_hash.to_string(),
                                "gas_assigned":assigned.to_string(),"gas_burnt":outcome.gas_burnt.as_gas().to_string()}));
                        }
                    }
                }
            }
        }
        let expected = expected_transfer
            .map(|(recipient, amount)| (recipient.to_string(), amount))
            .into_iter()
            .collect::<Vec<_>>();
        assert_eq!(
            transfers, expected,
            "Unexpected contract transfer in {label}"
        );
        assert_eq!(
            callbacks.len(),
            usize::from(expected_callback.is_some()),
            "Unexpected callbacks in {label}"
        );
        if let Some(method) = expected_callback {
            assert_eq!(callbacks[0]["method"], method);
        }
        self.evidence.push(json!({"case":label,"source":"LOCAL_NEAR_SANDBOX_ACTION_INSPECTION",
            "transfers":transfers.iter().map(|(receiver,amount)|json!({"receiver":receiver,"amount":amount.to_string()})).collect::<Vec<_>>(),
            "callbacks":callbacks}));
        Ok(())
    }

    async fn assert_ledger(&mut self, id: &str) -> TestResult<Value> {
        let block_hash = Chain::block_hash()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?;
        let view = |method: &str, args| {
            self.contract
                .call_function(method, args)
                .read_only::<Value>()
                .at(Reference::AtBlockHash(block_hash))
        };
        let capsule = view("get_capsule", json!({"capsule_id":id}))
            .fetch_from(&self.network)
            .await?;
        assert_eq!(capsule.block_hash, block_hash);
        let capsule = capsule.data;
        let allocated = parse_amount(&capsule["allocated"])?;
        let spent = parse_amount(&capsule["spent"])?;
        let reserved = parse_amount(&capsule["reserved"])?;
        let committed_future = parse_amount(&capsule["committed_future"])?;
        let returned = parse_amount(&capsule["returned"])?;
        let original = parse_amount(&capsule["policy"]["budget"])?;
        assert!(
            spent
                .checked_add(reserved)
                .and_then(|n| n.checked_add(committed_future))
                .ok_or("Ledger overflow")?
                <= allocated
        );
        assert!(allocated <= original);
        assert_eq!(allocated.checked_add(returned), Some(original));
        let available = view("get_available", json!({"capsule_id":id}))
            .fetch_from(&self.network)
            .await?;
        assert_eq!(available.block_hash, block_hash);
        assert_eq!(parse_amount(&available.data)?, allocated - spent - reserved);
        let mut pending_sum = 0u128;
        let mut settled_sum = 0u128;
        let mut future_sum = 0u128;
        let mut request_count = 0;
        for from_index in [0, 20] {
            let records = view(
                "get_purchases",
                json!({"capsule_id":id,"from_index":from_index,"limit":20}),
            )
            .fetch_from(&self.network)
            .await?;
            assert_eq!(records.block_hash, block_hash);
            for record in records.data.as_array().ok_or("Expected purchase page")? {
                future_sum = future_sum
                    .checked_add(parse_amount(&record["committed_future_amount"])?)
                    .ok_or("Commitment overflow")?;
                request_count += 1;
                if record["status"] == "SETTLEMENT_PENDING" {
                    pending_sum = pending_sum
                        .checked_add(parse_amount(&record["reserved_amount"])?)
                        .ok_or("Reservation overflow")?;
                } else {
                    assert_eq!(record["reserved_amount"], "0");
                }
                if record["status"] == "SETTLED" {
                    settled_sum = settled_sum
                        .checked_add(parse_amount(&record["canonical_quote"]["input"]["price"])?)
                        .ok_or("Spend overflow")?;
                }
            }
        }
        if capsule["owner_refund"]["status"] == "PENDING" {
            pending_sum = pending_sum
                .checked_add(parse_amount(&capsule["owner_refund"]["amount"])?)
                .ok_or("Refund overflow")?;
        }
        assert_eq!(pending_sum, reserved);
        assert_eq!(settled_sum, spent);
        assert_eq!(future_sum, committed_future);
        let financials = view("get_financials", json!({"capsule_id":id}))
            .fetch_from(&self.network)
            .await?;
        assert_eq!(financials.block_hash, block_hash);
        assert_eq!(
            parse_amount(&financials.data["available_to_commit"])?,
            allocated - spent - reserved - committed_future
        );
        assert_eq!(
            request_count,
            capsule["request_ids"]
                .as_array()
                .ok_or("Expected request index")?
                .len()
        );
        self.evidence.push(json!({"case":"ledger_snapshot","capsule_id":id,"source":"LOCAL_NEAR_SANDBOX",
            "block_hash":block_hash.to_string(),"allocated":allocated.to_string(),"spent":spent.to_string(),
            "reserved":reserved.to_string(),"returned":returned.to_string(),"available":available.data,"request_count":request_count}));
        Ok(capsule)
    }

    async fn balance(&self, id: &AccountId) -> TestResult<u128> {
        Ok(Account(id.clone())
            .view()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .amount
            .as_yoctonear())
    }

    async fn capsule(
        &mut self,
        id: &str,
        providers: Vec<&str>,
        threshold: Option<u128>,
    ) -> TestResult<()> {
        self.project_fixture(id, 1000).await?;
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let credit = parse_amount(&credit["capsule_credit"])?;
        let result = self.call("create_capsule", json!({"capsule_id":id,"storage_credit":credit.to_string(),"policy":{
            "project_id":id,"project_revision":"1",
            "task_id":id,"workflow_id":"research-fixture-v1","agent_id":self.agent.id,"agent_public_key":self.agent.public_key.to_string(),
            "budget":"1000","per_purchase_limit":"750","per_commitment_limit":"750","recurring_policy":"FORBIDDEN","allowed_provider_ids":providers,"allowed_service_ids":["search-batch"],
            "allowed_categories":["search"],"max_quantity":20,"approval_threshold":threshold.map(|v|v.to_string()),
            "expires_at_ns":self.expires_at_ns.to_string(),"validation_spec_hash":"b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b"}}),
            &self.operator, credit.checked_add(1000).ok_or("Deposit overflow")?, "create_capsule").await?;
        self.remember("create_capsule", &result);
        Ok(())
    }

    async fn quote(
        &mut self,
        id: &str,
        provider: &str,
        recipient: &AccountId,
        price: u128,
        recurring: bool,
    ) -> TestResult<()> {
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let result = self.call("publish_quote", json!({"quote":{"quote_id":id,"provider_id":provider,"recipient_id":recipient,
            "service_id":"search-batch","category":"search","resource_key":id,"quantity":20,"price":price.to_string(),"asset":"near-native",
            "recurring":recurring,"expires_at_ns":self.expires_at_ns.to_string(),"previous_quote_id":null}}),
            &self.publisher, parse_amount(&credit["quote_credit"])?, "publish_quote").await?;
        self.remember("publish_quote", &result);
        Ok(())
    }

    async fn proposal(&self, capsule: &str, quote: &str, request: &str) -> TestResult<Value> {
        let quote_record = self.view("get_quote", json!({"quote_id":quote})).await?;
        let capsule_record = self
            .view("get_capsule", json!({"capsule_id":capsule}))
            .await?;
        Ok(
            json!({"capsule_id":capsule,"quote_id":quote,"request_id":request,"expected_quote_hash":quote_record["quote_hash"],
                "project_id":capsule_record["policy"]["project_id"],"project_revision":capsule_record["policy"]["project_revision"]}),
        )
    }

    async fn purchase(&self, capsule: &str, request: &str) -> TestResult<Value> {
        self.view(
            "get_purchase",
            json!({"capsule_id":capsule,"request_id":request}),
        )
        .await
    }

    async fn project_fixture(&mut self, id: &str, budget: u128) -> TestResult<()> {
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let result = self.call("create_project", json!({"project":{"project_id":id,
            "organisation_id":"local-regression","client_ref":"internal-work-order","budget_ceiling":budget.to_string(),
            "expires_at_ns":self.expires_at_ns.to_string(),"outcome_definition_hash":"03".repeat(32)}}),
            &self.operator, parse_amount(&credit["project_credit"])?, "project_fixture_creation").await?;
        self.remember("project_fixture_creation", &result);
        Ok(())
    }

    async fn run(&mut self) -> TestResult<()> {
        let recipient = self.publisher.id.clone();
        self.capsule("happy-run", vec!["search"], None).await?;
        self.quote("happy-quote", "search", &recipient, 100, false)
            .await?;
        let proposal = self
            .proposal("happy-run", "happy-quote", "happy-request")
            .await?;
        let before = self.balance(&recipient).await?;
        let result = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "successful_purchase",
            )
            .await?;
        self.remember("successful_purchase", &result);
        assert_eq!(
            self.balance(&recipient).await?,
            before.checked_add(100).ok_or("Balance overflow")?
        );
        self.inspect_actions(
            "successful_purchase_actions",
            &result,
            Some((&recipient, 100)),
            Some("resolve_purchase"),
        )
        .await?;
        self.assert_ledger("happy-run").await?;
        assert_eq!(
            self.purchase("happy-run", "happy-request").await?["status"],
            "SETTLED"
        );
        let cap = self
            .view("get_capsule", json!({"capsule_id":"happy-run"}))
            .await?;
        assert_eq!(cap["spent"], "100");
        assert_eq!(cap["reserved"], "0");

        let replay = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "replay_denied",
            )
            .await?;
        let replay_value: Value = replay.clone().json()?;
        assert_eq!(replay_value["decision"], "DENIED");
        assert_eq!(replay_value["reason_codes"][0], "REQUEST_REPLAY");
        self.remember("replay_denied", &replay);
        self.inspect_actions("replay_no_transfer", &replay, None, None)
            .await?;
        assert_eq!(
            self.purchase("happy-run", "happy-request").await?["status"],
            "SETTLED"
        );

        self.quote("tamper-quote", "search", &recipient, 100, false)
            .await?;
        let mut tampered = self
            .proposal("happy-run", "tamper-quote", "tamper-request")
            .await?;
        tampered["expected_quote_hash"] = Value::String("00".repeat(32));
        let denied = self
            .call(
                "submit_purchase",
                json!({"proposal":tampered}),
                &self.agent,
                0,
                "tampered_terms_denied",
            )
            .await?;
        self.remember("tampered_terms_denied", &denied);
        self.inspect_actions("tamper_no_transfer", &denied, None, None)
            .await?;
        self.assert_ledger("happy-run").await?;
        assert_eq!(
            self.purchase("happy-run", "tamper-request").await?["status"],
            "DENIED"
        );

        self.capsule("approval-run", vec!["search"], Some(99))
            .await?;
        self.quote("approval-quote", "search", &recipient, 100, false)
            .await?;
        let proposal = self
            .proposal("approval-run", "approval-quote", "approval-request")
            .await?;
        let pending_call = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "approval_pending",
            )
            .await?;
        self.remember("approval_pending", &pending_call);
        self.inspect_actions("pending_approval_no_transfer", &pending_call, None, None)
            .await?;
        self.assert_ledger("approval-run").await?;
        let pending = self.purchase("approval-run", "approval-request").await?;
        assert_eq!(pending["status"], "APPROVAL_PENDING");
        let cap = self
            .view("get_capsule", json!({"capsule_id":"approval-run"}))
            .await?;
        assert_eq!(cap["reserved"], "0");
        let approved = self.call("approve_purchase", json!({"capsule_id":"approval-run","request_id":"approval-request", "expected_request_hash":pending["request_hash"]}),
            &self.operator, 1, "exact_owner_approval").await?;
        self.remember("exact_owner_approval", &approved);
        self.inspect_actions(
            "approved_transfer_actions",
            &approved,
            Some((&recipient, 100)),
            Some("resolve_purchase"),
        )
        .await?;
        self.assert_ledger("approval-run").await?;
        assert_eq!(
            self.purchase("approval-run", "approval-request").await?["status"],
            "SETTLED"
        );

        let revoked = self
            .call(
                "revoke_capsule",
                json!({"capsule_id":"happy-run"}),
                &self.operator,
                1,
                "revoke",
            )
            .await?;
        self.remember("revoke", &revoked);
        let closed = self
            .call(
                "close_capsule",
                json!({"capsule_id":"happy-run"}),
                &self.operator,
                1,
                "unused_funds_return",
            )
            .await?;
        self.remember("unused_funds_return", &closed);
        let owner = self.operator.id.clone();
        self.inspect_actions(
            "unused_return_actions",
            &closed,
            Some((&owner, 900)),
            Some("resolve_owner_refund"),
        )
        .await?;
        self.assert_ledger("happy-run").await?;
        let cap = self
            .view("get_capsule", json!({"capsule_id":"happy-run"}))
            .await?;
        assert_eq!(cap["status"], "CLOSED");
        assert_eq!(cap["spent"], "100");
        assert_eq!(cap["allocated"], "100");
        assert_eq!(cap["returned"], "900");

        // Explicit LOCAL fault fixture: publisher exists, its pinned named
        // recipient does not. Never claim this is a real vendor/testnet failure.
        let missing: AccountId = "missing-recipient.sandbox".parse()?;
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let registered = self.call("register_provider", json!({"provider_id":"faulty","publisher_id":self.publisher.id,"recipient_id":missing}),
            &self.operator, parse_amount(&credit["provider_credit"])?, "fault_fixture_register").await?;
        self.remember("fault_fixture_register", &registered);
        self.capsule("failed-run", vec!["faulty"], None).await?;
        self.quote("failed-quote", "faulty", &missing, 100, false)
            .await?;
        let proposal = self
            .proposal("failed-run", "failed-quote", "failed-request")
            .await?;
        let failed = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "failed_transfer_reconciled",
            )
            .await?;
        self.remember("failed_transfer_reconciled", &failed);
        self.inspect_actions(
            "failed_transfer_actions",
            &failed,
            Some((&missing, 100)),
            Some("resolve_purchase"),
        )
        .await?;
        self.assert_ledger("failed-run").await?;
        assert_eq!(
            self.purchase("failed-run", "failed-request").await?["status"],
            "SETTLEMENT_FAILED"
        );
        assert!(
            !failed.receipt_failures().is_empty(),
            "Expected actual failed native-transfer receipt"
        );
        let cap = self
            .view("get_capsule", json!({"capsule_id":"failed-run"}))
            .await?;
        assert_eq!(cap["spent"], "0");
        assert_eq!(cap["reserved"], "0");
        assert_eq!(
            self.view("get_quote", json!({"quote_id":"failed-quote"}))
                .await?["consumed"],
            true
        );

        self.extra_runtime_checks().await?;
        self.outcome_checks().await?;
        let report = json!({"environment":"LOCAL_NEAR_SANDBOX", "node_version":"2.14.0",
            "public_testnet":false,"real_funds":false,"result":"CHECKS_PASSED","evidence":self.evidence});
        // Only generated LOCAL test evidence; no actor key, signer or input artifact.
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("latest.json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        let callbacks: Vec<_> = self
            .evidence
            .iter()
            .filter_map(|e| e["callbacks"].as_array())
            .flat_map(|calls| calls.iter())
            .cloned()
            .collect();
        let measurements: Vec<_> = self
            .evidence
            .iter()
            .filter(|e| e["case"] == "funded_request_history_storage")
            .cloned()
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"environment":"LOCAL_NEAR_SANDBOX",
            "node_version":"2.14.0","public_testnet":false,"real_funds":false,"result":"CHECKS_PASSED",
            "evidence_file":".local/sandbox/latest.json","evidence_entry_count":self.evidence.len(),
            "measured_callbacks":callbacks,"storage_measurements":measurements}))?
        );
        Ok(())
    }
}

fn parse_amount(value: &Value) -> TestResult<u128> {
    Ok(value
        .as_str()
        .ok_or("Amount must be a decimal string")?
        .parse()?)
}

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() -> TestResult<()> {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "all".into());
    if !matches!(
        mode.as_str(),
        "all"
            | "core"
            | "fault"
            | "maximum"
            | "outcome"
            | "scoped"
            | "workflow"
            | "projects"
            | "agency"
            | "diagnose-scoped"
    ) {
        return Err(
            "Expected all, core, fault, maximum, outcome, scoped or workflow LOCAL test mode"
                .into(),
        );
    }
    if mode == "all" || mode == "core" {
        let mut harness = Harness::new().await?;
        harness.run().await?;
    }
    if mode == "all" || mode == "fault" {
        let mut fault = Harness::with_artifact(true).await?;
        fault.callback_fault_checks().await?;
    }
    if mode == "all" || mode == "maximum" {
        let mut maximum = Harness::configured_artifact(false, true).await?;
        maximum.maximum_state_checks().await?;
    }
    if mode == "outcome" {
        let mut harness = Harness::new().await?;
        harness.outcome_checks().await?;
    }
    if mode == "all" || mode == "scoped" {
        let mut harness = Harness::new().await?;
        harness.scoped_key_checks().await?;
    }
    if mode == "all" || mode == "workflow" {
        let mut harness = Harness::new().await?;
        harness.workflow_checks().await?;
    }
    if mode == "all" || mode == "projects" {
        let mut harness = Harness::new().await?;
        harness.project_commitment_checks().await?;
    }
    if mode == "all" || mode == "agency" {
        let mut harness = Harness::configured_artifact(false, true)
            .await
            .map_err(|error| format!("Agency LOCAL fresh harness setup failed: {error}"))?;
        harness.agency_checks().await?;
    }
    if mode == "diagnose-scoped" {
        let mut harness = Harness::new().await?;
        harness.diagnose_scoped_key().await?;
    }
    Ok(())
}
