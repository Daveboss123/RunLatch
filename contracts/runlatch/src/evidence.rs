//! Owner-attested evidence, never settlement overrides or independent provider proof.
use crate::{RunLatch, RunLatchExt, hashing, model::*};
use near_sdk::{env, json_types::U64, near, require};

pub const RESOURCE_CRITERIA_HASH: &str =
    "57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9";
const CHECK_IDS: [&str; 3] = ["MANIFEST_BINDING", "FIXTURE_HEALTH", "FIXTURE_ROUTE"];

#[near]
impl RunLatch {
    #[payable]
    pub fn record_provisioning(
        &mut self,
        capsule_id: String,
        request_id: String,
        expected_request_hash: String,
        expected_previous_record_hash: Option<String>,
        evidence: ProvisioningInput,
    ) -> ProvisioningEvidence {
        self.assert_operator();
        Self::assert_one_yocto();
        let key = Self::purchase_key(&capsule_id, &request_id);
        let purchase = self.purchases.get(&key).expect("UNKNOWN_REQUEST");
        require!(
            purchase.request_hash == expected_request_hash,
            "REQUEST_BINDING_MISMATCH"
        );
        require!(
            matches!(
                purchase.status,
                PurchaseStatus::Settled | PurchaseStatus::SettlementFailed
            ),
            "PAYMENT_UNRESOLVED"
        );
        if evidence.status == ProvisioningStatus::Provisioned {
            require!(
                purchase.status == PurchaseStatus::Settled && evidence.artifact_hash.is_some(),
                "PROVISIONING_REQUIRES_SETTLED_PAYMENT_AND_ARTIFACT"
            );
        }
        Self::assert_id(&evidence.source_id);
        require!(
            evidence.observed_at_ns.0 <= env::block_timestamp(),
            "FUTURE_EVIDENCE_TIMESTAMP"
        );
        require!(
            hashing::decode_hash(&evidence.evidence_hash).is_some()
                && evidence
                    .artifact_hash
                    .as_ref()
                    .is_none_or(|h| hashing::decode_hash(h).is_some()),
            "INVALID_EVIDENCE_HASH"
        );
        let mut history = self.provisioning.get(&key).cloned().unwrap_or_default();
        require!(history.len() < 2, "PROVISIONING_HISTORY_LIMIT");
        require!(
            history.last().map(|r| &r.record_hash) == expected_previous_record_hash.as_ref(),
            "EVIDENCE_REVISION_CONFLICT"
        );
        let now = U64(env::block_timestamp());
        let record_hash = hashing::hash_record(
            "runlatch.provisioning.v2",
            &self.network_id,
            &env::current_account_id(),
            &(
                &key,
                &purchase.request_hash,
                &purchase.policy_hash,
                &expected_previous_record_hash,
                &evidence,
                &self.operator_id,
                now,
            ),
        );
        let record = ProvisioningEvidence {
            input: evidence,
            recorded_by: self.operator_id.clone(),
            recorded_at_ns: now,
            record_hash,
            source: "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE".into(),
        };
        history.push(record.clone());
        self.provisioning.insert(key, history);
        Self::emit_evidence("provisioning_recorded", &capsule_id, &record.record_hash);
        record
    }

    #[payable]
    pub fn record_task_check(
        &mut self,
        capsule_id: String,
        request_id: String,
        expected_policy_hash: String,
        expected_request_hash: String,
        report: TaskCheckInput,
    ) -> TaskCheckOutcome {
        self.assert_operator();
        Self::assert_one_yocto();
        Self::assert_id(&capsule_id);
        require!(
            !self.task_checks.contains_key(&capsule_id) && !self.outcomes.contains_key(&capsule_id),
            "VALIDATION_ALREADY_RECORDED"
        );
        let mut capsule = self
            .capsules
            .get(&capsule_id)
            .expect("UNKNOWN_CAPSULE")
            .clone();
        let purchase = self
            .purchases
            .get(&Self::purchase_key(&capsule_id, &request_id))
            .expect("UNKNOWN_REQUEST");
        require!(
            capsule.policy_hash == expected_policy_hash
                && purchase.request_hash == expected_request_hash,
            "TASK_CHECK_BINDING_MISMATCH"
        );
        require!(
            capsule.reserved.0 == 0 && capsule.status != CapsuleStatus::Closing,
            "PENDING_SETTLEMENT_BLOCKS_VALIDATION"
        );
        require!(
            report.report_schema_version == 1
                && report.criteria_id == "website-resource-fixture-v1"
                && report.validator_id == "runlatch-resource-validator"
                && report.validator_version == "1.0.0"
                && report.source == "LOCAL_FIXTURE_VALIDATOR",
            "UNSUPPORTED_VALIDATION_METHOD"
        );
        require!(
            report.criteria_hash == RESOURCE_CRITERIA_HASH
                && report.criteria_hash == capsule.policy.validation_spec_hash,
            "VALIDATION_SPEC_MISMATCH"
        );
        let quote = purchase
            .canonical_quote
            .as_ref()
            .expect("MISSING_CANONICAL_QUOTE");
        require!(
            report.project_id == capsule.policy.project_id
                && report.resource_key == quote.input.resource_key,
            "TASK_RESOURCE_BINDING_MISMATCH"
        );
        require!(
            report.checks.len() == 3
                && report
                    .checks
                    .iter()
                    .zip(CHECK_IDS)
                    .all(|(check, id)| check.check_id == id),
            "INVALID_OBJECTIVE_CHECKS"
        );
        require!(
            report.observed_at_ns.0 <= env::block_timestamp()
                && hashing::decode_hash(&report.evidence_hash).is_some(),
            "INVALID_TASK_EVIDENCE"
        );
        let derived = if report
            .checks
            .iter()
            .any(|c| c.status == ValidationStatus::Error)
        {
            ValidationStatus::Error
        } else if report
            .checks
            .iter()
            .any(|c| c.status == ValidationStatus::Failed)
        {
            ValidationStatus::Failed
        } else {
            ValidationStatus::Passed
        };
        require!(report.status == derived, "INCONSISTENT_TASK_CHECK_RESULT");
        if report.status == ValidationStatus::Error {
            require!(
                report.artifact_hash.is_none() && report.artifact_bytes.is_none(),
                "INCONSISTENT_TASK_ARTIFACT"
            );
        } else {
            require!(
                report
                    .artifact_hash
                    .as_ref()
                    .is_some_and(|h| hashing::decode_hash(h).is_some())
                    && report.artifact_bytes.is_some_and(
                        |n| n <= 16384 && (n > 0 || report.status == ValidationStatus::Failed)
                    ),
                "INVALID_TASK_ARTIFACT"
            );
        }
        if report.status == ValidationStatus::Passed {
            require!(
                purchase.status == PurchaseStatus::Settled,
                "TASK_PASS_REQUIRES_SETTLED_PAYMENT"
            );
        }
        let now = U64(env::block_timestamp());
        let outcome_hash = hashing::hash_record(
            "runlatch.task-check.v2",
            &self.network_id,
            &env::current_account_id(),
            &(
                &capsule_id,
                &request_id,
                &purchase.request_hash,
                &capsule.policy_hash,
                &report,
                &self.operator_id,
                now,
            ),
        );
        let outcome = TaskCheckOutcome {
            capsule_id: capsule_id.clone(),
            request_id,
            request_hash: purchase.request_hash.clone(),
            policy_hash: capsule.policy_hash.clone(),
            report,
            attested_by: self.operator_id.clone(),
            recorded_at_ns: now,
            outcome_hash,
            source: "OWNER_ATTESTED_LOCAL_FIXTURE_CHECK_NOT_EXTERNAL_TRUTH".into(),
        };
        if capsule.status != CapsuleStatus::Closed {
            capsule.status = CapsuleStatus::Completed;
        }
        self.capsules.insert(capsule_id.clone(), capsule);
        self.task_checks.insert(capsule_id.clone(), outcome.clone());
        Self::emit_evidence("task_check_attested", &capsule_id, &outcome.outcome_hash);
        outcome
    }

    #[payable]
    pub fn record_human_acceptance(
        &mut self,
        capsule_id: String,
        expected_outcome_hash: String,
        expected_evidence_snapshot_hash: String,
        decision: AcceptanceDecision,
    ) -> HumanAcceptance {
        self.assert_operator();
        Self::assert_one_yocto();
        Self::assert_id(&capsule_id);
        require!(
            !self.acceptances.contains_key(&capsule_id),
            "HUMAN_ACCEPTANCE_ALREADY_RECORDED"
        );
        let capsule = self.capsules.get(&capsule_id).expect("UNKNOWN_CAPSULE");
        require!(
            capsule.reserved.0 == 0 && capsule.status != CapsuleStatus::Closing,
            "PAYMENT_UNRESOLVED"
        );
        let outcome_hash = self
            .task_checks
            .get(&capsule_id)
            .map(|r| &r.outcome_hash)
            .or_else(|| self.outcomes.get(&capsule_id).map(|r| &r.outcome_hash))
            .expect("TASK_NOT_CHECKED");
        require!(
            outcome_hash == &expected_outcome_hash,
            "ACCEPTANCE_OUTCOME_MISMATCH"
        );
        require!(
            self.get_evidence_snapshot_hash(capsule_id.clone()) == expected_evidence_snapshot_hash,
            "ACCEPTANCE_EVIDENCE_MISMATCH"
        );
        let now = U64(env::block_timestamp());
        let acceptance_hash = hashing::hash_record(
            "runlatch.human-acceptance.v2",
            &self.network_id,
            &env::current_account_id(),
            &(
                &capsule_id,
                &expected_outcome_hash,
                &expected_evidence_snapshot_hash,
                &decision,
                &self.operator_id,
                now,
            ),
        );
        let record = HumanAcceptance {
            capsule_id: capsule_id.clone(),
            outcome_hash: expected_outcome_hash,
            evidence_snapshot_hash: expected_evidence_snapshot_hash,
            decision,
            accepted_by: self.operator_id.clone(),
            recorded_at_ns: now,
            acceptance_hash,
        };
        self.acceptances.insert(capsule_id.clone(), record.clone());
        Self::emit_evidence("human_acceptance", &capsule_id, &record.acceptance_hash);
        record
    }

    pub fn get_task_check(&self, capsule_id: String) -> Option<TaskCheckOutcome> {
        Self::assert_id(&capsule_id);
        self.task_checks.get(&capsule_id).cloned()
    }
    pub fn get_human_acceptance(&self, capsule_id: String) -> Option<HumanAcceptance> {
        Self::assert_id(&capsule_id);
        self.acceptances.get(&capsule_id).cloned()
    }
    pub fn get_provisioning(
        &self,
        capsule_id: String,
        request_id: String,
    ) -> Vec<ProvisioningEvidence> {
        self.provisioning
            .get(&Self::purchase_key(&capsule_id, &request_id))
            .cloned()
            .unwrap_or_default()
    }
    pub fn get_evidence_snapshot_hash(&self, capsule_id: String) -> String {
        Self::assert_id(&capsule_id);
        let capsule = self.capsules.get(&capsule_id).expect("UNKNOWN_CAPSULE");
        let hashes: Vec<_> = capsule
            .request_ids
            .iter()
            .map(|id| {
                let history = self.provisioning.get(&Self::purchase_key(&capsule_id, id));
                (
                    id,
                    history
                        .map(|records| records.iter().map(|r| &r.record_hash).collect::<Vec<_>>())
                        .unwrap_or_default(),
                )
            })
            .collect();
        hashing::hash_record(
            "runlatch.evidence-snapshot.v2",
            &self.network_id,
            &env::current_account_id(),
            &(&capsule_id, &capsule.policy_hash, &hashes),
        )
    }

    pub fn get_capsule_report_snapshot(&self, capsule_id: String) -> ProjectCapsuleSnapshot {
        Self::assert_id(&capsule_id);
        let capsule = self
            .capsules
            .get(&capsule_id)
            .expect("UNKNOWN_CAPSULE")
            .clone();
        let purchases = capsule
            .request_ids
            .iter()
            .map(|id| {
                self.purchases
                    .get(&Self::purchase_key(&capsule_id, id))
                    .expect("REQUEST_INDEX_INVARIANT")
                    .clone()
            })
            .collect();
        let provisioning = capsule
            .request_ids
            .iter()
            .map(|id| PurchaseEvidenceHistory {
                request_id: id.clone(),
                records: self.get_provisioning(capsule_id.clone(), id.clone()),
            })
            .collect();
        ProjectCapsuleSnapshot {
            project: self
                .projects
                .get(&capsule.policy.project_id)
                .expect("PROJECT_INVARIANT")
                .clone(),
            capsule,
            purchases,
            provisioning,
            outcome: self.outcomes.get(&capsule_id).cloned(),
            task_check: self.task_checks.get(&capsule_id).cloned(),
            human_acceptance: self.acceptances.get(&capsule_id).cloned(),
            evidence_snapshot_hash: self.get_evidence_snapshot_hash(capsule_id),
        }
    }
}
impl RunLatch {
    fn emit_evidence(event: &str, capsule_id: &str, hash: &str) {
        let data = near_sdk::serde_json::json!({"standard":"runlatch","version":"2.0.0","event":event,"data":[{"capsule_id":capsule_id,"record_hash":hash}]});
        env::log_str(&format!("EVENT_JSON:{data}"));
    }
}
