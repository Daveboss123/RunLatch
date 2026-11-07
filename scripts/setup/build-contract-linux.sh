#!/bin/sh
# Official compiler/protocol checks and wasm-opt remain enabled.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export PATH="$HOME/.cargo/bin:/usr/bin:/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/runlatch-wasm-target"
export CARGO_BUILD_JOBS=2
tool="$HOME/.local/share/runlatch/tools/cargo-near-0.22.0/cargo-near-x86_64-unknown-linux-gnu/cargo-near"
# Keep compiler artifact copy/permissions on the native Linux filesystem.
artifacts="$HOME/.cache/runlatch-artifacts"
cd "$root"
case "${1:-production}" in
    production)
        "$tool" near build non-reproducible-wasm --locked --no-abi \
            --manifest-path contracts/runlatch/Cargo.toml --out-dir "$artifacts/production" --color never
        sha256sum "$artifacts/production/runlatch_contract.wasm"
        ;;
    callback-fault)
        echo 'LOCAL CALLBACK GAS FAULT BUILD: never deploy publicly'
        "$tool" near build non-reproducible-wasm --locked --no-abi --features sandbox-callback-starvation \
            --manifest-path contracts/runlatch/Cargo.toml --out-dir "$artifacts/callback-fault" --color never
        sha256sum "$artifacts/callback-fault/runlatch_contract.wasm"
        ;;
    *) echo 'Expected production or callback-fault build mode' >&2; exit 1 ;;
esac
