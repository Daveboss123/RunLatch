//! Direction-change project checks use SDK mocks; Sandbox provides runtime proof separately.
use crate::{RunLatch, foundation_tests::*, model::*};
use near_sdk::{
    PromiseOrValue, PromiseResult,
    json_types::{U64, U128},
};
use std::panic::{AssertUnwindSafe, catch_unwind};

fn project(contract: &mut RunLatch, budget: u128) {
    let credit = contract.get_storage_requirements().project_credit.0;
    context("operator.testnet", credit, 10);
    contract.create_project(ProjectInput {
        project_id: "client-work".into(),
        organisation_id: "northstar-demo".into(),
        client_ref: "acme-demo".into(),
        budget_ceiling: U128(budget),
        expires_at_ns: U64(100_000),
        outcome_definition_hash: "03".repeat(32),
    });
}
fn capsule(
    contract: &mut RunLatch,
    id: &str,
    budget: u128,
    revision: u64,
    threshold: Option<u128>,
) {
    let mut p = policy();
    p.project_id = "client-work".into();
    p.project_revision = U64(revision);
    p.budget = U128(budget);
    p.per_purchase_limit = U128(budget);
    p.per_commitment_limit = U128(budget);
    p.approval_threshold = threshold.map(U128);
    let credit = contract.get_storage_requirements().capsule_credit;
    context("operator.testnet", budget + credit.0, 10);
    contract.create_capsule(id.into(), p, credit);
}
fn request(
    contract: &RunLatch,
    capsule_id: &str,
    quote: &str,
    id: &str,
    revision: u64,
) -> PurchaseProposal {
    PurchaseProposal {
        project_id: "client-work".into(),
        project_revision: U64(revision),
        capsule_id: capsule_id.into(),
        request_id: id.into(),
        quote_id: quote.into(),
        expected_quote_hash: contract.get_quote(quote.into()).unwrap().quote_hash,
    }
}

#[test]
fn p01_p05_project_allocations_are_funded_disjoint_and_bounded() {
    let mut c = fixture();
    project(&mut c, 1000);
    capsule(&mut c, "a", 600, 1, None);
    capsule(&mut c, "b", 400, 1, None);
    assert_eq!(
        c.get_project("client-work".into())
            .unwrap()
            .allocated_authority
            .0,
        1000
    );
    assert!(catch_unwind(AssertUnwindSafe(|| capsule(&mut c, "over", 1, 1, None))).is_err());
    assert!(c.get_capsule("over".into()).is_none());
    assert_eq!(c.get_projects(0, 20).len(), 1);
}
#[test]
fn p02_only_owner_with_exact_revision_can_change_project_authority() {
    let mut c = fixture();
    project(&mut c, 1000);
    for (actor, deposit, rev) in [
        ("agent.testnet", 1, 1),
        ("operator.testnet", 0, 1),
        ("operator.testnet", 1, 2),
    ] {
        context(actor, deposit, 20);
        assert!(
            catch_unwind(AssertUnwindSafe(|| c.set_project_status(
                "client-work".into(),
                U64(rev),
                ProjectStatus::Paused
            )))
            .is_err()
        );
    }
    assert_eq!(c.get_project("client-work".into()).unwrap().revision.0, 1);
}
#[test]
fn p03_cancelled_project_blocks_old_purchase_and_cannot_reopen() {
    let mut c = fixture();
    project(&mut c, 1000);
    capsule(&mut c, "a", 1000, 1, None);
    publish(&mut c, quote_input("q", 100));
    context("operator.testnet", 1, 20);
    c.set_project_status("client-work".into(), U64(1), ProjectStatus::Cancelled);
    let r = request(&c, "a", "q", "r", 1);
    context("agent.testnet", 0, 21);
    let PromiseOrValue::Value(result) = c.submit_purchase(r) else {
        panic!("cancelled project paid")
    };
    assert_eq!(result.reason_codes, vec!["PROJECT_INACTIVE"]);
    context("operator.testnet", 1, 22);
    assert!(
        catch_unwind(AssertUnwindSafe(|| c.set_project_status(
            "client-work".into(),
            U64(2),
            ProjectStatus::Active
        )))
        .is_err()
    );
    assert!(!c.get_quote("q".into()).unwrap().consumed);
}
#[test]
fn p03_revision_invalidates_pending_approval_and_policy_stays_immutable() {
    let mut c = fixture();
    project(&mut c, 1000);
    capsule(&mut c, "a", 500, 1, Some(0));
    publish(&mut c, quote_input("q", 100));
    let r = request(&c, "a", "q", "r", 1);
    context("agent.testnet", 0, 20);
    drop(c.submit_purchase(r));
    let original = c.get_capsule("a".into()).unwrap();
    let pending = c.get_purchase("a".into(), "r".into()).unwrap();
    context("operator.testnet", 1, 21);
    c.advance_project_revision("client-work".into(), U64(1));
    let PromiseOrValue::Value(result) =
        c.approve_purchase("a".into(), "r".into(), pending.request_hash)
    else {
        panic!("stale approval paid")
    };
    assert_eq!(result.reason_codes, vec!["STALE_PROJECT_REVISION"]);
    assert_eq!(
        c.get_capsule("a".into()).unwrap().policy_hash,
        original.policy_hash
    );
    capsule(&mut c, "new-owner-reviewed", 500, 2, None);
}
#[test]
fn p04_agent_cannot_rebind_project_or_bless_current_revision() {
    let mut c = fixture();
    project(&mut c, 1000);
    capsule(&mut c, "a", 1000, 1, None);
    publish(&mut c, quote_input("q", 100));
    let mut r = request(&c, "a", "q", "cross", 1);
    r.project_id = "other-project".into();
    context("agent.testnet", 0, 20);
    let PromiseOrValue::Value(result) = c.submit_purchase(r) else {
        panic!("cross project paid")
    };
    assert_eq!(result.reason_codes, vec!["PROJECT_BINDING_MISMATCH"]);
    let r = request(&c, "a", "q", "new-revision", 2);
    context("agent.testnet", 0, 20);
    let PromiseOrValue::Value(result) = c.submit_purchase(r) else {
        panic!("forged revision paid")
    };
    assert_eq!(result.reason_codes, vec!["STALE_PROJECT_REVISION"]);
}
#[test]
fn p03_pending_transfer_settles_after_project_revocation() {
    let mut c = fixture();
    project(&mut c, 1000);
    capsule(&mut c, "a", 1000, 1, None);
    publish(&mut c, quote_input("q", 100));
    let r = request(&c, "a", "q", "r", 1);
    context("agent.testnet", 0, 20);
    drop(c.submit_purchase(r));
    context("operator.testnet", 1, 21);
    c.set_project_status("client-work".into(), U64(1), ProjectStatus::Cancelled);
    let mut builder = near_sdk::test_utils::VMContextBuilder::new();
    builder
        .current_account_id(account("contract.testnet"))
        .predecessor_account_id(account("contract.testnet"));
    near_sdk::testing_env!(
        builder.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(Vec::new())]
    );
    c.resolve_purchase("a:r".into());
    assert_eq!(c.get_capsule("a".into()).unwrap().spent.0, 100);
    assert_eq!(
        c.get_receipt("a".into(), "r".into())
            .unwrap()
            .project
            .status,
        ProjectStatus::Cancelled
    );
}

#[test]
fn p14_oversized_project_and_quote_hash_never_enter_funded_denial_history() {
    let mut c = fixture();
    project(&mut c, 1000);
    capsule(&mut c, "a", 1000, 1, None);
    publish(&mut c, quote_input("q", 100));
    let original = near_sdk::serde_json::to_vec(&c.get_capsule("a".into()).unwrap()).unwrap();
    for oversize_project in [true, false] {
        let mut proposal = request(&c, "a", "q", "invalid", 1);
        if oversize_project {
            proposal.project_id = "x".repeat(65);
        } else {
            proposal.expected_quote_hash = "0".repeat(65);
        }
        context("agent.testnet", 0, 20);
        assert!(catch_unwind(AssertUnwindSafe(|| c.submit_purchase(proposal.clone()))).is_err());
        assert!(
            catch_unwind(AssertUnwindSafe(|| c.preview_purchase(
                proposal,
                account("agent.testnet"),
                key()
            )))
            .is_err()
        );
        assert!(c.get_purchase("a".into(), "invalid".into()).is_none());
        assert_eq!(
            original,
            near_sdk::serde_json::to_vec(&c.get_capsule("a".into()).unwrap()).unwrap()
        );
    }
    assert!(!c.get_quote("q".into()).unwrap().consumed);
}
