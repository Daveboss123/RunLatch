//! Canonical stored records and strict JSON inputs. Never include private keys.

use crate::gate;
use near_sdk::{
    AccountId, PublicKey,
    borsh::{BorshDeserialize, BorshSerialize},
    json_types::{U64, U128},
    serde::{Deserialize, Serialize},
};

pub const MAX_CAPSULES: usize = 64;
pub const MAX_PROJECTS: usize = 64;
pub const PROJECT_STORAGE_BYTES: u128 = 8_192;
pub const MAX_PROVIDERS: usize = 3;
pub const MAX_QUOTES_PER_PROVIDER: u32 = 32;
pub const MAX_REQUESTS_PER_CAPSULE: usize = 32;
pub const MAX_PAGE_SIZE: u32 = 20;
// Schema2 also pre-funds bounded provisioning history, task checks and acceptance.
pub const CAPSULE_STORAGE_BYTES: u128 = 262_144;
pub const PROVIDER_STORAGE_BYTES: u128 = 4_096;
pub const QUOTE_STORAGE_BYTES: u128 = 8_192;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum CapsuleStatus {
    Active,
    Paused,
    Revoked,
    Completed,
    Closing,
    Closed,
}

impl CapsuleStatus {
    pub fn gate_state(&self) -> gate::CapsuleState {
        match self {
            Self::Active => gate::CapsuleState::Active,
            Self::Paused => gate::CapsuleState::Paused,
            Self::Revoked => gate::CapsuleState::Revoked,
            Self::Completed => gate::CapsuleState::Completed,
            Self::Closing => gate::CapsuleState::Closing,
            Self::Closed => gate::CapsuleState::Closed,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Policy {
    pub project_id: String,
    pub project_revision: U64,
    pub task_id: String,
    pub workflow_id: String,
    pub agent_id: AccountId,
    pub agent_public_key: PublicKey,
    pub budget: U128,
    pub per_purchase_limit: U128,
    pub per_commitment_limit: U128,
    pub recurring_policy: RecurringPolicy,
    pub allowed_provider_ids: Vec<String>,
    pub allowed_service_ids: Vec<String>,
    pub allowed_categories: Vec<String>,
    pub max_quantity: u32,
    pub approval_threshold: Option<U128>,
    pub expires_at_ns: U64,
    pub validation_spec_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Capsule {
    pub capsule_id: String,
    pub owner_id: AccountId,
    pub policy: Policy,
    pub policy_hash: String,
    pub policy_schema_version: u8,
    pub status: CapsuleStatus,
    pub allocated: U128,
    pub spent: U128,
    pub reserved: U128,
    pub committed_future: U128,
    pub returned: U128,
    pub storage_credit: U128,
    pub created_at_ns: U64,
    pub revoked_at_ns: Option<U64>,
    pub request_ids: Vec<String>,
    pub owner_refund: Option<OwnerRefund>,
    pub refund_attempts: u32,
}

impl Capsule {
    pub fn available(&self) -> U128 {
        U128(
            self.allocated
                .0
                .checked_sub(self.spent.0)
                .and_then(|amount| amount.checked_sub(self.reserved.0))
                .expect("ACCOUNTING_INVARIANT"),
        )
    }
    pub fn available_to_commit(&self) -> U128 {
        U128(
            self.available()
                .0
                .checked_sub(self.committed_future.0)
                .expect("COMMITMENT_INVARIANT"),
        )
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Provider {
    pub provider_id: String,
    pub publisher_id: AccountId,
    pub recipient_id: AccountId,
    pub active: bool,
    pub quote_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct QuoteInput {
    pub quote_id: String,
    pub provider_id: String,
    pub recipient_id: AccountId,
    pub service_id: String,
    pub category: String,
    pub resource_key: String,
    pub quantity: u32,
    pub price: U128,
    pub asset: String,
    pub recurring: bool,
    pub expires_at_ns: U64,
    pub previous_quote_id: Option<String>,
    #[serde(default)]
    pub commercial_terms: Option<CommercialTerms>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct QuoteTerms {
    pub input: QuoteInput,
    pub publisher_id: AccountId,
    pub schema_version: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Quote {
    pub terms: QuoteTerms,
    pub quote_hash: String,
    pub consumed: bool,
    pub consumed_by: Option<String>,
    pub published_at_ns: U64,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PurchaseProposal {
    pub project_id: String,
    pub project_revision: U64,
    pub capsule_id: String,
    pub request_id: String,
    pub quote_id: String,
    pub expected_quote_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct CheckOutput {
    pub rule: String,
    pub state: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum PurchaseStatus {
    Denied,
    ApprovalPending,
    SettlementPending,
    Settled,
    SettlementFailed,
    Cancelled,
    Expired,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct Purchase {
    pub proposal: PurchaseProposal,
    pub request_hash: String,
    pub policy_hash: String,
    pub canonical_quote: Option<QuoteTerms>,
    pub decision: String,
    pub checks: Vec<CheckOutput>,
    pub reason_codes: Vec<String>,
    pub status: PurchaseStatus,
    pub reserved_amount: U128,
    pub committed_future_amount: U128,
    pub resource_fingerprint: Option<String>,
    pub created_at_ns: U64,
    pub approval_expires_at_ns: U64,
    pub approved_by: Option<AccountId>,
    pub resolved_at_ns: Option<U64>,
    pub reconciliation_required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PurchaseResponse {
    pub decision: String,
    pub reason_codes: Vec<String>,
    pub transfer_scheduled: bool,
    pub source: String,
    pub request: Option<Purchase>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum RefundStatus {
    Pending,
    Returned,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct OwnerRefund {
    pub attempt: u32,
    pub amount: U128,
    pub status: RefundStatus,
    pub created_at_ns: U64,
    pub resolved_at_ns: Option<U64>,
    pub reconciliation_required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RefundResponse {
    pub record: Option<OwnerRefund>,
    pub transfer_scheduled: bool,
    pub reason_code: Option<String>,
    pub source: String,
}

impl PurchaseResponse {
    pub fn from_record(record: Purchase, scheduled: bool) -> Self {
        Self {
            decision: record.decision.clone(),
            reason_codes: record.reason_codes.clone(),
            transfer_scheduled: scheduled,
            source: "CONTRACT_EXECUTION_RECORD".into(),
            request: Some(record),
        }
    }

    pub fn rejected_attempt(reason: &str, original: Option<Purchase>) -> Self {
        Self {
            decision: "DENIED".into(),
            reason_codes: vec![reason.into()],
            transfer_scheduled: false,
            source: "CONTRACT_REJECTED_ATTEMPT".into(),
            request: original,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PreviewResult {
    pub decision: String,
    pub checks: Vec<CheckOutput>,
    pub reason_codes: Vec<String>,
    pub evaluated_at_ns: U64,
    pub source: String,
    pub grants_payment_authority: bool,
}

impl PreviewResult {
    pub fn from_evaluation(result: gate::Evaluation, now_ns: u64) -> Self {
        Self {
            decision: result.decision.code().into(),
            checks: result
                .checks
                .into_iter()
                .map(|check| CheckOutput {
                    rule: check.rule.into(),
                    state: match check.state {
                        gate::CheckState::Passed => "PASSED",
                        gate::CheckState::Failed => "FAILED",
                        gate::CheckState::NotEvaluated => "NOT_EVALUATED",
                    }
                    .into(),
                })
                .collect(),
            reason_codes: result
                .reasons
                .into_iter()
                .map(|reason| reason.code().into())
                .collect(),
            evaluated_at_ns: U64(now_ns),
            source: "READ_ONLY_CONTRACT_PREVIEW".into(),
            grants_payment_authority: false,
        }
    }
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageRequirements {
    pub project_credit: U128,
    pub capsule_credit: U128,
    pub provider_credit: U128,
    pub quote_credit: U128,
    pub scope: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum ValidationStatus {
    #[serde(rename = "VALIDATION_PASSED")]
    Passed,
    #[serde(rename = "VALIDATION_FAILED")]
    Failed,
    #[serde(rename = "VALIDATION_ERROR")]
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ValidationMetrics {
    pub record_count: Option<u32>,
    pub records_checked: u32,
    pub unique_id_count: u32,
    pub unique_url_count: u32,
}

/// Bounded summary of a human-reviewed off-chain report. Never artifact text,
/// URLs, an authority change, transaction reference or settlement instruction.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ValidationAttestationInput {
    pub report_schema_version: u8,
    pub criteria_id: String,
    pub criteria_hash: String,
    pub validator_id: String,
    pub validator_version: String,
    pub artifact_hash: Option<String>,
    pub artifact_bytes: Option<u32>,
    pub evidence_hash: String,
    pub status: ValidationStatus,
    pub reason_codes: Vec<String>,
    pub issue_count: u32,
    pub issues_truncated: bool,
    pub metrics: ValidationMetrics,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct RunOutcome {
    pub capsule_id: String,
    pub policy_hash: String,
    pub report: ValidationAttestationInput,
    pub attested_by: AccountId,
    pub recorded_at_ns: U64,
    pub outcome_hash: String,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OutcomeReceipt {
    pub contract_id: AccountId,
    pub network_tag: String,
    pub project: Project,
    pub capsule: Capsule,
    pub purchase: Purchase,
    pub outcome: Option<RunOutcome>,
    pub task_check: Option<TaskCheckOutcome>,
    pub provisioning_history: Vec<ProvisioningEvidence>,
    pub human_acceptance: Option<HumanAcceptance>,
    pub acceptance_matches_current_evidence: bool,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum ProjectStatus {
    Active,
    Paused,
    Cancelled,
    Completed,
}

/// Public, opaque references only. Client labels and full work orders stay off-chain.
#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ProjectInput {
    pub project_id: String,
    pub organisation_id: String,
    pub client_ref: String,
    pub budget_ceiling: U128,
    pub expires_at_ns: U64,
    pub outcome_definition_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct Project {
    pub input: ProjectInput,
    pub owner_id: AccountId,
    pub revision: U64,
    pub status: ProjectStatus,
    /// Non-revolving delegation ceiling: refunds do not replenish this quantity.
    pub allocated_authority: U128,
    pub capsule_ids: Vec<String>,
    pub created_at_ns: U64,
    pub updated_at_ns: U64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum RecurringPolicy {
    Forbidden,
    RequireApproval,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum BillingModel {
    OneTime,
    FixedRecurring,
    UnknownExposure,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum BillingCadence {
    Once,
    Monthly,
    Annual,
}

/// All fees/taxes/setup are explicit upfront charges. No inferred unknown zero.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct CommercialTerms {
    pub billing_model: BillingModel,
    pub cadence: BillingCadence,
    pub period_charge: U128,
    pub required_periods: u32,
    pub mandatory_fees: U128,
    pub known_taxes: U128,
    pub setup_fees: U128,
    pub auto_renew: bool,
    pub cancellation_terms_hash: String,
    pub source_evidence_hash: String,
    pub future_obligation_contingent_on_initial_payment: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct FinancialBreakdown {
    pub allocated: U128,
    pub spent: U128,
    pub reserved: U128,
    pub committed_future: U128,
    pub available_now: U128,
    pub available_to_commit: U128,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum ProvisioningStatus {
    Provisioned,
    Failed,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum EvidenceTrustClass {
    DemoFixture,
    ApplicationObservation,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ProvisioningInput {
    pub status: ProvisioningStatus,
    pub trust_class: EvidenceTrustClass,
    pub source_id: String,
    pub observed_at_ns: U64,
    pub artifact_hash: Option<String>,
    pub evidence_hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct ProvisioningEvidence {
    pub input: ProvisioningInput,
    pub recorded_by: AccountId,
    pub recorded_at_ns: U64,
    pub record_hash: String,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ObjectiveCheckSummary {
    pub check_id: String,
    pub status: ValidationStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
#[borsh(crate = "near_sdk::borsh")]
pub struct TaskCheckInput {
    pub report_schema_version: u8,
    pub criteria_id: String,
    pub criteria_hash: String,
    pub validator_id: String,
    pub validator_version: String,
    pub source: String,
    pub project_id: String,
    pub resource_key: String,
    pub artifact_hash: Option<String>,
    pub artifact_bytes: Option<u32>,
    pub evidence_hash: String,
    pub observed_at_ns: U64,
    pub status: ValidationStatus,
    pub checks: Vec<ObjectiveCheckSummary>,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct TaskCheckOutcome {
    pub capsule_id: String,
    pub request_id: String,
    pub request_hash: String,
    pub policy_hash: String,
    pub report: TaskCheckInput,
    pub attested_by: AccountId,
    pub recorded_at_ns: U64,
    pub outcome_hash: String,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "SCREAMING_SNAKE_CASE")]
#[borsh(crate = "near_sdk::borsh")]
pub enum AcceptanceDecision {
    Accepted,
    Rejected,
}

#[derive(Clone, Debug, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
pub struct HumanAcceptance {
    pub capsule_id: String,
    pub outcome_hash: String,
    pub evidence_snapshot_hash: String,
    pub decision: AcceptanceDecision,
    pub accepted_by: AccountId,
    pub recorded_at_ns: U64,
    pub acceptance_hash: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PurchaseEvidenceHistory {
    pub request_id: String,
    pub records: Vec<ProvisioningEvidence>,
}

/// One bounded contract view for a selected capsule; pin multiple views to one final block off-chain.
#[derive(Clone, Debug, Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ProjectCapsuleSnapshot {
    pub project: Project,
    pub capsule: Capsule,
    pub purchases: Vec<Purchase>,
    pub provisioning: Vec<PurchaseEvidenceHistory>,
    pub outcome: Option<RunOutcome>,
    pub task_check: Option<TaskCheckOutcome>,
    pub human_acceptance: Option<HumanAcceptance>,
    pub evidence_snapshot_hash: String,
}
