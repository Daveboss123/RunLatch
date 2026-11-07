//! LOCAL default-WASM maximum global indexes and callback-loaded record sizes.
//! Does not claim that all64 capsules'2048 request histories were executed.
use super::*;

fn maximum_id(prefix: char, index: usize) -> String {
    format!("{}-{index:02}", prefix.to_string().repeat(61))
}

impl Harness {
    async fn storage_usage(&self) -> TestResult<u64> {
        Ok(Account(self.contract.0.clone())
            .view()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .storage_usage)
    }

    pub(super) async fn maximum_state_checks(&mut self) -> TestResult<()> {
        assert_eq!(self.operator.id.as_str().len(), 64);
        assert_eq!(self.agent.id.as_str().len(), 64);
        assert_eq!(self.publisher.id.as_str().len(), 64);
        assert_eq!(self.contract.0.as_str().len(), 64);
        let providers = ["s".repeat(64), "e".repeat(64), "f".repeat(64)];
        let missing: AccountId = format!("{}.sandbox", "m".repeat(56)).parse()?;
        let recipients = [
            self.publisher.id.clone(),
            self.publisher.id.clone(),
            missing.clone(),
        ];
        let service = "v".repeat(64);
        let category = "g".repeat(64);
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let capsule_funding = parse_amount(&credit["capsule_credit"])?
            .checked_mul(64)
            .ok_or("Storage funding overflow")?;
        let project_funding = parse_amount(&credit["project_credit"])?
            .checked_mul(64)
            .ok_or("Storage funding overflow")?;
        let operator_balance = self.balance(&self.operator.id).await?;
        assert!(
            operator_balance
                > capsule_funding
                    .checked_add(project_funding)
                    .ok_or("Funding overflow")?,
            "LOCAL maximum operator lacks prepaid storage funding before setup"
        );
        self.evidence.push(json!({"case":"maximum_local_setup_funding","source":"EPHEMERAL_SANDBOX_ACTOR_NOT_REAL_FUNDS",
            "operator_balance":operator_balance.to_string(),"capsule_storage_total":capsule_funding.to_string(),
            "project_storage_total":project_funding.to_string(),"allowance_is_business_budget":false}));
        let before_providers = self.storage_usage().await?;
        for (provider, recipient) in providers.iter().zip(&recipients) {
            let result = self
                .call(
                    "register_provider",
                    json!({"provider_id":provider,
                "publisher_id":self.publisher.id,"recipient_id":recipient}),
                    &self.operator,
                    parse_amount(&credit["provider_credit"])?,
                    "maximum_provider_registration",
                )
                .await?;
            self.remember("maximum_provider_registration", &result);
        }
        let provider_bytes = self
            .storage_usage()
            .await?
            .checked_sub(before_providers)
            .ok_or("Storage decreased")?;
        assert!(provider_bytes < 3 * 4096);

        let before_quotes = self.storage_usage().await?;
        for (provider_index, provider) in providers.iter().enumerate() {
            for index in 0..32 {
                let prefix = ['q', 'x', 'z'][provider_index];
                let id = maximum_id(prefix, index);
                let previous = if index == 0 {
                    None
                } else {
                    Some(maximum_id(prefix, index - 1))
                };
                let price = if index == 31 { 600 } else { 100 };
                let result = self.call("publish_quote", json!({"quote":{"quote_id":id,"provider_id":provider,
                    "recipient_id":recipients[provider_index],"service_id":service,"category":category,
                    "resource_key":id,"quantity":50,"price":price.to_string(),"asset":"near-native","recurring":false,
                    "expires_at_ns":self.expires_at_ns.to_string(),"previous_quote_id":previous,
                    "commercial_terms":{"billing_model":"ONE_TIME","cadence":"ONCE","period_charge":price.to_string(),"required_periods":1,
                        "mandatory_fees":"0","known_taxes":"0","setup_fees":"0","auto_renew":false,
                        "cancellation_terms_hash":"03".repeat(32),"source_evidence_hash":"04".repeat(32),
                        "future_obligation_contingent_on_initial_payment":true}}}),
                    &self.publisher, parse_amount(&credit["quote_credit"])?, "maximum_quote_publication").await?;
                self.remember("maximum_quote_publication", &result);
            }
            assert_eq!(
                self.view("get_provider", json!({"provider_id":provider}))
                    .await?["quote_count"],
                32
            );
        }
        let quote_bytes = self
            .storage_usage()
            .await?
            .checked_sub(before_quotes)
            .ok_or("Storage decreased")?;
        assert!(quote_bytes < 96 * 8192);

        let mut policy = json!({"project_id":maximum_id('r',0),"project_revision":"1","task_id":"t".repeat(64),"workflow_id":"w".repeat(64),
            "agent_id":self.agent.id,"agent_public_key":self.agent.public_key.to_string(),
            "budget":"1000","per_purchase_limit":"750","per_commitment_limit":"750","recurring_policy":"FORBIDDEN","allowed_provider_ids":providers,
            "allowed_service_ids":[service,"a".repeat(64),"b".repeat(64),"c".repeat(64)],
            "allowed_categories":[category,"h".repeat(64),"i".repeat(64),"j".repeat(64)],
            "max_quantity":50,"approval_threshold":"500","expires_at_ns":self.expires_at_ns.to_string(),
            "validation_spec_hash":"b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b"});
        let before_capsules = self.storage_usage().await?;
        for index in 0..64 {
            let project_id = maximum_id('r', index);
            let budget = if index == 61 { 4000 } else { 1000 };
            self.project_fixture(&project_id, budget).await?;
            policy["project_id"] = json!(project_id);
            policy["budget"] = json!(budget.to_string());
            let result = self
                .call(
                    "create_capsule",
                    json!({"capsule_id":maximum_id('r', index),
                "policy":policy,"storage_credit":credit["capsule_credit"]}),
                    &self.operator,
                    parse_amount(&credit["capsule_credit"])?
                        .checked_add(budget)
                        .ok_or("Funding overflow")?,
                    "maximum_capsule_creation",
                )
                .await?;
            self.remember("maximum_capsule_creation", &result);
        }
        let capsule_bytes = self
            .storage_usage()
            .await?
            .checked_sub(before_capsules)
            .ok_or("Storage decreased")?;
        assert!(capsule_bytes < 64 * 131072);
        self.expect_failed_call(
            "create_capsule",
            json!({"capsule_id":"over-limit","policy":policy,
            "storage_credit":credit["capsule_credit"]}),
            true,
            parse_amount(&credit["capsule_credit"])?
                .checked_add(1000)
                .ok_or("Funding overflow")?,
            "CAPSULE_LIMIT",
        )
        .await?;

        let before_history = self.storage_usage().await?;
        for (capsule_index, quote_prefix, receiver, expected_status) in [
            (62, 'q', &recipients[0], "SETTLED"),
            (63, 'z', &recipients[2], "SETTLEMENT_FAILED"),
        ] {
            let capsule = maximum_id('r', capsule_index);
            for index in 0..30 {
                let mut request = self
                    .proposal(
                        &capsule,
                        &maximum_id(quote_prefix, 1),
                        &format!("{index:064}"),
                    )
                    .await?;
                request["expected_quote_hash"] = json!("00".repeat(32));
                let result = self
                    .call(
                        "submit_purchase",
                        json!({"proposal":request}),
                        &self.agent,
                        0,
                        "maximum_history_denial",
                    )
                    .await?;
                assert_eq!(result.clone().json::<Value>()?["decision"], "DENIED");
                self.remember("maximum_history_denial", &result);
            }
            let request_id = format!("{:064}", 30);
            let request = self
                .proposal(&capsule, &maximum_id(quote_prefix, 30), &request_id)
                .await?;
            let result = self
                .call(
                    "submit_purchase",
                    json!({"proposal":request}),
                    &self.agent,
                    0,
                    "maximum_index_purchase",
                )
                .await?;
            self.inspect_actions(
                "maximum_index_purchase",
                &result,
                Some((receiver, 100)),
                Some("resolve_purchase"),
            )
            .await?;
            assert_eq!(
                self.purchase(&capsule, &request_id).await?["status"],
                expected_status
            );
            let request_id = format!("{:064}", 31);
            let request = self
                .proposal(&capsule, &maximum_id(quote_prefix, 31), &request_id)
                .await?;
            let pending = self
                .call(
                    "submit_purchase",
                    json!({"proposal":request}),
                    &self.agent,
                    0,
                    "maximum_exact_approval_pending",
                )
                .await?;
            assert_eq!(
                pending.clone().json::<Value>()?["request"]["status"],
                "APPROVAL_PENDING"
            );
            let record = self.purchase(&capsule, &request_id).await?;
            let result = self
                .call(
                    "approve_purchase",
                    json!({"capsule_id":capsule,"request_id":request_id,
                "expected_request_hash":record["request_hash"]}),
                    &self.operator,
                    1,
                    "maximum_exact_approval",
                )
                .await?;
            self.remember("maximum_exact_approval", &result);
            self.inspect_actions(
                "maximum_approval_callback",
                &result,
                Some((receiver, 600)),
                Some("resolve_purchase"),
            )
            .await?;
            assert_eq!(
                self.purchase(&capsule, &request_id).await?["status"],
                expected_status
            );
            let cap = self.assert_ledger(&capsule).await?;
            assert_eq!(
                cap["request_ids"].as_array().ok_or("Missing index")?.len(),
                32
            );
            assert_eq!(cap["reserved"], "0");
            let revoked = self
                .call(
                    "revoke_capsule",
                    json!({"capsule_id":capsule}),
                    &self.operator,
                    1,
                    "maximum_revoke",
                )
                .await?;
            self.remember("maximum_revoke", &revoked);
            let result = self
                .call(
                    "close_capsule",
                    json!({"capsule_id":capsule}),
                    &self.operator,
                    1,
                    "maximum_owner_return",
                )
                .await?;
            let owner = self.operator.id.clone();
            self.inspect_actions(
                "maximum_refund_callback",
                &result,
                Some((
                    &owner,
                    if expected_status == "SETTLED" {
                        300
                    } else {
                        1000
                    },
                )),
                Some("resolve_owner_refund"),
            )
            .await?;
            self.assert_ledger(&capsule).await?;
        }
        let history_bytes = self
            .storage_usage()
            .await?
            .checked_sub(before_history)
            .ok_or("Storage decreased")?;
        assert!(history_bytes < 2 * 131072);
        let before_enriched = self.storage_usage().await?;
        let enriched = maximum_id('r', 61);
        //32 actual paid operations/resource claims + every bounded provisioning slot.
        // These events are synthetic owner size fixtures, not provider confirmations.
        for index in 0..32 {
            let request_id = format!("{index:064}");
            let proposal = self
                .proposal(&enriched, &maximum_id('x', index), &request_id)
                .await?;
            let submitted = self
                .call(
                    "submit_purchase",
                    json!({"proposal":proposal}),
                    &self.agent,
                    0,
                    "maximum_enriched_purchase",
                )
                .await?;
            let paid = if index == 31 {
                let request = self.purchase(&enriched, &request_id).await?;
                self.call("approve_purchase",json!({"capsule_id":enriched,"request_id":request_id,"expected_request_hash":request["request_hash"]}),
                    &self.operator,1,"maximum_enriched_approval").await?
            } else {
                submitted
            };
            self.inspect_actions(
                "maximum_enriched_callback",
                &paid,
                Some((&recipients[1], if index == 31 { 600 } else { 100 })),
                Some("resolve_purchase"),
            )
            .await?;
            let request = self.purchase(&enriched, &request_id).await?;
            assert_eq!(request["status"], "SETTLED");
            let mut previous = Value::Null;
            for status in ["PROVISIONED", "FAILED"] {
                let input = json!({"status":status,"trust_class":"DEMO_FIXTURE","source_id":"s".repeat(64),"observed_at_ns":"0",
                    "artifact_hash":"04".repeat(32),"evidence_hash":"05".repeat(32)});
                let result = self.call("record_provisioning",json!({"capsule_id":enriched,"request_id":request_id,
                    "expected_request_hash":request["request_hash"],"expected_previous_record_hash":previous,"evidence":input}),
                    &self.operator,1,"maximum_synthetic_provisioning").await?;
                self.remember("maximum_synthetic_provisioning", &result);
                previous = result.json::<Value>()?["record_hash"].clone();
            }
        }
        let cap = self.assert_ledger(&enriched).await?;
        assert_eq!(cap["spent"], "3700");
        let revoke = self
            .call(
                "revoke_capsule",
                json!({"capsule_id":enriched}),
                &self.operator,
                1,
                "maximum_enriched_revoke",
            )
            .await?;
        self.remember("maximum_enriched_revoke", &revoke);
        let close = self
            .call(
                "close_capsule",
                json!({"capsule_id":enriched}),
                &self.operator,
                1,
                "maximum_enriched_close",
            )
            .await?;
        self.inspect_actions(
            "maximum_enriched_refund_callback",
            &close,
            Some((&self.operator.id.clone(), 300)),
            Some("resolve_owner_refund"),
        )
        .await?;
        let enriched_bytes = self
            .storage_usage()
            .await?
            .checked_sub(before_enriched)
            .ok_or("Storage decreased")?;
        let before_outcomes = self.storage_usage().await?;
        for index in [61, 62, 63] {
            let capsule_id = maximum_id('r', index);
            let capsule = self
                .view("get_capsule", json!({"capsule_id":capsule_id}))
                .await?;
            // Synthetic size-boundary owner input, NOT actual validator output.
            // On-chain state proves who attested it, not the truth of its claims.
            let mut summary = super::outcome_cases::prepared_reports()?["fail"].clone();
            summary["reason_codes"] =
                json!((0..32).map(|i| format!("CODE_{i:059}")).collect::<Vec<_>>());
            summary["issue_count"] = json!(65);
            summary["issues_truncated"] = json!(true);
            let boundary_digest = near_api::CryptoHash::hash(&serde_json::to_vec(&summary)?);
            summary["evidence_hash"] = json!(
                boundary_digest
                    .0
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>()
            );
            let result = self
                .call(
                    "record_validation",
                    json!({"capsule_id":capsule_id,
                "expected_policy_hash":capsule["policy_hash"],"report":summary}),
                    &self.operator,
                    1,
                    "maximum_synthetic_owner_summary",
                )
                .await?;
            self.remember("maximum_synthetic_owner_summary", &result);
            assert_eq!(
                self.view("get_capsule", json!({"capsule_id":capsule_id}))
                    .await?["status"],
                "CLOSED"
            );
            let outcome = self
                .view("get_outcome", json!({"capsule_id":capsule_id}))
                .await?;
            let snapshot = self
                .view(
                    "get_evidence_snapshot_hash",
                    json!({"capsule_id":capsule_id}),
                )
                .await?;
            let accepted = self
                .call(
                    "record_human_acceptance",
                    json!({"capsule_id":capsule_id,"expected_outcome_hash":outcome["outcome_hash"],
                "expected_evidence_snapshot_hash":snapshot,"decision":"REJECTED"}),
                    &self.operator,
                    1,
                    "maximum_synthetic_owner_acceptance",
                )
                .await?;
            self.remember("maximum_synthetic_owner_acceptance", &accepted);
            let report = self
                .view(
                    "get_capsule_report_snapshot",
                    json!({"capsule_id":capsule_id}),
                )
                .await?;
            assert_eq!(
                report["purchases"]
                    .as_array()
                    .ok_or("Missing report requests")?
                    .len(),
                32
            );
            assert!(serde_json::to_vec(&report)?.len() < 1_048_576);
        }
        let outcome_bytes = self
            .storage_usage()
            .await?
            .checked_sub(before_outcomes)
            .ok_or("Storage decreased")?;
        assert!(
            history_bytes
                .checked_add(outcome_bytes)
                .and_then(|n| n.checked_add(enriched_bytes))
                .ok_or("Storage overflow")?
                < 3 * 262144
        );
        // Each capsule must fit on its own; do not borrow another capsule's credit.
        assert!(
            enriched_bytes
                .checked_add(outcome_bytes)
                .ok_or("Storage overflow")?
                < 262144
        );
        let callbacks: Vec<_> = self
            .evidence
            .iter()
            .filter_map(|e| e["callbacks"].as_array())
            .flat_map(|calls| calls.iter())
            .cloned()
            .collect();
        for callback in &callbacks {
            let used = parse_amount(&callback["gas_burnt"])?;
            let assigned = parse_amount(&callback["gas_assigned"])?;
            assert!(
                used.checked_mul(2).ok_or("Gas overflow")? < assigned,
                "Measured callback needs >2x headroom"
            );
        }
        let report = json!({"environment":"LOCAL_NEAR_SANDBOX","build_kind":"DEFAULT_CONTRACT_BUILD",
            "result":"MAXIMUM_INDEX_CHECKS_PASSED","public_testnet":false,"capsule_count":64,"quote_count":96,
            "provider_count":3,"full_histories_executed":3,"request_count_per_history":32,"provisioning_events":64,"human_acceptance_records":3,
            "account_id_bytes":64,"opaque_id_bytes":64,"scope_sizes":[3,4,4],
            "measured_provider_bytes":provider_bytes,"measured_quote_bytes":quote_bytes,
            "measured_capsule_bytes":capsule_bytes,"measured_history_and_refund_bytes":history_bytes,
            "measured_outcome_bytes":outcome_bytes,
            "measured_enriched_history_bytes":enriched_bytes,"prepaid_capsule_bytes":262144,
            "callbacks":callbacks,"evidence":self.evidence,
            "limitations":"Not2048 executed histories. Size-boundary outcome summaries are synthetic owner input, not validator output or truth proof"});
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("maximum.json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"environment":"LOCAL_NEAR_SANDBOX",
            "result":"MAXIMUM_INDEX_CHECKS_PASSED","capsule_count":64,"quote_count":96,
            "full_histories_executed":3,"scope_sizes":[3,4,4],"measured_history_and_refund_bytes":history_bytes,
            "measured_enriched_history_bytes":enriched_bytes,"prepaid_capsule_bytes":262144,
            "measured_outcome_bytes":outcome_bytes,
            "callbacks":callbacks,"evidence_file":".local/sandbox/maximum.json","public_testnet":false}))?
        );
        Ok(())
    }
}
