//! LOCAL near-sdk host-mock tests. Not Sandbox or public testnet evidence.

use crate::{RunLatch, gate, hashing, model::*};
use near_sdk::{
    AccountId, CurveType, NearToken, PublicKey, env,
    json_types::{U64, U128},
    serde_json,
    test_utils::VMContextBuilder,
    testing_env,
};
use std::panic::{AssertUnwindSafe, catch_unwind};

const OPERATOR: &str = "operator.testnet";
const PUBLISHER: &str = "provider.testnet";
const AGENT: &str = "agent.testnet";

pub(super) fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}
pub(super) fn key() -> PublicKey {
    PublicKey::from_parts(CurveType::ED25519, vec![1; 32]).unwrap()
}
pub(super) fn context(predecessor: &str, deposit: u128, now: u64) {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("contract.testnet"));
    builder.predecessor_account_id(account(predecessor));
    builder.signer_account_id(account(predecessor));
    builder.signer_account_pk(key());
    builder.attached_deposit(NearToken::from_yoctonear(deposit));
    builder.account_balance(NearToken::from_near(100));
    builder.block_timestamp(now);
    testing_env!(builder.build());
}
pub(super) fn fixture() -> RunLatch {
    context("contract.testnet", 0, 10);
    let mut contract = RunLatch::init(account(OPERATOR));
    let deposit = contract.get_storage_requirements().provider_credit.0;
    context(OPERATOR, deposit, 10);
    contract.register_provider("search".into(), account(PUBLISHER), account(PUBLISHER));
    contract
}
pub(super) fn policy() -> Policy {
    Policy {
        project_id: "capsule-one".into(),
        project_revision: U64(1),
        task_id: "task-one".into(),
        workflow_id: "research-fixture-v1".into(),
        agent_id: account(AGENT),
        agent_public_key: key(),
        budget: U128(1_000),
        per_purchase_limit: U128(500),
        per_commitment_limit: U128(500),
        recurring_policy: RecurringPolicy::Forbidden,
        allowed_provider_ids: vec!["search".into()],
        allowed_service_ids: vec!["search-batch".into()],
        allowed_categories: vec!["search".into()],
        max_quantity: 20,
        approval_threshold: None,
        expires_at_ns: U64(100_000),
        validation_spec_hash: hashing::encode_hash(&[3; 32]),
    }
}
fn create(contract: &mut RunLatch, id: &str, mut policy: Policy) -> Capsule {
    policy.project_id = id.into();
    if contract.get_project(id.into()).is_none() {
        let credit = contract.get_storage_requirements().project_credit.0;
        context(OPERATOR, credit, 10);
        contract.create_project(ProjectInput {
            project_id: id.into(),
            organisation_id: "local-regression".into(),
            client_ref: "internal-work-order".into(),
            budget_ceiling: policy.budget,
            expires_at_ns: policy.expires_at_ns,
            outcome_definition_hash: policy.validation_spec_hash.clone(),
        });
    }
    let credit = contract.get_storage_requirements().capsule_credit;
    context(OPERATOR, policy.budget.0 + credit.0, 10);
    contract.create_capsule(id.into(), policy, credit)
}
pub(super) fn quote_input(id: &str, price: u128) -> QuoteInput {
    QuoteInput {
        quote_id: id.into(),
        provider_id: "search".into(),
        recipient_id: account(PUBLISHER),
        service_id: "search-batch".into(),
        category: "search".into(),
        resource_key: id.into(),
        quantity: 20,
        price: U128(price),
        asset: gate::NATIVE_ASSET.into(),
        recurring: false,
        expires_at_ns: U64(50_000),
        previous_quote_id: None,
        commercial_terms: None,
    }
}
pub(super) fn publish(contract: &mut RunLatch, input: QuoteInput) -> Quote {
    let deposit = contract.get_storage_requirements().quote_credit.0;
    context(PUBLISHER, deposit, 10);
    contract.publish_quote(input)
}
fn proposal(contract: &RunLatch, quote_id: &str) -> PurchaseProposal {
    PurchaseProposal {
        project_id: "capsule-one".into(),
        project_revision: U64(1),
        capsule_id: "capsule-one".into(),
        request_id: "request-one".into(),
        quote_id: quote_id.into(),
        expected_quote_hash: contract.get_quote(quote_id.into()).unwrap().quote_hash,
    }
}
fn preview(contract: &RunLatch, proposal: PurchaseProposal) -> PreviewResult {
    contract.preview_purchase(proposal, account(AGENT), key())
}

#[test]
fn c02_funding_and_policy_are_stored_without_spent_or_reserved_money() {
    let mut contract = fixture();
    let capsule = create(&mut contract, "capsule-one", policy());
    assert_eq!(capsule.owner_id, account(OPERATOR));
    assert_eq!(
        (
            capsule.allocated.0,
            capsule.spent.0,
            capsule.reserved.0,
            capsule.returned.0
        ),
        (1_000, 0, 0, 0)
    );
    assert_eq!(contract.get_available("capsule-one".into()).0, 1_000);
    assert_eq!(capsule.policy_hash.len(), 64);
    assert_eq!(contract.get_capsules(0, 20).len(), 1);
}

#[test]
fn c03_non_operator_cannot_create_a_capsule() {
    let mut contract = fixture();
    let credit = contract.get_storage_requirements().capsule_credit;
    context(AGENT, 1_000 + credit.0, 10);
    assert!(
        catch_unwind(AssertUnwindSafe(|| contract.create_capsule(
            "capsule-one".into(),
            policy(),
            credit
        )))
        .is_err()
    );
    assert!(contract.get_capsule("capsule-one".into()).is_none());
}

#[test]
fn c04_funding_cannot_be_credited_from_an_unbacked_amount() {
    let mut contract = fixture();
    let credit = contract.get_storage_requirements().capsule_credit;
    for deposit in [0, credit.0, credit.0 + 999, credit.0 + 1_001] {
        context(OPERATOR, deposit, 10);
        assert!(
            catch_unwind(AssertUnwindSafe(|| contract.create_capsule(
                "capsule-one".into(),
                policy(),
                credit
            )))
            .is_err()
        );
        assert!(contract.get_capsule("capsule-one".into()).is_none());
    }
}

#[test]
fn c05_unknown_duplicate_and_empty_scope_cannot_activate() {
    let mut contract = fixture();
    for scope in [
        Vec::new(),
        vec!["missing".into()],
        vec!["search".into(), "search".into()],
    ] {
        let mut invalid = policy();
        invalid.allowed_provider_ids = scope;
        assert!(
            catch_unwind(AssertUnwindSafe(|| create(
                &mut contract,
                "capsule-one",
                invalid
            )))
            .is_err()
        );
        assert!(contract.get_capsule("capsule-one".into()).is_none());
    }
}

#[test]
fn c05_owner_or_provider_account_cannot_be_the_agent() {
    let mut contract = fixture();
    for identity in [OPERATOR, PUBLISHER, "contract.testnet"] {
        let mut invalid = policy();
        invalid.agent_id = account(identity);
        assert!(
            catch_unwind(AssertUnwindSafe(|| create(
                &mut contract,
                "capsule-one",
                invalid
            )))
            .is_err()
        );
    }
}

#[test]
fn c05_bad_limits_and_expiry_are_rejected() {
    let mut contract = fixture();
    for (budget, limit, quantity, expiry) in [
        (0, 0, 20, 100),
        (100, 101, 20, 100),
        (100, 10, 0, 100),
        (100, 10, 51, 100),
        (100, 10, 20, 10),
    ] {
        let mut invalid = policy();
        invalid.budget = U128(budget);
        invalid.per_purchase_limit = U128(limit);
        invalid.max_quantity = quantity;
        invalid.expires_at_ns = U64(expiry);
        assert!(
            catch_unwind(AssertUnwindSafe(|| create(
                &mut contract,
                "capsule-one",
                invalid
            )))
            .is_err()
        );
    }
}

#[test]
fn c06_pause_resume_does_not_change_policy_or_budget() {
    let mut contract = fixture();
    let original = create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 100));
    context(OPERATOR, 1, 20);
    contract.set_capsule_paused("capsule-one".into(), true);
    assert_eq!(
        preview(&contract, proposal(&contract, "search-q1")).decision,
        "DENIED"
    );
    context(OPERATOR, 1, 30);
    contract.set_capsule_paused("capsule-one".into(), false);
    let current = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(current.policy_hash, original.policy_hash);
    assert_eq!(current.allocated, original.allocated);
    assert_eq!(
        preview(&contract, proposal(&contract, "search-q1")).decision,
        "APPROVED"
    );
}

#[test]
fn c07_owner_controls_require_identity_and_deposit_capability() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    context(AGENT, 1, 20);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.revoke_capsule("capsule-one".into())
        ))
        .is_err()
    );
    context(OPERATOR, 0, 20);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.revoke_capsule("capsule-one".into())
        ))
        .is_err()
    );
    assert_eq!(
        contract.get_capsule("capsule-one".into()).unwrap().status,
        CapsuleStatus::Active
    );
}

#[test]
fn c08_revocation_is_irreversible_and_blocks_preview() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 100));
    context(OPERATOR, 1, 20);
    contract.revoke_capsule("capsule-one".into());
    assert!(
        preview(&contract, proposal(&contract, "search-q1"))
            .reason_codes
            .contains(&"CAPSULE_INACTIVE".into())
    );
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.set_capsule_paused("capsule-one".into(), false)
        ))
        .is_err()
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .revoked_at_ns,
        Some(U64(20))
    );
}

#[test]
fn c09_expired_capsule_cannot_resume() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    context(OPERATOR, 1, 100_000);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.set_capsule_paused("capsule-one".into(), false)
        ))
        .is_err()
    );
}

#[test]
fn c10_duplicate_capsule_cannot_rewrite_policy() {
    let mut contract = fixture();
    let original = create(&mut contract, "capsule-one", policy());
    let mut changed = policy();
    changed.per_purchase_limit = U128(1_000);
    assert!(
        catch_unwind(AssertUnwindSafe(|| create(
            &mut contract,
            "capsule-one",
            changed
        )))
        .is_err()
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .policy_hash,
        original.policy_hash
    );
}

#[test]
fn c12_distinct_capsules_bind_distinct_policy_hashes() {
    let mut contract = fixture();
    let a = create(&mut contract, "capsule-one", policy());
    let b = create(&mut contract, "capsule-two", policy());
    assert_ne!(a.policy_hash, b.policy_hash);
    assert_eq!(contract.get_capsules(0, 20).len(), 2);
}

#[test]
fn q01_registration_cannot_be_rewritten() {
    let mut contract = fixture();
    context(
        OPERATOR,
        contract.get_storage_requirements().provider_credit.0,
        20,
    );
    assert!(
        catch_unwind(AssertUnwindSafe(|| contract.register_provider(
            "search".into(),
            account("other.testnet"),
            account("other.testnet")
        )))
        .is_err()
    );
    assert_eq!(
        contract.get_provider("search".into()).unwrap().recipient_id,
        account(PUBLISHER)
    );
}

#[test]
fn q02_only_registered_publisher_can_publish() {
    let mut contract = fixture();
    context(
        AGENT,
        contract.get_storage_requirements().quote_credit.0,
        10,
    );
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.publish_quote(quote_input("search-q1", 100))
        ))
        .is_err()
    );
    assert!(contract.get_quote("search-q1".into()).is_none());
}

#[test]
fn q03_quote_id_and_terms_are_immutable() {
    let mut contract = fixture();
    let original = publish(&mut contract, quote_input("search-q1", 100));
    assert!(
        catch_unwind(AssertUnwindSafe(|| publish(
            &mut contract,
            quote_input("search-q1", 101)
        )))
        .is_err()
    );
    assert_eq!(
        contract.get_quote("search-q1".into()).unwrap().quote_hash,
        original.quote_hash
    );
}

#[test]
fn q04_hash_binds_all_terms_and_domain() {
    let mut contract = fixture();
    let canonical = publish(&mut contract, quote_input("search-q1", 100));
    let hash = |terms: &QuoteTerms| {
        hashing::hash_record(
            "runlatch.quote.v2",
            "testnet",
            &account("contract.testnet"),
            terms,
        )
    };
    assert_eq!(hash(&canonical.terms), canonical.quote_hash);
    let mut variants = Vec::new();
    let mut changed = canonical.terms.clone();
    changed.input.price = U128(101);
    variants.push(changed);
    let mut changed = canonical.terms.clone();
    changed.input.recipient_id = account("other.testnet");
    variants.push(changed);
    let mut changed = canonical.terms.clone();
    changed.input.quantity = 19;
    variants.push(changed);
    let mut changed = canonical.terms.clone();
    changed.input.recurring = true;
    variants.push(changed);
    let mut changed = canonical.terms.clone();
    changed.input.expires_at_ns = U64(49_999);
    variants.push(changed);
    let mut changed = canonical.terms.clone();
    changed.input.service_id = "other-service".into();
    variants.push(changed);
    let mut changed = canonical.terms.clone();
    changed.publisher_id = account("other.testnet");
    variants.push(changed);
    for changed in variants {
        assert_ne!(hash(&changed), canonical.quote_hash);
    }
    assert_ne!(
        hashing::hash_record(
            "runlatch.quote.v2",
            "other-network",
            &account("contract.testnet"),
            &canonical.terms
        ),
        canonical.quote_hash
    );
    assert_ne!(
        hashing::hash_record(
            "runlatch.quote.v2",
            "testnet",
            &account("other.testnet"),
            &canonical.terms
        ),
        canonical.quote_hash
    );
}

#[test]
fn q05_publication_cannot_substitute_the_recipient() {
    let mut contract = fixture();
    let mut input = quote_input("search-q1", 100);
    input.recipient_id = account("other.testnet");
    assert!(catch_unwind(AssertUnwindSafe(|| publish(&mut contract, input))).is_err());
    assert!(contract.get_quote("search-q1".into()).is_none());
}

#[test]
fn q07_invalid_asset_zero_price_and_quantity_cannot_publish() {
    let mut contract = fixture();
    let mut invalid = quote_input("search-q1", 100);
    invalid.asset = "usdc".into();
    assert!(catch_unwind(AssertUnwindSafe(|| publish(&mut contract, invalid))).is_err());
    for quantity in [0, 51] {
        let mut invalid = quote_input("search-q1", 100);
        invalid.quantity = quantity;
        assert!(catch_unwind(AssertUnwindSafe(|| publish(&mut contract, invalid))).is_err());
    }
    assert!(
        catch_unwind(AssertUnwindSafe(|| publish(
            &mut contract,
            quote_input("search-q1", 0)
        )))
        .is_err()
    );
}

#[test]
fn q10_provider_suspension_rechecks_canonical_state() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 100));
    context(OPERATOR, 1, 20);
    contract.set_provider_status("search".into(), false);
    assert!(
        preview(&contract, proposal(&contract, "search-q1"))
            .reason_codes
            .contains(&"PROVIDER_SUSPENDED".into())
    );
}

#[test]
fn q11_changed_price_requires_new_comparable_quote() {
    let mut contract = fixture();
    let first = publish(&mut contract, quote_input("search-q1", 100));
    let mut second = quote_input("search-q2", 200);
    second.previous_quote_id = Some("search-q1".into());
    let next = publish(&mut contract, second);
    assert_ne!(first.quote_hash, next.quote_hash);
    assert_eq!(contract.get_quotes("search".into(), 0, 20).len(), 2);
    let mut bad = quote_input("search-q3", 100);
    bad.previous_quote_id = Some("search-q1".into());
    bad.quantity = 19;
    assert!(catch_unwind(AssertUnwindSafe(|| publish(&mut contract, bad))).is_err());
}

#[test]
fn g01_read_only_gate_uses_stored_quote_and_never_grants_authority() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 100));
    let result = preview(&contract, proposal(&contract, "search-q1"));
    assert_eq!(result.decision, "APPROVED");
    assert!(!result.grants_payment_authority);
    assert_eq!(result.source, "READ_ONLY_CONTRACT_PREVIEW");
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
}

#[test]
fn g02_proposed_wrong_identity_or_key_is_denied() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 100));
    let result = contract.preview_purchase(
        proposal(&contract, "search-q1"),
        account("other.testnet"),
        key(),
    );
    assert_eq!(result.reason_codes, vec!["UNAUTHORIZED_AGENT"]);
    let other_key = PublicKey::from_parts(CurveType::ED25519, vec![2; 32]).unwrap();
    assert_eq!(
        contract
            .preview_purchase(proposal(&contract, "search-q1"), account(AGENT), other_key)
            .decision,
        "DENIED"
    );
}

#[test]
fn g04_g05_actual_terms_hash_tampering_is_denied() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    let quote = publish(&mut contract, quote_input("search-q1", 100));
    let mut changed = quote.terms;
    changed.input.recipient_id = account("other.testnet");
    changed.input.price = U128(1);
    let mut request = proposal(&contract, "search-q1");
    request.expected_quote_hash = hashing::hash_record(
        "runlatch.quote.v2",
        "testnet",
        &account("contract.testnet"),
        &changed,
    );
    assert_eq!(
        preview(&contract, request).reason_codes,
        vec!["QUOTE_TERMS_MISMATCH"]
    );
}

#[test]
fn g06_canonical_recurring_quote_is_denied_without_hiding_terms() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    let mut input = quote_input("search-q1", 100);
    input.recurring = true;
    publish(&mut contract, input);
    assert!(
        preview(&contract, proposal(&contract, "search-q1"))
            .reason_codes
            .contains(&"RECURRING_FORBIDDEN".into())
    );
}

#[test]
fn g08_canonical_price_not_free_request_price_enforces_cap() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 501));
    assert!(
        preview(&contract, proposal(&contract, "search-q1"))
            .reason_codes
            .contains(&"PURCHASE_LIMIT_EXCEEDED".into())
    );
}

#[test]
fn a01_threshold_produces_pending_estimate_without_reservation() {
    let mut contract = fixture();
    let mut p = policy();
    p.approval_threshold = Some(U128(99));
    create(&mut contract, "capsule-one", p);
    publish(&mut contract, quote_input("search-q1", 100));
    assert_eq!(
        preview(&contract, proposal(&contract, "search-q1")).decision,
        "APPROVAL_REQUIRED"
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
}

#[test]
fn t01_json_keeps_large_money_and_time_as_strings() {
    let mut contract = fixture();
    let mut p = policy();
    p.budget = U128(1u128 << 100);
    p.per_purchase_limit = p.budget;
    let capsule = create(&mut contract, "capsule-one", p);
    let value = serde_json::to_value(capsule).unwrap();
    assert!(value["allocated"].is_string());
    assert!(value["created_at_ns"].is_string());
    assert!(serde_json::from_str::<U128>("123").is_err());
}

#[test]
fn t02_hash_encoding_is_exact_lowercase_and_length_bounded() {
    let bytes = [42; 32];
    let encoded = hashing::encode_hash(&bytes);
    assert_eq!(hashing::decode_hash(&encoded), Some(bytes));
    for invalid in [
        "",
        "ff",
        &"z".repeat(64),
        &encoded.to_uppercase(),
        &"0".repeat(65),
    ] {
        assert!(hashing::decode_hash(invalid).is_none());
    }
}

#[test]
fn g12_proposal_rejects_free_price_and_recipient_fields() {
    let json = r#"{"capsule_id":"capsule-one","request_id":"request-one","quote_id":"search-q1","expected_quote_hash":"00","recipient_id":"other.testnet","price":"1"}"#;
    assert!(serde_json::from_str::<PurchaseProposal>(json).is_err());
}

#[test]
fn t04_pagination_has_explicit_limits() {
    let mut contract = fixture();
    create(&mut contract, "capsule-one", policy());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.get_capsules(0, 21))).is_err());
    assert!(contract.get_capsules(100, 20).is_empty());
}

#[test]
fn t03_records_survive_borsh_state_round_trip() {
    let mut contract = fixture();
    let capsule = create(&mut contract, "capsule-one", policy());
    let quote = publish(&mut contract, quote_input("search-q1", 100));
    contract.capsules.flush();
    contract.providers.flush();
    contract.quotes.flush();
    env::state_write(&contract);
    drop(contract);
    let restored: RunLatch = env::state_read().unwrap();
    assert_eq!(
        restored
            .get_capsule("capsule-one".into())
            .unwrap()
            .policy_hash,
        capsule.policy_hash
    );
    assert_eq!(
        restored.get_quote("search-q1".into()).unwrap().quote_hash,
        quote.quote_hash
    );
}

// M3 tests below exercise LOCAL SDK promise mocks, not transfer settlement on a
// real node. Runtime receipt failures/gas/refunds require Sandbox separately.
fn callback_context(results: Vec<near_sdk::PromiseResult>) {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("contract.testnet"));
    builder.predecessor_account_id(account("contract.testnet"));
    builder.signer_account_id(account(AGENT));
    builder.signer_account_pk(key());
    builder.account_balance(NearToken::from_near(100));
    builder.block_timestamp(30);
    testing_env!(
        builder.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}

fn payment_fixture(threshold: Option<u128>, price: u128) -> RunLatch {
    let mut contract = fixture();
    let mut p = policy();
    p.approval_threshold = threshold.map(U128);
    create(&mut contract, "capsule-one", p);
    publish(&mut contract, quote_input("search-q1", price));
    contract
}

#[test]
fn frontend_flow_recipient_copy_hash_cannot_route_the_canonical_transfer() {
    let mut c = payment_fixture(None, 100);
    let original = c.get_quote("search-q1".into()).unwrap();
    let mut altered = original.terms.clone();
    altered.input.recipient_id = account("intruder.testnet");
    let mut request = proposal(&c, "search-q1");
    request.expected_quote_hash = hashing::hash_record(
        "runlatch.quote.v2",
        "testnet",
        &account("contract.testnet"),
        &altered,
    );
    context(AGENT, 0, 20);
    let near_sdk::PromiseOrValue::Value(response) = c.submit_purchase(request) else {
        panic!("altered recipient authorized");
    };
    assert_eq!(response.reason_codes, vec!["QUOTE_TERMS_MISMATCH"]);
    assert_eq!(
        response.request.unwrap().canonical_quote.unwrap(),
        original.terms
    );
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().reserved.0, 0);
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
}

#[test]
fn frontend_flow_expired_quote_returns_a_denial_not_a_payment() {
    let mut c = payment_fixture(None, 100);
    let request = proposal(&c, "search-q1");
    context(AGENT, 0, 50_000);
    let near_sdk::PromiseOrValue::Value(response) = c.submit_purchase(request) else {
        panic!("expired quote authorized");
    };
    assert!(response.reason_codes.contains(&"QUOTE_EXPIRED".into()));
    assert_eq!(response.request.unwrap().status, PurchaseStatus::Denied);
    assert!(!c.get_quote("search-q1".into()).unwrap().consumed);
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().reserved.0, 0);
}

#[test]
fn frontend_flow_replay_response_keeps_original_settled_dto() {
    let mut c = payment_fixture(None, 100);
    drop(submit(&mut c, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    c.resolve_purchase("capsule-one:request-one".into());
    let original =
        serde_json::to_value(c.get_purchase("capsule-one".into(), "request-one".into())).unwrap();
    let near_sdk::PromiseOrValue::Value(response) = submit(&mut c, "search-q1", "request-one")
    else {
        panic!("replay authorized");
    };
    assert_eq!(response.source, "CONTRACT_REJECTED_ATTEMPT");
    assert_eq!(response.decision, "DENIED");
    assert_eq!(serde_json::to_value(response.request).unwrap(), original);
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().spent.0, 100);
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
}

#[test]
fn frontend_flow_cumulative_limit_counts_both_settled_and_reserved() {
    let mut c = payment_fixture(None, 400);
    publish(&mut c, quote_input("second", 400));
    publish(&mut c, quote_input("third", 300));
    drop(submit(&mut c, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    c.resolve_purchase("capsule-one:request-one".into());
    drop(submit(&mut c, "second", "request-two"));
    let near_sdk::PromiseOrValue::Value(response) = submit(&mut c, "third", "request-three") else {
        panic!("cumulative overspend authorized");
    };
    assert!(
        response
            .reason_codes
            .contains(&"INSUFFICIENT_AVAILABLE_BUDGET".into())
    );
    let capsule = c.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(
        (capsule.spent.0, capsule.reserved.0, capsule.available().0),
        (400, 400, 200)
    );
    assert!(!c.get_quote("third".into()).unwrap().consumed);
}

#[test]
fn frontend_flow_revocation_blocks_new_request_not_existing_callback() {
    let mut c = payment_fixture(None, 100);
    publish(&mut c, quote_input("second", 100));
    drop(submit(&mut c, "search-q1", "request-one"));
    context(OPERATOR, 1, 21);
    c.revoke_capsule("capsule-one".into());
    let near_sdk::PromiseOrValue::Value(response) = submit(&mut c, "second", "request-two") else {
        panic!("revoked authority reused");
    };
    assert_eq!(response.reason_codes, vec!["CAPSULE_INACTIVE"]);
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().reserved.0, 100);
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    c.resolve_purchase("capsule-one:request-one".into());
    let capsule = c.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(capsule.status, CapsuleStatus::Revoked);
    assert_eq!((capsule.spent.0, capsule.reserved.0), (100, 0));
}

#[test]
fn frontend_flow_approval_hash_and_current_provider_are_both_required() {
    let mut c = payment_fixture(Some(99), 100);
    drop(submit(&mut c, "search-q1", "request-one"));
    let request = c
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap();
    context(OPERATOR, 1, 21);
    let near_sdk::PromiseOrValue::Value(wrong) =
        c.approve_purchase("capsule-one".into(), "request-one".into(), "00".repeat(32))
    else {
        panic!("wrong approval authorized");
    };
    assert_eq!(wrong.reason_codes, vec!["APPROVAL_BINDING_MISMATCH"]);
    c.set_provider_status("search".into(), false);
    let near_sdk::PromiseOrValue::Value(stale) = c.approve_purchase(
        "capsule-one".into(),
        "request-one".into(),
        request.request_hash,
    ) else {
        panic!("suspended provider authorized");
    };
    assert!(stale.reason_codes.contains(&"PROVIDER_SUSPENDED".into()));
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().reserved.0, 0);
    assert!(!c.get_quote("search-q1".into()).unwrap().consumed);
}

#[test]
fn frontend_flow_confirmed_failure_releases_once_but_keeps_quote_consumed() {
    let mut c = payment_fixture(None, 100);
    drop(submit(&mut c, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Failed]);
    let failed = c.resolve_purchase("capsule-one:request-one".into());
    assert_eq!(
        failed.request.unwrap().status,
        PurchaseStatus::SettlementFailed
    );
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().reserved.0, 0);
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    let duplicate = c.resolve_purchase("capsule-one:request-one".into());
    assert_eq!(
        duplicate.request.unwrap().status,
        PurchaseStatus::SettlementFailed
    );
    assert_eq!(c.get_capsule("capsule-one".into()).unwrap().spent.0, 0);
    assert!(c.get_quote("search-q1".into()).unwrap().consumed);
}

fn submit(
    contract: &mut RunLatch,
    quote_id: &str,
    request_id: &str,
) -> near_sdk::PromiseOrValue<PurchaseResponse> {
    let mut p = proposal(contract, quote_id);
    p.request_id = request_id.into();
    context(AGENT, 0, 20);
    contract.submit_purchase(p)
}

#[test]
fn s01_s02_mutating_boundary_reserves_canonical_amount_before_promise() {
    let mut contract = payment_fixture(None, 100);
    let result = submit(&mut contract, "search-q1", "request-one");
    assert!(matches!(&result, near_sdk::PromiseOrValue::Promise(_)));
    drop(result);
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(
        (capsule.spent.0, capsule.reserved.0, capsule.available().0),
        (0, 100, 900)
    );
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .status,
        PurchaseStatus::SettlementPending
    );
    let q = contract.get_quote("search-q1".into()).unwrap();
    assert!(q.consumed);
    assert_eq!(q.consumed_by, Some("capsule-one:request-one".into()));
    let receipts = near_sdk::test_utils::get_created_receipts();
    let transfers: Vec<_> = receipts
        .iter()
        .flat_map(|r| {
            r.actions.iter().filter_map(move |a| match a {
                near_sdk::mock::MockAction::Transfer { deposit, .. } => {
                    Some((r.receiver_id.clone(), deposit.as_yoctonear()))
                }
                _ => None,
            })
        })
        .collect();
    assert_eq!(transfers, vec![(account(PUBLISHER), 100)]);
    assert!(receipts.iter().any(|r| r.receiver_id == account("contract.testnet") && r.actions.iter().any(|a| matches!(a,
        near_sdk::mock::MockAction::FunctionCallWeight { method_name, .. } if method_name == b"resolve_purchase"))));
}

#[test]
fn g02_actual_submit_requires_exact_runtime_account_key_and_zero_deposit() {
    let mut contract = payment_fixture(None, 100);
    let request = proposal(&contract, "search-q1");
    context("intruder.testnet", 0, 20);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.submit_purchase(request.clone())
        ))
        .is_err()
    );
    context(AGENT, 1, 20);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.submit_purchase(request.clone())
        ))
        .is_err()
    );
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("contract.testnet"));
    builder.predecessor_account_id(account(AGENT));
    builder.signer_account_id(account(AGENT));
    builder.signer_account_pk(PublicKey::from_parts(CurveType::ED25519, vec![2; 32]).unwrap());
    builder.block_timestamp(20);
    testing_env!(builder.build());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(request))).is_err());
    assert!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .is_none()
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
}

#[test]
fn g04_actual_tampered_hash_persists_denial_without_transfer() {
    let mut contract = payment_fixture(None, 100);
    let mut request = proposal(&contract, "search-q1");
    request.expected_quote_hash = hashing::encode_hash(&[8; 32]);
    context(AGENT, 0, 20);
    let near_sdk::PromiseOrValue::Value(result) = contract.submit_purchase(request) else {
        panic!("denial scheduled payment");
    };
    assert_eq!(result.decision, "DENIED");
    assert_eq!(result.reason_codes, vec!["QUOTE_TERMS_MISMATCH"]);
    assert!(!result.transfer_scheduled);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
}

#[test]
fn g09_concurrent_pending_purchases_cannot_split_past_budget() {
    let mut contract = payment_fixture(None, 400);
    publish(&mut contract, quote_input("search-q2", 400));
    publish(&mut contract, quote_input("search-q3", 300));
    drop(submit(&mut contract, "search-q1", "request-one"));
    drop(submit(&mut contract, "search-q2", "request-two"));
    let near_sdk::PromiseOrValue::Value(result) =
        submit(&mut contract, "search-q3", "request-three")
    else {
        panic!("overspend scheduled");
    };
    assert!(
        result
            .reason_codes
            .contains(&"INSUFFICIENT_AVAILABLE_BUDGET".into())
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        800
    );
    assert!(!contract.get_quote("search-q3".into()).unwrap().consumed);
}

#[test]
fn g11_replay_does_not_overwrite_pending_original_or_pay_again() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    let original = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap();
    let near_sdk::PromiseOrValue::Value(result) = submit(&mut contract, "search-q1", "request-one")
    else {
        panic!("replay scheduled");
    };
    assert_eq!(result.reason_codes, vec!["REQUEST_REPLAY"]);
    let current = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap();
    assert_eq!(current.request_hash, original.request_hash);
    assert_eq!(current.status, PurchaseStatus::SettlementPending);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .request_ids
            .len(),
        1
    );
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
}

#[test]
fn a01_a03_exact_owner_approval_reserves_only_after_fresh_check() {
    let mut contract = payment_fixture(Some(99), 100);
    let near_sdk::PromiseOrValue::Value(pending) =
        submit(&mut contract, "search-q1", "request-one")
    else {
        panic!("pending paid");
    };
    assert_eq!(
        pending.request.unwrap().status,
        PurchaseStatus::ApprovalPending
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
    let hash = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap()
        .request_hash;
    context(OPERATOR, 1, 25);
    let result = contract.approve_purchase("capsule-one".into(), "request-one".into(), hash);
    assert!(matches!(&result, near_sdk::PromiseOrValue::Promise(_)));
    drop(result);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        100
    );
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .approved_by,
        Some(account(OPERATOR))
    );
}

#[test]
fn a04_bad_approval_binding_keeps_original_pending_and_unfunded() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    context(OPERATOR, 1, 25);
    let near_sdk::PromiseOrValue::Value(result) =
        contract.approve_purchase("capsule-one".into(), "request-one".into(), "wrong".into())
    else {
        panic!("bad approval paid");
    };
    assert_eq!(result.reason_codes, vec!["APPROVAL_BINDING_MISMATCH"]);
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .status,
        PurchaseStatus::ApprovalPending
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
}

#[test]
fn a06_revoke_before_approval_cannot_be_overridden() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    let hash = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap()
        .request_hash;
    context(OPERATOR, 1, 25);
    contract.revoke_capsule("capsule-one".into());
    let near_sdk::PromiseOrValue::Value(result) =
        contract.approve_purchase("capsule-one".into(), "request-one".into(), hash)
    else {
        panic!("revoked paid");
    };
    assert_eq!(result.decision, "DENIED");
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
}

#[test]
fn a07_shared_quote_can_be_claimed_only_once_after_approval() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    drop(submit(&mut contract, "search-q1", "request-two"));
    let first = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap()
        .request_hash;
    let second = contract
        .get_purchase("capsule-one".into(), "request-two".into())
        .unwrap()
        .request_hash;
    context(OPERATOR, 1, 25);
    drop(contract.approve_purchase("capsule-one".into(), "request-one".into(), first));
    context(OPERATOR, 1, 25);
    let near_sdk::PromiseOrValue::Value(result) =
        contract.approve_purchase("capsule-one".into(), "request-two".into(), second)
    else {
        panic!("double quote paid");
    };
    assert!(result.reason_codes.contains(&"QUOTE_CONSUMED".into()));
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        100
    );
}

#[test]
fn a08_rejection_and_cancellation_never_release_unrelated_reservations() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    drop(submit(&mut contract, "search-q1", "request-two"));
    context(OPERATOR, 1, 25);
    contract.reject_purchase("capsule-one".into(), "request-one".into());
    context(OPERATOR, 1, 25);
    contract.cancel_purchase("capsule-one".into(), "request-two".into());
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .status,
        PurchaseStatus::Denied
    );
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-two".into())
            .unwrap()
            .status,
        PurchaseStatus::Cancelled
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
}

#[test]
fn s03_success_result_moves_reservation_to_spent_exactly_once() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    let result = contract.resolve_purchase("capsule-one:request-one".into());
    assert_eq!(result.request.unwrap().status, PurchaseStatus::Settled);
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!((capsule.spent.0, capsule.reserved.0), (100, 0));
    contract.resolve_purchase("capsule-one:request-one".into());
    assert_eq!(
        contract.get_capsule("capsule-one".into()).unwrap().spent.0,
        100
    );
}

#[test]
fn s04_confirmed_failure_releases_reservation_but_burns_quote() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Failed]);
    let result = contract.resolve_purchase("capsule-one:request-one".into());
    assert_eq!(
        result.request.unwrap().status,
        PurchaseStatus::SettlementFailed
    );
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(
        (capsule.spent.0, capsule.reserved.0, capsule.available().0),
        (0, 0, 1_000)
    );
    assert!(contract.get_quote("search-q1".into()).unwrap().consumed);
    let near_sdk::PromiseOrValue::Value(replay) = submit(&mut contract, "search-q1", "request-two")
    else {
        panic!("failed quote replayed");
    };
    assert!(replay.reason_codes.contains(&"QUOTE_CONSUMED".into()));
}

#[test]
fn s05_external_caller_cannot_forge_callback_success() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    context(AGENT, 0, 30);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.resolve_purchase("capsule-one:request-one".into())
        ))
        .is_err()
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        100
    );
}

#[test]
fn s06_unknown_missing_and_oversized_results_never_release_money() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    for results in [
        Vec::new(),
        vec![near_sdk::PromiseResult::Successful(vec![1])],
        vec![
            near_sdk::PromiseResult::Failed,
            near_sdk::PromiseResult::Failed,
        ],
    ] {
        callback_context(results);
        let result = contract.resolve_purchase("capsule-one:request-one".into());
        assert!(result.request.unwrap().reconciliation_required);
        assert_eq!(
            contract
                .get_capsule("capsule-one".into())
                .unwrap()
                .reserved
                .0,
            100
        );
        assert_eq!(
            contract
                .get_purchase("capsule-one".into(), "request-one".into())
                .unwrap()
                .status,
            PurchaseStatus::SettlementPending
        );
    }
}

#[test]
fn s08_revocation_after_scheduling_does_not_falsify_settlement() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    context(OPERATOR, 1, 25);
    contract.revoke_capsule("capsule-one".into());
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_purchase("capsule-one:request-one".into());
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(capsule.status, CapsuleStatus::Revoked);
    assert_eq!((capsule.spent.0, capsule.reserved.0), (100, 0));
}

#[test]
fn r02_handled_failed_transfer_does_not_become_green_payment_success() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Failed]);
    let response = contract.resolve_purchase("capsule-one:request-one".into());
    assert_eq!(response.decision, "APPROVED");
    assert_eq!(
        response.request.unwrap().status,
        PurchaseStatus::SettlementFailed
    );
    assert!(!response.transfer_scheduled);
}

#[test]
fn s11_close_blocks_active_and_pending_purchase_authority() {
    let mut contract = payment_fixture(None, 100);
    context(OPERATOR, 1, 25);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.close_capsule("capsule-one".into())
        ))
        .is_err()
    );
    drop(submit(&mut contract, "search-q1", "request-one"));
    context(OPERATOR, 1, 25);
    contract.set_capsule_paused("capsule-one".into(), true);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.close_capsule("capsule-one".into())
        ))
        .is_err()
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        100
    );
}

#[test]
fn s12_unused_funds_return_only_to_stored_owner_and_preserve_original_budget() {
    let mut contract = payment_fixture(None, 100);
    context(OPERATOR, 1, 25);
    contract.set_capsule_paused("capsule-one".into(), true);
    let result = contract.close_capsule("capsule-one".into());
    assert!(matches!(&result, near_sdk::PromiseOrValue::Promise(_)));
    drop(result);
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(capsule.status, CapsuleStatus::Closing);
    assert_eq!(capsule.reserved.0, 1_000);
    let receipts = near_sdk::test_utils::get_created_receipts();
    assert!(receipts.iter().any(|r| r.receiver_id == account(OPERATOR)
        && r.actions.iter().any(|a| matches!(a,
        near_sdk::mock::MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == 1_000))));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_owner_refund("capsule-one".into(), 1);
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(
        (
            capsule.allocated.0,
            capsule.spent.0,
            capsule.reserved.0,
            capsule.returned.0
        ),
        (0, 0, 0, 1_000)
    );
    assert_eq!(capsule.policy.budget.0, 1_000);
    assert_eq!(capsule.status, CapsuleStatus::Closed);
}

#[test]
fn s12_returning_unused_funds_does_not_erase_settled_provider_spend() {
    let mut contract = payment_fixture(None, 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_purchase("capsule-one:request-one".into());
    context(OPERATOR, 1, 25);
    contract.set_capsule_paused("capsule-one".into(), true);
    drop(contract.close_capsule("capsule-one".into()));
    assert_eq!(
        contract
            .get_owner_refund("capsule-one".into())
            .unwrap()
            .amount
            .0,
        900
    );
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_owner_refund("capsule-one".into(), 1);
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(
        (
            capsule.allocated.0,
            capsule.spent.0,
            capsule.reserved.0,
            capsule.returned.0
        ),
        (100, 100, 0, 900)
    );
    assert_eq!(
        capsule.allocated.0 + capsule.returned.0,
        capsule.policy.budget.0
    );
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .status,
        PurchaseStatus::Settled
    );
}

#[test]
fn s13_failed_owner_refund_can_only_retry_as_new_operation() {
    let mut contract = payment_fixture(None, 100);
    context(OPERATOR, 1, 25);
    contract.revoke_capsule("capsule-one".into());
    drop(contract.close_capsule("capsule-one".into()));
    callback_context(vec![near_sdk::PromiseResult::Failed]);
    contract.resolve_owner_refund("capsule-one".into(), 1);
    let capsule = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(capsule.reserved.0, 0);
    assert_eq!(capsule.returned.0, 0);
    assert_eq!(capsule.status, CapsuleStatus::Revoked);
    context(OPERATOR, 1, 26);
    drop(contract.close_capsule("capsule-one".into()));
    assert_eq!(
        contract
            .get_owner_refund("capsule-one".into())
            .unwrap()
            .attempt,
        2
    );
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_owner_refund("capsule-one".into(), 1);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        1_000
    );
    contract.resolve_owner_refund("capsule-one".into(), 2);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .returned
            .0,
        1_000
    );
}

#[test]
fn s14_unknown_owner_refund_result_stays_reserved_and_cannot_resend() {
    let mut contract = payment_fixture(None, 100);
    context(OPERATOR, 1, 25);
    contract.revoke_capsule("capsule-one".into());
    drop(contract.close_capsule("capsule-one".into()));
    callback_context(Vec::new());
    let response = contract.resolve_owner_refund("capsule-one".into(), 1);
    assert!(response.record.unwrap().reconciliation_required);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        1_000
    );
    context(OPERATOR, 1, 26);
    let near_sdk::PromiseOrValue::Value(response) = contract.close_capsule("capsule-one".into())
    else {
        panic!("duplicate refund scheduled");
    };
    assert!(!response.transfer_scheduled);
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
}

#[test]
fn s05_refund_callback_and_close_cannot_be_called_by_agent() {
    let mut contract = payment_fixture(None, 100);
    context(AGENT, 1, 25);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.close_capsule("capsule-one".into())
        ))
        .is_err()
    );
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.resolve_owner_refund("capsule-one".into(), 1)
        ))
        .is_err()
    );
}

#[test]
fn s15_low_liquidity_cannot_commit_a_reservation_or_consume_quote() {
    let mut contract = payment_fixture(None, 100);
    let request = proposal(&contract, "search-q1");
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("contract.testnet"));
    builder.predecessor_account_id(account(AGENT));
    builder.signer_account_id(account(AGENT));
    builder.signer_account_pk(key());
    builder.account_balance(NearToken::from_yoctonear(0));
    builder.block_timestamp(20);
    testing_env!(builder.build());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(request))).is_err());
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
    assert!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .is_none()
    );
}

#[test]
fn s10_low_callback_gas_budget_is_rejected_before_payment_state() {
    let mut contract = payment_fixture(None, 100);
    let request = proposal(&contract, "search-q1");
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("contract.testnet"));
    builder.predecessor_account_id(account(AGENT));
    builder.signer_account_id(account(AGENT));
    builder.signer_account_pk(key());
    builder.account_balance(NearToken::from_near(100));
    builder.prepaid_gas(near_sdk::Gas::from_tgas(40));
    builder.block_timestamp(20);
    testing_env!(builder.build());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(request))).is_err());
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
}

#[test]
fn a06_approval_at_exact_deadline_expires_without_payment() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    let pending = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap();
    context(OPERATOR, 1, pending.approval_expires_at_ns.0);
    let near_sdk::PromiseOrValue::Value(response) = contract.approve_purchase(
        "capsule-one".into(),
        "request-one".into(),
        pending.request_hash,
    ) else {
        panic!("expired approval paid");
    };
    assert_eq!(response.request.unwrap().status, PurchaseStatus::Expired);
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
}

#[test]
fn a07_waiting_approval_cannot_reuse_budget_reserved_by_other_requests() {
    let mut contract = fixture();
    let mut p = policy();
    p.per_purchase_limit = U128(750);
    p.per_commitment_limit = U128(750);
    p.approval_threshold = Some(U128(500));
    create(&mut contract, "capsule-one", p);
    publish(&mut contract, quote_input("search-q1", 501));
    publish(&mut contract, quote_input("search-q2", 400));
    publish(&mut contract, quote_input("search-q3", 400));
    drop(submit(&mut contract, "search-q1", "request-one"));
    let hash = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap()
        .request_hash;
    drop(submit(&mut contract, "search-q2", "request-two"));
    drop(submit(&mut contract, "search-q3", "request-three"));
    context(OPERATOR, 1, 25);
    let near_sdk::PromiseOrValue::Value(response) =
        contract.approve_purchase("capsule-one".into(), "request-one".into(), hash)
    else {
        panic!("reserved capacity reused");
    };
    assert!(
        response
            .reason_codes
            .contains(&"INSUFFICIENT_AVAILABLE_BUDGET".into())
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        800
    );
}

#[test]
fn t04_denial_history_has_a_funded_bounded_request_limit() {
    let mut contract = payment_fixture(None, 100);
    for index in 0..MAX_REQUESTS_PER_CAPSULE {
        let mut request = proposal(&contract, "search-q1");
        request.request_id = format!("denied-{index}");
        request.expected_quote_hash = hashing::encode_hash(&[8; 32]);
        context(AGENT, 0, 20);
        let near_sdk::PromiseOrValue::Value(response) = contract.submit_purchase(request) else {
            panic!("denial paid");
        };
        assert_eq!(response.decision, "DENIED");
    }
    let mut excess = proposal(&contract, "search-q1");
    excess.request_id = "too-many".into();
    context(AGENT, 0, 20);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(excess))).is_err());
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .request_ids
            .len(),
        MAX_REQUESTS_PER_CAPSULE
    );
    assert_eq!(
        contract
            .get_capsule("capsule-one".into())
            .unwrap()
            .reserved
            .0,
        0
    );
}

// Every assertion here is LOCAL SDK-mock evidence; a panic caught by Rust is
// not proof of chain rollback. Actual WASM/ABI rollback is tested in Sandbox.
fn assert_ledger(contract: &RunLatch, id: &str) {
    let capsule = contract.get_capsule(id.into()).unwrap();
    let mut pending_sum = 0u128;
    let mut settled_sum = 0u128;
    for request_id in &capsule.request_ids {
        let request = contract
            .get_purchase(id.into(), request_id.clone())
            .unwrap();
        if request.status == PurchaseStatus::SettlementPending {
            pending_sum = pending_sum.checked_add(request.reserved_amount.0).unwrap();
        } else {
            assert_eq!(request.reserved_amount.0, 0);
        }
        if request.status == PurchaseStatus::Settled {
            settled_sum = settled_sum
                .checked_add(request.canonical_quote.unwrap().input.price.0)
                .unwrap();
        }
    }
    if let Some(refund) = &capsule.owner_refund
        && refund.status == RefundStatus::Pending
    {
        pending_sum = pending_sum.checked_add(refund.amount.0).unwrap();
    }
    assert_eq!(capsule.reserved.0, pending_sum);
    assert_eq!(capsule.spent.0, settled_sum);
    assert!(capsule.spent.0.checked_add(capsule.reserved.0).unwrap() <= capsule.allocated.0);
    assert!(capsule.allocated.0 <= capsule.policy.budget.0);
    assert_eq!(
        capsule.allocated.0.checked_add(capsule.returned.0).unwrap(),
        capsule.policy.budget.0
    );
    assert_eq!(
        capsule.available().0,
        capsule.allocated.0 - capsule.spent.0 - capsule.reserved.0
    );
}

#[test]
fn a02_actual_threshold_absent_zero_equal_and_above() {
    let mut contract = fixture();
    publish(&mut contract, quote_input("search-q1", 100));
    for (index, threshold, expected) in [
        (0, None, "APPROVED"),
        (1, Some(0), "APPROVAL_REQUIRED"),
        (2, Some(100), "APPROVED"),
        (3, Some(99), "APPROVAL_REQUIRED"),
    ] {
        let id = format!("threshold-{index}");
        let mut p = policy();
        p.approval_threshold = threshold.map(U128);
        create(&mut contract, &id, p);
        let mut request = proposal(&contract, "search-q1");
        request.capsule_id = id.clone();
        request.project_id = id.clone();
        assert_eq!(preview(&contract, request).decision, expected);
        assert_ledger(&contract, &id);
    }
}

#[test]
fn a05_only_owner_deposit_capable_action_can_approve_reject_or_cancel() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    let original = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap();
    for (caller, deposit) in [
        (AGENT, 1),
        (PUBLISHER, 1),
        ("intruder.testnet", 1),
        (OPERATOR, 0),
    ] {
        context(caller, deposit, 25);
        assert!(
            catch_unwind(AssertUnwindSafe(|| contract.approve_purchase(
                "capsule-one".into(),
                "request-one".into(),
                original.request_hash.clone()
            )))
            .is_err()
        );
        assert!(
            catch_unwind(AssertUnwindSafe(
                || contract.reject_purchase("capsule-one".into(), "request-one".into())
            ))
            .is_err()
        );
        assert!(
            catch_unwind(AssertUnwindSafe(
                || contract.cancel_purchase("capsule-one".into(), "request-one".into())
            ))
            .is_err()
        );
        assert_eq!(
            contract
                .get_purchase("capsule-one".into(), "request-one".into())
                .unwrap()
                .status,
            PurchaseStatus::ApprovalPending
        );
        assert_ledger(&contract, "capsule-one");
    }
}

#[test]
fn a06_pause_and_provider_suspension_are_rechecked_at_approval() {
    let mut contract = payment_fixture(Some(99), 100);
    for (request_id, suspended, reason) in [
        ("paused", false, "CAPSULE_INACTIVE"),
        ("suspended", true, "PROVIDER_SUSPENDED"),
    ] {
        drop(submit(&mut contract, "search-q1", request_id));
        let hash = contract
            .get_purchase("capsule-one".into(), request_id.into())
            .unwrap()
            .request_hash;
        context(OPERATOR, 1, 25);
        if suspended {
            contract.set_provider_status("search".into(), false);
        } else {
            contract.set_capsule_paused("capsule-one".into(), true);
        }
        let near_sdk::PromiseOrValue::Value(response) =
            contract.approve_purchase("capsule-one".into(), request_id.into(), hash)
        else {
            panic!("stale authority paid")
        };
        assert!(response.reason_codes.contains(&reason.into()));
        assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
        assert_ledger(&contract, "capsule-one");
        context(OPERATOR, 1, 25);
        if suspended {
            contract.set_provider_status("search".into(), true);
        } else {
            contract.set_capsule_paused("capsule-one".into(), false);
        }
    }
}

#[test]
fn a09_hard_denial_cannot_be_overridden_by_exact_owner_hash() {
    let mut contract = payment_fixture(Some(99), 501);
    drop(submit(&mut contract, "search-q1", "request-one"));
    let denied = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap();
    assert_eq!(denied.status, PurchaseStatus::Denied);
    context(OPERATOR, 1, 25);
    let near_sdk::PromiseOrValue::Value(response) = contract.approve_purchase(
        "capsule-one".into(),
        "request-one".into(),
        denied.request_hash.clone(),
    ) else {
        panic!("hard denial overridden")
    };
    assert_eq!(response.reason_codes, vec!["REQUEST_NOT_PENDING"]);
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .request_hash,
        denied.request_hash
    );
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn a10_duplicate_approval_and_rejection_schedule_at_most_one_payment() {
    let mut contract = payment_fixture(Some(99), 100);
    drop(submit(&mut contract, "search-q1", "request-one"));
    let hash = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap()
        .request_hash;
    context(OPERATOR, 1, 25);
    drop(contract.approve_purchase("capsule-one".into(), "request-one".into(), hash.clone()));
    context(OPERATOR, 1, 26);
    let near_sdk::PromiseOrValue::Value(response) =
        contract.approve_purchase("capsule-one".into(), "request-one".into(), hash)
    else {
        panic!("duplicate paid")
    };
    assert_eq!(response.reason_codes, vec!["REQUEST_NOT_PENDING"]);
    assert_eq!(
        contract
            .reject_purchase("capsule-one".into(), "request-one".into())
            .reason_codes,
        vec!["REQUEST_NOT_PENDING"]
    );
    assert_eq!(
        contract
            .cancel_purchase("capsule-one".into(), "request-one".into())
            .reason_codes,
        vec!["REQUEST_NOT_PENDING"]
    );
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn g03_unknown_quote_is_bounded_business_denial_not_fabricated_terms() {
    let mut contract = payment_fixture(None, 100);
    let mut request = proposal(&contract, "search-q1");
    request.quote_id = "unknown-quote".into();
    context(AGENT, 0, 20);
    let near_sdk::PromiseOrValue::Value(response) = contract.submit_purchase(request) else {
        panic!("unknown quote paid")
    };
    assert_eq!(response.reason_codes, vec!["UNKNOWN_QUOTE"]);
    let record = response.request.unwrap();
    assert!(record.canonical_quote.is_none());
    assert_eq!(
        record
            .checks
            .iter()
            .find(|check| check.rule == "QUOTE_HASH")
            .unwrap()
            .state,
        "NOT_EVALUATED"
    );
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn g02_g13_actual_proxy_cannot_inherit_original_agent_signer() {
    let mut contract = payment_fixture(None, 100);
    let request = proposal(&contract, "search-q1");
    let mut builder = VMContextBuilder::new();
    builder.current_account_id(account("contract.testnet"));
    builder.predecessor_account_id(account("proxy.testnet"));
    builder.signer_account_id(account(AGENT));
    builder.signer_account_pk(key());
    builder.block_timestamp(20);
    testing_env!(builder.build());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(request))).is_err());
    assert!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .is_none()
    );
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn g11_terminal_replay_preserves_denied_settled_and_failed_records() {
    let mut contract = payment_fixture(None, 100);
    publish(&mut contract, quote_input("search-q2", 100));
    publish(&mut contract, quote_input("search-q3", 501));
    for (quote_id, request_id, result) in [
        ("search-q1", "settled", Some(true)),
        ("search-q2", "failed", Some(false)),
        ("search-q3", "denied", None),
    ] {
        drop(submit(&mut contract, quote_id, request_id));
        if let Some(success) = result {
            callback_context(vec![if success {
                near_sdk::PromiseResult::Successful(Vec::new())
            } else {
                near_sdk::PromiseResult::Failed
            }]);
            contract.resolve_purchase(format!("capsule-one:{request_id}"));
        }
        let original = serde_json::to_value(
            contract
                .get_purchase("capsule-one".into(), request_id.into())
                .unwrap(),
        )
        .unwrap();
        let near_sdk::PromiseOrValue::Value(replay) = submit(&mut contract, quote_id, request_id)
        else {
            panic!("terminal replay paid")
        };
        assert_eq!(replay.reason_codes, vec!["REQUEST_REPLAY"]);
        assert_eq!(
            serde_json::to_value(replay.request.unwrap()).unwrap(),
            original
        );
        assert!(near_sdk::test_utils::get_created_receipts().is_empty());
        assert_ledger(&contract, "capsule-one");
    }
}

#[test]
fn c12_cross_capsule_agent_key_and_approval_do_not_leak() {
    let mut contract = payment_fixture(Some(99), 100);
    let mut other = policy();
    other.agent_public_key = PublicKey::from_parts(CurveType::ED25519, vec![2; 32]).unwrap();
    create(&mut contract, "capsule-two", other);
    let mut request = proposal(&contract, "search-q1");
    request.capsule_id = "capsule-two".into();
    context(AGENT, 0, 20);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(request))).is_err());
    drop(submit(&mut contract, "search-q1", "request-one"));
    let hash = contract
        .get_purchase("capsule-one".into(), "request-one".into())
        .unwrap()
        .request_hash;
    context(OPERATOR, 1, 25);
    assert!(
        catch_unwind(AssertUnwindSafe(|| contract.approve_purchase(
            "capsule-two".into(),
            "request-one".into(),
            hash
        )))
        .is_err()
    );
    assert_ledger(&contract, "capsule-one");
    assert_ledger(&contract, "capsule-two");
}

#[test]
fn c11_s12_zero_unused_closes_without_transfer_and_never_reopens() {
    let mut contract = payment_fixture(None, 500);
    publish(&mut contract, quote_input("search-q2", 500));
    for (quote_id, request_id) in [("search-q1", "one"), ("search-q2", "two")] {
        drop(submit(&mut contract, quote_id, request_id));
        callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
        contract.resolve_purchase(format!("capsule-one:{request_id}"));
    }
    context(OPERATOR, 1, 25);
    contract.revoke_capsule("capsule-one".into());
    let near_sdk::PromiseOrValue::Value(response) = contract.close_capsule("capsule-one".into())
    else {
        panic!("zero-unused transfer scheduled")
    };
    assert_eq!(
        response.reason_code.as_deref(),
        Some("NO_UNUSED_PURCHASE_FUNDS")
    );
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.set_capsule_paused("capsule-one".into(), false)
        ))
        .is_err()
    );
    assert_eq!(
        contract.get_capsule("capsule-one".into()).unwrap().status,
        CapsuleStatus::Closed
    );
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn t01_money_json_rejects_negative_exponent_fraction_overflow_and_numbers() {
    for invalid in [
        "-1",
        "1e24",
        "1.0",
        "340282366920938463463374607431768211456",
        "",
    ] {
        assert!(serde_json::from_value::<U128>(serde_json::json!(invalid)).is_err());
    }
    for amount in [0, 1, (1u128 << 53) + 1, 10u128.pow(24), u128::MAX] {
        let encoded = serde_json::to_string(&U128(amount)).unwrap();
        assert_eq!(serde_json::from_str::<U128>(&encoded).unwrap().0, amount);
    }
    assert!(serde_json::from_str::<U128>("9007199254740993").is_err());
}

#[test]
fn t05_s07_generated_two_payment_outcomes_orders_replays_and_close_preserve_ledger() {
    let mut contract = fixture();
    // Four success/failure combinations, both callback orders, and duplicates.
    for mask in 0..4 {
        for reverse in [false, true] {
            let id = format!("sequence-{mask}-{reverse}");
            create(&mut contract, &id, policy());
            for (index, price) in [(0, 400), (1, 400), (2, 300)] {
                let quote_id = format!("q-{mask}-{reverse}-{index}");
                publish(&mut contract, quote_input(&quote_id, price));
                let mut request = proposal(&contract, &quote_id);
                request.capsule_id = id.clone();
                request.project_id = id.clone();
                request.request_id = format!("r-{index}");
                context(AGENT, 0, 20);
                let result = contract.submit_purchase(request);
                if index == 2 {
                    let near_sdk::PromiseOrValue::Value(denied) = result else {
                        panic!("split overspend")
                    };
                    assert!(
                        denied
                            .reason_codes
                            .contains(&"INSUFFICIENT_AVAILABLE_BUDGET".into())
                    );
                } else {
                    assert!(matches!(result, near_sdk::PromiseOrValue::Promise(_)));
                }
                assert_ledger(&contract, &id);
            }
            for index in if reverse { [1, 0] } else { [0, 1] } {
                let result = if mask & (1 << index) != 0 {
                    near_sdk::PromiseResult::Successful(Vec::new())
                } else {
                    near_sdk::PromiseResult::Failed
                };
                callback_context(vec![result]);
                let key = format!("{id}:r-{index}");
                contract.resolve_purchase(key.clone());
                assert_ledger(&contract, &id);
                contract.resolve_purchase(key);
                assert_ledger(&contract, &id);
                contract.resolve_purchase(format!("{id}:missing"));
                assert_ledger(&contract, &id);
            }
            context(OPERATOR, 1, 25);
            contract.revoke_capsule(id.clone());
            drop(contract.close_capsule(id.clone()));
            assert_ledger(&contract, &id);
            callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
            contract.resolve_owner_refund(id.clone(), 1);
            assert_ledger(&contract, &id);
        }
    }
}

#[test]
fn a08_cancelled_and_rejected_pending_requests_cannot_later_approve() {
    let mut contract = payment_fixture(Some(99), 100);
    for (request_id, cancel) in [("cancelled", true), ("rejected", false)] {
        drop(submit(&mut contract, "search-q1", request_id));
        let hash = contract
            .get_purchase("capsule-one".into(), request_id.into())
            .unwrap()
            .request_hash;
        context(OPERATOR, 1, 25);
        if cancel {
            contract.cancel_purchase("capsule-one".into(), request_id.into());
        } else {
            contract.reject_purchase("capsule-one".into(), request_id.into());
        }
        let near_sdk::PromiseOrValue::Value(response) =
            contract.approve_purchase("capsule-one".into(), request_id.into(), hash)
        else {
            panic!("terminal approval paid")
        };
        assert_eq!(response.reason_codes, vec!["REQUEST_NOT_PENDING"]);
        assert_ledger(&contract, "capsule-one");
    }
}

#[test]
fn c05_q07_g12_t04_bounds_reject_bad_ids_scopes_key_hash_and_credit() {
    let mut contract = fixture();
    for bad_id in ["".to_string(), "x".repeat(65), "a:b".into(), "ü".into()] {
        assert!(
            catch_unwind(AssertUnwindSafe(|| create(
                &mut contract,
                &bad_id,
                policy()
            )))
            .is_err()
        );
        let mut input = quote_input("bounded", 1);
        input.service_id = bad_id;
        assert!(catch_unwind(AssertUnwindSafe(|| publish(&mut contract, input))).is_err());
    }
    for index in 0..5 {
        let mut invalid = policy();
        match index {
            0 => invalid.allowed_service_ids = vec!["a".into(); 5],
            1 => invalid.allowed_categories = vec!["search".into(), "search".into()],
            2 => invalid.approval_threshold = Some(U128(501)),
            3 => {
                invalid.agent_public_key =
                    PublicKey::from_parts(CurveType::SECP256K1, vec![1; 64]).unwrap()
            }
            _ => invalid.validation_spec_hash = "00".into(),
        }
        assert!(
            catch_unwind(AssertUnwindSafe(|| create(
                &mut contract,
                "bounded",
                invalid
            )))
            .is_err()
        );
    }
    context(OPERATOR, 1000, 10);
    assert!(
        catch_unwind(AssertUnwindSafe(|| contract.create_capsule(
            "bounded".into(),
            policy(),
            U128(0)
        )))
        .is_err()
    );
    create(&mut contract, "capsule-one", policy());
    publish(&mut contract, quote_input("search-q1", 100));
    for hash in ["", "00", &"x".repeat(64), &"0".repeat(65)] {
        let mut request = proposal(&contract, "search-q1");
        request.expected_quote_hash = hash.into();
        context(AGENT, 0, 20);
        assert!(catch_unwind(AssertUnwindSafe(|| contract.submit_purchase(request))).is_err());
    }
    assert!(contract.get_capsule("bounded".into()).is_none());
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn t04_capsule_provider_and_quote_record_ceilings_are_enforced() {
    let mut contract = fixture();
    for index in 0..MAX_CAPSULES {
        create(&mut contract, &format!("cap-{index}"), policy());
    }
    assert!(
        catch_unwind(AssertUnwindSafe(|| create(
            &mut contract,
            "cap-over-limit",
            policy()
        )))
        .is_err()
    );
    for index in 0..MAX_QUOTES_PER_PROVIDER {
        publish(&mut contract, quote_input(&format!("quote-{index}"), 1));
    }
    assert!(
        catch_unwind(AssertUnwindSafe(|| publish(
            &mut contract,
            quote_input("quote-over-limit", 1)
        )))
        .is_err()
    );
    assert_eq!(
        contract.get_provider("search".into()).unwrap().quote_count,
        MAX_QUOTES_PER_PROVIDER
    );
    for provider_id in ["extract", "fault"] {
        let credit = contract.get_storage_requirements().provider_credit.0;
        context(OPERATOR, credit, 20);
        contract.register_provider(provider_id.into(), account(PUBLISHER), account(PUBLISHER));
    }
    let credit = contract.get_storage_requirements().provider_credit.0;
    context(OPERATOR, credit, 20);
    assert!(
        catch_unwind(AssertUnwindSafe(|| contract.register_provider(
            "provider-over-limit".into(),
            account(PUBLISHER),
            account(PUBLISHER)
        )))
        .is_err()
    );
    assert!(
        contract
            .get_provider("provider-over-limit".into())
            .is_none()
    );
    assert!(contract.get_quote("quote-over-limit".into()).is_none());
}

#[test]
fn q04_t02_borsh_quote_bytes_and_hash_match_independent_node_golden() {
    context("contract.testnet", 0, 10);
    let golden: serde_json::Value =
        serde_json::from_str(include_str!("../../../fixtures/hashes/quote-v1.json")).unwrap();
    // Preserve the v1 golden as historical encoding evidence, not a payable v2 quote.
    #[derive(near_sdk::borsh::BorshSerialize, near_sdk::serde::Deserialize)]
    #[borsh(crate = "near_sdk::borsh")]
    #[serde(crate = "near_sdk::serde")]
    struct LegacyInput {
        quote_id: String,
        provider_id: String,
        recipient_id: near_sdk::AccountId,
        service_id: String,
        category: String,
        quantity: u32,
        price: U128,
        asset: String,
        recurring: bool,
        expires_at_ns: U64,
        previous_quote_id: Option<String>,
    }
    #[derive(near_sdk::borsh::BorshSerialize, near_sdk::serde::Deserialize)]
    #[borsh(crate = "near_sdk::borsh")]
    #[serde(crate = "near_sdk::serde")]
    struct LegacyTerms {
        input: LegacyInput,
        publisher_id: near_sdk::AccountId,
        schema_version: u8,
    }
    let terms: LegacyTerms = serde_json::from_value(golden["terms"].clone()).unwrap();
    let domain = golden["domain"].as_str().unwrap();
    let network = golden["network"].as_str().unwrap();
    let contract = account(golden["contract"].as_str().unwrap());
    let encoded = near_sdk::borsh::to_vec(&(domain, network, &contract, &terms)).unwrap();
    assert_eq!(hashing::encode_hash(&encoded), golden["expected_bytes_hex"]);
    assert_eq!(
        hashing::hash_record(domain, network, &contract, &terms),
        golden["expected_hash"]
    );
    assert_eq!(terms.input.price.0, 9_007_199_254_740_993);
}

fn validation_input() -> ValidationAttestationInput {
    ValidationAttestationInput {
        report_schema_version: 1,
        criteria_id: "research-output-v1".into(),
        criteria_hash: "b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b".into(),
        validator_id: "runlatch-research-validator".into(),
        validator_version: "1.0.0".into(),
        artifact_hash: Some(hashing::encode_hash(&[4; 32])),
        artifact_bytes: Some(4058),
        evidence_hash: hashing::encode_hash(&[5; 32]),
        status: ValidationStatus::Passed,
        reason_codes: Vec::new(),
        issue_count: 0,
        issues_truncated: false,
        metrics: ValidationMetrics {
            record_count: Some(20),
            records_checked: 20,
            unique_id_count: 20,
            unique_url_count: 20,
        },
    }
}
fn outcome_fixture() -> RunLatch {
    let mut contract = fixture();
    let mut p = policy();
    p.validation_spec_hash = validation_input().criteria_hash;
    create(&mut contract, "capsule-one", p);
    publish(&mut contract, quote_input("search-q1", 100));
    contract
}
fn attest(contract: &mut RunLatch, report: ValidationAttestationInput) -> RunOutcome {
    let hash = contract
        .get_capsule("capsule-one".into())
        .unwrap()
        .policy_hash;
    context(OPERATOR, 1, 40);
    contract.record_validation("capsule-one".into(), hash, report)
}

#[test]
fn v06_owner_attestation_stops_authority_and_receipt_keeps_payment_separate() {
    let mut contract = outcome_fixture();
    drop(submit(&mut contract, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_purchase("capsule-one:request-one".into());
    let outcome = attest(&mut contract, validation_input());
    assert_eq!(outcome.attested_by, account(OPERATOR));
    assert_eq!(outcome.source, "OWNER_ATTESTED_OFFCHAIN_REPORT");
    assert_eq!(outcome.recorded_at_ns.0, 40);
    assert_eq!(outcome.outcome_hash.len(), 64);
    let receipt = contract
        .get_receipt("capsule-one".into(), "request-one".into())
        .unwrap();
    assert_eq!(receipt.purchase.status, PurchaseStatus::Settled);
    assert_eq!(
        receipt.outcome.unwrap().report.status,
        ValidationStatus::Passed
    );
    assert_eq!(receipt.capsule.status, CapsuleStatus::Completed);
    assert_eq!(receipt.capsule.spent.0, 100);
    assert_eq!(receipt.capsule.returned.0, 0);
    assert!(
        catch_unwind(AssertUnwindSafe(
            || contract.set_capsule_paused("capsule-one".into(), false)
        ))
        .is_err()
    );
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn v06_owner_identity_and_deposit_capability_cannot_be_substituted() {
    let mut contract = outcome_fixture();
    let hash = contract
        .get_capsule("capsule-one".into())
        .unwrap()
        .policy_hash;
    for (caller, deposit) in [(AGENT, 1), (PUBLISHER, 1), (OPERATOR, 0)] {
        context(caller, deposit, 40);
        assert!(
            catch_unwind(AssertUnwindSafe(|| contract.record_validation(
                "capsule-one".into(),
                hash.clone(),
                validation_input()
            )))
            .is_err()
        );
        assert!(contract.get_outcome("capsule-one".into()).is_none());
        assert_eq!(
            contract.get_capsule("capsule-one".into()).unwrap().status,
            CapsuleStatus::Active
        );
        assert_ledger(&contract, "capsule-one");
    }
}

#[test]
fn v06_policy_criteria_validator_and_hash_binding_are_exact() {
    let mut contract = outcome_fixture();
    let hash = contract
        .get_capsule("capsule-one".into())
        .unwrap()
        .policy_hash;
    context(OPERATOR, 1, 40);
    assert!(
        catch_unwind(AssertUnwindSafe(|| contract.record_validation(
            "capsule-one".into(),
            "wrong-policy".into(),
            validation_input()
        )))
        .is_err()
    );
    for index in 0..5 {
        let mut report = validation_input();
        match index {
            0 => report.criteria_hash = hashing::encode_hash(&[9; 32]),
            1 => report.validator_version = "2.0.0".into(),
            2 => report.criteria_id = "different-criteria".into(),
            3 => report.evidence_hash = "00".into(),
            _ => report.artifact_hash = Some("not-a-hash".into()),
        }
        context(OPERATOR, 1, 40);
        assert!(
            catch_unwind(AssertUnwindSafe(|| contract.record_validation(
                "capsule-one".into(),
                hash.clone(),
                report
            )))
            .is_err()
        );
    }
    assert!(contract.get_outcome("capsule-one".into()).is_none());
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn v06_v10_inconsistent_pass_error_counts_and_artifacts_fail_closed() {
    let mut contract = outcome_fixture();
    for index in 0..8 {
        let mut report = validation_input();
        match index {
            0 => report.artifact_hash = None,
            1 => report.artifact_bytes = Some(0),
            2 => report.metrics.unique_url_count = 19,
            3 => report.metrics.record_count = Some(19),
            4 => report.issue_count = 1,
            5 => report.artifact_bytes = Some(1_048_577),
            6 => report.status = ValidationStatus::Error,
            _ => report.metrics.records_checked = 51,
        }
        assert!(catch_unwind(AssertUnwindSafe(|| attest(&mut contract, report))).is_err());
        assert!(contract.get_outcome("capsule-one".into()).is_none());
    }
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn r08_failed_task_does_not_reverse_settled_payment_or_auto_refund() {
    let mut contract = outcome_fixture();
    drop(submit(&mut contract, "search-q1", "request-one"));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_purchase("capsule-one:request-one".into());
    let mut report = validation_input();
    report.status = ValidationStatus::Failed;
    report.issue_count = 1;
    report.reason_codes = vec!["INVALID_TOPIC".into()];
    attest(&mut contract, report);
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    assert_eq!(
        contract.get_capsule("capsule-one".into()).unwrap().spent.0,
        100
    );
    assert_eq!(
        contract
            .get_purchase("capsule-one".into(), "request-one".into())
            .unwrap()
            .status,
        PurchaseStatus::Settled
    );
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn v06_pending_purchase_or_owner_return_cannot_be_hidden_by_completion() {
    let mut contract = outcome_fixture();
    drop(submit(&mut contract, "search-q1", "request-one"));
    assert!(
        catch_unwind(AssertUnwindSafe(|| attest(
            &mut contract,
            validation_input()
        )))
        .is_err()
    );
    assert!(contract.get_outcome("capsule-one".into()).is_none());
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_purchase("capsule-one:request-one".into());
    context(OPERATOR, 1, 40);
    contract.revoke_capsule("capsule-one".into());
    drop(contract.close_capsule("capsule-one".into()));
    assert!(
        catch_unwind(AssertUnwindSafe(|| attest(
            &mut contract,
            validation_input()
        )))
        .is_err()
    );
    assert_eq!(
        contract.get_capsule("capsule-one".into()).unwrap().status,
        CapsuleStatus::Closing
    );
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn v10_unavailable_artifact_error_is_immutable_and_stops_new_purchases() {
    let mut contract = outcome_fixture();
    let mut report = validation_input();
    report.status = ValidationStatus::Error;
    report.artifact_hash = None;
    report.artifact_bytes = None;
    report.issue_count = 1;
    report.reason_codes = vec!["ARTIFACT_UNAVAILABLE".into()];
    report.metrics = ValidationMetrics {
        record_count: None,
        records_checked: 0,
        unique_id_count: 0,
        unique_url_count: 0,
    };
    let original = attest(&mut contract, report);
    assert!(
        catch_unwind(AssertUnwindSafe(|| attest(
            &mut contract,
            validation_input()
        )))
        .is_err()
    );
    assert_eq!(
        contract
            .get_outcome("capsule-one".into())
            .unwrap()
            .outcome_hash,
        original.outcome_hash
    );
    let near_sdk::PromiseOrValue::Value(denied) =
        submit(&mut contract, "search-q1", "after-completion")
    else {
        panic!("completed authority paid")
    };
    assert!(denied.reason_codes.contains(&"CAPSULE_INACTIVE".into()));
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn v06_closed_revoked_outcomes_do_not_reopen_or_erase_historical_revocation() {
    let mut contract = outcome_fixture();
    context(OPERATOR, 1, 40);
    contract.revoke_capsule("capsule-one".into());
    drop(contract.close_capsule("capsule-one".into()));
    callback_context(vec![near_sdk::PromiseResult::Successful(Vec::new())]);
    contract.resolve_owner_refund("capsule-one".into(), 1);
    let original = contract.get_capsule("capsule-one".into()).unwrap();
    attest(&mut contract, validation_input());
    let current = contract.get_capsule("capsule-one".into()).unwrap();
    assert_eq!(current.status, CapsuleStatus::Closed);
    assert_eq!(current.revoked_at_ns, original.revoked_at_ns);
    assert_eq!(current.returned, original.returned);
    assert_ledger(&contract, "capsule-one");
}

#[test]
fn v06_t04_summary_size_reasons_and_borsh_persistence_are_bounded() {
    let mut contract = outcome_fixture();
    let mut report = validation_input();
    report.status = ValidationStatus::Failed;
    report.issue_count = 65;
    report.issues_truncated = true;
    report.reason_codes = (0..32).map(|i| format!("CODE_{i:059}")).collect();
    assert!(near_sdk::borsh::to_vec(&report).unwrap().len() <= 4096);
    let mut invalid = report.clone();
    invalid.reason_codes.push("LAST_CODE".into());
    assert!(catch_unwind(AssertUnwindSafe(|| attest(&mut contract, invalid))).is_err());
    let original = attest(&mut contract, report);
    contract.capsules.flush();
    contract.providers.flush();
    contract.quotes.flush();
    contract.outcomes.flush();
    env::state_write(&contract);
    drop(contract);
    let restored: RunLatch = env::state_read().unwrap();
    assert_eq!(
        restored
            .get_outcome("capsule-one".into())
            .unwrap()
            .outcome_hash,
        original.outcome_hash
    );
    let extra = serde_json::json!({"report_schema_version":1,"recipient_id":"other.testnet"});
    assert!(serde_json::from_value::<ValidationAttestationInput>(extra).is_err());
}

#[test]
fn v06_completion_does_not_turn_unfunded_pending_approval_into_payment() {
    let mut contract = fixture();
    let mut p = policy();
    p.validation_spec_hash = validation_input().criteria_hash;
    p.approval_threshold = Some(U128(99));
    create(&mut contract, "capsule-one", p);
    publish(&mut contract, quote_input("search-q1", 100));
    let near_sdk::PromiseOrValue::Value(response) = submit(&mut contract, "search-q1", "pending")
    else {
        panic!("approval-pending request paid")
    };
    let pending = response.request.unwrap();
    assert_eq!(pending.status, PurchaseStatus::ApprovalPending);
    assert_ledger(&contract, "capsule-one");
    attest(&mut contract, validation_input());
    context(OPERATOR, 1, 41);
    let near_sdk::PromiseOrValue::Value(response) =
        contract.approve_purchase("capsule-one".into(), "pending".into(), pending.request_hash)
    else {
        panic!("completion reopened pending purchase")
    };
    assert!(response.reason_codes.contains(&"CAPSULE_INACTIVE".into()));
    assert!(!contract.get_quote("search-q1".into()).unwrap().consumed);
    assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    assert_ledger(&contract, "capsule-one");
}
