#!/bin/sh
# Actual isolated LOCAL NEAR Sandbox; no public RPC or real credentials.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export PATH="$HOME/.cargo/bin:/usr/bin:/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/runlatch-sandbox-target"
export CARGO_BUILD_JOBS=2
cd "$root"
if [ "${1:-all}" = all ] || [ "${1:-all}" = workflow ] || [ "${1:-all}" = agency ]; then
    if command -v node >/dev/null 2>&1; then
        export RUNLATCH_NODE_EXECUTABLE=$(command -v node)
    elif command -v node.exe >/dev/null 2>&1; then
        export RUNLATCH_NODE_EXECUTABLE=$(command -v node.exe)
    else
        echo 'Workflow checks require Node24.20+; do not bypass a blocked executable' >&2
        exit 1
    fi
fi
if [ ! -f .local/validation/sandbox-reports.json ]; then
    echo 'Run npm run prepare:sandbox-reports (Windows: npm.cmd) before outcome/Sandbox checks' >&2
    exit 1
fi
if [ ! -f scripts/sandbox/Cargo.lock ]; then
    cargo generate-lockfile --manifest-path scripts/sandbox/Cargo.toml
fi
cargo run --locked --manifest-path scripts/sandbox/Cargo.toml -- "${1:-all}"
cargo clippy --locked --all-targets --manifest-path scripts/sandbox/Cargo.toml -- -D warnings
cargo fmt --manifest-path scripts/sandbox/Cargo.toml -- --check
