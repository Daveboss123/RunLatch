//! LOCAL-only RPC error preservation. Never an owner/hosted/public signer fallback.
use super::*;
use near_api::advanced::TransactionableOrSigned;

impl Harness {
    pub(super) async fn raw_access_key(
        &self,
        id: &AccountId,
        public_key: PublicKey,
    ) -> TestResult<Value> {
        if !self.sandbox.rpc_addr.starts_with("http://127.0.0.1:") {
            return Err("Key query must remain loopback".into());
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(30))
            .build()?;
        let mut response = client
            .post(&self.sandbox.rpc_addr)
            .json(&json!({"jsonrpc":"2.0","id":"local-key-query",
            "method":"query","params":{"request_type":"view_access_key","finality":"final",
                "account_id":id,"public_key":public_key.to_string()}}))
            .send()
            .await?;
        if !response.status().is_success() {
            return Err("LOCAL access-key HTTP failure".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes
                .len()
                .checked_add(chunk.len())
                .is_none_or(|size| size > 16384)
            {
                return Err("LOCAL key-query response limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(serde_json::from_slice(&bytes)?)
    }

    pub(super) async fn diagnose_scoped_key(&mut self) -> TestResult<()> {
        if !self.sandbox.rpc_addr.starts_with("http://127.0.0.1:") {
            return Err("Diagnostic RPC must be loopback".into());
        }
        let allowance = NearToken::from_millinear(250);
        let (restricted, _) = super::scoped_key_cases::scoped_actor(
            &self.agent,
            &self.contract.0,
            &self.network,
            allowance,
        )
        .await?;
        let recovery = std::mem::replace(&mut self.agent, restricted);
        self.capsule("diagnostic-run", vec!["search"], None).await?;
        let recipient = self.publisher.id.clone();
        self.quote("diagnostic-quote", "search", &recipient, 100, false)
            .await?;
        let request = self
            .proposal("diagnostic-run", "diagnostic-quote", "diagnostic-request")
            .await?;
        let key_before = Account(self.agent.id.clone())
            .access_key(self.agent.public_key)
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?;
        // Reproduce the rejected probes without treating unspecified failures as passes.
        let mut probe_classes = Vec::new();
        for (method, args, deposit) in [
            (
                "approve_purchase",
                json!({"capsule_id":"diagnostic-run","request_id":"diagnostic-request","expected_request_hash":"00".repeat(32)}),
                0,
            ),
            ("submit_purchase", json!({"proposal":request}), 1),
        ] {
            let result = self
                .send(method, args, &self.agent, deposit, NearGas::from_tgas(100))
                .await;
            probe_classes.push(match result {
                Ok(_) => "RPC_RETURNED_EXECUTION",
                Err(_) => "SDK_ERROR_DETAILS_NOT_USED",
            });
        }
        let key_after = Account(self.agent.id.clone())
            .access_key(self.agent.public_key)
            .at(Reference::Final)
            .fetch_from(&self.network)
            .await?;
        let prepared = self
            .contract
            .call_function("submit_purchase", json!({"proposal":request}))
            .transaction()
            .gas(NearGas::from_tgas(100))
            .deposit(NearToken::from_yoctonear(0))
            .with_signer(self.agent.id.clone(), self.agent.signer.clone())
            .wait_until(TxExecutionStatus::Final)
            .presign_with(&self.network)
            .await?;
        let signed = match &prepared.transaction {
            TransactionableOrSigned::Signed((signed, _)) => signed.clone(),
            _ => return Err("LOCAL transaction was not presigned".into()),
        };
        let hash = signed.get_hash();
        let wire: near_openapi_types::SignedTransaction = signed.clone().into();
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(30))
            .build()?;
        // Exactly one raw submission of this new signed transaction identity.
        // No secret, signer, credential, arbitrary URL or base64 payload is logged.
        let mut response = client
            .post(&self.sandbox.rpc_addr)
            .json(&json!({"jsonrpc":"2.0","id":"local-diagnostic",
            "method":"send_tx","params":{"signed_tx_base64":wire,"wait_until":"FINAL"}}))
            .send()
            .await?;
        let http_status = response.status().as_u16();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes
                .len()
                .checked_add(chunk.len())
                .is_none_or(|size| size > 131072)
            {
                return Err("LOCAL diagnostic response limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let body: Value = serde_json::from_slice(&bytes)?;
        let report = json!({"source":"LOCAL_SCOPED_KEY_DIAGNOSTIC_NOT_PASSING_EVIDENCE","public_testnet":false,
            "http_status":http_status,"transaction_id":hash.to_string(),"key_before":key_before,"key_after":key_after,
            "transaction_metadata":signed.transaction,"probe_classes":probe_classes,"rpc_error":body["error"],
            "execution_status":body["result"]["final_execution_status"],
            "purchase_record":self.purchase("diagnostic-run","diagnostic-request").await?});
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.local/sandbox");
        std::fs::create_dir_all(&directory)?;
        std::fs::write(
            directory.join("scoped-diagnostic.json"),
            serde_json::to_vec_pretty(&report)?,
        )?;
        println!("{}", serde_json::to_string_pretty(&report)?);
        self.agent = recovery;
        Ok(())
    }
}
