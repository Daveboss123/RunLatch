#!/bin/sh
# Offline Rust/Node wire parity only; does not start Sandbox or access public RPC.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export PATH="$HOME/.cargo/bin:/usr/bin:/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/runlatch-sandbox-target"
export CARGO_BUILD_JOBS=2
if command -v node >/dev/null 2>&1; then
    export RUNLATCH_NODE_EXECUTABLE=$(command -v node)
elif command -v node.exe >/dev/null 2>&1; then
    export RUNLATCH_NODE_EXECUTABLE=$(command -v node.exe)
else
    echo 'Offline codec parity requires Node24.20+; do not bypass a blocked executable' >&2
    exit 1
fi
cd "$root"
cargo test --locked --offline --manifest-path scripts/sandbox/Cargo.toml --test transaction_codec -- --nocapture
cargo clippy --locked --offline --all-targets --manifest-path scripts/sandbox/Cargo.toml -- -D warnings
cargo fmt --manifest-path scripts/sandbox/Cargo.toml -- --check
