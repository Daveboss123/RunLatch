//! Scripted fictional agency vertical slice. LOCAL native payments, fixture delivery,
//! offline checks, separate owner test actions and selected canonical report export.
use super::*;

const CRITERIA: &str = "57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9";

impl Harness {
    async fn agency_scoped_owner_refused(&mut self, method: &str, args: Value) -> TestResult<()> {
        // A restricted key is rejected by protocol before an owner method can run;
        // it cannot yield a contract panic/denial receipt. Never retry with recovery.
        let rejected = self
            .send(method, args, &self.agent, 1, NearGas::from_tgas(100))
            .await;
        let error = rejected.expect_err("Scoped agent unexpectedly invoked owner action");
        let detail = format!("{error:?}");
        assert!(
            detail.contains("InvalidTransaction")
                || detail.contains("MethodNameMismatch")
                || detail.contains("DepositWithFunctionCall"),
            "Unexpected scoped-owner rejection: {detail}"
        );
        self.evidence.push(json!({"case":"agency_scoped_owner_action_refused","method":method,
            "source":"LOCAL_PROTOCOL_REJECTION_NOT_PERSISTED_CONTRACT_DENIAL","specific_reason_available":false,
            "broader_signer_retry":false}));
        Ok(())
    }

    async fn agency_node(
        &self,
        script: &str,
        args: &[&str],
        expected_exit: i32,
    ) -> TestResult<Value> {
        // Only reviewed constant scripts and validated generated primitive arguments.
        if !matches!(
            script,
            "scripts/validation/validate-resource-output.ts"
                | "scripts/workflow/export-project-local.ts"
                | "scripts/web/inspect-local-observation.ts"
        ) {
            return Err("Unsupported LOCAL agency tool".into());
        }
        let executable = std::env::var_os("RUNLATCH_NODE_EXECUTABLE").ok_or("Node unavailable")?;
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()?;
        let mut command = tokio::process::Command::new(executable);
        command
            .current_dir(root)
            .arg(script)
            .args(args)
            .env_remove("RUNLATCH_AGENT_PRIVATE_KEY")
            .env_remove("AI_PROVIDER_API_KEY")
            .kill_on_drop(true);
        let output = tokio::time::timeout(std::time::Duration::from_secs(30), command.output())
            .await
            .map_err(|_| "LOCAL agency tool timeout; no payment retry")??;
        if output.stdout.len() > 1_048_576 || output.stderr.len() > 16384 {
            return Err("Agency tool output limit".into());
        }
        assert_eq!(
            output.status.code(),
            Some(expected_exit),
            "LOCAL agency tool failed: {script}"
        );
        Ok(serde_json::from_slice(&output.stdout)?)
    }

    async fn agency_quote(
        &mut self,
        id: &str,
        resource: &str,
        provider: &str,
        recipient: &AccountId,
        price: u128,
        recurring: bool,
    ) -> TestResult<()> {
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let commercial = if recurring {
            json!({"billing_model":"FIXED_RECURRING","cadence":"MONTHLY","period_charge":price.to_string(),"required_periods":12,
                "mandatory_fees":"0","known_taxes":"0","setup_fees":"0","auto_renew":false,
                "cancellation_terms_hash":"03".repeat(32),"source_evidence_hash":"04".repeat(32),
                "future_obligation_contingent_on_initial_payment":true})
        } else {
            Value::Null
        };
        let result = self.call("publish_quote", json!({"quote":{"quote_id":id,"provider_id":provider,"recipient_id":recipient,
            "service_id":if provider=="hosting-fixture" {"hosting-plan"} else {"database-plan"},
            "category":if provider=="hosting-fixture" {"hosting"} else {"database"},"resource_key":resource,"quantity":1,
            "price":price.to_string(),"asset":"near-native","recurring":recurring,"commercial_terms":commercial,
            "expires_at_ns":self.expires_at_ns.to_string(),"previous_quote_id":null}}), &self.publisher,
            parse_amount(&credit["quote_credit"])?, "agency_canonical_quote").await?;
        self.remember("agency_canonical_quote", &result);
        Ok(())
    }

    async fn agency_request(
        &mut self,
        proposal: Value,
        expected: &str,
        transfer: Option<(&AccountId, u128)>,
    ) -> TestResult<Value> {
        let result = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "agency_agent_request",
            )
            .await?;
        let response: Value = result.clone().json()?;
        assert_eq!(response["decision"], expected);
        self.remember("agency_agent_request", &result);
        self.inspect_actions(
            "agency_request_actions",
            &result,
            transfer,
            transfer.map(|_| "resolve_purchase"),
        )
        .await?;
        self.agency_frontend_attempt(proposal, response.clone(), &result)
            .await?;
        Ok(response)
    }

    /// Export only reviewed IDs/DTOs and actual FINAL action outcomes, never keys
    /// or raw provider data. An imported file still is not independent chain proof.
    async fn agency_frontend_attempt(
        &mut self,
        proposal: Value,
        response: Value,
        result: &ExecutionFinalResult,
    ) -> TestResult<()> {
        let mut initial = Value::Null;
        let mut transfer = Value::Null;
        let mut callback = Value::Null;
        for outcome in result.receipt_outcomes() {
            let raw = Transaction::receipt(outcome.transaction_hash)
                .fetch_from(&self.network)
                .await?;
            let raw = serde_json::to_value(raw)?;
            let Some(actions) = raw["receipt"]["Action"]["actions"].as_array() else {
                continue;
            };
            for action in actions {
                let observation = json!({"receipt_id":outcome.transaction_hash.to_string(),"succeeded":outcome.is_success()});
                if raw["predecessor_id"] == self.agent.id.as_str()
                    && raw["receiver_id"] == self.contract.0.as_str()
                    && action["FunctionCall"]["method_name"] == "submit_purchase"
                {
                    assert!(initial.is_null(), "Duplicate initiating receipt");
                    initial = observation.clone();
                }
                if raw["predecessor_id"] != self.contract.0.as_str() {
                    continue;
                }
                if let Some(payment) = action.get("Transfer") {
                    assert!(transfer.is_null(), "Duplicate native transfer");
                    transfer = json!({"receipt_id":outcome.transaction_hash.to_string(),"succeeded":outcome.is_success(),
                        "receiver":raw["receiver_id"],"amount":payment["deposit"]});
                }
                if action["FunctionCall"]["method_name"] == "resolve_purchase" {
                    assert_eq!(raw["receiver_id"], self.contract.0.as_str());
                    assert!(callback.is_null(), "Duplicate resolution callback");
                    callback = observation;
                }
            }
        }
        assert!(!initial.is_null(), "Missing initiating execution receipt");
        self.evidence.push(json!({"case":"agency_frontend_attempt","observation":{
            "transaction_id":result.outcome().transaction_hash.to_string(),"finality":"FINAL",
            "proposal":proposal,"response":response,"initial":initial,"transfer":transfer,"callback":callback}}));
        Ok(())
    }

    pub(super) async fn agency_checks(&mut self) -> TestResult<()> {
        // Three provider slots: database, hosting, explicitly labelled failed-payment fixture.
        // Harness::new already registers search, so this mode starts from an empty registry.
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let recipient = self.publisher.id.clone();
        let missing: AccountId = "missing-agency-db.sandbox".parse()?;
        for (id, receiver) in [
            ("database-fixture", &recipient),
            ("hosting-fixture", &recipient),
            ("failure-fixture", &missing),
        ] {
            let result = self.call("register_provider", json!({"provider_id":id,"publisher_id":self.publisher.id,"recipient_id":receiver}),
                &self.operator, parse_amount(&credit["provider_credit"])?, "agency_provider").await?;
            self.remember("agency_provider", &result);
        }
        let allowance = NearToken::from_millinear(250);
        let (restricted, added) = super::scoped_key_cases::scoped_actor(
            &self.agent,
            &self.contract.0,
            &self.network,
            allowance,
        )
        .await
        .map_err(|error| format!("Agency LOCAL scoped-key setup failed: {error}"))?;
        self.remember("agency_scoped_key", &added);
        let recovery = std::mem::replace(&mut self.agent, restricted);
        let parent = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/projects");
        std::fs::create_dir_all(&parent)?;
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_nanos()
            .to_string();
        let mut summaries = Vec::new();
        for scenario in ["pass", "provision-fail", "payment-fail"] {
            let id = format!("agency-{scenario}-{nonce}");
            let directory = parent.join(&id);
            std::fs::create_dir(&directory)?;
            let project = self.call("create_project", json!({"project":{"project_id":id,"organisation_id":"northstar-demo",
                "client_ref":"acme-demo","budget_ceiling":"300","expires_at_ns":self.expires_at_ns.to_string(),"outcome_definition_hash":CRITERIA}}),
                &self.operator,parse_amount(&credit["project_credit"])?,"agency_project").await?;
            self.remember("agency_project", &project);
            let created = self.call("create_capsule",json!({"capsule_id":id,"storage_credit":credit["capsule_credit"],"policy":{
                "project_id":id,"project_revision":"1","task_id":"booking-website","workflow_id":"website-resource-fixture-v1",
                "agent_id":self.agent.id,"agent_public_key":self.agent.public_key.to_string(),"budget":"300","per_purchase_limit":"100",
                "per_commitment_limit":"300","recurring_policy":"REQUIRE_APPROVAL","allowed_provider_ids":["database-fixture","hosting-fixture","failure-fixture"],
                "allowed_service_ids":["database-plan","hosting-plan"],"allowed_categories":["database","hosting"],"max_quantity":1,
                "approval_threshold":null,"expires_at_ns":self.expires_at_ns.to_string(),"validation_spec_hash":CRITERIA}}),
                &self.operator,parse_amount(&credit["capsule_credit"])?.checked_add(300).ok_or("Funding overflow")?,"agency_capsule").await?;
            self.remember("agency_capsule", &created);
            let failed_payment = scenario == "payment-fail";
            let receiver = if failed_payment { &missing } else { &recipient };
            let provider = if failed_payment {
                "failure-fixture"
            } else {
                "database-fixture"
            };
            let quote = format!("{id}-db");
            self.agency_quote(&quote, "booking-database", provider, receiver, 50, false)
                .await?;
            let proposal = self.proposal(&id, &quote, "database").await?;
            let mut altered = proposal.clone();
            altered["request_id"] = json!("altered-quote");
            altered["expected_quote_hash"] = json!("00".repeat(32));
            let denied = self.agency_request(altered, "DENIED", None).await?;
            assert!(
                denied["reason_codes"]
                    .as_array()
                    .ok_or("Missing denial")?
                    .contains(&json!("QUOTE_TERMS_MISMATCH"))
            );
            self.agency_request(proposal.clone(), "APPROVED", Some((receiver, 50)))
                .await?;
            let purchase = self.purchase(&id, "database").await?;
            assert_eq!(
                purchase["status"],
                if failed_payment {
                    "SETTLEMENT_FAILED"
                } else {
                    "SETTLED"
                }
            );
            let replay = self.agency_request(proposal, "DENIED", None).await?;
            assert!(
                replay["reason_codes"]
                    .as_array()
                    .ok_or("Missing replay")?
                    .contains(&json!("REQUEST_REPLAY"))
            );
            assert_eq!(self.purchase(&id, "database").await?, purchase);
            if scenario == "pass" {
                let higher = format!("{id}-65");
                self.agency_quote(&higher, "booking-database", provider, receiver, 65, false)
                    .await?;
                let duplicate = self.proposal(&id, &higher, "duplicate").await?;
                self.agency_request(duplicate, "DENIED", None).await?;
                let hosting = format!("{id}-host");
                self.agency_quote(
                    &hosting,
                    "booking-host",
                    "hosting-fixture",
                    &recipient,
                    20,
                    false,
                )
                .await?;
                let host = self.proposal(&id, &hosting, "hosting").await?;
                self.agency_request(host, "APPROVED", Some((&recipient, 20)))
                    .await?;
                let recurring = format!("{id}-sub");
                self.agency_quote(&recurring, "another-db", provider, receiver, 20, true)
                    .await?;
                let sub = self.proposal(&id, &recurring, "hidden-commitment").await?;
                let denied = self.agency_request(sub, "DENIED", None).await?;
                assert!(
                    denied["reason_codes"]
                        .as_array()
                        .ok_or("Missing full-term denial")?
                        .contains(&json!("INSUFFICIENT_COMMITMENT_BUDGET"))
                );
            }
            let observed = Chain::block()
                .at(Reference::Final)
                .fetch_from(&self.network)
                .await?
                .header
                .timestamp_nanosec
                .to_string();
            let provisioned = scenario == "pass";
            let mut service_calls = 0;
            if !failed_payment {
                let artifact = json!({"fixture_version":1,"project_id":id,"resource_key":"booking-database","fixture_provider_id":"database-fixture",
                    "provisioning_status":if provisioned {"PROVISIONED"} else {"FAILED"},"health_status":if provisioned {json!(200)} else {Value::Null},
                    "https_fixture":provisioned,"route":"/health","health_body":if provisioned {json!("ok")} else {Value::Null},"observed_at_ns":observed});
                std::fs::write(
                    directory.join("resource.json"),
                    serde_json::to_vec_pretty(&artifact)?,
                )?;
                service_calls += 1;
            }
            let check = self
                .agency_node(
                    "scripts/validation/validate-resource-output.ts",
                    &[
                        &id,
                        "booking-database",
                        &observed,
                        if failed_payment {
                            "missing"
                        } else {
                            "artifact"
                        },
                    ],
                    if failed_payment {
                        2
                    } else if provisioned {
                        0
                    } else {
                        1
                    },
                )
                .await?;
            assert_eq!(check["criteria_hash"], CRITERIA);
            if !failed_payment {
                let digest =
                    near_api::CryptoHash::hash(&std::fs::read(directory.join("resource.json"))?);
                assert_eq!(
                    check["artifact_hash"],
                    digest
                        .0
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<String>()
                );
            } else {
                assert!(!directory.join("resource.json").exists());
                assert!(check["artifact_hash"].is_null());
            }
            let evidence = json!({"status":if provisioned {"PROVISIONED"} else {"FAILED"},"trust_class":"DEMO_FIXTURE","source_id":"database-fixture",
                "observed_at_ns":observed,"artifact_hash":check["artifact_hash"],"evidence_hash":check["evidence_hash"]});
            let provision_args = json!({"capsule_id":id,"request_id":"database","expected_request_hash":purchase["request_hash"],
                "expected_previous_record_hash":null,"evidence":evidence});
            self.agency_scoped_owner_refused("record_provisioning", provision_args.clone())
                .await?;
            let provisioning = self
                .call(
                    "record_provisioning",
                    provision_args,
                    &self.operator,
                    1,
                    "agency_owner_provisioning",
                )
                .await?;
            self.remember("agency_owner_provisioning", &provisioning);
            let capsule = self.assert_ledger(&id).await?;
            let check_args = json!({"capsule_id":id,"request_id":"database","expected_policy_hash":capsule["policy_hash"],
                "expected_request_hash":purchase["request_hash"],"report":check});
            self.agency_scoped_owner_refused("record_task_check", check_args.clone())
                .await?;
            let checked = self
                .call(
                    "record_task_check",
                    check_args,
                    &self.operator,
                    1,
                    "agency_owner_task_check",
                )
                .await?;
            self.remember("agency_owner_task_check", &checked);
            let outcome: Value = checked.json()?;
            let before_accept = self
                .view(
                    "get_receipt",
                    json!({"capsule_id":id,"request_id":"database"}),
                )
                .await?;
            assert!(before_accept["human_acceptance"].is_null());
            let snapshot = self
                .view("get_evidence_snapshot_hash", json!({"capsule_id":id}))
                .await?;
            let accept_args = json!({"capsule_id":id,"expected_outcome_hash":outcome["outcome_hash"],"expected_evidence_snapshot_hash":snapshot,
                "decision":if provisioned {"ACCEPTED"} else {"REJECTED"}});
            self.agency_scoped_owner_refused("record_human_acceptance", accept_args.clone())
                .await?;
            let accepted = self
                .call(
                    "record_human_acceptance",
                    accept_args.clone(),
                    &self.operator,
                    1,
                    "agency_explicit_owner_acceptance",
                )
                .await?;
            self.remember("agency_explicit_owner_acceptance", &accepted);
            self.expect_failed_call(
                "record_human_acceptance",
                accept_args,
                true,
                1,
                "HUMAN_ACCEPTANCE_ALREADY_RECORDED",
            )
            .await?;
            let block = Chain::block_hash()
                .at(Reference::Final)
                .fetch_from(&self.network)
                .await?;
            let canonical = self
                .contract
                .call_function("get_capsule_report_snapshot", json!({"capsule_id":id}))
                .read_only::<Value>()
                .at(Reference::AtBlockHash(block))
                .fetch_from(&self.network)
                .await?;
            assert_eq!(canonical.block_hash, block);
            std::fs::write(
                directory.join("canonical.json"),
                serde_json::to_vec_pretty(&json!({"source":"LOCAL_NEAR_SANDBOX_OBSERVATION",
                "contract_id":self.contract.0,"network_tag":"testnet","block_hash":block.to_string(),"project_id":id,"snapshots":[canonical.data]}))?,
            )?;
            // Same finalized block as the snapshot; never mix cached registry views.
            let mut providers = Vec::new();
            let mut quotes = Vec::new();
            for provider_id in ["database-fixture", "hosting-fixture", "failure-fixture"] {
                let provider = self
                    .contract
                    .call_function("get_provider", json!({"provider_id":provider_id}))
                    .read_only::<Value>()
                    .at(Reference::AtBlockHash(block))
                    .fetch_from(&self.network)
                    .await?;
                assert_eq!(provider.block_hash, block);
                providers.push(provider.data);
                for from_index in [0, 20] {
                    let page = self
                        .contract
                        .call_function(
                            "get_quotes",
                            json!({"provider_id":provider_id,"from_index":from_index,"limit":20}),
                        )
                        .read_only::<Value>()
                        .at(Reference::AtBlockHash(block))
                        .fetch_from(&self.network)
                        .await?;
                    assert_eq!(page.block_hash, block);
                    quotes.extend(
                        page.data
                            .as_array()
                            .ok_or("Invalid canonical quote page")?
                            .iter()
                            .filter(|q| {
                                q["terms"]["input"]["quote_id"]
                                    .as_str()
                                    .is_some_and(|quote_id| quote_id.starts_with(&id))
                            })
                            .cloned(),
                    );
                }
            }
            let final_block = Chain::block()
                .at(Reference::AtBlockHash(block))
                .fetch_from(&self.network)
                .await?;
            let attempts = self
                .evidence
                .iter()
                .filter(|e| {
                    e["case"] == "agency_frontend_attempt"
                        && e["observation"]["proposal"]["project_id"] == id
                })
                .map(|e| e["observation"].clone())
                .collect::<Vec<_>>();
            std::fs::write(
                directory.join("observation.json"),
                serde_json::to_vec_pretty(&json!({
                "schema_version":1,"source":"LOCAL_NEAR_SANDBOX_OBSERVATION","public_testnet":false,"network_tag":"testnet",
                "contract_id":self.contract.0,"block_hash":block.to_string(),"observed_at_ns":final_block.header.timestamp_nanosec.to_string(),
                "project_id":id,"providers":providers,"quotes":quotes,"snapshots":[canonical.data],"attempts":attempts}))?,
            )?;
            let adapter = self
                .agency_node("scripts/web/inspect-local-observation.ts", &[&id], 0)
                .await?;
            assert_eq!(adapter["result"], "LOCAL_OBSERVATION_ADAPTER_CHECKED");
            assert_eq!(adapter["public_testnet"], false);
            self.evidence
                .push(json!({"case":"agency_frontend_adapter_readback","result":adapter}));
            let report = self
                .agency_node(
                    "scripts/workflow/export-project-local.ts",
                    &[&id, "--budget", "--expenses", "--evidence"],
                    0,
                )
                .await?;
            assert_eq!(
                report["financials"]["spent"],
                if failed_payment {
                    "0"
                } else if provisioned {
                    "70"
                } else {
                    "50"
                }
            );
            assert_eq!(report["financials"]["reserved"], "0");
            assert_eq!(report["coverage"]["complete_project"], true);
            let private = self
                .agency_node("scripts/workflow/export-project-local.ts", &[&id], 0)
                .await?;
            assert!(private["financials"].is_null());
            assert_eq!(private["expenses"], json!([]));
            let receipt = self
                .view(
                    "get_receipt",
                    json!({"capsule_id":id,"request_id":"database"}),
                )
                .await?;
            assert_eq!(receipt["purchase"]["status"], purchase["status"]);
            assert_eq!(receipt["acceptance_matches_current_evidence"], true);
            std::fs::write(
                directory.join("report.json"),
                serde_json::to_vec_pretty(&report)?,
            )?;
            std::fs::write(
                directory.join("receipt.json"),
                serde_json::to_vec_pretty(&receipt)?,
            )?;
            summaries.push(json!({"project_id":id,"scenario":scenario,"payment_status":purchase["status"],"settled_spend":report["financials"]["spent"],
                "task_check_status":check["status"],"fixture_service_calls":service_calls,"human_decision":receipt["human_acceptance"]["decision"]}));
        }
        let capabilities = json!({"mode":"CONTROLLED_DEMO_FIXTURE","payment":"LOCAL_SANDBOX_NATIVE_NEAR","canonical_quotes":true,
            "maximum_spend":"CONTRACT_AUTHORITY_ONLY","recurring_collection":false,"provisioning":"FICTIONAL_MANIFEST_ONLY",
            "cancellation":false,"provider_signature":false,"owner_actions":"SEPARATE_LOCAL_TEST_CONTROLLER_NOT_REAL_CLIENT_ACCEPTANCE"});
        std::fs::write(
            parent.join("latest.json"),
            serde_json::to_vec_pretty(&json!({"result":"AGENCY_WORKFLOW_CHECKS_PASSED",
            "source":"LOCAL_NEAR_SANDBOX_SCRIPTED_AGENCY_WORKFLOW","public_testnet":false,"ai_model_used":false,
            "capabilities":capabilities,"runs":summaries,"evidence":self.evidence,"recovery_retained":true,"broader_purchase_fallback":false}))?,
        )?;
        self.agent = recovery;
        println!(
            "{}",
            serde_json::to_string(
                &json!({"result":"AGENCY_WORKFLOW_CHECKS_PASSED","public_testnet":false,
            "source":"LOCAL_NEAR_SANDBOX_SCRIPTED_AGENCY_WORKFLOW","runs":summaries,"evidence_file":".local/projects/latest.json"})
            )?
        );
        Ok(())
    }
}
