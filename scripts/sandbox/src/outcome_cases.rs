//! Actual LOCAL owner attestation of reports produced by the Node validator.
use super::*;

pub(super) fn prepared_reports() -> TestResult<Value> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.local/validation/sandbox-reports.json");
    let metadata = std::fs::metadata(&path)?;
    if !metadata.is_file() || metadata.len() > 16384 {
        return Err("LOCAL_REPORT_FIXTURE_SIZE_LIMIT".into());
    }
    let reports: Value = serde_json::from_slice(&std::fs::read(path)?)?;
    assert_eq!(
        reports["source"],
        "LOCAL_GENERATED_REPORT_FIXTURES_UNATTESTED"
    );
    Ok(reports["reports"].clone())
}

impl Harness {
    pub(super) async fn outcome_checks(&mut self) -> TestResult<()> {
        let reports = prepared_reports()?;
        let recipient = self.publisher.id.clone();
        for (id, report_name) in [
            ("outcome-pass", "pass"),
            ("paid-output-fail", "fail"),
            ("missing-output", "error"),
        ] {
            self.capsule(id, vec!["search"], None).await?;
            if report_name != "error" {
                let quote = format!("{id}-quote");
                self.quote(&quote, "search", &recipient, 100, false).await?;
                let request = self.proposal(id, &quote, "purchase").await?;
                let result = self
                    .call(
                        "submit_purchase",
                        json!({"proposal":request}),
                        &self.agent,
                        0,
                        "outcome_purchase",
                    )
                    .await?;
                self.inspect_actions(
                    "outcome_purchase_actions",
                    &result,
                    Some((&recipient, 100)),
                    Some("resolve_purchase"),
                )
                .await?;
            }
            let capsule = self.assert_ledger(id).await?;
            let args = json!({"capsule_id":id,"expected_policy_hash":capsule["policy_hash"],"report":reports[report_name]});
            self.expect_failed_call(
                "record_validation",
                args.clone(),
                false,
                1,
                "UNAUTHORIZED_OPERATOR",
            )
            .await?;
            let mut wrong = args.clone();
            wrong["expected_policy_hash"] = json!("00".repeat(32));
            self.expect_failed_call(
                "record_validation",
                wrong,
                true,
                1,
                "POLICY_BINDING_MISMATCH",
            )
            .await?;
            assert!(
                self.view("get_outcome", json!({"capsule_id":id}))
                    .await?
                    .is_null()
            );
            assert_eq!(self.assert_ledger(id).await?, capsule);
            let result = self
                .call(
                    "record_validation",
                    args.clone(),
                    &self.operator,
                    1,
                    "owner_attestation",
                )
                .await?;
            self.remember("owner_attestation", &result);
            self.inspect_actions(
                "attestation_no_payment_or_quality_refund",
                &result,
                None,
                None,
            )
            .await?;
            let outcome = self.view("get_outcome", json!({"capsule_id":id})).await?;
            assert_eq!(outcome["attested_by"], self.operator.id.as_str());
            assert_eq!(outcome["source"], "OWNER_ATTESTED_OFFCHAIN_REPORT");
            assert_eq!(outcome["report"], reports[report_name]);
            let completed = self.assert_ledger(id).await?;
            assert_eq!(completed["status"], "COMPLETED");
            assert_eq!(completed["spent"], capsule["spent"]);
            assert_eq!(completed["returned"], "0");
            self.expect_failed_call(
                "record_validation",
                args,
                true,
                1,
                "VALIDATION_ALREADY_RECORDED",
            )
            .await?;
            assert_eq!(
                self.view("get_outcome", json!({"capsule_id":id})).await?,
                outcome
            );
            self.expect_failed_call(
                "set_capsule_paused",
                json!({"capsule_id":id,"paused":false}),
                true,
                1,
                "CAPSULE_CANNOT_RESUME",
            )
            .await?;
            if report_name != "error" {
                let receipt = self
                    .view(
                        "get_receipt",
                        json!({"capsule_id":id,"request_id":"purchase"}),
                    )
                    .await?;
                assert_eq!(receipt["purchase"]["status"], "SETTLED");
                assert_eq!(
                    receipt["outcome"]["report"]["status"],
                    reports[report_name]["status"]
                );
                assert_eq!(receipt["outcome"]["outcome_hash"], outcome["outcome_hash"]);
                assert_eq!(
                    receipt["source"],
                    "CONTRACT_RECORD_PROJECTION_NOT_RPC_EXECUTION_PROOF"
                );
            }
        }
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("outcomes.json"),
            serde_json::to_vec_pretty(&json!({"environment":"LOCAL_NEAR_SANDBOX",
            "result":"OUTCOME_CHECKS_PASSED","public_testnet":false,"report_provenance":"OWNER_ATTESTED_OFFCHAIN_REPORT",
            "independent_research_truth_proven":false,"evidence":self.evidence}))?,
        )?;
        println!(
            "{}",
            json!({"environment":"LOCAL_NEAR_SANDBOX","result":"OUTCOME_CHECKS_PASSED",
            "public_testnet":false,"evidence_file":".local/sandbox/outcomes.json"})
        );
        Ok(())
    }
}
