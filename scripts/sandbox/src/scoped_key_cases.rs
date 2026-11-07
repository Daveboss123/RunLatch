//! Real LOCAL restricted keys. Recovery signs key management only, never retries
//! a refused scoped purchase with broader authority. All secrets stay in memory.
use super::*;
use near_api::types::transaction::actions::{AccessKeyPermission, FunctionCallPermission};

fn protocol_rejected(error: &dyn Error, expected: &str) {
    let detail = format!("{error:?}");
    // Pinned near-api/nearcore pairing exposes some pre-execution failures as
    // InvalidTransaction({}) without the nested reason. Do not invent that reason.
    assert!(
        detail.contains(expected) || detail.contains("InvalidTransaction"),
        "Expected protocol rejection ({expected}); observed: {detail}"
    );
}

pub(super) async fn scoped_actor(
    recovery: &Actor,
    receiver: &AccountId,
    network: &NetworkConfig,
    allowance: NearToken,
) -> TestResult<(Actor, ExecutionFinalResult)> {
    if allowance.as_yoctonear() == 0 {
        return Err("Finite positive gas allowance required".into());
    }
    let secret = near_api::signer::generate_secret_key()?;
    let public_key = secret.public_key();
    let permission = AccessKeyPermission::FunctionCall(FunctionCallPermission {
        allowance: Some(allowance),
        receiver_id: receiver.to_string(),
        method_names: vec!["submit_purchase".into()],
    });
    let result = Account(recovery.id.clone())
        .add_key(permission, public_key)
        .with_signer(recovery.signer.clone())
        .wait_until(TxExecutionStatus::Final)
        .send_to(network)
        .await?
        .into_full()
        .ok_or("LOCAL add-key result pending")?;
    if !result.is_success() {
        return Err(format!("LOCAL add-key failed: {:?}", result.failures()).into());
    }
    let actor = Actor {
        id: recovery.id.clone(),
        signer: Signer::from_secret_key(secret)?,
        public_key,
    };
    Ok((actor, result))
}

impl Harness {
    pub(super) async fn scoped_key_checks(&mut self) -> TestResult<()> {
        let allowance = NearToken::from_millinear(250);
        let (restricted, added) =
            scoped_actor(&self.agent, &self.contract.0, &self.network, allowance).await?;
        self.remember("scoped_key_added", &added);
        let recovery = std::mem::replace(&mut self.agent, restricted);
        let permission = Account(self.agent.id.clone())
            .access_key(self.agent.public_key)
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .permission;
        let AccessKeyPermission::FunctionCall(permission) = permission else {
            return Err("Agent key unexpectedly full access".into());
        };
        assert_eq!(permission.receiver_id, self.contract.0.as_str());
        assert_eq!(permission.method_names, vec!["submit_purchase"]);
        assert_eq!(permission.allowance, Some(allowance));
        let recovery_permission = Account(recovery.id.clone())
            .access_key(recovery.public_key)
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .permission;
        assert!(matches!(
            recovery_permission,
            AccessKeyPermission::FullAccess
        ));
        self.evidence.push(
            json!({"case":"restricted_key_permissions","source":"LOCAL_NEAR_SANDBOX",
            "receiver":permission.receiver_id,"methods":permission.method_names,
            "gas_allowance":allowance.as_yoctonear().to_string(),"recovery_retained":true,
            "allowance_is_business_budget":false}),
        );

        let recipient = self.publisher.id.clone();
        self.capsule("scoped-run", vec!["search"], None).await?;
        self.quote("scoped-quote", "search", &recipient, 100, false)
            .await?;
        let request = self
            .proposal("scoped-run", "scoped-quote", "scoped-request")
            .await?;
        let before = self.assert_ledger("scoped-run").await?;
        let denied_method = self
            .send(
                "approve_purchase",
                json!({"capsule_id":"scoped-run","request_id":"scoped-request",
            "expected_request_hash":"00".repeat(32)}),
                &self.agent,
                0,
                NearGas::from_tgas(100),
            )
            .await;
        let error = denied_method.expect_err("Restricted key unexpectedly called owner method");
        protocol_rejected(error.as_ref(), "MethodNameMismatch");
        let denied_deposit = self
            .send(
                "submit_purchase",
                json!({"proposal":request}),
                &self.agent,
                1,
                NearGas::from_tgas(100),
            )
            .await;
        let error = denied_deposit.expect_err("Restricted key attached a deposit");
        protocol_rejected(error.as_ref(), "DepositWithFunctionCall");
        let other = Contract(recipient.clone())
            .call_function("submit_purchase", json!({"proposal":request}))
            .transaction()
            .gas(NearGas::from_tgas(100))
            .with_signer(self.agent.id.clone(), self.agent.signer.clone())
            .wait_until(TxExecutionStatus::Final)
            .send_to(&self.network)
            .await;
        let error = other.expect_err("Restricted key called another receiver");
        protocol_rejected(&error, "ReceiverMismatch");
        assert_eq!(self.assert_ledger("scoped-run").await?, before);
        assert!(
            self.purchase("scoped-run", "scoped-request")
                .await?
                .is_null()
        );

        let result = self
            .call(
                "submit_purchase",
                json!({"proposal":request}),
                &self.agent,
                0,
                "scoped_successful_purchase",
            )
            .await?;
        self.remember("scoped_successful_purchase", &result);
        self.inspect_actions(
            "scoped_canonical_transfer",
            &result,
            Some((&recipient, 100)),
            Some("resolve_purchase"),
        )
        .await?;
        assert_eq!(
            self.purchase("scoped-run", "scoped-request").await?["status"],
            "SETTLED"
        );
        self.assert_ledger("scoped-run").await?;

        self.capsule("removal-run", vec!["search"], None).await?;
        self.quote("removal-quote", "search", &recipient, 100, false)
            .await?;
        let removal_request = self
            .proposal("removal-run", "removal-quote", "removed-key-request")
            .await?;
        let removed = Account(recovery.id.clone())
            .delete_key(self.agent.public_key)
            .with_signer(recovery.signer.clone())
            .wait_until(TxExecutionStatus::Final)
            .send_to(&self.network)
            .await?
            .into_full()
            .ok_or("LOCAL key deletion pending")?;
        assert!(removed.is_success());
        self.remember("only_scoped_key_removed", &removed);
        let missing_key = self
            .raw_access_key(&recovery.id, self.agent.public_key)
            .await?;
        let legacy_error = missing_key["result"]["error"].as_str().unwrap_or("");
        let typed_missing = missing_key["error"]["cause"]["name"] == "UNKNOWN_ACCESS_KEY";
        assert!(
            typed_missing
                || legacy_error.contains("does not exist")
                    && legacy_error.contains(&self.agent.public_key.to_string()),
            "Deleted key absence was not proven"
        );
        assert!(missing_key["result"]["nonce"].is_null());
        let error = self
            .send(
                "submit_purchase",
                json!({"proposal":removal_request}),
                &self.agent,
                0,
                NearGas::from_tgas(100),
            )
            .await
            .expect_err("Removed key submitted a purchase");
        let removed_detail = format!("{error:?}");
        assert!(
            removed_detail.contains("does not exist")
                || removed_detail.contains("UnknownAccessKey")
                || removed_detail.contains("AccessKeyNotFound"),
            "Unexpected removed-key failure: {removed_detail}"
        );
        assert_eq!(self.assert_ledger("removal-run").await?["status"], "ACTIVE");
        assert!(
            self.purchase("removal-run", "removed-key-request")
                .await?
                .is_null()
        );

        // Distinct positive-but-insufficient key; no zero/null allowance shortcut.
        let (tiny, added) = scoped_actor(
            &recovery,
            &self.contract.0,
            &self.network,
            NearToken::from_yoctonear(1),
        )
        .await?;
        self.remember("positive_insufficient_allowance_key", &added);
        let error = self
            .send(
                "submit_purchase",
                json!({"proposal":request}),
                &tiny,
                0,
                NearGas::from_tgas(100),
            )
            .await
            .expect_err("Insufficient gas allowance key submitted a call");
        protocol_rejected(error.as_ref(), "NotEnoughAllowance");
        let recovery_permission = Account(recovery.id.clone())
            .access_key(recovery.public_key)
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?
            .data
            .permission;
        assert!(matches!(
            recovery_permission,
            AccessKeyPermission::FullAccess
        ));
        self.evidence.push(json!({"case":"scoped_key_rejections","source":"LOCAL_NEAR_SANDBOX",
            "method_rejected":true,"receiver_rejected":true,"deposit_rejected":true,"removed_key_rejected":true,
            "insufficient_positive_allowance_rejected":true,"removal_did_not_revoke_capsule":true,
            "recovery_retained":true,"broader_purchase_fallback":false,
            "rpc_reason_detail":"Some SDK errors are InvalidTransaction({}); specific nested reason unavailable",
            "permissions_verified_separately":true,"deleted_key_absence_verified_raw":true,
            "removed_call_observation":"May fail at SDK nonce lookup on legacy RPC response; no persisted business denial"}));
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("scoped-key.json"),
            serde_json::to_vec_pretty(&json!({"environment":"LOCAL_NEAR_SANDBOX",
            "result":"SCOPED_KEY_CHECKS_PASSED","public_testnet":false,"evidence":self.evidence}))?,
        )?;
        println!(
            "{}",
            json!({"environment":"LOCAL_NEAR_SANDBOX","result":"SCOPED_KEY_CHECKS_PASSED",
            "public_testnet":false,"evidence_file":".local/sandbox/scoped-key.json"})
        );
        // Explicit test-controller restoration only. No refused purchase is resent.
        self.agent = recovery;
        Ok(())
    }
}
