//! Offline parity only. Node uses generated in-memory keys; no WinCred, public RPC or Sandbox.
use near_api::types::{
    CryptoHash, NearToken, Signature,
    json::U64,
    transaction::{
        SignedTransaction, Transaction, TransactionV0,
        actions::{
            AccessKey, AccessKeyPermission, AddKeyAction, CreateAccountAction, TransferAction,
        },
    },
};
use near_api::{AccountId, PublicKey};
use serde_json::{Value, json};
use std::{path::PathBuf, process::Stdio, str::FromStr, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

fn transaction(input: &Value) -> Result<Transaction, Box<dyn std::error::Error>> {
    let field = |name: &str| input[name].as_str().ok_or("Missing public field");
    Ok(Transaction::V0(TransactionV0 {
        signer_id: field("signer_id")?.parse()?,
        public_key: field("public_key")?.parse()?,
        nonce: field("nonce")?.parse()?,
        receiver_id: field("receiver_id")?.parse()?,
        block_hash: field("block_hash")?.parse()?,
        actions: vec![
            near_api::types::Action::CreateAccount(CreateAccountAction {}),
            near_api::types::Action::Transfer(TransferAction {
                deposit: NearToken::from_yoctonear(field("amount")?.parse()?),
            }),
            near_api::types::Action::AddKey(Box::new(AddKeyAction {
                public_key: field("child_public_key")?.parse()?,
                access_key: AccessKey {
                    nonce: U64(0),
                    permission: AccessKeyPermission::FullAccess,
                },
            })),
        ],
    }))
}

#[tokio::test]
async fn fixed_children_match_rust_bytes_hashes_and_signatures()
-> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let node = std::env::var("RUNLATCH_NODE_EXECUTABLE")?;
    let signer: AccountId = "runlatch-demo-1108.testnet".parse()?;
    let placeholder = Signature::from_str(&format!("ed25519:{}", "1".repeat(64)))?;
    let mut inputs = Vec::new();
    let mut expected = Vec::new();
    for index in 0..12_u8 {
        let child = ["gate", "db", "agent"][usize::from(index % 3)];
        let amount = [
            "4500000000000000000000000",
            "300000000000000000000000",
            "100000000000000000000000",
        ][usize::from(index % 3)];
        let key = PublicKey::ED25519(near_api::types::crypto::public_key::ED25519PublicKey(
            [index; 32],
        ));
        let child_key = PublicKey::ED25519(near_api::types::crypto::public_key::ED25519PublicKey(
            [index + 1; 32],
        ));
        let nonce = [1_u64, 101, 9_007_199_254_740_993, u64::MAX][usize::from(index / 3)];
        let input = json!({"network":"testnet","signer_id":signer,"public_key":key.to_string(),"nonce":nonce.to_string(),
            "receiver_id":format!("{child}.{signer}"),"block_hash":CryptoHash([index;32]).to_string(),
            "child_public_key":child_key.to_string(),"amount":amount});
        let tx = transaction(&input)?;
        let hash = tx.get_hash().to_string();
        let wire: near_openapi_types::SignedTransaction =
            SignedTransaction::new(placeholder.clone(), tx).into();
        expected.push(
            json!({"transaction_hash":hash,"invalid_placeholder_wire_base64":wire.to_string()}),
        );
        inputs.push(input);
    }
    let mut child = Command::new(node)
        .arg("scripts/setup/child-codec-parity.ts")
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
    assert!(output.stdout.len() <= 32768);
    let result: Value = serde_json::from_slice(&output.stdout)?;
    assert_eq!(result["public_execution"], false);
    assert_eq!(result["results"], json!(expected));
    for signed in result["ephemeral"].as_array().ok_or("Missing signatures")? {
        let tx = transaction(&signed["transaction"])?;
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
        let wire: near_openapi_types::SignedTransaction =
            SignedTransaction::new(signature, tx).into();
        assert_eq!(signed["signed_wire_base64"], wire.to_string());
    }
    println!(
        "12 fixed child V0 vectors and three ephemeral signatures verified; no network/store access"
    );
    Ok(())
}
