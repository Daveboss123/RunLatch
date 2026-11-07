//! Actual expected-failure callbacks on a distinctly labelled LOCAL fault WASM.
//! This is not evidence that a caller can change normal25TGas callbacks.
use super::*;

impl Harness {
    async fn assert_starved_callback(
        &mut self,
        label: &str,
        result: &ExecutionFinalResult,
        receiver: &AccountId,
        amount: u128,
        method: &str,
    ) -> TestResult<()> {
        assert!(
            result.is_failure(),
            "Expected actual failing callback, not a successful final transaction"
        );
        let mut transfers = 0;
        let mut callbacks = 0;
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
                        assert_eq!(receipt["receiver_id"], receiver.as_str());
                        assert_eq!(parse_amount(&transfer["deposit"])?, amount);
                        assert!(
                            outcome.is_success(),
                            "Native transfer must succeed independently of failed callback"
                        );
                        transfers += 1;
                    }
                    if let Some(call) = action.get("FunctionCall")
                        && call["method_name"] == method
                    {
                        assert_eq!(receipt["receiver_id"], self.contract.0.as_str());
                        assert_eq!(parse_amount(&call["gas"])?, 100_000_000_000);
                        let failure = outcome
                            .clone()
                            .into_result()
                            .expect_err("Callback unexpectedly succeeded");
                        // Display intentionally hides the nested runtime cause;
                        // inspect Debug for the actual generated LOCAL receipt error.
                        let details = format!("{failure:?}");
                        assert!(
                            details.contains("Exceeded the prepaid gas"),
                            "Unexpected callback failure: {details}"
                        );
                        callbacks += 1;
                        self.evidence.push(json!({"case":label,"source":"LOCAL_NEAR_SANDBOX_FAULT_BUILD",
                            "method":method,"callback_receipt_id":outcome.transaction_hash.to_string(),
                            "assigned_gas":"100000000000","observed_gas_burnt":outcome.gas_burnt.as_gas().to_string(),
                            "native_transfer_succeeded":true,"callback_failed":true}));
                    }
                }
            }
        }
        assert_eq!(transfers, 1);
        assert_eq!(callbacks, 1);
        Ok(())
    }

    pub(super) async fn callback_fault_checks(&mut self) -> TestResult<()> {
        let recipient = self.publisher.id.clone();
        self.capsule("quarantine-run", vec!["search"], None).await?;
        self.quote("quarantine-quote", "search", &recipient, 600, false)
            .await?;
        self.quote("quarantine-next", "search", &recipient, 500, false)
            .await?;
        let request = self
            .proposal("quarantine-run", "quarantine-quote", "quarantine-request")
            .await?;
        let balance_before = self.balance(&recipient).await?;
        let failed = self
            .send(
                "submit_purchase",
                json!({"proposal":request}),
                &self.agent,
                0,
                NearGas::from_tgas(100),
            )
            .await?;
        self.remember("purchase_callback_starved", &failed);
        self.assert_starved_callback(
            "purchase_callback_failure",
            &failed,
            &recipient,
            600,
            "resolve_purchase",
        )
        .await?;
        assert_eq!(
            self.balance(&recipient).await?,
            balance_before.checked_add(600).ok_or("Balance overflow")?
        );
        let cap = self.assert_ledger("quarantine-run").await?;
        assert_eq!(cap["reserved"], "600");
        assert_eq!(cap["spent"], "0");
        let original = self
            .purchase("quarantine-run", "quarantine-request")
            .await?;
        assert_eq!(original["status"], "SETTLEMENT_PENDING");
        // No callback writes survived. Observation must derive reconciliation
        // needed from failed runtime receipts, not invent a persisted flag.
        assert_eq!(original["reconciliation_required"], false);
        let report = super::outcome_cases::prepared_reports()?["pass"].clone();
        let args = json!({"capsule_id":"quarantine-run","expected_policy_hash":cap["policy_hash"],"report":report});
        self.expect_failed_call(
            "record_validation",
            args,
            true,
            1,
            "PENDING_SETTLEMENT_BLOCKS_VALIDATION",
        )
        .await?;
        assert!(
            self.view("get_outcome", json!({"capsule_id":"quarantine-run"}))
                .await?
                .is_null()
        );
        assert_eq!(
            self.view("get_quote", json!({"quote_id":"quarantine-quote"}))
                .await?["consumed"],
            true
        );

        let next = self
            .proposal("quarantine-run", "quarantine-next", "overspend-after-fault")
            .await?;
        let denied = self
            .call(
                "submit_purchase",
                json!({"proposal":next}),
                &self.agent,
                0,
                "quarantined_budget_denial",
            )
            .await?;
        assert!(
            denied.clone().json::<Value>()?["reason_codes"]
                .as_array()
                .ok_or("Missing reasons")?
                .contains(&json!("INSUFFICIENT_AVAILABLE_BUDGET"))
        );
        self.inspect_actions("quarantined_budget_no_transfer", &denied, None, None)
            .await?;
        let replay = self
            .call(
                "submit_purchase",
                json!({"proposal":request}),
                &self.agent,
                0,
                "fault_replay_denied",
            )
            .await?;
        assert_eq!(
            replay.clone().json::<Value>()?["reason_codes"][0],
            "REQUEST_REPLAY"
        );
        assert_eq!(
            self.purchase("quarantine-run", "quarantine-request")
                .await?,
            original
        );
        self.inspect_actions("fault_replay_no_resend", &replay, None, None)
            .await?;
        let revoked = self
            .call(
                "revoke_capsule",
                json!({"capsule_id":"quarantine-run"}),
                &self.operator,
                1,
                "fault_revoke",
            )
            .await?;
        self.remember("fault_revoke", &revoked);
        self.expect_failed_call(
            "close_capsule",
            json!({"capsule_id":"quarantine-run"}),
            true,
            1,
            "PENDING_SETTLEMENT_BLOCKS_CLOSE",
        )
        .await?;
        assert_eq!(
            self.assert_ledger("quarantine-run").await?["reserved"],
            "600"
        );

        self.capsule("refund-quarantine", vec!["search"], None)
            .await?;
        let revoked = self
            .call(
                "revoke_capsule",
                json!({"capsule_id":"refund-quarantine"}),
                &self.operator,
                1,
                "refund_fault_revoke",
            )
            .await?;
        self.remember("refund_fault_revoke", &revoked);
        let failed = self
            .send(
                "close_capsule",
                json!({"capsule_id":"refund-quarantine"}),
                &self.operator,
                1,
                NearGas::from_tgas(100),
            )
            .await?;
        self.remember("refund_callback_starved", &failed);
        let owner = self.operator.id.clone();
        self.assert_starved_callback(
            "refund_callback_failure",
            &failed,
            &owner,
            1000,
            "resolve_owner_refund",
        )
        .await?;
        let cap = self.assert_ledger("refund-quarantine").await?;
        assert_eq!(cap["status"], "CLOSING");
        assert_eq!(cap["reserved"], "1000");
        assert_eq!(cap["allocated"], "1000");
        assert_eq!(cap["returned"], "0");
        assert_eq!(cap["owner_refund"]["status"], "PENDING");
        let repeated = self
            .call(
                "close_capsule",
                json!({"capsule_id":"refund-quarantine"}),
                &self.operator,
                1,
                "no_second_refund",
            )
            .await?;
        assert_eq!(
            repeated.clone().json::<Value>()?["transfer_scheduled"],
            false
        );
        self.inspect_actions("no_second_owner_refund", &repeated, None, None)
            .await?;
        self.expect_failed_call(
            "set_capsule_paused",
            json!({"capsule_id":"refund-quarantine","paused":false}),
            true,
            1,
            "CAPSULE_CANNOT_RESUME",
        )
        .await?;
        assert_eq!(
            self.assert_ledger("refund-quarantine").await?["reserved"],
            "1000"
        );

        let report = json!({"environment":"LOCAL_NEAR_SANDBOX","node_version":"2.14.0",
            "build_kind":"LOCAL_CALLBACK_STARVATION_FAULT_NOT_FOR_DEPLOYMENT","public_testnet":false,"real_funds":false,
            "result":"FAULT_CHECKS_PASSED","evidence":self.evidence});
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("callback-fault.json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"environment":"LOCAL_NEAR_SANDBOX",
            "build_kind":"LOCAL_CALLBACK_STARVATION_FAULT_NOT_FOR_DEPLOYMENT","result":"FAULT_CHECKS_PASSED",
            "purchase_reserved":"600","refund_reserved":"1000","public_testnet":false,
            "evidence_file":".local/sandbox/callback-fault.json"}))?
        );
        Ok(())
    }
}
