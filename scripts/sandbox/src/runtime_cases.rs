//! Additional real-WASM LOCAL runtime checks. No public network or new methods.
use super::*;

impl Harness {
    pub(super) async fn expect_failed_call(
        &mut self,
        method: &str,
        args: Value,
        owner: bool,
        deposit: u128,
        expected: &str,
    ) -> TestResult<()> {
        let sender = if owner { &self.operator } else { &self.agent };
        let result = self
            .send(method, args, sender, deposit, NearGas::from_tgas(100))
            .await?;
        assert!(
            result.is_failure(),
            "Expected actual failing receipt for {method}"
        );
        let failures = format!("{:?}", result.failures());
        assert!(
            failures.contains(expected),
            "Unexpected failure: {failures}"
        );
        self.remember(expected, &result);
        self.inspect_actions("failed_call_no_transfer", &result, None, None)
            .await?;
        Ok(())
    }

    pub(super) async fn extra_runtime_checks(&mut self) -> TestResult<()> {
        let recipient = self.publisher.id.clone();
        self.capsule("runtime-run", vec!["search"], None).await?;
        self.quote("runtime-quote", "search", &recipient, 100, false)
            .await?;
        let proposal = self
            .proposal("runtime-run", "runtime-quote", "abi-request")
            .await?;
        let baseline = self.assert_ledger("runtime-run").await?;

        // Actual ABI and runtime failures, not surviving business-denial records.
        let mut malformed = proposal.clone();
        malformed["recipient_id"] = json!("intruder.sandbox");
        self.expect_failed_call(
            "submit_purchase",
            json!({"proposal":malformed}),
            false,
            0,
            "unknown field",
        )
        .await?;
        self.expect_failed_call(
            "submit_purchase",
            json!({"proposal":proposal}),
            true,
            0,
            "UNAUTHORIZED_AGENT",
        )
        .await?;
        self.expect_failed_call(
            "resolve_purchase",
            json!({"purchase_key":"runtime-run:abi-request"}),
            false,
            0,
            "private",
        )
        .await?;
        assert_eq!(self.assert_ledger("runtime-run").await?, baseline);
        assert!(self.purchase("runtime-run", "abi-request").await?.is_null());
        assert_eq!(
            self.view("get_quote", json!({"quote_id":"runtime-quote"}))
                .await?["consumed"],
            false
        );

        // Runtime panic at the guard and genuine out-of-gas both roll back.
        for (gas, expected) in [
            (NearGas::from_tgas(40), "INSUFFICIENT_RESOLUTION_GAS"),
            (
                NearGas::from_gas(100_000_000_000),
                "Exceeded the prepaid gas",
            ),
        ] {
            let failed = self
                .send(
                    "submit_purchase",
                    json!({"proposal":proposal}),
                    &self.agent,
                    0,
                    gas,
                )
                .await?;
            assert!(
                failed.is_failure(),
                "Low gas unexpectedly authorized payment"
            );
            let failures = format!("{:?}", failed.failures());
            assert!(
                failures.contains(expected),
                "Expected {expected} at {gas}; actual receipt failures: {failures}"
            );
            self.remember("low_gas_runtime_rollback", &failed);
            self.inspect_actions("low_gas_no_transfer", &failed, None, None)
                .await?;
            assert_eq!(self.assert_ledger("runtime-run").await?, baseline);
            assert!(self.purchase("runtime-run", "abi-request").await?.is_null());
            assert_eq!(
                self.view("get_quote", json!({"quote_id":"runtime-quote"}))
                    .await?["consumed"],
                false
            );
        }

        // Outer wrapper fields are ignored by the generated ABI, never routing
        // authority or a fabricated persisted denial. Canonical100 still pays.
        let result = self.call("submit_purchase", json!({"proposal":proposal,"price":"1","recipient_id":"intruder.sandbox","decision":"APPROVED"}), &self.agent, 0, "outer_fields_cannot_route").await?;
        self.remember("outer_fields_cannot_route", &result);
        self.inspect_actions(
            "canonical_outer_field_payment",
            &result,
            Some((&recipient, 100)),
            Some("resolve_purchase"),
        )
        .await?;
        self.assert_ledger("runtime-run").await?;

        // A successful RPC transaction with a hard denial is not a purchase.
        self.quote("recurring-quote", "search", &recipient, 100, true)
            .await?;
        let proposal = self
            .proposal("runtime-run", "recurring-quote", "recurring-request")
            .await?;
        let denied = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "recurring_denied",
            )
            .await?;
        let response: Value = denied.clone().json()?;
        assert_eq!(response["decision"], "DENIED");
        assert!(
            response["reason_codes"]
                .as_array()
                .ok_or("Missing denial reasons")?
                .contains(&json!("RECURRING_FORBIDDEN"))
        );
        self.remember("recurring_denied", &denied);
        self.inspect_actions("recurring_no_transfer", &denied, None, None)
            .await?;

        // Two submissions start together; real receipts serialize the budget.
        // This proves cumulative concurrency, not deterministic observation of
        // the short pre-callback interval (that requires separate fault tests).
        self.capsule("split-run", vec!["search"], None).await?;
        self.quote("split-one", "search", &recipient, 600, false)
            .await?;
        self.quote("split-two", "search", &recipient, 600, false)
            .await?;
        let first = self
            .proposal("split-run", "split-one", "split-first")
            .await?;
        let second = self
            .proposal("split-run", "split-two", "split-second")
            .await?;
        let (first_result, second_result) = tokio::join!(
            self.call(
                "submit_purchase",
                json!({"proposal":first}),
                &self.agent,
                0,
                "split_first"
            ),
            self.call(
                "submit_purchase",
                json!({"proposal":second}),
                &self.agent,
                0,
                "split_second"
            )
        );
        let results = [first_result?, second_result?];
        let mut settled = 0;
        for result in results {
            let response: Value = result.clone().json()?;
            let approved = response["decision"] == "APPROVED";
            if approved {
                settled += 1;
            } else {
                assert!(
                    response["reason_codes"]
                        .as_array()
                        .ok_or("Missing split reasons")?
                        .contains(&json!("INSUFFICIENT_AVAILABLE_BUDGET"))
                );
            }
            self.remember("concurrent_split_result", &result);
            self.inspect_actions(
                "split_actions",
                &result,
                if approved {
                    Some((&recipient, 600))
                } else {
                    None
                },
                if approved {
                    Some("resolve_purchase")
                } else {
                    None
                },
            )
            .await?;
        }
        assert_eq!(settled, 1);
        let split = self.assert_ledger("split-run").await?;
        assert_eq!(split["spent"], "600");
        assert_eq!(split["reserved"], "0");

        // Revocation and provider suspension are actual submit-time checks.
        let revoked = self
            .call(
                "revoke_capsule",
                json!({"capsule_id":"runtime-run"}),
                &self.operator,
                1,
                "runtime_revoke",
            )
            .await?;
        self.remember("runtime_revoke", &revoked);
        let request = self
            .proposal("runtime-run", "runtime-quote", "post-revoke")
            .await?;
        let denied = self
            .call(
                "submit_purchase",
                json!({"proposal":request}),
                &self.agent,
                0,
                "post_revoke_denied",
            )
            .await?;
        assert_eq!(
            denied.clone().json::<Value>()?["reason_codes"][0],
            "CAPSULE_INACTIVE"
        );
        self.remember("post_revoke_denied", &denied);
        self.inspect_actions("revocation_no_transfer", &denied, None, None)
            .await?;
        self.expect_failed_call(
            "set_capsule_paused",
            json!({"capsule_id":"runtime-run","paused":false}),
            true,
            1,
            "CAPSULE_CANNOT_RESUME",
        )
        .await?;
        self.assert_ledger("runtime-run").await?;

        self.storage_limit_checks(&recipient).await?;
        self.liquidity_rollback_check(&recipient).await?;
        Ok(())
    }

    async fn storage_limit_checks(&mut self, recipient: &AccountId) -> TestResult<()> {
        // Full32 funded request records,64-byte IDs, on actual production WASM.
        // Additional maximum scopes/quotes/global state remain to be measured.
        let id = "r".repeat(64);
        self.capsule(&id, vec!["search"], None).await?;
        let quote_id = "q".repeat(64);
        self.quote(&quote_id, "search", recipient, 100, false)
            .await?;
        let before = Account(self.contract.0.clone())
            .view()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .storage_usage;
        for index in 0..32 {
            let request_id = format!("{index:064}");
            let mut proposal = self.proposal(&id, &quote_id, &request_id).await?;
            if index < 31 {
                proposal["expected_quote_hash"] = json!("00".repeat(32));
            }
            let result = self
                .call(
                    "submit_purchase",
                    json!({"proposal":proposal}),
                    &self.agent,
                    0,
                    "funded_request_history",
                )
                .await?;
            assert_eq!(
                result.clone().json::<Value>()?["decision"],
                if index < 31 { "DENIED" } else { "APPROVED" }
            );
            self.remember("funded_request_history", &result);
            if index == 31 {
                self.inspect_actions(
                    "full_request_index_callback",
                    &result,
                    Some((recipient, 100)),
                    Some("resolve_purchase"),
                )
                .await?;
            }
        }
        let proposal = self.proposal(&id, &quote_id, "over-limit").await?;
        self.expect_failed_call(
            "submit_purchase",
            json!({"proposal":proposal}),
            false,
            0,
            "REQUEST_LIMIT",
        )
        .await?;
        let cap = self.assert_ledger(&id).await?;
        assert_eq!(
            cap["request_ids"].as_array().ok_or("Missing index")?.len(),
            32
        );
        assert!(self.purchase(&id, "over-limit").await?.is_null());
        let after = Account(self.contract.0.clone())
            .view()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .storage_usage;
        let increase = after
            .checked_sub(before)
            .ok_or("Storage unexpectedly decreased")?;
        assert!(
            increase < 131_072,
            "Measured request history exceeds prepaid capsule bytes"
        );
        self.evidence.push(json!({"case":"funded_request_history_storage","source":"LOCAL_NEAR_SANDBOX",
            "request_count":32,"id_bytes":64,"measured_added_bytes":increase,"prepaid_capsule_bytes":262144,
            "limitation":"Full request index and one measured healthy callback; not maximum global state, scopes or final outcome metadata"}));
        Ok(())
    }

    async fn liquidity_rollback_check(&mut self, recipient: &AccountId) -> TestResult<()> {
        // Fault injection in this LOCAL node only. Never a contract balance setter.
        self.capsule("liquidity-run", vec!["search"], None).await?;
        self.quote("liquidity-quote", "search", recipient, 100, false)
            .await?;
        let baseline = self.assert_ledger("liquidity-run").await?;
        let account = Account(self.contract.0.clone())
            .view()
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data;
        // The pinned API serializes ContractState to a versioned account record,
        // preserving local/global code identity; it has no direct code_hash field.
        let original = serde_json::to_value(&account)?;
        let mut depleted = original.clone();
        depleted["amount"] = json!("0");
        self.sandbox
            .patch_state(self.contract.0.as_str().parse()?)
            .account(depleted)
            .send()
            .await?;
        let request = self
            .proposal("liquidity-run", "liquidity-quote", "liquidity-request")
            .await?;
        self.expect_failed_call(
            "submit_purchase",
            json!({"proposal":request}),
            false,
            0,
            "INSUFFICIENT_CONTRACT_LIQUIDITY",
        )
        .await?;
        assert_eq!(self.assert_ledger("liquidity-run").await?, baseline);
        assert!(
            self.purchase("liquidity-run", "liquidity-request")
                .await?
                .is_null()
        );
        assert_eq!(
            self.view("get_quote", json!({"quote_id":"liquidity-quote"}))
                .await?["consumed"],
            false
        );
        self.sandbox
            .patch_state(self.contract.0.as_str().parse()?)
            .account(original)
            .send()
            .await?;
        self.evidence.push(json!({"case":"local_liquidity_fault_rollback","source":"LOCAL_NEAR_SANDBOX_FAULT_INJECTION",
            "public_network":false,"reservation_committed":false,"quote_consumed":false}));
        Ok(())
    }
}
