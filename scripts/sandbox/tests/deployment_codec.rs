//! Offline actual-default-WASM encoding parity; no Sandbox/public requests/real credentials.
use near_api::types::{
    CryptoHash, NearGas, NearToken, Signature,
    transaction::{
        SignedTransaction, Transaction, TransactionV0,
        actions::{DeployContractAction, FunctionCallAction},
    },
};
use near_api::{AccountId, PublicKey};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, str::FromStr, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

fn transaction(input: &Value, code: &[u8]) -> Result<Transaction, Box<dyn std::error::Error>> {
    let field = |name: &str| input[name].as_str().ok_or("Missing public field");
    Ok(Transaction::V0(TransactionV0 {
        signer_id: field("signer_id")?.parse()?,
        public_key: field("public_key")?.parse()?,
        nonce: field("nonce")?.parse()?,
        receiver_id: field("receiver_id")?.parse()?,
        block_hash: field("block_hash")?.parse()?,
        actions: vec![
            near_api::types::Action::DeployContract(DeployContractAction {
                code: code.to_vec(),
            }),
            near_api::types::Action::FunctionCall(Box::new(FunctionCallAction {
                method_name: "init".into(),
                args: field("init_args")?.as_bytes().to_vec(),
                gas: NearGas::from_gas(field("gas")?.parse()?),
                deposit: NearToken::from_yoctonear(0),
            })),
        ],
    }))
}
#[tokio::test]
async fn pinned_self_deployment_matches_rust_bytes_hashes_and_signature()
-> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let home = std::env::var("HOME")?;
    let code = std::fs::read(
        PathBuf::from(home).join(".cache/runlatch-artifacts/production/runlatch_contract.wasm"),
    )?;
    assert_eq!(code.len(), 415910);
    let node = std::env::var("RUNLATCH_NODE_EXECUTABLE")?;
    let signer: AccountId = "gate.runlatch-demo-1108.testnet".parse()?;
    let placeholder = Signature::from_str(&format!("ed25519:{}", "1".repeat(64)))?;
    let mut inputs = Vec::new();
    let mut expected = Vec::new();
    for (index, nonce) in [1_u64, 101, 9_007_199_254_740_993, u64::MAX]
        .into_iter()
        .enumerate()
    {
        let key = PublicKey::ED25519(near_api::types::crypto::public_key::ED25519PublicKey(
            [u8::try_from(index)?; 32],
        ));
        let input = json!({"network":"testnet","signer_id":signer,"receiver_id":signer,"public_key":key.to_string(),
            "nonce":nonce.to_string(),"block_hash":CryptoHash([0;32]).to_string(),"code_bytes":415910,
            "code_sha256":"d0397fc992cb8f0624076c59314dbe1339461f38ea4c66980dd3d39720c57964",
            "init_args":"{\"operator_id\":\"runlatch-demo-1108.testnet\"}","gas":"100000000000000","deposit":"0"});
        let tx = transaction(&input, &code)?;
        let hash = tx.get_hash().to_string();
        let wire: near_openapi_types::SignedTransaction =
            SignedTransaction::new(placeholder.clone(), tx).into();
        expected.push(
            json!({"transaction_hash":hash,"invalid_placeholder_wire_base64":wire.to_string()}),
        );
        inputs.push(input);
    }
    let mut child = Command::new(node)
        .arg("scripts/setup/deployment-codec-parity.ts")
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
    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    assert!(output.stdout.len() <= 4_194_304);
    let result: Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(result["public_execution"], false);
    assert_eq!(result["results"], json!(expected));
    let signed = &result["ephemeral"];
    let tx = transaction(&signed["transaction"], &code)?;
    let public_key: PublicKey = signed["transaction"]["public_key"]
        .as_str()
        .ok_or("Missing key")?
        .parse()?;
    let bytes: Vec<u8> = serde_json::from_value(signed["signature_bytes"].clone())?;
    let signature = Signature::from_parts(near_api::types::crypto::KeyType::ED25519, &bytes)?;
    assert!(signature.verify(tx.get_hash(), public_key));
    let mut corrupt = bytes;
    corrupt[0] ^= 1;
    assert!(
        !Signature::from_parts(near_api::types::crypto::KeyType::ED25519, &corrupt)?
            .verify(tx.get_hash(), public_key)
    );
    assert_eq!(signed["transaction_hash"], tx.get_hash().to_string());
    let wire: near_openapi_types::SignedTransaction = SignedTransaction::new(signature, tx).into();
    assert_eq!(signed["signed_wire_base64"], wire.to_string());
    println!(
        "4 pinned-default deployment V0 wire/hash vectors +1 ephemeral signature verified; no network/store access"
    );
    Ok(())
}
