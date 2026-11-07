//! LOCAL SDK mocks: full commitments, exact resource claims and callback accounting.
use crate::{RunLatch, commitment, foundation_tests::*, model::*};
use near_sdk::{
    PromiseOrValue, PromiseResult,
    json_types::{U64, U128},
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn terms() -> CommercialTerms {
    CommercialTerms {
        billing_model: BillingModel::FixedRecurring,
        cadence: BillingCadence::Monthly,
        period_charge: U128(20),
        required_periods: 12,
        mandatory_fees: U128(0),
        known_taxes: U128(0),
        setup_fees: U128(0),
        auto_renew: false,
        cancellation_terms_hash: "03".repeat(32),
        source_evidence_hash: "04".repeat(32),
        future_obligation_contingent_on_initial_payment: true,
    }
}
fn recurring(id: &str) -> QuoteInput {
    let mut q = quote_input(id, 20);
    q.recurring = true;
    q.commercial_terms = Some(terms());
    q
}
fn setup() -> RunLatch {
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
    p.recurring_policy = RecurringPolicy::RequireApproval;
    let credit = c.get_storage_requirements().capsule_credit;
    context("operator.testnet", 300 + credit.0, 10);
    c.create_capsule("work".into(), p, credit);
    c
}
fn submit(c: &mut RunLatch, q: &str, id: &str) -> PromiseOrValue<PurchaseResponse> {
    let r = PurchaseProposal {
        project_id: "client-work".into(),
        project_revision: U64(1),
        capsule_id: "work".into(),
        request_id: id.into(),
        quote_id: q.into(),
        expected_quote_hash: c.get_quote(q.into()).unwrap().quote_hash,
    };
    context("agent.testnet", 0, 20);
    c.submit_purchase(r)
}
fn approve(c: &mut RunLatch, id: &str) {
    let hash = c
        .get_purchase("work".into(), id.into())
        .unwrap()
        .request_hash;
    context("operator.testnet", 1, 21);
    drop(c.approve_purchase("work".into(), id.into(), hash));
}
fn resolve(c: &mut RunLatch, id: &str, result: Option<bool>) {
    let mut b = near_sdk::test_utils::VMContextBuilder::new();
    b.current_account_id(account("contract.testnet"))
        .predecessor_account_id(account("contract.testnet"));
    let results = result
        .map(|success| {
            if success {
                PromiseResult::Successful(Vec::new())
            } else {
                PromiseResult::Failed
            }
        })
        .into_iter()
        .collect();
    near_sdk::testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
    c.resolve_purchase(format!("work:{id}"));
}
#[test]
fn p06_fixed_term_twenty_now_is_two_forty_with_explicit_upfront_charges() {
    let mut q = recurring("q");
    assert_eq!(commitment::total_commitment(&q), Ok(Some(240)));
    let t = q.commercial_terms.as_mut().unwrap();
    t.mandatory_fees = U128(2);
    t.known_taxes = U128(3);
    t.setup_fees = U128(4);
    q.price = U128(29);
    assert_eq!(commitment::total_commitment(&q), Ok(Some(249)));
    q.price = U128(20);
    assert_eq!(
        commitment::total_commitment(&q),
        Err("COMMERCIAL_AMOUNT_MISMATCH")
    );
}
#[test]
fn p07_recurring_requires_exact_review_and_no_capacity_is_held_before_it() {
    let mut c = setup();
    publish(&mut c, recurring("q"));
    let PromiseOrValue::Value(p) = submit(&mut c, "q", "r") else {
        panic!("recurring auto paid")
    };
    assert_eq!(p.decision, "APPROVAL_REQUIRED");
    let capsule = c.get_capsule("work".into()).unwrap();
    assert_eq!((capsule.reserved.0, capsule.committed_future.0), (0, 0));
    assert!(!c.get_quote("q".into()).unwrap().consumed);
    approve(&mut c, "r");
    let capsule = c.get_capsule("work".into()).unwrap();
    assert_eq!(
        (
            capsule.reserved.0,
            capsule.committed_future.0,
            capsule.available_to_commit().0
        ),
        (20, 220, 60)
    );
}
#[test]
fn p09_full_exposure_not_first_payment_drives_denial() {
    let mut c = setup();
    publish(&mut c, quote_input("database", 70));
    drop(submit(&mut c, "database", "db"));
    resolve(&mut c, "db", Some(true));
    publish(&mut c, recurring("subscription"));
    let PromiseOrValue::Value(r) = submit(&mut c, "subscription", "sub") else {
        panic!("full exposure exceeded")
    };
    assert!(
        r.reason_codes
            .contains(&"INSUFFICIENT_COMMITMENT_BUDGET".into())
    );
    assert_eq!(c.get_capsule("work".into()).unwrap().spent.0, 70);
    assert!(!c.get_quote("subscription".into()).unwrap().consumed);
}
#[test]
fn p10_p11_fresh_quote_cannot_bypass_exact_resource_claim() {
    let mut c = setup();
    let first = quote_input("q1", 50);
    let mut second = quote_input("q2", 65);
    second.resource_key = first.resource_key.clone();
    publish(&mut c, first);
    publish(&mut c, second);
    drop(submit(&mut c, "q1", "first"));
    let PromiseOrValue::Value(r) = submit(&mut c, "q2", "second") else {
        panic!("duplicate resource paid")
    };
    assert!(r.reason_codes.contains(&"DUPLICATE_RESOURCE".into()));
    assert!(!c.get_quote("q2".into()).unwrap().consumed);
}
#[test]
fn p11_pending_approvals_recheck_resource_after_first_authorization() {
    let mut c = setup();
    let first = recurring("q1");
    let mut second = recurring("q2");
    second.resource_key = first.resource_key.clone();
    publish(&mut c, first);
    publish(&mut c, second);
    drop(submit(&mut c, "q1", "one"));
    drop(submit(&mut c, "q2", "two"));
    approve(&mut c, "one");
    let hash = c
        .get_purchase("work".into(), "two".into())
        .unwrap()
        .request_hash;
    context("operator.testnet", 1, 21);
    let PromiseOrValue::Value(r) = c.approve_purchase("work".into(), "two".into(), hash) else {
        panic!("duplicate approval paid")
    };
    assert!(r.reason_codes.contains(&"DUPLICATE_RESOURCE".into()));
}
#[test]
fn p12_success_keeps_future_and_duplicate_callbacks_cannot_double_count() {
    let mut c = setup();
    publish(&mut c, recurring("q"));
    drop(submit(&mut c, "q", "r"));
    approve(&mut c, "r");
    resolve(&mut c, "r", Some(true));
    resolve(&mut c, "r", Some(false));
    let f = c.get_financials("work".into());
    assert_eq!(
        (
            f.spent.0,
            f.reserved.0,
            f.committed_future.0,
            f.available_now.0,
            f.available_to_commit.0
        ),
        (20, 0, 220, 280, 60)
    );
}
#[test]
fn p12_confirmed_contingent_initial_failure_releases_exact_future_and_resource() {
    let mut c = setup();
    publish(&mut c, recurring("q"));
    drop(submit(&mut c, "q", "r"));
    approve(&mut c, "r");
    resolve(&mut c, "r", Some(false));
    let f = c.get_financials("work".into());
    assert_eq!((f.spent.0, f.reserved.0, f.committed_future.0), (0, 0, 0));
    let mut retry = recurring("retry");
    retry.resource_key = "q".into();
    publish(&mut c, retry);
    let PromiseOrValue::Value(r) = submit(&mut c, "retry", "new") else {
        panic!("recurring no approval")
    };
    assert_eq!(r.decision, "APPROVAL_REQUIRED");
}
#[test]
fn p12_unknown_context_quarantines_initial_and_future_authority() {
    let mut c = setup();
    publish(&mut c, recurring("q"));
    drop(submit(&mut c, "q", "r"));
    approve(&mut c, "r");
    resolve(&mut c, "r", None);
    let f = c.get_financials("work".into());
    assert_eq!(
        (f.spent.0, f.reserved.0, f.committed_future.0),
        (0, 20, 220)
    );
    assert!(
        c.get_purchase("work".into(), "r".into())
            .unwrap()
            .reconciliation_required
    );
}
#[test]
fn p13_owner_return_excludes_future_obligation_collateral() {
    let mut c = setup();
    publish(&mut c, recurring("q"));
    drop(submit(&mut c, "q", "r"));
    approve(&mut c, "r");
    resolve(&mut c, "r", Some(true));
    context("operator.testnet", 1, 30);
    c.revoke_capsule("work".into());
    drop(c.close_capsule("work".into()));
    assert_eq!(c.get_owner_refund("work".into()).unwrap().amount.0, 60);
    assert_eq!(
        c.get_capsule("work".into()).unwrap().committed_future.0,
        220
    );
}
#[test]
fn p08_unbounded_renewal_unknown_fees_and_overflow_never_authorize() {
    let mut c = setup();
    let mut q = recurring("auto");
    q.commercial_terms.as_mut().unwrap().auto_renew = true;
    publish(&mut c, q);
    let PromiseOrValue::Value(r) = submit(&mut c, "auto", "r") else {
        panic!("unbounded paid")
    };
    assert!(r.reason_codes.contains(&"UNBOUNDED_COMMITMENT".into()));
    let mut q = recurring("unknown");
    q.commercial_terms.as_mut().unwrap().billing_model = BillingModel::UnknownExposure;
    assert_eq!(commitment::total_commitment(&q), Ok(None));
    q = recurring("overflow");
    q.price = U128(u128::MAX);
    q.commercial_terms.as_mut().unwrap().period_charge = U128(u128::MAX);
    assert_eq!(commitment::total_commitment(&q), Err("COMMITMENT_OVERFLOW"));
    assert!(catch_unwind(AssertUnwindSafe(|| publish(&mut c, q))).is_err());
}

#[test]
fn p06_p10_quote_v2_and_resource_bytes_match_independent_webcrypto_borsh_golden() {
    context("contract.testnet", 0, 10);
    let golden: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(include_str!("../../../fixtures/hashes/quote-v2.json"))
            .unwrap();
    let terms: QuoteTerms = near_sdk::serde_json::from_value(golden["terms"].clone()).unwrap();
    let network = golden["network"].as_str().unwrap();
    let contract = account(golden["contract"].as_str().unwrap());
    let bytes =
        near_sdk::borsh::to_vec(&("runlatch.quote.v2", network, &contract, &terms)).unwrap();
    assert_eq!(
        crate::hashing::encode_hash(&bytes),
        golden["expected_bytes_hex"]
    );
    assert_eq!(
        crate::hashing::hash_record("runlatch.quote.v2", network, &contract, &terms),
        golden["expected_hash"]
    );
    let q = &terms.input;
    assert_eq!(
        crate::hashing::hash_record(
            "runlatch.resource.v2",
            network,
            &contract,
            &(
                "client-work",
                &q.provider_id,
                &q.service_id,
                &q.resource_key
            )
        ),
        golden["expected_resource_fingerprint"]
    );
}
