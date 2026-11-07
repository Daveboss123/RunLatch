// Execute the EXISTING dependency-free Rust Gate, not a second policy authorizer.
#[path = "../../contracts/runlatch/src/gate.rs"]
mod gate;
use gate::*;

fn main() {
    let cases = ["valid", "tamper", "over-budget", "stale", "recurring", "recurring-review", "revoked", "replay", "duplicate", "wrong-agent", "missing-quote", "unbounded", "threshold-equal", "threshold-above", "expired"];
    let providers = vec!["database".to_string(), "hosting".to_string()];
    let services = vec!["database-instance".to_string(), "hosting-instance".to_string()];
    let categories = vec!["infrastructure".to_string()];
    let unit = 10u128.pow(23);
    let key = [9u8; 33];
    let other_key = [8u8; 33];
    let hash = [7u8; 32];
    let other_hash = [6u8; 32];
    let _states = [CapsuleState::Paused, CapsuleState::Completed, CapsuleState::Closing, CapsuleState::Closed];
    println!("[");
    for (index, id) in cases.iter().enumerate() {
        let recurring = *id == "recurring" || *id == "recurring-review";
        let budget = if *id == "over-budget" { 8 * unit } else if *id == "recurring-review" { 40 * unit } else { 30 * unit };
        let price = if recurring { 2 * unit } else if *id == "threshold-equal" { 6 * unit } else if *id == "threshold-above" { 7 * unit } else { 5 * unit };
        let publisher = if recurring { "hosting.fixture.testnet" } else { "database.fixture.testnet" };
        let context = PurchaseContext {
            project: ProjectView { bound: true, active: true, revision_fresh: *id != "stale", expires_at_ns: 101 },
            capsule: CapsuleView {
                state: if *id == "revoked" { CapsuleState::Revoked } else { CapsuleState::Active },
                agent_account: "agent.fixture.testnet", agent_key: &key, expires_at_ns: 101,
                original_budget: budget, allocated: budget, spent: 5 * unit, reserved: 2 * unit, committed_future: 0, returned: 0,
                per_purchase_limit: 10 * unit, per_commitment_limit: 30 * unit, recurring_allowed: true,
                allowed_providers: &providers, allowed_services: &services, allowed_categories: &categories, max_quantity: 1, approval_threshold: Some(6 * unit),
            },
            quote: if *id == "missing-quote" { None } else { Some(QuoteView {
                provider_id: if recurring { "hosting" } else { "database" }, provider_account: publisher, recipient_account: publisher,
                registered_publisher: Some(publisher), registered_recipient: Some(publisher), provider_active: true, consumed: false,
                expires_at_ns: 100, asset: NATIVE_ASSET, service_id: if recurring { "hosting-instance" } else { "database-instance" }, category: "infrastructure", quantity: 1,
                recurring, price, future_commitment: if *id == "unbounded" { None } else { Some(if recurring { 22 * unit } else { 0 }) }, canonical_hash: &hash,
            }) },
            resource_duplicate: *id == "duplicate", predecessor_account: "agent.fixture.testnet", signer_account: "agent.fixture.testnet",
            signer_key: if *id == "wrong-agent" { &other_key } else { &key }, expected_quote_hash: if *id == "tamper" { &other_hash } else { &hash },
            request_exists: *id == "replay", now_ns: if *id == "expired" { 100 } else { 10 },
        };
        let result = evaluate(&context);
        let reasons = result.reasons.iter().map(|r| format!("\"{}\"", r.code())).collect::<Vec<_>>().join(",");
        let checks = result.checks.iter().map(|check| format!("{{\"rule\":\"{}\",\"state\":\"{}\"}}", check.rule, match check.state { CheckState::Passed => "PASSED", CheckState::Failed => "FAILED", CheckState::NotEvaluated => "NOT_EVALUATED" })).collect::<Vec<_>>().join(",");
        println!("{{\"id\":\"{}\",\"decision\":\"{}\",\"reasons\":[{}],\"checks\":[{}]}}{}", id, result.decision.code(), reasons, checks, if index + 1 == cases.len() { "" } else { "," });
    }
    println!("]");
}
