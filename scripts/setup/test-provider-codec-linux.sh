#!/bin/sh
# Locked offline parity only, no Sandbox/public execution or human credential.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export PATH="$HOME/.cargo/bin:/usr/bin:/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/runlatch-sandbox-target"
export CARGO_BUILD_JOBS=2
if command -v node >/dev/null 2>&1; then
    export RUNLATCH_NODE_EXECUTABLE=$(command -v node)
else
    export RUNLATCH_NODE_EXECUTABLE=$(command -v node.exe)
fi
cd "$root"
cargo test --locked --offline --manifest-path scripts/sandbox/Cargo.toml --test demo_operation_codec --test provider_codec --test project_codec --test deployment_codec --test child_account_codec --test transaction_codec -- --nocapture
cargo clippy --locked --offline --all-targets --manifest-path scripts/sandbox/Cargo.toml -- -D warnings
cargo fmt --manifest-path scripts/sandbox/Cargo.toml -- --check
