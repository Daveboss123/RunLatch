//! RunLatch contract foundation. No public deployment has been performed.
//! Native-transfer authorization and lifecycle are added in tested milestones.

use near_sdk::{
    AccountId, CurveType, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue,
    PublicKey, env,
    json_types::{U64, U128},
    near, require,
    store::LookupMap,
};

mod commitment;
mod evidence;
mod gate;
mod hashing;
mod model;
mod projects;

#[cfg(test)]
mod commitment_tests;
#[cfg(test)]
mod evidence_tests;
#[cfg(test)]
mod foundation_tests;
#[cfg(test)]
mod project_tests;

use model::*;

// Deliberately insufficient only in the explicitly labelled LOCAL fault build.
// Business authority remains identical; callers cannot select callback gas.
const RESOLUTION_GAS: Gas = if cfg!(feature = "sandbox-callback-starvation") {
    Gas::from_gas(100_000_000_000)
} else {
    Gas::from_tgas(25)
};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RunLatch {
    operator_id: AccountId,
    schema_version: u8,
    network_id: String,
    capsules: LookupMap<String, Capsule>,
    capsule_ids: Vec<String>,
    providers: LookupMap<String, Provider>,
    provider_ids: Vec<String>,
    quotes: LookupMap<String, Quote>,
    quote_ids: Vec<String>,
    purchases: LookupMap<String, Purchase>,
    outcomes: LookupMap<String, RunOutcome>,
    projects: LookupMap<String, Project>,
    project_ids: Vec<String>,
    resource_claims: LookupMap<String, String>,
    provisioning: LookupMap<String, Vec<ProvisioningEvidence>>,
    task_checks: LookupMap<String, TaskCheckOutcome>,
    acceptances: LookupMap<String, HumanAcceptance>,
}

#[near]
impl RunLatch {
    #[init]
    #[private]
    pub fn init(operator_id: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "INITIALIZATION_REQUIRES_CONTRACT_ACCOUNT"
        );
        require!(!env::state_exists(), "ALREADY_INITIALIZED");
        Self {
            operator_id,
            schema_version: 2,
            network_id: "testnet".into(),
            capsules: LookupMap::new(b"c"),
            capsule_ids: Vec::new(),
            providers: LookupMap::new(b"p"),
            provider_ids: Vec::new(),
            quotes: LookupMap::new(b"q"),
            quote_ids: Vec::new(),
            purchases: LookupMap::new(b"r"),
            outcomes: LookupMap::new(b"o"),
            projects: LookupMap::new(b"j"),
            project_ids: Vec::new(),
            resource_claims: LookupMap::new(b"d"),
            provisioning: LookupMap::new(b"e"),
            task_checks: LookupMap::new(b"v"),
            acceptances: LookupMap::new(b"h"),
        }
    }

    pub fn get_operator(&self) -> AccountId {
        self.operator_id.clone()
    }

    pub fn get_schema_version(&self) -> u8 {
        self.schema_version
    }

    pub fn get_network_tag(&self) -> String {
        self.network_id.clone()
    }

    pub fn get_storage_requirements(&self) -> StorageRequirements {
        StorageRequirements {
            project_credit: U128(Self::storage_price(PROJECT_STORAGE_BYTES)),
            capsule_credit: U128(Self::storage_price(CAPSULE_STORAGE_BYTES)),
            provider_credit: U128(Self::storage_price(PROVIDER_STORAGE_BYTES)),
            quote_credit: U128(Self::storage_price(QUOTE_STORAGE_BYTES)),
            scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS".into(),
        }
    }

    #[payable]
    pub fn register_provider(
        &mut self,
        provider_id: String,
        publisher_id: AccountId,
        recipient_id: AccountId,
    ) -> Provider {
        self.assert_operator();
        Self::assert_id(&provider_id);
        require!(
            !self.providers.contains_key(&provider_id),
            "PROVIDER_ALREADY_REGISTERED"
        );
        require!(self.provider_ids.len() < MAX_PROVIDERS, "PROVIDER_LIMIT");
        require!(
            publisher_id != self.operator_id && publisher_id != env::current_account_id(),
            "PRIVILEGED_PUBLISHER_NOT_ALLOWED"
        );
        require!(
            recipient_id != env::current_account_id(),
            "CONTRACT_RECIPIENT_NOT_ALLOWED"
        );
        for capsule_id in &self.capsule_ids {
            let capsule = self
                .capsules
                .get(capsule_id)
                .expect("CAPSULE_INDEX_INVARIANT");
            require!(
                capsule.policy.agent_id != publisher_id && capsule.policy.agent_id != recipient_id,
                "AGENT_PROVIDER_ROLE_CONFLICT"
            );
        }
        require!(
            env::attached_deposit().as_yoctonear() == Self::storage_price(PROVIDER_STORAGE_BYTES),
            "PROVIDER_STORAGE_DEPOSIT_MISMATCH"
        );
        let provider = Provider {
            provider_id: provider_id.clone(),
            publisher_id,
            recipient_id,
            active: true,
            quote_count: 0,
        };
        self.providers.insert(provider_id.clone(), provider.clone());
        self.provider_ids.push(provider_id);
        provider
    }

    #[payable]
    pub fn set_provider_status(&mut self, provider_id: String, active: bool) {
        self.assert_operator();
        Self::assert_one_yocto();
        self.providers
            .get_mut(&provider_id)
            .expect("UNKNOWN_PROVIDER")
            .active = active;
    }

    #[payable]
    pub fn create_capsule(
        &mut self,
        capsule_id: String,
        policy: Policy,
        storage_credit: U128,
    ) -> Capsule {
        self.assert_operator();
        Self::assert_id(&capsule_id);
        require!(
            !self.capsules.contains_key(&capsule_id),
            "CAPSULE_ALREADY_EXISTS"
        );
        require!(self.capsule_ids.len() < MAX_CAPSULES, "CAPSULE_LIMIT");
        self.validate_policy(&policy);
        require!(
            storage_credit.0 >= Self::storage_price(CAPSULE_STORAGE_BYTES),
            "INSUFFICIENT_STORAGE_CREDIT"
        );
        let funding = policy
            .budget
            .0
            .checked_add(storage_credit.0)
            .expect("FUNDING_OVERFLOW");
        require!(
            env::attached_deposit().as_yoctonear() == funding,
            "CAPSULE_FUNDING_MISMATCH"
        );
        let policy_hash = hashing::hash_record(
            "runlatch.policy.v2",
            &self.network_id,
            &env::current_account_id(),
            &(&capsule_id, &self.operator_id, &policy),
        );
        let capsule = Capsule {
            capsule_id: capsule_id.clone(),
            owner_id: self.operator_id.clone(),
            allocated: policy.budget,
            policy,
            policy_hash,
            policy_schema_version: 2,
            status: CapsuleStatus::Active,
            spent: U128(0),
            reserved: U128(0),
            committed_future: U128(0),
            returned: U128(0),
            storage_credit,
            created_at_ns: U64(env::block_timestamp()),
            revoked_at_ns: None,
            request_ids: Vec::new(),
            owner_refund: None,
            refund_attempts: 0,
        };
        let project = self
            .projects
            .get_mut(&capsule.policy.project_id)
            .expect("PROJECT_INVARIANT");
        project.allocated_authority = U128(
            project
                .allocated_authority
                .0
                .checked_add(capsule.policy.budget.0)
                .expect("ALLOCATION_OVERFLOW"),
        );
        project.capsule_ids.push(capsule_id.clone());
        self.capsules.insert(capsule_id.clone(), capsule.clone());
        self.capsule_ids.push(capsule_id);
        capsule
    }

    #[payable]
    pub fn set_capsule_paused(&mut self, capsule_id: String, paused: bool) {
        self.assert_operator();
        Self::assert_one_yocto();
        let capsule = self.capsules.get_mut(&capsule_id).expect("UNKNOWN_CAPSULE");
        require!(
            matches!(
                capsule.status,
                CapsuleStatus::Active | CapsuleStatus::Paused
            ),
            "CAPSULE_CANNOT_RESUME"
        );
        require!(
            env::block_timestamp() < capsule.policy.expires_at_ns.0,
            "CAPSULE_EXPIRED"
        );
        capsule.status = if paused {
            CapsuleStatus::Paused
        } else {
            CapsuleStatus::Active
        };
    }

    #[payable]
    pub fn revoke_capsule(&mut self, capsule_id: String) {
        self.assert_operator();
        Self::assert_one_yocto();
        let capsule = self.capsules.get_mut(&capsule_id).expect("UNKNOWN_CAPSULE");
        require!(
            matches!(
                capsule.status,
                CapsuleStatus::Active | CapsuleStatus::Paused | CapsuleStatus::Revoked
            ),
            "CAPSULE_TERMINAL"
        );
        capsule.status = CapsuleStatus::Revoked;
        capsule
            .revoked_at_ns
            .get_or_insert(U64(env::block_timestamp()));
    }

    #[payable]
    pub fn publish_quote(&mut self, quote: QuoteInput) -> Quote {
        Self::assert_id(&quote.quote_id);
        Self::assert_id(&quote.provider_id);
        Self::assert_id(&quote.service_id);
        Self::assert_id(&quote.category);
        Self::assert_id(&quote.resource_key);
        require!(
            commitment::total_commitment(&quote).is_ok(),
            "INVALID_COMMERCIAL_TERMS"
        );
        require!(
            !self.quotes.contains_key(&quote.quote_id),
            "QUOTE_ALREADY_EXISTS"
        );
        let provider = self
            .providers
            .get(&quote.provider_id)
            .expect("UNKNOWN_PROVIDER");
        require!(
            env::predecessor_account_id() == provider.publisher_id,
            "UNAUTHORIZED_PROVIDER"
        );
        require!(provider.active, "PROVIDER_SUSPENDED");
        require!(
            quote.recipient_id == provider.recipient_id,
            "RECIPIENT_MISMATCH"
        );
        require!(
            provider.quote_count < MAX_QUOTES_PER_PROVIDER,
            "QUOTE_LIMIT"
        );
        require!(quote.price.0 > 0, "INVALID_QUOTE_AMOUNT");
        require!(
            quote.quantity > 0 && quote.quantity <= 50,
            "INVALID_QUOTE_QUANTITY"
        );
        require!(quote.asset == gate::NATIVE_ASSET, "UNSUPPORTED_ASSET");
        require!(
            quote.expires_at_ns.0 > env::block_timestamp(),
            "QUOTE_EXPIRED"
        );
        require!(
            env::attached_deposit().as_yoctonear() == Self::storage_price(QUOTE_STORAGE_BYTES),
            "QUOTE_STORAGE_DEPOSIT_MISMATCH"
        );
        if let Some(previous_id) = &quote.previous_quote_id {
            Self::assert_id(previous_id);
            let previous = self
                .quotes
                .get(previous_id)
                .expect("UNKNOWN_PREVIOUS_QUOTE");
            let old = &previous.terms.input;
            require!(
                old.provider_id == quote.provider_id
                    && old.service_id == quote.service_id
                    && old.category == quote.category
                    && old.asset == quote.asset
                    && old.quantity == quote.quantity
                    && old.recurring == quote.recurring,
                "INCOMPARABLE_PREVIOUS_QUOTE"
            );
        }
        let terms = QuoteTerms {
            input: quote,
            publisher_id: provider.publisher_id.clone(),
            schema_version: 2,
        };
        let quote_hash = hashing::hash_record(
            "runlatch.quote.v2",
            &self.network_id,
            &env::current_account_id(),
            &terms,
        );
        let published = Quote {
            terms,
            quote_hash,
            consumed: false,
            consumed_by: None,
            published_at_ns: U64(env::block_timestamp()),
        };
        let quote_id = published.terms.input.quote_id.clone();
        self.providers
            .get_mut(&published.terms.input.provider_id)
            .expect("PROVIDER_INVARIANT")
            .quote_count += 1;
        self.quotes.insert(quote_id.clone(), published.clone());
        self.quote_ids.push(quote_id);
        published
    }

    /// The actual payment boundary: identity and canonical storage, never a free
    /// recipient/price. Reservations and quote consumption precede the promise.
    #[payable]
    pub fn submit_purchase(
        &mut self,
        proposal: PurchaseProposal,
    ) -> PromiseOrValue<PurchaseResponse> {
        require!(
            env::attached_deposit().as_yoctonear() == 0,
            "ZERO_DEPOSIT_AGENT_CALL_REQUIRED"
        );
        Self::assert_proposal_bounds(&proposal);
        let capsule = self
            .capsules
            .get(&proposal.capsule_id)
            .expect("UNKNOWN_CAPSULE");
        require!(
            env::predecessor_account_id() == capsule.policy.agent_id
                && env::signer_account_id() == capsule.policy.agent_id
                && env::signer_account_pk() == capsule.policy.agent_public_key,
            "UNAUTHORIZED_AGENT"
        );
        let key = Self::purchase_key(&proposal.capsule_id, &proposal.request_id);
        if let Some(original) = self.purchases.get(&key) {
            return PromiseOrValue::Value(PurchaseResponse::rejected_attempt(
                "REQUEST_REPLAY",
                Some(original.clone()),
            ));
        }
        require!(
            capsule.request_ids.len() < MAX_REQUESTS_PER_CAPSULE,
            "REQUEST_LIMIT"
        );
        let evaluation = self.evaluate_stored(
            &proposal,
            &env::predecessor_account_id(),
            &env::signer_account_id(),
            &env::signer_account_pk(),
            false,
        );
        let now = env::block_timestamp();
        let quote = self.quotes.get(&proposal.quote_id);
        let deadline = capsule
            .policy
            .expires_at_ns
            .0
            .min(quote.map_or(u64::MAX, |q| q.terms.input.expires_at_ns.0))
            .min(now.saturating_add(600_000_000_000));
        let request_hash = hashing::hash_record(
            "runlatch.purchase.v2",
            &self.network_id,
            &env::current_account_id(),
            &(
                &proposal,
                &capsule.policy_hash,
                &capsule.policy.agent_id,
                &capsule.policy.agent_public_key,
                now,
                deadline,
            ),
        );
        let decision = evaluation.decision;
        let trace = PreviewResult::from_evaluation(evaluation, now);
        let record = Purchase {
            proposal,
            request_hash,
            policy_hash: capsule.policy_hash.clone(),
            canonical_quote: quote.map(|q| q.terms.clone()),
            decision: trace.decision,
            checks: trace.checks,
            reason_codes: trace.reason_codes,
            status: match decision {
                gate::Decision::Approved => PurchaseStatus::SettlementPending,
                gate::Decision::ApprovalRequired => PurchaseStatus::ApprovalPending,
                gate::Decision::Denied => PurchaseStatus::Denied,
            },
            reserved_amount: U128(0),
            committed_future_amount: U128(0),
            resource_fingerprint: None,
            created_at_ns: U64(now),
            approval_expires_at_ns: U64(deadline),
            approved_by: None,
            resolved_at_ns: None,
            reconciliation_required: false,
        };
        if decision == gate::Decision::Approved {
            PromiseOrValue::Promise(self.authorize_request(record, true))
        } else {
            self.capsules
                .get_mut(&record.proposal.capsule_id)
                .expect("CAPSULE_INVARIANT")
                .request_ids
                .push(record.proposal.request_id.clone());
            self.purchases.insert(key, record.clone());
            Self::emit_purchase("purchase_decision", &record);
            PromiseOrValue::Value(PurchaseResponse::from_record(record, false))
        }
    }

    #[payable]
    pub fn approve_purchase(
        &mut self,
        capsule_id: String,
        request_id: String,
        expected_request_hash: String,
    ) -> PromiseOrValue<PurchaseResponse> {
        self.assert_operator();
        Self::assert_one_yocto();
        let key = Self::purchase_key(&capsule_id, &request_id);
        let mut record = self.purchases.get(&key).expect("UNKNOWN_REQUEST").clone();
        if record.status != PurchaseStatus::ApprovalPending {
            return PromiseOrValue::Value(PurchaseResponse::rejected_attempt(
                "REQUEST_NOT_PENDING",
                Some(record),
            ));
        }
        if record.request_hash != expected_request_hash {
            return PromiseOrValue::Value(PurchaseResponse::rejected_attempt(
                "APPROVAL_BINDING_MISMATCH",
                Some(record),
            ));
        }
        if env::block_timestamp() >= record.approval_expires_at_ns.0 {
            record.status = PurchaseStatus::Expired;
            record.decision = "DENIED".into();
            record.reason_codes = vec!["APPROVAL_EXPIRED".into()];
            self.purchases.insert(key, record.clone());
            return PromiseOrValue::Value(PurchaseResponse::from_record(record, false));
        }
        let capsule = self.capsules.get(&capsule_id).expect("UNKNOWN_CAPSULE");
        require!(
            record.policy_hash == capsule.policy_hash,
            "POLICY_BINDING_MISMATCH"
        );
        // This is an authenticated continuation of an already authenticated
        // stored agent request, not a caller-controlled identity/approval flag.
        let evaluation = self.evaluate_stored(
            &record.proposal,
            &capsule.policy.agent_id,
            &capsule.policy.agent_id,
            &capsule.policy.agent_public_key,
            false,
        );
        if evaluation.decision == gate::Decision::Denied {
            let trace = PreviewResult::from_evaluation(evaluation, env::block_timestamp());
            record.status = PurchaseStatus::Denied;
            record.decision = trace.decision;
            record.reason_codes = trace.reason_codes;
            record.checks = trace.checks;
            self.purchases.insert(key, record.clone());
            return PromiseOrValue::Value(PurchaseResponse::from_record(record, false));
        }
        record.approved_by = Some(self.operator_id.clone());
        record.decision = "APPROVED".into();
        record.reason_codes.clear();
        PromiseOrValue::Promise(self.authorize_request(record, false))
    }

    #[payable]
    pub fn reject_purchase(&mut self, capsule_id: String, request_id: String) -> PurchaseResponse {
        self.end_pending_request(
            &capsule_id,
            &request_id,
            PurchaseStatus::Denied,
            "OWNER_REJECTED",
        )
    }

    #[payable]
    pub fn cancel_purchase(&mut self, capsule_id: String, request_id: String) -> PurchaseResponse {
        self.end_pending_request(
            &capsule_id,
            &request_id,
            PurchaseStatus::Cancelled,
            "OWNER_CANCELLED",
        )
    }

    #[private]
    pub fn resolve_purchase(&mut self, purchase_key: String) -> PurchaseResponse {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "PRIVATE_CALLBACK_REQUIRED"
        );
        let Some(mut record) = self.purchases.get(&purchase_key).cloned() else {
            return PurchaseResponse::rejected_attempt("UNKNOWN_OPERATION", None);
        };
        if record.status != PurchaseStatus::SettlementPending {
            return PurchaseResponse::from_record(record, false);
        }
        let outcome = if env::promise_results_count() == 1 {
            match env::promise_result_checked(0, 0) {
                Ok(bytes) if bytes.is_empty() => Some(true),
                Err(PromiseError::Failed) => Some(false),
                _ => None,
            }
        } else {
            None
        };
        let Some(succeeded) = outcome else {
            return self.quarantine_purchase(purchase_key, record);
        };
        let Some(mut capsule) = self.capsules.get(&record.proposal.capsule_id).cloned() else {
            return self.quarantine_purchase(purchase_key, record);
        };
        let amount = record.reserved_amount.0;
        let Some(reserved) = capsule.reserved.0.checked_sub(amount) else {
            return self.quarantine_purchase(purchase_key, record);
        };
        let spent = if succeeded {
            capsule.spent.0.checked_add(amount)
        } else {
            Some(capsule.spent.0)
        };
        let Some(spent) = spent else {
            return self.quarantine_purchase(purchase_key, record);
        };
        let future = if succeeded {
            Some(capsule.committed_future.0)
        } else {
            capsule
                .committed_future
                .0
                .checked_sub(record.committed_future_amount.0)
        };
        if amount == 0
            || future.is_none()
            || spent
                .checked_add(reserved)
                .and_then(|n| n.checked_add(future.unwrap_or(u128::MAX)))
                .is_none_or(|total| total > capsule.allocated.0)
        {
            return self.quarantine_purchase(purchase_key, record);
        }
        capsule.reserved = U128(reserved);
        capsule.spent = U128(spent);
        capsule.committed_future = U128(future.unwrap_or(capsule.committed_future.0));
        if !succeeded {
            if let Some(fingerprint) = &record.resource_fingerprint {
                if self.resource_claims.get(fingerprint) != Some(&purchase_key) {
                    return self.quarantine_purchase(purchase_key, record);
                }
                self.resource_claims.remove(fingerprint);
            }
            record.committed_future_amount = U128(0);
        }
        record.status = if succeeded {
            PurchaseStatus::Settled
        } else {
            PurchaseStatus::SettlementFailed
        };
        record.reserved_amount = U128(0);
        record.resolved_at_ns = Some(U64(env::block_timestamp()));
        record.reconciliation_required = false;
        self.capsules
            .insert(record.proposal.capsule_id.clone(), capsule);
        self.purchases.insert(purchase_key, record.clone());
        Self::emit_purchase("purchase_settlement", &record);
        PurchaseResponse::from_record(record, false)
    }

    #[payable]
    pub fn close_capsule(&mut self, capsule_id: String) -> PromiseOrValue<RefundResponse> {
        self.assert_operator();
        Self::assert_one_yocto();
        Self::assert_id(&capsule_id);
        let mut capsule = self
            .capsules
            .get(&capsule_id)
            .expect("UNKNOWN_CAPSULE")
            .clone();
        if matches!(
            capsule.status,
            CapsuleStatus::Closing | CapsuleStatus::Closed
        ) {
            return PromiseOrValue::Value(RefundResponse {
                record: capsule.owner_refund,
                transfer_scheduled: false,
                reason_code: Some("CAPSULE_ALREADY_CLOSING_OR_CLOSED".into()),
                source: "CONTRACT_OWNER_REFUND".into(),
            });
        }
        require!(
            capsule.status != CapsuleStatus::Active
                || env::block_timestamp() >= capsule.policy.expires_at_ns.0,
            "CAPSULE_ACTIVE"
        );
        require!(capsule.reserved.0 == 0, "PENDING_SETTLEMENT_BLOCKS_CLOSE");
        let amount = capsule.available_to_commit().0;
        if amount == 0 {
            capsule.status = CapsuleStatus::Closed;
            self.capsules.insert(capsule_id, capsule);
            return PromiseOrValue::Value(RefundResponse {
                record: None,
                transfer_scheduled: false,
                reason_code: Some("NO_UNUSED_PURCHASE_FUNDS".into()),
                source: "CONTRACT_OWNER_REFUND".into(),
            });
        }
        Self::assert_transfer_capacity(amount);
        let attempt = capsule
            .refund_attempts
            .checked_add(1)
            .expect("REFUND_ATTEMPT_LIMIT");
        let owner = capsule.owner_id.clone();
        capsule.refund_attempts = attempt;
        capsule.reserved = U128(amount);
        capsule.status = CapsuleStatus::Closing;
        capsule.owner_refund = Some(OwnerRefund {
            attempt,
            amount: U128(amount),
            status: RefundStatus::Pending,
            created_at_ns: U64(env::block_timestamp()),
            resolved_at_ns: None,
            reconciliation_required: false,
        });
        self.capsules.insert(capsule_id.clone(), capsule);
        PromiseOrValue::Promise(
            Promise::new(owner)
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(RESOLUTION_GAS)
                        .with_unused_gas_weight(0)
                        .resolve_owner_refund(capsule_id, attempt),
                ),
        )
    }

    #[private]
    pub fn resolve_owner_refund(&mut self, capsule_id: String, attempt: u32) -> RefundResponse {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "PRIVATE_CALLBACK_REQUIRED"
        );
        let Some(mut capsule) = self.capsules.get(&capsule_id).cloned() else {
            return RefundResponse {
                record: None,
                transfer_scheduled: false,
                reason_code: Some("UNKNOWN_CAPSULE".into()),
                source: "CONTRACT_OWNER_REFUND".into(),
            };
        };
        let Some(mut refund) = capsule.owner_refund.clone() else {
            return RefundResponse {
                record: None,
                transfer_scheduled: false,
                reason_code: Some("UNKNOWN_REFUND".into()),
                source: "CONTRACT_OWNER_REFUND".into(),
            };
        };
        if refund.attempt != attempt
            || refund.status != RefundStatus::Pending
            || capsule.status != CapsuleStatus::Closing
        {
            return RefundResponse {
                record: Some(refund),
                transfer_scheduled: false,
                reason_code: Some("REFUND_NOT_PENDING".into()),
                source: "CONTRACT_OWNER_REFUND".into(),
            };
        }
        let outcome = if env::promise_results_count() == 1 {
            match env::promise_result_checked(0, 0) {
                Ok(bytes) if bytes.is_empty() => Some(true),
                Err(PromiseError::Failed) => Some(false),
                _ => None,
            }
        } else {
            None
        };
        let arithmetic = if outcome == Some(true) {
            capsule
                .allocated
                .0
                .checked_sub(refund.amount.0)
                .zip(capsule.returned.0.checked_add(refund.amount.0))
        } else {
            Some((capsule.allocated.0, capsule.returned.0))
        };
        if outcome.is_none() || capsule.reserved.0 != refund.amount.0 || arithmetic.is_none() {
            refund.reconciliation_required = true;
            capsule.owner_refund = Some(refund.clone());
            self.capsules.insert(capsule_id, capsule);
            return RefundResponse {
                record: Some(refund),
                transfer_scheduled: false,
                reason_code: Some("REFUND_RECONCILIATION_REQUIRED".into()),
                source: "CONTRACT_OWNER_REFUND".into(),
            };
        }
        let (allocated, returned) = arithmetic.unwrap_or((capsule.allocated.0, capsule.returned.0));
        capsule.reserved = U128(0);
        capsule.allocated = U128(allocated);
        capsule.returned = U128(returned);
        capsule.status = if outcome == Some(true) {
            CapsuleStatus::Closed
        } else {
            CapsuleStatus::Revoked
        };
        refund.status = if outcome == Some(true) {
            RefundStatus::Returned
        } else {
            RefundStatus::Failed
        };
        refund.resolved_at_ns = Some(U64(env::block_timestamp()));
        refund.reconciliation_required = false;
        capsule.owner_refund = Some(refund.clone());
        self.capsules.insert(capsule_id, capsule);
        RefundResponse {
            record: Some(refund),
            transfer_scheduled: false,
            reason_code: None,
            source: "CONTRACT_OWNER_REFUND".into(),
        }
    }

    /// Anchor the owner's reviewed report, not research truth or payment state.
    #[payable]
    pub fn record_validation(
        &mut self,
        capsule_id: String,
        expected_policy_hash: String,
        report: ValidationAttestationInput,
    ) -> RunOutcome {
        self.assert_operator();
        Self::assert_one_yocto();
        Self::assert_id(&capsule_id);
        require!(
            !self.outcomes.contains_key(&capsule_id) && !self.task_checks.contains_key(&capsule_id),
            "VALIDATION_ALREADY_RECORDED"
        );
        let mut capsule = self
            .capsules
            .get(&capsule_id)
            .expect("UNKNOWN_CAPSULE")
            .clone();
        require!(
            env::predecessor_account_id() == capsule.owner_id,
            "UNAUTHORIZED_OWNER"
        );
        require!(
            expected_policy_hash == capsule.policy_hash,
            "POLICY_BINDING_MISMATCH"
        );
        require!(
            capsule.reserved.0 == 0 && capsule.status != CapsuleStatus::Closing,
            "PENDING_SETTLEMENT_BLOCKS_VALIDATION"
        );
        Self::validate_attestation(&report, &capsule.policy.validation_spec_hash);
        let recorded_at_ns = U64(env::block_timestamp());
        let outcome_hash = hashing::hash_record(
            "runlatch.outcome.v1",
            &self.network_id,
            &env::current_account_id(),
            &(
                &capsule_id,
                &capsule.policy_hash,
                &capsule.owner_id,
                &report,
                recorded_at_ns,
            ),
        );
        let outcome = RunOutcome {
            capsule_id: capsule_id.clone(),
            policy_hash: capsule.policy_hash.clone(),
            report,
            attested_by: capsule.owner_id.clone(),
            recorded_at_ns,
            outcome_hash,
            source: "OWNER_ATTESTED_OFFCHAIN_REPORT".into(),
        };
        if capsule.status != CapsuleStatus::Closed {
            capsule.status = CapsuleStatus::Completed;
        }
        self.capsules.insert(capsule_id.clone(), capsule);
        self.outcomes.insert(capsule_id, outcome.clone());
        let event = near_sdk::serde_json::json!({"standard":"runlatch","version":"1.0.0",
            "event":"validation_attested","data":[{"capsule_id":outcome.capsule_id,
                "status":outcome.report.status,"attested_by":outcome.attested_by,"outcome_hash":outcome.outcome_hash}]});
        env::log_str(&format!("EVENT_JSON:{event}"));
        outcome
    }

    pub fn get_outcome(&self, capsule_id: String) -> Option<RunOutcome> {
        Self::assert_id(&capsule_id);
        self.outcomes.get(&capsule_id).cloned()
    }

    /// One consistent contract view. Actual transaction/receipt references must
    /// still be joined from RPC evidence; this getter never invents a tx hash.
    pub fn get_receipt(&self, capsule_id: String, request_id: String) -> Option<OutcomeReceipt> {
        let purchase = self.get_purchase(capsule_id.clone(), request_id.clone())?;
        let capsule = self.capsules.get(&capsule_id)?.clone();
        let human_acceptance = self.acceptances.get(&capsule_id).cloned();
        let acceptance_matches_current_evidence = human_acceptance.as_ref().is_some_and(|a| {
            a.evidence_snapshot_hash == self.get_evidence_snapshot_hash(capsule_id.clone())
        });
        Some(OutcomeReceipt {
            contract_id: env::current_account_id(),
            network_tag: self.network_id.clone(),
            project: self.projects.get(&capsule.policy.project_id)?.clone(),
            capsule,
            purchase,
            outcome: self.outcomes.get(&capsule_id).cloned(),
            task_check: self.task_checks.get(&capsule_id).cloned(),
            provisioning_history: self.get_provisioning(capsule_id.clone(), request_id),
            human_acceptance,
            acceptance_matches_current_evidence,
            source: "CONTRACT_RECORD_PROJECTION_NOT_RPC_EXECUTION_PROOF".into(),
        })
    }

    pub fn get_owner_refund(&self, capsule_id: String) -> Option<OwnerRefund> {
        self.capsules
            .get(&capsule_id)
            .and_then(|capsule| capsule.owner_refund.clone())
    }

    pub fn get_purchase(&self, capsule_id: String, request_id: String) -> Option<Purchase> {
        self.purchases
            .get(&Self::purchase_key(&capsule_id, &request_id))
            .cloned()
    }

    pub fn get_purchases(&self, capsule_id: String, from_index: u32, limit: u32) -> Vec<Purchase> {
        require!(limit > 0 && limit <= MAX_PAGE_SIZE, "INVALID_PAGE_SIZE");
        let capsule = self.capsules.get(&capsule_id).expect("UNKNOWN_CAPSULE");
        capsule
            .request_ids
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|id| {
                self.purchases
                    .get(&Self::purchase_key(&capsule_id, id))
                    .expect("REQUEST_INDEX_INVARIANT")
                    .clone()
            })
            .collect()
    }

    pub fn get_capsule(&self, capsule_id: String) -> Option<Capsule> {
        self.capsules.get(&capsule_id).cloned()
    }
    pub fn get_available(&self, capsule_id: String) -> U128 {
        self.capsules
            .get(&capsule_id)
            .expect("UNKNOWN_CAPSULE")
            .available()
    }
    pub fn get_financials(&self, capsule_id: String) -> FinancialBreakdown {
        let capsule = self.capsules.get(&capsule_id).expect("UNKNOWN_CAPSULE");
        FinancialBreakdown {
            allocated: capsule.allocated,
            spent: capsule.spent,
            reserved: capsule.reserved,
            committed_future: capsule.committed_future,
            available_now: capsule.available(),
            available_to_commit: capsule.available_to_commit(),
        }
    }
    pub fn get_provider(&self, provider_id: String) -> Option<Provider> {
        self.providers.get(&provider_id).cloned()
    }
    pub fn get_quote(&self, quote_id: String) -> Option<Quote> {
        self.quotes.get(&quote_id).cloned()
    }

    pub fn get_capsules(&self, from_index: u32, limit: u32) -> Vec<Capsule> {
        require!(limit > 0 && limit <= MAX_PAGE_SIZE, "INVALID_PAGE_SIZE");
        self.capsule_ids
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|id| {
                self.capsules
                    .get(id)
                    .expect("CAPSULE_INDEX_INVARIANT")
                    .clone()
            })
            .collect()
    }

    pub fn get_quotes(&self, provider_id: String, from_index: u32, limit: u32) -> Vec<Quote> {
        require!(limit > 0 && limit <= MAX_PAGE_SIZE, "INVALID_PAGE_SIZE");
        self.quote_ids
            .iter()
            .filter_map(|id| self.quotes.get(id))
            .filter(|quote| quote.terms.input.provider_id == provider_id)
            .skip(from_index as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }

    /// Read-only estimate using proposed identity. It never records/authorizes a
    /// purchase, reserves capacity, consumes a quote, or creates a promise.
    pub fn preview_purchase(
        &self,
        proposal: PurchaseProposal,
        proposed_agent_id: AccountId,
        proposed_agent_public_key: PublicKey,
    ) -> PreviewResult {
        let result = self.evaluate_stored(
            &proposal,
            &proposed_agent_id,
            &proposed_agent_id,
            &proposed_agent_public_key,
            self.purchases.contains_key(&Self::purchase_key(
                &proposal.capsule_id,
                &proposal.request_id,
            )),
        );
        PreviewResult::from_evaluation(result, env::block_timestamp())
    }
}

impl RunLatch {
    fn validate_attestation(report: &ValidationAttestationInput, expected_criteria: &str) {
        const CRITERIA_HASH: &str =
            "b48e78d7a71b252e8d752fe4d36a9209dcd9087711eafde655a7fd7f995b6a6b";
        require!(
            report.report_schema_version == 1
                && report.criteria_id == "research-output-v1"
                && report.validator_id == "runlatch-research-validator"
                && report.validator_version == "1.0.0",
            "UNSUPPORTED_VALIDATION_METHOD"
        );
        require!(
            report.criteria_hash == expected_criteria && report.criteria_hash == CRITERIA_HASH,
            "VALIDATION_SPEC_MISMATCH"
        );
        require!(
            hashing::decode_hash(&report.evidence_hash).is_some()
                && report
                    .artifact_hash
                    .as_ref()
                    .is_none_or(|hash| hashing::decode_hash(hash).is_some()),
            "INVALID_VALIDATION_HASH"
        );
        require!(
            report.reason_codes.len() <= 32
                && report.issue_count <= 1024
                && report.issue_count as usize >= report.reason_codes.len()
                && report.issues_truncated == (report.issue_count > 64),
            "INVALID_VALIDATION_SUMMARY"
        );
        for reason in &report.reason_codes {
            require!(
                !reason.is_empty()
                    && reason.len() <= 64
                    && reason.as_bytes()[0].is_ascii_uppercase()
                    && reason.bytes().all(|byte| byte.is_ascii_uppercase()
                        || byte.is_ascii_digit()
                        || byte == b'_'),
                "INVALID_VALIDATION_REASON"
            );
        }
        require!(
            report.reason_codes.windows(2).all(|pair| pair[0] < pair[1]),
            "INVALID_VALIDATION_REASON_ORDER"
        );
        let metrics = &report.metrics;
        require!(
            metrics.records_checked <= 50
                && metrics.unique_id_count <= metrics.records_checked
                && metrics.unique_url_count <= metrics.records_checked
                && metrics.records_checked <= metrics.record_count.unwrap_or(0),
            "INVALID_VALIDATION_METRICS"
        );
        if report.artifact_hash.is_some() {
            require!(
                report
                    .artifact_bytes
                    .is_some_and(|bytes| bytes <= 1_048_576),
                "INVALID_ARTIFACT_SIZE"
            );
        }
        match report.status {
            ValidationStatus::Passed => {
                require!(
                    report.issue_count == 0
                        && report.reason_codes.is_empty()
                        && report.artifact_hash.is_some()
                        && report.artifact_bytes.is_some_and(|bytes| bytes > 0)
                        && metrics
                            .record_count
                            .is_some_and(|count| (20..=50).contains(&count)
                                && count == metrics.records_checked
                                && count == metrics.unique_id_count
                                && count == metrics.unique_url_count),
                    "INCONSISTENT_VALIDATION_PASS"
                );
            }
            ValidationStatus::Failed => {
                require!(
                    report.issue_count > 0 && !report.reason_codes.is_empty(),
                    "INVALID_VALIDATION_FAILURE"
                );
                if report.artifact_hash.is_none() {
                    require!(
                        report.artifact_bytes.is_some_and(|bytes| bytes > 1_048_576)
                            && report
                                .reason_codes
                                .iter()
                                .any(|reason| reason == "ARTIFACT_TOO_LARGE"),
                        "MISSING_ARTIFACT_HASH"
                    );
                }
            }
            ValidationStatus::Error => {
                require!(
                    report.issue_count > 0
                        && !report.reason_codes.is_empty()
                        && report.artifact_hash.is_none()
                        && report.artifact_bytes.is_none()
                        && metrics.record_count.is_none()
                        && metrics.records_checked == 0
                        && metrics.unique_id_count == 0
                        && metrics.unique_url_count == 0,
                    "INCONSISTENT_VALIDATION_ERROR"
                );
            }
        }
        require!(
            near_sdk::borsh::to_vec(report)
                .expect("VALIDATION_ENCODING_FAILED")
                .len()
                <= 4096,
            "VALIDATION_RECORD_SIZE_LIMIT"
        );
    }

    fn purchase_key(capsule_id: &str, request_id: &str) -> String {
        Self::assert_id(capsule_id);
        Self::assert_id(request_id);
        format!("{capsule_id}:{request_id}")
    }

    fn emit_purchase(event: &str, record: &Purchase) {
        let data = near_sdk::serde_json::json!({"standard":"runlatch", "version":"1.0.0", "event":event,
            "data":[{"capsule_id":record.proposal.capsule_id,"request_id":record.proposal.request_id,
                "decision":record.decision,"status":record.status,"reserved_amount":record.reserved_amount}]});
        env::log_str(&format!("EVENT_JSON:{data}"));
    }

    fn authorize_request(&mut self, mut record: Purchase, new_request: bool) -> Promise {
        let key = Self::purchase_key(&record.proposal.capsule_id, &record.proposal.request_id);
        let quote = self
            .quotes
            .get(&record.proposal.quote_id)
            .expect("UNKNOWN_QUOTE");
        require!(
            !quote.consumed && quote.quote_hash == record.proposal.expected_quote_hash,
            "QUOTE_NOT_AUTHORIZABLE"
        );
        let amount = quote.terms.input.price.0;
        let total = commitment::total_commitment(&quote.terms.input)
            .expect("COMMERCIAL_TERMS_INVARIANT")
            .expect("UNBOUNDED_COMMITMENT");
        let future_amount = total.checked_sub(amount).expect("COMMITMENT_INVARIANT");
        let recipient = quote.terms.input.recipient_id.clone();
        let terms = quote.terms.clone();
        let capsule = self
            .capsules
            .get(&record.proposal.capsule_id)
            .expect("UNKNOWN_CAPSULE");
        let fingerprint = self.resource_fingerprint(&capsule.policy.project_id, &quote.terms.input);
        require!(
            !self.resource_claims.contains_key(&fingerprint),
            "DUPLICATE_RESOURCE"
        );
        require!(
            capsule.policy_hash == record.policy_hash && total <= capsule.available_to_commit().0,
            "AUTHORIZATION_STATE_CHANGED"
        );
        let reserved = capsule
            .reserved
            .0
            .checked_add(amount)
            .expect("RESERVATION_OVERFLOW");
        let future = capsule
            .committed_future
            .0
            .checked_add(future_amount)
            .expect("COMMITMENT_OVERFLOW");
        Self::assert_transfer_capacity(amount);
        let capsule = self
            .capsules
            .get_mut(&record.proposal.capsule_id)
            .expect("CAPSULE_INVARIANT");
        capsule.reserved = U128(reserved);
        capsule.committed_future = U128(future);
        if new_request {
            capsule.request_ids.push(record.proposal.request_id.clone());
        }
        let quote = self
            .quotes
            .get_mut(&record.proposal.quote_id)
            .expect("QUOTE_INVARIANT");
        quote.consumed = true;
        quote.consumed_by = Some(key.clone());
        record.canonical_quote = Some(terms);
        record.status = PurchaseStatus::SettlementPending;
        record.reserved_amount = U128(amount);
        record.committed_future_amount = U128(future_amount);
        record.resource_fingerprint = Some(fingerprint.clone());
        self.resource_claims.insert(fingerprint, key.clone());
        self.purchases.insert(key.clone(), record.clone());
        Self::emit_purchase("purchase_authorized", &record);
        // Preliminary conservative callback allocation; actual worst-case gas
        // and failure receipts must be measured in Sandbox before public use.
        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(RESOLUTION_GAS)
                    .with_unused_gas_weight(0)
                    .resolve_purchase(key),
            )
    }

    fn quarantine_purchase(&mut self, key: String, mut record: Purchase) -> PurchaseResponse {
        record.reconciliation_required = true;
        self.purchases.insert(key, record.clone());
        PurchaseResponse::from_record(record, false)
    }

    fn assert_transfer_capacity(amount: u128) {
        let storage = Self::storage_price(env::storage_usage() as u128);
        let liquid = env::account_balance()
            .as_yoctonear()
            .saturating_sub(storage);
        require!(
            amount
                .checked_add(Self::storage_price(4_096))
                .is_some_and(|needed| liquid >= needed),
            "INSUFFICIENT_CONTRACT_LIQUIDITY"
        );
        require!(
            env::prepaid_gas()
                .as_gas()
                .saturating_sub(env::used_gas().as_gas())
                >= 50_000_000_000_000,
            "INSUFFICIENT_RESOLUTION_GAS"
        );
    }

    fn end_pending_request(
        &mut self,
        capsule_id: &str,
        request_id: &str,
        status: PurchaseStatus,
        reason: &str,
    ) -> PurchaseResponse {
        self.assert_operator();
        Self::assert_one_yocto();
        let key = Self::purchase_key(capsule_id, request_id);
        let mut record = self.purchases.get(&key).expect("UNKNOWN_REQUEST").clone();
        if record.status != PurchaseStatus::ApprovalPending {
            return PurchaseResponse::rejected_attempt("REQUEST_NOT_PENDING", Some(record));
        }
        record.status = status;
        record.decision = "DENIED".into();
        record.reason_codes = vec![reason.into()];
        self.purchases.insert(key, record.clone());
        Self::emit_purchase("purchase_decision", &record);
        PurchaseResponse::from_record(record, false)
    }

    fn assert_operator(&self) {
        require!(
            env::predecessor_account_id() == self.operator_id,
            "UNAUTHORIZED_OPERATOR"
        );
    }
    fn assert_one_yocto() {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "ONE_YOCTO_REQUIRED"
        );
    }
    fn assert_id(id: &str) {
        require!(
            !id.is_empty()
                && id.len() <= 64
                && id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'),
            "INVALID_ID"
        );
    }
    fn assert_proposal_bounds(proposal: &PurchaseProposal) {
        Self::assert_id(&proposal.project_id);
        Self::assert_id(&proposal.capsule_id);
        Self::assert_id(&proposal.request_id);
        Self::assert_id(&proposal.quote_id);
        // Malformed bounded hashes still receive an honest Gate mismatch denial.
        // Oversized fields must never become owner-funded persistent records.
        require!(
            proposal.expected_quote_hash.len() <= 64,
            "QUOTE_HASH_SIZE_LIMIT"
        );
    }
    fn storage_price(bytes: u128) -> u128 {
        env::storage_byte_cost()
            .as_yoctonear()
            .checked_mul(bytes)
            .expect("STORAGE_PRICE_OVERFLOW")
    }
    fn validate_scope(scope: &[String], max: usize) {
        require!(
            !scope.is_empty() && scope.len() <= max,
            "INVALID_SCOPE_SIZE"
        );
        for (index, value) in scope.iter().enumerate() {
            Self::assert_id(value);
            require!(!scope[..index].contains(value), "DUPLICATE_SCOPE");
        }
    }
    fn validate_policy(&self, policy: &Policy) {
        Self::assert_id(&policy.project_id);
        let project = self
            .projects
            .get(&policy.project_id)
            .expect("UNKNOWN_PROJECT");
        require!(
            project.owner_id == self.operator_id && project.status == ProjectStatus::Active,
            "PROJECT_INACTIVE"
        );
        require!(
            policy.project_revision == project.revision,
            "STALE_PROJECT_REVISION"
        );
        require!(
            policy.expires_at_ns.0 <= project.input.expires_at_ns.0,
            "CAPSULE_EXCEEDS_PROJECT_EXPIRY"
        );
        require!(
            project
                .allocated_authority
                .0
                .checked_add(policy.budget.0)
                .is_some_and(|total| total <= project.input.budget_ceiling.0),
            "PROJECT_ALLOCATION_EXCEEDED"
        );
        Self::assert_id(&policy.task_id);
        Self::assert_id(&policy.workflow_id);
        require!(
            policy.agent_id != self.operator_id && policy.agent_id != env::current_account_id(),
            "PRIVILEGED_AGENT_NOT_ALLOWED"
        );
        require!(
            policy.agent_public_key.curve_type() == CurveType::ED25519,
            "UNSUPPORTED_AGENT_KEY_TYPE"
        );
        require!(
            policy.budget.0 > 0
                && policy.per_purchase_limit.0 > 0
                && policy.per_purchase_limit.0 <= policy.budget.0,
            "INVALID_BUDGET_LIMITS"
        );
        require!(
            policy.per_commitment_limit.0 > 0 && policy.per_commitment_limit.0 <= policy.budget.0,
            "INVALID_COMMITMENT_LIMIT"
        );
        require!(
            policy
                .approval_threshold
                .is_none_or(|threshold| threshold.0 <= policy.per_commitment_limit.0),
            "INVALID_APPROVAL_THRESHOLD"
        );
        require!(
            policy.max_quantity > 0 && policy.max_quantity <= 50,
            "INVALID_QUANTITY_LIMIT"
        );
        require!(
            policy.expires_at_ns.0 > env::block_timestamp(),
            "CAPSULE_EXPIRED"
        );
        require!(
            hashing::decode_hash(&policy.validation_spec_hash).is_some(),
            "INVALID_VALIDATION_SPEC_HASH"
        );
        Self::validate_scope(&policy.allowed_provider_ids, 3);
        Self::validate_scope(&policy.allowed_service_ids, 4);
        Self::validate_scope(&policy.allowed_categories, 4);
        for provider_id in &policy.allowed_provider_ids {
            let provider = self.providers.get(provider_id).expect("UNKNOWN_PROVIDER");
            require!(provider.active, "PROVIDER_SUSPENDED");
            require!(
                policy.agent_id != provider.publisher_id
                    && policy.agent_id != provider.recipient_id,
                "AGENT_PROVIDER_ROLE_CONFLICT"
            );
        }
    }

    fn evaluate_stored(
        &self,
        proposal: &PurchaseProposal,
        predecessor: &AccountId,
        signer: &AccountId,
        key: &PublicKey,
        request_exists: bool,
    ) -> gate::Evaluation {
        Self::assert_proposal_bounds(proposal);
        let expected_hash = hashing::decode_hash(&proposal.expected_quote_hash)
            .expect("INVALID_EXPECTED_QUOTE_HASH");
        let capsule = self
            .capsules
            .get(&proposal.capsule_id)
            .expect("UNKNOWN_CAPSULE");
        let policy = &capsule.policy;
        let project = self
            .projects
            .get(&policy.project_id)
            .expect("PROJECT_INVARIANT");
        let quote = self.quotes.get(&proposal.quote_id);
        let canonical_hash = quote
            .map(|quote| hashing::decode_hash(&quote.quote_hash).expect("QUOTE_HASH_INVARIANT"));
        let provider = quote.and_then(|quote| self.providers.get(&quote.terms.input.provider_id));
        let quote_view = quote.map(|quote| {
            let terms = &quote.terms.input;
            gate::QuoteView {
                provider_id: &terms.provider_id,
                provider_account: quote.terms.publisher_id.as_str(),
                recipient_account: terms.recipient_id.as_str(),
                registered_publisher: provider.map(|p| p.publisher_id.as_str()),
                registered_recipient: provider.map(|p| p.recipient_id.as_str()),
                provider_active: provider.is_some_and(|p| p.active),
                consumed: quote.consumed,
                expires_at_ns: terms.expires_at_ns.0,
                asset: &terms.asset,
                service_id: &terms.service_id,
                category: &terms.category,
                quantity: terms.quantity,
                recurring: terms.recurring,
                price: terms.price.0,
                future_commitment: commitment::total_commitment(terms)
                    .ok()
                    .flatten()
                    .and_then(|total| total.checked_sub(terms.price.0)),
                canonical_hash: canonical_hash.as_ref().expect("QUOTE_HASH_INVARIANT"),
            }
        });
        gate::evaluate(&gate::PurchaseContext {
            project: gate::ProjectView {
                bound: proposal.project_id == policy.project_id
                    && project.owner_id == capsule.owner_id,
                active: project.status == ProjectStatus::Active,
                revision_fresh: proposal.project_revision == policy.project_revision
                    && policy.project_revision == project.revision,
                expires_at_ns: project.input.expires_at_ns.0,
            },
            resource_duplicate: quote.is_some_and(|q| {
                self.resource_claims
                    .contains_key(&self.resource_fingerprint(&policy.project_id, &q.terms.input))
            }),
            capsule: gate::CapsuleView {
                state: capsule.status.gate_state(),
                agent_account: policy.agent_id.as_str(),
                agent_key: policy.agent_public_key.as_bytes(),
                expires_at_ns: policy.expires_at_ns.0,
                original_budget: policy.budget.0,
                allocated: capsule.allocated.0,
                spent: capsule.spent.0,
                reserved: capsule.reserved.0,
                committed_future: capsule.committed_future.0,
                returned: capsule.returned.0,
                per_purchase_limit: policy.per_purchase_limit.0,
                per_commitment_limit: policy.per_commitment_limit.0,
                recurring_allowed: policy.recurring_policy == RecurringPolicy::RequireApproval,
                allowed_providers: &policy.allowed_provider_ids,
                allowed_services: &policy.allowed_service_ids,
                allowed_categories: &policy.allowed_categories,
                max_quantity: policy.max_quantity,
                approval_threshold: policy.approval_threshold.map(|value| value.0),
            },
            quote: quote_view,
            predecessor_account: predecessor.as_str(),
            signer_account: signer.as_str(),
            signer_key: key.as_bytes(),
            expected_quote_hash: &expected_hash,
            request_exists,
            now_ns: env::block_timestamp(),
        })
    }

    fn resource_fingerprint(&self, project_id: &str, quote: &QuoteInput) -> String {
        hashing::hash_record(
            "runlatch.resource.v2",
            &self.network_id,
            &env::current_account_id(),
            &(
                project_id,
                &quote.provider_id,
                &quote.service_id,
                &quote.resource_key,
            ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};

    fn contract_context() {
        let contract: AccountId = "contract.testnet".parse().unwrap();
        let mut context = VMContextBuilder::new();
        context.current_account_id(contract.clone());
        context.predecessor_account_id(contract);
        testing_env!(context.build());
    }

    #[test]
    fn initializes_operator_and_schema() {
        contract_context();
        let operator: AccountId = "operator.testnet".parse().unwrap();
        let contract = RunLatch::init(operator.clone());
        assert_eq!(contract.get_operator(), operator);
        assert_eq!(contract.get_schema_version(), 2);
    }

    #[test]
    #[should_panic(expected = "INITIALIZATION_REQUIRES_CONTRACT_ACCOUNT")]
    fn unrelated_account_cannot_initialize() {
        let mut context = VMContextBuilder::new();
        context.current_account_id("contract.testnet".parse().unwrap());
        context.predecessor_account_id("intruder.testnet".parse().unwrap());
        testing_env!(context.build());
        RunLatch::init("operator.testnet".parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "ALREADY_INITIALIZED")]
    fn initialized_state_cannot_be_replaced() {
        contract_context();
        let contract = RunLatch::init("operator.testnet".parse().unwrap());
        env::state_write(&contract);
        RunLatch::init("intruder.testnet".parse().unwrap());
    }
}
