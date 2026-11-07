//! LOCAL SDK mocks for independent provisioning/check/explicit acceptance axes.
use crate::{RunLatch, evidence::RESOURCE_CRITERIA_HASH, foundation_tests::*, model::*};
use near_sdk::{
    PromiseResult,
    json_types::{U64, U128},
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn fixture_evidence() -> RunLatch {
    let mut c = fixture();
    let credit = c.get_storage_requirements().project_credit.0;
    context("operator.testnet", credit, 10);
    c.create_project(ProjectInput {
        project_id: "client-work".into(),
        organisation_id: "northstar-demo".into(),
        client_ref: "acme-demo".into(),
        budget_ceiling: U128(300),
        expires_at_ns: U64(100_000),
        outcome_definition_hash: "03".repeat(32),
    });
    let mut p = policy();
    p.project_id = "client-work".into();
    p.budget = U128(300);
    p.per_purchase_limit = U128(100);
    p.per_commitment_limit = U128(300);
    p.validation_spec_hash = RESOURCE_CRITERIA_HASH.into();
    let credit = c.get_storage_requirements().capsule_credit;
    context("operator.testnet", 300 + credit.0, 10);
    c.create_capsule("work".into(), p, credit);
    publish(&mut c, quote_input("database", 50));
    let r = PurchaseProposal {
        project_id: "client-work".into(),
        project_revision: U64(1),
        capsule_id: "work".into(),
        request_id: "db".into(),
        quote_id: "database".into(),
        expected_quote_hash: c.get_quote("database".into()).unwrap().quote_hash,
    };
    context("agent.testnet", 0, 20);
    drop(c.submit_purchase(r));
    let mut b = near_sdk::test_utils::VMContextBuilder::new();
    b.current_account_id(account("contract.testnet"))
        .predecessor_account_id(account("contract.testnet"))
        .block_timestamp(25);
    near_sdk::testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(Vec::new())]
    );
    c.resolve_purchase("work:db".into());
    c
}
fn provisioning(status: ProvisioningStatus) -> ProvisioningInput {
    ProvisioningInput {
        status,
        trust_class: EvidenceTrustClass::DemoFixture,
        source_id: "database-fixture".into(),
        observed_at_ns: U64(25),
        artifact_hash: Some("04".repeat(32)),
        evidence_hash: "05".repeat(32),
    }
}
fn record(
    c: &mut RunLatch,
    status: ProvisioningStatus,
    previous: Option<String>,
) -> ProvisioningEvidence {
    let hash = c
        .get_purchase("work".into(), "db".into())
        .unwrap()
        .request_hash;
    context("operator.testnet", 1, 30);
    c.record_provisioning(
        "work".into(),
        "db".into(),
        hash,
        previous,
        provisioning(status),
    )
}
fn report() -> TaskCheckInput {
    TaskCheckInput {
        report_schema_version: 1,
        criteria_id: "website-resource-fixture-v1".into(),
        criteria_hash: RESOURCE_CRITERIA_HASH.into(),
        validator_id: "runlatch-resource-validator".into(),
        validator_version: "1.0.0".into(),
        source: "LOCAL_FIXTURE_VALIDATOR".into(),
        project_id: "client-work".into(),
        resource_key: "database".into(),
        artifact_hash: Some("04".repeat(32)),
        artifact_bytes: Some(500),
        evidence_hash: "06".repeat(32),
        observed_at_ns: U64(25),
        status: ValidationStatus::Passed,
        checks: ["MANIFEST_BINDING", "FIXTURE_HEALTH", "FIXTURE_ROUTE"]
            .into_iter()
            .map(|id| ObjectiveCheckSummary {
                check_id: id.into(),
                status: ValidationStatus::Passed,
            })
            .collect(),
    }
}
fn check(c: &mut RunLatch, r: TaskCheckInput) -> TaskCheckOutcome {
    let p = c.get_capsule("work".into()).unwrap();
    let request = c.get_purchase("work".into(), "db".into()).unwrap();
    context("operator.testnet", 1, 30);
    c.record_task_check(
        "work".into(),
        "db".into(),
        p.policy_hash,
        request.request_hash,
        r,
    )
}

#[test]
fn p15_provisioning_failure_does_not_change_confirmed_payment() {
    let mut c = fixture_evidence();
    record(&mut c, ProvisioningStatus::Failed, None);
    let receipt = c.get_receipt("work".into(), "db".into()).unwrap();
    assert_eq!(receipt.purchase.status, PurchaseStatus::Settled);
    assert_eq!(
        receipt.provisioning_history[0].input.status,
        ProvisioningStatus::Failed
    );
    assert_eq!(receipt.capsule.spent.0, 50);
    assert!(receipt.human_acceptance.is_none());
}
#[test]
fn p15_provisioning_history_is_bounded_linked_and_not_a_provider_signature() {
    let mut c = fixture_evidence();
    let first = record(&mut c, ProvisioningStatus::Provisioned, None);
    assert_eq!(
        first.source,
        "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE"
    );
    assert!(
        catch_unwind(AssertUnwindSafe(|| record(
            &mut c,
            ProvisioningStatus::Failed,
            None
        )))
        .is_err()
    );
    let second = record(
        &mut c,
        ProvisioningStatus::Failed,
        Some(first.record_hash.clone()),
    );
    assert_ne!(first.record_hash, second.record_hash);
    assert!(
        catch_unwind(AssertUnwindSafe(|| record(
            &mut c,
            ProvisioningStatus::Unknown,
            Some(second.record_hash)
        )))
        .is_err()
    );
    assert_eq!(c.get_provisioning("work".into(), "db".into()).len(), 2);
}
#[test]
fn p16_p18_agent_cannot_record_provisioning_task_check_or_human_acceptance() {
    let mut c = fixture_evidence();
    let p = c.get_capsule("work".into()).unwrap();
    let request = c.get_purchase("work".into(), "db".into()).unwrap();
    context("agent.testnet", 1, 30);
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.record_provisioning(
            "work".into(),
            "db".into(),
            request.request_hash.clone(),
            None,
            provisioning(ProvisioningStatus::Provisioned)
        )))
        .is_err()
    );
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.record_task_check(
            "work".into(),
            "db".into(),
            p.policy_hash,
            request.request_hash,
            report()
        )))
        .is_err()
    );
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.record_human_acceptance(
            "work".into(),
            "04".repeat(32),
            "05".repeat(32),
            AcceptanceDecision::Accepted
        )))
        .is_err()
    );
}
#[test]
fn p17_task_report_binds_predeclared_criteria_resource_and_exact_check_set() {
    let mut c = fixture_evidence();
    for index in 0..4 {
        let mut r = report();
        match index {
            0 => r.criteria_hash = "04".repeat(32),
            1 => r.resource_key = "other-resource".into(),
            2 => {
                r.checks.pop();
            }
            _ => r.status = ValidationStatus::Failed,
        }
        assert!(catch_unwind(AssertUnwindSafe(|| check(&mut c, r))).is_err());
    }
    let outcome = check(&mut c, report());
    assert_eq!(outcome.report.status, ValidationStatus::Passed);
    assert_eq!(c.get_capsule("work".into()).unwrap().spent.0, 50);
    assert!(c.get_human_acceptance("work".into()).is_none());
    assert!(catch_unwind(AssertUnwindSafe(|| check(&mut c, report()))).is_err());
}
#[test]
fn p18_human_acceptance_requires_exact_outcome_and_evidence_and_is_immutable() {
    let mut c = fixture_evidence();
    record(&mut c, ProvisioningStatus::Provisioned, None);
    let outcome = check(&mut c, report());
    let snapshot = c.get_evidence_snapshot_hash("work".into());
    context("operator.testnet", 1, 31);
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.record_human_acceptance(
            "work".into(),
            "00".repeat(32),
            snapshot.clone(),
            AcceptanceDecision::Accepted
        )))
        .is_err()
    );
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.record_human_acceptance(
            "work".into(),
            outcome.outcome_hash.clone(),
            "00".repeat(32),
            AcceptanceDecision::Accepted
        )))
        .is_err()
    );
    let acceptance = c.record_human_acceptance(
        "work".into(),
        outcome.outcome_hash.clone(),
        snapshot,
        AcceptanceDecision::Accepted,
    );
    assert_eq!(acceptance.accepted_by, account("operator.testnet"));
    assert_eq!(acceptance.recorded_at_ns.0, 31);
    assert!(
        c.get_receipt("work".into(), "db".into())
            .unwrap()
            .acceptance_matches_current_evidence
    );
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.record_human_acceptance(
            "work".into(),
            outcome.outcome_hash,
            "00".repeat(32),
            AcceptanceDecision::Rejected
        )))
        .is_err()
    );
}
#[test]
fn p18_later_provisioning_failure_preserves_historical_acceptance_but_marks_it_stale() {
    let mut c = fixture_evidence();
    let first = record(&mut c, ProvisioningStatus::Provisioned, None);
    let outcome = check(&mut c, report());
    let snapshot = c.get_evidence_snapshot_hash("work".into());
    context("operator.testnet", 1, 31);
    c.record_human_acceptance(
        "work".into(),
        outcome.outcome_hash,
        snapshot,
        AcceptanceDecision::Accepted,
    );
    record(&mut c, ProvisioningStatus::Failed, Some(first.record_hash));
    let receipt = c.get_receipt("work".into(), "db".into()).unwrap();
    assert!(!receipt.acceptance_matches_current_evidence);
    assert_eq!(
        receipt.human_acceptance.unwrap().decision,
        AcceptanceDecision::Accepted
    );
    assert_eq!(receipt.purchase.status, PurchaseStatus::Settled);
}

#[test]
fn p19_snapshot_is_bounded_read_only_and_matches_canonical_receipt() {
    let mut c = fixture_evidence();
    record(&mut c, ProvisioningStatus::Provisioned, None);
    check(&mut c, report());
    let before =
        near_sdk::serde_json::to_vec(&c.get_receipt("work".into(), "db".into()).unwrap()).unwrap();
    let snapshot = c.get_capsule_report_snapshot("work".into());
    assert_eq!(snapshot.purchases.len(), snapshot.capsule.request_ids.len());
    assert_eq!(snapshot.provisioning[0].records.len(), 1);
    assert_eq!(
        snapshot.project.input.project_id,
        snapshot.capsule.policy.project_id
    );
    assert_eq!(
        snapshot.evidence_snapshot_hash,
        c.get_evidence_snapshot_hash("work".into())
    );
    assert_eq!(
        before,
        near_sdk::serde_json::to_vec(&c.get_receipt("work".into(), "db".into()).unwrap()).unwrap()
    );
}

#[test]
fn p17_empty_invalid_artifact_can_be_attested_as_failed_not_missing_or_passed() {
    let mut c = fixture_evidence();
    let mut failed = report();
    failed.artifact_bytes = Some(0);
    failed.status = ValidationStatus::Failed;
    for check in &mut failed.checks {
        check.status = ValidationStatus::Failed;
    }
    let outcome = check(&mut c, failed);
    assert_eq!(outcome.report.artifact_bytes, Some(0));
    assert_eq!(outcome.report.status, ValidationStatus::Failed);
    assert_eq!(c.get_capsule("work".into()).unwrap().spent.0, 50);
}

#[test]
fn p14_conservative_serialized_storage_envelope_includes_all_evidence_slots() {
    // Synthetic serialization envelope, not actual trie/runtime measurements.
    // Deliberately overstates trace/reason strings; fixture validity is not claimed.
    let c = fixture_evidence();
    let mut request = c.get_purchase("work".into(), "db".into()).unwrap();
    request.proposal.project_id = "j".repeat(64);
    request.proposal.capsule_id = "c".repeat(64);
    request.proposal.request_id = "r".repeat(64);
    request.proposal.quote_id = "q".repeat(64);
    request.policy_hash = "03".repeat(32);
    request.resource_fingerprint = Some("04".repeat(32));
    request.approved_by = Some(account(&"o".repeat(64)));
    request.reason_codes = (0..29).map(|_| "X".repeat(64)).collect();
    request.checks = (0..29)
        .map(|_| CheckOutput {
            rule: "R".repeat(64),
            state: "NOT_EVALUATED".into(),
        })
        .collect();
    let quote = request.canonical_quote.as_mut().unwrap();
    for field in [
        &mut quote.input.quote_id,
        &mut quote.input.provider_id,
        &mut quote.input.service_id,
        &mut quote.input.category,
        &mut quote.input.resource_key,
    ] {
        *field = "q".repeat(64);
    }
    quote.input.recipient_id = account(&"p".repeat(64));
    quote.publisher_id = account(&"p".repeat(64));
    quote.input.previous_quote_id = Some("q".repeat(64));
    quote.input.commercial_terms = Some(CommercialTerms {
        billing_model: BillingModel::FixedRecurring,
        cadence: BillingCadence::Monthly,
        period_charge: U128(20),
        required_periods: 120,
        mandatory_fees: U128(0),
        known_taxes: U128(0),
        setup_fees: U128(0),
        auto_renew: false,
        cancellation_terms_hash: "03".repeat(32),
        source_evidence_hash: "04".repeat(32),
        future_obligation_contingent_on_initial_payment: true,
    });
    let evidence = ProvisioningEvidence {
        input: ProvisioningInput {
            source_id: "s".repeat(64),
            ..provisioning(ProvisioningStatus::Provisioned)
        },
        recorded_by: account(&"o".repeat(64)),
        recorded_at_ns: U64(30),
        record_hash: "04".repeat(32),
        source: "OWNER_RECORDED_OFFCHAIN_EVIDENCE_NOT_PROVIDER_SIGNATURE".into(),
    };
    let size = |value: &dyn Fn() -> Vec<u8>| value().len() as u128;
    let request_bytes = size(&|| near_sdk::borsh::to_vec(&request).unwrap());
    let evidence_bytes =
        size(&|| near_sdk::borsh::to_vec(&vec![evidence.clone(), evidence.clone()]).unwrap());
    //256 per map entry conservatively includes keys/trie overhead;8KiB capsule
    // and8KiB terminal outcome/acceptance allow either validator family.
    let envelope = 32 * (request_bytes + evidence_bytes + 3 * 256) + 16384;
    println!(
        "SYNTHETIC_STORAGE_ENVELOPE request={request_bytes} two_evidence={evidence_bytes} total={envelope} prepaid={CAPSULE_STORAGE_BYTES}"
    );
    assert!(
        envelope < CAPSULE_STORAGE_BYTES,
        "Bounded schema2 storage envelope exceeded conservative reserve"
    );
}
