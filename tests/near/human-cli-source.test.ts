/** Synthetic source transformations only. Never invokes CLI, OS credential store or a signer. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { HUMAN_CLI_SOURCE_PATCHES } from "../../scripts/setup/patch-human-cli.ts";

test("private tool patch targets exactly three pinned files, not Cargo/contract/global credential files", () => {
  assert.deepEqual(HUMAN_CLI_SOURCE_PATCHES.map(p => p.path), ["src/main.rs", "src/config/mod.rs", "src/transaction_signature_options/sign_with_keychain/mod.rs"]);
  for (const p of HUMAN_CLI_SOURCE_PATCHES) assert.match(p.original, /^[0-9a-f]{64}$/u);
});

test("main patch removes automatic history and legacy index scanning without touching transaction state", () => {
  const source = `prefix\n    if !crate::common::is_used_account_list_exist(&config.credentials_home_dir) { scan(); }
    if !other() { scan(); }
    let cli_cmd = match input {
            crate::common::save_cli_command(&cli_cmd_str);
                crate::common::save_cli_command(&cli_cmd_str);
    }\n`;
  const result = HUMAN_CLI_SOURCE_PATCHES[0].apply(source);
  assert.ok(!result.includes("save_cli_command")); assert.ok(!result.includes("credentials_home_dir"));
  assert.ok(result.includes("let cli_cmd = match input"));
});

test("profile patch requires selected testnet-only config and empty legacy directory; no malformed/global default fallback", () => {
  const result = HUMAN_CLI_SOURCE_PATCHES[1].apply("before\n    pub fn get_config_toml() { old_default_config(); }\n    pub fn write_config_toml { after }");
  for (const code of ["HUMAN_CLI_EXPLICIT_PROFILE_REQUIRED", "HUMAN_CLI_PROFILE_INVALID", "HUMAN_CLI_TESTNET_PROFILE_REQUIRED", "HUMAN_CLI_EMPTY_LEGACY_DIRECTORY_REQUIRED"]) assert.ok(result.includes(code));
  assert.ok(result.includes("config.network_connection.len() != 1")); assert.ok(result.includes("network.rpc_api_key.is_some()"));
  assert.ok(!result.includes("get_config_dir")); assert.ok(!result.includes("old_default_config"));
  assert.ok(result.endsWith("    pub fn write_config_toml { after }"));
});

test("secure-key patch refuses online/gas/meta signing, mismatched mapping and legacy fallback; no error includes password", () => {
  const source = `use color_eyre::eyre::{ContextCompat, WrapErr};
use crate::common::JsonRpcClientExt;
use crate::common::RpcQueryResponseExt;
before
        // A \`--nonce-index\` means fallback to file
        let account_json: AccountKeyPair =
            serde_json::from_str(&password).wrap_err("Error reading data")?;
after
#[tracing::instrument(name = "Warning:", skip_all)]
fn warning_message() { from_legacy_keychain(); }
impl From<SignKeychainContext> for super::SubmitContext { remainder }
`;
  const result = HUMAN_CLI_SOURCE_PATCHES[2].apply(source);
  for (const code of ["HUMAN_CLI_EXACT_OFFLINE_SIGNING_REQUIRED", "HUMAN_CLI_EXACT_PUBLIC_KEY_REQUIRED", "HUMAN_CLI_SECURE_KEY_UNAVAILABLE", "HUMAN_CLI_SECURE_KEY_RECORD_INVALID", "HUMAN_CLI_SECURE_KEY_BINDING_MISMATCH"]) assert.ok(result.includes(code));
  assert.ok(!result.includes("from_legacy_keychain")); assert.ok(!result.includes("warning_message"));
  assert.ok(result.includes("account_json.public_key.to_string() != keychain_key_id"));
  assert.ok(!result.includes("{password}")); assert.ok(result.includes("remainder"));
});

test("changed/missing/repeated source anchors fail closed, never attempt an approximate patch", () => {
  for (const p of HUMAN_CLI_SOURCE_PATCHES) assert.throws(() => p.apply("changed source"), /PATCH_ANCHOR_MISMATCH/u);
  const duplicate = "    pub fn get_config_toml() {}    pub fn get_config_toml() {}    pub fn write_config_toml {}";
  assert.throws(() => HUMAN_CLI_SOURCE_PATCHES[1].apply(duplicate), /PATCH_ANCHOR_MISMATCH/u);
});

test("setup patcher preflights all source hashes, uses exclusive temporary files and never reads a real environment key", async () => {
  const source = await readFile(new URL("../../scripts/setup/patch-human-cli.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("// Preflight ALL") < source.indexOf("await writeFile(temp"));
  assert.ok(source.includes('flag: "wx"')); assert.ok(source.includes("HUMAN_CLI_SOURCE_CHANGED_DURING_PREPARATION"));
  assert.ok(!source.includes("process.env")); assert.ok(!source.includes("fetch(")); assert.ok(!source.includes("execFile"));
});
