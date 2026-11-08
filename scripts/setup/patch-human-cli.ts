/** Reproducible, hash-bound patches for the PRIVATE human-operated upstream CLI tool.
 * Not a signer/runner. Never loads keys, config or network. Original sources must match the pinned release.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
function between(s: string, from: string, to: string, replacement: string) {
  const a = s.indexOf(from), b = s.indexOf(to, a + from.length);
  if (a < 0 || b < 0 || s.indexOf(from, a + 1) >= 0 || s.indexOf(to, b + 1) >= 0) throw Error("HUMAN_CLI_PATCH_ANCHOR_MISMATCH");
  return s.slice(0, a) + replacement + s.slice(b);
}
function once(s: string, old: string, replacement: string) {
  if (!s.includes(old) || s.indexOf(old) !== s.lastIndexOf(old)) throw Error("HUMAN_CLI_PATCH_ANCHOR_MISMATCH");
  return s.replace(old, replacement);
}
const profile = `    pub fn get_config_toml() -> color_eyre::eyre::Result<Self> {
        // RunLatch PRIVATE tool: no implicit global config, migrations or fallback.
        let path = std::env::var_os("RUNLATCH_HUMAN_CLI_CONFIG")
            .ok_or_else(|| color_eyre::eyre::eyre!("HUMAN_CLI_EXPLICIT_PROFILE_REQUIRED"))?;
        let text = std::fs::read_to_string(path)
            .map_err(|_| color_eyre::eyre::eyre!("HUMAN_CLI_PROFILE_UNAVAILABLE"))?;
        if text.len() > 16384 {
            return Err(color_eyre::eyre::eyre!("HUMAN_CLI_PROFILE_SIZE_LIMIT"));
        }
        let config: Self = toml::from_str(&text)
            .map_err(|_| color_eyre::eyre::eyre!("HUMAN_CLI_PROFILE_INVALID"))?;
        let network = config.network_connection.get("testnet")
            .ok_or_else(|| color_eyre::eyre::eyre!("HUMAN_CLI_TESTNET_PROFILE_REQUIRED"))?;
        if config.network_connection.len() != 1 || network.network_name != "testnet"
            || !matches!(network.rpc_url.as_str(), "https://rpc.testnet.near.org/" | "https://test.rpc.fastnear.com/")
            || network.wallet_url.as_str() != "https://testnet.mynearwallet.com/"
            || network.explorer_transaction_url.as_str() != "https://explorer.testnet.near.org/transactions/"
            || network.rpc_api_key.is_some() || network.meta_transaction_relayer_url.is_some()
            || network.linkdrop_account_id.is_some() || network.near_social_db_contract_account_id.is_some()
            || network.faucet_url.is_some() || network.fastnear_url.is_some()
            || network.staking_pools_factory_account_id.is_some() || network.coingecko_url.is_some()
            || network.mpc_contract_account_id.is_some() || network.nearblocks_url.is_some()
            || network.tx_wait_until.is_some()
        {
            return Err(color_eyre::eyre::eyre!("HUMAN_CLI_TESTNET_PROFILE_REQUIRED"));
        }
        let legacy = &config.credentials_home_dir;
        let meta = std::fs::symlink_metadata(legacy)
            .map_err(|_| color_eyre::eyre::eyre!("HUMAN_CLI_EMPTY_LEGACY_DIRECTORY_REQUIRED"))?;
        if !legacy.is_absolute() || !meta.is_dir() || meta.file_type().is_symlink()
            || std::fs::read_dir(legacy)
                .map_err(|_| color_eyre::eyre::eyre!("HUMAN_CLI_EMPTY_LEGACY_DIRECTORY_REQUIRED"))?.next().is_some()
        {
            return Err(color_eyre::eyre::eyre!("HUMAN_CLI_EMPTY_LEGACY_DIRECTORY_REQUIRED"));
        }
        Ok(config)
    }

`;
const secureKey = `        // RunLatch PRIVATE tool: exact offline ordinary Ed25519 key, no legacy/online fallback.
        if !previous_context.global_context.offline || scope.nonce_index.is_some()
            || scope.meta_transaction_valid_for.is_some() || previous_context.sign_as_delegate_action
        {
            return Err(color_eyre::eyre::eyre!("HUMAN_CLI_EXACT_OFFLINE_SIGNING_REQUIRED"));
        }
        let signer_public_key = scope.signer_public_key.as_ref()
            .ok_or_else(|| color_eyre::eyre::eyre!("HUMAN_CLI_EXACT_PUBLIC_KEY_REQUIRED"))?;
        let keychain_key_id = signer_public_key.to_string();
        if !keychain_key_id.starts_with("ed25519:") {
            return Err(color_eyre::eyre::eyre!("HUMAN_CLI_EXACT_PUBLIC_KEY_REQUIRED"));
        }
        let password = keyring::Entry::new(&service_name,
            &format!("{}:{}", previous_context.prepopulated_transaction.signer_id, keychain_key_id))
            .and_then(|entry| entry.get_password())
            .map_err(|_| color_eyre::eyre::eyre!("HUMAN_CLI_SECURE_KEY_UNAVAILABLE"))?;

`;
export const HUMAN_CLI_SOURCE_PATCHES = [
  { path: "src/main.rs", original: "12dd6324de6fad8ef27e261ba87ba161d2d3d3c441b0b164d6e7b6c43fd416ce",
    apply(source: string) {
      source = between(source, "    if !crate::common::is_used_account_list_exist", "    let cli_cmd =", "");
      source = once(source, "\n            crate::common::save_cli_command(&cli_cmd_str);", "\n            // RunLatch PRIVATE tool: no automatic command history.");
      source = once(source, "\n                crate::common::save_cli_command(&cli_cmd_str);", "\n                // RunLatch PRIVATE tool: no automatic command history.");
      return source;
    } },
  { path: "src/config/mod.rs", original: "c958f51ad7882010a7b3a132dbf7ef44aa89af9a13144c879abcbbe9cc31d051",
    apply(source: string) { return between(source, "    pub fn get_config_toml()", "    pub fn write_config_toml", profile); } },
  { path: "src/transaction_signature_options/sign_with_keychain/mod.rs", original: "81e4922860bc64ca15c2465714ac6ff4642a2e5306d0561cd94e676969810f8d",
    apply(source: string) {
      source = once(source, "use color_eyre::eyre::{ContextCompat, WrapErr};", "use color_eyre::eyre::ContextCompat;");
      source = once(source, "use crate::common::JsonRpcClientExt;\nuse crate::common::RpcQueryResponseExt;\n", "");
      source = between(source, "        // A `--nonce-index` means", "        let account_json:", secureKey);
      source = once(source, '            serde_json::from_str(&password).wrap_err("Error reading data")?;',
        `            serde_json::from_str(&password)
                .map_err(|_| color_eyre::eyre::eyre!("HUMAN_CLI_SECURE_KEY_RECORD_INVALID"))?;
        if account_json.public_key.to_string() != keychain_key_id {
            return Err(color_eyre::eyre::eyre!("HUMAN_CLI_SECURE_KEY_BINDING_MISMATCH"));
        }`);
      return between(source, '#[tracing::instrument(name = "Warning:", skip_all)]', "impl From<SignKeychainContext> for super::SubmitContext", "");
    } },
] as const;

async function main() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const upstream = resolve(root, ".tools/human-cli-0.31.1/near-cli-rs-0.31.1");
  const prepared = [];
  // Preflight ALL original source files before any write; no uncertain partial source is adopted.
  for (const patch of HUMAN_CLI_SOURCE_PATCHES) {
    const path = resolve(upstream, patch.path), bytes = await readFile(path);
    if (sha(bytes) !== patch.original) throw Error("HUMAN_CLI_PINNED_SOURCE_MISMATCH");
    prepared.push({ path, source: patch.apply(bytes.toString("utf8")), original: patch.original, name: patch.path });
  }
  for (const item of prepared) {
    const temp = `${item.path}.runlatch-patched`;
    await writeFile(temp, item.source, { flag: "wx" });
    if (sha(await readFile(item.path)) !== item.original) throw Error("HUMAN_CLI_SOURCE_CHANGED_DURING_PREPARATION");
    await rename(temp, item.path);
    console.log(JSON.stringify({ path: item.name, original_sha256: item.original, patched_sha256: sha(item.source) }));
  }
  console.log("Prepared private CLI sources only. Build with --no-default-features; no credentials/config read or signer executed.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
