//! Offline byte/signature parity. Node generates one in-memory ephemeral test key only.
//! No Sandbox node/RPC/public account/real-key input/submission or persistent private key.
use near_api::types::{
    CryptoHash, NearGas, NearToken, Signature,
    transaction::{SignedTransaction, Transaction, TransactionV0, actions::FunctionCallAction},
};
use near_api::{AccountId, PublicKey};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, str::FromStr, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

#[tokio::test]
async fn restricted_v0_node_bytes_match_reviewed_rust_sdk() -> Result<(), Box<dyn std::error::Error>>
{
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let node = std::env::var("RUNLATCH_NODE_EXECUTABLE")?;
    let mut inputs = Vec::new();
    let mut expected = Vec::new();
    let mut first_transaction = None;
    // Public synthetic byte patterns only. The placeholder is deliberately NOT a valid signature.
    let placeholder = Signature::from_str(&format!("ed25519:{}", "1".repeat(64)))?;
    for index in 0..24_u8 {
        let nonce = [1_u64, 8, 9_007_199_254_740_993, u64::MAX][usize::from(index % 4)];
        let gas = [1_u64, 100_000_000_000_000, 300_000_000_000_000][usize::from(index % 3)];
        let signer: AccountId = if index == 23 {
            format!("{}.testnet", "a".repeat(56))
        } else {
            "agent.testnet".into()
        }
        .parse()?;
        let receiver: AccountId = "runlatch.testnet".parse()?;
        let pk_bytes = std::array::from_fn(|i| (i as u8).wrapping_add(index));
        let public_key = PublicKey::ED25519(near_api::types::crypto::public_key::ED25519PublicKey(
            pk_bytes,
        ));
        let block_hash = CryptoHash([index; 32]);
        let proposal = json!({"project_id":if index == 23 {"p".repeat(64)} else {"client-work".into()}, "project_revision":u64::MAX.to_string(),
            "capsule_id":"website", "request_id":format!("database-{index}"), "quote_id":"database-one-use", "expected_quote_hash":format!("{index:02x}").repeat(32)});
        let args = json!({"proposal":proposal});
        // serde_json's default ordered map emits the same explicitly canonical ASCII keys as the Node codec.
        let tx = Transaction::V0(TransactionV0 {
            signer_id: signer.clone(),
            public_key,
            nonce,
            receiver_id: receiver.clone(),
            block_hash,
            actions: vec![near_api::types::Action::FunctionCall(Box::new(
                FunctionCallAction {
                    method_name: "submit_purchase".into(),
                    args: serde_json::to_vec(&args)?,
                    gas: NearGas::from_gas(gas),
                    deposit: NearToken::from_yoctonear(0),
                },
            ))],
        });
        if index == 0 {
            first_transaction = Some(tx.clone());
        }
        let transaction_hash = tx.get_hash().to_string();
        let wire: near_openapi_types::SignedTransaction =
            SignedTransaction::new(placeholder.clone(), tx).into();
        expected.push(json!({"transaction_hash":transaction_hash, "invalid_placeholder_wire_base64":wire.to_string()}));
        inputs.push(json!({"network":"testnet","signer_id":signer,"public_key":public_key.to_string(),"nonce":nonce.to_string(),
            "receiver_id":receiver,"block_hash":block_hash.to_string(),"method":"submit_purchase","args":args,"gas":gas.to_string(),"attached_deposit":"0"}));
    }
    let input_bytes = serde_json::to_vec(&inputs)?;
    assert!(input_bytes.len() <= 32768);
    let mut child = Command::new(node)
        .arg("scripts/near/codec-parity.ts")
        .current_dir(root)
        .env_remove("RUNLATCH_AGENT_PRIVATE_KEY")
        .env_remove("AI_PROVIDER_API_KEY")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let output = tokio::time::timeout(Duration::from_secs(30), async {
        let mut stdin = child.stdin.take().ok_or("Missing test stdin")?;
        stdin.write_all(&input_bytes).await?;
        stdin.shutdown().await?;
        drop(stdin);
        Ok::<_, Box<dyn std::error::Error>>(child.wait_with_output().await?)
    })
    .await??;
    assert!(
        output.status.success(),
        "Offline Node codec bridge failed; no external action occurred"
    );
    assert!(output.stdout.len() <= 65536);
    assert!(output.stderr.is_empty());
    let result: Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(
        result["source"],
        "LOCAL_CODEC_PARITY_WITH_EPHEMERAL_SIGNATURE"
    );
    assert_eq!(result["public_execution"], false);
    assert_eq!(result["results"], json!(expected));
    let mut first = first_transaction.ok_or("Missing test transaction")?;
    let public_key: PublicKey = result["ephemeral"]["public_key"]
        .as_str()
        .ok_or("Missing public test key")?
        .parse()?;
    match &mut first {
        Transaction::V0(tx) => tx.public_key = public_key,
        Transaction::V1(_) => return Err("Unexpected test V1".into()),
    }
    let sig_bytes: Vec<u8> =
        serde_json::from_value(result["ephemeral"]["signature_bytes"].clone())?;
    let signature = Signature::from_parts(near_api::types::crypto::KeyType::ED25519, &sig_bytes)?;
    assert!(signature.verify(first.get_hash(), public_key));
    let mut altered = sig_bytes;
    altered[0] ^= 1;
    assert!(
        !Signature::from_parts(near_api::types::crypto::KeyType::ED25519, &altered)?
            .verify(first.get_hash(), public_key)
    );
    assert_eq!(
        result["ephemeral"]["transaction_hash"],
        first.get_hash().to_string()
    );
    let wire: near_openapi_types::SignedTransaction =
        SignedTransaction::new(signature, first).into();
    assert_eq!(result["ephemeral"]["signed_wire_base64"], wire.to_string());
    println!(
        "24 V0 byte/hash/layout cases and one Node ephemeral Ed25519 signature verified by Rust; no network execution"
    );
    Ok(())
}
