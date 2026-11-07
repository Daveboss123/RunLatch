//! Actual LOCAL WASM project freshness/full-term/duplicate/collateral checks.
use super::*;

fn commercial_terms() -> Value {
    json!({"billing_model":"FIXED_RECURRING","cadence":"MONTHLY","period_charge":"20","required_periods":12,
        "mandatory_fees":"0","known_taxes":"0","setup_fees":"0","auto_renew":false,
        "cancellation_terms_hash":"03".repeat(32),"source_evidence_hash":"04".repeat(32),
        "future_obligation_contingent_on_initial_payment":true})
}
impl Harness {
    async fn work_capsule_fixture(
        &mut self,
        id: &str,
        threshold: Option<&str>,
        providers: Vec<&str>,
    ) -> TestResult<()> {
        self.project_fixture(id, 300).await?;
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let result=self.call("create_capsule",json!({"capsule_id":id,"storage_credit":credit["capsule_credit"],"policy":{
            "project_id":id,"project_revision":"1","task_id":"booking-website","workflow_id":"website-resource-fixture-v1",
            "agent_id":self.agent.id,"agent_public_key":self.agent.public_key.to_string(),"budget":"300","per_purchase_limit":"100",
            "per_commitment_limit":"300","recurring_policy":"REQUIRE_APPROVAL","allowed_provider_ids":providers,
            "allowed_service_ids":["search-batch"],"allowed_categories":["search"],"max_quantity":20,"approval_threshold":threshold,
            "expires_at_ns":self.expires_at_ns.to_string(),"validation_spec_hash":"b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b"}}),
            &self.operator,parse_amount(&credit["capsule_credit"])?+300,"project_bound_capsule").await?;
        self.remember("project_bound_capsule", &result);
        Ok(())
    }
    async fn commercial_quote_fixture(
        &mut self,
        id: &str,
        resource: &str,
        provider: &str,
        recipient: &AccountId,
        price: u128,
        recurring: bool,
    ) -> TestResult<()> {
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let result=self.call("publish_quote",json!({"quote":{"quote_id":id,"provider_id":provider,"recipient_id":recipient,
            "service_id":"search-batch","category":"search","resource_key":resource,"quantity":20,"price":price.to_string(),
            "asset":"near-native","recurring":recurring,"expires_at_ns":self.expires_at_ns.to_string(),"previous_quote_id":null,
            "commercial_terms":if recurring {commercial_terms()} else {Value::Null}}}),
            &self.publisher,parse_amount(&credit["quote_credit"])?,"commercial_quote_fixture").await?;
        self.remember("commercial_quote_fixture", &result);
        Ok(())
    }
    async fn direction_submit(
        &mut self,
        capsule: &str,
        quote: &str,
        request: &str,
        expected: &str,
    ) -> TestResult<Value> {
        let proposal = self.proposal(capsule, quote, request).await?;
        let result = self
            .call(
                "submit_purchase",
                json!({"proposal":proposal}),
                &self.agent,
                0,
                "direction_request",
            )
            .await?;
        let response: Value = result.clone().json()?;
        assert_eq!(response["decision"], expected);
        self.remember("direction_request", &result);
        if expected != "APPROVED" {
            self.inspect_actions("direction_no_transfer", &result, None, None)
                .await?;
        }
        Ok(response)
    }
    pub(super) async fn project_commitment_checks(&mut self) -> TestResult<()> {
        let recipient = self.publisher.id.clone();
        self.work_capsule_fixture("agency-work", None, vec!["search"])
            .await?;
        self.commercial_quote_fixture("database-50", "booking-db", "search", &recipient, 50, false)
            .await?;
        let original = self.assert_ledger("agency-work").await?;
        for project_oversized in [true, false] {
            let mut invalid = self
                .proposal("agency-work", "database-50", "oversized-input")
                .await?;
            if project_oversized {
                invalid["project_id"] = json!("x".repeat(65));
            } else {
                invalid["expected_quote_hash"] = json!("0".repeat(65));
            }
            self.expect_failed_call(
                "submit_purchase",
                json!({"proposal":invalid}),
                false,
                0,
                if project_oversized {
                    "INVALID_ID"
                } else {
                    "QUOTE_HASH_SIZE_LIMIT"
                },
            )
            .await?;
            assert!(
                self.purchase("agency-work", "oversized-input")
                    .await?
                    .is_null()
            );
            assert_eq!(self.assert_ledger("agency-work").await?, original);
        }
        self.direction_submit("agency-work", "database-50", "database", "APPROVED")
            .await?;
        assert_eq!(
            self.purchase("agency-work", "database").await?["status"],
            "SETTLED"
        );
        self.assert_ledger("agency-work").await?;
        self.commercial_quote_fixture("database-65", "booking-db", "search", &recipient, 65, false)
            .await?;
        let duplicate = self
            .direction_submit("agency-work", "database-65", "duplicate", "DENIED")
            .await?;
        assert!(
            duplicate["reason_codes"]
                .as_array()
                .ok_or("No reasons")?
                .contains(&json!("DUPLICATE_RESOURCE"))
        );
        self.commercial_quote_fixture(
            "subscription-20",
            "booking-plan",
            "search",
            &recipient,
            20,
            true,
        )
        .await?;
        self.direction_submit(
            "agency-work",
            "subscription-20",
            "subscription",
            "APPROVAL_REQUIRED",
        )
        .await?;
        let pending = self.assert_ledger("agency-work").await?;
        assert_eq!(pending["reserved"], "0");
        assert_eq!(pending["committed_future"], "0");
        let request = self.purchase("agency-work", "subscription").await?;
        let approved=self.call("approve_purchase",json!({"capsule_id":"agency-work","request_id":"subscription","expected_request_hash":request["request_hash"]}),
            &self.operator,1,"recurring_exact_owner_review").await?;
        self.remember("recurring_exact_owner_review", &approved);
        self.inspect_actions(
            "recurring_initial_only",
            &approved,
            Some((&recipient, 20)),
            Some("resolve_purchase"),
        )
        .await?;
        let current = self.assert_ledger("agency-work").await?;
        assert_eq!(current["spent"], "70");
        assert_eq!(current["committed_future"], "220");
        let f = self
            .view("get_financials", json!({"capsule_id":"agency-work"}))
            .await?;
        assert_eq!(f["available_now"], "230");
        assert_eq!(f["available_to_commit"], "10");
        self.commercial_quote_fixture(
            "additional-20",
            "other-resource",
            "search",
            &recipient,
            20,
            false,
        )
        .await?;
        let denied = self
            .direction_submit("agency-work", "additional-20", "over-commit", "DENIED")
            .await?;
        assert!(
            denied["reason_codes"]
                .as_array()
                .ok_or("No reasons")?
                .contains(&json!("INSUFFICIENT_COMMITMENT_BUDGET"))
        );
        let revoke = self
            .call(
                "revoke_capsule",
                json!({"capsule_id":"agency-work"}),
                &self.operator,
                1,
                "direction_revoke",
            )
            .await?;
        self.remember("direction_revoke", &revoke);
        let close = self
            .call(
                "close_capsule",
                json!({"capsule_id":"agency-work"}),
                &self.operator,
                1,
                "commitment_excluding_owner_return",
            )
            .await?;
        let owner = self.operator.id.clone();
        self.inspect_actions(
            "return_surplus_only",
            &close,
            Some((&owner, 10)),
            Some("resolve_owner_refund"),
        )
        .await?;
        let closed = self.assert_ledger("agency-work").await?;
        assert_eq!(closed["allocated"], "290");
        assert_eq!(closed["committed_future"], "220");

        self.work_capsule_fixture("stale-work", Some("0"), vec!["search"])
            .await?;
        self.commercial_quote_fixture(
            "stale-quote",
            "stale-resource",
            "search",
            &recipient,
            50,
            false,
        )
        .await?;
        self.direction_submit("stale-work", "stale-quote", "waiting", "APPROVAL_REQUIRED")
            .await?;
        self.expect_failed_call(
            "set_project_status",
            json!({"project_id":"stale-work","expected_revision":"1","status":"CANCELLED"}),
            false,
            1,
            "UNAUTHORIZED_OPERATOR",
        )
        .await?;
        let change = self
            .call(
                "advance_project_revision",
                json!({"project_id":"stale-work","expected_revision":"1"}),
                &self.operator,
                1,
                "project_revision_change",
            )
            .await?;
        self.remember("project_revision_change", &change);
        let request = self.purchase("stale-work", "waiting").await?;
        let denied=self.call("approve_purchase",json!({"capsule_id":"stale-work","request_id":"waiting","expected_request_hash":request["request_hash"]}),&self.operator,1,"stale_approval").await?;
        assert_eq!(
            denied.clone().json::<Value>()?["reason_codes"][0],
            "STALE_PROJECT_REVISION"
        );
        self.inspect_actions("stale_approval_no_transfer", &denied, None, None)
            .await?;
        self.direction_submit("stale-work", "stale-quote", "old-agent-request", "DENIED")
            .await?;
        self.assert_ledger("stale-work").await?;
        let cancel = self
            .call(
                "set_project_status",
                json!({"project_id":"stale-work","expected_revision":"2","status":"CANCELLED"}),
                &self.operator,
                1,
                "project_cancel",
            )
            .await?;
        self.remember("project_cancel", &cancel);
        self.expect_failed_call(
            "set_project_status",
            json!({"project_id":"stale-work","expected_revision":"3","status":"ACTIVE"}),
            true,
            1,
            "PROJECT_TERMINAL",
        )
        .await?;

        let missing: AccountId = "missing-commitment.sandbox".parse()?;
        let credit = self.view("get_storage_requirements", json!({})).await?;
        let registered = self.call("register_provider",json!({"provider_id":"failure-fixture","publisher_id":self.publisher.id,"recipient_id":missing}),&self.operator,
            parse_amount(&credit["provider_credit"])?,"contingent_failure_provider").await?;
        self.remember("contingent_failure_provider", &registered);
        self.work_capsule_fixture("failed-obligation", None, vec!["failure-fixture"])
            .await?;
        self.commercial_quote_fixture(
            "failed-subscription",
            "failed-resource",
            "failure-fixture",
            &missing,
            20,
            true,
        )
        .await?;
        self.direction_submit(
            "failed-obligation",
            "failed-subscription",
            "failed-initial",
            "APPROVAL_REQUIRED",
        )
        .await?;
        let request = self.purchase("failed-obligation", "failed-initial").await?;
        let failure=self.call("approve_purchase",json!({"capsule_id":"failed-obligation","request_id":"failed-initial","expected_request_hash":request["request_hash"]}),&self.operator,1,"contingent_failure_resolution").await?;
        assert!(!failure.receipt_failures().is_empty());
        let failed = self.assert_ledger("failed-obligation").await?;
        assert_eq!(failed["spent"], "0");
        assert_eq!(failed["committed_future"], "0");
        assert_eq!(
            self.purchase("failed-obligation", "failed-initial").await?["status"],
            "SETTLEMENT_FAILED"
        );
        self.commercial_quote_fixture(
            "new-failed-subscription",
            "failed-resource",
            "failure-fixture",
            &missing,
            20,
            true,
        )
        .await?;
        self.direction_submit(
            "failed-obligation",
            "new-failed-subscription",
            "new-review",
            "APPROVAL_REQUIRED",
        )
        .await?;

        let report = json!({"source":"LOCAL_NEAR_SANDBOX_PROJECT_COMMITMENT_CHECKS","public_testnet":false,
            "result":"PROJECT_COMMITMENT_CHECKS_PASSED","evidence":self.evidence,"closed_commitment_capsule":closed});
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("projects.json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        println!(
            "{}",
            serde_json::to_string(
                &json!({"source":report["source"],"result":report["result"],"public_testnet":false,
            "evidence_file":".local/sandbox/projects.json"})
            )?
        );
        Ok(())
    }
}
