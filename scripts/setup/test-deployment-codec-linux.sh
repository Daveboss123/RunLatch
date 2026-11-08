#!/bin/sh
# Offline only. Reuses locked tools/default build; no Sandbox startup or public signature.
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
cargo test --locked --offline --manifest-path scripts/sandbox/Cargo.toml --test deployment_codec --test child_account_codec --test transaction_codec -- --nocapture
cargo clippy --locked --offline --all-targets --manifest-path scripts/sandbox/Cargo.toml -- -D warnings
cargo fmt --manifest-path scripts/sandbox/Cargo.toml -- --check
