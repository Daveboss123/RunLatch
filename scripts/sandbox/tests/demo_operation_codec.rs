//! Offline capsule/quote/AddKey wire parity. No public RPC, Sandbox or human credential.
use near_api::types::{
    CryptoHash, NearGas, NearToken, Signature,
    json::U64,
    transaction::{
        SignedTransaction, Transaction, TransactionV0,
        actions::{
            AccessKey, AccessKeyPermission, AddKeyAction, FunctionCallAction,
            FunctionCallPermission,
        },
    },
};
use near_api::{AccountId, PublicKey};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, str::FromStr, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

fn quoted(value: &Value) -> Result<String, Box<dyn std::error::Error>> {
    Ok(serde_json::to_string(value)?)
}
fn project_args(input: &Value) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let p = &input["args"]["project"];
    Ok(format!("{{\"project\":{{\"project_id\":{},\"organisation_id\":{},\"client_ref\":{},\"budget_ceiling\":{},\"expires_at_ns\":{},\"outcome_definition_hash\":{}}}}}",
        quoted(&p["project_id"])?, quoted(&p["organisation_id"])?, quoted(&p["client_ref"])?, quoted(&p["budget_ceiling"])?,
        quoted(&p["expires_at_ns"])?, quoted(&p["outcome_definition_hash"])?).into_bytes())
}
fn capsule_args(input: &Value) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let a = &input["args"];
    let p = &a["policy"];
    Ok(format!(concat!("{{\"capsule_id\":{},\"policy\":{{\"project_id\":{},\"project_revision\":{},\"task_id\":{},\"workflow_id\":{},",
        "\"agent_id\":{},\"agent_public_key\":{},\"budget\":{},\"per_purchase_limit\":{},\"per_commitment_limit\":{},",
        "\"recurring_policy\":{},\"allowed_provider_ids\":{},\"allowed_service_ids\":{},\"allowed_categories\":{},",
        "\"max_quantity\":{},\"approval_threshold\":{},\"expires_at_ns\":{},\"validation_spec_hash\":{}}},\"storage_credit\":{}}}"),
      quoted(&a["capsule_id"])?, quoted(&p["project_id"])?, quoted(&p["project_revision"])?, quoted(&p["task_id"])?, quoted(&p["workflow_id"])?,
      quoted(&p["agent_id"])?, quoted(&p["agent_public_key"])?, quoted(&p["budget"])?, quoted(&p["per_purchase_limit"])?, quoted(&p["per_commitment_limit"])?,
      quoted(&p["recurring_policy"])?, quoted(&p["allowed_provider_ids"])?, quoted(&p["allowed_service_ids"])?, quoted(&p["allowed_categories"])?,
      quoted(&p["max_quantity"])?, quoted(&p["approval_threshold"])?, quoted(&p["expires_at_ns"])?, quoted(&p["validation_spec_hash"])?,
      quoted(&a["storage_credit"])?).into_bytes())
}
fn quote_args(input: &Value) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let q = &input["args"]["quote"];
    Ok(format!(concat!("{{\"quote\":{{\"quote_id\":{},\"provider_id\":{},\"recipient_id\":{},\"service_id\":{},\"category\":{},",
      "\"resource_key\":{},\"quantity\":{},\"price\":{},\"asset\":{},\"recurring\":{},\"expires_at_ns\":{},",
      "\"previous_quote_id\":{},\"commercial_terms\":{}}}}}"), quoted(&q["quote_id"])?, quoted(&q["provider_id"])?, quoted(&q["recipient_id"])?,
      quoted(&q["service_id"])?, quoted(&q["category"])?, quoted(&q["resource_key"])?, quoted(&q["quantity"])?, quoted(&q["price"])?, quoted(&q["asset"])?,
      quoted(&q["recurring"])?, quoted(&q["expires_at_ns"])?, quoted(&q["previous_quote_id"])?, quoted(&q["commercial_terms"])?).into_bytes())
}
fn transaction(input: &Value) -> Result<Transaction, Box<dyn std::error::Error>> {
    let field = |name: &str| input[name].as_str().ok_or("Missing public field");
    let action = match field("kind")? {
        "project" | "capsule" | "quote" => {
            near_api::types::Action::FunctionCall(Box::new(FunctionCallAction {
                method_name: field("method")?.into(),
                args: if field("kind")? == "project" {
                    project_args(input)?
                } else if field("kind")? == "capsule" {
                    capsule_args(input)?
                } else {
                    quote_args(input)?
                },
                gas: NearGas::from_gas(field("gas")?.parse()?),
                deposit: NearToken::from_yoctonear(field("deposit")?.parse()?),
            }))
        }
        "agent-key" => {
            let p = &input["action"]["params"];
            let permission = &p["accessKey"]["permission"];
            near_api::types::Action::AddKey(Box::new(AddKeyAction {
                public_key: p["publicKey"]
                    .as_str()
                    .ok_or("Missing added key")?
                    .parse()?,
                access_key: AccessKey {
                    nonce: U64(0),
                    permission: AccessKeyPermission::FunctionCall(FunctionCallPermission {
                        allowance: Some(NearToken::from_yoctonear(
                            permission["allowance"]
                                .as_str()
                                .ok_or("Missing allowance")?
                                .parse()?,
                        )),
                        receiver_id: permission["receiverId"]
                            .as_str()
                            .ok_or("Missing receiver")?
                            .into(),
                        method_names: vec![
                            permission["methodNames"][0]
                                .as_str()
                                .ok_or("Missing method")?
                                .into(),
                        ],
                    }),
                },
            }))
        }
        _ => return Err("Unknown kind".into()),
    };
    Ok(Transaction::V0(TransactionV0 {
        signer_id: field("signer_id")?.parse()?,
        public_key: field("public_key")?.parse()?,
        nonce: field("nonce")?.parse()?,
        receiver_id: field("receiver_id")?.parse()?,
        block_hash: field("block_hash")?.parse()?,
        actions: vec![action],
    }))
}
#[tokio::test]
async fn exact_demo_operations_match_rust_wire_hashes_and_ephemeral_signatures()
-> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let node = std::env::var("RUNLATCH_NODE_EXECUTABLE")?;
    let placeholder = Signature::from_str(&format!("ed25519:{}", "1".repeat(64)))?;
    let operator: AccountId = "runlatch-demo-1108.testnet".parse()?;
    let provider: AccountId = "db.runlatch-demo-1108.testnet".parse()?;
    let agent: AccountId = "agent.runlatch-demo-1108.testnet".parse()?;
    let gate: AccountId = "gate.runlatch-demo-1108.testnet".parse()?;
    let mut inputs = Vec::new();
    let mut expected = Vec::new();
    for (index, kind) in ["project", "capsule", "quote", "agent-key"]
        .into_iter()
        .enumerate()
    {
        for (vector, nonce) in [1_u64, 9_007_199_254_740_993, u64::MAX]
            .into_iter()
            .enumerate()
        {
            let key = PublicKey::ED25519(near_api::types::crypto::public_key::ED25519PublicKey(
                [u8::try_from(index * 3 + vector)?; 32],
            ));
            let base = json!({"kind":kind,"network":"testnet","signer_id":if kind=="project"||kind=="capsule"{operator.clone()}else if kind=="quote"{provider.clone()}else{agent.clone()},
          "receiver_id":if kind=="agent-key"{agent.clone()}else{gate.clone()},"public_key":key.to_string(),"nonce":nonce.to_string(),
          "block_hash":CryptoHash([u8::try_from(vector)?;32]).to_string()});
            let input = if kind == "project" {
                let mut v = base;
                v.as_object_mut().unwrap().extend(json!({"method":"create_project","gas":"50000000000000","deposit":"81920000000000000000000","args":{"project":{"project_id":"project_demo_1110","organisation_id":"org_demo_1108","client_ref":"client_demo_1108","budget_ceiling":"300000000000000000000000","expires_at_ns":"1794506400000000000","outcome_definition_hash":"57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9"}}}).as_object().unwrap().clone());
                v
            } else if kind == "capsule" {
                let mut v = base;
                v.as_object_mut().unwrap().extend(json!({"method":"create_capsule","gas":"50000000000000","deposit":"2921440000000000000000000","args":{"capsule_id":"capsule_demo_1110","policy":{"project_id":"project_demo_1110","project_revision":"1","task_id":"booking_database_1110","workflow_id":"website-resource-fixture-v1","agent_id":"agent.runlatch-demo-1108.testnet","agent_public_key":"ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY","budget":"300000000000000000000000","per_purchase_limit":"50000000000000000000000","per_commitment_limit":"300000000000000000000000","recurring_policy":"REQUIRE_APPROVAL","allowed_provider_ids":["db_demo_1108"],"allowed_service_ids":["database-plan"],"allowed_categories":["database"],"max_quantity":1,"approval_threshold":"50000000000000000000000","expires_at_ns":"1794499200000000000","validation_spec_hash":"57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9"},"storage_credit":"2621440000000000000000000"}}).as_object().unwrap().clone());
                v
            } else if kind == "quote" {
                let mut v = base;
                v.as_object_mut().unwrap().extend(json!({"method":"publish_quote","gas":"50000000000000","deposit":"81920000000000000000000","args":{"quote":{"quote_id":"db_quote_demo_1110","provider_id":"db_demo_1108","recipient_id":"db.runlatch-demo-1108.testnet","service_id":"database-plan","category":"database","resource_key":"booking-database","quantity":1,"price":"50000000000000000000000","asset":"near-native","recurring":false,"expires_at_ns":"1794495600000000000","previous_quote_id":null,"commercial_terms":null}}}).as_object().unwrap().clone());
                v
            } else {
                let mut v = base;
                v.as_object_mut().unwrap().extend(json!({"action":{"type":"AddKey","params":{"publicKey":"ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY","accessKey":{"nonce":0,"permission":{"receiverId":"gate.runlatch-demo-1108.testnet","allowance":"50000000000000000000000","methodNames":["submit_purchase"]}}}}}).as_object().unwrap().clone());
                v
            };
            let tx = transaction(&input)?;
            let hash = tx.get_hash().to_string();
            let wire: near_openapi_types::SignedTransaction =
                SignedTransaction::new(placeholder.clone(), tx).into();
            expected.push(
                json!({"transaction_hash":hash,"invalid_placeholder_wire_base64":wire.to_string()}),
            );
            inputs.push(input);
        }
    }
    let mut child = Command::new(node)
        .arg("scripts/setup/demo-operation-codec-parity.ts")
        .current_dir(root)
        .env_remove("RUNLATCH_AGENT_PRIVATE_KEY")
        .env_remove("AI_PROVIDER_API_KEY")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let output = tokio::time::timeout(Duration::from_secs(30), async {
        let mut stdin = child.stdin.take().ok_or("Missing stdin")?;
        stdin.write_all(&serde_json::to_vec(&inputs)?).await?;
        stdin.shutdown().await?;
        drop(stdin);
        Ok::<_, Box<dyn std::error::Error>>(child.wait_with_output().await?)
    })
    .await??;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stderr.is_empty());
    let result: Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(result["results"], json!(expected));
    assert_eq!(result["public_execution"], false);
    for signed in result["ephemeral"].as_array().ok_or("Missing signatures")? {
        let tx = transaction(&signed["transaction"])?;
        let key: PublicKey = signed["transaction"]["public_key"]
            .as_str()
            .ok_or("Missing key")?
            .parse()?;
        let bytes: Vec<u8> = serde_json::from_value(signed["signature_bytes"].clone())?;
        let signature = Signature::from_parts(near_api::types::crypto::KeyType::ED25519, &bytes)?;
        assert!(signature.verify(tx.get_hash(), key));
        let wire: near_openapi_types::SignedTransaction =
            SignedTransaction::new(signature, tx).into();
        assert_eq!(signed["signed_wire_base64"], wire.to_string());
    }
    println!(
        "12 demo-operation V0 vectors +4 ephemeral signatures verified; no network/store access"
    );
    Ok(())
}
