//! Dependency-free deterministic checks used by the contract, not an AI decision.
//! Views passed here must be populated from contract storage and runtime identity.
//! These unit tests are LOCAL logic tests, never settlement or testnet evidence.

pub const NATIVE_ASSET: &str = "near-native";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CapsuleState {
    Active,
    Paused,
    Revoked,
    Completed,
    Closing,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Approved,
    ApprovalRequired,
    Denied,
}

impl Decision {
    pub const fn code(self) -> &'static str {
        match self {
            Self::Approved => "APPROVED",
            Self::ApprovalRequired => "APPROVAL_REQUIRED",
            Self::Denied => "DENIED",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CheckState {
    Passed,
    Failed,
    NotEvaluated,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reason {
    UnauthorizedAgent,
    ProjectBindingMismatch,
    ProjectInactive,
    StaleProjectRevision,
    ProjectExpired,
    UnboundedCommitment,
    DuplicateResource,
    CommitmentLimitExceeded,
    InsufficientCommitmentBudget,
    CapsuleInactive,
    CapsuleExpired,
    RequestReplay,
    UnknownQuote,
    QuoteTermsMismatch,
    UnknownProvider,
    ProviderBindingMismatch,
    ProviderNotAllowed,
    ProviderSuspended,
    RecipientMismatch,
    QuoteExpired,
    QuoteConsumed,
    UnsupportedAsset,
    ServiceNotAllowed,
    CategoryNotAllowed,
    QuantityLimitExceeded,
    RecurringForbidden,
    InvalidQuoteAmount,
    PurchaseLimitExceeded,
    InvalidBudgetState,
    InsufficientAvailableBudget,
}

impl Reason {
    pub const fn code(self) -> &'static str {
        match self {
            Self::UnauthorizedAgent => "UNAUTHORIZED_AGENT",
            Self::ProjectBindingMismatch => "PROJECT_BINDING_MISMATCH",
            Self::ProjectInactive => "PROJECT_INACTIVE",
            Self::StaleProjectRevision => "STALE_PROJECT_REVISION",
            Self::ProjectExpired => "PROJECT_EXPIRED",
            Self::UnboundedCommitment => "UNBOUNDED_COMMITMENT",
            Self::DuplicateResource => "DUPLICATE_RESOURCE",
            Self::CommitmentLimitExceeded => "COMMITMENT_LIMIT_EXCEEDED",
            Self::InsufficientCommitmentBudget => "INSUFFICIENT_COMMITMENT_BUDGET",
            Self::CapsuleInactive => "CAPSULE_INACTIVE",
            Self::CapsuleExpired => "CAPSULE_EXPIRED",
            Self::RequestReplay => "REQUEST_REPLAY",
            Self::UnknownQuote => "UNKNOWN_QUOTE",
            Self::QuoteTermsMismatch => "QUOTE_TERMS_MISMATCH",
            Self::UnknownProvider => "UNKNOWN_PROVIDER",
            Self::ProviderBindingMismatch => "PROVIDER_BINDING_MISMATCH",
            Self::ProviderNotAllowed => "PROVIDER_NOT_ALLOWED",
            Self::ProviderSuspended => "PROVIDER_SUSPENDED",
            Self::RecipientMismatch => "RECIPIENT_MISMATCH",
            Self::QuoteExpired => "QUOTE_EXPIRED",
            Self::QuoteConsumed => "QUOTE_CONSUMED",
            Self::UnsupportedAsset => "UNSUPPORTED_ASSET",
            Self::ServiceNotAllowed => "SERVICE_NOT_ALLOWED",
            Self::CategoryNotAllowed => "CATEGORY_NOT_ALLOWED",
            Self::QuantityLimitExceeded => "QUANTITY_LIMIT_EXCEEDED",
            Self::RecurringForbidden => "RECURRING_FORBIDDEN",
            Self::InvalidQuoteAmount => "INVALID_QUOTE_AMOUNT",
            Self::PurchaseLimitExceeded => "PURCHASE_LIMIT_EXCEEDED",
            Self::InvalidBudgetState => "INVALID_BUDGET_STATE",
            Self::InsufficientAvailableBudget => "INSUFFICIENT_AVAILABLE_BUDGET",
        }
    }
}

pub struct CapsuleView<'a> {
    pub state: CapsuleState,
    pub agent_account: &'a str,
    pub agent_key: &'a [u8],
    pub expires_at_ns: u64,
    pub original_budget: u128,
    pub allocated: u128,
    pub spent: u128,
    pub reserved: u128,
    pub committed_future: u128,
    pub returned: u128,
    pub per_purchase_limit: u128,
    pub per_commitment_limit: u128,
    pub recurring_allowed: bool,
    pub allowed_providers: &'a [String],
    pub allowed_services: &'a [String],
    pub allowed_categories: &'a [String],
    pub max_quantity: u32,
    pub approval_threshold: Option<u128>,
}

pub struct QuoteView<'a> {
    pub provider_id: &'a str,
    pub provider_account: &'a str,
    pub recipient_account: &'a str,
    pub registered_publisher: Option<&'a str>,
    pub registered_recipient: Option<&'a str>,
    pub provider_active: bool,
    pub consumed: bool,
    pub expires_at_ns: u64,
    pub asset: &'a str,
    pub service_id: &'a str,
    pub category: &'a str,
    pub quantity: u32,
    pub recurring: bool,
    pub price: u128,
    pub future_commitment: Option<u128>,
    pub canonical_hash: &'a [u8; 32],
}

pub struct PurchaseContext<'a> {
    pub project: ProjectView,
    pub resource_duplicate: bool,
    pub capsule: CapsuleView<'a>,
    pub quote: Option<QuoteView<'a>>,
    pub predecessor_account: &'a str,
    pub signer_account: &'a str,
    pub signer_key: &'a [u8],
    pub expected_quote_hash: &'a [u8; 32],
    pub request_exists: bool,
    pub now_ns: u64,
}

pub struct ProjectView {
    pub bound: bool,
    pub active: bool,
    pub revision_fresh: bool,
    pub expires_at_ns: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Check {
    pub rule: &'static str,
    pub state: CheckState,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Evaluation {
    pub decision: Decision,
    pub checks: Vec<Check>,
    pub reasons: Vec<Reason>,
}

const RULES: [&str; 29] = [
    "AGENT_IDENTITY",
    "CAPSULE_ACTIVE",
    "CAPSULE_EXPIRY",
    "REQUEST_UNIQUE",
    "QUOTE_EXISTS",
    "QUOTE_HASH",
    "PROVIDER_REGISTERED",
    "PROVIDER_BINDING",
    "PROVIDER_ALLOWED",
    "PROVIDER_ACTIVE",
    "RECIPIENT_BOUND",
    "QUOTE_EXPIRY",
    "QUOTE_UNUSED",
    "NATIVE_ASSET",
    "SERVICE_ALLOWED",
    "CATEGORY_ALLOWED",
    "QUANTITY_ALLOWED",
    "RECURRING_POLICY",
    "POSITIVE_PRICE",
    "PURCHASE_LIMIT",
    "AVAILABLE_BUDGET",
    "PROJECT_BOUND",
    "PROJECT_ACTIVE",
    "PROJECT_REVISION",
    "PROJECT_EXPIRY",
    "COMMITMENT_BOUNDED",
    "RESOURCE_UNIQUE",
    "COMMITMENT_LIMIT",
    "COMMITMENT_BUDGET",
];

impl Evaluation {
    fn new() -> Self {
        Self {
            decision: Decision::Denied,
            checks: RULES
                .iter()
                .map(|rule| Check {
                    rule,
                    state: CheckState::NotEvaluated,
                })
                .collect(),
            reasons: Vec::new(),
        }
    }

    fn record(&mut self, index: usize, passed: bool, reason: Reason) -> bool {
        self.checks[index].state = if passed {
            CheckState::Passed
        } else {
            CheckState::Failed
        };
        if !passed {
            self.reasons.push(reason);
        }
        passed
    }
}

fn allowed(scope: &[String], value: &str) -> bool {
    scope.iter().any(|entry| entry == value)
}

/// No approval flag or free recipient/price comes from a purchase proposal.
/// The owner approval method separately verifies exact pending-request authority,
/// then may schedule an eligible ApprovalRequired result; never a Denied one.
pub fn evaluate(context: &PurchaseContext<'_>) -> Evaluation {
    let mut result = Evaluation::new();
    let capsule = &context.capsule;
    let identity_ok = context.predecessor_account == capsule.agent_account
        && context.signer_account == capsule.agent_account
        && context.signer_key == capsule.agent_key;
    if !result.record(0, identity_ok, Reason::UnauthorizedAgent) {
        return result;
    }
    if !result.record(21, context.project.bound, Reason::ProjectBindingMismatch)
        || !result.record(22, context.project.active, Reason::ProjectInactive)
        || !result.record(
            23,
            context.project.revision_fresh,
            Reason::StaleProjectRevision,
        )
        || !result.record(
            24,
            context.now_ns < context.project.expires_at_ns,
            Reason::ProjectExpired,
        )
    {
        return result;
    }
    if !result.record(
        1,
        capsule.state == CapsuleState::Active,
        Reason::CapsuleInactive,
    ) {
        return result;
    }
    if !result.record(
        2,
        context.now_ns < capsule.expires_at_ns,
        Reason::CapsuleExpired,
    ) {
        return result;
    }
    if !result.record(3, !context.request_exists, Reason::RequestReplay) {
        return result;
    }
    if !result.record(4, context.quote.is_some(), Reason::UnknownQuote) {
        return result;
    }
    let quote = context.quote.as_ref().expect("quote existence checked");
    if !result.record(
        5,
        context.expected_quote_hash == quote.canonical_hash,
        Reason::QuoteTermsMismatch,
    ) {
        return result;
    }
    let registered = quote.registered_publisher.is_some() && quote.registered_recipient.is_some();
    if !result.record(6, registered, Reason::UnknownProvider) {
        return result;
    }
    result.record(
        7,
        quote.registered_publisher == Some(quote.provider_account),
        Reason::ProviderBindingMismatch,
    );
    result.record(
        8,
        allowed(capsule.allowed_providers, quote.provider_id),
        Reason::ProviderNotAllowed,
    );
    result.record(9, quote.provider_active, Reason::ProviderSuspended);
    result.record(
        10,
        quote.registered_recipient == Some(quote.recipient_account),
        Reason::RecipientMismatch,
    );
    result.record(
        11,
        context.now_ns < quote.expires_at_ns,
        Reason::QuoteExpired,
    );
    result.record(12, !quote.consumed, Reason::QuoteConsumed);
    result.record(13, quote.asset == NATIVE_ASSET, Reason::UnsupportedAsset);
    result.record(
        14,
        allowed(capsule.allowed_services, quote.service_id),
        Reason::ServiceNotAllowed,
    );
    result.record(
        15,
        allowed(capsule.allowed_categories, quote.category),
        Reason::CategoryNotAllowed,
    );
    result.record(
        16,
        quote.quantity > 0 && quote.quantity <= capsule.max_quantity,
        Reason::QuantityLimitExceeded,
    );
    result.record(
        17,
        !quote.recurring || capsule.recurring_allowed,
        Reason::RecurringForbidden,
    );
    result.record(18, quote.price > 0, Reason::InvalidQuoteAmount);
    result.record(
        19,
        quote.price <= capsule.per_purchase_limit,
        Reason::PurchaseLimitExceeded,
    );
    let total = quote
        .future_commitment
        .and_then(|future| quote.price.checked_add(future));
    result.record(25, total.is_some(), Reason::UnboundedCommitment);
    result.record(26, !context.resource_duplicate, Reason::DuplicateResource);
    if let Some(total) = total {
        result.record(
            27,
            total <= capsule.per_commitment_limit,
            Reason::CommitmentLimitExceeded,
        );
    }

    let available = capsule
        .allocated
        .checked_sub(capsule.spent)
        .and_then(|remaining| remaining.checked_sub(capsule.reserved));
    let accounting_valid = capsule.allocated.checked_add(capsule.returned)
        == Some(capsule.original_budget)
        && available.is_some_and(|amount| capsule.committed_future <= amount);
    if !accounting_valid {
        result.record(20, false, Reason::InvalidBudgetState);
    } else {
        result.record(
            20,
            available.is_some_and(|amount| quote.price <= amount),
            Reason::InsufficientAvailableBudget,
        );
    }
    if let Some(total) = total
        && accounting_valid
    {
        result.record(
            28,
            available
                .and_then(|n| n.checked_sub(capsule.committed_future))
                .is_some_and(|n| total <= n),
            Reason::InsufficientCommitmentBudget,
        );
    }
    if !result.reasons.is_empty() {
        return result;
    }
    result.decision = if quote.recurring
        || capsule
            .approval_threshold
            .is_some_and(|threshold| total.is_some_and(|amount| amount > threshold))
    {
        Decision::ApprovalRequired
    } else {
        Decision::Approved
    };
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // Harmless LOCAL fixtures: these identities/hashes are not deployed accounts,
    // transactions, credentials, or actual registered provider data.
    const KEY: [u8; 33] = [9; 33];
    const HASH: [u8; 32] = [7; 32];

    struct Fixture {
        providers: Vec<String>,
        services: Vec<String>,
        categories: Vec<String>,
    }
    impl Fixture {
        fn new() -> Self {
            Self {
                providers: vec!["search".into()],
                services: vec!["search-batch".into()],
                categories: vec!["search".into()],
            }
        }
        fn context(&self) -> PurchaseContext<'_> {
            PurchaseContext {
                project: ProjectView {
                    bound: true,
                    active: true,
                    revision_fresh: true,
                    expires_at_ns: 100,
                },
                resource_duplicate: false,
                capsule: CapsuleView {
                    state: CapsuleState::Active,
                    agent_account: "agent.testnet",
                    agent_key: &KEY,
                    expires_at_ns: 100,
                    original_budget: 1_000,
                    allocated: 1_000,
                    spent: 0,
                    reserved: 0,
                    committed_future: 0,
                    returned: 0,
                    per_purchase_limit: 500,
                    per_commitment_limit: u128::MAX,
                    recurring_allowed: false,
                    allowed_providers: &self.providers,
                    allowed_services: &self.services,
                    allowed_categories: &self.categories,
                    max_quantity: 20,
                    approval_threshold: None,
                },
                quote: Some(QuoteView {
                    provider_id: "search",
                    provider_account: "provider.testnet",
                    recipient_account: "provider.testnet",
                    registered_publisher: Some("provider.testnet"),
                    registered_recipient: Some("provider.testnet"),
                    provider_active: true,
                    consumed: false,
                    expires_at_ns: 90,
                    asset: NATIVE_ASSET,
                    service_id: "search-batch",
                    category: "search",
                    quantity: 20,
                    recurring: false,
                    price: 100,
                    future_commitment: Some(0),
                    canonical_hash: &HASH,
                }),
                predecessor_account: "agent.testnet",
                signer_account: "agent.testnet",
                signer_key: &KEY,
                expected_quote_hash: &HASH,
                request_exists: false,
                now_ns: 10,
            }
        }
    }
    fn denied(context: &PurchaseContext<'_>, reason: Reason) {
        let result = evaluate(context);
        assert_eq!(result.decision, Decision::Denied);
        assert!(
            result.reasons.contains(&reason),
            "missing {reason:?}: {result:?}"
        );
    }

    #[test]
    fn g01_valid_canonical_purchase_is_eligible() {
        let fixture = Fixture::new();
        let result = evaluate(&fixture.context());
        assert_eq!(result.decision, Decision::Approved);
        assert!(result.reasons.is_empty());
        assert!(
            result
                .checks
                .iter()
                .all(|check| check.state == CheckState::Passed)
        );
    }
    #[test]
    fn g02_account_key_and_proxy_identity_are_enforced() {
        let f = Fixture::new();
        let mut c = f.context();
        c.predecessor_account = "proxy.testnet";
        denied(&c, Reason::UnauthorizedAgent);
        c.predecessor_account = "agent.testnet";
        c.signer_account = "operator.testnet";
        denied(&c, Reason::UnauthorizedAgent);
        c.signer_account = "agent.testnet";
        c.signer_key = &[1; 33];
        denied(&c, Reason::UnauthorizedAgent);
    }
    #[test]
    fn c06_c08_c11_all_non_active_states_block_purchases() {
        let f = Fixture::new();
        let mut c = f.context();
        for state in [
            CapsuleState::Paused,
            CapsuleState::Revoked,
            CapsuleState::Completed,
            CapsuleState::Closing,
            CapsuleState::Closed,
        ] {
            c.capsule.state = state;
            denied(&c, Reason::CapsuleInactive);
        }
    }
    #[test]
    fn c09_expiry_is_exclusive_at_the_deadline() {
        let f = Fixture::new();
        let mut c = f.context();
        c.capsule.expires_at_ns = 11;
        assert_eq!(evaluate(&c).decision, Decision::Approved);
        c.now_ns = 11;
        denied(&c, Reason::CapsuleExpired);
        c.now_ns = 12;
        denied(&c, Reason::CapsuleExpired);
    }
    #[test]
    fn g11_request_replay_is_denied_before_quote_checks() {
        let f = Fixture::new();
        let mut c = f.context();
        c.request_exists = true;
        let result = evaluate(&c);
        assert_eq!(result.reasons, vec![Reason::RequestReplay]);
        assert_eq!(result.checks[4].state, CheckState::NotEvaluated);
    }
    #[test]
    fn g03_unknown_quote_does_not_fabricate_dependent_checks() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote = None;
        let result = evaluate(&c);
        assert_eq!(result.reasons, vec![Reason::UnknownQuote]);
        assert!(
            result.checks[5..21]
                .iter()
                .all(|check| check.state == CheckState::NotEvaluated)
        );
    }
    #[test]
    fn g04_g05_tampered_expected_terms_hash_is_denied() {
        let f = Fixture::new();
        let mut c = f.context();
        c.expected_quote_hash = &[8; 32];
        denied(&c, Reason::QuoteTermsMismatch);
        assert_eq!(evaluate(&c).checks[6].state, CheckState::NotEvaluated);
    }
    #[test]
    fn q01_g03_unregistered_provider_is_denied() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().registered_publisher = None;
        denied(&c, Reason::UnknownProvider);
    }
    #[test]
    fn q02_publisher_is_bound_to_registration() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().provider_account = "imposter.testnet";
        denied(&c, Reason::ProviderBindingMismatch);
    }
    #[test]
    fn q05_recipient_is_bound_to_registration() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().recipient_account = "imposter.testnet";
        denied(&c, Reason::RecipientMismatch);
    }
    #[test]
    fn g03_provider_scope_is_enforced() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().provider_id = "other";
        denied(&c, Reason::ProviderNotAllowed);
    }
    #[test]
    fn q10_suspended_provider_cannot_pay() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().provider_active = false;
        denied(&c, Reason::ProviderSuspended);
    }
    #[test]
    fn q06_quote_expiry_is_exclusive_at_deadline() {
        let f = Fixture::new();
        let mut c = f.context();
        c.now_ns = 90;
        denied(&c, Reason::QuoteExpired);
        c.now_ns = 89;
        assert_eq!(evaluate(&c).decision, Decision::Approved);
    }
    #[test]
    fn q08_consumed_quote_is_denied() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().consumed = true;
        denied(&c, Reason::QuoteConsumed);
    }
    #[test]
    fn q07_only_native_asset_is_supported() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().asset = "usdc";
        denied(&c, Reason::UnsupportedAsset);
    }
    #[test]
    fn g07_service_and_category_scopes_are_independent() {
        let f = Fixture::new();
        let mut c = f.context();
        let q = c.quote.as_mut().unwrap();
        q.service_id = "compute-batch";
        q.category = "compute";
        denied(&c, Reason::ServiceNotAllowed);
        denied(&c, Reason::CategoryNotAllowed);
    }
    #[test]
    fn g07_quantity_is_positive_and_bounded() {
        let f = Fixture::new();
        let mut c = f.context();
        for quantity in [0, 21, u32::MAX] {
            c.quote.as_mut().unwrap().quantity = quantity;
            denied(&c, Reason::QuantityLimitExceeded);
        }
    }
    #[test]
    fn g06_recurring_terms_cannot_be_approved() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().recurring = true;
        c.capsule.approval_threshold = Some(0);
        denied(&c, Reason::RecurringForbidden);
    }
    #[test]
    fn q07_zero_price_is_not_a_paid_quote() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().price = 0;
        denied(&c, Reason::InvalidQuoteAmount);
    }
    #[test]
    fn g08_per_purchase_limit_boundary() {
        let f = Fixture::new();
        let mut c = f.context();
        c.quote.as_mut().unwrap().price = 500;
        assert_eq!(evaluate(&c).decision, Decision::Approved);
        c.quote.as_mut().unwrap().price = 501;
        denied(&c, Reason::PurchaseLimitExceeded);
    }
    #[test]
    fn g09_g10_pending_reservations_reduce_available_budget() {
        let f = Fixture::new();
        let mut c = f.context();
        c.capsule.spent = 400;
        c.capsule.reserved = 500;
        assert_eq!(evaluate(&c).decision, Decision::Approved);
        c.capsule.reserved = 501;
        denied(&c, Reason::InsufficientAvailableBudget);
    }
    #[test]
    fn s12_returned_funds_cannot_be_reused() {
        let f = Fixture::new();
        let mut c = f.context();
        c.capsule.allocated = 100;
        c.capsule.returned = 900;
        assert_eq!(evaluate(&c).decision, Decision::Approved);
        c.quote.as_mut().unwrap().price = 101;
        denied(&c, Reason::InsufficientAvailableBudget);
    }
    #[test]
    fn t01_t05_arithmetic_corruption_and_overflow_fail_closed() {
        let f = Fixture::new();
        let mut c = f.context();
        c.capsule.spent = u128::MAX;
        denied(&c, Reason::InvalidBudgetState);
        c.capsule.spent = 0;
        c.capsule.returned = u128::MAX;
        denied(&c, Reason::InvalidBudgetState);
        c.capsule.returned = 0;
        c.capsule.reserved = 1_001;
        denied(&c, Reason::InvalidBudgetState);
    }
    #[test]
    fn a01_a02_soft_threshold_never_bypasses_hard_rules() {
        let f = Fixture::new();
        let mut c = f.context();
        c.capsule.approval_threshold = Some(100);
        assert_eq!(evaluate(&c).decision, Decision::Approved);
        c.capsule.approval_threshold = Some(99);
        assert_eq!(evaluate(&c).decision, Decision::ApprovalRequired);
        c.capsule.approval_threshold = Some(0);
        assert_eq!(evaluate(&c).decision, Decision::ApprovalRequired);
        c.quote.as_mut().unwrap().price = 501;
        denied(&c, Reason::PurchaseLimitExceeded);
    }
    #[test]
    fn g14_reports_multiple_hard_failures_deterministically() {
        let f = Fixture::new();
        let mut c = f.context();
        c.capsule.reserved = 950;
        c.quote.as_mut().unwrap().price = 501;
        let result = evaluate(&c);
        assert_eq!(result, evaluate(&c));
        assert!(result.reasons.contains(&Reason::PurchaseLimitExceeded));
        assert!(
            result
                .reasons
                .contains(&Reason::InsufficientAvailableBudget)
        );
    }
    #[test]
    fn t05_exhaustive_small_budget_boundaries_preserve_eligibility() {
        let f = Fixture::new();
        for budget in 1..=20u128 {
            for spent in 0..=budget {
                for reserved in 0..=budget - spent {
                    for price in 1..=budget + 1 {
                        let mut c = f.context();
                        c.capsule.original_budget = budget;
                        c.capsule.allocated = budget;
                        c.capsule.spent = spent;
                        c.capsule.reserved = reserved;
                        c.capsule.per_purchase_limit = budget;
                        c.quote.as_mut().unwrap().price = price;
                        assert_eq!(
                            evaluate(&c).decision == Decision::Approved,
                            price <= budget - spent - reserved
                        );
                    }
                }
            }
        }
    }
}
