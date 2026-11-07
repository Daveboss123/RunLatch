//! Scripted LOCAL research workflow: actual constrained purchases, then fixture
//! service data, Node validation and separate owner attestation/unused return.
use super::*;
use std::io::Read;

fn fixture_bytes(name: &str) -> TestResult<Vec<u8>> {
    if !matches!(name, "valid-demo.json" | "invalid-demo.json") {
        return Err("Unknown controlled fixture".into());
    }
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/research")
        .join(name);
    let metadata = std::fs::symlink_metadata(&path)?;
    if !metadata.is_file() || metadata.len() > 1_048_576 {
        return Err("Provider fixture is not a bounded regular file".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(1_048_577)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1_048_576 {
        return Err("Provider fixture size changed".into());
    }
    Ok(bytes)
}

impl Harness {
    async fn paid_fixture_authorized(
        &mut self,
        capsule: &str,
        quote: &str,
        request_id: &str,
    ) -> TestResult<bool> {
        let canonical = self.view("get_quote", json!({"quote_id":quote})).await?;
        let amount = parse_amount(&canonical["terms"]["input"]["price"])?;
        let receiver: AccountId = canonical["terms"]["input"]["recipient_id"]
            .as_str()
            .ok_or("No canonical recipient")?
            .parse()?;
        let proposal = self.proposal(capsule, quote, request_id).await?;
        let result = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "workflow_purchase",
            )
            .await?;
        self.remember("workflow_purchase", &result);
        self.inspect_actions(
            "workflow_canonical_payment",
            &result,
            Some((&receiver, amount)),
            Some("resolve_purchase"),
        )
        .await?;
        let record = self.purchase(capsule, request_id).await?;
        self.assert_ledger(capsule).await?;
        match record["status"].as_str() {
            Some("SETTLED") => Ok(true),
            Some("SETTLEMENT_FAILED") => Ok(false),
            _ => Err("Workflow stopped: payment unproven/not settled; no service or retry".into()),
        }
    }

    async fn validate_produced_output(
        &self,
        id: &str,
        policy_hash: &str,
        available: bool,
    ) -> TestResult<Value> {
        let executable = std::env::var_os("RUNLATCH_NODE_EXECUTABLE")
            .ok_or("Node executable not configured for LOCAL workflow")?;
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()?;
        // Fixed reviewed script and primitive IDs/hash only, never provider URLs,
        // commands or signer material. Windows Node interop uses this same cwd.
        let mut command = tokio::process::Command::new(executable);
        command
            .current_dir(root)
            .args([
                "scripts/validation/validate-workflow-output.ts",
                id,
                policy_hash,
                if available { "artifact" } else { "missing" },
            ])
            .env_remove("RUNLATCH_AGENT_PRIVATE_KEY")
            .env_remove("AI_PROVIDER_API_KEY")
            .kill_on_drop(true);
        let output = tokio::time::timeout(std::time::Duration::from_secs(30), command.output())
            .await
            .map_err(|_| "LOCAL validator timeout; no retry/payment inference")??;
        if output.stdout.len() > 16384 || output.stderr.len() > 16384 {
            return Err("LOCAL validator output limit".into());
        }
        let payload: Value = serde_json::from_slice(&output.stdout)?;
        assert_eq!(payload["capsule_id"], id);
        assert_eq!(payload["expected_policy_hash"], policy_hash);
        assert_eq!(payload["attestation"], "UNATTESTED");
        assert_eq!(payload["requires_owner_signature"], true);
        assert_eq!(payload["grants_payment_authority"], false);
        let expected_exit = match payload["report"]["status"].as_str() {
            Some("VALIDATION_PASSED") => 0,
            Some("VALIDATION_FAILED") => 1,
            Some("VALIDATION_ERROR") => 2,
            _ => return Err("LOCAL validator did not provide a valid report".into()),
        };
        assert_eq!(output.status.code(), Some(expected_exit));
        Ok(payload)
    }

    pub(super) async fn workflow_checks(&mut self) -> TestResult<()> {
        let extractor = actor(&self.sandbox, "extractor.sandbox").await?;
        let credit = self.view("get_storage_requirements", json!({})).await?;
        for (id, recipient) in [
            ("extract", extractor.id.clone()),
            ("failure-fixture", "missing-extractor.sandbox".parse()?),
        ] {
            let result = self
                .call(
                    "register_provider",
                    json!({"provider_id":id,"publisher_id":extractor.id,
                "recipient_id":recipient}),
                    &self.operator,
                    parse_amount(&credit["provider_credit"])?,
                    "workflow_provider_register",
                )
                .await?;
            self.remember("workflow_provider_register", &result);
        }
        let allowance = NearToken::from_millinear(250);
        let (restricted, added) = super::scoped_key_cases::scoped_actor(
            &self.agent,
            &self.contract.0,
            &self.network,
            allowance,
        )
        .await?;
        self.remember("workflow_scoped_key", &added);
        let recovery = std::mem::replace(&mut self.agent, restricted);
        let parent = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/workflows");
        std::fs::create_dir_all(&parent)?;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_nanos()
            .to_string();
        let mut summaries = Vec::new();
        let mut facts = Vec::new();
        for scenario in ["pass", "output-fail", "payment-fail"] {
            let id = format!("wf-{scenario}-{nonce}");
            self.project_fixture(&id, 1000).await?;
            let directory = parent.join(&id);
            std::fs::create_dir(&directory)?; // Never overwrite an existing run.
            let policy = json!({"project_id":id,"project_revision":"1","task_id":id,"workflow_id":"research-fixture-v1","agent_id":self.agent.id,
                "agent_public_key":self.agent.public_key.to_string(),"budget":"1000","per_purchase_limit":"750","per_commitment_limit":"750","recurring_policy":"FORBIDDEN",
                "allowed_provider_ids":["search","extract","failure-fixture"],
                "allowed_service_ids":["search-batch","extract-batch"],"allowed_categories":["search","extraction"],
                "max_quantity":20,"approval_threshold":null,"expires_at_ns":self.expires_at_ns.to_string(),
                "validation_spec_hash":"b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b"});
            let result = self.call("create_capsule", json!({"capsule_id":id,"policy":policy,"storage_credit":credit["capsule_credit"]}),
                &self.operator, parse_amount(&credit["capsule_credit"])?.checked_add(1000).ok_or("Funding overflow")?, "workflow_capsule").await?;
            self.remember("workflow_capsule", &result);
            let search_quote = format!("{id}-search");
            self.quote(
                &search_quote,
                "search",
                &self.publisher.id.clone(),
                100,
                false,
            )
            .await?;
            let extract_quote = format!("{id}-extract");
            let failed_payment = scenario == "payment-fail";
            let recipient: AccountId = if failed_payment {
                "missing-extractor.sandbox".parse()?
            } else {
                extractor.id.clone()
            };
            let result = self.call("publish_quote", json!({"quote":{"quote_id":extract_quote,
                "provider_id":if failed_payment { "failure-fixture" } else { "extract" },"recipient_id":recipient,
                "service_id":"extract-batch","category":"extraction","resource_key":extract_quote,"quantity":20,"price":"200","asset":"near-native",
                "recurring":false,"expires_at_ns":self.expires_at_ns.to_string(),"previous_quote_id":null}}),
                &extractor, parse_amount(&credit["quote_credit"])?, "workflow_extract_quote").await?;
            self.remember("workflow_extract_quote", &result);
            assert!(
                self.paid_fixture_authorized(&id, &search_quote, "search-request")
                    .await?
            );
            // First controlled service is invoked only after proven payment.
            let search_data: Value = serde_json::from_slice(&fixture_bytes("valid-demo.json")?)?;
            assert_eq!(
                search_data["sources"]
                    .as_array()
                    .ok_or("Search fixture missing records")?
                    .len(),
                20
            );
            let extraction_paid = self
                .paid_fixture_authorized(&id, &extract_quote, "extract-request")
                .await?;
            assert_eq!(extraction_paid, !failed_payment);
            let mut extraction_calls = 0;
            if extraction_paid {
                // Controlled extraction fixture, not external merchant acceptance.
                let mut artifact: Value =
                    serde_json::from_slice(&fixture_bytes(if scenario == "output-fail" {
                        "invalid-demo.json"
                    } else {
                        "valid-demo.json"
                    })?)?;
                artifact["topic"] =
                    json!("LOCAL scripted research workflow fixture, not factual research");
                std::fs::write(
                    directory.join("research.json"),
                    serde_json::to_vec_pretty(&artifact)?,
                )?;
                extraction_calls += 1;
            } else {
                assert!(!directory.join("research.json").exists());
            }
            let capsule = self.assert_ledger(&id).await?;
            let policy_hash = capsule["policy_hash"].as_str().ok_or("No policy hash")?;
            let prepared = self
                .validate_produced_output(&id, policy_hash, extraction_paid)
                .await?;
            let expected_status = match scenario {
                "pass" => "VALIDATION_PASSED",
                "output-fail" => "VALIDATION_FAILED",
                _ => "VALIDATION_ERROR",
            };
            assert_eq!(prepared["report"]["status"], expected_status);
            if extraction_paid {
                let bytes = std::fs::read(directory.join("research.json"))?;
                let digest = near_api::CryptoHash::hash(&bytes);
                let hash: String = digest.0.iter().map(|byte| format!("{byte:02x}")).collect();
                assert_eq!(prepared["report"]["artifact_hash"], hash);
            } else {
                assert!(prepared["report"]["artifact_hash"].is_null());
            }
            let result = self
                .call(
                    "record_validation",
                    json!({"capsule_id":id,"expected_policy_hash":policy_hash,
                "report":prepared["report"]}),
                    &self.operator,
                    1,
                    "workflow_owner_attestation",
                )
                .await?;
            self.remember("workflow_owner_attestation", &result);
            self.inspect_actions(
                "workflow_attestation_no_quality_refund",
                &result,
                None,
                None,
            )
            .await?;
            // Separate explicit owner test-control action, never delegated to agent.
            let returned = self
                .call(
                    "close_capsule",
                    json!({"capsule_id":id}),
                    &self.operator,
                    1,
                    "workflow_unused_return",
                )
                .await?;
            let owner = self.operator.id.clone();
            self.inspect_actions(
                "workflow_unused_return_actions",
                &returned,
                Some((&owner, if failed_payment { 900 } else { 700 })),
                Some("resolve_owner_refund"),
            )
            .await?;
            let final_capsule = self.assert_ledger(&id).await?;
            assert_eq!(
                final_capsule["spent"],
                if failed_payment { "100" } else { "300" }
            );
            assert_eq!(final_capsule["reserved"], "0");
            let receipt = self
                .view(
                    "get_receipt",
                    json!({"capsule_id":id,"request_id":"extract-request"}),
                )
                .await?;
            assert_eq!(
                receipt["purchase"]["status"],
                if failed_payment {
                    "SETTLEMENT_FAILED"
                } else {
                    "SETTLED"
                }
            );
            assert_eq!(receipt["outcome"]["report"]["status"], expected_status);
            assert_eq!(receipt["outcome"]["attested_by"], self.operator.id.as_str());
            let purchases = self
                .view(
                    "get_purchases",
                    json!({"capsule_id":id,"from_index":0,"limit":20}),
                )
                .await?;
            let mut provider_spend = std::collections::BTreeMap::<String, u128>::new();
            for purchase in purchases
                .as_array()
                .ok_or("Missing workflow purchase list")?
            {
                if purchase["status"] == "SETTLED" {
                    let terms = &purchase["canonical_quote"]["input"];
                    let provider = terms["provider_id"]
                        .as_str()
                        .ok_or("Missing provider")?
                        .to_string();
                    let entry = provider_spend.entry(provider).or_default();
                    *entry = entry
                        .checked_add(parse_amount(&terms["price"])?)
                        .ok_or("Provider spend overflow")?;
                }
            }
            facts.push(json!({"capsule_id":id,"contract_id":self.contract.0,"source":"LOCAL_NEAR_SANDBOX",
                "network_tag":receipt["network_tag"],"workflow_id":final_capsule["policy"]["workflow_id"],
                "criteria_hash":receipt["outcome"]["report"]["criteria_hash"],
                "validator_id":receipt["outcome"]["report"]["validator_id"],"validator_version":receipt["outcome"]["report"]["validator_version"],
                "asset":"near-native","capsule_status":final_capsule["status"],"validation_status":expected_status,
                "attestation":"OWNER_ATTESTED","recorded_at_ns":receipt["outcome"]["recorded_at_ns"],
                "budget":final_capsule["policy"]["budget"],"allocated":final_capsule["allocated"],"spent":final_capsule["spent"],
                "reserved":final_capsule["reserved"],"returned":final_capsule["returned"],"storage_credit":final_capsule["storage_credit"],
                "provider_spend":provider_spend.iter().map(|(provider,spent)|json!({"provider_id":provider,"spent":spent.to_string()})).collect::<Vec<_>>()}));
            std::fs::write(
                directory.join("receipt.json"),
                serde_json::to_vec_pretty(
                    &json!({"source":"LOCAL_NEAR_SANDBOX_SCRIPTED_WORKFLOW",
                "public_testnet":false,"scripted":true,"ai_model_used":false,"service_calls":{"search":1,"extraction":extraction_calls},
                "owner_actions":"SEPARATE_LOCAL_TEST_CONTROLLER","receipt":receipt}),
                )?,
            )?;
            summaries.push(json!({"capsule_id":id,"scenario":scenario,"settled_spend":final_capsule["spent"],
                "validation_status":expected_status,"search_service_calls":1,"extraction_service_calls":extraction_calls}));
        }
        std::fs::write(
            parent.join("latest.json"),
            serde_json::to_vec_pretty(&json!({"source":"LOCAL_NEAR_SANDBOX_SCRIPTED_WORKFLOW",
             "result":"WORKFLOW_CHECKS_PASSED","public_testnet":false,"runs":summaries,"facts":facts,"evidence":self.evidence,
            "restricted_receiver":self.contract.0,"restricted_methods":["submit_purchase"],
            "gas_allowance":allowance.as_yoctonear().to_string(),"recovery_retained":true,"broader_purchase_fallback":false}))?,
        )?;
        let executable = std::env::var_os("RUNLATCH_NODE_EXECUTABLE")
            .ok_or("Node unavailable for LOCAL cost analysis")?;
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()?;
        let mut command = tokio::process::Command::new(executable);
        command
            .current_dir(root)
            .arg("scripts/workflow/analyze-local.ts")
            .env_remove("RUNLATCH_AGENT_PRIVATE_KEY")
            .env_remove("AI_PROVIDER_API_KEY")
            .kill_on_drop(true);
        let output = tokio::time::timeout(std::time::Duration::from_secs(30), command.output())
            .await
            .map_err(|_| "LOCAL cost analysis timeout")??;
        assert!(output.status.success(), "LOCAL analysis did not complete");
        if output.stdout.len() > 16384 {
            return Err("LOCAL analysis output limit".into());
        }
        let analysis: Value = serde_json::from_slice(&output.stdout)?;
        assert_eq!(
            analysis["cohorts"]
                .as_array()
                .ok_or("Missing cohort")?
                .len(),
            1
        );
        assert_eq!(
            analysis["cohorts"][0]["cost_per_success"]["numerator"],
            "700"
        );
        assert_eq!(
            analysis["cohorts"][0]["cost_per_success"]["denominator"],
            "1"
        );
        assert_eq!(analysis["cohorts"][0]["completed_runs"], 3);
        assert_eq!(
            analysis["source"],
            "DERIVED_FROM_INPUT_FACTS_NOT_INDEPENDENT_CHAIN_PROOF"
        );
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"source":"LOCAL_NEAR_SANDBOX_SCRIPTED_WORKFLOW",
            "result":"WORKFLOW_CHECKS_PASSED","public_testnet":false,"runs":summaries,"evidence_file":".local/workflows/latest.json"}))?
        );
        self.agent = recovery;
        Ok(())
    }
}
